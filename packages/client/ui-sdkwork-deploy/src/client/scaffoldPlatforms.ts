/**
 * Scaffold platform vocabulary and its mapping onto the artifact package
 * types. The ids extend the storefront's canonical four (`H5 | PC | FLUTTER |
 * MINIPROGRAM`) with the remaining SDKWork app families; the wire field
 * (`deploy_app_scaffold_version.platform_targets`) is free-form, so the
 * vocabulary lives here as the single client-side source of truth.
 */


/** One selectable scaffold platform. */
export interface ScaffoldPlatformOption {
  /** Wire token recorded into `platform_targets`. */
  readonly id: string
  /** Dictionary key of the display label (`deploy` namespace). */
  readonly labelKey: string
}

/** The platforms a scaffold can target, storefront-canonical four first. */
export const SCAFFOLD_PLATFORM_OPTIONS: readonly ScaffoldPlatformOption[] = [
  { id: 'H5', labelKey: 'scaffold.platform.h5' },
  { id: 'PC', labelKey: 'scaffold.platform.pc' },
  { id: 'FLUTTER', labelKey: 'scaffold.platform.flutter' },
  { id: 'MINIPROGRAM', labelKey: 'scaffold.platform.miniprogram' },
  { id: 'DESKTOP', labelKey: 'scaffold.platform.desktop' },
  { id: 'ANDROID', labelKey: 'scaffold.platform.android' },
  { id: 'IOS', labelKey: 'scaffold.platform.ios' },
  { id: 'HARMONY', labelKey: 'scaffold.platform.harmony' },
  { id: 'STATIC_WEB', labelKey: 'scaffold.platform.staticWeb' },
] as const

/** Manifest/console platform vocabularies → the scaffold platform ids. */
const SCAFFOLD_PLATFORM_ALIASES: Readonly<Record<string, string>> = {
  H5: 'H5',
  PC: 'PC',
  WEB: 'PC',
  DESKTOP_WEB: 'PC',
  APP_IOS: 'IOS',
  IOS: 'IOS',
  CAPACITOR_IOS: 'IOS',
  APP_ANDROID: 'ANDROID',
  ANDROID: 'ANDROID',
  CAPACITOR_ANDROID: 'ANDROID',
  APP_HARMONY: 'HARMONY',
  HARMONY: 'HARMONY',
  HARMONYOS: 'HARMONY',
  MINIPROGRAM: 'MINIPROGRAM',
  MP: 'MINIPROGRAM',
  DESKTOP: 'DESKTOP',
  ELECTRON: 'DESKTOP',
  TAURI: 'DESKTOP',
  WINDOWS: 'DESKTOP',
  MACOS: 'DESKTOP',
  LINUX: 'DESKTOP',
  STATIC_WEB: 'STATIC_WEB',
  WEB_STATIC: 'STATIC_WEB',
  FLUTTER: 'FLUTTER',
}

/** Console type card → scaffold platform fallback when the manifest omits platforms. */
const CARD_SCAFFOLD_PLATFORMS: Readonly<Record<string, readonly string[]>> = {
  h5: ['H5'],
  'pc-web': ['PC'],
  desktop: ['DESKTOP'],
  'mini-program': ['MINIPROGRAM'],
  android: ['ANDROID'],
  ios: ['IOS'],
  harmonyos: ['HARMONY'],
  'static-web': ['STATIC_WEB'],
  'api-service': [],
}

/**
 * Map an app's declared platforms onto the scaffold platform vocabulary.
 * @param platforms - manifest `publish.platforms` values (canonical app tokens).
 * @param cardId - the console type card, used when the manifest declares none.
 * @returns unique scaffold platform ids in {@link SCAFFOLD_PLATFORM_OPTIONS}
 *   order; an empty list when the app names no scaffold surface.
 */
