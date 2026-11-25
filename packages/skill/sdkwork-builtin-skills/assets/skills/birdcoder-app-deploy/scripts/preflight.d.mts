/**
 * Offline preflight for one SDKWork application project: manifest shape, console
 * card, build output (including the adaptive PC+H5 `dist/<profile>/<env>/`
 * layout), and the build command the project declares.
 */

import type { StandardsResolution } from './standards.mjs'

/** Manifest file this preflight reads (APP_MANIFEST_SPEC). */
export const MANIFEST_FILE: 'agent.app.config.json'

/** Conventional build output directories, most specific first. */
export const BUILD_OUTPUT_CANDIDATES: readonly string[]

/** Top-level sections the manifest validator requires. */
export const REQUIRED_SECTIONS: readonly string[]

/** The application family and console card one manifest derives. */
export interface DerivedAppIdentity {
  /** Console card id; absent when the manifest resolves to no single card. */
  readonly cardId?: string
  /** Runtime family the manifest declares. */
  readonly family?: string
  /** Runtime framework the manifest declares. */
  readonly framework?: string
  /** Publish platforms the manifest declares. */
  readonly platforms: string[]
}

/** One build output directory resolved for a project. */
export interface ResolvedBuildOutput {
  /** Absolute directory to publish. */
  readonly outputDir: string
  /** True for every directory the resolver reports. */
  readonly exists: boolean
}

/** The filesystem face `analyzeProject` reads through. */
export interface PreflightIo {
  /** Read one file as UTF-8 text. */
  readFile(path: string): Promise<string>
  /** List one directory's entry names. */
  listDir(path: string): Promise<string[]>
  /** Stat one path, or report it absent. */
  stat(path: string): Promise<{ isDirectory(): boolean } | undefined>
}

/** Inputs that replace the preflight's own resolution. */
export interface AnalyzeProjectOptions {
  /** Explicit build output directory, relative to the project. */
  readonly buildOutput?: string
  /** Standards resolution to use instead of resolving one. */
  readonly standards?: StandardsResolution
  /** Run the checkout's official manifest checker when a checkout resolved. */
  readonly runStandardCheck?: boolean
}

/** Project paths one analysis resolved. */
export interface PreflightProjectReport {
  /** Project directory the analysis read. */
  readonly directory: string
  /** Absolute manifest path. */
  readonly manifest: string
  /** Absolute source root the manifest declares. */
  readonly sourceRoot: string
}

/** Identity the manifest declares, plus the card it derives. */
export interface PreflightIdentityReport extends DerivedAppIdentity {
  /** `app.key`. */
  readonly key?: string
  /** `app.name`. */
  readonly name?: string
  /** `app.displayName`, falling back to `app.name`. */
  readonly displayName?: string
  /** `app.appType`. */
  readonly appType?: string
}

/** Build resolution one analysis reported. */
export interface PreflightBuildReport {
  /** Absolute output directory to publish. */
  readonly outputDir?: string
  /** Whether the output directory exists. */
  readonly outputExists: boolean
  /** Adaptive-web candidates when the output layout is ambiguous. */
  readonly adaptiveCandidates?: string[]
  /** Package manager the lockfile names. */
  readonly packageManager: string
  /** Candidate build commands, most specific first. */
  readonly commands: string[]
}

/** Standards source the analysis used. */
export interface PreflightStandardsReport {
  /** Where the contracts resolved from. */
  readonly source: 'checkout' | 'bundled' | 'none'
  /** Absolute checkout directory when a checkout resolved. */
  readonly checkoutDir?: string
}

/** Result of the optional official manifest checker. */
export interface StandardCheckReport {
  /** Whether the checker ran. */
  readonly ran: boolean
  /** Checker exit status, absent when it could not start. */
  readonly ok?: boolean
  /** Start failure the checker reported. */
  readonly error?: string
  /** Last lines of checker output. */
  readonly output?: string
}

/** The report one project analysis returns. */
export interface PreflightReport {
  /** True when no hard error was reported. */
  readonly ok: boolean
  /** Stable code of a failure that stopped the analysis. */
  readonly error?: string
  /** Absolute manifest path the analysis read. */
  readonly manifest?: string
  /** Resolved project paths. */
  readonly project?: PreflightProjectReport
  /** Declared identity and derived card. */
  readonly identity?: PreflightIdentityReport
  /** Build resolution. */
  readonly build?: PreflightBuildReport
  /** Release version the manifest or package declares. */
  readonly release?: { readonly version?: string }
  /** Standards source. */
  readonly standards?: PreflightStandardsReport
  /** Official checker result, when it ran. */
  readonly standardCheck?: StandardCheckReport
  /** Findings that do not block a publish. */
  readonly warnings: string[]
  /** Hard findings. */
  readonly errors: string[]
}

/**
 * Derive the application family and console card the manifest describes.
 * @param manifest - Parsed governed manifest.
 * @returns Derived identity; an ambiguous root resolves to no card.
 */
export function deriveAppType(manifest: Record<string, unknown>): DerivedAppIdentity

/**
 * Resolve the source root the manifest declares.
 * @param manifest - Parsed governed manifest.
 * @param directory - Project directory.
 * @returns Absolute source root, or the project directory.
 */
export function sourceRoot(manifest: Record<string, unknown>, directory: string): string

/**
 * Find the conventional build output to publish.
 * @param root - Absolute source root.
 * @param entries - Names directly under the root.
 * @returns The resolved output, or `undefined` when none exists.
 */
export function detectBuildOutput(root: string, entries: readonly string[]): ResolvedBuildOutput | undefined

/**
 * Find the adaptive-web profile/environment output directories under `dist`.
 * @param root - Absolute source root.
 * @param listDir - Directory lister.
 * @returns Relative candidates such as `dist/standalone/prod`.
 */
export function detectAdaptiveOutputs(root: string, listDir: (path: string) => Promise<string[]>): Promise<string[]>

/**
 * Read the build command the project declares.
 * @param manifest - Parsed governed manifest.
 * @param packageManifest - Project `package.json`, when one exists.
 * @param packageManager - Detected package manager.
 * @returns Candidate commands, most specific first.
 */
export function detectBuildCommand(
  manifest: Record<string, unknown> | undefined,
  packageManifest: Record<string, unknown> | undefined,
  packageManager: string,
): string[]

/**
 * Validate the manifest's required shape against the bundled contract.
 * @param manifest - Parsed governed manifest.
 * @returns Hard error strings.
 */
export function manifestErrors(manifest: Record<string, unknown>): string[]

/**
 * Analyze one project through an injected filesystem face.
 * @param directory - Project directory.
 * @param io - Filesystem face.
 * @param options - Overrides for build output, standards and the official checker.
 * @returns The preflight report.
 */
export function analyzeProject(
  directory: string,
  io: PreflightIo,
  options?: AnalyzeProjectOptions,
): Promise<PreflightReport>

/**
 * Run the preflight from the command line.
 * @param argv - Arguments after the script path.
 * @returns Process exit code.
 */
export function main(argv: string[]): Promise<number>
