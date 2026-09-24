/** Resolve build-owned Desktop paths without sharing mutable state across release targets. */

import { join, resolve } from 'node:path'

const APP_ROOT = resolve(import.meta.dirname, '..')
const BUILD_ROOT = join(APP_ROOT, '.desktop-build')
// FORK DIVERGENCE (upstream packages mac-arm64, mac-x64 and win-x64 only): the
// fork publishes a six-target GitHub Release — Windows x64/arm64, macOS x64/arm64
// and Linux x64/arm64 — and scripts/release/assemble-github-release.ts validates
// exactly that asset set, so every one of those target paths must resolve here.
const SUPPORTED_TARGETS = new Set([
  'mac-arm64',
  'mac-x64',
  'win-x64',
  'win-arm64',
  'linux-x64',
  'linux-arm64',
])

/**
 * Resolve the fixed build target selected by a packaging environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64' | 'linux-x64' | 'linux-arm64'} Supported Desktop target name.
 */
export function resolveDesktopBuildTarget(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  const platform = env.DSH_DESKTOP_TARGET_PLATFORM ?? env.npm_config_platform ?? hostPlatform
  const arch = env.DSH_DESKTOP_TARGET_ARCH ?? env.npm_config_arch ?? hostArch
  const os = platform === 'darwin' ? 'mac' : platform === 'win32' || platform === 'win' ? 'win' : platform
  const target = `${os}-${arch}`
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`desktop build paths: unsupported target ${target}`)
  }
  return /** @type {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64' | 'linux-x64' | 'linux-arm64'} */ (target)
}

function assertSupportedTarget(target) {
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`desktop build paths: unsupported target ${String(target)}`)
  }
}

/**
 * Return the mutable preparation and artifact directories owned by one release target.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64' | 'linux-x64' | 'linux-arm64'} target - Supported Desktop target name.
 * @returns {{ root: string, artifacts: string, unsignedArtifacts: string, runtime: string, packageSet: string, dsh: string, dshPnpm: string, electron: string, packedDsh: string, packedVendor: string, packedLandlock: string, downloads: string }} Target paths plus the shared immutable download cache.
 */
export function desktopTargetBuildPaths(target) {
  assertSupportedTarget(target)
  const root = join(BUILD_ROOT, 'targets', target)
  const packed = join(root, 'packed')
  return {
    root,
    artifacts: join(root, 'artifacts'),
    unsignedArtifacts: join(root, 'unsigned-artifacts'),
    runtime: join(root, 'runtime'),
    packageSet: join(root, 'package-set'),
    dsh: join(root, 'dsh'),
    dshPnpm: join(root, 'dsh-pnpm'),
    electron: join(root, 'electron'),
    packedDsh: join(packed, 'dsh'),
    packedVendor: join(packed, 'vendor'),
    packedLandlock: join(packed, 'landlock'),
    downloads: join(BUILD_ROOT, 'downloads'),
  }
}

/**
 * Return the platform and architecture of the payload one release target prepares.
 * FORK DIVERGENCE (upstream describes its three auto-update targets here and prepares Windows
 * as x64 only): the fork prepares Linux and Windows arm64 too, so both fields are read off the
 * target itself. The upstream form reported every target other than `mac-arm64` / `win-x64` as
 * macOS x64, which mislabels a Linux or Windows arm64 development payload.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64' | 'linux-x64' | 'linux-arm64'} target - Supported Desktop target name.
 * @returns {{ platform: 'darwin' | 'win32' | 'linux', arch: 'arm64' | 'x64' }} Platform and architecture of the prepared payload.
 */
export function desktopTargetPlatform(target) {
  assertSupportedTarget(target)
  return {
    platform: /** @type {'darwin' | 'win32' | 'linux'} */ (
      target.startsWith('mac-') ? 'darwin' : target.startsWith('win-') ? 'win32' : 'linux'),
    arch: /** @type {'arm64' | 'x64'} */ (target.endsWith('-arm64') ? 'arm64' : 'x64'),
  }
}

/**
 * Resolve the paths owned by the target selected in a packaging environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {ReturnType<typeof desktopTargetBuildPaths>} Selected target paths.
 */
export function resolveDesktopTargetBuildPaths(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  return desktopTargetBuildPaths(resolveDesktopBuildTarget(env, hostPlatform, hostArch))
}

/**
 * Resolve the primary-runtime directory an unpackaged development launch uses.
 * FORK DIVERGENCE (upstream prepares Windows as x64 only, so its launcher cannot derive this
 * directory from the architecture of the process that launched it): the fork packages Windows
 * arm64 as well, so the directory follows the selected build target, and only the
 * DSH_DESKTOP_TARGET_PLATFORM / DSH_DESKTOP_TARGET_ARCH overrides move it away from the host.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {string} Primary-runtime directory prepared for the selected target.
 */
export function developmentRuntimeDirectory(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  return join(resolveDesktopTargetBuildPaths(env, hostPlatform, hostArch).runtime, 'primary-runtime')
}
