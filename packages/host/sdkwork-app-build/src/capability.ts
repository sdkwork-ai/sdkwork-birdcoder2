/**
 * Command capability: what one catalog command needs from the host, and
 * whether the host in front of it can actually run it.
 *
 * Why the host decides instead of the menu: only the host knows
 * `process.platform`, `process.arch`, PATH, and the real tree. A renderer-side
 * guess cannot be right — a browser or remote composition is not the build
 * host at all, and no user-agent sniff can see a missing toolchain.
 *
 * The rules below are the ones the app roots themselves enforce, so a row the
 * catalog offers and a run the seam accepts cannot disagree:
 *
 * - `apps/desktop`'s `package-target.ts` refuses a `win-*` target off Windows,
 *   a `linux-*` target off Linux and a `mac-*` target off macOS, and requires
 *   Apple Silicon for `mac-arm64`.
 * - `flutter build ipa` needs a macOS host with Xcode; `flutter build
 *   appbundle` needs the Flutter SDK and an Android SDK.
 * - An app root whose script hands `node`/`tsx` a file that is not on disk
 *   cannot run anywhere, whatever the host looks like.
 *
 * A command is described by its *requirements* plus a verdict over the host's
 * facts. The verdict is computed here, once, so every consumer renders the
 * same answer instead of re-deriving it.
 */

import { delimiter, join } from 'node:path'
import { existsSync } from 'node:fs'
import type {
  SdkworkAppBuildCommandAssessment,
  SdkworkAppBuildCommandBlock,
  SdkworkAppBuildCommandRequirements,
  SdkworkAppBuildHostArch,
  SdkworkAppBuildHostFacts,
  SdkworkAppBuildHostOs,
} from './types.ts'

export type * from './types.ts'

/** Every host OS, for commands that run everywhere. */
const ALL_HOST_OS: readonly SdkworkAppBuildHostOs[] = ['windows', 'macos', 'linux']

/** Android SDK roots, either of which satisfies an Android build. */
const ANDROID_SDK_VARIABLES: readonly string[] = ['ANDROID_HOME', 'ANDROID_SDK_ROOT']

/**
 * One capability rule: the tokens that select it and what it demands.
 *
 * Rules are evaluated in declaration order and the FIRST match supplies the
 * whole requirement set — so a narrower rule must precede the rule it
 * specialises (`mac` + `arm64` before bare `mac`).
 */
interface CapabilityRule {
  /** Tokens any of which selects the rule: alternative spellings of one target. */
  anyOf?: readonly string[]
  /**
   * Tokens ALL of which must be present: a compound target whose two halves
   * arrive as separate words (`package:mac:arm64` and `mac-arm64` both split
   * into `mac` + `arm64`). Without this, `anyOf` would let `linux-arm64`
   * select the Apple-Silicon rule on the strength of its `arm64` half alone.
   */
  allOf?: readonly string[]
  /** Families the rule is scoped to; when empty it applies to every family. */
  families: readonly string[]
  /** Host OSes able to run the command; when undefined, every OS can. */
  hostOs?: readonly SdkworkAppBuildHostOs[]
  /** Host CPU the command additionally requires. */
  hostArch?: SdkworkAppBuildHostArch
  /** Executables the command needs on PATH. */
  tools?: readonly string[]
  /** Requirement groups each satisfied by setting ANY of their variables. */
  environmentAnyOf?: readonly (readonly string[])[]
}

/**
 * Capability rules, most specific first. Order is load-bearing: the first
 * match wins, so the Apple-Silicon rule sits above bare `mac`.
 */
