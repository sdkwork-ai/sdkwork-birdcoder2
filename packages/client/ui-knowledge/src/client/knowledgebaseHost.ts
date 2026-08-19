/**
 * BirdCoder host adapter for the SDKWork Knowledge Base PC surface.
 *
 * The adapter owns generated client construction and maps the shared ui-env and
 * ui-iam services to SDKWork's host ports. The embedded view is remounted when
 * the API environment changes; IAM and locale changes flow through the ports.
 */
import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import '../../../../../../sdkwork-knowledgebase/apps/sdkwork-knowledgebase-pc/src/index.css'
import {
  configureKnowledgebasePcRuntime,
  KnowledgebaseHostSurface,
} from '@sdkwork/knowledgebase-pc-knowledge'
import { createKnowledgebaseAppClient, type SdkworkKnowledgebaseAppClient } from '@sdkwork/knowledgebase-app-sdk'
import { createClient as createDriveClient, type SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-iam/sdkwork-global-token-manager'

/** Session data supplied to the SDKWork Knowledge Base runtime. */
export interface KnowledgebaseSessionSnapshot {
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
    iamDeploymentMode?: string
    authLevel?: string
    dataScope?: string[]
    permissionScope?: string[]
    actorId?: string
    actorKind?: string
    deviceId?: string
  }
}

/** Environment values consumed by the SDKWork host adapter. */
export interface KnowledgebaseHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller state consumed by the adapter. */
export interface KnowledgebaseHostIam {
  controller: {
    /** @returns the current session, when authenticated. */
    getState(): { session: KnowledgebaseHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Minimal locale runtime consumed by the adapter. */
export interface KnowledgebaseHostLocale {
  /** @returns the active BirdCoder locale id. */
  getSnapshot(): { active: string }
  /** Observe active-locale changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal theme runtime consumed by the adapter. */
export interface KnowledgebaseHostTheme {
  /** @returns the resolved host color scheme for the embedded Knowledge Base surface. */
  getColorScheme(): 'light' | 'dark'
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
}

/** IAM session fields accepted by the SDKWork Knowledge Base session bridge. */
export interface KnowledgebaseHostSession {
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
export interface ConfigureKnowledgebaseHostOptions {
  env: KnowledgebaseHostEnvironment
  iam: KnowledgebaseHostIam
  locale: KnowledgebaseHostLocale
  theme: KnowledgebaseHostTheme
}

/**
 * Convert the host IAM state into SDKWork's session format.
 * Identity fields are derived inside SDKWork Knowledge Base from JWT claims; the
 * host forwards credentials only and lets session tokens supersede env bootstrap.
 * @param session - current host IAM session, or null when signed out.
 * @param staticAccessToken - ui-env access token used by non-interactive deployments.
 * @returns a credential snapshot, or null when no tokens are available.
 */
export function toKnowledgebaseSession(
  session: KnowledgebaseHostSession | null,
  staticAccessToken: string,
): KnowledgebaseSessionSnapshot | null {
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
export interface KnowledgebaseHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface KnowledgebaseHostRuntime extends KnowledgebaseHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number
  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): KnowledgebaseSessionSnapshot | null
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** @returns the active host color scheme for the embedded Knowledge Base surface. */
  resolveHostColorScheme(): 'light' | 'dark'
  /** Subscribe SDKWork to host color-scheme changes. */
  subscribeHostColorScheme(listener: (scheme: 'light' | 'dark') => void): () => void
  /** Subscribe SDKWork to host locale changes. */
  subscribeHostLanguage(listener: (language: string) => void): () => void
}

/** Host adapter implementation and SDKWork port owner. */
class KnowledgebaseHostRuntimeImpl implements KnowledgebaseHostRuntime {
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private knowledgebaseClient: SdkworkKnowledgebaseAppClient | undefined
  private driveClient: SdkworkDriveAppClient | undefined
  private clientBaseUrl: string | undefined
  private environmentRevision = 0
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureKnowledgebaseHostOptions) {
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Start subscriptions and return the disposer for the plugin effect. */
  start(): () => void {
    this.syncTokens()
    this.offEnvironment = this.options.env.subscribe(() => {
      this.knowledgebaseClient = undefined
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
  readHostSession(): KnowledgebaseSessionSnapshot | null {
    return toKnowledgebaseSession(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** @returns the active host color scheme for the embedded Knowledge Base surface. */
  resolveHostColorScheme(): 'light' | 'dark' {
    return this.options.theme.getColorScheme()
  }

  /** Subscribe SDKWork to host color-scheme changes. */
  subscribeHostColorScheme(listener: (scheme: 'light' | 'dark') => void): () => void {
    return this.options.theme.subscribe(() => { listener(this.resolveHostColorScheme()) })
  }

  /** Subscribe SDKWork to host locale changes. */
  subscribeHostLanguage(listener: (language: string) => void): () => void {
    return this.options.locale.subscribe(() => { listener(this.resolveHostLanguage()) })
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

  /** Build or reuse the generated Knowledgebase app client. */
  private readKnowledgebaseClient(): SdkworkKnowledgebaseAppClient {
    const baseUrl = this.readBaseUrl()
    this.syncTokens()
    if (this.knowledgebaseClient === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.knowledgebaseClient = createKnowledgebaseAppClient({
        authMode: 'dual-token',
        baseUrl,
        tokenManager: this.tokenManager,
      })
    }
    return this.knowledgebaseClient
  }

  /** Build or reuse the generated Drive app client. */
  private readDriveClient(): SdkworkDriveAppClient {
    const baseUrl = this.readBaseUrl()
    this.syncTokens()
    if (this.driveClient === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.driveClient = createDriveClient({
        authMode: 'dual-token',
        baseUrl,
        tokenManager: this.tokenManager,
      })
    }
    return this.driveClient
  }

  private readBaseUrl(): string {
    const baseUrl = this.options.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-knowledge: SDKWork base URL is not configured')
    return baseUrl
  }

  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  /** @returns the host theme bridge for the embedded Knowledge Base surface. */
  readThemeBridge(): HostThemeBridge {
    return this.options.theme
  }

  private publish(): void {
    if (this.disposed) return
    for (const listener of this.listeners) listener()
  }

  /** Build the SDKWork ports consumed by the embedded host surface. */
  ports() {
    return {
      getKnowledgebaseClient: () => this.readKnowledgebaseClient(),
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

let activeAdapter: KnowledgebaseHostRuntimeImpl | undefined

/** Configure the global SDKWork runtime ports for the embedded Knowledge Base. */
export function configureKnowledgebaseHost(options: ConfigureKnowledgebaseHostOptions): KnowledgebaseHostAdapter {
  activeAdapter?.dispose()
  const adapter = new KnowledgebaseHostRuntimeImpl(options)
  activeAdapter = adapter
  configureKnowledgebasePcRuntime({ sdkPorts: adapter.ports() })
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createKnowledgebaseHostRuntime(
  options: ConfigureKnowledgebaseHostOptions,
): KnowledgebaseHostRuntime {
  return new KnowledgebaseHostRuntimeImpl(options)
}

/** Render the SDKWork Knowledge Base surface through the configured host adapter. */
export function KnowledgebaseApp(): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-knowledge: SDKWork host runtime is not configured')
  }
  const environmentRevision = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    () => adapter.getEnvironmentRevision(),
    () => adapter.getEnvironmentRevision(),
  )
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: 'knowledge' },
    createElement(
      MemoryRouter,
      { initialEntries: ['/'], key: environmentRevision },
      createElement(KnowledgebaseHostSurface, { presentationMode: 'inline' }),
    ),
  )
}
