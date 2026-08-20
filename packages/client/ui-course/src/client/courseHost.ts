/**
 * BirdCoder host adapter for the SDKWork Course PC surface.
 *
 * The adapter owns generated client construction and maps the shared ui-env and
 * ui-iam services to SDKWork's host ports. The embedded view is remounted when
 * the API environment changes; IAM and locale changes flow through the ports.
 */
import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import '../../../../../../sdkwork-course/apps/sdkwork-course-pc/src/index.css'
import {
  configureCoursePcRuntime,
  CourseView,
  type CoursePcSdkPorts,
} from '@sdkwork/course-pc-course'
import { createClient, type SdkworkAppClient } from '@sdkwork/course-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-iam/sdkwork-global-token-manager'

/* jscpd:ignore-start -- the SDKWork host adapter is one deliberate template
   shared with ui-drive's driveHost.ts: cross-package value imports are
   forbidden by the client-bundle purity gate, so each SDKWork surface package
   owns a copy of the session/port adaptation. */
/** Session user fields forwarded to the SDKWork Course runtime. */
export interface CourseHostSessionUser {
  displayName?: string
  nickname?: string
  name?: string
  avatar?: string
}

/** Session data supplied to the SDKWork Course runtime. */
export interface CourseHostSessionSnapshot {
  user?: CourseHostSessionUser
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
 * @returns a user snapshot, or null when no profile is available.
 */
export function toCourseSession(
  session: CourseHostSession | null,
): CourseHostSessionSnapshot | null {
  if (session?.user === undefined) return null
  const displayName = session.user.displayName?.trim()
  const email = session.user.email?.trim()
  const name = displayName || email
  const avatar = typeof session.user.avatar === 'string' ? session.user.avatar : undefined
  if (name === undefined && avatar === undefined) return null
  return {
    user: {
      ...(name === undefined ? {} : { displayName: name, name }),
      ...(avatar === undefined ? {} : { avatar }),
    },
  }
}

/** Lifecycle handle returned after configuring the SDKWork host. */
export interface CourseHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface CourseHostRuntime extends CourseHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the revision used to remount after an environment switch. */
  getEnvironmentRevision(): number
  /** @returns the current host session for the SDKWork session store. */
  readHostSession(): CourseHostSessionSnapshot | null
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** Subscribe SDKWork to host locale changes. */
  subscribeHostLanguage(listener: (language: string) => void): () => void
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
    if (baseUrl === '') throw new Error('ui-course: SDKWork base URL is not configured')
    return baseUrl
  }

  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
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
  ports(): CoursePcSdkPorts {
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
  configureCoursePcRuntime({ sdkPorts: adapter.ports() })
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createCourseHostRuntime(
  options: ConfigureCourseHostOptions,
): CourseHostRuntime {
  return new CourseHostRuntimeImpl(options)
}

/** Render the SDKWork Course surface through the configured host adapter. */
export function CourseApp(): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-course: SDKWork host runtime is not configured')
  }
  const readEnvironmentRevision = (): number => adapter.getEnvironmentRevision()
  const environmentRevision = useSyncExternalStore(
    (listener: () => void) => adapter.subscribe(listener),
    readEnvironmentRevision,
    readEnvironmentRevision,
  )
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: 'course' },
    createElement(CourseView, { key: environmentRevision }),
  )
}
/* jscpd:ignore-end */
