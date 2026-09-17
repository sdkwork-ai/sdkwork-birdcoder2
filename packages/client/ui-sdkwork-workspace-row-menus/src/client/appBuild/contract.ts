/**
 * App-build contracts for the row menus: the catalog the workspace probe
 * answers, and the service face the menu consumes.
 *
 * The catalog shapes are declared structurally here (not imported from
 * `@sdkwork-app-build-controller`) for the same reason the deploy plugin
 * declares its build port structurally: a client feature plugin holds no
 * compile-time edge on the generated transport package, so the menus stay
 * loadable in compositions that never mount that Remote.
 */

/** Deployment profile a script name pins, when it names one. */
export type AppBuildDeploymentProfile = 'standalone' | 'cloud'

/** Host OS a command can run on. */
export type AppBuildHostOs = 'windows' | 'macos' | 'linux'

/** Host CPU a command can run on, when the target pins one. */
export type AppBuildHostArch = 'arm64' | 'x64'

/** What one command needs from the host (structural mirror of the wire). */
export interface AppBuildCommandRequirements {
  hostOs: readonly AppBuildHostOs[]
  hostArch: AppBuildHostArch | null
  tools: readonly string[]
  environmentAnyOf: readonly (readonly string[])[]
}

/**
 * Why a discovered command cannot run on the host that probed it. The host
 * decides this, never the renderer: only the host knows its OS, CPU, PATH and
 * tree, and a browser or remote composition is not the build host at all.
 */
export type AppBuildCommandBlock =
  | 'platform-unsupported'
  | 'architecture-unsupported'
  | 'toolchain-missing'
  | 'entry-missing'

/** One runnable command discovered in an app root's package.json. */
export interface AppBuildCommand {
  script: string
  variant: string
  environment: string | null
  deploymentProfile: AppBuildDeploymentProfile | null
  requirements: AppBuildCommandRequirements
  runnable: boolean
  blockedBy: AppBuildCommandBlock | null
  /** Names of the unmet requirements; empty when runnable. */
  missing: readonly string[]
}

/** One application family with the commands its app root can run. */
export interface AppBuildFamily {
  id: string
  root: string
  rootPath: string
  build: readonly AppBuildCommand[]
  package: readonly AppBuildCommand[]
}

/** Why a standard family has no runnable command here. */
export type AppBuildAbsenceReason = 'no-app-root' | 'toolchain-not-wired'

/** A family the standard names but this workspace cannot build. */
export interface AppBuildMissingFamily {
  id: string
  reason: AppBuildAbsenceReason
}

/** What one workspace can build and package. */
export interface AppBuildCatalog {
  cwd: string
  families: readonly AppBuildFamily[]
  missing: readonly AppBuildMissingFamily[]
}

/** Menu action a catalog command backs. */
export type AppBuildKind = 'build' | 'package'

/** One command launch requested from the menus. */
export interface AppBuildRunRequest {
  /** Absolute app-root directory the script runs in. */
  cwd: string
  /** package.json script name to run. */
  script: string
  /** Menu-facing title of the action, shown on the build panel header. */
  label: string
}

/** Result envelope of one Remote method call. */
export type AppBuildRemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

/** One streamed build frame (structural mirror of the wire vocabulary). */
export type AppBuildFrame =
  | { type: 'started'; buildId: string; command: string; cwd: string }
  | { type: 'output'; buildId: string; stream: 'stdout' | 'stderr'; text: string }
  | {
    type: 'exit'
    buildId: string
    outcome: 'succeeded' | 'failed' | 'cancelled'
    exitCode: number | null
    signal: string | null
    durationMs: number
  }

/**
 * Structural slice of the generated `ctx.remote.sdkworkAppBuild` namespace.
 * Declared here rather than imported from the generated transport package so
 * this plugin keeps no compile-time edge on it (see the module header).
 */
export interface AppBuildRemoteNamespace {
  describe(request: { cwd: string }): Promise<AppBuildRemoteResult<AppBuildCatalog>>
  start(request: { cwd: string; script?: string }): Promise<AppBuildRemoteResult<{
    buildId: string
    command: string
    cwd: string
  }>>
  follow(buildId: string, signal?: AbortSignal): AsyncIterable<AppBuildFrame>
  cancel(request: { buildId: string }): Promise<AppBuildRemoteResult<{ cancelled: boolean }>>
}

/** Translate seat plus its change notification. */
export interface AppBuildLocalePort {
  /** Current translate function for the plugin namespace. */
  translate: () => (key: string, params?: Record<string, string>) => string
  /** Observe locale/dictionary changes so the panel re-renders. */
  subscribe: (listener: () => void) => () => void
}

/**
 * App-build service provided by this plugin for the row menus. Both members
 * degrade instead of throwing: `describe` answers undefined when no build
 * Remote is mounted, and `run` is a no-op in the same case, so a composition
 * without the host capability simply shows no build rows.
 */
export interface AppBuildService {
  /** Probe one workspace's buildable families (cached); undefined when unavailable. */
  describe(cwd: string): Promise<AppBuildCatalog | undefined>
  /** Start one catalog command and stream it into the build panel. */
  run(request: AppBuildRunRequest): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SDKWork app build UI service; absent when this plugin is not loaded. */
    appBuild: AppBuildService
  }
}
