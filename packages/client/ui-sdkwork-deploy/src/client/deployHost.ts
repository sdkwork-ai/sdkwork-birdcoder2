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

/** One directory row as served by the workspace listing port. */
export interface DeployWorkspaceListing {
  path: string
  entries: readonly { name: string; path: string; hidden: boolean }[]
}

/**
 * Host workspace port (structural minimum, declared locally to avoid a
 * compile-time dependency on the client runtime): directory browsing over the
 * host bridge plus the session's current working directory.
 */
export interface DeployHostWorkspace {
  pickDirectory(): Promise<string | null | undefined>
  listDirectory(path?: string): Promise<DeployWorkspaceListing>
  currentDirectory(): string | undefined
  /**
   * Read a small governed text file (sdkwork.app.config.json-sized) through
   * the host directory bridge. Optional: absent keeps appId persistence off.
   */
  readTextFile?(path: string, signal?: AbortSignal): Promise<string>
  /**
   * Write a small governed text file, replacing previous content. Optional.
   * @returns the written absolute path.
   */
  writeTextFile?(path: string, content: string): Promise<string>
}

/** Project detection snapshot handed to the create-deploy-app dialog. */
export interface DeployDirectoryInspection {
  rootPath: string
  childDirectories: string[]
  appsChildDirectories: string[]
  surfaceChildDirectories: Record<string, string[]>
}

/** Request to run one package-manager build in an absolute directory. */
export interface DeployHostBuildStartRequest {
  cwd: string
  script?: string
}

/** Acknowledged build spawn. */
export interface DeployHostBuildStartValue {
  buildId: string
  command: string
  cwd: string
}

/** One streamed build frame (wire mirror, dialog-facing shape). */
export type DeployHostBuildFrame =
  | { type: 'started'; buildId: string; command: string; cwd: string }
  | { type: 'output'; buildId: string; stream: 'stdout' | 'stderr'; text: string }
  | {
    type: 'exit'
    buildId: string
    outcome: 'succeeded' | 'failed' | 'cancelled'
    exitCode: number | null
    signal: string | null
    durationMs: number
  }

/**
 * Host build port (structural minimum over the generated sdkworkAppBuild
 * Remote): one-click packaging for the publish dialog when the build output
 * is missing. Optional — absent keeps the button hidden instead of breaking
 * the dialog on hosts without the sdkwork-app-build plugin.
 */
export interface DeployHostBuild {
  start(request: DeployHostBuildStartRequest): Promise<DeployHostBuildStartValue>
  /** Consume one build's frames until the exit frame; resolves when it ends. */
  follow(
    buildId: string,
    onFrame: (frame: DeployHostBuildFrame) => void,
    signal: AbortSignal,
  ): Promise<void>
  cancel(buildId: string): Promise<void>
}

/** Adapter options. */
export interface DeployHostOptions {
  env: DeployHostEnvironment
  iam: DeployHostIam
  workspace?: DeployHostWorkspace
  build?: DeployHostBuild
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

  /** Host directory-picker port: workspace bridge first, then the browser's File System Access API, else the manual path. */
  async pickDirectory(current: string | undefined): Promise<string | undefined> {
    const workspace = this.options.workspace
    if (workspace?.pickDirectory !== undefined) {
      try {
        const picked = await workspace.pickDirectory()
        return picked ?? current
      } catch {
        return current
      }
    }
    // globalThis (not window): the guard must also hold in non-DOM lanes.
    const picker = (globalThis as typeof globalThis & {
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

  /** The session's current working directory, or undefined without the port. */
  readDefaultDirectory(): string | undefined {
    return this.options.workspace?.currentDirectory()
  }

  /**
   * The host build port for the dialog's one-click packaging, or undefined
   * when the host composition has no sdkwork-app-build plugin.
   */
  readBuildPort(): DeployHostBuild | undefined {
    return this.options.build
  }

  /**
   * Detect the SDKWork project shape under a directory: the full child set,
   * the `apps/` child set, and each app's own children (third listing level —
   * backs the dialog's build-output detection). Any listing failure degrades
   * to undefined; the dialog falls back to manual entry.
   */
  async inspectDirectory(path: string): Promise<DeployDirectoryInspection | undefined> {
    const workspace = this.options.workspace
    if (workspace?.listDirectory === undefined) return undefined
    const root = path.replace(/[/\\]+$/u, '')
    try {
      const rootListing = await workspace.listDirectory(root)
      const appsListing = await workspace.listDirectory(joinWorkspaceChild(root, 'apps'))
      if (rootListing === undefined || appsListing === undefined) return undefined
      const childDirectories = listingNames(rootListing)
      const appsChildDirectories = listingNames(appsListing)
      const surfaceChildDirectories: Record<string, string[]> = {}
      for (const name of appsChildDirectories) {
        const listing = await workspace.listDirectory(joinWorkspaceChild(joinWorkspaceChild(root, 'apps'), name))
        surfaceChildDirectories[name] = listing === undefined ? [] : listingNames(listing)
      }
      return { rootPath: root, childDirectories, appsChildDirectories, surfaceChildDirectories }
    } catch {
      return undefined
    }
  }

  /** Project the current IAM session user for the dialog identity chip. */
  readCurrentUser(): { id: string; displayName: string } | undefined {
    const user = this.options.iam.controller.getState().session?.user
    if (user === null || user === undefined) return undefined
    return { id: user.id, displayName: user.displayName ?? user.id }
  }

  /**
   * Read a governed text file through the workspace bridge. Degrades to
   * undefined without the port or on any failure — never interrupts the
   * dialog flow.
   */
  async readTextFile(path: string, signal?: AbortSignal): Promise<string | undefined> {
    const read = this.options.workspace?.readTextFile
    if (read === undefined) return undefined
    try {
      return await read(path, signal)
    } catch {
      return undefined
    }
  }

  /**
   * Write a governed text file through the workspace bridge, replacing any
   * previous content. Degrades to false without the port or on any failure.
   */
  async writeTextFile(path: string, content: string): Promise<boolean> {
    const write = this.options.workspace?.writeTextFile
    if (write === undefined) return false
    try {
      await write(path, content)
      return true
    } catch {
      return false
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

/** Entry names of a listing, hidden rows included (detection needs them). */
function listingNames(listing: DeployWorkspaceListing): string[] {
  return listing.entries.map(entry => entry.name)
}

/** Join one child segment onto a directory path (both separators tolerated). */
function joinWorkspaceChild(parent: string, child: string): string {
  return parent.endsWith('/') || parent.endsWith('\\') ? `${parent}${child}` : `${parent}/${child}`
}

/** Convenience: mount a host from the shared services and read the clients. */
export function createDeployHost(options: DeployHostOptions): DeployHost {
  const host = new DeployHost(options)
  host.mount()
  return host
}
