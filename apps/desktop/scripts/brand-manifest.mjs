/**
 * OEM brand manifest: one JSON file per application brand, shared by the
 * packaging scripts and the Electron shell.
 *
 * The manifest owns every value two applications on one machine must not share:
 * the Harness home directory name (so two brands keep separate sessions,
 * credentials, plugins and workspaces), the Electron product name (userData,
 * single-instance lock, logs), the URL scheme and desktop command, the updater
 * cache directory, and the artifact spelling. `brands/<key>.json` is the
 * build-time source; packaging copies the selected file into the application's
 * resources as `brand.json`, which is the runtime source.
 *
 * Precedence: `DSH_BRAND_CONFIG` (an explicit manifest path) wins, then
 * `DSH_BRAND` (a key under `brands/`), then `birdcoder`.
 *
 * @module brand-manifest
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Environment variable naming one brand key under `brands/`. */
export const BRAND_ENV = 'DSH_BRAND'
/** Environment variable naming an explicit brand manifest path. */
export const BRAND_CONFIG_ENV = 'DSH_BRAND_CONFIG'
/** File name a packaged application carries its brand manifest under, inside `resources/`. */
export const BRAND_FILENAME = 'brand.json'
/** Brand shipped without a selection. */
export const DEFAULT_BRAND_KEY = 'birdcoder'
/** Directory holding the repository's brand manifests. */
export const BRAND_DIRECTORY = fileURLToPath(new URL('../../../brands/', import.meta.url))

/** Values that belong to the upstream application and can never be a fork brand's own. */
const UPSTREAM_IDENTITY = Object.freeze({
  homeDirectory: '.dsh',
  productName: 'DeepSeek Harness',
  protocol: 'dsh',
  commandName: 'dsh',
  appId: 'com.deepseek.harness',
})

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/u
const HOME_DIRECTORY_PATTERN = /^\.[a-z0-9][a-z0-9._-]{0,63}$/u
const COMMAND_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u
const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]{0,31}$/u
const APP_ID_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u
const REGISTRY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u
const ARTIFACT_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/u
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u

/**
 * @typedef {object} DesktopBrandHome
 * @property {string} dirName - Directory name under the operating-system home; always dot-prefixed and lower case so two brands cannot collide on a case-insensitive filesystem.
 * @property {boolean} adoptLegacyDshHome - Whether a first launch may take over the legacy `~/.dsh` data.
 */

/**
 * @typedef {object} DesktopBrandDesktop
 * @property {string} appId - Reverse-DNS application identifier packaging falls back to when `DSH_DESKTOP_APP_ID` is unset.
 * @property {string} productName - Electron product name; names userData, the single-instance lock and the logs directory.
 * @property {string} executableName - Installed executable (and macOS `MacOS/<name>`) every launcher names.
 * @property {string} protocol - Custom URL scheme the installed shell registers.
 * @property {string} commandName - Desktop command the installed launchers answer to.
 * @property {string} registryKey - Windows PATH-ownership registry key and mutex stem.
 * @property {string} updaterCacheDirName - electron-updater cache directory the packaged shell owns.
 * @property {string} artifactPrefix - Release artifact stem before `-<version>-<os>-<arch>`.
 */

/**
 * @typedef {object} DesktopBrand
 * @property {1} schemaVersion
 * @property {string} key
 * @property {string} displayName
 * @property {string} companyName
 * @property {DesktopBrandHome} home
 * @property {DesktopBrandDesktop} desktop
 */

/**
 * Reject one field that would collide with the upstream application.
 * @param {string} value - Resolved field value.
 * @param {string} forbidden - Upstream value.
 * @param {string} where - Manifest field path used in the message.
 * @returns {void}
 */
function rejectUpstream(value, forbidden, where) {
  if (value.toLowerCase() === forbidden.toLowerCase()) {
    throw new Error(`brand: ${where} must not be ${JSON.stringify(forbidden)}; that identity belongs to the upstream application`)
  }
}

