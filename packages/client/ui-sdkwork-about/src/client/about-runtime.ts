/**
 * The About surface's data owner: this build's local facts plus the installation
 * application the platform resolves from the signed-in session credentials.
 *
 * The store layer is deliberately object-level: the fetched application is
 * server state, so it lives here (one stable snapshot per change) rather than in
 * a declared UI store. The dialog's visibility is the only shared viewing state
 * and lives in `about-store.ts`.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import {
  decodeInstallationApplication,
  type AboutEnvironmentTier, type AboutInstallationFacts,
} from './installation-facts.ts'

/** Request timeout for the installation read, in milliseconds. */
export const ABOUT_REQUEST_TIMEOUT_MS = 8000

/** How this application is running: the desktop shell or a browser page. */
export type AboutAppMode = 'desktop' | 'web'

/** Facts this build knows without asking the platform. */
export interface AboutLocalFacts {
  /** Release version embedded by the client build. */
  version: string | undefined
  /** Source commit embedded by the client build. */
  commit: string | undefined
  /** Whether the build carries uncommitted local changes. */
  dirty: boolean
  /** Registered deploy application id this build targets, before the platform answers. */
  appId: string
  /** API gateway origin the About read targets. */
  apiBaseUrl: string
  /** Lifecycle tier this launch selected. */
  environment: AboutEnvironmentTier
  /** Whether the page runs inside the desktop shell or a browser tab. */
  appMode: AboutAppMode
}

/** Why the platform application info is not on screen. */
export type AboutUnavailableReason = 'unconfigured' | 'unauthenticated' | 'failed' | 'invalid'

/** One installation-application read state. */
export type AboutInstallationSnapshot =
  | { phase: 'loading' }
  | { phase: 'ready'; application: AboutInstallationFacts }
  | { phase: 'unavailable'; reason: AboutUnavailableReason; detail?: string }

/** API credentials the signed-in IAM session provides for dual-token reads. */
export interface AboutCredentials {
  /** Signed session auth token (`Authorization: Bearer`). */
  authToken: string
  /** Signed application access token (`Access-Token`). */
  accessToken: string
}

/** The deployment environment facts the runtime reads. */
export interface AboutEnvironment {
  /** Release version embedded by the client build. */
  version(): string | undefined
  /** Source commit embedded by the client build. */
  commit(): string | undefined
  /** Whether the build carries uncommitted local changes. */
  dirty(): boolean
  /** Registered deploy application id the deployment declares. */
  declaredAppId(): string
  /** API gateway origin. */
  apiBaseUrl(): string
  /** Signed-in credential pair for the platform read; undefined while signed out. */
  credentials(): AboutCredentials | undefined
  /** Active lifecycle tier. */
  environment(): AboutEnvironmentTier
  /** Whether the page runs inside the desktop shell or a browser tab. */
  appMode(): AboutAppMode
  /** Observe environment, profile, or session changes. */
  subscribe(listener: () => void): () => void
}

/** One installation read reachable by the runtime. */
export interface InstallationApplicationPort {
  /** Read the caller's installation application. */
  retrieve(options: { signal: AbortSignal }): Promise<AboutInstallationFacts>
}

function readLocal(environment: AboutEnvironment, fallbackVersion: string | undefined): AboutLocalFacts {
  return {
    version: environment.version() ?? fallbackVersion,
    commit: environment.commit(),
    dirty: environment.dirty(),
    appId: environment.declaredAppId(),
    apiBaseUrl: environment.apiBaseUrl(),
    environment: environment.environment(),
    appMode: environment.appMode(),
  }
}

function subscribeSet(set: Set<() => void>, listener: () => void): () => void {
  set.add(listener)
  return () => { set.delete(listener) }
}

/** Owns the About snapshots and the one in-flight installation read. */
export class AboutRuntime {
  private localSnapshot: AboutLocalFacts
  private installationSnapshot: AboutInstallationSnapshot = { phase: 'loading' }
  private port: InstallationApplicationPort | undefined
  private controller: AbortController | undefined
  private generation = 0
  private started = false
  private fallbackVersion: string | undefined
  private readonly localListeners = new Set<() => void>()
  private readonly installationListeners = new Set<() => void>()

