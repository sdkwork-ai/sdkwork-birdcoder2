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
  }
}
