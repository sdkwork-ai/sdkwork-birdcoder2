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
  /**
   * The script exists but this host cannot run it — a cross-platform target,
   * an unsatisfied CPU, an uninstalled toolchain, or an entry file the script
   * names but the tree does not carry. Rejected at start rather than spawned
   * into a guaranteed failure, because a catalog can be stale or a caller can
   * bypass the menu entirely.
   */
  | 'command-unrunnable'

/** Deployment profile a script name pins, when it names one. */
export type SdkworkAppBuildDeploymentProfile = 'standalone' | 'cloud'

/** Host OS a command can run on. */
export type SdkworkAppBuildHostOs = 'windows' | 'macos' | 'linux'

/** Host CPU a command can run on, when the target pins one. */
export type SdkworkAppBuildHostArch = 'arm64' | 'x64'

/**
 * What one command needs from the host. Every member is a requirement the
 * seam can evaluate before spawning, so "the script is declared" and "this
 * host can run the script" are two different facts.
 */
export interface SdkworkAppBuildCommandRequirements {
  /** Host OSes able to run the command; every OS when it is portable. */
  hostOs: readonly SdkworkAppBuildHostOs[]
  /** Host CPU the command additionally requires, when it needs one. */
  hostArch: SdkworkAppBuildHostArch | null
  /** Executables the command needs on PATH. */
  tools: readonly string[]
  /**
   * Requirement groups each satisfied by setting ANY of their variables, e.g.
   * `[['ANDROID_HOME', 'ANDROID_SDK_ROOT']]` for an Android build. Groups
   * rather than a flat list because the SDK roots are alternatives, not
   * compounds.
   */
  environmentAnyOf: readonly (readonly string[])[]
}

/**
 * Why a discovered command cannot run on the host that probed it. A closed
 * vocabulary rather than prose: the host has no locale, so the client renders
 * the operator-facing sentence from this code plus `missing`.
 */
export type SdkworkAppBuildCommandBlock =
  /** The target OS is not the host OS (`package:win:x64` off Windows). */
  | 'platform-unsupported'
  /** Right OS, wrong CPU (`mac-arm64` needs Apple Silicon). */
  | 'architecture-unsupported'
  /** The target is fine; a required executable is not installed. */
  | 'toolchain-missing'
  /** The script names a file that is not in the tree, so it fails anywhere. */
  | 'entry-missing'

/**
 * What the host makes of one command: its requirements and the verdict.
 * Carried per command so the menu greys a row out with the real reason
 * instead of offering a click that is guaranteed to fail.
 */
export interface SdkworkAppBuildCommandAssessment {
  /** What the command needs from a host. */
  requirements: SdkworkAppBuildCommandRequirements
  /** Whether the host that produced this catalog can run the command. */
  runnable: boolean
  /** Why not, or null when it can. */
  blockedBy: SdkworkAppBuildCommandBlock | null
  /**
   * Names of the unmet requirements, one per unmet one: host-OS or CPU tokens
   * for the platform verdicts, tool names for `toolchain-missing`, and the
   * app-root-relative paths for `entry-missing`. Empty when runnable.
   */
  missing: readonly string[]
}

/**
 * One runnable command discovered in an app root's package.json. The catalog
 * surfaces the script name verbatim (the seam runs scripts, never raw
 * commands) plus the parsed variant so the menu can label it without
 * re-implementing the naming convention.
 */
export interface SdkworkAppBuildCommand extends SdkworkAppBuildCommandAssessment {
  /** package.json script name, run through the owning root's package manager. */
  script: string
  /** Menu-facing variant label, e.g. `dev`, `prod · cloud`, `android`. */
  variant: string
  /** Environment alias parsed from the script name, when it carries one. */
  environment: string | null
  /** Deployment profile parsed from the script name, when it pins one. */
  deploymentProfile: SdkworkAppBuildDeploymentProfile | null
}

/**
 * Facts about the machine running the host, as the capability rules read
 * them. Injected rather than read from the ambient process so the same rules
 * are testable on any machine.
 */
export interface SdkworkAppBuildHostFacts {
  /** OS this host process runs on. */
  os: SdkworkAppBuildHostOs
  /** CPU this host process runs on. */
  arch: SdkworkAppBuildHostArch
  /** Whether an executable of this name is on PATH. */
  hasTool(name: string): boolean
  /** Whether an environment variable is set to a non-blank value. */
  hasEnvironmentVariable(name: string): boolean
  /** Whether a path exists; used for the entry file a script names. */
  fileExists(path: string): boolean
}

/**
 * One application family (`h5`, `pc`, `flutter-mobile`, `mini-program`,
 * `desktop`…) discovered under the workspace's `apps/` tree, together with
 * the commands its app root can actually run.
 */
export interface SdkworkAppBuildFamily {
  /** Family id parsed from the app-root directory name (`h5`, `pc`, `flutter-mobile`…). */
  id: string
  /** App-root directory basename, e.g. `sdkwork-birdcoder2-h5`. */
  root: string
  /** Absolute path of the app root: the cwd its builds run in. */
  rootPath: string
  /** Compile commands (`build`, `build:*`), in package.json declaration order. */
  build: readonly SdkworkAppBuildCommand[]
  /** Packaging commands (`package:*`, `release:package*`), in declaration order. */
  package: readonly SdkworkAppBuildCommand[]
}

/**
 * Why a standard family has no runnable command here. A closed vocabulary
 * rather than prose: the host has no locale, so the client renders the
 * operator-facing sentence from this code.
 */
export type SdkworkAppBuildAbsenceReason =
  /** The workspace declares no `apps/<…>-<family>` root to run anything from. */
  | 'no-app-root'
  /** No build command for this family exists anywhere in the toolchain yet. */
  | 'toolchain-not-wired'

/**
 * A family the standard names but this workspace cannot build, with the
 * reason. Reported instead of silently omitted so the menu can show the gap
 * (greyed row) rather than let it read as an oversight.
 */
export interface SdkworkAppBuildMissingFamily {
  /** Family id the standard names (`h5`, `pc`, `flutter-mobile`, `mini-program`, `harmony`). */
  id: string
  /** Why no runnable command exists here. */
  reason: SdkworkAppBuildAbsenceReason
}

/** Describe request: the workspace root to probe. */
export interface SdkworkAppBuildDescribeRequest {
  cwd: string
}

/**
 * What one workspace can build and package. Probing is failure-tolerant by
 * design: an unreadable workspace yields an empty catalog with every standard
 * family reported missing, never a rejection — the menu degrades to showing
 * nothing runnable instead of failing to open.
 */
export interface SdkworkAppBuildCatalog {
  /** Workspace root the catalog was probed from. */
  cwd: string
  /** Discovered families carrying at least one runnable command. */
  families: readonly SdkworkAppBuildFamily[]
  /** Standard families with no runnable command here, and why. */
  missing: readonly SdkworkAppBuildMissingFamily[]
}
