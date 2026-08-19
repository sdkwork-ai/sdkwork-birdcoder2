/**
 * BirdCoder host adapter for the SDKWork Agents assets (资产) PC surface.
 *
 * The adapter maps the shared ui-env and ui-iam services to the Agents PC
 * session store and Drive SDK client provider. The embedded {@link AssetsView}
 * is remounted when the API environment changes; IAM and locale changes flow
 * through the session bridge.
 */
import { Suspense, createElement, lazy, useSyncExternalStore, type ReactNode } from 'react'
import {
  defineSdkworkI18nRuntimeConfig,
  SdkworkI18nProvider,
} from '@sdkwork/i18n-pc-react'
import { agentsWorkbenchI18nCatalogs } from '@sdkwork/agents-pc-commons/i18n'
import { configureDriveAppSdkClientProvider } from '@sdkwork/agents-pc-core/sdk/driveAppSdkClient'
import {
  clearAppSdkSessionTokens,
  createSdkworkChatRequestContextInterceptors,
  persistAppSdkSessionTokens,
  type SdkworkChatSession,
} from '@sdkwork/agents-pc-core/session'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-iam/sdkwork-global-token-manager'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import { createClient as createDriveClient } from '@sdkwork/drive-app-sdk'
import '../../../../../../sdkwork-agents/apps/sdkwork-agents-pc/src/index.css'

const AssetsView = lazy(async () => {
  const module = await import('@sdkwork/agents-pc-assets')
  return { default: module.AssetsView }
})

const APP_API_SUFFIX = '/app/v3/api'

const agentsI18nRuntimeConfig = defineSdkworkI18nRuntimeConfig({
  activeLocales: ['en-US', 'zh-CN'],
  defaultLocale: 'en-US',
  fallbackLocale: 'en-US',
  loadingStrategy: 'eager-core-lazy-feature',
  supportedLocales: ['en-US', 'zh-CN'],
})

/** Environment values consumed by the SDKWork host adapter. */
export interface AssetsHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller state consumed by the adapter. */
export interface AssetsHostIam {
  controller: {
    /** @returns the current session, when authenticated. */
    getState(): { session: AssetsHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Minimal locale runtime consumed by the adapter. */
export interface AssetsHostLocale {
  /** @returns the active BirdCoder locale id. */
  getSnapshot(): { active: string }
  /** Observe active-locale changes. */
  subscribe(listener: () => void): () => void
}

/** IAM session fields accepted by the Agents PC session bridge. */
export interface AssetsHostSession {
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
}

/** Minimal theme runtime consumed by the adapter. */
export interface AssetsHostTheme extends HostThemeBridge {}

/** Dependencies used to configure the SDKWork surface. */
export interface ConfigureAssetsHostOptions {
  env: AssetsHostEnvironment
  iam: AssetsHostIam
  locale: AssetsHostLocale
  theme: AssetsHostTheme
}

/**
 * Normalize the gateway origin for SDKWork app clients.
 * @param baseUrl - active API gateway origin from ui-env.
 * @returns the gateway root without a duplicated app API suffix.
 */
export function normalizeAssetsGatewayBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/u, '')
  if (normalized.endsWith(APP_API_SUFFIX)) {
    return normalized.slice(0, -APP_API_SUFFIX.length) || normalized
  }
  return normalized
}

/**
 * Convert the host IAM state into the Agents PC session format.
 * Identity fields are resolved inside Agents PC from JWT claims; the host
 * forwards credentials only and lets session tokens supersede env bootstrap.
 * @param session - current host IAM session, or null when signed out.
 * @param staticAccessToken - ui-env access token used by non-interactive deployments.
 * @returns a credential snapshot, or null when no tokens are available.
 */
export function toAssetsSession(
  session: AssetsHostSession | null,
  staticAccessToken: string,
): SdkworkChatSession | null {
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
      ...(typeof session?.user?.avatar === 'string' ? { avatar: session.user.avatar } : {}),
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
export interface AssetsHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface AssetsHostRuntime extends AssetsHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
}

/** Host adapter implementation and SDKWork client owner. */
class AssetsHostRuntimeImpl implements AssetsHostRuntime {
  private readonly listeners = new Set<() => void>()
  private environmentRevision = 0
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureAssetsHostOptions) {}

  /** Start subscriptions and return the disposer for the plugin effect. */
  start(): () => void {
    this.syncSessionAndClients()
    this.offEnvironment = this.options.env.subscribe(() => {
      this.environmentRevision += 1
      this.syncSessionAndClients()
      this.publish()
    })
    this.offIam = this.options.iam.controller.subscribe(() => {
      this.syncSessionAndClients()
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

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** @returns the host theme bridge for the embedded assets surface. */
  readThemeBridge(): HostThemeBridge {
    return this.options.theme
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

  private syncSessionAndClients(): void {
    const baseUrl = normalizeAssetsGatewayBaseUrl(this.options.env.apiBaseUrl())
    if (baseUrl === '') {
      clearAppSdkSessionTokens()
      syncSdkworkGlobalTokenManager(null, '')
      return
    }

    const iamSession = this.options.iam.controller.getState().session
    const staticAccessToken = this.options.env.accessToken().trim()
    const session = toAssetsSession(iamSession, staticAccessToken)
    syncSdkworkGlobalTokenManager(iamSession, staticAccessToken)
    const tokenManager = getSdkworkGlobalTokenManager()
    const readSession = (): SdkworkChatSession | null => toAssetsSession(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )

    if (session?.authToken && session.accessToken) {
      try {
        persistAppSdkSessionTokens(session)
      } catch {
        clearAppSdkSessionTokens()
      }
    } else {
      clearAppSdkSessionTokens()
    }

    const interceptors = createSdkworkChatRequestContextInterceptors(readSession)
    configureDriveAppSdkClientProvider(() => createDriveClient({
      baseUrl: `${baseUrl}${APP_API_SUFFIX}`,
      authMode: 'dual-token',
      platform: 'pc',
      tokenManager,
      interceptors,
    }))
  }

  private publish(): void {
    if (this.disposed) return
    for (const listener of this.listeners) listener()
  }
}

let activeAdapter: AssetsHostRuntimeImpl | undefined

/** Configure the Agents PC Drive SDK provider for the embedded assets surface. */
export function configureAssetsHost(options: ConfigureAssetsHostOptions): AssetsHostAdapter {
  activeAdapter?.dispose()
  const adapter = new AssetsHostRuntimeImpl(options)
  activeAdapter = adapter
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createAssetsHostRuntime(
  options: ConfigureAssetsHostOptions,
): AssetsHostRuntime {
  return new AssetsHostRuntimeImpl(options)
}

/** Render the SDKWork Agents assets surface through the configured host adapter. */
export function AssetsApp(): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-generations-assets: SDKWork assets host runtime is not configured')
  }
  const readEnvironmentRevision = (): number => adapter.getEnvironmentRevision()
  const environmentRevision = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readEnvironmentRevision,
    readEnvironmentRevision,
  )
  const locale = adapter.resolveHostLanguage()
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: 'agents-assets' },
    createElement(
      SdkworkI18nProvider,
      {
        key: `${environmentRevision}:${locale}`,
        catalogs: agentsWorkbenchI18nCatalogs,
        config: agentsI18nRuntimeConfig,
        locale,
        syncDocumentLanguage: false,
      },
      createElement(
        Suspense,
        { fallback: createElement('div', { className: 'flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400' }, '正在加载资产页…') },
        createElement(AssetsView, { key: environmentRevision }),
      ),
    ),
  )
}
