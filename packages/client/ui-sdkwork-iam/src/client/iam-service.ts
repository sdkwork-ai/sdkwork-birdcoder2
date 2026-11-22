/**
 * The `ctx.iam` service: owns the sdkwork auth controller over the runtime
 * adapter, mirrors the `ui-sdkwork-iam` settings scope, and dispatches the sign-in
 * presentation (modal vs full-page account mode). Cross-plugin consumers use
 * this face; the settings-menu account seam is bound by account-source.ts.
 */

import {
  createSdkworkIamRuntimeAuthController,
  scheduleSdkworkAuthSessionRefresh,
  type SdkworkAuthAppContext,
  type SdkworkAuthController,
  type SdkworkAuthRuntimeConfig,
} from '@sdkwork/auth-pc-react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.env (the shared deployment environment) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import {
  DEFAULT_IAM_AUTHORIZE_BASE_URL, DEFAULT_IAM_BASE_URL, DEFAULT_IAM_CLIENT_ID, DEFAULT_IAM_REDIRECT_URI,
  readOemIamAuthorizeBaseUrl, readOemIamBaseUrl, readOemIamClientId, readOemIamRedirectUri,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { isSdkworkDesktopAuthError, type SdkworkDesktopAuthSession } from '@sdkwork/iam-desktop-auth'
import { createIamDesktopLogin, readSdkworkDesktopBridge, readSdkworkDesktopIamSessionBridge, type IamDesktopLogin } from './iam-desktop.ts'
import { readServerFailureResponse, type IamServerFailureResponse } from './iam-server-failure.ts'
import { buildOauthLogoutUrl, buildOauthSignOutUrl } from './oauth-session.ts'
import { readDesktopSignInPage, type DesktopSignInPage } from './desktop-sign-in-page.ts'
import {
  DEFAULT_UI_IAM_SETTINGS,
  type UiIamSettings,
  type UiIamSignInMethod,
} from '../iam-settings.ts'
import { createIamAuthRuntime, type IamAuthRuntime } from './iam-runtime.ts'
import type { IamPersonaCatalog, IamUserPersona, IamUserPersonaUpdateCommand } from '@sdkwork/iam-app-sdk'
import { createIamTokenStore, type IamStoredSession, type IamTokenStore } from './iam-token-store.ts'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '../sdkwork-global-token-manager.ts'
import {
  isPersistableStoredSession,
  toRestoredAuthSession,
  type IamPersistedSession,
} from './iam-session-persistence.ts'
import { clearEmbeddedSdkworkCredentials } from './iam-embedded-credentials.ts'
import type { AuthenticatedModeGate } from './authenticated-mode.ts'
import {
  SdkworkSignInRequiredError,
  type SdkworkSignInRequirement,
} from './sign-in-requirement.ts'

/** The localStorage key owning the durable IAM session blob. */
const IAM_SESSION_STORAGE_KEY = 'dsh.iam.session'
/** Stable per-install identity that scopes the desktop session. */
const IAM_DEVICE_ID_STORAGE_KEY = 'dsh.iam.deviceId'
/** Page global the Desktop welcome uses to request the IAM browser login. */
const IAM_SIGN_IN_GLOBAL = '__DSH_IAM_SIGN_IN__'
/**
 * Deadline of a pending desktop browser login.
 *
 * The IAM authorization state expires five minutes after the hosted page created
 * it (`AUTHORIZATION_CODE_TTL_SECONDS` in `sdkwork-iam-web-adapter`), and the
 * redeem requires it unexpired, so a longer wait can only end in a rejected
 * code. Staying under that window (with slack for the browser being opened and
 * the hand-off travelling back) reports a late callback as an expired login
 * instead of a failed redeem of a login that was still waiting.
 */
const IAM_DESKTOP_LOGIN_WINDOW_MS = 270_000
/**
 * Budget for the post-exchange account read. The login itself has already
 * succeeded at that point, so a slow account endpoint degrades the cached
 * identity instead of holding the hand-off card open.
 */
const IAM_PROFILE_READ_BUDGET_MS = 5_000
/**
 * How long the welcome hand-off waits for the IAM settings namespace.
 *
 * The request runs at apply time, when the scope still reports `loading`; the
 * `signInMethod` it carries decides between the browser hand-off and the in-app
 * form, and the defaults would otherwise pick the browser gesture for a
 * deployment configured for the other one. The bound keeps a slow or broken
 * settings document from blocking a login the welcome page already handed over.
 */
const IAM_SETTINGS_SETTLE_TIMEOUT_MS = 2_000

/**
 * Read or create the stable opaque device identity used for desktop logins.
 *
 * The identity is per install, not per login: redeeming a new code on the
 * same install replaces that install's previous session, while a second
 * install keeps its session. Storage failures fall back to no identity, which
 * preserves the previous "one session per application" behavior.
 * @returns the stored device id, or undefined when storage is unavailable.
 */
function readOrCreateIamDeviceId(): string | undefined {
  try {
    const storage = globalThis.localStorage
    if (storage === undefined) return undefined
    const existing = storage.getItem(IAM_DEVICE_ID_STORAGE_KEY)?.trim()
    if (existing !== undefined && existing !== '') return existing
    const generated = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
    storage.setItem(IAM_DEVICE_ID_STORAGE_KEY, generated)
    return generated
  } catch {
    return undefined
  }
}

/**
 * Resolve the IAM app-api origin the generated client dispatches against.
 *
 * A deployment that leaves the shipped origin alone keeps the active
 * `ui-sdkwork-env` profile in control, so source checkouts still reach their
 * own tier. An OEM profile naming a different origin is authoritative in
 * every tier: the PC login paths and parameters do not change with it.
 *
 * @param configured - the active ui-sdkwork-env profile origin.
 * @param oemBaseUrl - the OEM projection origin, when the page carries one.
 * @returns the origin to dispatch the IAM client against.
 */
export function resolveIamBaseUrl(configured: string, oemBaseUrl: string | undefined): string {
  return oemBaseUrl === undefined || oemBaseUrl === DEFAULT_IAM_BASE_URL ? configured : oemBaseUrl
}

/** Which browser-login step failed, so the hand-off card can name it. */
export interface IamBrowserLoginFailure {
  /** Stable code of the desktop auth runtime (`provider-denied`, `exchange-failed`, ...). */
  code: string
  /** Human-readable reason the runtime reported; the hosted page's description when it sent one. */
  message?: string
  /** Transport or provider detail that accompanies the code (for example the OAuth `error` value). */
  detail?: string
  /** What the IAM server answered for the failed step, when the app saw that response itself. */
  response?: IamServerFailureResponse
}

/**
 * One transient confirmation the sign-in host shows while its dialog is closed.
 *
 * A browser login can finish after the user dismissed the card (or while the
 * app was in the background): the deep link still commits the session, and
 * this notice is how that success reaches the user without reopening a modal
 * they deliberately closed.
 */
export interface IamSignInNotice {
  /** Monotonic identity, so a repeated notice restarts the toast instead of reusing it. */
  id: number
  /** What the notice confirms. */
  kind: 'signed-in'
  /** Name, e-mail, or username the committed session reported, when known. */
  accountName?: string
}

