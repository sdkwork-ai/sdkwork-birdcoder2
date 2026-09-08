/**
 * BirdCoder host adapter for the SDKWork cloudrouter API key management
 * capability.
 *
 * Constructs the generated cloudrouter app/models clients from the shared
 * ui-sdkwork-env and ui-sdkwork-iam services (via the global token manager —
 * the same mechanism ui-sdkwork-deploy uses) and binds them through the
 * api-keys service's injectable seam (`configureApiKeyServiceClients`), so
 * the embedded ApiKeysView stays host-agnostic: it keeps calling its own
 * service layer, which now resolves clients from the seam instead of the
 * console-only factory.
 */
import { createClient as createCloudRouterAppClient, type SdkworkAppClient } from '@sdkwork/cloudrouter-app-sdk'
import { createClient as createModelsAppClient, type SdkworkAppClient as ModelsAppClient } from '@sdkwork/models-app-sdk'
import { getSdkworkGlobalTokenManager, syncSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { configureApiKeyServiceClients } from '@sdkwork/cloudrouter-pc-console-api-keys'

/** IAM session shape consumed when syncing tokens (deployHost precedent). */
export interface ApiKeyHostIamSession {
  authToken?: string
  accessToken?: string
  refreshToken?: string
  sessionId?: string
  user?: {
    id: string
    displayName?: string
    avatarUrl?: string
    email?: string
  }
  context?: {
    tenantId: string
    userId: string
    organizationId?: string
    sessionId?: string
    appId?: string
    environment?: string
    deploymentMode?: string
    authLevel?: string
    dataScope?: string[]
    permissionScope?: string[]
    actorId?: string
    actorKind?: string
    deviceId?: string
  }
  updatedAt?: string
}

/** Minimal IAM controller state consumed by the adapter. */
export interface ApiKeyHostIam {
  controller: {
    getState(): {
      session: ApiKeyHostIamSession | null
    }
    subscribe(listener: () => void): () => void
  }
}

/** Minimal environment service consumed by the adapter. */
export interface ApiKeyHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Adapter options. */
export interface ApiKeyHostOptions {
  env: ApiKeyHostEnvironment
  iam: ApiKeyHostIam
}

/** Constructed clients bound into the api-keys service seam. */
export interface ApiKeyHostClients {
  appClient: SdkworkAppClient
  modelsClient: ModelsAppClient
}

let activeHost: ApiKeyHost | undefined

/** Resolve the active adapter (for tests / diagnostics). */
export function readActiveApiKeyHost(): ApiKeyHost | undefined {
  return activeHost
}

/**
 * Host adapter: keeps the clients fresh across environment and IAM changes,
 * syncs the global token manager before every read, and re-binds the service
 * seam so the next service call uses the current clients.
 */
export class ApiKeyHost {
  private readonly options: ApiKeyHostOptions
  private readonly tokenManager: ReturnType<typeof getSdkworkGlobalTokenManager>
  private appClient: SdkworkAppClient | undefined
  private modelsClient: ModelsAppClient | undefined
  private clientBaseUrl: string | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  constructor(options: ApiKeyHostOptions) {
    this.options = options
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Register as the process-wide active adapter, disposing any predecessor. */
  static adopt(host: ApiKeyHost): void {
    if (activeHost !== undefined && activeHost !== host) activeHost.dispose()
    activeHost = host
  }

  /** Start observing host changes; refresh the seam on every transition. */
  mount(): void {
    this.offEnvironment = this.options.env.subscribe(() => this.refresh())
    this.offIam = this.options.iam.controller.subscribe(() => this.refresh())
    ApiKeyHost.adopt(this)
    this.refresh()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    if (activeHost === this) activeHost = undefined
  }

  /** Whether the gateway origin is configured and clients can be built. */
  readReady(): boolean {
    return this.readBaseUrl() !== ''
  }

  /**
   * Sync tokens and (re)build the generated clients when the gateway origin
   * changed, then re-bind the service seam. No-op while the origin is unset —
   * the section renders its not-configured hint instead of failing.
   */
  refresh(): void {
    if (this.disposed) return
    const baseUrl = this.readBaseUrl()
    if (baseUrl === '') return
    this.syncTokens()
    if (this.appClient === undefined
      || this.modelsClient === undefined
      || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      // The generated clients' `baseUrl` is the gateway ORIGIN: each API
      // namespace prepends its own `APP_API_PREFIX` (/app/v3/api), mirroring
      // the console's normalizeGeneratedSdkBaseUrl output for a bare origin.
      const origin = baseUrl.replace(/\/+$/u, '')
      const common = {
        baseUrl: origin,
        platform: 'pc',
        tokenManager: this.tokenManager,
      } as const
      this.appClient = createCloudRouterAppClient(common)
      this.modelsClient = createModelsAppClient(common)
    }
    configureApiKeyServiceClients({ appClient: this.appClient, modelsClient: this.modelsClient })
  }

  /** Mirror the gateway origin into the console runtime env (call-time reads). */
  private syncRuntimeEnv(origin: string): void {
    const globalWindow = globalThis as typeof globalThis & {
      __CLOUDROUTER_ENV__?: Record<string, string>
    }
    globalWindow.__CLOUDROUTER_ENV__ = {
      ...globalWindow.__CLOUDROUTER_ENV__,
      VITE_CLOUDROUTER_APP_API_BASE_URL: origin,
      VITE_SDKWORK_MODELS_APP_API_BASE_URL: origin,
      VITE_CLOUDROUTER_OPEN_API_BASE_URL: origin,
    }
  }

  private readBaseUrl(): string {
    return this.options.env.apiBaseUrl().trim()
  }

  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(this.options.iam.controller.getState().session, this.options.env.accessToken())
    this.syncRuntimeEnv(this.readBaseUrl().replace(/\/+$/u, ''))
  }
}

/** Convenience: mount a host from the shared services. */
export function createApiKeyHost(options: ApiKeyHostOptions): ApiKeyHost {
  const host = new ApiKeyHost(options)
  host.mount()
  return host
}
