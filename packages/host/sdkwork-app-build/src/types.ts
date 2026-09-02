/** Wire and seam vocabulary for the SDKWork app build capability. */

/** Output stream a decoded build line came from. */
export type SdkworkAppBuildStream = 'stdout' | 'stderr'

/** Terminal outcome of one build process. */
export type SdkworkAppBuildOutcome = 'succeeded' | 'failed' | 'cancelled'

/** Lifecycle state of one build record. */
export type SdkworkAppBuildState = 'running' | 'exited'

/**
 * Build request: run one package-manager build script inside an absolute
 * directory. `script` defaults to `build`; `args` appends verbatim script
 * arguments after the conventional `--` separator.
 */
export interface SdkworkAppBuildStartRequest {
  cwd: string
  script?: string | undefined
  args?: readonly string[] | undefined
}

/** Acknowledged spawn of one build process. */
export interface SdkworkAppBuildStartValue {
  buildId: string
  command: string
  cwd: string
}

/** First frame of a follow stream: the spawn facts. */
export interface SdkworkAppBuildStartedFrame {
  type: 'started'
  buildId: string
  command: string
  cwd: string
}

/** One decoded output line from the build process. */
export interface SdkworkAppBuildOutputFrame {
  type: 'output'
  buildId: string
  stream: SdkworkAppBuildStream
  text: string
}

/** Terminal frame: the process exited (every exit path emits exactly one). */
export interface SdkworkAppBuildExitFrame {
  type: 'exit'
  buildId: string
  outcome: SdkworkAppBuildOutcome
  exitCode: number | null
  signal: string | null
  durationMs: number
}

/** Complete frame vocabulary of a build follow stream. */
export type SdkworkAppBuildFrame =
  | SdkworkAppBuildStartedFrame
  | SdkworkAppBuildOutputFrame
  | SdkworkAppBuildExitFrame

/** Point-in-time snapshot of one build record with its replay buffer. */
export interface SdkworkAppBuildStatus {
  buildId: string
  command: string
  cwd: string
  state: SdkworkAppBuildState
  outcome: SdkworkAppBuildOutcome | null
  exitCode: number | null
  signal: string | null
  durationMs: number | null
  lines: readonly SdkworkAppBuildOutputFrame[]
}

/** Closed failure vocabulary of the seam; the controller projects these onto Remote codes. */
export type SdkworkAppBuildErrorCode =
  | 'cwd-unreadable'
  | 'no-package-json'
  | 'script-missing'
  | 'build-unknown'
  | 'concurrency-exceeded'