/**
 * Read one required non-empty string.
 * @param {Record<string, unknown>} source - Manifest object holding the field.
 * @param {string} key - Field name.
 * @param {string} where - Manifest field path used in the message.
 * @returns {string} Trimmed value.
 */
function requiredString(source, key, where) {
  const value = source[key]
  if (typeof value !== 'string') throw new Error(`brand: ${where} must be a string`)
  const text = value.trim()
  if (text === '') throw new Error(`brand: ${where} must not be empty`)
  if (CONTROL_CHARACTERS.test(text)) throw new Error(`brand: ${where} must not contain control characters`)
  return text
}

/**
 * Read one optional boolean.
 * @param {Record<string, unknown>} source - Manifest object holding the field.
 * @param {string} key - Field name.
 * @param {string} where - Manifest field path used in the message.
 * @returns {boolean | undefined} Declared value, or undefined.
 */
function optionalBoolean(source, key, where) {
  const value = source[key]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`brand: ${where} must be a boolean`)
  return value
}

/**
 * Read one required object section.
 * @param {Record<string, unknown>} source - Manifest root.
 * @param {string} key - Section name.
 * @returns {Record<string, unknown>} Section object.
 */
function section(source, key) {
  const value = source[key]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`brand: ${key} must be a JSON object`)
  }
  return /** @type {Record<string, unknown>} */ (value)
}

/**
 * Assert one field against its grammar.
 * @param {string} value - Field value.
 * @param {RegExp} pattern - Accepted shape.
 * @param {string} where - Manifest field path used in the message.
 * @param {string} expectation - Human-readable requirement appended to the message.
 * @returns {void}
 */
function matches(value, pattern, where, expectation) {
  if (!pattern.test(value)) throw new Error(`brand: ${where} must be ${expectation}; found ${JSON.stringify(value)}`)
}

/**
 * Validate one parsed brand manifest and detach it from the caller's object.
 *
 * Validation is strict on purpose: a typo in a home directory or scheme would
 * otherwise split one application's data across two homes, or make two brands
 * fight over one userData directory.
 * @param {unknown} raw - Parsed JSON value.
 * @param {string} source - File or label named in validation errors.
 * @returns {DesktopBrand} Frozen, normalized manifest.
 * @throws {Error} when a field is missing or malformed.
 */
