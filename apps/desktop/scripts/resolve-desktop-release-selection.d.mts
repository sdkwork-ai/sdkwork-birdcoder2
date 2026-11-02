import type { DesktopBuildTarget } from './desktop-build-paths.mjs'

/** One Desktop release run's version and the targets it packages. */
export interface DesktopReleaseSelection {
  /** Version every packaged installer carries. */
  readonly version: string
  /** Selected targets in release order. */
  readonly targets: readonly DesktopBuildTarget[]
  /** Whether the selection omits a target, which keeps the run out of publication. */
  readonly partial: boolean
}

/**
 * Resolve the version one release run packages and the targets it builds.
 * @param request - `version` is the version the caller requires (blank follows the manifest); `targets` is `all` or a comma-separated target list.
 * @param manifestVersion - Version the root manifest declares.
 * @returns The packaged version, the selected targets in release order, and whether the selection omits any target.
 * @throws If the version differs from the manifest, or the selection names an unknown, repeated, or empty target.
 */
export function resolveDesktopReleaseSelection(
  request: { version: string, targets: string },
  manifestVersion: string,
): DesktopReleaseSelection
