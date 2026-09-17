/**
 * Workspace app-family catalog: probe a workspace's `apps/` tree for the
 * client families it declares and the compile/package scripts each app root
 * can actually run.
 *
 * Why probe instead of declaring the matrix: the standard fixes the family
 * names but not the command set. Real workspaces differ — sdkwork-webserver
 * ships a `demo` environment sdkwork-birdcoder2 lacks, sdkwork-drive has no H5
 * root at all, and the `:cloud` profile suffix is not universal. A menu built
 * from a hard-coded matrix would offer rows that fail on click; a menu built
 * from this catalog only ever offers rows backed by a real script.
 *
 * Each command additionally carries the capability verdict for the host that
 * probed it (see `capability.ts`): a real script and a runnable script are two
 * different facts, and only this side can tell them apart.
 *
 * The probe never rejects. An unreadable workspace yields an empty catalog
 * with every standard family reported missing, so the menu degrades to
 * showing nothing runnable instead of failing to open.
 */

import { join } from 'node:path'
import { assessScript } from './capability.ts'
import type {
  SdkworkAppBuildCatalog,
  SdkworkAppBuildCommand,
  SdkworkAppBuildDeploymentProfile,
  SdkworkAppBuildFamily,
  SdkworkAppBuildHostFacts,
  SdkworkAppBuildMissingFamily,
} from './types.ts'

/** Filesystem seams the probe reads through (injected so tests need no real tree). */
export interface CatalogFsPort {
  /** Child directory names of a path; empty when it cannot be read. */
  directories(path: string): readonly string[]
  /** UTF-8 file contents of a path, or undefined when unreadable. */
  readFile(path: string): string | undefined
}

/**
 * Family suffixes recognised on an app-root directory name, longest first so
 * `flutter-mobile` wins over a hypothetical bare `mobile` tail and
 * `mini-program` is matched whole rather than split at its hyphen.
 */
const FAMILY_SUFFIXES: readonly string[] = [
  'flutter-mobile', 'mini-program', 'static-web', 'harmony', 'android', 'desktop', 'ios', 'h5', 'pc',
]

/**
 * Families the standard enumerates for client surfaces, in menu order. Each
 * one is represented in the catalog: discovered families carry their
 * commands, the rest carry an absence reason. `ios` is deliberately absent —
 * iOS artifacts are built from the flutter-mobile app root, so they surface
 * as a variant of that family rather than a family with no root of its own.
 */
export const STANDARD_FAMILIES: readonly string[] = [
  'h5', 'pc', 'flutter-mobile', 'mini-program', 'desktop', 'harmony',
]

/**
 * Families whose build command does not exist anywhere in the toolchain yet,
 * as opposed to families this workspace merely does not carry. Reported
 * verbatim so the menu can distinguish "not here" from "not built yet".
 */
const UNWIRED_FAMILIES: readonly string[] = ['harmony']

/** Environment aliases the SDKWork scripts name after the leading verb. */
const ENVIRONMENT_ALIASES: readonly string[] = [
  'dev', 'development', 'test', 'staging', 'demo', 'prod', 'production',
]

/** Deployment-profile segments a script name may pin. */
const DEPLOYMENT_PROFILES: readonly SdkworkAppBuildDeploymentProfile[] = ['standalone', 'cloud']

/** Label used when a script name carries no variant segment at all (`build`). */
const DEFAULT_VARIANT = 'default'

/** Menu action a script backs. */
type CommandKind = 'build' | 'package'

/**
 * Parse the family id out of an app-root directory name.
 * @param directoryName - basename of one `apps/` child, e.g. `sdkwork-birdcoder2-h5`.
 * @returns the family id, or undefined when the name denotes no standard family.
 */
export function familyIdOf(directoryName: string): string | undefined {
  const lower = directoryName.toLowerCase()
  for (const suffix of FAMILY_SUFFIXES) {
    if (lower === suffix || lower.endsWith(`-${suffix}`)) return suffix
  }
  return undefined
}

/**
 * Classify one script name into the menu action it backs. Compile rows are
 * `build`/`build:*`; packaging rows are `package`/`package:*` and
 * `release:package*`. Everything else (dev, test, check, verify, workflow,
 * lint, typecheck) is not a menu action and is left out.
 * @param script - a package.json script name.
 * @returns the action it backs, or undefined when it backs none.
 */
export function commandKindOf(script: string): CommandKind | undefined {
  if (script === 'build' || script.startsWith('build:')) return 'build'
  if (script === 'package' || script.startsWith('package:')) return 'package'
  if (script === 'release:package' || script.startsWith('release:package:')) return 'package'
  return undefined
}

/** First hyphen-delimited stem of a family id (`flutter-mobile` → `flutter`). */
function familyStem(familyId: string): string {
  const separator = familyId.indexOf('-')
  return separator === -1 ? familyId : familyId.slice(0, separator)
}

/**
 * Variant label for a command: the script's trailing segments with the
 * verb and any family-denoting segment stripped, joined by ` · `.
 *
 * - `build` under any family → the default label.
 * - `build:mini-program:prod` under mini-program → `prod`.
 * - `build:flutter-android` under flutter-mobile → `android`.
 * - `package:win:x64` under desktop → `win · x64`.
 * @param script - a package.json script name already classified as an action.
 * @param familyId - the family owning the app root.
 * @returns the menu-facing variant label.
 */
