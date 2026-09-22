/**
 * The deployment environment service: mirrors the `ui-sdkwork-env` settings scope
 * and exposes the ACTIVE environment's profile — one base URL, app id, app
 * key, and access token shared by every sdkwork integration plugin, so a
 * deployment switches environments in one place instead of per-plugin
 * settings.
 */
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  decodeEnvProjection, mergeEnvLayers,
  type SdkworkEnvProfile, type SdkworkEnvProjection, type SdkworkEnvironment, type UiEnvSettings,
} from '../env-settings.ts'

/**
 * Environment service: settings mirror + active-profile projection.
 */
export class EnvService {
  private readonly scope: ConfigForm<UiEnvSettings>
  private readonly projection: SdkworkEnvProjection

  /**
   * @param scope - the ui-sdkwork-env settings scope the document lands in.
   * @param projection - the launch-environment projection published for this
   * page; the user layer overrides it field by field. Narrowed on the way in,
   * so an unknown environment can never reach the active-profile lookup.
   */
  constructor(scope: ConfigForm<UiEnvSettings>, projection: SdkworkEnvProjection = {}) {
    this.scope = scope
    this.projection = decodeEnvProjection(projection)
  }

  /**
   * The current settings: schema defaults, the launch-environment projection,
   * then the user layer.
   *
   * The user layer — not the resolved value — is what sits over the
   * projection, and the snapshot's contract is explicit about why: a field's
   * presence in `user` is what marks it overridden, so a resolved value
   * carrying the schema defaults would otherwise mask the projection in every
   * deployment. The composition layer contributes nothing here because the
   * web-app composition declares no `ui-sdkwork-env` entry config.
   * @returns the current settings.
   */
  currentSettings(): UiEnvSettings {
    const snapshot = this.scope.getSnapshot()
    const user = snapshot.status === 'ready' ? decodeEnvProjection(snapshot.user) : {}
    return mergeEnvLayers(this.projection, user)
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
