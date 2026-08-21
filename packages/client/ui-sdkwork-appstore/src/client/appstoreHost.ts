/**
 * BirdCoder host adapter for the SDKWork App Store PC surface.
 *
 * The adapter maps the shared ui-sdkwork-env, ui-sdkwork-iam, and locale services to the
 * embeddable `@sdkwork/appstore-pc-host` inputs. Environment changes remount
 * the SDKWork runtime; IAM and locale changes propagate through host props.
 */
import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import '../../../../../../sdkwork-appstore/apps/sdkwork-appstore-pc/src/index.css'
import {
  AppstorePcHost,
  type AppstorePcHostSession,
} from '@sdkwork/appstore-pc-host'

/* jscpd:ignore-start -- the SDKWork host adapter is one deliberate template
   shared with ui-sdkwork-drive's driveHost.ts and ui-sdkwork-knowledge's knowledgebaseHost.ts:
   cross-package value imports are forbidden by the client-bundle purity gate,
   so each SDKWork surface package owns a copy of the session/port adaptation. */
/** Session data supplied to the SDKWork App Store runtime. */
export type AppstoreHostSessionSnapshot = AppstorePcHostSession

/** Environment values consumed by the SDKWork host adapter. */
export interface AppstoreHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller state consumed by the adapter. */
export interface AppstoreHostIam {
  controller: {
    /** @returns the current session, when authenticated. */
    getState(): { session: AppstoreHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Minimal locale runtime consumed by the adapter. */
export interface AppstoreHostLocale {
  /** @returns the active BirdCoder locale id. */
  getSnapshot(): { active: string }
  /** Observe active-locale changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal theme runtime consumed by the adapter. */
export interface AppstoreHostTheme {
  /** @returns the resolved host color scheme for the embedded App Store surface. */
  getColorScheme(): 'light' | 'dark'
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
}

/** IAM session fields accepted by the SDKWork App Store session bridge. */
export interface AppstoreHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  sessionId?: string
  user?: unknown
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
export interface ConfigureAppstoreHostOptions {
  env: AppstoreHostEnvironment
  iam: AppstoreHostIam
  locale: AppstoreHostLocale
  theme: AppstoreHostTheme
}

function readHostUserId(session: AppstoreHostSession | null | undefined): string | undefined {
  if (typeof session?.user !== 'object' || session.user === null || !('id' in session.user)) return undefined
  return typeof session.user.id === 'string' ? session.user.id.trim() : undefined
}

function stableJson(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value)
}

function hostSessionsEqual(
  left: AppstoreHostSessionSnapshot | null,
  right: AppstoreHostSessionSnapshot | null,
): boolean {
  if (left === right) return true
  if (left === null || right === null) return false
  return left.accessToken === right.accessToken
    && left.authToken === right.authToken
    && left.refreshToken === right.refreshToken
    && left.sessionId === right.sessionId
    && stableJson(left.user) === stableJson(right.user)
}

/** Snapshot consumed by the embedded App Store host component. */
export interface AppstoreHostRenderSnapshot {
  environmentRevision: number
  apiBaseUrl: string
  accessToken: string
  locale: string
  session: AppstoreHostSessionSnapshot | null
}

/**
 * Convert the host IAM state into SDKWork's session format.
 * Identity fields are derived inside SDKWork App Store from JWT claims; the host
 * forwards credentials only and lets session tokens supersede env bootstrap.
 * @param session - current host IAM session, or null when signed out.
 * @param staticAccessToken - ui-sdkwork-env access token used by non-interactive deployments.
 * @returns a credential snapshot, or null when no tokens are available.
 */
export function toAppstoreSession(
  session: AppstoreHostSession | null,
  staticAccessToken: string,
): AppstoreHostSessionSnapshot | null {
  const staticToken = staticAccessToken.trim()
  const iamAccessToken = session?.accessToken?.trim()
  const authToken = session?.authToken?.trim()
  const refreshToken = session?.refreshToken?.trim()
  const accessToken = iamAccessToken || staticToken
  if (!accessToken && !authToken && !refreshToken) return null

  const userId = readHostUserId(session)
  const user = userId === undefined
    ? session?.user
    : (typeof session?.user === 'object' && session.user !== null && 'id' in session.user
      ? session.user
      : { id: userId })

  return {
    ...(authToken ? { authToken } : {}),
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(session?.sessionId === undefined ? {} : { sessionId: session.sessionId }),
    ...(user === undefined ? {} : { user }),
  }
}

/** Lifecycle handle returned after configuring the SDKWork host. */
export interface AppstoreHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface AppstoreHostRuntime extends AppstoreHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number
  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): AppstoreHostSessionSnapshot | null
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** @returns the active host color scheme for the embedded App Store surface. */
  resolveHostColorScheme(): 'light' | 'dark'
  /** Subscribe SDKWork to host color-scheme changes. */
  subscribeHostColorScheme(listener: (scheme: 'light' | 'dark') => void): () => void
  /** @returns the render snapshot for the embedded host component. */
  getHostSnapshot(): AppstoreHostRenderSnapshot
}

/** Host adapter implementation and SDKWork host prop owner. */
class AppstoreHostRuntimeImpl implements AppstoreHostRuntime {
  private readonly listeners = new Set<() => void>()
  private environmentRevision = 0
  private cachedSnapshot: AppstoreHostRenderSnapshot | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private offLocale: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureAppstoreHostOptions) {}

