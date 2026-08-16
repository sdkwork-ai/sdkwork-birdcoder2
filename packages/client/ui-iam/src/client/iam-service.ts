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
export class IamService {
  readonly controller: SdkworkAuthController
  private readonly scope: SettingsScope<UiIamSettings>
  private readonly env: EnvService
  private readonly layout: ILayout
  private modal: IamModalActions | undefined
  private runtime: SdkworkIamRuntimeAuthRuntimeLike | undefined
  private runtimeBaseUrl: string | undefined
  private readonly tokenStore: IamTokenStore

  constructor(scope: SettingsScope<UiIamSettings>, env: EnvService, layout: ILayout) {
    this.scope = scope
    this.env = env
    this.layout = layout
    this.tokenStore = createIamTokenStore({ storageKey: IAM_SESSION_STORAGE_KEY })
    this.controller = createSdkworkIamRuntimeAuthController({
      getRuntime: () => this.readRuntime(),
    })
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
    const offEnv = this.env.subscribe(listener)
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
    if (this.controller.getState().isAuthenticated) return
    if (this.currentSettings().presentation === 'page') {
      this.layout.setMode('account')
      return
    }
    this.modal?.open()
  }

  /** Close the modal sign-in surface. */
  closeModal(): void {
    this.modal?.close()
  }

  /** Adopt the modal open/close actions (overlay registration's bound store). */
  attachModal(actions: IamModalActions): void {
    this.modal = actions
  }

  /** Restore a stored session; no-op while the IAM base URL is unconfigured. */
  async bootstrap(): Promise<void> {
    if (!this.isConfigured()) return
    await this.controller.bootstrap()
  }

  /** The lazily built runtime adapter for the active environment. */
  private readRuntime(): SdkworkIamRuntimeAuthRuntimeLike {
    const baseUrl = this.env.apiBaseUrl()
    if (baseUrl.trim() === '') {
      throw new Error('ui-iam: IAM baseUrl is not configured')
    }
    if (this.runtime === undefined || this.runtimeBaseUrl !== baseUrl) {
      this.runtimeBaseUrl = baseUrl
      this.runtime = createIamAuthRuntime({
        baseUrl,
        tokenStore: this.tokenStore,
      })
    }
    return this.runtime
  }
}