export function scaffoldPlatformIdsForApp(
  platforms: readonly string[],
  cardId?: string,
): string[] {
  const found = new Set<string>()
  for (const platform of platforms) {
    const normalized = platform.trim().toUpperCase()
    if (normalized === '') continue
    const aliases: Readonly<Record<string, string | undefined>> = SCAFFOLD_PLATFORM_ALIASES
    const mapped = normalized.startsWith('MP_') ? 'MINIPROGRAM' : aliases[normalized]
    if (mapped !== undefined) found.add(mapped)
  }
  if (found.size === 0 && cardId !== undefined) {
    for (const id of CARD_SCAFFOLD_PLATFORMS[cardId] ?? []) found.add(id)
  }
  return SCAFFOLD_PLATFORM_OPTIONS
    .map(option => option.id)
    .filter(id => found.has(id))
}

/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` for a WEB_STATIC archive. */
const PACKAGE_TYPE_WEB_STATIC = 1
/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` for a NATIVE_APP archive. */
const PACKAGE_TYPE_NATIVE_APP = 2
/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` for a MINI_PROGRAM archive. */
const PACKAGE_TYPE_MINI_PROGRAM = 3
/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` for a GENERIC archive. */
const PACKAGE_TYPE_GENERIC = 5

/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` → its `maxSizeMiB` ceiling. */
const PACKAGE_TYPE_MAX_MIB: Readonly<Record<number, number>> = {
  1: 512,
  2: 2048,
  3: 512,
  4: 2048,
  5: 2048,
}

/** Platform ids whose artifact is a static web package. */
const WEB_STATIC_PLATFORMS: readonly string[] = ['H5', 'STATIC_WEB']
/** Platform ids whose artifact is a mini-program package. */
const MINI_PROGRAM_PLATFORMS: readonly string[] = ['MINIPROGRAM']

/**
 * The artifact package type an uploaded scaffold source registers as.
 * @param platforms - the selected platform ids.
 * @returns the package type value from `DEPLOY_PACKAGE_TYPE_OPTIONS`: a
 *   single-platform selection picks its native type, anything mixed or empty
 *   falls back to the generic package.
 */
export function packageTypeForPlatforms(platforms: readonly string[]): number {
  if (platforms.length === 1) {
    const platform = platforms[0]
    if (WEB_STATIC_PLATFORMS.includes(platform)) return PACKAGE_TYPE_WEB_STATIC
    if (MINI_PROGRAM_PLATFORMS.includes(platform)) return PACKAGE_TYPE_MINI_PROGRAM
    return PACKAGE_TYPE_NATIVE_APP
  }
  return PACKAGE_TYPE_GENERIC
}

/**
 * The byte cap the package type's registration accepts.
 * @param packageType - a `DEPLOY_PACKAGE_TYPE_OPTIONS.value`.
 * @returns the option's `maxSizeMiB` in bytes, defaulting to the generic cap
 *   when the value is unknown.
 */
export function maxBytesForPackageType(packageType: number): number {
  // Mirrors `DEPLOY_PACKAGE_TYPE_OPTIONS.maxSizeMiB` in the publishing console;
  // the table lives here so the app scan and packer do not pull the whole
  // console component graph (and its CSS) into the client module graph.
  const maxMiB = PACKAGE_TYPE_MAX_MIB[packageType] ?? 2048
  return maxMiB * 1024 * 1024
}

/**
 * Derive the source-repository key a git URL binds under: the last URL path
 * segment without its `.git` suffix (the console's repoKey convention).
 * @param repoUrl - an https clone URL.
 * @returns the key, or the raw URL tail when the URL carries no path.
 */
export function repoKeyFromUrl(repoUrl: string): string {
  const tail = repoUrl.trim().replace(/\/+$/u, '').split('/').pop() ?? repoUrl
  return tail.replace(/\.git$/iu, '') || repoUrl
}

/** Provider implied by a clone URL's host, for the hosts the console names. */
export function repoProviderFromUrl(
  repoUrl: string,
): 'GITHUB' | 'GITEE' | 'GITLAB' | 'SELF_HOSTED' {
  let host: string
  try {
    host = new URL(repoUrl.trim()).host.toLowerCase()
  } catch {
    return 'SELF_HOSTED'
  }
  if (host === 'github.com') return 'GITHUB'
  if (host === 'gitee.com') return 'GITEE'
  if (host.includes('gitlab')) return 'GITLAB'
  return 'SELF_HOSTED'
}
