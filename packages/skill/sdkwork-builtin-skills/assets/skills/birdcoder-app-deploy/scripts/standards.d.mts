/**
 * Resolve the authoritative SDKWork standards for one installed skill:
 * `$SDKWORK_SPECS_HOME`, a sibling `sdkwork-specs` checkout, the skill's bundled
 * `references/standards/` contract, or none.
 */

/** One resolved standards source. */
export interface StandardsResolution {
  /** Where the contracts resolved from. */
  readonly source: 'checkout' | 'bundled' | 'none'
  /** Absolute checkout directory, when a checkout resolved. */
  readonly checkoutDir?: string
  /** Absolute bundled contract directory, when the skill ships one. */
  readonly bundledDir?: string
  /** Parsed `references/standards.lock.json`, when it exists. */
  readonly lock?: Record<string, unknown>
  /** Spec files the source cannot provide. */
  readonly missing?: string[]
}

/** Options for {@link resolveStandards}. */
export interface ResolveStandardsOptions {
  /** Probe the skill's ancestor directories for a sibling checkout; defaults to true. */
  readonly ancestors?: boolean
}

/** This skill's directory. */
export const SKILL_DIR: string

/** Bundled distilled contract directory. */
export const BUNDLED_DIR: string

/** Bundled lock file: which spec revision the contract was reviewed against. */
export const LOCK_FILE: string

/** Spec files the skill may need to locate. */
export const KNOWN_SPECS: readonly string[]

/**
 * Resolve the standards source.
 * @param env - Environment to read `SDKWORK_SPECS_HOME` from.
 * @param candidates - Extra checkout directories to probe.
 * @param options - Ancestor probing switch.
 * @returns The resolved source.
 */
export function resolveStandards(
  env?: Record<string, string | undefined>,
  candidates?: string[],
  options?: ResolveStandardsOptions,
): StandardsResolution

/**
 * Resolve the file that carries one standard's current text.
 * @param spec - Spec file name.
 * @param resolution - Resolution from {@link resolveStandards}.
 * @returns Absolute spec path, or `undefined` when the source lacks it.
 */
export function resolveSpecPath(spec: string, resolution: StandardsResolution): string | undefined

/**
 * List the bundled contract files.
 * @returns File names under the bundled directory.
 */
export function listBundled(): string[]

/**
 * CLI entry.
 * @param argv - Arguments after the script path.
 * @returns Process exit code.
 */
export function main(argv: string[]): number
