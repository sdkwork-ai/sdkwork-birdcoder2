/**
 * Verify that one installed skill is complete: its `SKILL.md`, the files the
 * entrypoint links to, and every file its `skill.manifest.json` packages.
 */

/** One packaged file's entry in `skill.manifest.json`. */
export interface SkillPackageFile {
  /** Path relative to the skill directory. */
  readonly path: string
  /** Expected SHA-256 of the file, when the package records one. */
  readonly sha256?: string
}

/** The `skill.manifest.json` a packaged skill carries. */
export interface SkillPackageManifest {
  /** Skill name. */
  readonly name?: string
  /** Package version. */
  readonly version?: string
  /** Which rules the skill's links obey. */
  readonly scope?: string
  /** Every packaged file. */
  readonly files?: SkillPackageFile[]
  /** Files the skill needs beside its entrypoint. */
  readonly requires?: string[]
}

/** One completeness report. */
export interface SkillCheckReport {
  /** True when the entrypoint exists and nothing is missing. */
  readonly ok: boolean
  /** Skill directory the check read. */
  readonly skillDir: string
  /** Package manifest, when one exists. */
  readonly manifest?: SkillPackageManifest
  /** Files the skill declares or links to that are absent. */
  readonly missing: string[]
  /** Relative paths the entrypoint links to. */
  readonly referenced: string[]
}

/** This skill's directory. */
export const SKILL_DIR: string

/**
 * Read the package manifest.
 * @param directory - Skill directory; defaults to this skill.
 * @returns The parsed manifest, or `undefined` when absent or damaged.
 */
export function readManifest(directory?: string): SkillPackageManifest | undefined

/**
 * Collect the relative files the entrypoint names in markdown links.
 * @param directory - Skill directory; defaults to this skill.
 * @returns Relative paths the skill refers to.
 */
export function declaredReferences(directory?: string): string[]

/**
 * Check one installed package.
 * @param directory - Skill directory; defaults to this skill.
 * @returns The completeness report.
 */
export function selfCheck(directory?: string): SkillCheckReport

/**
 * CLI entry.
 * @param argv - Arguments after the script path.
 * @returns Process exit code.
 */
export function main(argv: string[]): number