export function commandVariantOf(script: string, familyId: string): string {
  let tail = script.split(':').slice(1)
  if (tail[0] === 'package') tail = tail.slice(1)
  const head = tail[0]
  if (head !== undefined) {
    if (head === familyId) tail = tail.slice(1)
    else {
      const stem = familyStem(familyId)
      if (head.startsWith(`${stem}-`)) tail = [head.slice(stem.length + 1), ...tail.slice(1)]
    }
  }
  return tail.length === 0 ? DEFAULT_VARIANT : tail.join(' · ')
}

/**
 * Build one catalog command from a script name and the command it runs.
 * @param script - a package.json script name already classified as an action.
 * @param familyId - the family owning the app root.
 * @param body - the command string the script runs.
 * @param rootPath - absolute app-root path, for the entry-file check.
 * @param facts - host facts the capability verdict is computed against.
 * @returns the catalog command row.
 */
function commandOf(
  script: string, familyId: string, body: string, rootPath: string, facts: SdkworkAppBuildHostFacts,
): SdkworkAppBuildCommand {
  const segments = script.split(':')
  return {
    script,
    variant: commandVariantOf(script, familyId),
    environment: segments.find(segment => ENVIRONMENT_ALIASES.includes(segment)) ?? null,
    deploymentProfile: segments.find(
      (segment): segment is SdkworkAppBuildDeploymentProfile =>
        (DEPLOYMENT_PROFILES as readonly string[]).includes(segment),
    ) ?? null,
    ...assessScript(script, familyId, body, rootPath, facts),
  }
}

/**
 * Read the `scripts` map from a package.json body, preserving declaration
 * order.
 *
 * Bodies are kept, not just names: a target platform can be named only in the
 * command line (`tsx scripts/package-target.ts mac-arm64`) and the entry file
 * a script hands to `node`/`tsx` is only visible there, so name-only parsing
 * cannot judge either.
 * @param body - raw file text, or undefined when unreadable.
 * @returns script name → command string, in declaration order; empty when unavailable.
 */
function scriptBodiesOf(body: string | undefined): readonly (readonly [string, string])[] {
  if (body === undefined) return []
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null) return []
    const scripts = (parsed as { scripts?: unknown }).scripts
    if (typeof scripts !== 'object' || scripts === null) return []
    return Object.entries(scripts as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  } catch {
    return []
  }
}

/**
 * Build the catalog entry for one app root.
 * @param root - app-root directory basename.
 * @param rootPath - absolute path of the app root.
 * @param familyId - family parsed from the directory name.
 * @param fs - filesystem port.
 * @param facts - host facts the capability verdicts are computed against.
 * @returns the family row, or undefined when the root declares no action.
 */
function familyOf(
  root: string, rootPath: string, familyId: string, fs: CatalogFsPort, facts: SdkworkAppBuildHostFacts,
): SdkworkAppBuildFamily | undefined {
  const scripts = scriptBodiesOf(fs.readFile(join(rootPath, 'package.json')))
  const build: SdkworkAppBuildCommand[] = []
  const pack: SdkworkAppBuildCommand[] = []
  for (const [script, body] of scripts) {
    const kind = commandKindOf(script)
    if (kind === 'build') build.push(commandOf(script, familyId, body, rootPath, facts))
    if (kind === 'package') pack.push(commandOf(script, familyId, body, rootPath, facts))
  }
  if (build.length === 0 && pack.length === 0) return undefined
  return { id: familyId, root, rootPath, build, package: pack }
}

/**
 * Probe a workspace root for its buildable client families.
 * @param cwd - absolute workspace root (the same shape the build seam takes).
 * @param fs - filesystem port.
 * @param facts - host facts: the OS, CPU, PATH and tree the verdicts are made against.
 * @returns the catalog; never rejects.
 */
export function buildCatalog(
  cwd: string, fs: CatalogFsPort, facts: SdkworkAppBuildHostFacts,
): SdkworkAppBuildCatalog {
  const appsPath = join(cwd, 'apps')
  const families: SdkworkAppBuildFamily[] = []
  for (const name of fs.directories(appsPath)) {
    const familyId = familyIdOf(name)
    if (familyId === undefined) continue
    const rootPath = join(appsPath, name)
    const family = familyOf(name, rootPath, familyId, fs, facts)
    // A recognised root with no action (a `-common`-style shared package, or
    // an app root whose scripts are not wired yet) is not a menu family.
    if (family !== undefined) families.push(family)
  }
  const discovered = new Set(families.map(family => family.id))
  const missing: SdkworkAppBuildMissingFamily[] = STANDARD_FAMILIES
    .filter(id => !discovered.has(id))
    .map((id): SdkworkAppBuildMissingFamily => ({
      id,
      // Distinguish "this workspace has no such root" from "the toolchain has
      // no command for this family at all": the menu words them differently.
      reason: UNWIRED_FAMILIES.includes(id) ? 'toolchain-not-wired' : 'no-app-root',
    }))
  // Directory iteration order is filesystem-defined; sort into the standard's
  // family order so the menu rows are stable across machines and re-probes.
  const rank = new Map(STANDARD_FAMILIES.map((id, index) => [id, index]))
  families.sort((left, right) =>
    (rank.get(left.id) ?? STANDARD_FAMILIES.length) - (rank.get(right.id) ?? STANDARD_FAMILIES.length))
  return { cwd, families, missing }
}
