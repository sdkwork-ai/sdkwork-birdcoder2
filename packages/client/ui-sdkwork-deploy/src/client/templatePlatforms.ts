/**
 * Template platform vocabulary and its mapping onto the artifact package
 * types. The ids extend the storefront's canonical four (`H5 | PC | FLUTTER |
 * MINIPROGRAM`) with the remaining SDKWork app families; the wire field
 * (`deploy_app_template_version.platform_targets`) is free-form, so the
 * vocabulary lives here as the single client-side source of truth.
 */
import { DEPLOY_PACKAGE_TYPE_OPTIONS } from '@sdkwork/deployments-pc-console-publishing'

/** One selectable template platform. */
export interface TemplatePlatformOption {
  /** Wire token recorded into `platform_targets`. */
  readonly id: string
  /** Dictionary key of the display label (`deploy` namespace). */
  readonly labelKey: string
}

/** The platforms a template can target, storefront-canonical four first. */
export const TEMPLATE_PLATFORM_OPTIONS: readonly TemplatePlatformOption[] = [
  { id: 'H5', labelKey: 'template.platform.h5' },
  { id: 'PC', labelKey: 'template.platform.pc' },
  { id: 'FLUTTER', labelKey: 'template.platform.flutter' },
  { id: 'MINIPROGRAM', labelKey: 'template.platform.miniprogram' },
  { id: 'DESKTOP', labelKey: 'template.platform.desktop' },
  { id: 'ANDROID', labelKey: 'template.platform.android' },
  { id: 'IOS', labelKey: 'template.platform.ios' },
  { id: 'HARMONY', labelKey: 'template.platform.harmony' },
  { id: 'STATIC_WEB', labelKey: 'template.platform.staticWeb' },
] as const

/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` for a WEB_STATIC archive. */
const PACKAGE_TYPE_WEB_STATIC = 1
/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` for a NATIVE_APP archive. */
const PACKAGE_TYPE_NATIVE_APP = 2
/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` for a MINI_PROGRAM archive. */
const PACKAGE_TYPE_MINI_PROGRAM = 3
/** `DEPLOY_PACKAGE_TYPE_OPTIONS.value` for a GENERIC archive. */
const PACKAGE_TYPE_GENERIC = 5

/** Platform ids whose artifact is a static web package. */
const WEB_STATIC_PLATFORMS: readonly string[] = ['H5', 'STATIC_WEB']
/** Platform ids whose artifact is a mini-program package. */
const MINI_PROGRAM_PLATFORMS: readonly string[] = ['MINIPROGRAM']

/**
 * The artifact package type an uploaded template source registers as.
 * @param platforms - the selected platform ids.
 * @returns the package type value from `DEPLOY_PACKAGE_TYPE_OPTIONS`: a
 *   single-platform selection picks its native type, anything mixed or empty
 *   falls back to the generic package.
 */
export function packageTypeForPlatforms(platforms: readonly string[]): number {
  if (platforms.length === 1) {
    const platform = platforms[0]
    if (platform !== undefined && WEB_STATIC_PLATFORMS.includes(platform)) return PACKAGE_TYPE_WEB_STATIC
    if (platform !== undefined && MINI_PROGRAM_PLATFORMS.includes(platform)) return PACKAGE_TYPE_MINI_PROGRAM
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
  const option = DEPLOY_PACKAGE_TYPE_OPTIONS.find(entry => entry.value === packageType)
  const maxMiB = option?.maxSizeMiB ?? 2048
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
