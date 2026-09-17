/**
 * Wire vocabulary of the SDKWork app build Remote namespace. Declared here
 * (not re-exported from the seam) so the typert generator resolves every
 * frame member inside the owning package — the same discipline
 * workspace-controller applies to its follow frames.
 */

/** Output stream a decoded build line came from. */
export type SdkworkAppBuildStream = 'stdout' | 'stderr'

/** Terminal outcome of one build process. */
export type SdkworkAppBuildOutcome = 'succeeded' | 'failed' | 'cancelled'

/** Lifecycle state of one build record. */
export type SdkworkAppBuildState = 'running' | 'exited'

/** Build request: run one package-manager build script inside an absolute directory. */
export interface SdkworkAppBuildStartRequest {
  readonly cwd: string
  readonly script?: string
  readonly args?: readonly string[]
}

/** Acknowledged spawn of one build process. */
export interface SdkworkAppBuildStartValue {
  readonly buildId: string
  readonly command: string
  readonly cwd: string
}

/** First frame of a follow stream: the spawn facts. */
export interface SdkworkAppBuildStartedFrame {
  readonly type: 'started'
  readonly buildId: string
  readonly command: string
  readonly cwd: string
}

/** One decoded output line from the build process. */
export interface SdkworkAppBuildOutputFrame {
  readonly type: 'output'
  readonly buildId: string
  readonly stream: SdkworkAppBuildStream
  readonly text: string
}

/** Terminal frame: the process exited (every exit path emits exactly one). */
export interface SdkworkAppBuildExitFrame {
  readonly type: 'exit'
  readonly buildId: string
  readonly outcome: SdkworkAppBuildOutcome
  readonly exitCode: number | null
  readonly signal: string | null
  readonly durationMs: number
}

/** Complete frame vocabulary of a build follow stream. */
export type SdkworkAppBuildFrame =
  | SdkworkAppBuildStartedFrame
  | SdkworkAppBuildOutputFrame
  | SdkworkAppBuildExitFrame

/** Cancel request: one build id. */
export interface SdkworkAppBuildCancelRequest {
  readonly buildId: string
}

/** Cancel acknowledgement: whether a running build was found and killed. */
export interface SdkworkAppBuildCancelValue {
  readonly cancelled: boolean
}

/** Deployment profile a script name pins, when it names one. */
export type SdkworkAppBuildDeploymentProfile = 'standalone' | 'cloud'

/** Host OS a command can run on. */
export type SdkworkAppBuildHostOs = 'windows' | 'macos' | 'linux'

/** Host CPU a command can run on, when the target pins one. */
export type SdkworkAppBuildHostArch = 'arm64' | 'x64'

/**
 * What one command needs from the host: the OSes and CPU it can run on, the
 * executables it needs on PATH, and the environment groups each satisfied by
 * setting any of their variables (the Android SDK roots are alternatives).
 */
export interface SdkworkAppBuildCommandRequirements {
  readonly hostOs: readonly SdkworkAppBuildHostOs[]
  readonly hostArch: SdkworkAppBuildHostArch | null
  readonly tools: readonly string[]
  readonly environmentAnyOf: readonly (readonly string[])[]
}

/**
 * Why a discovered command cannot run on the host that probed it. A closed
 * vocabulary rather than prose: the host has no locale, so the client renders
 * the sentence from this code plus `missing`.
 */
export type SdkworkAppBuildCommandBlock =
  | 'platform-unsupported'
  | 'architecture-unsupported'
  | 'toolchain-missing'
  | 'entry-missing'

/** One runnable command discovered in an app root's package.json. */
export interface SdkworkAppBuildCommand {
  readonly script: string
  readonly variant: string
  readonly environment: string | null
  readonly deploymentProfile: SdkworkAppBuildDeploymentProfile | null
  readonly requirements: SdkworkAppBuildCommandRequirements
  readonly runnable: boolean
  readonly blockedBy: SdkworkAppBuildCommandBlock | null
  /** Names of the unmet requirements; empty when runnable. */
  readonly missing: readonly string[]
}

/** One application family with the commands its app root can run. */
export interface SdkworkAppBuildFamily {
  readonly id: string
  readonly root: string
  readonly rootPath: string
  readonly build: readonly SdkworkAppBuildCommand[]
  readonly package: readonly SdkworkAppBuildCommand[]
}

/** Why a standard family has no runnable command here. */
export type SdkworkAppBuildAbsenceReason = 'no-app-root' | 'toolchain-not-wired'

/** A family the standard names but this workspace cannot build. */
export interface SdkworkAppBuildMissingFamily {
  readonly id: string
  readonly reason: SdkworkAppBuildAbsenceReason
}

/** Describe request: the workspace root to probe. */
export interface SdkworkAppBuildDescribeRequest {
  readonly cwd: string
}

/** What one workspace can build and package. */
export interface SdkworkAppBuildCatalog {
  readonly cwd: string
  readonly families: readonly SdkworkAppBuildFamily[]
  readonly missing: readonly SdkworkAppBuildMissingFamily[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The build directory is missing, not a directory, or not absolute. */
    'app-build/cwd-unreadable': { readonly code: string }
    /** The build directory carries no readable package.json. */
    'app-build/no-package-json': { readonly code: string }
    /** package.json has no such script, or an argument is outside the safe set. */
    'app-build/script-missing': { readonly code: string }
    /** No build is recorded under the given id. */
    'app-build/build-unknown': { readonly code: string }
    /** The host already runs its maximum concurrent build count. */
    'app-build/concurrency-exceeded': { readonly code: string }
    /**
     * The script exists but this host cannot run it: a cross-platform target,
     * an unsatisfied CPU, an uninstalled toolchain, or an entry file the
     * script names but the tree does not carry.
     */
    'app-build/command-unrunnable': { readonly code: string }
  }
}
