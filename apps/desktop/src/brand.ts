/**
 * Brand home: which Harness home this application brand owns, and how a first
 * launch moves the legacy `~/.dsh` data into it.
 *
 * Every user-data root — sessions, credentials, profiles, plugins, workspaces —
 * derives from `DSH_HOME`, which the launcher resolves before any plugin mounts.
 * A brand therefore cannot pick its home from `oem.json`: that file already lives
 * inside the home. The home directory name comes from the packaged brand
 * manifest instead (`resources/brand.json`), and the launcher exports the result
 * as `DSH_HOME` so the Electron shell, the Desktop Host and every child process
 * agree without touching the upstream home-paths default.
 *
 * Precedence, highest first: an explicit `DSH_HOME`, the brand's own directory,
 * and — only for a brand that declares `home.adoptLegacyDshHome` and only in a
 * packaged launch — the legacy `~/.dsh` (renamed, or linked when a rename is not
 * possible, or kept in place when neither works).
 *
 * @module brand
 */

import { existsSync, renameSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  BRAND_FILENAME,
  parseBrandManifest,
  readBrandManifest,
  resolveBrand,
  shippedBrand,
  type DesktopBrand,
} from '#brand-manifest'

/** Directory name of the shared Harness home this fork replaces with a brand home. */
export const LEGACY_DSH_HOME_DIR_NAME = '.dsh'

/** File name an application may ship beside `brand.json` as its deployment OEM defaults. */
export const SHIPPED_OEM_FILENAME = 'oem.json'

/** Filesystem operations the brand-home decision needs; the shell passes the synchronous defaults. */
export interface BrandHomeFileSystem {
  /** @returns whether the path exists. */
  exists(path: string): boolean
  /** Move one directory within its volume. */
  rename(from: string, to: string): void
  /** Create a directory link at `path` pointing at `target`. */
  link(target: string, path: string): void
}

