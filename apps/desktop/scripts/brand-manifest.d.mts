/**
 * OEM brand manifest: one JSON file per application brand, shared by the
 * packaging scripts and the Electron shell.
 *
 * Precedence: `DSH_BRAND_CONFIG` (an explicit manifest path) wins, then
 * `DSH_BRAND` (a key under `brands/`), then `birdcoder`.
 */

/** Environment variable naming one brand key under `brands/`. */
export const BRAND_ENV: 'DSH_BRAND'

/** Environment variable naming an explicit brand manifest path. */
export const BRAND_CONFIG_ENV: 'DSH_BRAND_CONFIG'

/** File name a packaged application carries its brand manifest under, inside `resources/`. */
export const BRAND_FILENAME: 'brand.json'

/** Brand shipped without a selection. */
export const DEFAULT_BRAND_KEY: 'birdcoder'

/** Directory holding the repository's brand manifests. */
export const BRAND_DIRECTORY: string

/** Harness home and legacy-adoption behavior of one brand. */
export interface DesktopBrandHome {
  /** Directory name under the operating-system home; dot-prefixed and lower case so two brands cannot collide. */
  readonly dirName: string
  /** Whether a first launch may take over the legacy `~/.dsh` data. */
  readonly adoptLegacyDshHome: boolean
}

/** Desktop application identity of one brand. */
export interface DesktopBrandDesktop {
  /** Reverse-DNS application identifier packaging falls back to when `DSH_DESKTOP_APP_ID` is unset. */
  readonly appId: string
  /** Electron product name; names userData, the single-instance lock and the logs directory. */
  readonly productName: string
  /** Installed executable (and macOS `MacOS/<name>`) every launcher names. */
  readonly executableName: string
  /** Custom URL scheme the installed shell registers. */
  readonly protocol: string
  /** Desktop command the installed launchers answer to. */
  readonly commandName: string
  /** Windows PATH-ownership registry key and mutex stem. */
  readonly registryKey: string
  /** electron-updater cache directory the packaged shell owns. */
  readonly updaterCacheDirName: string
  /** Release artifact stem before `-<version>-<os>-<arch>`. */
  readonly artifactPrefix: string
}

/** One validated brand manifest. */
export interface DesktopBrand {
  readonly schemaVersion: 1
  readonly key: string
  readonly displayName: string
  readonly companyName: string
  readonly home: DesktopBrandHome
  readonly desktop: DesktopBrandDesktop
}

/**
 * Resolve the manifest path a launch or packaging run selects.
 * @param env - Launch or packaging environment.
 * @param directory - Directory holding `<key>.json` manifests; defaults to the repository's `brands/`.
 * @returns Absolute manifest path.
 */
export function brandManifestPath(env: Record<string, string | undefined>, directory?: string): string

/**
 * Validate one parsed brand manifest and detach it from the caller's object.
 * @param raw - Parsed JSON value.
 * @param source - File or label named in validation errors.
 * @returns Frozen, normalized manifest.
 * @throws Error when a field is missing or malformed.
 */
export function parseBrandManifest(raw: unknown, source?: string): DesktopBrand

/**
 * Read and validate one brand manifest file.
 * @param filename - Absolute manifest path.
 * @returns Frozen manifest.
 * @throws Error when the file cannot be read, parsed or validated.
 */
export function readBrandManifest(filename: string): DesktopBrand

/**
 * Resolve the brand one launch or packaging run selects.
 * @param env - Launch or packaging environment.
 * @param directory - Directory holding `<key>.json` manifests; defaults to the repository's `brands/`.
 * @returns Frozen manifest.
 */
export function resolveBrand(env?: Record<string, string | undefined>, directory?: string): DesktopBrand

/**
 * The repository's shipped brand, read once.
 * @returns Frozen manifest of `brands/birdcoder.json`.
 */
export function shippedBrand(): DesktopBrand
