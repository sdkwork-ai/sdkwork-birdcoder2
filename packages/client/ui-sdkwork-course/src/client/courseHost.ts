/**
 * BirdCoder host adapter for the SDKWork Course PC surface.
 *
 * The adapter owns generated client construction and maps the shared ui-sdkwork-env and
 * ui-sdkwork-iam services to SDKWork's host ports. The embedded view is remounted when
 * the API environment changes; IAM and locale changes flow through the ports.
 */
import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import '../../../../../../sdkwork-course/apps/sdkwork-course-pc/src/index.css'
import { EmbeddedCourseApp } from './EmbeddedCourse.tsx'
import { CourseSurfaceBoundary, type CourseSurfaceFailureLabels } from './CourseSurfaceBoundary.tsx'
import { createClient, type SdkworkAppClient } from '@sdkwork/course-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  configureCourseDriveApiBaseUrl,
  getCourseGlobalTokenManager,
  resetDriveAppSdkClient,
  useAppStore,
} from '@sdkwork/sdkwork-course-pc-core'

/* jscpd:ignore-start -- the SDKWork host adapter is one deliberate template
   shared with ui-sdkwork-drive's driveHost.ts: cross-package value imports are
   forbidden by the client-bundle purity gate, so each SDKWork surface package
   owns a copy of the session/port adaptation. */
/** Session user fields forwarded to the SDKWork Course runtime. */
export interface CourseHostSessionUser {
  id?: string
  displayName?: string
  nickname?: string
  name?: string
  avatar?: string
}

/** Signed-in identity carried to the embedded Course runtime. */
export interface CourseHostSessionContext {
  tenantId: string
  userId: string
  organizationId?: string
}

/** Session data supplied to the SDKWork Course runtime. */
export interface CourseHostSessionSnapshot {
  user?: CourseHostSessionUser
  /** Signed-in identity; the host keys the embedded surface's mount by it. */
  context?: CourseHostSessionContext
}

