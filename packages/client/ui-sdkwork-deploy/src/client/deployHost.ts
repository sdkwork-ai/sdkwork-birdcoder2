/**
 * BirdCoder host adapter for the SDKWork deploy publishing capability.
 *
 * Constructs the generated deploy/drive clients from the shared ui-sdkwork-env
 * and ui-sdkwork-iam services, reusing the global token manager that
 * ui-sdkwork-iam exposes (the same mechanism ui-sdkwork-drive uses), so the
 * create-deploy-app dialog receives ready clients without knowing the host.
 */
import {
  createClient as createDeployClient,
  type SdkworkDeployAppClient,
} from '@sdkwork/deployments-app-sdk'
import {
  createClient as createDriveClient,
  type SdkworkDriveAppClient,
} from '@sdkwork/drive-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'

/** IAM session shape consumed when syncing tokens. */
export interface DeployHostIamSession {
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
export interface DeployHostIam {
  controller: {
    getState(): { session: DeployHostIamSession | null }
    subscribe(listener: () => void): () => void
  }
}

/** Minimal environment service consumed by the adapter. */
export interface DeployHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Adapter options. */
export interface DeployHostOptions {
  env: DeployHostEnvironment
  iam: DeployHostIam
}

/** Constructed clients handed to the shared dialog. */
export interface DeployHostClients {
  deployClient: SdkworkDeployAppClient
  driveClient: SdkworkDriveAppClient
}

let activeHost: DeployHost | undefined

/** Resolve the active adapter (for tests / diagnostics). */
export function readActiveDeployHost(): DeployHost | undefined {
  return activeHost
}

/**
 * Host adapter: keeps the clients fresh across environment and IAM changes and
 * syncs the global token manager before every read.
 */
export class DeployHost {
  private readonly options: DeployHostOptions
  private readonly tokenManager: AuthTokenManager
  private deployClient: SdkworkDeployAppClient | undefined
  private driveClient: SdkworkDriveAppClient | undefined
  private clientBaseUrl: string | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private readonly listeners = new Set<() => void>()
  private disposed = false

  constructor(options: DeployHostOptions) {
    this.options = options
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Register as the process-wide active adapter, disposing any predecessor. */
  static adopt(host: DeployHost): void {
    if (activeHost !== undefined && activeHost !== host) activeHost.dispose()
    activeHost = host
  }

  /** Start observing host changes; publish() on every transition. */
  mount(): void {
    this.offEnvironment = this.options.env.subscribe(() => this.publish())
    this.offIam = this.options.iam.controller.subscribe(() => this.publish())
    DeployHost.adopt(this)
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

  /** Build or reuse the generated deploy + drive clients. */
  readClients(): DeployHostClients {
    const baseUrl = this.readBaseUrl()
    this.syncTokens()
    if (
      this.deployClient === undefined
      || this.driveClient === undefined
      || this.clientBaseUrl !== baseUrl
    ) {
      this.clientBaseUrl = baseUrl
      const common = {
        authMode: 'dual-token' as const,
        platform: 'pc' as const,
        baseUrl,
        tokenManager: this.tokenManager,
      }
      this.deployClient = createDeployClient(common)
      this.driveClient = createDriveClient(common)
    }
    return { deployClient: this.deployClient, driveClient: this.driveClient }
  }

  /** Host directory-picker port: Chromium File System Access API, else manual path. */
  async pickDirectory(current: string | undefined): Promise<string | undefined> {
    const picker = (window as Window & {
      showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<{ name: string } | null>
    }).showDirectoryPicker
    if (picker === undefined) return current
    try {
      const handle = await picker({ id: 'sdkwork-deploy-source-directory', mode: 'read' })
      return handle?.name ? handle.name : current
    } catch {
      // User cancelled (AbortError) — keep the current value.
      return current
    }
  }

  private readBaseUrl(): string {
    const baseUrl = this.options.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-sdkwork-deploy: SDKWork base URL is not configured')
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

/** Convenience: mount a host from the shared services and read the clients. */
export function createDeployHost(options: DeployHostOptions): DeployHost {
  const host = new DeployHost(options)
  host.mount()
  return host
}