  /** This build's local facts as one stable observable. */
  readonly local: HostObservable<AboutLocalFacts>
  /** The platform application read as one stable observable. */
  readonly installation: HostObservable<AboutInstallationSnapshot>

  /**
   * @param environment - deployment facts and their change signal.
   * @param createPort - builds the installation read from the environment, or
   * undefined when the deployment carries no token to read with.
   */
  constructor(
    private readonly environment: AboutEnvironment,
    private readonly createPort: (environment: AboutEnvironment) => InstallationApplicationPort | undefined,
  ) {
    this.localSnapshot = readLocal(environment, undefined)
    this.port = createPort(environment)
    this.local = {
      getSnapshot: () => this.localSnapshot,
      subscribe: listener => subscribeSet(this.localListeners, listener),
    }
    this.installation = {
      getSnapshot: () => this.installationSnapshot,
      subscribe: listener => subscribeSet(this.installationListeners, listener),
    }
  }

  /**
   * Read the installation once and keep the local facts current.
   * @returns the disposer stopping the environment subscription.
   */
  start(): () => void {
    if (this.started) return () => {}
    this.started = true
    const stop = this.environment.subscribe(() => { this.syncEnvironment() })
    this.load()
    return stop
  }

  /** Abort the in-flight read; called when the plugin unloads. */
  dispose(): void {
    this.generation += 1
    this.controller?.abort()
    this.controller = undefined
  }

  /**
   * Supply a version for builds whose client bundle carries no build metadata.
   *
   * The desktop shell knows the installed application version even when this
   * page was assembled from partial client artifacts; the build's own version
   * always wins and a later environment change re-evaluates both.
   * @param version - installed application version, or undefined when unknown.
   */
  setFallbackVersion(version: string | undefined): void {
    const normalized = version?.trim()
    this.fallbackVersion = normalized === '' ? undefined : normalized
    if (this.environment.version() !== undefined) return
    const next = readLocal(this.environment, this.fallbackVersion)
    if (next.version === this.localSnapshot.version) return
    this.localSnapshot = next
    for (const listener of [...this.localListeners]) listener()
  }

  /** Re-read the installation application. */
  load(): void {
    this.controller?.abort()
    const port = this.port
    const generation = ++this.generation
    if (port === undefined) {
      this.publishInstallation({
        phase: 'unavailable',
        reason: this.environment.credentials() === undefined ? 'unauthenticated' : 'unconfigured',
      })
      return
    }
    const controller = new AbortController()
    this.controller = controller
    // A refresh keeps settled facts on screen while it runs; only the first
    // read (or a previous failure) shows the loading state.
    if (this.installationSnapshot.phase === 'unavailable') this.publishInstallation({ phase: 'loading' })
    void port.retrieve({ signal: controller.signal }).then(
      (value) => {
        if (generation !== this.generation) return
        const application = decodeInstallationApplication(value)
        if (application === undefined) {
          this.publishInstallation({ phase: 'unavailable', reason: 'invalid' })
          return
        }
        this.publishInstallation({ phase: 'ready', application })
      },
      (error: unknown) => {
        if (generation !== this.generation || controller.signal.aborted) return
        this.publishInstallation({
          phase: 'unavailable',
          reason: 'failed',
          ...(error instanceof Error && error.message !== '' ? { detail: error.message } : {}),
        })
      },
    )
  }

  private publishInstallation(next: AboutInstallationSnapshot): void {
    this.installationSnapshot = next
    for (const listener of [...this.installationListeners]) listener()
  }

  private syncEnvironment(): void {
    this.localSnapshot = readLocal(this.environment, this.fallbackVersion)
    for (const listener of [...this.localListeners]) listener()
    this.port = this.createPort(this.environment)
    this.load()
  }
}
