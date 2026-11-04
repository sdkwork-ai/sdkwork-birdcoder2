/**
 * BirdCoder host adapter for the user-facing IAM official-account capability.
 *
 * The capability lives in `@sdkwork/iam-pc-oauth` (app tier, IAM app API). This
 * adapter owns everything behind that surface: the gateway origin from the
 * shared ui-sdkwork-env profile, the IAM session credentials from `ctx.iam`
 * mirrored into the browser-global token manager, and the generated
 * `@sdkwork/iam-app-sdk` app client whose `iam.oauth.officialAccounts` slice
 * backs every list/create/update/delete request. No backend-admin client and
 * no tenant login resource are involved: these rows are the signed-in account's
 * own channel configuration.
 */
import {
  createClient as createIamAppClient,
  type SdkworkAppClient,
} from '@sdkwork/iam-app-sdk'
import {
  createSdkworkIamOfficialAccountsClient,
  SdkworkIamOfficialAccountsController,
} from '@sdkwork/iam-pc-oauth'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'

/** IAM session credential fields the adapter forwards to the token manager. */
export interface OfficialAccountsHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** Environment values consumed by the adapter. */
export interface OfficialAccountsHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller face consumed by the adapter. */
export interface OfficialAccountsHostIam {
  controller: {
    /** @returns the current session, or null while signed out. */
    getState(): { session: OfficialAccountsHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Adapter construction options. */
export interface OfficialAccountsHostOptions {
  env: OfficialAccountsHostEnvironment
  iam: OfficialAccountsHostIam
}

/**
 * Host adapter: keeps the gateway origin current, mirrors the IAM session into
 * the shared token manager before every read, and rebuilds the generated client
 * and its controller when the deployment origin changes.
 */
export class OfficialAccountsHost {
  private readonly options: OfficialAccountsHostOptions
  private readonly tokenManager: ReturnType<typeof getSdkworkGlobalTokenManager>
  private readonly listeners = new Set<() => void>()
  private client: SdkworkAppClient | undefined
  private controller: SdkworkIamOfficialAccountsController | undefined
  private clientBaseUrl: string | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  /**
   * @param options - the shared environment and IAM session providers.
   */
  constructor(options: OfficialAccountsHostOptions) {
    this.options = options
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Start observing deployment and session changes. */
  mount(): void {
    this.offEnvironment = this.options.env.subscribe(() => { this.refresh() })
    this.offIam = this.options.iam.controller.subscribe(() => { this.refresh() })
    this.refresh()
  }

  /** Stop observing and drop the built client and controller. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.offEnvironment = undefined
    this.offIam = undefined
    this.listeners.clear()
    this.client = undefined
    this.controller = undefined
    this.clientBaseUrl = undefined
  }

  /**
   * Observe adapter state (readiness and credentials).
   * @param listener - the change listener.
   * @returns the disposer removing the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Whether the gateway origin is configured, so the panel can mount.
   * @returns whether a non-empty gateway origin is available.
   */
  readReady(): boolean {
    return this.readBaseUrl() !== ''
  }

  /**
   * The controller the embedded panel renders from.
   * @returns the account controller, or undefined while the gateway origin is
   * unconfigured.
   */
  readController(): SdkworkIamOfficialAccountsController | undefined {
    const baseUrl = this.readBaseUrl()
    if (baseUrl === '') return undefined
    this.syncTokens()
    if (this.controller === undefined || this.clientBaseUrl !== baseUrl) {
      const client = createIamAppClient({
        authMode: 'dual-token',
        baseUrl,
        platform: 'pc',
        tokenManager: this.tokenManager,
      })
      this.client = client
      this.clientBaseUrl = baseUrl
      this.controller = new SdkworkIamOfficialAccountsController(
        createSdkworkIamOfficialAccountsClient(client.iam.oauth.officialAccounts),
      )
    }
    return this.controller
  }

  /** Re-publish credentials and readiness after an environment or session change. */
  refresh(): void {
    if (this.disposed) return
    if (this.readBaseUrl() !== '') this.syncTokens()
    this.publish()
  }

  private readBaseUrl(): string {
    return this.options.env.apiBaseUrl().trim().replace(/\/+$/u, '')
  }

  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  private publish(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * Mount an adapter over the shared environment and IAM session providers.
 * @param options - the environment and IAM faces.
 * @returns the mounted adapter.
 */
export function mountOfficialAccountsHost(options: OfficialAccountsHostOptions): OfficialAccountsHost {
  const host = new OfficialAccountsHost(options)
  host.mount()
  return host
}
