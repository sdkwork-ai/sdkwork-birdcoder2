/**
 * BirdCoder host adapter for the SDKWork Agents creative (生成) PC surface.
 *
 * The adapter owns generated client construction and maps the shared ui-sdkwork-env and
 * ui-sdkwork-iam services to the Agents PC session store and SDK client providers.
 * The embedded {@link CreativeView} is remounted when the API environment or the
 * signed-in account changes: its session list is account-scoped server state, so
 * an account switch must rebuild the view instead of keeping the previous
 * account's list on screen. Token refreshes of the same account, and locale
 * changes, flow through the session bridge without a remount.
 */
import { Suspense, createElement, lazy, useSyncExternalStore, type ReactNode } from 'react'
import {
  defineSdkworkI18nRuntimeConfig,
  SdkworkI18nProvider,
} from '@sdkwork/i18n-pc-react'
import { agentsWorkbenchI18nCatalogs } from '@sdkwork/agents-pc-commons/i18n'
import { configureDriveAppSdkClientProvider } from '@sdkwork/agents-pc-core/sdk/driveAppSdkClient'
import { configureGenerationsAppSdkClientProvider } from '@sdkwork/agents-pc-core/sdk/generationsAppSdkClient'
import { configureModelsAppSdkClientProvider } from '@sdkwork/agents-pc-core/sdk/modelsAppSdkClient'
import {
  clearAppSdkSessionTokens,
  createSdkworkChatRequestContextInterceptors,
  persistAppSdkSessionTokens,
  type SdkworkChatSession,
} from '@sdkwork/agents-pc-core/session'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  createSignInRequestInterceptor,
  type SdkworkSignInRequirement,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { splitBaseUrls, type Interceptors } from '@sdkwork/sdk-common'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import { createClient as createDriveClient } from '@sdkwork/drive-app-sdk'
import { createClient as createGenerationsClient } from '@sdkwork/generations-app-sdk'
import { createClient as createModelsClient } from '@sdkwork/models-app-sdk'
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

/**
 * Minimal IAM face consumed by the adapter: the session bridge reads the
 * controller, and the transport gate uses the sign-in requirement.
 *
 * The mode page demands a session before it mounts the embedded surface, so
 * this gate is the requirement's transport half: a session can end while the
 * page stays mounted, and a request must never dispatch anonymously. The gate
 * is consulted per request inside the SDK interceptor chain, which is the only
 * place that knows a real backend call is about to happen.
 */
