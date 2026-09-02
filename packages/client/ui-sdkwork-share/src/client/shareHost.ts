/**
 * BirdCoder host adapter for the SDKWork share capability.
 *
 * Constructs the generated deploy client (only the read surface needed to
 * list recently published applications) from the shared ui-sdkwork-env and
 * ui-sdkwork-iam services, reusing the global token manager — the same
 * mechanism ui-sdkwork-drive and ui-sdkwork-deploy use. The client identity
 * refreshes when the API environment changes.
 */
import { createClient, type SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'

/** IAM session shape consumed when syncing tokens. */
export interface ShareHostIamSession {
  authToken?: string
  accessToken?: string
  refreshToken?: string
  sessionId?: string
  user?: { id: string; displayName?: string; avatarUrl?: string; email?: string }
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
export interface ShareHostIam {
  controller: {
    getState(): { session: ShareHostIamSession | null }
    subscribe(listener: () => void): () => void
  }
}

/** Minimal environment service consumed by the adapter. */
export interface ShareHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Adapter options. */
export interface ShareHostOptions {
  env: ShareHostEnvironment
  iam: ShareHostIam
}

let activeHost: ShareHost | undefined

/**
 * Register the singleton adapter, disposing any previous one. Module-level
 * (rather than an in-class `activeHost = this` assignment) so the lint
 * no-this-alias rule stays clean.
 * @param host - freshly mounted adapter.
 */
function registerActiveHost(host: ShareHost): void {
  if (activeHost !== undefined && activeHost !== host) activeHost.dispose()
  activeHost = host
}

/** Resolve the active adapter (for tests / diagnostics). */
export function readActiveShareHost(): ShareHost | undefined {
  return activeHost
}

/**
 * Host adapter: keeps the deploy client fresh across environment and IAM
 * changes and syncs the global token manager before every read.
 */
export class ShareHost {
  private readonly options: ShareHostOptions
  private readonly tokenManager: AuthTokenManager
  private deployClient: SdkworkDeployAppClient | undefined
  private clientBaseUrl: string | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private readonly listeners = new Set<() => void>()
  private disposed = false

  constructor(options: ShareHostOptions) {
    this.options = options
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Start observing host changes; publish() on every transition. */
  mount(): void {
    this.offEnvironment = this.options.env.subscribe(() => this.publish())
    this.offIam = this.options.iam.controller.subscribe(() => this.publish())
    registerActiveHost(this)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.listeners.clear()
    if (activeHost === this) activeHost = undefined
  }

  /** Subscribe to client identity changes (environment switches). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Build or reuse the generated deploy client. */
  readDeployClient(): SdkworkDeployAppClient {
    const baseUrl = this.readBaseUrl()
    this.syncTokens()
    if (this.deployClient === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.deployClient = createClient({
        authMode: 'dual-token',
        platform: 'pc',
        baseUrl,
        tokenManager: this.tokenManager,
      })
    }
    return this.deployClient
  }

  /** List recently published applications (best-effort for the share popover). */
  async listRecentApps(limit = 5): Promise<readonly { id: string; name: string; appKind: string }[]> {
    try {
      const client = this.readDeployClient()
      const result = await client.app.list({ page: 1, pageSize: limit })
      return result.items.map(app => ({
        id: app.id,
        name: app.name,
        appKind: app.appKind,
      }))
    } catch {
      return []
    }
  }

  private readBaseUrl(): string {
    const baseUrl = this.options.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-sdkwork-share: SDKWork base URL is not configured')
    return baseUrl
  }

  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  private publish(): void {
    if (this.disposed) return
    for (const listener of this.listeners) listener()
  }
}

/** Convenience: mount a host from the shared services. */
export function createShareHost(options: ShareHostOptions): ShareHost {
  const host = new ShareHost(options)
  host.mount()
  return host
}
