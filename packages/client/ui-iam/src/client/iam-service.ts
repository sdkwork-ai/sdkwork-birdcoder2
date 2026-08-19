/**
 * The `ctx.iam` service: owns the sdkwork auth controller over the runtime
 * adapter, mirrors the `ui-iam` settings scope, and dispatches the sign-in
 * presentation (modal vs full-page account mode). Cross-plugin consumers use
 * this face; the settings-menu account seam is bound by account-source.ts.
 */

import {
  createSdkworkIamRuntimeAuthController,
  type SdkworkAuthController,
  type SdkworkAuthRuntimeConfig,
} from '@sdkwork/auth-pc-react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.env (the shared deployment environment) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import {
  DEFAULT_UI_IAM_SETTINGS,
  type UiIamSettings,
} from '../iam-settings.ts'
import { createIamAuthRuntime } from './iam-runtime.ts'
import type { SdkworkIamRuntimeAuthRuntimeLike } from '@sdkwork/auth-pc-react'
import { createIamTokenStore, type IamTokenStore } from './iam-token-store.ts'
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
import {
  requestAuthenticatedMode,
  type AuthenticatedModeGate,
} from './authenticated-mode.ts'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'

/** The localStorage key owning the durable IAM session blob. */
const IAM_SESSION_STORAGE_KEY = 'dsh.iam.session'

/** The modal open/close actions, bound by the overlay registration. */
export interface IamModalActions {
  open: () => void
  close: () => void
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
 * from the shared ui-env profile so an environment switch takes effect
 * without reload.
 */
export class IamService implements AuthenticatedModeGate {
  readonly controller: SdkworkAuthController
  private readonly scope: SettingsScope<UiIamSettings>
  private readonly env: EnvService
  private readonly layout: ILayout
  private modal: IamModalActions | undefined
  private runtime: SdkworkIamRuntimeAuthRuntimeLike | undefined
  private runtimeBaseUrl: string | undefined
  private readonly tokenStore: IamTokenStore
  private readonly tokenManager: AuthTokenManager

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
    this.controller.subscribe(() => { this.syncTokenManagerFromEnvOrSession() })
    void this.seedCredentialsFromStorage()
  }

  /** The current settings snapshot (schema defaults until the scope resolves). */
  currentSettings(): UiIamSettings {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) {
      return snapshot.value
    }
    return DEFAULT_UI_IAM_SETTINGS
  }

  /** Whether sign-in is available (the active environment carries a base URL). */
  isConfigured(): boolean {
    return this.env.isConfigured()
  }

  /** Whether the IAM controller currently holds a signed-in session. */
  isSignedIn(): boolean {
    return this.controller.getState().isAuthenticated
  }

  /** The active environment's IAM tenant application id. */
  appId(): string {
    return this.env.appId()
  }

  /** The auth-surface runtime config derived from the live settings. */
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

  /** Observe controller and settings changes (components re-read on either). */
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
   * Open the modal sign-in overlay for gated product modes. Settings-menu
   * presentation (`page` vs `modal`) does not apply: those modes stay on
   * screen behind the overlay so login returns to the module the user opened.
   */
  openSignInOverlay(): void {
    if (this.isSignedIn()) return
    this.modal?.open()
  }

  /**
   * Switch the frame to `mode` and open the sign-in overlay when that mode
   * requires a session and the user is signed out.
   * @param mode - the rail or layout mode the user requested.
   * @param setMode - the layout store's mode switch.
   */
  requestAuthenticatedMode(mode: AppModeId, setMode: (mode: AppModeId) => void): void {
    requestAuthenticatedMode(this, mode, setMode)
  }

  /** Close the modal sign-in surface. */
  closeModal(): void {
    this.modal?.close()
  }

  /** Adopt the modal open/close actions (overlay registration's bound store). */
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

  /** The lazily built runtime adapter for the active environment. */
  private readRuntime(): SdkworkIamRuntimeAuthRuntimeLike {
    const baseUrl = this.env.apiBaseUrl()
    if (baseUrl.trim() === '') {
      throw new Error('ui-iam: IAM baseUrl is not configured')
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
  private syncTokenManagerFromStoredOrController(stored?: IamPersistedSession): void {
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
