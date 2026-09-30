/**
 * Fork-owned Electron application identity of the packaged BirdCoder desktop shell.
 *
 * FORK DIVERGENCE (upstream ships `DeepSeek Harness`): Electron names a packaged
 * application after the `productName` of the manifest inside `app.asar`, and falls
 * back to the scoped package `name` — `@deepseek-ai/dsh-desktop`, which this fork
 * shares with upstream — when the manifest carries no `productName`. Two installed
 * applications that resolve the same `app.name` also resolve the same `userData`
 * directory, and therefore the same Chromium single-instance lock, the same logs
 * directory, the same `keybindings.json`, the same background-close marker and the
 * same updater cache. Launching either one then quits the other as a duplicate
 * launch, and uninstalling either one deletes the other's state.
 *
 * Upstream's `productName` reaches the NSIS installer and the artifact names but
 * never the packaged manifest, because electron-builder merges only
 * `extraMetadata` into it. `verifyPackagedApplicationIdentity` therefore reads the
 * manifest back out of the built `app.asar` instead of trusting the configuration.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Product name Electron reads from the packaged manifest; upstream ships `DeepSeek Harness`. */
export const DESKTOP_PRODUCT_NAME = 'BirdCoder'

/** Updater cache directory electron-builder derives from that product name. */
export const DESKTOP_UPDATER_CACHE_DIR_NAME = 'birdcoder-updater'

/** Custom URL scheme the packaged shell registers; upstream registers `dsh`. */
export const DESKTOP_PROTOCOL_SCHEME = 'birdcoder'

/** Desktop command the installed launcher answers to; upstream installs `dsh`. */
export const DESKTOP_CLI_COMMAND_NAME = 'birdcoder'

/**
 * Read one entry out of an asar archive.
 *
 * The archive is `[UInt32LE 4][UInt32LE headerPickleSize]` followed by the header
 * pickle — its own payload size, then the JSON length and the JSON — followed by
 * the concatenated entry contents the header's offsets index.
 *
 * @param archive - Absolute `.asar` path.
 * @param name - Slash-separated entry name.
 * @returns Entry bytes.
 */
export function readAsarEntry(archive, name) {
  const buffer = readFileSync(archive)
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 4) {
    throw new Error(`desktop application identity: ${archive} is not an asar archive`)
  }
  const headerSize = buffer.readUInt32LE(4)
  const header = JSON.parse(buffer.subarray(16, 16 + buffer.readUInt32LE(12)).toString('utf8'))
  const node = name.split('/').reduce((current, segment) => current?.files?.[segment], header)
  if (node === undefined || node.offset === undefined || node.size === undefined) {
    throw new Error(`desktop application identity: ${archive} does not carry ${name}`)
  }
  const offset = 8 + headerSize + Number.parseInt(node.offset, 10)
  return buffer.subarray(offset, offset + node.size)
}

/**
 * Name the single `.app` bundle electron-builder wrote into one macOS output directory.
 *
 * The bundle is named from the packaging lane's `productFilename`, which is
 * `executableName` (`birdcoder`) on this fork. Reading the directory keeps a
 * renaming from silently pointing a packaging lane at a bundle that is not there:
 * upstream's `DeepSeek Harness.app` has already drifted out of this fork once.
 *
 * @param directory - macOS output directory electron-builder wrote.
 * @returns The bundle directory name to read the application from.
 */
export function resolveMacOSBundleDirectory(directory) {
  const [name, ...rest] = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.app'))
    .map(entry => entry.name)
  if (name === undefined || rest.length > 0) {
    const found = name === undefined ? 'none' : [name, ...rest].join(', ')
    throw new Error(`desktop application identity: expected one .app bundle in ${directory}, found ${found}`)
  }
  return name
}

/**
 * Assert that a packaged application carries the identity its packaging lane
 * intends, and that the shipped product owns its own updater cache.
 *
 * `application` is what electron-builder resolved for the installer, the artifact
 * names and the updater cache; the manifest is what Electron reads for `app.name`
 * and every path derived from it. A lane that changes one without the other ships
 * a shell whose userData, single-instance lock and logs belong to another
 * application.
 *
 * @param resourcesDir - `<appOutDir>/resources` for the packed application.
 * @param application - Product name and updater cache directory electron-builder resolved for this build.
 */
export function verifyPackagedApplicationIdentity(resourcesDir, application) {
  const manifest = JSON.parse(readAsarEntry(join(resourcesDir, 'app.asar'), 'package.json').toString('utf8'))
  if (manifest.productName !== application.productName) {
    throw new Error('desktop application identity: the packaged manifest carries '
      + `${JSON.stringify(manifest.productName ?? null)} as its productName; this lane packages ${JSON.stringify(application.productName)}. `
      + 'Electron names the application after the manifest, so the userData directory, single-instance lock and logs would '
      + 'not be the ones this lane registers. Carry the lane product name in extraMetadata as well as in productName.')
  }
  if (application.productName === DESKTOP_PRODUCT_NAME && application.updaterCacheDirName !== DESKTOP_UPDATER_CACHE_DIR_NAME) {
    throw new Error('desktop application identity: the updater cache directory is '
      + `${JSON.stringify(application.updaterCacheDirName)}; expected ${JSON.stringify(DESKTOP_UPDATER_CACHE_DIR_NAME)}. `
      + 'A shared cache lets one application install the other application\'s downloaded update.')
  }
}