const RULES: readonly CapabilityRule[] = [
  // ---- Desktop packaging: `apps/desktop/scripts/package-target.ts` selectors.
  {
    allOf: ['mac', 'arm64'], families: ['desktop'], hostOs: ['macos'], hostArch: 'arm64',
  },
  { anyOf: ['win'], families: ['desktop'], hostOs: ['windows'] },
  { anyOf: ['linux'], families: ['desktop'], hostOs: ['linux'] },
  { anyOf: ['mac'], families: ['desktop'], hostOs: ['macos'] },
  // ---- Flutter: the iOS lane is macOS + Xcode; the Android lane needs the SDK.
  {
    anyOf: ['ios', 'ipa'],
    families: ['flutter-mobile', 'ios'],
    hostOs: ['macos'],
    tools: ['flutter', 'xcodebuild'],
  },
  {
    anyOf: ['android', 'apk', 'aab', 'appbundle'],
    families: ['flutter-mobile', 'android'],
    environmentAnyOf: [ANDROID_SDK_VARIABLES],
    tools: ['flutter'],
  },
  { families: ['flutter-mobile'], tools: ['flutter'] },
  // ---- HarmonyOS builds run through DevEco Studio's hvigor, which exists on
  // Windows and macOS only (there is no Linux build of it).
  { anyOf: ['harmony', 'hvigor', 'deveco'], families: [], hostOs: ['windows', 'macos'], tools: ['hvigorw'] },
  { families: ['harmony'], hostOs: ['windows', 'macos'], tools: ['hvigorw'] },
  // ---- A standalone Android root needs an Android SDK wherever it runs.
  { families: ['android'], environmentAnyOf: [ANDROID_SDK_VARIABLES] },
  // ---- A standalone iOS root needs Xcode, so macOS.
  { families: ['ios'], hostOs: ['macos'], tools: ['xcodebuild'] },
]

/**
 * Map a Node.js platform id onto the capability vocabulary.
 * @param platform - `process.platform` value.
 * @returns the host OS; anything unrecognised is treated as Linux, matching
 *   how the rest of the toolchain branches on `win32`/`darwin` alone.
 */
export function hostOsOf(platform: string): SdkworkAppBuildHostOs {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  return 'linux'
}

/**
 * Map a Node.js architecture id onto the capability vocabulary.
 * @param arch - `process.arch` value.
 * @returns `arm64` for an ARM64 host, `x64` otherwise. Only one rule reads
 *   this (`mac-arm64` needs Apple Silicon), so collapsing every other value
 *   onto `x64` is deliberate: no desktop target distinguishes among them.
 */
export function hostArchOf(arch: string): SdkworkAppBuildHostArch {
  return arch === 'arm64' ? 'arm64' : 'x64'
}

/**
 * Build the host facts for one probe. Reads the live process and environment
 * by default; both are injectable so tests need no particular machine.
 *
 * `hasTool` caches per name: a probe asks about the same few tools for every
 * command in the catalog, and each miss otherwise walks the whole PATH.
 * @param environment - process environment to read PATH and variables from.
 * @returns the host facts.
 */
export function createHostFacts(
  environment: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  arch: string = process.arch,
): SdkworkAppBuildHostFacts {
  const pathEntries = (environment.PATH ?? '').split(delimiter).filter(entry => entry !== '')
  // Windows resolves a bare name through PATHEXT; the extensions below are the
  // ones an executable build tool can actually carry.
  const extensions = platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']
  const toolCache = new Map<string, boolean>()
  return {
    os: hostOsOf(platform),
    arch: hostArchOf(arch),
    hasTool: (name) => {
      const cached = toolCache.get(name)
      if (cached !== undefined) return cached
      const found = pathEntries.some(
        entry => extensions.some(extension => existsSync(join(entry, `${name}${extension}`))),
      )
      toolCache.set(name, found)
      return found
    },
    hasEnvironmentVariable: name => (environment[name] ?? '').trim() !== '',
    fileExists: path => existsSync(path),
  }
}

/**
 * Split a script into the whole words a rule matches on. The script NAME and
 * its command BODY both feed this: a target can be named only in the script
 * (`build:flutter-ios:prod`) or only in the command line it runs
 * (`tsx scripts/package-target.ts mac-arm64`), and real roots do both.
 * @param script - package.json script name.
 * @param body - the command string that script runs.
 * @returns the lower-cased token set.
 */
export function capabilityTokensOf(script: string, body: string): ReadonlySet<string> {
  return new Set(`${script} ${body}`.toLowerCase().split(/[^a-z0-9]+/u).filter(token => token !== ''))
}

/**
 * The files a script hands to `node`/`tsx`, relative to the app root.
 *
 * Only direct entries are collected: a script that runs an interpreter on a
 * file can be checked for that file's existence before anything is spawned,
 * which is the difference between "the script is declared" and "the script can
 * work". Package-manager indirection (`pnpm run x`) deliberately is not
 * followed — that would need the dependency graph, not the tree.
 * @param body - the command string a script runs.
 * @returns the entry paths in the order they appear.
 */
