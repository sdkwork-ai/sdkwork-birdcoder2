/** Validate the assembled application, including native Office conversion outside ASAR. */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { resolveMacOSBundleDirectory } from './desktop-application-identity.mjs'
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

const paths = resolveDesktopTargetBuildPaths()
const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target.startsWith('win-')
const artifacts = values.unsigned ? paths.unsignedArtifacts : paths.artifacts
const directory = UNPACKED_DIRECTORIES[target]
if (directory === undefined) throw new Error(`desktop smoke: no packaged application directory for ${target}`)
const macOS = target === 'mac-x64' || target === 'mac-arm64'
const output = join(artifacts, directory)
const application = macOS ? join(output, resolveMacOSBundleDirectory(output)) : output
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
