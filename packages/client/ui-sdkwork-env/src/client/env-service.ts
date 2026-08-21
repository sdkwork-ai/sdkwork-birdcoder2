/**
 * The deployment environment service: mirrors the `ui-sdkwork-env` settings scope
 * and exposes the ACTIVE environment's profile — one base URL, app id, app
 * key, and access token shared by every sdkwork integration plugin, so a
 * deployment switches environments in one place instead of per-plugin
 * settings.
 */
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
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

  /** The current settings snapshot (schema defaults until the scope resolves). */
  currentSettings(): UiEnvSettings {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) {
      return snapshot.value
    }
    return DEFAULT_UI_ENV_SETTINGS
  }

  /** The active environment selector. */
  currentEnvironment(): SdkworkEnvironment {
    return this.currentSettings().environment
  }

  /** The active environment's integration profile. */
  profile(): SdkworkEnvProfile {
    return this.currentSettings()[this.currentEnvironment()]
  }

  /** Whether the active environment carries a usable API gateway origin. */
  isConfigured(): boolean {
    return this.profile().apiBaseUrl.trim() !== ''
  }

  /** The active environment's API gateway origin. */
  apiBaseUrl(): string {
    return this.profile().apiBaseUrl
  }

  /** The active environment's IAM tenant application id. */
  appId(): string {
    return this.profile().appId
  }

  /** The active environment's product app key. */
  appKey(): string {
    return this.profile().appKey
  }

  /** The active environment's static access token (empty means IAM-session auth). */
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