const nodeFiles: BrandHomeFileSystem = {
  exists: path => existsSync(path),
  rename: (from, to) => { renameSync(from, to) },
  link: (target, path) => { symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir') },
}

/** Where one launch's home came from. */
export type BrandHomeSource = 'env' | 'brand' | 'legacy'

/** What a launch did to the legacy home. */
export type LegacyAdoption = 'none' | 'renamed' | 'linked' | 'kept-legacy' | 'skipped'

/** Resolved home of one launch. */
export interface BrandHomeResult {
  /** Absolute home this launch and every child process use. */
  readonly home: string
  /** Absolute legacy `~/.dsh` path considered by this launch. */
  readonly legacyHome: string
  /** Which input decided {@link home}. */
  readonly source: BrandHomeSource
  /** What happened to the legacy home. */
  readonly adoption: LegacyAdoption
}

/** Inputs for {@link applyBrandHome}. */
export interface ApplyBrandHomeOptions {
  /** Brand whose home this launch owns. */
  readonly brand: DesktopBrand
  /** Mutable launch environment; a resolved `DSH_HOME` is written back into it. */
  readonly env: Record<string, string | undefined>
  /** Operating-system home holding the brand directory; defaults to `os.homedir()`. */
  readonly homeDirectory?: string
  /** Whether this launch may take over a legacy home. */
  readonly allowAdoption?: boolean
  /** Filesystem facade; defaults to the synchronous `node:fs` operations. */
  readonly files?: BrandHomeFileSystem
  /** Sink for one-line diagnostics; omitted disables them. */
  readonly warn?: (line: string) => void
}

/**
 * Absolute home one brand owns under an operating-system home.
 * @param brand - Brand manifest.
 * @param homeDirectory - Operating-system home directory.
 * @returns Absolute brand home path.
 */
export function brandHomePath(brand: DesktopBrand, homeDirectory: string = homedir()): string {
  return join(homeDirectory, brand.home.dirName)
}

/**
 * Resolve this launch's home and record it in `DSH_HOME`.
 *
 * A packaged launch of a brand that declares `home.adoptLegacyDshHome` takes over
 * an existing legacy home: it renames it first (a same-volume move keeps every
 * session, credential and plugin in place), falls back to a directory link when
 * the rename is refused — an older instance may still hold one of the files — and
 * finally keeps using the legacy home for this launch so the application still
 * starts. An unconfigured brand never touches another product's home.
 * @param options - Brand, mutable environment, and optional filesystem facade.
 * @returns the home this launch uses, and what happened to the legacy home.
 */
export function applyBrandHome(options: ApplyBrandHomeOptions): BrandHomeResult {
  const { brand, env } = options
  const homeDirectory = options.homeDirectory ?? homedir()
  const files = options.files ?? nodeFiles
  const legacyHome = join(homeDirectory, LEGACY_DSH_HOME_DIR_NAME)
  const brandHome = brandHomePath(brand, homeDirectory)

  const configured = env.DSH_HOME
  if (configured !== undefined && configured.trim() !== '') {
    return { home: resolveDshHome(undefined, env), legacyHome, source: 'env', adoption: 'none' }
  }
  if (files.exists(brandHome) || !files.exists(legacyHome)) {
    env.DSH_HOME = brandHome
    return { home: brandHome, legacyHome, source: 'brand', adoption: 'none' }
  }
  if (!brand.home.adoptLegacyDshHome || options.allowAdoption !== true) {
    env.DSH_HOME = legacyHome
    return { home: legacyHome, legacyHome, source: 'legacy', adoption: 'skipped' }
  }
  try {
    files.rename(legacyHome, brandHome)
    env.DSH_HOME = brandHome
    options.warn?.(`brand home: moved ${legacyHome} to ${brandHome}`)
    return { home: brandHome, legacyHome, source: 'brand', adoption: 'renamed' }
  } catch (error) {
    options.warn?.(`brand home: could not rename ${legacyHome} (${String(error)}); linking instead`)
  }
  try {
    files.link(legacyHome, brandHome)
    env.DSH_HOME = brandHome
    options.warn?.(`brand home: linked ${brandHome} to ${legacyHome}`)
    return { home: brandHome, legacyHome, source: 'brand', adoption: 'linked' }
  } catch (error) {
    options.warn?.(`brand home: could not link ${brandHome} to ${legacyHome} (${String(error)}); using ${legacyHome}`)
  }
  env.DSH_HOME = legacyHome
  return { home: legacyHome, legacyHome, source: 'legacy', adoption: 'kept-legacy' }
}

/** Inputs for {@link resolveRuntimeBrand}. */
export interface RuntimeBrandOptions {
  /** `app.getAppPath()`; a source checkout resolves `brands/<key>.json` from it. */
  readonly appPath?: string
  /** `process.resourcesPath`; a packaged application carries `brand.json` here. */
  readonly resourcesPath?: string
  /** Launch environment; read for `DSH_BRAND`, `DSH_BRAND_CONFIG`. */
  readonly env?: Record<string, string | undefined>
  /** Sink for one-line diagnostics; omitted disables them. */
  readonly warn?: (line: string) => void
}

/**
 * Resolve the brand this application was packaged as.
 *
 * A packaged application reads `resources/brand.json`, the file packaging wrote
 * from the selected `brands/<key>.json`. A source launch reads the checkout's
 * manifest for `DSH_BRAND`, and a repository without one falls back to the
 * shipped brand. Nothing here writes user data.
 * @param options - Application paths and launch environment.
 * @returns the brand manifest this launch runs as.
 */
export function resolveRuntimeBrand(options: RuntimeBrandOptions = {}): DesktopBrand {
  const env = options.env ?? process.env
  const resourcesPath = options.resourcesPath
  if (resourcesPath !== undefined && isAbsolute(resourcesPath)) {
    const shippedPath = join(resourcesPath, BRAND_FILENAME)
    if (existsSync(shippedPath)) return readBrandManifest(shippedPath)
    options.warn?.(`brand: ${shippedPath} is missing; falling back to the checkout manifest`)
  }
  try {
    return resolveBrand(env)
  } catch (error) {
    options.warn?.(`brand: ${String(error)}; falling back to the shipped brand`)
    return shippedBrand()
  }
}

/** Inputs for {@link applyBrandBootstrap}. */
export interface BrandBootstrapOptions extends RuntimeBrandOptions {
  /** Brand this application runs as. */
  readonly brand: DesktopBrand
  /** Whether the shell runs from an installed application. */
  readonly packaged: boolean
  /** Operating-system home; defaults to `os.homedir()`. */
  readonly homeDirectory?: string
  /** Filesystem facade; defaults to the synchronous `node:fs` operations. */
  readonly files?: BrandHomeFileSystem
}

/** What a launch learned about its brand home. */
export interface BrandBootstrap {
  /** Brand this launch runs as. */
  readonly brand: DesktopBrand
  /** Resolved home, or undefined when this launch leaves `DSH_HOME` alone. */
  readonly home: BrandHomeResult | undefined
}

/**
 * Apply a launch's brand home and deployment OEM defaults.
 *
 * Only an installed application and the development launcher apply the brand
 * home; a bare Electron import (unit tests, a stray `electron .`) must not move
 * the user's data. A shipped `resources/oem.json` becomes the default
 * `DSH_OEM_CONFIG` when the home carries no `oem.json` of its own, so a
 * deployment can ship its endpoints read-only and a user can still override them
 * from the home.
 * @param options - Brand, application paths, packaged state and environment.
 * @returns the resolved brand and, when applied, the home this launch uses.
 */
export function applyBrandBootstrap(options: BrandBootstrapOptions): BrandBootstrap {
  const env = options.env ?? process.env
  const resourcesPath = options.resourcesPath
  const installed = options.packaged && resourcesPath !== undefined && isAbsolute(resourcesPath)
  if (!installed && env.DSH_DESKTOP_DEV_APP !== '1') return { brand: options.brand, home: undefined }
  const home = applyBrandHome({
    brand: options.brand,
    env,
    allowAdoption: installed,
    ...options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory },
    ...options.files === undefined ? {} : { files: options.files },
    ...options.warn === undefined ? {} : { warn: options.warn },
  })
  if ((env.DSH_OEM_CONFIG ?? '').trim() === '' && !existsSync(join(home.home, SHIPPED_OEM_FILENAME))
    && resourcesPath !== undefined && isAbsolute(resourcesPath)) {
    const shippedOem = join(resourcesPath, SHIPPED_OEM_FILENAME)
    if (existsSync(shippedOem)) env.DSH_OEM_CONFIG = shippedOem
  }
  return { brand: options.brand, home }
}

/**
 * Parse a manifest the shell already loaded as text, for diagnostics or tests.
 * @param text - JSON text.
 * @param source - File or label named in validation errors.
 * @returns Frozen manifest.
 */
export function parseBrandText(text: string, source = 'brand manifest'): DesktopBrand {
  return parseBrandManifest(JSON.parse(text), source)
}
