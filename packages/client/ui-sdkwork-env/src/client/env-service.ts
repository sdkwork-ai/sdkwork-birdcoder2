/**
 * The deployment environment service: mirrors the `ui-sdkwork-env` settings scope
 * and exposes the ACTIVE environment's profile — one base URL, app id, app
 * key, and access token shared by every sdkwork integration plugin, so a
 * deployment switches environments in one place instead of per-plugin
 * settings.
 */
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_UI_ENV_SETTINGS,
  type SdkworkEnvProfile, type SdkworkEnvironment, type UiEnvSettings,
} from '../env-settings.ts'

/**
 * Environment service: settings mirror + active-profile projection.
 */
export class EnvService {
  private readonly scope: SettingsScope<UiEnvSettings>

  constructor(scope: SettingsScope<UiEnvSettings>) {
    this.scope = scope
  }

  /**
   * The current settings snapshot (schema defaults until the scope resolves).
   * @returns the current settings snapshot.
   */
  currentSettings(): UiEnvSettings {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) {
      return snapshot.value
    }
    return DEFAULT_UI_ENV_SETTINGS
  }

  /**
   * The active environment selector.
   * @returns the active environment selector.
   */
  currentEnvironment(): SdkworkEnvironment {
    return this.currentSettings().environment
  }

  /**
   * The active environment's integration profile.
   * @returns the active environment's integration profile.
   */
  profile(): SdkworkEnvProfile {
    return this.currentSettings()[this.currentEnvironment()]
  }

  /**
   * Whether the settings scope has resolved its first document.
   * @returns whether the scope snapshot is ready.
   */
  private scopeReady(): boolean {
    const snapshot = this.scope.getSnapshot()
    return snapshot.status === 'ready' && snapshot.value !== undefined
  }

  /**
   * Whether the active environment carries a usable API gateway origin.
   *
   * Unresolved counts as unconfigured on purpose: before the scope resolves
   * the launch-environment projection has not landed yet, so any base URL
   * served here would be a guess — and a guessed URL made the first IAM
   * session restore of a `pnpm desktop:dev` launch fire against the
   * production gateway (SDKWORK-SPECS environment contract violation).
   * @returns whether the active environment carries a usable API gateway origin.
   */
  isConfigured(): boolean {
    if (!this.scopeReady()) return false
    return this.profile().apiBaseUrl.trim() !== ''
  }

  /**
   * The active environment's API gateway origin.
   * @returns the active environment's API gateway origin.
   */
  apiBaseUrl(): string {
    return this.profile().apiBaseUrl
  }

  /**
   * The active environment's IAM tenant application id.
   * @returns the active environment's IAM tenant application id.
   */
  appId(): string {
    return this.profile().appId
  }

  /**
   * The active environment's product app key.
   * @returns the active environment's product app key.
   */
  appKey(): string {
    return this.profile().appKey
  }

  /**
   * The active environment's static access token (empty means IAM-session auth).
   * @returns the active environment's static access token.
   */
  accessToken(): string {
    return this.profile().accessToken
  }

  /**
   * Observe environment or profile changes.
   * @param listener - the change listener.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void {
    return this.scope.subscribe(listener)
  }
}
