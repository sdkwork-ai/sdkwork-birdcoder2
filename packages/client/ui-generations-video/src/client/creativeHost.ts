/**
 * BirdCoder host adapter for the SDKWork Agents creative (生成) PC surface.
 *
 * The adapter owns generated client construction and maps the shared ui-env and
 * ui-iam services to the Agents PC session store and SDK client providers.
 * The embedded {@link CreativeView} is remounted when the API environment
 * changes; IAM and locale changes flow through the session bridge.
 */
import { Suspense, createElement, lazy, useSyncExternalStore, type ReactNode } from 'react'
import {
  defineSdkworkI18nRuntimeConfig,
  SdkworkI18nProvider,
} from '@sdkwork/i18n-pc-react'
import { agentsWorkbenchI18nCatalogs } from '@sdkwork/agents-pc-commons/i18n'
import { configureDriveAppSdkClientProvider } from '@sdkwork/agents-pc-core/sdk/driveAppSdkClient'
import { configureGenerationsAppSdkClientProvider } from '@sdkwork/agents-pc-core/sdk/generationsAppSdkClient'
import {
  clearAppSdkSessionTokens,
  createSdkworkChatRequestContextInterceptors,
  getSdkworkChatGlobalTokenManager,
  persistAppSdkSessionTokens,
  type SdkworkChatSession,
} from '@sdkwork/agents-pc-core/session'
import { createClient as createDriveClient } from '@sdkwork/drive-app-sdk'
import { createClient as createGenerationsClient } from '@sdkwork/generations-app-sdk'
import '../../../../../../sdkwork-agents/apps/sdkwork-agents-pc/src/index.css'

const CreativeView = lazy(async () => {
  const module = await import('@sdkwork/agents-pc-creative')
  return { default: module.CreativeView }
})

const APP_API_SUFFIX = '/app/v3/api'
const DEFAULT_CREATION_MODE = 'video'

const agentsI18nRuntimeConfig = defineSdkworkI18nRuntimeConfig({
  activeLocales: ['en-US', 'zh-CN'],
  defaultLocale: 'en-US',
  fallbackLocale: 'en-US',
  loadingStrategy: 'eager-core-lazy-feature',
  supportedLocales: ['en-US', 'zh-CN'],
})

/** Environment values consumed by the SDKWork host adapter. */
export interface CreativeHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** @returns the IAM tenant application id for the active profile. */
  appId(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller state consumed by the adapter. */
export interface CreativeHostIam {
  controller: {
    /** @returns the current session, when authenticated. */
    getState(): { session: CreativeHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Minimal locale runtime consumed by the adapter. */
export interface CreativeHostLocale {
  /** @returns the active BirdCoder locale id. */
  getSnapshot(): { active: string }
  /** Observe active-locale changes. */
  subscribe(listener: () => void): () => void
}

/** IAM session fields accepted by the Agents PC session bridge. */
export interface CreativeHostSession {
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
export interface ConfigureCreativeHostOptions {
  env: CreativeHostEnvironment
  iam: CreativeHostIam
  locale: CreativeHostLocale
}

/**
 * Normalize the gateway origin for SDKWork app clients.
 * @param baseUrl - active API gateway origin from ui-env.
 * @returns the gateway root without a duplicated app API suffix.
 */
export function normalizeCreativeGatewayBaseUrl(baseUrl: string): string {
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
export function toCreativeSession(
  session: CreativeHostSession | null,
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
export interface CreativeHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface CreativeHostRuntime extends CreativeHostAdapter {
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
class CreativeHostRuntimeImpl implements CreativeHostRuntime {
  private readonly listeners = new Set<() => void>()
  private environmentRevision = 0
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureCreativeHostOptions) {}

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
    const baseUrl = normalizeCreativeGatewayBaseUrl(this.options.env.apiBaseUrl())
    if (baseUrl === '') {
      clearAppSdkSessionTokens()
      return
    }

    const iamSession = this.options.iam.controller.getState().session
    const staticAccessToken = this.options.env.accessToken().trim()
    const session = toCreativeSession(iamSession, staticAccessToken)
    const tokenManager = getSdkworkChatGlobalTokenManager()
    const readSession = (): SdkworkChatSession | null => toCreativeSession(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )

    if (iamSession?.accessToken || iamSession?.authToken || iamSession?.refreshToken) {
      if (session?.authToken && session.accessToken) {
        try {
          persistAppSdkSessionTokens(session)
        } catch {
          clearAppSdkSessionTokens()
          tokenManager.setTokens({
            ...(session.accessToken ? { accessToken: session.accessToken } : {}),
            ...(session.authToken ? { authToken: session.authToken } : {}),
            ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
          })
        }
      } else {
        clearAppSdkSessionTokens()
        tokenManager.setTokens({
          ...(session?.accessToken ? { accessToken: session.accessToken } : {}),
          ...(session?.authToken ? { authToken: session.authToken } : {}),
          ...(session?.refreshToken ? { refreshToken: session.refreshToken } : {}),
        })
      }
    } else if (staticAccessToken !== '') {
      clearAppSdkSessionTokens()
      tokenManager.setAccessToken(staticAccessToken)
    } else {
      clearAppSdkSessionTokens()
    }

    const interceptors = createSdkworkChatRequestContextInterceptors(readSession)
    configureGenerationsAppSdkClientProvider(() => createGenerationsClient({
      baseUrl,
      platform: 'pc',
      tokenManager,
      interceptors,
    }))
    configureDriveAppSdkClientProvider(() => createDriveClient({
      baseUrl: `${baseUrl}${APP_API_SUFFIX}`,
      authMode: 'dual-token',
      platform: 'pc',
      tokenManager,
      interceptors,
    }))
  }

  private readBaseUrl(): string {
    const baseUrl = normalizeCreativeGatewayBaseUrl(this.options.env.apiBaseUrl())
    if (baseUrl === '') throw new Error('ui-generations-video: SDKWork base URL is not configured')
    return baseUrl
  }

  private publish(): void {
    if (this.disposed) return
    for (const listener of this.listeners) listener()
  }
}

let activeAdapter: CreativeHostRuntimeImpl | undefined

/** Configure the Agents PC SDK providers for the embedded creative surface. */
export function configureCreativeHost(options: ConfigureCreativeHostOptions): CreativeHostAdapter {
  activeAdapter?.dispose()
  const adapter = new CreativeHostRuntimeImpl(options)
  activeAdapter = adapter
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createCreativeHostRuntime(
  options: ConfigureCreativeHostOptions,
): CreativeHostRuntime {
  return new CreativeHostRuntimeImpl(options)
}

/** Render the SDKWork Agents creative surface through the configured host adapter. */
export function CreativeApp(): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-generations-video: SDKWork creative host runtime is not configured')
  }
  const readEnvironmentRevision = (): number => adapter.getEnvironmentRevision()
  const environmentRevision = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readEnvironmentRevision,
    readEnvironmentRevision,
  )
  const locale = adapter.resolveHostLanguage()
  return createElement(
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
      { fallback: createElement('div', { className: 'flex flex-1 items-center justify-center text-sm text-zinc-500' }, '正在加载生成页…') },
      createElement(CreativeView, { key: environmentRevision, defaultCreationMode: DEFAULT_CREATION_MODE }),
    ),
  )
}