  /** Start subscriptions and return the disposer for the plugin effect. */
  start(): () => void {
    this.offEnvironment = this.options.env.subscribe(() => {
      this.environmentRevision += 1
      this.publish()
    })
    this.offIam = this.options.iam.controller.subscribe(() => { this.publish() })
    this.offLocale = this.options.locale.subscribe(() => { this.publish() })
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
  readHostSession(): AppstoreHostSessionSnapshot | null {
    return toAppstoreSession(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** @returns the active host color scheme for the embedded App Store surface. */
  resolveHostColorScheme(): 'light' | 'dark' {
    return this.options.theme.getColorScheme()
  }

  /** Subscribe SDKWork to host color-scheme changes. */
  subscribeHostColorScheme(listener: (scheme: 'light' | 'dark') => void): () => void {
    return this.options.theme.subscribe(() => { listener(this.resolveHostColorScheme()) })
  }

  /** @returns the render snapshot for the embedded host component. */
  getHostSnapshot(): AppstoreHostRenderSnapshot {
    const apiBaseUrl = this.options.env.apiBaseUrl().trim()
    const staticAccessToken = this.options.env.accessToken().trim()
    const iamSession = this.options.iam.controller.getState().session
    const session = this.readHostSession()
    const accessToken = iamSession?.accessToken?.trim() ? '' : staticAccessToken
    const locale = this.resolveHostLanguage()
    const cached = this.cachedSnapshot
    if (
      cached !== undefined
      && cached.environmentRevision === this.environmentRevision
      && cached.apiBaseUrl === apiBaseUrl
      && cached.accessToken === accessToken
      && cached.locale === locale
      && hostSessionsEqual(cached.session, session)
    ) {
      return cached
    }
    this.cachedSnapshot = {
      environmentRevision: this.environmentRevision,
      apiBaseUrl,
      accessToken,
      locale,
      session,
    }
    return this.cachedSnapshot
  }

  /** @returns the host theme bridge for the embedded App Store surface. */
  readThemeBridge(): HostThemeBridge {
    return this.options.theme
  }

  /** Dispose subscriptions and prevent later adapter notifications. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.offLocale?.()
    this.offEnvironment = undefined
    this.offIam = undefined
    this.offLocale = undefined
    this.listeners.clear()
    if (activeAdapter === this) activeAdapter = undefined
  }

  private publish(): void {
    /* v8 ignore next 2 -- disposed guard: dispose() unsubscribes all
       sources first, so no callback can reach publish after disposal. */
    if (this.disposed) return
    this.cachedSnapshot = undefined
    for (const listener of this.listeners) listener()
  }
}

let activeAdapter: AppstoreHostRuntimeImpl | undefined

/** Configure the global SDKWork host adapter for the embedded App Store. */
export function configureAppstoreHost(options: ConfigureAppstoreHostOptions): AppstoreHostAdapter {
  activeAdapter?.dispose()
  const adapter = new AppstoreHostRuntimeImpl(options)
  activeAdapter = adapter
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createAppstoreHostRuntime(
  options: ConfigureAppstoreHostOptions,
): AppstoreHostRuntime {
  return new AppstoreHostRuntimeImpl(options)
}

/** Render the SDKWork App Store surface through the configured host adapter. */
export function AppstoreApp(): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-sdkwork-appstore: SDKWork host runtime is not configured')
  }
  const readSnapshot = (): AppstoreHostRenderSnapshot => adapter.getHostSnapshot()
  const snapshot = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readSnapshot,
    readSnapshot,
  )
  if (snapshot.apiBaseUrl === '') {
    return null
  }
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: 'appstore' },
    createElement(AppstorePcHost, {
      key: snapshot.environmentRevision,
      apiBaseUrl: snapshot.apiBaseUrl,
      ...(snapshot.accessToken === '' ? {} : { accessToken: snapshot.accessToken }),
      locale: snapshot.locale,
      ...(snapshot.session === null ? { session: null } : { session: snapshot.session }),
      initialPath: '/',
      resolveHostColorScheme: () => adapter.resolveHostColorScheme(),
      subscribeHostColorScheme: (listener: (scheme: 'light' | 'dark') => void) => adapter.subscribeHostColorScheme(listener),
    }),
  )
}
/* jscpd:ignore-end */