export function parseBrandManifest(raw, source = 'brand manifest') {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`brand: ${source} must be a JSON object`)
  }
  const root = /** @type {Record<string, unknown>} */ (raw)
  if (root.schemaVersion !== 1) throw new Error(`brand: ${source}: schemaVersion must be 1`)
  const home = section(root, 'home')
  const desktop = section(root, 'desktop')

  const key = requiredString(root, 'key', 'key')
  matches(key, KEY_PATTERN, 'key', 'a lower-case key of letters, digits and dashes')

  const dirName = requiredString(home, 'dirName', 'home.dirName')
  matches(dirName, HOME_DIRECTORY_PATTERN, 'home.dirName', 'a lower-case dot-prefixed directory name')
  rejectUpstream(dirName, UPSTREAM_IDENTITY.homeDirectory, 'home.dirName')

  const productName = requiredString(desktop, 'productName', 'desktop.productName')
  matches(productName, /^[^\\/:*?"<>|]{1,64}$/u, 'desktop.productName', 'a name usable as a directory on every platform')
  rejectUpstream(productName, UPSTREAM_IDENTITY.productName, 'desktop.productName')

  const protocol = requiredString(desktop, 'protocol', 'desktop.protocol')
  matches(protocol, PROTOCOL_PATTERN, 'desktop.protocol', 'a lower-case URL scheme')
  rejectUpstream(protocol, UPSTREAM_IDENTITY.protocol, 'desktop.protocol')

  const commandName = requiredString(desktop, 'commandName', 'desktop.commandName')
  matches(commandName, COMMAND_PATTERN, 'desktop.commandName', 'a lower-case command name')
  rejectUpstream(commandName, UPSTREAM_IDENTITY.commandName, 'desktop.commandName')

  const appId = requiredString(desktop, 'appId', 'desktop.appId')
  matches(appId, APP_ID_PATTERN, 'desktop.appId', 'a reverse-DNS identifier')
  rejectUpstream(appId, UPSTREAM_IDENTITY.appId, 'desktop.appId')

  const executableName = requiredString(desktop, 'executableName', 'desktop.executableName')
  matches(executableName, COMMAND_PATTERN, 'desktop.executableName', 'a lower-case executable name')

  const registryKey = requiredString(desktop, 'registryKey', 'desktop.registryKey')
  matches(registryKey, REGISTRY_KEY_PATTERN, 'desktop.registryKey', 'a registry key name')

  const updaterCacheDirName = requiredString(desktop, 'updaterCacheDirName', 'desktop.updaterCacheDirName')
  matches(updaterCacheDirName, REGISTRY_KEY_PATTERN, 'desktop.updaterCacheDirName', 'a directory name')

  const artifactPrefix = requiredString(desktop, 'artifactPrefix', 'desktop.artifactPrefix')
  matches(artifactPrefix, ARTIFACT_PREFIX_PATTERN, 'desktop.artifactPrefix', 'an artifact-name prefix')

  return Object.freeze({
    schemaVersion: /** @type {1} */ (1),
    key,
    displayName: requiredString(root, 'displayName', 'displayName'),
    companyName: requiredString(root, 'companyName', 'companyName'),
    home: Object.freeze({
      dirName,
      adoptLegacyDshHome: optionalBoolean(home, 'adoptLegacyDshHome', 'home.adoptLegacyDshHome') ?? false,
    }),
    desktop: Object.freeze({
      appId, productName, executableName, protocol, commandName, registryKey, updaterCacheDirName, artifactPrefix,
    }),
  })
}

/**
 * Read and validate one brand manifest file.
 * @param {string} filename - Absolute manifest path.
 * @returns {DesktopBrand} Frozen manifest.
 * @throws {Error} when the file cannot be read, parsed or validated.
 */
export function readBrandManifest(filename) {
  let text
  try {
    text = readFileSync(filename, 'utf8')
  } catch (error) {
    throw new Error(`brand: cannot read ${filename}: ${String(error)}`, { cause: error })
  }
  let raw
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/u, ''))
  } catch (error) {
    throw new Error(`brand: ${filename} is not valid JSON`, { cause: error })
  }
  return parseBrandManifest(raw, filename)
}

/**
 * Resolve the manifest path a launch or packaging run selects.
 * @param {Record<string, string | undefined>} env - Launch or packaging environment.
 * @param {string} [directory] - Directory holding `<key>.json` manifests; defaults to the repository's `brands/`.
 * @returns {string} Absolute manifest path.
 */
export function brandManifestPath(env = process.env, directory = BRAND_DIRECTORY) {
  const configured = env[BRAND_CONFIG_ENV]?.trim()
  if (configured !== undefined && configured !== '') return isAbsolute(configured) ? configured : resolve(configured)
  const key = env[BRAND_ENV]?.trim() ?? ''
  return join(directory, `${key === '' ? DEFAULT_BRAND_KEY : key}.json`)
}

/**
 * Resolve the brand one launch or packaging run selects.
 * @param {Record<string, string | undefined>} env - Launch or packaging environment.
 * @param {string} [directory] - Directory holding `<key>.json` manifests; defaults to the repository's `brands/`.
 * @returns {DesktopBrand} Frozen manifest.
 */
export function resolveBrand(env = process.env, directory = BRAND_DIRECTORY) {
  return readBrandManifest(brandManifestPath(env, directory))
}

/** @type {DesktopBrand | undefined} */
let shipped

/**
 * The repository's shipped brand, read once.
 * @returns {DesktopBrand} Frozen manifest of `brands/birdcoder.json`.
 */
export function shippedBrand() {
  return shipped ??= readBrandManifest(join(BRAND_DIRECTORY, `${DEFAULT_BRAND_KEY}.json`))
}
