/**
 * Fork-owned Electron application identity of the packaged BirdCoder desktop shell.
 *
 * FORK DIVERGENCE (upstream ships `DeepSeek Harness`): Electron derives `app.name`
 * from the packaged manifest's `productName`, and an absent `productName` falls
 * back to the scoped package name this fork shares with upstream. Every OS
 * resource Electron derives from `app.name` — the userData directory, the Chromium
 * single-instance lock, the logs directory and the updater cache — is then shared
 * with an installed upstream application.
 */

/** Product name Electron reads from the packaged manifest; upstream ships `DeepSeek Harness`. */
export const DESKTOP_PRODUCT_NAME: 'BirdCoder'

/**
 * Updater cache directory the packaged shell owns. electron-updater reads it from
 * the `updaterCacheDirName` field of the packaged `app-update.yml`; a packaged
 * shell without that file runs a disabled updater and owns no cache directory.
 */
export const DESKTOP_UPDATER_CACHE_DIR_NAME: 'birdcoder-updater'

/** Custom URL scheme the packaged shell registers; upstream registers `dsh`. */
export const DESKTOP_PROTOCOL_SCHEME: 'birdcoder'

/** Desktop command the installed launcher answers to; upstream installs `dsh`. */
export const DESKTOP_CLI_COMMAND_NAME: 'birdcoder'

/**
 * Read one entry out of an asar archive.
 * @param archive - Absolute `.asar` path.
 * @param name - Slash-separated entry name.
 * @returns Entry bytes.
 */
export function readAsarEntry(archive: string, name: string): Buffer

/**
 * Name the single `.app` bundle electron-builder wrote into one macOS output directory.
 * @param directory - macOS output directory electron-builder wrote.
 * @returns The bundle directory name to read the application from.
 */
export function resolveMacOSBundleDirectory(directory: string): string

/**
 * Read the updater cache directory the packaged updater configuration names.
 * @param resourcesDir - `<appOutDir>/resources` for the packed application.
 * @returns The packaged cache directory, or undefined when the application ships no updater configuration or field.
 */
export function readPackagedUpdaterCacheDirName(resourcesDir: string): string | undefined

/**
 * Point the packaged updater configuration at the cache directory the product owns.
 * @param resourcesDir - `<appOutDir>/resources` for the packed application.
 * @param cacheDirName - The cache directory the packaged shell must own.
 * @returns True when a packaged configuration was rewritten.
 */
export function writePackagedUpdaterCacheDir(resourcesDir: string, cacheDirName: string): boolean

/** Product identity one packaging lane resolved for the application it packs. */
export interface DesktopPackagedApplication {
  readonly productName: string
}

/**
 * Assert that a packaged application carries the identity its packaging lane
 * intends, and that the shipped product owns its own updater cache.
 * @param resourcesDir - `<appOutDir>/resources` for the packed application.
 * @param application - Product name the packaging lane resolved for this build.
 */
export function verifyPackagedApplicationIdentity(resourcesDir: string, application: DesktopPackagedApplication): void
