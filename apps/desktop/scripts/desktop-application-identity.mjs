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

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Product name Electron reads from the packaged manifest; upstream ships `DeepSeek Harness`. */
export const DESKTOP_PRODUCT_NAME = 'BirdCoder'

/**
 * Updater cache directory the packaged shell owns. electron-updater reads it from
 * the `updaterCacheDirName` field of the packaged `app-update.yml`; a packaged
 * shell without that file runs a disabled updater and owns no cache directory.
 */
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
 * Read the updater cache directory the packaged updater configuration names.
 *
 * electron-updater resolves its cache from the `updaterCacheDirName` field of the
 * `app-update.yml` packaged into Resources (a missing file disables the updater; a
 * missing field falls back to `app.name`). The file is the flat YAML
 * `serializeToYaml` writes, so one line match reads the field.
 *
 * @param resourcesDir - `<appOutDir>/resources` for the packed application.
 * @returns {string | undefined} The packaged cache directory, or undefined when the application ships no updater configuration or field.
 */
export function readPackagedUpdaterCacheDirName(resourcesDir) {
  const file = join(resourcesDir, 'app-update.yml')
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, 'utf8').split('\n').find(text => text.startsWith('updaterCacheDirName:'))
  if (line === undefined) return undefined
  const value = line.slice('updaterCacheDirName:'.length).trim()
  return value === '' ? undefined : value
}

/**
 * Point the packaged updater configuration at the cache directory the product owns.
 *
 * electron-builder derives the field from the scoped package `name` — which this
 * fork shares with upstream — and offers no override, so a lane whose packaged
 * configuration carries another application's cache directory is rewritten onto
 * {@link DESKTOP_UPDATER_CACHE_DIR_NAME} here, before
 * {@link verifyPackagedApplicationIdentity} reads the artifact back. Runs after
 * electron-builder's own `app-update.yml` writer: PublishManager registers its
 * `afterPack` listener before the configuration hooks.
 *
 * @param resourcesDir - `<appOutDir>/resources` for the packed application.
 * @param {string} cacheDirName - The cache directory the packaged shell must own.
 * @returns {boolean} True when a packaged configuration was rewritten.
 */
export function writePackagedUpdaterCacheDir(resourcesDir, cacheDirName) {
  const file = join(resourcesDir, 'app-update.yml')
  if (!existsSync(file)) return false
  const lines = readFileSync(file, 'utf8').split('\n')
  const index = lines.findIndex(text => text.startsWith('updaterCacheDirName:'))
  if (index === -1) return false
  lines[index] = `updaterCacheDirName: ${cacheDirName}`
  writeFileSync(file, lines.join('\n'))
  return true
}

/**
 * Assert that a packaged application carries the identity its packaging lane
 * intends, and that the shipped product owns its own updater cache.
 *
 * Both halves are verified on the artifact: the manifest is what Electron reads
 * for `app.name` and every path derived from it, and the packaged
 * `app-update.yml` is what electron-updater reads for the updater cache.
 * electron-builder's own `AppInfo.updaterCacheDirName` is not consulted — it folds
 * the scoped package `name` (which this fork shares with upstream) into
 * `@deepseek-aidsh-desktop-updater` regardless of the product name, so a lane that
 * trusted it would either fail every build or pass a cache directory the artifact
 * does not carry. A shell without a packaged updater configuration runs a
 * disabled updater and owns no cache directory, so the cache half applies only
 * when one ships. A lane that changes one without the other ships a shell whose
 * userData, single-instance lock and logs belong to another application.
 *
 * @param resourcesDir - `<appOutDir>/resources` for the packed application.
 * @param application - Product name the packaging lane resolved for this build.
 */
export function verifyPackagedApplicationIdentity(resourcesDir, application) {
  const manifest = JSON.parse(readAsarEntry(join(resourcesDir, 'app.asar'), 'package.json').toString('utf8'))
  if (manifest.productName !== application.productName) {
    throw new Error('desktop application identity: the packaged manifest carries '
      + `${JSON.stringify(manifest.productName ?? null)} as its productName; this lane packages ${JSON.stringify(application.productName)}. `
      + 'Electron names the application after the manifest, so the userData directory, single-instance lock and logs would '
      + 'not be the ones this lane registers. Carry the lane product name in extraMetadata as well as in productName.')
  }
  const updaterCacheDirName = readPackagedUpdaterCacheDirName(resourcesDir)
  if (application.productName === DESKTOP_PRODUCT_NAME && updaterCacheDirName !== undefined
    && updaterCacheDirName !== DESKTOP_UPDATER_CACHE_DIR_NAME) {
    throw new Error('desktop application identity: the packaged updater configuration names the cache directory '
      + `${JSON.stringify(updaterCacheDirName)}; expected ${JSON.stringify(DESKTOP_UPDATER_CACHE_DIR_NAME)}. `
      + 'A shared cache lets one application install the other application\'s downloaded update.')
  }
}
