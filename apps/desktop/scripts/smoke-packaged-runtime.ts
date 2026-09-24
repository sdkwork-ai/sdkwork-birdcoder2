/** Validate the assembled application, including native Office conversion outside ASAR. */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { readDesktopRuntime, verifyDesktopRuntime } from '../src/runtime-tree.ts'
import { verifyWindowsCode } from './windows-runtime-signature.mjs'
import { smokePreparedRuntime } from './smoke-prepared-runtime.ts'
import { resolveDesktopPackageTarget } from './package-target.ts'

/**
 * Directory electron-builder assembles the unpacked application into, per release target.
 * FORK DIVERGENCE: upstream packages mac-x64, mac-arm64 and win-x64, so it needs three
 * of these; the fork's six-target release needs all six.
 *
 * electron-builder appends the target architecture only when it differs from the
 * platform default (x64 everywhere), and macOS names the output directory after the
 * architecture itself, with the bundle nested inside.
 */
const UNPACKED_DIRECTORIES: Record<string, string | undefined> = {
  'win-x64': 'win-unpacked',
  'win-arm64': 'win-arm64-unpacked',
  'linux-x64': 'linux-unpacked',
  'linux-arm64': 'linux-arm64-unpacked',
  'mac-x64': 'mac',
  'mac-arm64': 'mac-arm64',
}

/**
 * Name the single application bundle electron-builder left in a macOS output directory.
 * The bundle is named from `executableName` (`birdcoder`, pinned by the fork's brand
 * contract), so read the directory instead of re-deriving a name that has already
 * drifted once — upstream's `DeepSeek Harness.app` no longer exists in this fork.
 * @param directory - macOS output directory electron-builder wrote.
 * @returns The bundle directory name to read the application from.
 */
function macOSBundleName(directory: string): string {
  const [name, ...rest] = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.app'))
    .map(entry => entry.name)
  if (name === undefined || rest.length > 0) {
    const found = name === undefined ? 'none' : [name, ...rest].join(', ')
    throw new Error(`desktop smoke: expected one .app bundle in ${directory}, found ${found}`)
  }
  return name
}

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()

/**
 * Longest Windows absolute path a packaged Office engine is allowed to reach.
 *
 * LibreOfficeKit opens `program/program/sofficeapp.dll` and `program/share/**` through
 * plain Win32 calls, which stop at `MAX_PATH`: an over-long root reports `Unknown
 * LibreOfficeKit exception`, `'stat'ed file does not exist` for a file that does exist, or
 * `文件名或扩展名太长` instead of a usable diagnostic. `MAX_PATH` leaves 259 usable
 * characters for the path itself.
 *
 * Measured against the shipped payload (`libreoffice-kit-win32-x64@0.1.0`, whose deepest
 * resource is
 * `program/share/config/soffice.cfg/modules/simpress/popupmenu/pagepanecanvasmaster.xml`
 * at 84 characters): the release lane's `DSH_DESKTOP_BUILD_ROOT` puts the engine root at
 * 136 characters and that resource at 221, and the conversion passes; 195 characters (this
 * checkout's own `.desktop-build`) and 202 (a CI workspace without the override) fail. The
 * check measures the packaged tree rather than trusting a constant, so a new engine payload
 * cannot quietly invalidate it, and it keeps `WINDOWS_PATH_HEADROOM` characters clear for
 * the names LibreOffice derives on its own (lock files, temporary conversions).
 */
const WINDOWS_PATH_LIMIT = 259
const WINDOWS_PATH_HEADROOM = 24

/**
 * Find the longest absolute path at or below a directory.
 * @param directory - Directory to measure.
 * @returns The longest absolute path found, or the directory itself when it is empty.
 */
function longestPath(directory: string): string {
  let longest = directory
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (path.length > longest.length) longest = path
    if (entry.isDirectory()) {
      const nested = longestPath(path)
      if (nested.length > longest.length) longest = nested
    }
  }
  return longest
}

/**
 * Fail early when the packaged tree sits deeper than the Office engine can load from. The
 * engine root is measured whether or not it was unpacked, so a directory that is too deep
 * always reports depth rather than the opaque conversion failure it causes.
 * @param resources - Packaged application resources directory.
 * @param target - Selected release target.
 */
function assertWindowsEnginePath(resources: string, target: string): void {
  if (!target.startsWith('win-')) return
  const engine = join(resources, 'app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai',
    `libreoffice-kit-win32-${target.endsWith('-arm64') ? 'arm64' : 'x64'}`)
  const longest = existsSync(engine) ? longestPath(engine) : engine
  const ceiling = WINDOWS_PATH_LIMIT - WINDOWS_PATH_HEADROOM
  if (longest.length > ceiling) {
    throw new Error(`desktop smoke: the packaged Office engine reaches a ${longest.length}-character Windows path `
      + `(${longest}), past the ${ceiling}-character ceiling LibreOfficeKit can open; `
      + 'point DSH_DESKTOP_BUILD_ROOT at a shorter directory before packaging')
  }
}

// FORK DIVERGENCE: upstream reserves `--unsigned` for Windows, so it rejects the flag on
// every other target. The fork's release lane packages all six targets unsigned, and the
// flag only selects the artifact directory electron-builder wrote to.
const windows = target.startsWith('win-')
const artifacts = values.unsigned ? paths.unsignedArtifacts : paths.artifacts
const directory = UNPACKED_DIRECTORIES[target]
if (directory === undefined) throw new Error(`desktop smoke: no packaged application directory for ${target}`)
const macOS = target === 'mac-x64' || target === 'mac-arm64'
const output = join(artifacts, directory)
const application = macOS ? join(output, macOSBundleName(output)) : output
const resources = macOS ? join(application, 'Contents', 'Resources') : join(application, 'resources')
assertWindowsEnginePath(resources, target)
// electron-builder names the executable from `executableName` ('birdcoder') and the mac
// bundle from the same name; see the builder config.
const executable = macOS ? join(application, 'Contents', 'MacOS', 'birdcoder')
  : join(application, windows ? 'birdcoder.exe' : 'birdcoder')
const descriptor = await verifyDesktopRuntime(paths.dsh, readDesktopRuntime(paths.dsh).release.version,
  resolveDesktopPackageTarget(target))
if (windows && !values.unsigned) await verifyWindowsCode(application)
await smokePreparedRuntime(join(resources, 'app.asar', 'dsh'), executable, join(resources, 'runtime'), descriptor)
