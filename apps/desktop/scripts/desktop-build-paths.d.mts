/**
 * The Desktop release targets this repository packages.
 *
 * FORK DIVERGENCE (upstream packages mac-arm64, mac-x64, and win-x64 only):
 * `scripts/release/assemble-github-release.ts` validates exactly six targets, so
 * this union — not the three-target `DesktopAutoUpdateTarget` the COS deployment
 * defines — is what the build-path resolvers accept. Keeping the two apart is
 * what lets the release lane grow without inventing COS directories for targets
 * the update deployment does not host.
 */
export type DesktopBuildTarget =
  | 'mac-arm64'
  | 'mac-x64'
  | 'win-x64'
  | 'win-arm64'
  | 'linux-x64'
  | 'linux-arm64'

/** Mutable target directories plus the shared immutable download cache. */
export interface DesktopTargetBuildPaths {
  readonly root: string
  readonly artifacts: string
  readonly runtime: string
  readonly packageSet: string
  readonly dsh: string
  readonly dshPnpm: string
  readonly nodeExtract: string
  readonly packedDsh: string
  readonly packedVendor: string
  readonly packedLandlock: string
  readonly downloads: string
}

/**
 * Resolve the fixed build target selected by a packaging environment.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no target override exists.
 * @param hostArch - Build-host architecture used when no target override exists.
 * @returns Supported Desktop target name.
 */
export function resolveDesktopBuildTarget(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): DesktopBuildTarget

/**
 * Return the mutable preparation and artifact directories owned by one release target.
 * @param target - Supported Desktop target name.
 * @returns Target paths plus the shared immutable download cache.
 */
export function desktopTargetBuildPaths(target: DesktopBuildTarget): DesktopTargetBuildPaths

/**
 * Resolve the paths owned by the target selected in a packaging environment.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no target override exists.
 * @param hostArch - Build-host architecture used when no target override exists.
 * @returns Selected target paths.
 */
export function resolveDesktopTargetBuildPaths(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): DesktopTargetBuildPaths
