/**
 * BirdCoder host adapter for the SDKWork Drive PC surface.
 *
 * The adapter owns generated client construction and maps the shared ui-env and
 * ui-iam services to SDKWork's host ports. The embedded view is remounted when
 * the API environment changes; IAM and locale changes flow through the ports.
 */
import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import '../../../../../../sdkwork-drive/apps/sdkwork-drive-pc/src/index.css'
import {
  configureDrivePcRuntime,
  DriveView,
  type DrivePcSdkPorts,
} from 'sdkwork-drive-pc-drive'
import { createClient, type SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import { createTokenManager, type AuthTokenManager } from '@sdkwork/sdk-common'

/* jscpd:ignore-start -- the SDKWork host adapter is one deliberate template
   shared with ui-knowledge's knowledgebaseHost.ts: cross-package value imports
   are forbidden by the client-bundle purity gate, so each SDKWork surface
   package owns a copy of the session/port adaptation. */
/** Session data supplied to the SDKWork Drive runtime. */
export interface DriveSessionSnapshot {
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

/** Environment values consumed by the SDKWork host adapter. */
export interface DriveHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller state consumed by the adapter. */
export interface DriveHostIam {
  controller: {
    /** @returns the current session, when authenticated. */
    getState(): { session: DriveHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Minimal locale runtime consumed by the adapter. */
export interface DriveHostLocale {
  /** @returns the active BirdCoder locale id. */
  getSnapshot(): { active: string }
  /** Observe active-locale changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal theme runtime consumed by the adapter. */
export interface DriveHostTheme {
  /** @returns the resolved host color scheme for the embedded Drive surface. */
  getColorScheme(): 'light' | 'dark'
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
}

/** IAM session fields accepted by the SDKWork Drive session bridge. */
export interface DriveHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  sessionId?: string
  user?: {
    id?: string
    displayName?: string
    email?: string
    avatar?: unknown
  }
  context?: {
    tenantId?: string
    userId?: string
    organizationId?: string | null
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
}

/** Dependencies used to configure the SDKWork surface. */
export interface ConfigureDriveHostOptions {
  env: DriveHostEnvironment
  iam: DriveHostIam
  locale: DriveHostLocale
  theme: DriveHostTheme
}

/**
 * Convert the host IAM state into SDKWork's session format.
 * Identity fields are derived inside SDKWork Drive from JWT claims; the host
 * forwards credentials only and lets session tokens supersede env bootstrap.
 * @param session - current host IAM session, or null when signed out.
 * @param staticAccessToken - ui-env access token used by non-interactive deployments.
 * @returns a credential snapshot, or null when no tokens are available.
 */
export function toDriveSession(
  session: DriveHostSession | null,
  staticAccessToken: string,
): DriveSessionSnapshot | null {
  const staticToken = staticAccessToken.trim()
  const iamAccessToken = session?.accessToken?.trim()
  const authToken = session?.authToken?.trim()
  const refreshToken = session?.refreshToken?.trim()
  const accessToken = iamAccessToken || staticToken
  if (!accessToken && !authToken && !refreshToken) return null

  const userId = session?.user?.id?.trim()
  const user = userId === undefined
    ? undefined
    : {
      id: userId,
      ...(session?.user?.displayName === undefined ? {} : { displayName: session.user.displayName }),
      ...(session?.user?.email === undefined ? {} : { email: session.user.email }),
      ...(typeof session?.user?.avatar === 'string' ? { avatarUrl: session.user.avatar } : {}),
    }

  return {
    ...(authToken ? { authToken } : {}),
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(session?.sessionId === undefined ? {} : { sessionId: session.sessionId }),
    ...(user === undefined ? {} : { user }),
  }
}

/** Lifecycle handle returned after configuring the SDKWork host. */
export interface DriveHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface DriveHostRuntime extends DriveHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number
  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): DriveSessionSnapshot | null
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** @returns the active host color scheme for the embedded Drive surface. */
  resolveHostColorScheme(): 'light' | 'dark'
  /** Subscribe SDKWork to host locale changes. */
  subscribeHostLanguage(listener: (language: string) => void): () => void
  /** Subscribe SDKWork to host color-scheme changes. */
  subscribeHostColorScheme(listener: (scheme: 'light' | 'dark') => void): () => void
}

/** Host adapter implementation and SDKWork port owner. */
class DriveHostRuntimeImpl implements DriveHostRuntime {
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private driveClient: SdkworkDriveAppClient | undefined
  private clientBaseUrl: string | undefined
  private environmentRevision = 0
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureDriveHostOptions) {
    this.tokenManager = createTokenManager()
  }

  /** Start subscriptions and return the disposer for the plugin effect. */
  start(): () => void {
    this.syncTokens()
    this.offEnvironment = this.options.env.subscribe(() => {
      this.driveClient = undefined
      this.clientBaseUrl = undefined
      this.environmentRevision += 1
      this.syncTokens()
      this.publish()
    })
    this.offIam = this.options.iam.controller.subscribe(() => {
      this.syncTokens()
      this.publish()
    })
    return () => { this.dispose() }
  }

  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number {
    return this.environmentRevision
  }

  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): DriveSessionSnapshot | null {
    return toDriveSession(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** @returns the resolved host color scheme for the embedded Drive surface. */
  resolveHostColorScheme(): 'light' | 'dark' {
    return this.options.theme.getColorScheme()
  }

  /** Subscribe SDKWork to host locale changes. */
  subscribeHostLanguage(listener: (language: string) => void): () => void {
    return this.options.locale.subscribe(() => { listener(this.resolveHostLanguage()) })
  }

  /** Subscribe SDKWork to host color-scheme changes. */
  subscribeHostColorScheme(listener: (scheme: 'light' | 'dark') => void): () => void {
    return this.options.theme.subscribe(() => { listener(this.resolveHostColorScheme()) })
  }

  /** Dispose subscriptions and prevent later adapter notifications. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.offEnvironment = undefined
    this.offIam = undefined
    this.listeners.clear()
    if (activeAdapter === this) activeAdapter = undefined
  }

  /** Build or reuse the generated Drive app client. */
  private readDriveClient(): SdkworkDriveAppClient {
    const baseUrl = this.readBaseUrl()
    this.syncTokens()
    if (this.driveClient === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.driveClient = createClient({
        authMode: 'dual-token',
        baseUrl,
        tokenManager: this.tokenManager,
      })
    }
    return this.driveClient
  }

  private readBaseUrl(): string {
    const baseUrl = this.options.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-drive: SDKWork base URL is not configured')
    return baseUrl
  }

  private syncTokens(): void {
    const session = this.options.iam.controller.getState().session
    const staticAccessToken = this.options.env.accessToken().trim()
    if (session?.accessToken || session?.authToken || session?.refreshToken) {
      this.tokenManager.setTokens({
        ...(session.accessToken === undefined ? {} : { accessToken: session.accessToken.trim() }),
        ...(session.authToken === undefined ? {} : { authToken: session.authToken.trim() }),
        ...(session.refreshToken === undefined ? {} : { refreshToken: session.refreshToken.trim() }),
      })
      return
    }
    if (staticAccessToken !== '') {
      this.tokenManager.clearTokens()
      this.tokenManager.setAccessToken(staticAccessToken)
      return
    }
    this.tokenManager.clearTokens()
  }

  private publish(): void {
    /* v8 ignore next 2 -- disposed guard: dispose() unsubscribes both
       sources first, so no callback can reach publish after disposal. */
    if (this.disposed) return
    for (const listener of this.listeners) listener()
  }

  /** Build the SDKWork ports consumed by the embedded host surface. */
  ports(): DrivePcSdkPorts {
    return {
      getDriveClient: () => this.readDriveClient(),
      readHostSession: () => this.readHostSession(),
      subscribeHostSession: (listener: () => void) => {
        const offEnv = this.options.env.subscribe(listener)
        const offIam = this.options.iam.controller.subscribe(listener)
        return () => {
          offEnv()
          offIam()
        }
      },
      resolveHostLanguage: () => this.resolveHostLanguage(),
      subscribeHostLanguage: (listener: (language: string) => void) => this.subscribeHostLanguage(listener),
      resolveHostColorScheme: () => this.resolveHostColorScheme(),
      subscribeHostColorScheme: (listener: (scheme: 'light' | 'dark') => void) => this.subscribeHostColorScheme(listener),
    }
  }
}

let activeAdapter: DriveHostRuntimeImpl | undefined

/** Configure the global SDKWork runtime ports for the embedded Drive. */
export function configureDriveHost(options: ConfigureDriveHostOptions): DriveHostAdapter {
  activeAdapter?.dispose()
  const adapter = new DriveHostRuntimeImpl(options)
  activeAdapter = adapter
  configureDrivePcRuntime({ sdkPorts: adapter.ports() })
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createDriveHostRuntime(
  options: ConfigureDriveHostOptions,
): DriveHostRuntime {
  return new DriveHostRuntimeImpl(options)
}

/** Render the SDKWork Drive surface through the configured host adapter. */
export function DriveApp(): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-drive: SDKWork host runtime is not configured')
  }
  // The same snapshot serves the client and the server-render fallback: the
  // revision is a plain number, so one function identity is enough.
  const readEnvironmentRevision = (): number => adapter.getEnvironmentRevision()
  const environmentRevision = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readEnvironmentRevision,
    readEnvironmentRevision,
  )
  // The Drive surface builds its runtime once per mount; keying the view by
  // the environment revision remounts it when the client base URL changes.
  return createElement(DriveView, { key: environmentRevision })
}
/* jscpd:ignore-end */