/** Environment values consumed by the SDKWork host adapter. */
export interface CourseHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller state consumed by the adapter. */
export interface CourseHostIam {
  controller: {
    /** @returns the current session, when authenticated. */
    getState(): { session: CourseHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Minimal locale runtime consumed by the adapter. */
export interface CourseHostLocale {
  /** @returns the active BirdCoder locale id. */
  getSnapshot(): { active: string }
  /** Observe active-locale changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal theme runtime consumed by the adapter. */
export interface CourseHostTheme {
  /** @returns the resolved host color scheme for the embedded Course surface. */
  getColorScheme(): 'light' | 'dark'
  /** Observe resolved color-scheme changes. */
  subscribe(listener: () => void): () => void
  /**
   * Optional brand theme-color override (THEME_DARKMODE_SPEC §10): a preset
   * id or custom brand id propagated to the surface root as data-theme.
   * Hosts without brand switching omit this method entirely.
   */
  getThemeColor?(): string | null | undefined
}

/** IAM session fields accepted by the SDKWork Course session bridge. */
export interface CourseHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  user?: {
    id?: string
    displayName?: string
    email?: string
    avatar?: unknown
  }
  /** Signed-in identity context the host derives the remount key from. */
  context?: {
    tenantId?: string
    userId?: string
    organizationId?: string | null
  }
}

/** Dependencies used to configure the SDKWork surface. */
export interface ConfigureCourseHostOptions {
  env: CourseHostEnvironment
  iam: CourseHostIam
  locale: CourseHostLocale
  theme: CourseHostTheme
}

/**
 * Convert the host IAM state into SDKWork's session format.
 * @param session - current host IAM session, or null when signed out.
 * @returns a user and identity snapshot, or null when neither is available.
 */
export function toCourseSession(
  session: CourseHostSession | null,
): CourseHostSessionSnapshot | null {
  if (session === null) return null
  const displayName = session.user?.displayName?.trim()
  const email = session.user?.email?.trim()
  const name = displayName || email
  const avatar = typeof session.user?.avatar === 'string' ? session.user.avatar : undefined
  const id = session.user?.id?.trim()
  const user = name === undefined && avatar === undefined && id === undefined
    ? undefined
    : {
      ...(id === undefined ? {} : { id }),
      ...(name === undefined ? {} : { displayName: name, name }),
      ...(avatar === undefined ? {} : { avatar }),
    }
  // Carry the signed-in identity so the host can remount the embedded course
  // surface on an account switch, and so its storage stays scoped per account.
  const hostContext = session.context
  const context = hostContext?.tenantId === undefined || hostContext.userId === undefined
    ? undefined
    : {
      tenantId: hostContext.tenantId,
      userId: hostContext.userId,
      ...(hostContext.organizationId == null ? {} : { organizationId: hostContext.organizationId }),
    }
  if (user === undefined && context === undefined) return null
  return {
    ...(user === undefined ? {} : { user }),
    ...(context === undefined ? {} : { context }),
  }
}

/** Lifecycle handle returned after configuring the SDKWork host. */
export interface CourseHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** SDK ports exposed for the embedded course runtime and focused adapter tests. */
export interface CourseHostSdkPorts {
  /** Build or reuse the generated Course app client. */
  getCourseClient(): SdkworkAppClient
  /** @returns the current host session for SDKWork's session store. */
  readHostSession(): CourseHostSessionSnapshot | null
  /** Subscribe SDKWork to host session changes. */
  subscribeHostSession(listener: () => void): () => void
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** Subscribe SDKWork to host locale changes. */
  subscribeHostLanguage(listener: (language: string) => void): () => void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface CourseHostRuntime extends CourseHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number
  /**
   * @returns the signed-in identity (`tenant:user`) used to remount the surface
   * after an account switch, so the previous account's course progress and
   * drafts are not kept on screen.
   */
  getIdentityKey(): string
  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): CourseHostSessionSnapshot | null
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** Subscribe SDKWork to host locale changes. */
  subscribeHostLanguage(listener: (language: string) => void): () => void
  /** @returns the SDKWork ports wired for focused integration tests. */
  ports(): CourseHostSdkPorts
}

/** Host adapter implementation and SDKWork port owner. */
class CourseHostRuntimeImpl implements CourseHostRuntime {
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private courseClient: SdkworkAppClient | undefined
  private clientBaseUrl: string | undefined
  private environmentRevision = 0
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureCourseHostOptions) {
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Start subscriptions and return the disposer for the plugin effect. */
  start(): () => void {
    this.syncTokens()
    this.offEnvironment = this.options.env.subscribe(() => {
      this.courseClient = undefined
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

  /** @returns `tenant:user` of the signed-in host session, or an empty string. */
  getIdentityKey(): string {
    const session = this.options.iam.controller.getState().session
    const tenantId = session?.context?.tenantId?.trim() ?? ''
    const userId = (session?.context?.userId ?? session?.user?.id ?? '').trim()
    return tenantId === '' || userId === '' ? '' : `${tenantId}:${userId}`
  }

  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): CourseHostSessionSnapshot | null {
    return toCourseSession(this.options.iam.controller.getState().session)
  }

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
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

  /** Build or reuse the generated Course app client. */
  private readCourseClient(): SdkworkAppClient {
    const baseUrl = this.readBaseUrl()
    this.syncTokens()
    if (this.courseClient === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.courseClient = createClient({
        authMode: 'dual-token',
        baseUrl,
        tokenManager: this.tokenManager,
      })
    }
    return this.courseClient
  }

  private readBaseUrl(): string {
    const baseUrl = this.options.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-sdkwork-course: SDKWork base URL is not configured')
    return baseUrl
  }

  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
    try {
      configureCourseDriveApiBaseUrl(this.readBaseUrl())
    } catch {
      // The environment can still be settling when the plugin starts; the
      // environment subscription calls this again with the resolved base URL.
    }
    const hostTokens = getSdkworkGlobalTokenManager().getTokens()
    const courseTokenManager = getCourseGlobalTokenManager()
    if (hostTokens.accessToken || hostTokens.authToken || hostTokens.refreshToken) {
      courseTokenManager.setTokens(hostTokens)
    } else {
      courseTokenManager.clearTokens()
    }
    const hostSession = this.options.iam.controller.getState().session
    const hostUser = hostSession?.user
    const displayName = hostUser?.displayName?.trim() || hostUser?.email?.trim()
    if (hostUser && displayName) {
      useAppStore.setState({
        user: {
          id: hostUser.id?.trim() || 'host-user',
          name: displayName,
          email: hostUser.email?.trim() ?? '',
          ...(typeof hostUser.avatar === 'string' ? { avatar: hostUser.avatar } : {}),
        },
        isAuthenticated: true,
        isLoading: false,
      })
    }
    resetDriveAppSdkClient()
  }

  /** @returns the host theme bridge for the embedded Course surface. */
  readThemeBridge(): HostThemeBridge {
    return this.options.theme
  }

  private publish(): void {
    /* v8 ignore next 2 -- disposed guard: dispose() unsubscribes both
       sources first, so no callback can reach publish after disposal. */
    if (this.disposed) return
    for (const listener of this.listeners) listener()
  }

  /** Build the SDKWork ports consumed by the embedded host surface. */
  ports(): CourseHostSdkPorts {
    return {
      getCourseClient: () => this.readCourseClient(),
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
    }
  }
}

let activeAdapter: CourseHostRuntimeImpl | undefined

/** Configure the global SDKWork runtime ports for the embedded Course surface. */
export function configureCourseHost(options: ConfigureCourseHostOptions): CourseHostAdapter {
  activeAdapter?.dispose()
  const adapter = new CourseHostRuntimeImpl(options)
  activeAdapter = adapter
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createCourseHostRuntime(
  options: ConfigureCourseHostOptions,
): CourseHostRuntime {
  return new CourseHostRuntimeImpl(options)
}

/** Locale-owned copy the page hands its failure surface. */
export type CourseAppLabels = CourseSurfaceFailureLabels

/** Props for {@link CourseApp}: copy the host page owns. */
export interface CourseAppProps {
  /** Failure copy rendered inside the mode page if the embedded surface crashes. */
  readonly labels: CourseAppLabels
}

/**
 * Render one embedded course surface generation under the failure boundary.
 *
 * The host client is read here, not in {@link CourseApp}: a client failure then
 * shows the contained failure face instead of escaping the mode page.
 * @param props - the configured adapter and the environment generation.
 * @returns the embedded course app for that generation.
 */
function CourseSurface({ adapter, identityKey, revision }: {
  readonly adapter: CourseHostRuntime
  readonly identityKey: string
  readonly revision: number
}): ReactNode {
  return createElement(EmbeddedCourseApp, {
    client: adapter.ports().getCourseClient(),
    key: `${revision}:${identityKey}`,
  })
}

/**
 * Render the SDKWork Course surface through the configured host adapter.
 * @param props - failure copy owned by the host page.
 * @returns the themed course surface, isolated by its failure boundary.
 */
export function CourseApp({ labels }: CourseAppProps): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-sdkwork-course: SDKWork host runtime is not configured')
  }
  const readEnvironmentRevision = (): number => adapter.getEnvironmentRevision()
  const environmentRevision = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readEnvironmentRevision,
    readEnvironmentRevision,
  )
  // Remount on identity changes too: a signed-in token swap must not keep the
  // previous account's course progress and open lesson on screen.
  const readIdentityKey = (): string => adapter.getIdentityKey()
  const identityKey = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readIdentityKey,
    readIdentityKey,
  )
  return createElement(
    SdkworkHostThemeSurface,
    {
      theme: adapter.readThemeBridge(),
      surface: 'course',
      children: createElement(
        CourseSurfaceBoundary,
        { key: `${environmentRevision}:${identityKey}`, labels },
        createElement(CourseSurface, { adapter, identityKey, revision: environmentRevision }),
      ),
    },
  )
}
/* jscpd:ignore-end */