export function scriptEntryPathsOf(body: string): readonly string[] {
  const paths: string[] = []
  const pattern = /(?:^|[\s&|(])(?:node|tsx)\s+(?<path>\S+\.(?:mjs|cjs|jsx?|tsx?))(?=\s|$|[&|)])/gu
  for (const match of body.matchAll(pattern)) {
    const path = match.groups?.path
    if (path !== undefined) paths.push(path)
  }
  return paths
}

/**
 * Derive what one command needs from the host.
 * @param script - package.json script name.
 * @param familyId - family owning the app root.
 * @param body - the command string the script runs.
 * @returns the requirements: host OSes, host CPU, tools, environment groups.
 */
export function requirementsOf(
  script: string, familyId: string, body: string,
): SdkworkAppBuildCommandRequirements {
  const tokens = capabilityTokensOf(script, body)
  // First match wins, so a narrow rule must precede the rule it specialises.
  const rule = RULES.find(candidate =>
    (candidate.families.length === 0 || candidate.families.includes(familyId))
    && (candidate.anyOf?.some(token => tokens.has(token)) ?? true)
    && (candidate.allOf?.every(token => tokens.has(token)) ?? true))
  return {
    hostOs: rule?.hostOs ?? ALL_HOST_OS,
    hostArch: rule?.hostArch ?? null,
    tools: rule?.tools ?? [],
    environmentAnyOf: rule?.environmentAnyOf ?? [],
  }
}

/**
 * Judge one command's requirements against a host.
 *
 * Precedence is structural-first: an unsatisfiable platform or CPU is reported
 * before a missing entry, and a missing entry before a missing tool, because
 * fixing a toolchain on the wrong OS changes nothing.
 * @param requirements - what the command needs.
 * @param entryPaths - app-root-relative files the script hands to node/tsx.
 * @param rootPath - absolute app-root path the entries resolve against.
 * @param facts - host facts.
 * @returns the verdict: runnable, the blocking reason, and the unmet names.
 */
export function assessCommand(
  requirements: SdkworkAppBuildCommandRequirements,
  entryPaths: readonly string[],
  rootPath: string,
  facts: SdkworkAppBuildHostFacts,
): { runnable: boolean; blockedBy: SdkworkAppBuildCommandBlock | null; missing: readonly string[] } {
  if (!requirements.hostOs.includes(facts.os)) {
    return { runnable: false, blockedBy: 'platform-unsupported', missing: requirements.hostOs }
  }
  if (requirements.hostArch !== null && requirements.hostArch !== facts.arch) {
    return { runnable: false, blockedBy: 'architecture-unsupported', missing: [requirements.hostArch] }
  }
  const missingEntries = entryPaths.filter(path => !facts.fileExists(join(rootPath, path)))
  if (missingEntries.length > 0) {
    return { runnable: false, blockedBy: 'entry-missing', missing: missingEntries }
  }
  const missingTools = requirements.tools.filter(tool => !facts.hasTool(tool))
  const missingGroups = requirements.environmentAnyOf.filter(
    group => !group.some(name => facts.hasEnvironmentVariable(name)),
  )
  const missing = [...missingTools, ...missingGroups.map(group => group.join(' | '))]
  if (missing.length > 0) return { runnable: false, blockedBy: 'toolchain-missing', missing }
  return { runnable: true, blockedBy: null, missing: [] }
}


/**
 * Assess one discovered script end to end: requirements, entries, verdict.
 * @param script - package.json script name.
 * @param familyId - family owning the app root.
 * @param body - the command string the script runs.
 * @param rootPath - absolute app-root path.
 * @param facts - host facts.
 * @returns the full assessment the catalog carries per command.
 */
export function assessScript(
  script: string, familyId: string, body: string, rootPath: string, facts: SdkworkAppBuildHostFacts,
): SdkworkAppBuildCommandAssessment {
  const requirements = requirementsOf(script, familyId, body)
  const verdict = assessCommand(requirements, scriptEntryPathsOf(body), rootPath, facts)
  return { requirements, ...verdict }
}
