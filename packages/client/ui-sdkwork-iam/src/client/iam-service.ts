/**
 * The `ctx.iam` service: owns the sdkwork auth controller over the runtime
 * adapter, mirrors the `ui-sdkwork-iam` settings scope, and dispatches the sign-in
 * presentation (modal vs full-page account mode). Cross-plugin consumers use
 * this face; the settings-menu account seam is bound by account-source.ts.
 */

import {
  createSdkworkIamRuntimeAuthController,
  type SdkworkAuthController,
  type SdkworkAuthRuntimeConfig,
} from '@sdkwork/auth-pc-react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.env (the shared deployment environment) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import {
  DEFAULT_UI_IAM_SETTINGS,
  type UiIamSettings,
} from '../iam-settings.ts'
import { createIamAuthRuntime } from './iam-runtime.ts'
import type { SdkworkIamRuntimeAuthRuntimeLike } from '@sdkwork/auth-pc-react'
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
import type { AuthenticatedModeGate } from './authenticated-mode.ts'
import {
  SdkworkSignInRequiredError,
  type SdkworkSignInRequirement,
} from './sign-in-requirement.ts'

/** The localStorage key owning the durable IAM session blob. */
const IAM_SESSION_STORAGE_KEY = 'dsh.iam.session'

/** The modal open/close actions, bound by the overlay registration. */
export interface IamModalActions {
  open: () => void
  close: () => void
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
  readonly controller: SdkworkAuthController
  private readonly scope: SettingsScope<UiIamSettings>
  private readonly env: EnvService
  private readonly layout: ILayout
  private modal: IamModalActions | undefined
  private runtime: SdkworkIamRuntimeAuthRuntimeLike | undefined
  private runtimeBaseUrl: string | undefined
  private readonly tokenStore: IamTokenStore
  private readonly tokenManager: AuthTokenManager
  private pendingSignIn: PendingSignIn | undefined

  constructor(scope: SettingsScope<UiIamSettings>, env: EnvService, layout: ILayout) {
    this.scope = scope
    this.env = env
    this.layout = layout
    this.tokenManager = getSdkworkGlobalTokenManager()
    this.tokenStore = createIamTokenStore({
      storageKey: IAM_SESSION_STORAGE_KEY,
      onTokens: (session) => { this.syncTokenManagerFromStoredOrController(session) },
    })
    this.controller = createSdkworkIamRuntimeAuthController({
      getRuntime: () => this.readRuntime(),
    })
    this.syncTokenManagerFromEnvOrSession()
    this.controller.subscribe(() => {
      this.syncTokenManagerFromEnvOrSession()
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
    return this.env.isConfigured()
  }

  /**
   * Whether the IAM controller currently holds a signed-in session.
   * @returns whether a signed-in session is held.
   */
  isSignedIn(): boolean {
    return this.controller.getState().isAuthenticated
  }

  /**
   * The active environment's IAM tenant application id.
   * @returns the active environment's IAM tenant application id.
   */
  appId(): string {
    return this.env.appId()
  }

  /**
   * The auth-surface runtime config derived from the live settings.
   * @returns the auth-surface runtime config.
   */
  authRuntimeConfig(): SdkworkAuthRuntimeConfig {
    const settings = this.currentSettings()
    return {
      leftRailMode: 'highlights-only',
      loginMethods: ['password'],
      oauthLoginEnabled: settings.oauthLoginEnabled,
      oauthProviders: [],
      qrLoginEnabled: settings.qrLoginEnabled,
      registerMethods: ['email', 'phone'],
      recoveryMethods: ['email', 'phone'],
    }
  }

  /**
   * Observe controller and settings changes (components re-read on either).
   * @param listener - the change listener.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void {
    const offController = this.controller.subscribe(listener)
    const offScope = this.scope.subscribe(listener)
    const offEnv = this.env.subscribe(() => {
      this.syncTokenManagerFromEnvOrSession()
      listener()
    })
    return () => {
      offController()
      offScope()
      offEnv()
    }
  }

  /**
   * The settings-menu sign-in gesture: modal or full-page per the setting.
   * Unconfigured the chosen surface still opens — the modal host and the
   * account page both render the configuration notice instead of the auth
   * surface, so the gesture never silently no-ops.
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
   * Open the modal sign-in overlay. Settings-menu presentation (`page` vs
   * `modal`) does not apply: a gated mode page stays on screen behind the
   * overlay so login returns to the module the user opened.
   */
  openSignInOverlay(): void {
    if (this.isSignedIn()) return
    this.modal?.open()
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
    // The executor runs synchronously, so `settle` is assigned before the
    // promise can be awaited by anyone.
    let settle!: (signedIn: boolean) => void
    const promise = new Promise<boolean>((resolve) => { settle = resolve })
    this.pendingSignIn = { promise, settle }
    this.openSignInOverlay()
    return promise
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
   */
  dismissSignIn(): void {
    this.modal?.close()
    this.settlePendingSignIn()
  }

  /**
   * Adopt the modal open/close actions (overlay registration's bound store).
   * @param actions - the modal actions the overlay registration bound.
   */
  attachModal(actions: IamModalActions): void {
    this.modal = actions
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
      await this.repersistAndApplySession(backup)
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

  /** The lazily built runtime adapter for the active environment. */
  private readRuntime(): SdkworkIamRuntimeAuthRuntimeLike {
    const baseUrl = this.env.apiBaseUrl()
    if (baseUrl.trim() === '') {
      throw new Error('ui-sdkwork-iam: IAM baseUrl is not configured')
    }
    if (this.runtime === undefined || this.runtimeBaseUrl !== baseUrl) {
      this.runtimeBaseUrl = baseUrl
      // When baseUrl changes, re-seed the token manager so any access-token-only
      // pre-auth endpoints can dispatch under the new environment.
      this.syncTokenManagerFromEnvOrSession()
      this.runtime = createIamAuthRuntime({
        baseUrl,
        tokenStore: this.tokenStore,
        tokenManager: this.tokenManager,
      })
    }
    return this.runtime
  }

  /**
   * Keep the generated SDK client's credential transport in sync.
   *
   * IAM session tokens are the signed-in credentials; a static env access
   * token fills Access-Token when the session omits it and is the anonymous
   * catalog credential when signed out. Membership checkout requires both
   * Access-Token and authToken, so env-only bootstrap must not replace authToken.
   */
  private syncTokenManagerFromEnvOrSession(): void {
    this.syncTokenManagerFromStoredOrController(undefined)
  }

  /** Seed transport credentials from durable storage before bootstrap runs. */
  private async seedCredentialsFromStorage(): Promise<void> {
    const stored = await this.tokenStore.get()
    this.syncTokenManagerFromStoredOrController(stored)
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
    this.syncTokenManagerFromEnvOrSession()
  }

  /**
   * Prefer the live controller session; fall back to durable storage while
   * bootstrap has not yet hydrated the controller.
   */
  private syncTokenManagerFromStoredOrController(stored?: IamStoredSession): void {
    const controllerSession = this.controller.getState().session
    if (controllerSession) {
      syncSdkworkGlobalTokenManager(controllerSession, this.env.accessToken())
      return
    }
    const source = stored ?? undefined
    if (source && isPersistableStoredSession(source)) {
      syncSdkworkGlobalTokenManager(source, this.env.accessToken())
      return
    }
    syncSdkworkGlobalTokenManager(null, this.env.accessToken())
  }
}