/** First non-empty string among the named keys of one identity record. */
function identityText(source: Record<string, unknown> | null | undefined, ...keys: string[]): string | undefined {
  if (source === null || source === undefined) return undefined
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

/**
 * Map the desktop exchange identity and the account profile into the durable
 * session user shape.
 *
 * The profile is authoritative and the exchange payload is the fallback: the
 * account endpoint carries the name, e-mail, and split name a surface renders,
 * while the exchange may only report the bare id. Rendering initials from the
 * same pair of names keeps the header and the account page agreeing.
 * @param exchange - identity the session exchange returned, when it carried one.
 * @param profile - identity the account endpoint returned, when it answered.
 * @returns the merged identity, or undefined when neither source named the account.
 */
function desktopSessionUser(
  exchange: Record<string, unknown> | null | undefined,
  profile: Record<string, unknown> | undefined,
): NonNullable<IamStoredSession['user']> | undefined {
  const pick = (...keys: string[]): string | undefined => identityText(profile, ...keys) ?? identityText(exchange, ...keys)
  const displayName = pick('displayName', 'name', 'nickname')
  const firstName = pick('firstName')
  const lastName = pick('lastName')
  const initials = pick('initials')
  const id = pick('id', 'userId')
  const username = pick('username')
  const email = pick('email')
  const nickname = pick('nickname')
  const user: NonNullable<IamStoredSession['user']> = {
    ...id === undefined ? {} : { id },
    ...email === undefined ? {} : { email },
    ...username === undefined ? {} : { username },
    ...displayName === undefined ? {} : { displayName },
    ...nickname === undefined ? {} : { nickname },
    ...firstName === undefined ? {} : { firstName },
    ...lastName === undefined ? {} : { lastName },
    ...initials === undefined ? {} : { initials },
  }
  // An empty record would reach the controller as a blank signed-in name; the
  // session itself is what states the login, the identity is only a cache.
  return Object.keys(user).length === 0 ? undefined : user
}

/**
 * Identity triple (`tenant|organization|user`) one session belongs to.
 *
 * A session switch compares the session the page already holds with one a
 * browser-login callback just redeemed. Both carry the same IAM context fields,
 * but the callback payload is declared by the desktop auth package while the
 * controller session is the auth runtime's own shape, so the reader narrows
 * structurally instead of trusting either declaration.
 * @param session - controller session or redeemed desktop session.
 * @returns the identity, or undefined when the session names no identity field.
 */
function sessionIdentity(session: unknown): string | undefined {
  if (typeof session !== 'object' || session === null) return undefined
  const { context, user } = session as { context?: unknown; user?: unknown }
  const contextRecord = typeof context === 'object' && context !== null
    ? context as Record<string, unknown>
    : undefined
  const userRecord = typeof user === 'object' && user !== null
    ? user as Record<string, unknown>
    : undefined
  const tenantId = identityText(contextRecord, 'tenantId')
  const organizationId = identityText(contextRecord, 'organizationId')
  const userId = identityText(contextRecord, 'userId') ?? identityText(userRecord, 'id', 'userId')
  if (tenantId === undefined && organizationId === undefined && userId === undefined) return undefined
  return `${tenantId ?? ''}|${organizationId ?? ''}|${userId ?? ''}`
}

/**
 * Await one best-effort read within a budget. The login has already succeeded,
 * so a stalled account endpoint must not hold the completion.
 * @param read - the pending read.
 * @param budgetMs - longest wait before the value is reported as absent.
 * @returns the read value, or undefined when it did not answer in time.
 */
async function withinBudget<T>(read: Promise<T>, budgetMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      read,
      new Promise<undefined>((resolve) => { timer = setTimeout(() => { resolve(undefined) }, budgetMs) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Whether a failed read means the credential itself was refused.
 *
 * The transport throws typed SDK errors, but this page loads several SDK copies
 * and their classes are not always this module's classes; the status and code
 * pair is the stable contract every copy carries. A refusal means the login
 * failed, while a transport or timeout failure leaves the identity best-effort.
 * @param error - the rejected read.
 * @returns true for 401/403 responses and their token error codes.
 */
function isRejectedCredentialError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { httpStatus, code } = error as { httpStatus?: unknown; code?: unknown }
  if (httpStatus === 401 || httpStatus === 403) return true
  return code === 'UNAUTHORIZED' || code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN' || code === 'FORBIDDEN'
}

/** Project one desktop auth failure onto the card's stable code and diagnostics. */
function browserFailureOf(error: unknown): IamBrowserLoginFailure {
  const response = readServerFailureResponse(error)
  if (isSdkworkDesktopAuthError(error)) {
    // The runtime prefixes its message with the error name and code; the card
    // only needs the reason, and diagnostics keep the raw `detail`.
    const message = error.message.replace(/^\[SdkworkDesktopAuthError:[a-z-]+\]\s*/u, '')
    return {
      code: error.code,
      ...(message === '' ? {} : { message }),
      ...(error.detail === undefined ? {} : { detail: error.detail }),
      ...(response === undefined ? {} : { response }),
    }
  }
  const message = error instanceof Error ? error.message : undefined
  return {
    code: 'unexpected',
    ...(message === undefined ? {} : { message }),
    ...(response === undefined ? {} : { response }),
  }
}

/**
 * Whether a callback outcome leaves the login possible rather than failing it.
 *
 * A callback with no pending flow belongs to an older attempt (or arrives
 * twice), and a state mismatch means a foreign or stale link the controller
 * deliberately refuses to consume — the real callback can still complete the
 * pending flow, so neither one is this attempt's failure.
 * @param error - the rejected deep-link dispatch.
 * @returns true when the attempt should stay as it is.
 */
function isIgnorableCallbackFailure(error: unknown): boolean {
  if (!isSdkworkDesktopAuthError(error)) return false
  return error.code === 'no-pending-flow' || error.code === 'state-mismatch'
}

/** The modal open/close actions, bound by the overlay registration. */
export interface IamModalActions {
  /** Show the product login entry: brand, welcome line, and the sign-in / API-key choice. */
  openEntry: () => void
  /** Show the account method form directly, for a caller that already showed the entry. */
  openLogin: () => void
  /** Show the browser hand-off card while the hosted login page waits. */
  openBrowser: () => void
  /** Close the modal. */
  close: () => void
}

/**
 * The sign-out confirmation actions, bound by that dialog's overlay
 * registration. The service asks for confirmation; the dialog owns how the
 * question is painted.
 */
export interface IamSignOutConfirmActions {
  /** Show the confirmation dialog. */
  open: () => void
  /** Dismiss it without signing out. */
  close: () => void
}

/**
 * The signed-in account's profile facts the 个人主页 settings section renders.
 *
 * One snapshot object so the section reads a single stable value per change
 * (the uSES contract) instead of several coupled getters that can disagree
 * mid-render.
 */
export interface IamProfileSnapshot {
  /** Whether the IAM controller currently holds a session. */
  signedIn: boolean
  /** Display name the account profile reported. */
  displayName: string
  /** E-mail the account profile reported. */
  email: string
  /** Account username, when the profile carried one. */
  username: string
  /** Stable account id, when the profile carried one. */
  accountId: string
  /** Organization the session was issued for; absent for a personal session. */
  organizationId: string | undefined
  /** Tenant the session was issued for, when the session reports one. */
  tenantId: string | undefined
  /** Whether the session runs as a personal account or inside an enterprise organization. */
  accountKind: 'personal' | 'enterprise'
  /** SDKWork tenant application id of the active environment. */
  appId: string
  /** Active deployment environment id. */
  environment: string
  /** CloudRouter console origin used by "go to the management center", when configured. */
  managementCenterUrl: string | undefined
  /** Whether a signed-in session can be ended. */
  signOutAvailable: boolean
  /** Hosted session-end URL the system browser opens: OAuth logout or the sign-out page. */
  signOutUrl: string
}

/**
 * One outstanding sign-in requirement shared by every backend call waiting on
 * it: the promise every caller awaits and the resolver that settles them all
 * at once.
 */
interface PendingSignIn {
  promise: Promise<boolean>
  settle: (signedIn: boolean) => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The IAM service face (auth controller, settings mirror, presentation dispatch). */
    iam: IamService
  }
}

/**
 * IAM service: controller + settings mirror + sign-in presentation dispatch.
 * The controller is created once; its runtime adapter is (re)built lazily
 * from the shared ui-sdkwork-env profile so an environment switch takes effect
 * without reload.
 */
export class IamService implements AuthenticatedModeGate, SdkworkSignInRequirement {
  /** The sdkwork auth controller shared with the sign-in surfaces. */
  readonly controller: SdkworkAuthController
  private readonly scope: ConfigForm<UiIamSettings>
  private readonly env: EnvService
  private readonly layout: ILayout
  private modal: IamModalActions | undefined
  private runtime: IamAuthRuntime | undefined
  private runtimeBaseUrl: string | undefined
  private readonly tokenStore: IamTokenStore
  private readonly tokenManager: AuthTokenManager
  /** Last session the durable store reported; it, not the controller, holds current credentials. */
  private observedTokens: IamStoredSession | undefined
  private pendingSignIn: PendingSignIn | undefined
  private signOutConfirm: IamSignOutConfirmActions | undefined
  private profileSnapshotCache: { key: string; snapshot: IamProfileSnapshot } | undefined
  private desktopLogin: IamDesktopLogin | undefined
  private desktopLoginKey: string | undefined
  private desktopFailed = false
  private desktopFailure: IamBrowserLoginFailure | undefined
  /** The server's report for the redeem of the attempt that is now failing, if any. */
  private desktopServerFailure: IamServerFailureResponse | undefined
  /** Whether the sign-in dialog is on screen, so a late callback knows how to answer. */
  private surfaceOpen = false
  private noticeSeq = 0
  /** The transient confirmation the sign-in host shows while the dialog is closed. */
  private notice: IamSignInNotice | undefined
  private readonly desktopListeners = new Set<() => void>()
  private readonly authTokenListeners = new Set<() => void>()

  constructor(scope: ConfigForm<UiIamSettings>, env: EnvService, layout: ILayout) {
    this.scope = scope
    this.env = env
    this.layout = layout
    this.tokenManager = getSdkworkGlobalTokenManager()
    this.tokenStore = createIamTokenStore({
      storageKey: IAM_SESSION_STORAGE_KEY,
      host: readSdkworkDesktopIamSessionBridge(),
      // Every read, write, and clear reports the authoritative credentials;
      // this is the one place a rotated token reaches the shared transport.
      onTokens: (session) => { this.observeSessionTokens(session) },
    })
    this.controller = createSdkworkIamRuntimeAuthController({
      getRuntime: () => this.readRuntime(),
    })
    this.publishTokens()
    this.controller.subscribe(() => {
      this.publishTokens()
      // A finished login releases every backend call that was held at the door.
      if (this.isSignedIn()) this.settlePendingSignIn()
    })
    void this.seedCredentialsFromStorage()
  }

  /**
   * The current settings snapshot (schema defaults until the scope resolves).
   * @returns the current settings snapshot.
   */
  currentSettings(): UiIamSettings {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) {
      return snapshot.value
    }
    return DEFAULT_UI_IAM_SETTINGS
  }

  /**
   * Whether sign-in is available (the active environment carries a base URL).
   * @returns whether sign-in is available.
   */
  isConfigured(): boolean {
    const oemBaseUrl = readOemIamBaseUrl()
    if (oemBaseUrl !== undefined && oemBaseUrl !== DEFAULT_IAM_BASE_URL) return true
    return this.env.isConfigured()
  }

  /**
   * Whether this page can start the desktop browser-login flow (the desktop
   * shell's `sdkworkDesktop` preload bridge is present).
   * @returns true when the deep-link bridge exists.
   */
  browserSignInAvailable(): boolean {
    return readSdkworkDesktopBridge() !== undefined
  }

  /**
   * Whether a desktop browser login is waiting for its deep-link callback.
   * @returns true while the hosted page has not returned yet.
   */
  browserSignInWaiting(): boolean {
    return this.desktopLogin?.isWaiting() ?? false
  }

  /**
   * The hosted authorize URL of the waiting browser login.
   *
   * The hand-off card offers it as a manual fallback: a system browser that
   * reported success but showed no window (or opened on another desktop) leaves
   * the user with a waiting flow and no visible page. The URL carries the PKCE
   * challenge and state, never the verifier, so handing it to the clipboard adds
   * no secret; it disappears as soon as the attempt settles, because a spent or
   * expired state must not be offered for reopening.
   * @returns the absolute authorize URL, or undefined when no attempt is waiting.
   */
  browserSignInUrl(): string | undefined {
    return this.desktopLogin?.authorizeUrl()
  }

  /**
   * Whether the last browser-login attempt failed.
   * @returns true after a begin or callback failure, until the next attempt.
   */
  browserSignInFailed(): boolean {
    return this.desktopFailed
  }

  /**
   * Why the last browser-login attempt failed.
   * @returns the failing step's code and detail, or undefined when the last
   * attempt succeeded, is still waiting, or never ran.
   */
  browserSignInFailure(): IamBrowserLoginFailure | undefined {
    return this.desktopFailure
  }

  /**
   * Observe desktop browser-login state.
   * @param listener - change listener.
   * @returns the disposer removing the listener.
   */
  subscribeBrowserSignIn(listener: () => void): () => void {
    this.desktopListeners.add(listener)
    return () => { this.desktopListeners.delete(listener) }
  }

  /**
   * Start the desktop browser-login flow: open the hosted IAM authorization
   * page in the system browser; the deep link returns the code, which the
   * SDK exchanges for a dual-token session.
   * @returns once the browser has been opened.
   */
  async beginBrowserSignIn(): Promise<void> {
    const login = this.ensureDesktopLogin()
    if (login === undefined) throw new Error('ui-sdkwork-iam: desktop browser login is unavailable')
    this.desktopFailed = false
    this.desktopFailure = undefined
    this.desktopServerFailure = undefined
    try {
      await login.begin()
    } catch (error) {
      this.reportBrowserFailure(error)
      throw error
    }
    this.notifyDesktop()
  }

  /** Abandon a waiting desktop browser login. */
  cancelBrowserSignIn(): void {
    void this.desktopLogin?.cancel()
    this.notifyDesktop()
  }

  /**
   * Whether the IAM controller currently holds a signed-in session.
   * @returns whether a signed-in session is held.
   */
  isSignedIn(): boolean {
    return this.controller.getState().isAuthenticated
  }

  /**
   * The hosted session-end URL for this session's realm.
   *
   * The desktop shell signs in as an OAuth public client — the system browser
   * opens `<iamAuthorizeBaseUrl>/iam/oauth/authorize` — so its sign-out is that
   * client's OAuth logout, on the same origin and scoped by the same client id.
   * A page-local session (the in-app account form of a plain browser page) has
   * no OAuth client binding and hands the browser to the hosted sign-out page on
   * that origin instead. Either way the URL names the login origin, so the
   * browser reaches a domain the user signed in on.
   * @returns the absolute session-end URL.
   */
  signOutUrl(): string {
    const origin = this.hostedAuthOrigin()
    return readSdkworkDesktopBridge() === undefined
      ? buildOauthSignOutUrl(origin)
      : buildOauthLogoutUrl(origin, this.oauthClientId())
  }

  /**
   * The origin serving the hosted SDKWork auth pages: the one the login opens.
   * @returns the OEM-projected hosted-auth origin, or the shipped default.
   */
  private hostedAuthOrigin(): string {
    return readOemIamAuthorizeBaseUrl() ?? DEFAULT_IAM_AUTHORIZE_BASE_URL
  }

  /**
   * The OAuth public-client id this application signs in as.
   *
   * The login presents it to the hosted authorization and the logout scopes
   * itself by it, so both read the one value the OEM profile supplies.
   * @returns the OEM-projected client id, or the shipped default.
   */
  private oauthClientId(): string {
    return readOemIamClientId() ?? DEFAULT_IAM_CLIENT_ID
  }

  /**
   * The sign-out gesture: ask for confirmation before ending anything.
   *
   * Both the settings popover's footer row and the 个人主页 section route
   * through here, so one confirmation dialog covers every entry point. Only a
   * signed-in session can be ended; an anonymous page has nothing to confirm.
   */
  requestSignOut(): void {
    if (!this.isSignedIn()) return
    if (this.signOutConfirm === undefined) {
      // The dialog is not mounted yet (its registration binds after this
      // service); ending the session without a confirmation is worse than the
      // late-bound path, so the gesture waits for the surface. The next click
      // finds it.
      return
    }
    this.signOutConfirm.open()
  }

  /** Dismiss the sign-out confirmation without ending the session. */
  dismissSignOut(): void {
    this.signOutConfirm?.close()
  }

  /**
   * Confirm the sign-out.
   *
   * The system browser first receives the hosted sign-out page, which ends the
   * shared account session (the same session every SDKWork surface uses);
   * then this page clears its own copy. The order matters in a plain browser:
   * opening a tab outside the click handler is blocked.
   */
  confirmSignOut(): void {
    this.signOutConfirm?.close()
    void this.performSignOut()
  }

  /**
   * Open a URL in the system browser under the desktop shell, or in a new tab
   * in a plain browser page. Used by the sign-out flow and by the account
   * surfaces' "management center" links.
   * @param url - the absolute URL to open.
   */
  openExternalUrl(url: string): void {
    const bridge = readSdkworkDesktopBridge()
    if (bridge !== undefined) {
      void bridge.shellOpen.open(url).catch((error: unknown) => {
        console.error('ui-sdkwork-iam: could not open the system browser', error)
      })
      return
    }
    // A plain browser page has no shell bridge; a new tab is the equivalent
    // act. Popup blockers accept it only while the gesture is still live.
    if (typeof globalThis.open === 'function') globalThis.open(url, '_blank', 'noopener,noreferrer')
  }

  /**
   * Adopt the confirmation dialog's actions (its overlay registration's bound
   * store). A launch that happens before the registration leaves the gesture
   * inert instead of signing the user out without a question.
   * @param actions - the dialog controls the overlay registration bound.
   */
  attachSignOutConfirm(actions: IamSignOutConfirmActions): void {
    this.signOutConfirm = actions
  }

  /**
   * The signed-in profile snapshot the settings 个人主页 section renders.
   *
   * Snapshot identity is stable until a fact moves: the controller state object
   * and the relevant environment facts form the cache key, and the same object
   * is returned while they hold.
   * @returns the current profile snapshot.
   */
  profileSnapshot(): IamProfileSnapshot {
    const state = this.controller.getState()
    const environment = this.env.currentEnvironment()
    const appId = this.env.appId()
    const cloudRouterUrl = this.env.cloudRouterUrl()
    const authOrigin = this.hostedAuthOrigin()
    const user = state.user
    const context = state.session?.context as SdkworkAuthAppContext | undefined
    const organizationId = context?.organizationId ?? undefined
    const key = [
      environment, appId, cloudRouterUrl, authOrigin,
      state.isAuthenticated ? '1' : '0',
      user?.id ?? '', user?.displayName ?? '', user?.email ?? '', user?.username ?? '',
      organizationId ?? '', context?.tenantId ?? '',
    ].join('\u0000')
    if (this.profileSnapshotCache?.key === key) return this.profileSnapshotCache.snapshot
    // `organizationId` is '0' for a personal session in the IAM login context
    // (an enterprise login always names a real organization), so it reads as
    // personal rather than as a nameless enterprise.
    const enterprise = organizationId !== undefined && organizationId !== '' && organizationId !== '0'
    const snapshot: IamProfileSnapshot = {
      signedIn: state.isAuthenticated,
      displayName: user?.displayName ?? '',
      email: user?.email ?? '',
      username: user?.username ?? '',
      accountId: user?.id ?? '',
      organizationId: enterprise ? organizationId : undefined,
      tenantId: context?.tenantId,
      accountKind: enterprise ? 'enterprise' : 'personal',
      appId,
      environment,
      managementCenterUrl: cloudRouterUrl === '' ? undefined : cloudRouterUrl,
      signOutAvailable: state.isAuthenticated,
      signOutUrl: this.signOutUrl(),
    }
    this.profileSnapshotCache = { key, snapshot }
    return snapshot
  }

  /**
   * End the session: hand the hosted page to the system browser, then clear
   * this page's own session.
   *
   * The local clear is unconditional — a browser that refused to open, or a
   * deployment whose hosted page could not answer, must still end the session
   * here — while the remote revoke inside the controller is best-effort.
   */
  private async performSignOut(): Promise<void> {
    this.openExternalUrl(this.signOutUrl())
    try {
      await this.controller.signOut()
    } catch {
      // `signOut()` resets the controller to its anonymous state in its own
      // `finally` path, so a rejected remote revoke still signs out locally.
    } finally {
      // The embedded SDKWork packages keep their own plaintext token copies;
      // ending the session must remove them too, or the next account in this
      // profile (or a reopened page) could still dispatch with the previous
      // one's credentials.
      clearEmbeddedSdkworkCredentials()
      await this.reportDesktopSignOut()
    }
  }

  /**
   * Tell a desktop shell the workspace ended its session on the user's
   * confirmation, so it can return to its signed-out entry. A browser page has
   * no such shell; a failure only costs that return, never the sign-out.
   */
  private async reportDesktopSignOut(): Promise<void> {
    try {
      await readDesktopSignInPage()?.signedOut?.()
    } catch (error) {
      console.error('ui-sdkwork-iam: could not report the sign-out to the desktop shell', error)
    }
  }

  /**
   * The active environment's IAM tenant application id.
   * @returns the active environment's IAM tenant application id.
   */
  appId(): string {
    return this.env.appId()
  }

  /**
   * Read the signed-in account's persona (role, followed interests, and whether
   * the first-run prompt was answered).
   *
   * The account is the authority: a stored selection follows the user across
   * devices, while the local settings section only caches it for offline
   * rendering. Requires a session; the transport rejects an anonymous call.
   * @returns the stored persona, with `role: null` before the first choice.
   */
  retrievePersona(): Promise<IamUserPersona> {
    return this.readRuntime().client.iam.users.current.persona.retrieve()
  }

  /**
   * Replace the signed-in account's persona.
   * @param command - the complete persona; omitted interests mean none.
   * @returns the stored persona as the account now holds it.
   */
  updatePersona(command: IamUserPersonaUpdateCommand): Promise<IamUserPersona> {
    return this.readRuntime().client.iam.users.current.persona.update(command)
  }

  /**
   * Read the selectable persona taxonomy: the roles and interest directions the
   * account accepts, with their per-locale labels.
   *
   * The picker narrows its own list onto these ids, so disabling a role or
   * direction server-side removes it without a client release. Requires a
   * session; the transport rejects an anonymous call.
   * @returns the account persona catalog.
   */
  retrievePersonaCatalog(): Promise<IamPersonaCatalog> {
    return this.readRuntime().client.iam.personaCatalog.retrieve()
  }

  /**
   * The auth-surface runtime config derived from the live settings.
   * @returns the auth-surface runtime config.
   */
  authRuntimeConfig(): SdkworkAuthRuntimeConfig {
    const settings = this.currentSettings()
    return {
      leftRailMode: 'highlights-only',
      // The in-app surface is this product's sign-in entry, so it offers the
      // account methods the IAM tenant serves: password, phone code, and email
      // code. QR is its own toggle because the scan panel needs the tenant's
      // scan-login modes.
      loginMethods: ['password', 'phoneCode', 'emailCode'],
      oauthLoginEnabled: settings.oauthLoginEnabled,
      oauthProviders: [],
      qrLoginEnabled: settings.qrLoginEnabled,
      registerMethods: ['email', 'phone'],
      recoveryMethods: ['email', 'phone'],
    }
  }

  /**
   * The signed-in login token the BirdCoder relay accepts as its API key.
   *
   * Same authority {@link publishTokens} hands the shared transport: the last
   * session the durable store reported, falling back to the controller's
   * session before the first report.
   * @returns the current `authToken`, or undefined while signed out.
   */
  authToken(): string | undefined {
    return (this.observedTokens ?? this.controller.getState().session)?.authToken
  }

  /**
   * The signed-in session's complete credential triple.
   *
   * Cross-plugin SDKWork clients that authenticate with both transport halves
   * (for example an app-access-token exchange over `dual-token`) need the
   * access token as well as the auth token. Same authority as
   * {@link authToken}: the last session the durable store reported, falling
   * back to the controller's session before the first report.
   * @returns the current access, auth, and refresh tokens; empty while signed out.
   */
  sessionTokens(): { accessToken?: string; authToken?: string; refreshToken?: string } {
    const session = this.observedTokens ?? this.controller.getState().session
    if (session === undefined || session === null) return {}
    return {
      ...(session.accessToken ? { accessToken: session.accessToken } : {}),
      ...(session.authToken ? { authToken: session.authToken } : {}),
      ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    }
  }

  /**
   * Observe the credentials themselves rather than the rendered state: a
   * rotated token does not necessarily re-render a surface, while a credential
   * mirror has to follow it. Listeners fire from {@link publishTokens}, so they
   * see every store report, controller change, and environment move.
   * @param listener - the credential-change listener.
   * @returns the disposer removing this listener.
   */
  onAuthToken(listener: () => void): () => void {
    this.authTokenListeners.add(listener)
    return () => { this.authTokenListeners.delete(listener) }
  }

  /**
   * Observe controller and settings changes (components re-read on either).
   * @param listener - the change listener.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void {
    const offController = this.controller.subscribe(listener)
    const offScope = this.scope.subscribe(listener)
    const offDesktop = this.subscribeBrowserSignIn(listener)
    const offEnv = this.env.subscribe(() => {
      this.publishTokens()
      listener()
    })
    return () => {
      offController()
      offScope()
      offDesktop()
      offEnv()
    }
  }

  /**
   * The settings-menu sign-in gesture: the product login entry, modal or
   * full-page per the setting. Unconfigured the chosen surface still opens —
   * the modal host and the account page both render the configuration notice
   * instead of the auth surface, so the gesture never silently no-ops.
   */
  openSignIn(): void {
    if (this.isSignedIn()) return
    if (this.currentSettings().presentation === 'page') {
      this.layout.setMode('account')
      return
    }
    this.openSignInOverlay()
  }

  /**
   * Open the modal sign-in surface at its entry step: the product login page,
   * the same welcome surface the desktop window shows. Its own gesture raises
   * the account methods, so no caller lands straight on a method form without
   * having offered the product's login page first. Settings-menu presentation
   * (`page` vs `modal`) does not apply: a gated mode page stays on screen
   * behind the overlay so login returns to the module the user opened.
   */
  openSignInOverlay(): void {
    if (this.isSignedIn()) return
    const modal = this.modal
    if (modal === undefined) return
    modal.openEntry()
    this.surfaceOpen = true
  }

  /**
   * Raise the account method form directly. Only a caller whose own surface
   * already showed the product login page uses this — the desktop welcome
   * window and its API-key page — so the entry is never shown twice in a row.
   *
   * Choosing this form abandons a waiting browser attempt: the user has picked
   * the in-app path, and a browser page that completes later must not be able
   * to flip the surface back open.
   */
  openSignInMethods(): void {
    if (this.isSignedIn()) return
    if (this.browserSignInWaiting()) this.cancelBrowserSignIn()
    const modal = this.modal
    if (modal === undefined) return
    modal.openLogin()
    this.surfaceOpen = true
  }

  /**
   * Whether the login panel's Sign in gesture hands the flow to the system
   * browser, leaving the in-app account form as the alternate path.
   * @returns true when the configured gesture is the browser hand-off and this page carries the desktop bridge.
   */
  usesBrowserHandoff(): boolean {
    return this.currentSettings().signInMethod === 'browser' && this.browserSignInAvailable()
  }

  /**
   * The login panel's Sign in gesture, dispatched by the `signInMethod`
   * setting: `browser` (the default) hands the flow to the system browser and
   * returns through the desktop deep link; `modal` raises the in-app account
   * methods. The browser gesture needs the tenant application's OAuth
   * relying-party registration — the app manifest declares it — so a
   * deployment whose tenant has not applied it sets `modal`, or reaches the
   * same in-app form from the entry's quiet in-app login link. A page without
   * the desktop bridge can never receive the deep link, so it always uses the
   * in-app form.
   */
  startSignIn(): void {
    if (this.isSignedIn()) return
    if (this.usesBrowserHandoff()) {
      this.startBrowserSignIn()
      return
    }
    this.openSignInMethods()
  }

  /**
   * Show the browser hand-off card and open the hosted login page in the
   * system browser. Calling it again replaces the waiting attempt, which is
   * also the card's retry gesture.
   */
  startBrowserSignIn(): void {
    if (this.isSignedIn()) return
    this.desktopFailed = false
    this.desktopFailure = undefined
    this.desktopServerFailure = undefined
    const modal = this.modal
    if (modal !== undefined) {
      modal.openBrowser()
      this.surfaceOpen = true
    }
    this.notifyDesktop()
    void this.beginBrowserSignIn().catch(() => {
      // `beginBrowserSignIn` already flagged the failure, which the hand-off
      // card renders with its retry and in-app fallback.
    })
  }

  /** @returns the configured login gesture: the system browser or the in-app form. */
  signInMethod(): UiIamSignInMethod {
    return this.currentSettings().signInMethod
  }

  /**
   * The entry panel's API-key gesture: open the shell's sign-in page, whose key
   * form writes the credential. A login gesture there raises the account
   * methods, a saved key closes the panel, and a dismissed page leaves it
   * where it was. A plain browser page owns no such page, so the entry omits
   * the action.
   * @returns whether the shell exposed a key page to open.
   */
  async openApiKeyPage(): Promise<boolean> {
    const page = readDesktopSignInPage()
    if (page === undefined) return false
    const outcome = await page.open()
    if (outcome === 'login') this.startSignIn()
    else if (outcome === 'credential') this.dismissSignIn()
    return true
  }

  /**
   * Close the modal sign-in surface. Delegates to {@link dismissSignIn} on
   * purpose: closing the overlay without settling would strand any backend
   * call waiting on it, so both gestures share one path.
   */
  closeModal(): void {
    this.dismissSignIn()
  }

  /**
   * Demand a session for a backend call. Resolves at once when a session is
   * already present; otherwise the overlay opens and every concurrent caller
   * shares that one surface and its single answer.
   * @returns true once signed in, false when the user dismissed the overlay.
   */
  requestSignIn(): Promise<boolean> {
    if (this.isSignedIn()) return Promise.resolve(true)
    if (this.pendingSignIn) return this.pendingSignIn.promise
    const promise = this.beginPendingSignIn()
    // The desktop shell's welcome page is this product's sign-in entry; its
    // login gesture raises the in-app IAM surface. A plain browser page opens
    // that surface directly.
    const page = readDesktopSignInPage()
    if (page !== undefined) {
      void this.signInThroughWelcomePage(page)
      return promise
    }
    this.openSignInOverlay()
    return promise
  }

  /**
   * Demand a session from the surface the caller already owns.
   *
   * {@link requestSignIn} prefers the desktop welcome page, which is the
   * product's launch entry and takes the screen away from a running workspace.
   * A caller that must keep its own surface — a commerce dialog the user is
   * paying in, for example — raises the in-app overlay instead and holds the
   * call until that overlay reports a session or the user closes it.
   * @returns true once signed in, false when the user dismissed the overlay.
   */
  requestSignInInPlace(): Promise<boolean> {
    if (this.isSignedIn()) return Promise.resolve(true)
    if (this.pendingSignIn) return this.pendingSignIn.promise
    const promise = this.beginPendingSignIn()
    this.openSignInOverlay()
    return promise
  }

  /**
   * Hold a backend call until a session exists, raising the in-app overlay in
   * place instead of the desktop welcome page.
   * @returns a promise resolving once signed in, rejecting with
   * {@link SdkworkSignInRequiredError} when the user declined instead.
   */
  async requireSignedInInPlace(): Promise<void> {
    if (await this.requestSignInInPlace()) return
    throw new SdkworkSignInRequiredError()
  }

  /**
   * Create the shared pending-sign-in promise every caller waits on. The
   * executor runs synchronously, so `settle` is assigned before the promise can
   * be awaited by anyone.
   * @returns the promise settled by {@link settlePendingSignIn}.
   */
  private beginPendingSignIn(): Promise<boolean> {
    let settle!: (signedIn: boolean) => void
    const promise = new Promise<boolean>((resolve) => { settle = resolve })
    this.pendingSignIn = { promise, settle }
    return promise
  }

  /**
   * Drive one demand for a session through the desktop welcome page. `'login'`
   * runs the configured login gesture — the in-app form by default, or
   * the browser hand-off when the deployment configures it; the
   * controller subscription in {@link constructor} settles the demand once the
   * session exists. `'credential'` and `'dismissed'` answer without a session.
   * @param page - the desktop welcome page bridge.
   */
  private async signInThroughWelcomePage(page: DesktopSignInPage): Promise<void> {
    let outcome: Awaited<ReturnType<DesktopSignInPage['open']>>
    try {
      outcome = await page.open()
    } catch {
      outcome = 'dismissed'
    }
    if (outcome !== 'login') {
      this.settlePendingSignIn()
      return
    }
    this.startSignIn()
  }

  /**
   * Hold a backend call until a session exists.
   * @returns a promise resolving once signed in, rejecting with
   * {@link SdkworkSignInRequiredError} when the user declined instead.
   */
  async requireSignedIn(): Promise<void> {
    if (await this.requestSignIn()) return
    throw new SdkworkSignInRequiredError()
  }

  /**
   * The overlay's own close gesture (auth completed or dismissed). Signing in
   * wins over dismissing: the settle below re-reads the controller, so an
   * auth completion that lands in the same tick as the close still releases
   * the calls held at the door.
   *
   * Closing the browser hand-off card only hides it: the system browser may
   * still be signing in, and the deep link that follows commits the session.
   * That outcome must reach the user — a success notice, or the failure card
   * raised again — instead of being swallowed because the dialog was gone.
   */
  dismissSignIn(): void {
    this.modal?.close()
    this.surfaceOpen = false
    this.settlePendingSignIn()
  }

  /**
   * Adopt the modal's actions once its host has mounted.
   *
   * The store's bound actions exist only after the overlay entry renders, so a
   * launch request or a callback outcome recorded before that point has no
   * surface to open. The service only presents through this face, and the host
   * calls it on mount; the login gesture itself does not depend on it (the
   * browser hand-off runs without the card), so a mount that happens after the
   * gesture started raises the card for the attempt already in flight, and a
   * cold-start callback failure is replayed here: the user who just tried to
   * sign in sees the reason and the recovery actions instead of an anonymous
   * workspace.
   * @param actions - the modal controls the overlay registration bound.
   */
  attachModal(actions: IamModalActions): void {
    this.modal = actions
    this.surfaceOpen = false
    if (this.desktopFailed || this.browserSignInWaiting()) {
      actions.openBrowser()
      this.surfaceOpen = true
    }
  }

  /**
   * Release everything this service owns: the desktop login flow (its
   * deep-link listener and flow timer) and the change listeners. A reloaded
   * plugin must not leave a second listener answering the same callback.
   */
  dispose(): void {
    this.desktopLogin?.dispose()
    this.desktopLogin = undefined
    this.desktopLoginKey = undefined
    this.desktopServerFailure = undefined
    this.notice = undefined
    this.pendingSignIn = undefined
    this.desktopListeners.clear()
  }

  /**
   * Restore a stored session; no-op while the IAM base URL is unconfigured.
   *
   * The sdkwork auth runtime validates storage through
   * `sessions.current.retrieve` and clears localStorage on any failure. A
   * snapshot taken before validation is written back when validation leaves
   * the controller anonymous so restarts survive transient network faults.
   */
  async bootstrap(): Promise<void> {
    if (!this.isConfigured()) return
    const backup = await this.readPersistableSession()
    if (backup) this.applyPersistedSession(backup)
    await this.controller.bootstrap()
    if (!this.controller.getState().isAuthenticated && backup) {
      await this.restoreBackupSession(backup)
    }
    // A cold-start deep link arrives before the user interacts; process it once
    // the session has settled so the callback can redeem its code. The pending
    // PKCE flow is durable (renderer storage), so a browser login finished
    // after the app exited still completes when the deep link relaunches it.
    // A loopback attempt outlives a renderer reload the same way: the shell's
    // listener keeps waiting, so this page adopts it before taking a callback
    // the shell accepted while no page could hear the event.
    const desktop = this.ensureDesktopLogin()
    if (desktop !== undefined) {
      if (this.isSignedIn()) {
        // A restored session has no pending flow to complete; a listener left
        // by a previous attempt can only hold its port and a stale flow.
        void this.desktopLogin?.cancel().catch(() => {})
        return
      }
      await desktop.resumePendingLoopback().catch(() => false)
      try {
        await desktop.completePendingCallbackFromLaunch()
      } catch (error) {
        // A callback with no pending flow belongs to an older attempt
        // (expired, already redeemed, or started by a build that kept the flow
        // in memory only), and a stale link must not fail the pending one.
        // Neither is a failed login: the user starts the browser login again
        // from the app.
        if (!isIgnorableCallbackFailure(error)) this.reportBrowserFailure(error)
      }
    }
  }

  /**
   * Release every backend call waiting on the current sign-in requirement.
   * The answer is read from the controller at settle time rather than from the
   * gesture that caused it, so a login always outranks a simultaneous dismiss.
   */
  private settlePendingSignIn(): void {
    const pending = this.pendingSignIn
    if (!pending) return
    this.pendingSignIn = undefined
    pending.settle(this.isSignedIn())
  }

  /**
   * Consume the welcome's one-shot sign-in request. The workspace owns the
   * sign-in surface: it runs the configured login gesture (the browser
   * hand-off by default, or the in-app account methods). An existing session
   * needs no surface at all.
   *
   * A browser hand-off does not wait for the modal host: the hosted page is the
   * login surface, so an overlay that has not rendered (or never renders) must
   * not block the login. The in-app account form has no surface of its own, so
   * that gesture still waits for the host and is presented by
   * {@link attachModal} at the mount. The gesture itself comes from the IAM
   * settings namespace, which may still be loading when this runs, so the choice
   * waits for it (bounded) instead of using the defaults.
   * @returns after the sign-in surface is raised or the request is consumed.
   */
  async startPendingSignIn(): Promise<void> {
    const host = globalThis as Record<string, unknown>
    if (host[IAM_SIGN_IN_GLOBAL] !== true) return
    if (this.isSignedIn()) {
      Reflect.deleteProperty(host, IAM_SIGN_IN_GLOBAL)
      return
    }
    if (!this.isConfigured() && !await this.whenConfigured()) return
    // The gesture comes from the IAM settings namespace. This request runs at
    // apply time, before the Host settings document necessarily arrives, and the
    // defaults would pick the browser hand-off for a deployment configured for
    // the in-app form (or the reverse). A settings document that never arrives
    // must not block the login, so the wait is bounded.
    await this.whenSettingsSettled()
    // The in-app form only exists inside the host; consuming the request without
    // it would silently drop the login the welcome page handed over.
    if (this.modal === undefined && !this.usesBrowserHandoff()) return
    // One shot: a later sign-out must not replay this launch request.
    Reflect.deleteProperty(host, IAM_SIGN_IN_GLOBAL)
    this.startSignIn()
  }

  /**
   * Wait until the IAM settings namespace resolved, or a short bound elapses.
   *
   * The scope reports `loading` until the first accepted Host section; reading
   * the sign-in method before that returns the defaults, which may be the wrong
   * gesture for this deployment. The bound keeps a broken or slow settings
   * document from holding the login the welcome page already handed over.
   * @returns after the scope left `loading`, or the bound elapsed.
   */
  private async whenSettingsSettled(): Promise<void> {
    const scope = this.scope
    if (scope.getSnapshot().status !== 'loading') return
    await new Promise<void>((resolve) => {
      let settled = false
      let off = (): void => {}
      const finish = (): void => {
        if (settled) return
        settled = true
        off()
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(finish, IAM_SETTINGS_SETTLE_TIMEOUT_MS)
      off = scope.subscribe(() => {
        if (scope.getSnapshot().status !== 'loading') finish()
      })
    })
  }

  /**
   * Wait until the environment scope reports a usable IAM origin. The welcome
   * hands off before the settings scope necessarily resolves; without this the
   * browser open would race the profile and silently do nothing.
   * @returns whether a configured environment arrived before the timeout.
   */
  private async whenConfigured(): Promise<boolean> {
    if (this.isConfigured()) return true
    return new Promise<boolean>((resolve) => {
      let settled = false
      let off = (): void => {}
      const timer = setTimeout(() => { finish(this.isConfigured()) }, 15_000)
      function finish(configured: boolean): void {
        if (settled) return
        settled = true
        off()
        clearTimeout(timer)
        resolve(configured)
      }
      off = this.env.subscribe(() => { if (this.isConfigured()) finish(true) })
    })
  }

  /** The lazily built runtime adapter for the active environment. */
  private readRuntime(): IamAuthRuntime {
    const baseUrl = resolveIamBaseUrl(this.env.apiBaseUrl(), readOemIamBaseUrl())
    if (baseUrl.trim() === '') {
      throw new Error('ui-sdkwork-iam: IAM baseUrl is not configured')
    }
    if (this.runtime === undefined || this.runtimeBaseUrl !== baseUrl) {
      this.runtimeBaseUrl = baseUrl
      // When baseUrl changes, re-seed the token manager so any access-token-only
      // pre-auth endpoints can dispatch under the new environment.
      this.publishTokens()
      this.runtime = createIamAuthRuntime({
        baseUrl,
        tokenStore: this.tokenStore,
        tokenManager: this.tokenManager,
      })
    }
    return this.runtime
  }

  /**
   * Lazily build or rebuild the desktop browser-login flow for the current
   * app-api origin, hosted authorization origin, OAuth client, and registered
   * deep-link callback.
   * @returns the flow, or undefined outside the desktop shell / while unconfigured.
   */
  private ensureDesktopLogin(): IamDesktopLogin | undefined {
    const bridge = readSdkworkDesktopBridge()
    if (bridge === undefined) return undefined
    const baseUrl = resolveIamBaseUrl(this.env.apiBaseUrl(), readOemIamBaseUrl())
    if (baseUrl === '') return undefined
    const authorizeBaseUrl = this.hostedAuthOrigin()
    const clientId = this.oauthClientId()
    const redirectUri = readOemIamRedirectUri() ?? DEFAULT_IAM_REDIRECT_URI
    const deviceId = readOrCreateIamDeviceId()
    const key = `${baseUrl}\u0000${authorizeBaseUrl}\u0000${clientId}\u0000${redirectUri}\u0000${deviceId ?? ''}`
    if (this.desktopLogin === undefined || this.desktopLoginKey !== key) {
      const previous = this.desktopLogin
      if (previous !== undefined) {
        // A changed identity (app-api origin, hosted origin, client, or
        // callback) makes the previous attempt's PKCE flow unanswerable: its
        // redirect and its redeem target no longer describe this page. Drop
        // the durable flow instead of leaving a callback from the old
        // authorization server redeemable against the new one (RFC 8252
        // section 8.10 keeps the redirect URI bound to its authorization
        // server; our one registered callback cannot express that, so the
        // attempt is abandoned instead).
        void previous.cancel().catch(() => {})
        previous.dispose()
      }
      const login = createIamDesktopLogin({
        clientId,
        redirectUri,
        authorizeBaseUrl,
        baseUrl,
        tokenManager: this.tokenManager,
        bridge,
        flowTtlMs: IAM_DESKTOP_LOGIN_WINDOW_MS,
        ...(deviceId === undefined ? {} : { deviceId }),
        onSession: session => this.commitDesktopSession(session),
        onServerFailure: (response) => { this.recordServerFailure(response) },
        onError: (error) => {
          // A callback the controller refused to consume (a stale or foreign
          // deep link) leaves the pending attempt intact. Flipping the card to
          // failed there would tell the user to restart a login that is still
          // running, and the retry would replace its still-valid PKCE flow.
          if (this.browserSignInWaiting() || this.isSignedIn() || isIgnorableCallbackFailure(error)) return
          this.reportBrowserFailure(error)
        },
      })
      login.subscribe(() => { this.notifyDesktop() })
      this.desktopLogin = login
      this.desktopLoginKey = key
    }
    return this.desktopLogin
  }

  /**
   * Persist a redeemed desktop session and make it the controller's session.
   *
   * The browser exchange commits outside the auth service, so this path owns
   * everything the in-app form's commit does: the durable copy, the shared
   * credential transport every SDK client reads, the cached account identity,
   * the controller state, and the pre-expiry refresh. The token write is the
   * gate — a rejected write leaves the application signed out — while the
   * account read only enriches the identity, because the login itself has
   * already succeeded by then.
   * @param session - the redeemed dual-token session from the deep-link exchange.
   */
  private async commitDesktopSession(session: SdkworkDesktopAuthSession): Promise<void> {
    if (!await this.prepareDesktopSessionReplacement(session)) return
    const exchangeUser = session.user ?? null
    const exchangeIdentity = desktopSessionUser(exchangeUser, undefined)
    const stored: IamPersistedSession = {
      accessToken: session.accessToken,
      authToken: session.authToken,
      ...(session.refreshToken === undefined ? {} : { refreshToken: session.refreshToken }),
      ...(session.sessionId === undefined ? {} : { sessionId: session.sessionId }),
      ...(session.context === undefined || session.context === null ? {} : { context: session.context }),
      ...(exchangeIdentity === undefined ? {} : { user: exchangeIdentity }),
    }
    await this.tokenStore.set(stored)
    // Resolve the runtime before publishing credentials: building it re-seeds
    // the shared manager from the controller, which has no session yet on a
    // first login and would otherwise wipe what the next lines publish.
    const runtime = this.readRuntime()
    // The store published the redeemed credentials when it wrote them, and this
    // manager is the one the IAM client shares, so the profile request below
    // already carries the new session.
    this.observeSessionTokens(stored)
    let profile: Record<string, unknown> | undefined
    try {
      profile = await this.readDesktopProfile(runtime)
    } catch (error) {
      // The redeemed credentials were refused by the account endpoint. Every
      // SDK client reads this same session, so committing it would report a
      // successful login whose every later call fails; discard it and name the
      // rejection instead.
      await this.discardRejectedDesktopSession(error)
      return
    }
    const user = desktopSessionUser(exchangeUser, profile)
    const complete: IamPersistedSession = {
      ...stored,
      ...(user === undefined ? {} : { user }),
    }
    if (profile !== undefined) {
      try {
        // The exchange identity already reached the store above; failing to
        // replace it with the fuller one must not report a failed login.
        await this.tokenStore.set(complete)
      } catch {
        // Keep the login and the cached partial identity.
      }
    }
    try {
      // The browser exchange commits outside the auth service, so schedule the
      // same pre-expiry refresh the service normally owns.
      scheduleSdkworkAuthSessionRefresh(runtime, complete)
    } catch {
      // Scheduling is best-effort; the next bootstrap schedules again.
    }
    this.applyPersistedSession(complete)
    this.publishTokens()
    this.desktopFailed = false
    this.desktopFailure = undefined
    this.desktopServerFailure = undefined
    // The browser login can finish after the card was closed (or while the app
    // was in the background): the committed session is the outcome, and a
    // notice confirms it without forcing a dialog the user dismissed.
    const accountName = user?.displayName ?? user?.email ?? user?.username
    this.noticeSeq += 1
    this.notice = {
      id: this.noticeSeq,
      kind: 'signed-in',
      ...(accountName === undefined ? {} : { accountName }),
    }
    this.notifyDesktop()
    this.dismissSignIn()
  }

  /**
   * Clear the page's current session when a browser login redeems a different
   * account.
   *
   * The commit writes the redeemed session into the durable store and the
   * controller. The store merges missing identity fields over the record it
   * replaces, so keeping the previous account's copy would make account B's
   * session carry account A's cached identity — and A's open surfaces would
   * keep rendering until the next remount. The clear has to happen before the
   * write: afterwards the previous record is gone either way.
   *
   * An identity that cannot be resolved on either side reads as "different":
   * the local session is cheap to rebuild, while silently keeping A's UI under
   * B's token is the defect this guard exists for.
   * @param session - the redeemed session about to be committed.
   * @returns whether the commit may proceed.
   */
  private async prepareDesktopSessionReplacement(session: SdkworkDesktopAuthSession): Promise<boolean> {
    if (!this.controller.getState().isAuthenticated) return true
    const currentIdentity = sessionIdentity(this.controller.getState().session)
    const nextIdentity = sessionIdentity(session)
    if (currentIdentity !== undefined && currentIdentity === nextIdentity) return true
    try {
      await this.clearLocalSessionForReplacement()
      return true
    } catch (error) {
      // The durable copy could not be removed, so writing the new session would
      // merge two accounts. Refuse the login and name the failure instead.
      this.reportReplacementFailure(error)
      return false
    }
  }

  /**
   * End the local session without a remote revoke: the identity is being
   * replaced, so the page drops the controller state, the durable copy, and the
   * embedded packages' plaintext credentials themselves.
   */
  private async clearLocalSessionForReplacement(): Promise<void> {
    // Reset the controller first: the stores and every SDKWork host adapter read
    // the page's signed-in state from it, so the previous account's surfaces
    // stop rendering even if the durable removal below fails.
    this.controller.handleSessionExpired()
    // Drop the store's last snapshot as well, so the shared transport cannot
    // keep dispatching with A's tokens while the durable removal is in flight.
    this.observedTokens = undefined
    this.publishTokens()
    try {
      await this.tokenStore.clear()
    } catch (error) {
      // The durable copy stayed behind, so the caller refuses the login; the
      // transport already carries no credentials.
      throw error
    }
    clearEmbeddedSdkworkCredentials()
  }

  /**
   * Report a login the identity guard refused because the local session could
   * not be cleared.
   * @param error - the failed local clear.
   */
  private reportReplacementFailure(error: unknown): void {
    const failure = browserFailureOf(error)
    this.desktopFailure = {
      code: 'session-switch-failed',
      ...(failure.message === undefined ? {} : { message: failure.message }),
      ...(failure.detail === undefined ? {} : { detail: failure.detail }),
    }
    this.desktopFailed = true
    console.error('ui-sdkwork-iam: cannot replace the signed-in session', this.desktopFailure)
    this.notifyDesktop()
  }

  /**
   * Read the signed-in account's profile for the durable identity.
   *
   * The in-app form hydrates its session the same way: the login payload names
   * the account, the profile completes it. The read is bounded and best-effort
   * so a slow account endpoint cannot hold a login that already succeeded. A
   * refusal is not slow, though: it rejects the session every SDK client would
   * use, so it propagates instead of degrading the identity.
   * @param runtime - the IAM runtime whose client carries the redeemed credentials.
   * @returns the profile identity, or undefined when it did not answer.
   */
  private async readDesktopProfile(runtime: IamAuthRuntime): Promise<Record<string, unknown> | undefined> {
    try {
      const value = await withinBudget(
        runtime.client.iam.users.current.retrieve() as Promise<unknown>,
        IAM_PROFILE_READ_BUDGET_MS,
      )
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
      return value as Record<string, unknown>
    } catch (error) {
      // 401/403 means the gateway does not accept the credentials the exchange
      // returned; that is a failed login, not a slow identity read.
      if (isRejectedCredentialError(error)) throw error
      return undefined
    }
  }

  /**
   * Discard the session a rejected login just wrote, so no SDK client keeps
   * credentials the gateway refuses, and report the rejection on the card.
   * @param error - the refusal the account endpoint returned.
   */
  private async discardRejectedDesktopSession(error: unknown): Promise<void> {
    try {
      await this.tokenStore.clear()
    } catch {
      // The durable copy is already unusable; the published snapshot below is
      // what every SDK client reads.
    }
    this.observedTokens = undefined
    this.publishTokens()
    const failure = browserFailureOf(error)
    this.desktopFailure = {
      code: 'session-rejected',
      ...(failure.message === undefined ? {} : { message: failure.message }),
      ...(failure.detail === undefined ? {} : { detail: failure.detail }),
    }
    this.desktopFailed = true
    console.error('ui-sdkwork-iam: browser login credentials rejected', this.desktopFailure)
    this.notifyDesktop()
  }

  /**
   * Record one failed browser-login step, name it on the card, and leave the
   * technical reason in the console.
   *
   * The card explains the step in the product's own words, but the reason the
   * host reported (an OAuth error description, an exchange rejection, a
   * transport failure) is what makes a support report actionable; it is textual
   * wire data, so it stays verbatim instead of being localized.
   * @param error - the rejected step.
   */
  private reportBrowserFailure(error: unknown): void {
    const failure = browserFailureOf(error)
    // The redeem runs inside the desktop auth runtime, which wraps a rejected
    // request into one message; the transport tap kept the server's own report
    // for the details view.
    const response = failure.response ?? this.desktopServerFailure
    this.desktopFailure = response === undefined ? failure : { ...failure, response }
    this.desktopFailed = true
    // A real answer from the browser — a refused page, a rejected code — is
    // raised again when the card is gone, so closing it cannot silence the
    // failure. A flow that simply timed out while the card was closed is the
    // user walking away; it must not pop a dialog minutes later.
    if (!this.surfaceOpen && failure.code !== 'flow-expired' && this.modal !== undefined) {
      this.modal.openBrowser()
      this.surfaceOpen = true
    }
    // The failure keeps the product-facing reason; the rejected step itself
    // carries the transport status, problem code, and trace id a support
    // report needs to correlate the attempt with the IAM server's logs.
    console.error('ui-sdkwork-iam: browser login failed', this.desktopFailure, error)
    this.notifyDesktop()
  }

  /**
   * The transient confirmation the sign-in host shows while its dialog is
   * closed.
   * @returns the pending notice, or undefined.
   */
  signInNotice(): IamSignInNotice | undefined {
    return this.notice
  }

  /**
   * Drop a notice once its toast finished.
   * @param id - the notice identity the toast displayed.
   */
  dismissSignInNotice(id: number): void {
    if (this.notice?.id !== id) return
    this.notice = undefined
    this.notifyDesktop()
  }

  /**
   * Keep the IAM server's own report for the card's details view.
   *
   * The redeem leg reports before the failure reaches this service, while the
   * hosted-page probe reports after it: a late answer is attached to the
   * failure already on screen and republished, so the details view updates in
   * place instead of requiring another attempt.
   * @param response - the status, code, trace id, and problem document one
   * rejected request answered with.
   */
  private recordServerFailure(response: IamServerFailureResponse): void {
    this.desktopServerFailure = response
    const reported = this.desktopFailure
    if (!this.desktopFailed || reported === undefined || reported.response !== undefined) return
    this.desktopFailure = { ...reported, response }
    this.notifyDesktop()
  }

  /** Publish a desktop browser-login state change. */
  private notifyDesktop(): void {
    for (const listener of [...this.desktopListeners]) listener()
  }

  /** Seed transport credentials from durable storage before bootstrap runs. */
  private async seedCredentialsFromStorage(): Promise<void> {
    // The store reports the snapshot through `onTokens`, which publishes it.
    await this.tokenStore.get()
  }

  private async readPersistableSession(): Promise<IamPersistedSession | null> {
    const stored = await this.tokenStore.get()
    return isPersistableStoredSession(stored) ? stored : null
  }

  private applyPersistedSession(stored: IamPersistedSession): void {
    const session = toRestoredAuthSession(stored)
    if (session) this.controller.applySession(session)
  }

  private async repersistAndApplySession(stored: IamPersistedSession): Promise<void> {
    const runtime = this.readRuntime()
    await runtime.tokenStore?.set?.(stored)
    this.applyPersistedSession(stored)
    this.publishTokens()
  }

  /**
   * Restore the pre-bootstrap backup after a validation that left the
   * controller anonymous.
   *
   * The auth runtime clears the durable copy on every failed validation, so an
   * anonymous controller alone cannot tell a transient read (offline, timeout)
   * from a session the server revoked. Restoring a revoked session would keep
   * signing the page in with credentials every later call rejects, so only a
   * read that failed without a refusal may restore the backup.
   * @param backup - the session snapshot read before bootstrap cleared it.
   */
  private async restoreBackupSession(backup: IamPersistedSession): Promise<void> {
    if (isRejectedCredentialError(this.runtime?.lastSessionValidationError)) {
      // The durable copy is already gone; the embedded packages' plaintext
      // copies must not outlive the session either.
      clearEmbeddedSdkworkCredentials()
      return
    }
    await this.repersistAndApplySession(backup)
  }

  /**
   * Adopt the credentials the durable store just reported and publish them.
   *
   * The store, not the controller, is the credential authority. A pre-expiry
   * refresh rotates tokens in the store without touching controller state, so
   * publishing the controller's (older) session would hand every SDK client the
   * pair that is about to expire — the refresh would happen and be ignored.
   * @param session - snapshot the store read or wrote; empty means signed out.
   */
  private observeSessionTokens(session: IamStoredSession): void {
    this.observedTokens = isPersistableStoredSession(session) ? session : undefined
    this.publishTokens()
  }

  /**
   * Put the authoritative credentials into the shared transport.
   *
   * The last session the store reported wins; while nothing has been observed
   * yet (the first boot, or a page whose host bridge is unavailable) the
   * controller's session is the only source.
   */
  private publishTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.observedTokens ?? this.controller.getState().session,
      this.env.accessToken(),
    )
    for (const listener of this.authTokenListeners) {
      try {
        listener()
      } catch (error) {
        // A listener must not break the credential publication every SDK
        // client depends on.
        console.error('ui-sdkwork-iam: auth-token listener failed', error)
      }
    }
  }
}
