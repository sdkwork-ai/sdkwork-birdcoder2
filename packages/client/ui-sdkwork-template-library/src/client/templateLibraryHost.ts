/**
 * BirdCoder host adapter for the SDKWork App Store templates catalog.
 *
 * The adapter maps the shared ui-sdkwork-env, ui-sdkwork-iam, and locale services to
 * the embeddable `AppstoreMarketsSurface` inputs (page `templates`). Environment changes remount
 * the App Store runtime; IAM and locale changes propagate through host props.
 */
import { createElement, useSyncExternalStore, type FC, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import { TemplateLibraryEmptySurface } from './TemplateLibraryEmptySurface.tsx'
import css from './TemplateLibraryPage.module.css'
import '../../../../../../sdkwork-appstore/apps/sdkwork-appstore-pc/src/index.css'
import {
  AppstoreMarketsSurface,
  type AppstoreMarketsSurfaceSession,
} from '@sdkwork/appstore-pc-embed'
import { getSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'

/* jscpd:ignore-start -- the SDKWork host adapter is one deliberate template
   shared with ui-sdkwork-markets' marketsHost.ts and the other SDKWork
   surface packages: cross-package value imports are forbidden by the
   client-bundle purity gate, so each SDKWork surface package owns a copy of
   the session/port adaptation. */
/** Session data supplied to the SDKWork App Store runtime. */
export type TemplateLibraryHostSessionSnapshot = AppstoreMarketsSurfaceSession

/** Environment values consumed by the SDKWork host adapter. */
export interface TemplateLibraryHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller state consumed by the adapter. */
export interface TemplateLibraryHostIam {
  controller: {
    /** @returns the current session, when authenticated. */
    getState(): { session: TemplateLibraryHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Minimal locale runtime consumed by the adapter. */
export interface TemplateLibraryHostLocale {
  /** @returns the active BirdCoder locale id. */
  getSnapshot(): { active: string }
  /** Observe active-locale changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal theme runtime consumed by the adapter. */
export interface TemplateLibraryHostTheme {
  /** @returns the resolved host color scheme for the embedded catalog page. */
  getColorScheme(): 'light' | 'dark'
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
}

/** IAM session fields accepted by the SDKWork App Store session bridge. */
export interface TemplateLibraryHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  sessionId?: string
  user?: unknown
}

/** Dependencies used to configure the SDKWork surface. */
export interface ConfigureTemplateLibraryHostOptions {
  env: TemplateLibraryHostEnvironment
  iam: TemplateLibraryHostIam
  locale: TemplateLibraryHostLocale
  theme: TemplateLibraryHostTheme
}

function readHostUserId(session: TemplateLibraryHostSession | null | undefined): string | undefined {
  if (typeof session?.user !== 'object' || session.user === null || !('id' in session.user)) return undefined
  return typeof session.user.id === 'string' ? session.user.id.trim() : undefined
}

function stableJson(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value)
}

function hostSessionsEqual(
  left: TemplateLibraryHostSessionSnapshot | null,
  right: TemplateLibraryHostSessionSnapshot | null,
): boolean {
  if (left === right) return true
  if (left === null || right === null) return false
  return left.accessToken === right.accessToken
    && left.authToken === right.authToken
    && left.refreshToken === right.refreshToken
    && left.sessionId === right.sessionId
    && stableJson(left.user) === stableJson(right.user)
}

/** Snapshot consumed by the embedded catalog page renderer. */
export interface TemplateLibraryHostRenderSnapshot {
  environmentRevision: number
  apiBaseUrl: string
  accessToken: string
  locale: string
  session: TemplateLibraryHostSessionSnapshot | null
}

/**
 * Convert the host IAM state into SDKWork's session format.
 * The host forwards credentials only; the embedded surface derives identity
 * from JWT claims and lets session tokens supersede env bootstrap.
 * @param session - current host IAM session, or null when signed out.
 * @param staticAccessToken - ui-sdkwork-env access token used by non-interactive deployments.
 * @returns a credential snapshot, or null when no tokens are available.
 */
export function toTemplateLibrarySession(
  session: TemplateLibraryHostSession | null,
  staticAccessToken: string,
): TemplateLibraryHostSessionSnapshot | null {
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
export interface TemplateLibraryHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface TemplateLibraryHostRuntime extends TemplateLibraryHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number
  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): TemplateLibraryHostSessionSnapshot | null
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** @returns the render snapshot for the embedded host component. */
  getHostSnapshot(): TemplateLibraryHostRenderSnapshot
}

/** Host adapter implementation and SDKWork host prop owner. */
class TemplateLibraryHostRuntimeImpl implements TemplateLibraryHostRuntime {
  private readonly listeners = new Set<() => void>()
  private environmentRevision = 0
  private cachedSnapshot: TemplateLibraryHostRenderSnapshot | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private offLocale: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureTemplateLibraryHostOptions) {}

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
  readHostSession(): TemplateLibraryHostSessionSnapshot | null {
    return toTemplateLibrarySession(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** @returns the render snapshot for the embedded host component. */
  getHostSnapshot(): TemplateLibraryHostRenderSnapshot {
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

  /** @returns the host theme bridge for the embedded catalog page. */
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

let activeAdapter: TemplateLibraryHostRuntimeImpl | undefined

/** Configure the global SDKWork host adapter for the embedded templates page. */
export function configureTemplateLibraryHost(options: ConfigureTemplateLibraryHostOptions): TemplateLibraryHostAdapter {
  activeAdapter?.dispose()
  const adapter = new TemplateLibraryHostRuntimeImpl(options)
  activeAdapter = adapter
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createTemplateLibraryHostRuntime(
  options: ConfigureTemplateLibraryHostOptions,
): TemplateLibraryHostRuntime {
  return new TemplateLibraryHostRuntimeImpl(options)
}

/** Props for the embedded templates page renderer. */
export interface TemplateLibraryAppProps {
  /** Template Library namespace translate seat for the no-data surface. */
  t: TranslateNS<'template-library'>
}

/**
 * Render the SDKWork templates catalog through the configured host adapter.
 * With no configured gateway the adapter mounts no SDKWork runtime and the
 * unconfigured status panel keeps the page a complete themed surface.
 * @param props - the Template Library locale seat.
 * @returns the templates catalog element tree.
 */
export function TemplateLibraryApp(props: TemplateLibraryAppProps): ReactNode {
  const { t } = props
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-sdkwork-template-library: SDKWork host runtime is not configured')
  }
  const readSnapshot = (): TemplateLibraryHostRenderSnapshot => adapter.getHostSnapshot()
  const snapshot = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readSnapshot,
    readSnapshot,
  )
  if (snapshot.apiBaseUrl === '') {
    return createElement(TemplateLibraryEmptySurface, { t })
  }
  return createElement(
    SdkworkHostThemeSurface,
    {
      theme: adapter.readThemeBridge(),
      surface: 'template-library',
      // The shell root is the catalog's scroll container: the storefront page
      // and the frame's pageBody own none (see .catalogScroll in the page CSS).
      className: css.catalogScroll,
    },
    createElement(AppstoreMarketsSurface as FC, {
      key: snapshot.environmentRevision,
      page: 'templates',
      apiBaseUrl: snapshot.apiBaseUrl,
      ...(snapshot.accessToken === '' ? {} : { accessToken: snapshot.accessToken }),
      locale: snapshot.locale,
      ...(snapshot.session === null ? { session: null } : { session: snapshot.session }),
      // The embedded surface binds the shared global manager so every SDKWork
      // client in the app uses exactly one TokenManager instance.
      tokenManager: getSdkworkGlobalTokenManager(),
      resolveHostColorScheme: () => adapter.readThemeBridge().getColorScheme(),
      subscribeHostColorScheme: (listener: (scheme: 'light' | 'dark') => void) => {
        return adapter.readThemeBridge().subscribe(() => { listener(adapter.readThemeBridge().getColorScheme()) })
      },
    }),
  )
}
/* jscpd:ignore-end */