export interface CreativeHostIam extends SdkworkSignInRequirement {
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

/** Minimal theme runtime consumed by the adapter. */
export interface CreativeHostTheme extends HostThemeBridge {}

/** Dependencies used to configure the SDKWork surface. */
export interface ConfigureCreativeHostOptions {
  env: CreativeHostEnvironment
  iam: CreativeHostIam
  locale: CreativeHostLocale
  theme: CreativeHostTheme
}

/**
 * Normalize the gateway origin for SDKWork app clients.
 * @param baseUrl - active API gateway origin from ui-sdkwork-env.
 * @returns the gateway root without a duplicated app API suffix.
 */
export function normalizeCreativeGatewayBaseUrl(baseUrl: string): string {
  const [candidate = ''] = splitBaseUrls(baseUrl)
  const normalized = candidate.trim().replace(/\/+$/u, '')
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
 * @param staticAccessToken - ui-sdkwork-env access token used by non-interactive deployments.
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

/**
 * Resolve the account an embedded credential snapshot belongs to.
 *
 * The creative surface lists server records that belong to one account, so the
 * host must rebuild it exactly when that account changes. The key deliberately
 * excludes tokens — a refresh rotates them without moving the data to another
 * owner — and stays distinct from the signed-out key even when a session
 * carries no identity claim, so a sign-in after sign-out always counts as a
 * change.
 *
 * @param session - current host IAM session, or null when signed out.
 * @returns a stable per-account key, and `''` while signed out.
 */
export function readCreativeIdentityKey(session: CreativeHostSession | null): string {
  if (session === null) return ''
  const tenantId = session.context?.tenantId?.trim() ?? ''
  const organizationId = session.context?.organizationId?.trim() ?? ''
  const userId = session.user?.id?.trim() || session.context?.userId?.trim() || ''
  // `\u0000` cannot appear in an id claim, so the parts cannot run together.
  return `${tenantId}\u0000${organizationId}\u0000${userId}`
}

/**
 * Build the request chain shared by every embedded SDK client.
 *
 * The session-context interceptors are the Agents PC default; the sign-in
 * interceptor is the transport gate, and it runs last so a session-bearing
 * request is suspended inside the SDK's own interceptor chain.
 * The HTTP call is never dispatched while signed out, and it resumes with the
 * credentials the finished login installed in the shared token manager. A user
 * who dismisses the overlay instead gets `SdkworkSignInRequiredError`, which is
 * not an `SdkError` and therefore is never retried into a second overlay.
 *
 * @param signIn - the IAM session requirement (`ctx.iam`).
 * @param readSession - reads the current session for the context interceptors.
 * @returns the interceptor set handed to the generated SDK clients.
 */
export function createCreativeInterceptors(
  signIn: Pick<SdkworkSignInRequirement, 'isSignedIn' | 'requireSignedIn'>,
  readSession: () => SdkworkChatSession | null,
): Interceptors {
  const base = createSdkworkChatRequestContextInterceptors(readSession)
  return {
    ...base,
    request: [...base.request, createSignInRequestInterceptor(signIn)],
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
  /** @returns the revision used to remount after the signed-in account changes. */
  getSurfaceRevision(): number
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
}

/** Host adapter implementation and SDKWork client owner. */
class CreativeHostRuntimeImpl implements CreativeHostRuntime {
  private readonly listeners = new Set<() => void>()
  private environmentRevision = 0
  private surfaceRevision = 0
  /** Account key of the credentials the embedded surface last loaded with. */
  private identityKey: string | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureCreativeHostOptions) {}

  /** Start subscriptions and return the disposer for the plugin effect. */
  start(): () => void {
    // Baseline the account before subscribing: the first load is already the
    // current account's own, so only a later change should remount the surface.
    this.identityKey = this.readIdentityKey()
    this.syncSessionAndClients()
    this.offEnvironment = this.options.env.subscribe(() => {
      this.environmentRevision += 1
      this.surfaceRevision += 1
      this.syncSessionAndClients()
      this.publish()
    })
    this.offIam = this.options.iam.controller.subscribe(() => {
      this.syncIdentity()
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

  /** @returns the revision used to remount after the signed-in account changes. */
  getSurfaceRevision(): number {
    return this.surfaceRevision
  }

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** @returns the host theme bridge for the embedded creative surface. */
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

  /**
   * Bump the surface revision when the signed-in account changes.
   *
   * The revision is the remount key of {@link CreativeView}: without it the view
   * keeps rendering the previous account's session list after a sign-out and a
   * sign-in, because its session state is mounted once and never reloaded.
   */
  private syncIdentity(): void {
    const next = this.readIdentityKey()
    if (next === this.identityKey) return
    this.identityKey = next
    this.surfaceRevision += 1
  }

  /** @returns the account key of the credentials the adapter currently holds. */
  private readIdentityKey(): string {
    return readCreativeIdentityKey(this.options.iam.controller.getState().session)
  }

  private syncSessionAndClients(): void {
    const baseUrl = normalizeCreativeGatewayBaseUrl(this.options.env.apiBaseUrl())
    if (baseUrl === '') {
      clearAppSdkSessionTokens()
      syncSdkworkGlobalTokenManager(null, '')
      return
    }

    const iamSession = this.options.iam.controller.getState().session
    const staticAccessToken = this.options.env.accessToken().trim()
    const session = toCreativeSession(iamSession, staticAccessToken)
    syncSdkworkGlobalTokenManager(iamSession, staticAccessToken)
    const tokenManager = getSdkworkGlobalTokenManager()
    const readSession = (): SdkworkChatSession | null => toCreativeSession(
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

    const interceptors = createCreativeInterceptors(this.options.iam, readSession)
    configureGenerationsAppSdkClientProvider(() => createGenerationsClient({
      baseUrl,
      platform: 'pc',
      tokenManager,
      interceptors,
    }))
    configureModelsAppSdkClientProvider(() => createModelsClient({
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
    if (baseUrl === '') throw new Error('ui-sdkwork-generations-video: SDKWork base URL is not configured')
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
    throw new Error('ui-sdkwork-generations-video: SDKWork creative host runtime is not configured')
  }
  const readSurfaceRevision = (): number => adapter.getSurfaceRevision()
  const surfaceRevision = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readSurfaceRevision,
    readSurfaceRevision,
  )
  // Any change that bumps the surface revision re-renders this component, so
  // the environment snapshot can be read during render.
  const environmentRevision = adapter.getEnvironmentRevision()
  const locale = adapter.resolveHostLanguage()
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: 'agents-creative' },
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
        { fallback: createElement('div', { className: 'flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400' }, '正在加载生成页…') },
        createElement(CreativeView, { key: surfaceRevision, defaultCreationMode: DEFAULT_CREATION_MODE }),
      ),
    ),
  )
}
