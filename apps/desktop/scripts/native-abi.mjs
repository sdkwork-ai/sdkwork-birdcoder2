/**
 * Electron native-addon ABI preflight.
 *
 * Why: native addons are compiled during `pnpm install` against the Node.js
 * ABI of the toolchain that ran the build (127 on Node 22), but the desktop
 * host loads them inside Electron, which ships its own ABI (133 on Electron
 * 35). A mismatched addon cannot be recovered at runtime: `process.dlopen`
 * throws ERR_DLOPEN_FAILED, the Cordis Loader reports it as
 * `failed to import loader entry <name>`, and boot dies in an AggregateError
 * whose real cause is twenty stack frames down. Nothing rebuilds addons
 * outside packaging — electron-builder does it for `dist`, and `dev` never
 * did — so a plain `pnpm install` after any upstream merge can hand back an
 * addon that only Electron can prove is broken.
 *
 * This module finds the gyp-built addons in the pnpm store and asks Electron
 * itself which ones it can load, before the host boots. It only ever reports:
 * whether a given addon matters is a question for the host, since a platform
 * branch may never reach it (the JSONL session lock takes a Win32 kernel
 * semaphore, so it never calls `fs-ext` on Windows).
 * @module apps/desktop/scripts/native-abi
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'

/** Where Electron publishes the headers a gyp rebuild against Electron needs. */
export const ELECTRON_HEADERS_URL = 'https://electronjs.org/headers'

/**
 * Resolve the Electron executable through the app's own dependency tree.
 * @param appsDesktopDir - absolute path of `apps/desktop`.
 * @returns absolute path of the Electron binary.
 */
export function resolveElectronPath(appsDesktopDir) {
  return createRequire(join(appsDesktopDir, 'package.json'))('electron')
}

/**
 * Read the Electron version the app resolves.
 * @param appsDesktopDir - absolute path of `apps/desktop`.
 * @returns the Electron version string.
 */
export function resolveElectronVersion(appsDesktopDir) {
  const manifest = createRequire(join(appsDesktopDir, 'package.json'))('electron/package.json')
  return manifest.version
}

/**
 * Collect the gyp-built native addons installed in the pnpm store.
 * @param repositoryRoot - absolute repository root owning `node_modules/.pnpm`.
 * @returns one entry per compiled `.node` binary, with its owning package.
 */
export function findNativeAddons(repositoryRoot) {
  const storeDir = resolve(repositoryRoot, 'node_modules', '.pnpm')
  if (!existsSync(storeDir)) return []
  const addons = []
  for (const key of readdirSync(storeDir)) {
    const installedDir = resolve(storeDir, key, 'node_modules')
    if (!existsSync(installedDir)) continue
    for (const packageName of listPackageDirs(installedDir)) {
      const releaseDir = resolve(installedDir, packageName, 'build', 'Release')
      if (!existsSync(releaseDir)) continue
      for (const file of readdirSync(releaseDir)) {
        if (!file.endsWith('.node')) continue
        addons.push({
          packageName,
          // `.pnpm/<name>@<version>_<hash>` — the version is all the remedy needs.
          installKey: key,
          addonPath: resolve(releaseDir, file),
          moduleDir: resolve(installedDir, packageName),
        })
      }
    }
  }
  return addons
}

/**
 * Ask Electron which addons it can actually load.
 *
 * Results are cached under a fingerprint of the Electron version and every
 * addon's mtime, so a repeat launch costs a directory scan instead of an
 * Electron start. Callers report only when `fresh` is false: the same broken
 * addon after an install is worth one notice, not one per launch.
 * @param electronPath - absolute path of the Electron binary.
 * @param addons - addons from {@link findNativeAddons}.
 * @param options - `electronVersion` to fingerprint, and `cachePath` to reuse.
 * @returns the addons Electron rejects, plus whether this answer is new.
 */
export function probeNativeAddons(electronPath, addons, options = {}) {
  const fingerprint = JSON.stringify([
    options.electronVersion ?? '',
    addons.map((addon) => [addon.addonPath, mtimeOf(addon.addonPath)]),
  ])
  const cachePath = options.cachePath
  if (cachePath !== undefined) {
    const cached = readCache(cachePath)
    if (cached !== undefined && cached.fingerprint === fingerprint) {
      return { mismatched: cached.mismatched, fingerprint, fresh: true }
    }
  }
  const mismatched = probe(electronPath, addons)
  if (cachePath !== undefined) writeCache(cachePath, { fingerprint, mismatched })
  return { mismatched, fingerprint, fresh: false }
}

/** Time the addon was last built, or `0` when it cannot be read. */
function mtimeOf(addonPath) {
  try {
    return statSync(addonPath).mtimeMs
  } catch {
    return 0
  }
}

function readCache(cachePath) {
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'))
  } catch {
    return undefined
  }
}

function writeCache(cachePath, payload) {
  try {
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify(payload))
  } catch {
    // A cache we cannot write only costs a re-probe.
  }
}

/** Spawn Electron and dlopen every addon inside it. */
function probe(electronPath, addons) {
  if (addons.length === 0) return []
  // `ELECTRON_RUN_AS_NODE` keeps the Electron ABI while giving a plain Node
  // CLI, so `process.dlopen` reports the mismatch the app would hit.
  const stage = mkdtempSync(join(tmpdir(), 'dsh-native-abi-'))
  try {
    const listPath = join(stage, 'addons.json')
    writeFileSync(listPath, JSON.stringify(addons.map((addon) => addon.addonPath)))
    const script = [
      'const { readFileSync } = require("node:fs")',
      'const paths = JSON.parse(readFileSync(process.argv[1], "utf8"))',
      'const failed = []',
      'for (const addonPath of paths) {',
      '  try { process.dlopen({ exports: {} }, addonPath) }',
      '  catch (error) { failed.push({ addonPath, message: String(error && error.message || error) }) }',
      '}',
      'process.stdout.write(JSON.stringify(failed))',
    ].join('\n')
    const result = spawnSync(electronPath, ['-e', script, listPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
    })
    if (result.status !== 0 || typeof result.stdout !== 'string' || result.stdout === '') return []
    const failed = JSON.parse(result.stdout)
    const byPath = new Map(addons.map((addon) => [addon.addonPath, addon]))
    return failed.map((entry) => {
      const addon = byPath.get(entry.addonPath) ?? { addonPath: entry.addonPath, packageName: entry.addonPath }
      return { ...addon, message: entry.message, ...parseAbiMismatch(entry.message) }
    })
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

/**
 * Pull the two ABI numbers out of a dlopen failure message.
 * @param message - the error text from `process.dlopen`.
 * @returns the compiled-against and required ABI when the text carries them.
 */
export function parseAbiMismatch(message) {
  const match = /NODE_MODULE_VERSION (\d+)[\s\S]*?NODE_MODULE_VERSION (\d+)/.exec(message ?? '')
  if (match === null) return {}
  return { builtAgainst: match[1], requiredBy: match[2] }
}

/**
 * The `node-gyp` command line that recompiles one addon for this Electron.
 * @param addon - an addon from {@link findNativeAddons}.
 * @param electronVersion - target Electron version.
 * @returns the argv to run inside {@link addon.moduleDir}.
 */
export function rebuildCommand(addon, electronVersion) {
  return [
    'node-gyp',
    'rebuild',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
    `--dist-url=${ELECTRON_HEADERS_URL}`,
  ].join(' ')
}

function listPackageDirs(installedDir) {
  const names = []
  for (const entry of readdirSync(installedDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(resolve(installedDir, entry.name), { withFileTypes: true })) {
        if (scoped.isDirectory()) names.push(`${entry.name}/${scoped.name}`)
      }
      continue
    }
    names.push(entry.name)
  }
  return names
}

/**
 * The machine-local cache path for one checkout's probe results.
 * @param repositoryRoot - absolute repository root.
 * @returns a temp-directory path keyed by the checkout.
 */
export function defaultCachePath(repositoryRoot) {
  const key = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 16)
  return join(tmpdir(), `dsh-native-abi-${key}.json`)
}

/** Report and exit. Used by the launcher and available for one-off diagnosis. */
if (import.meta.main) {
  const appsDesktopDir = resolve(import.meta.dirname, '..')
  const repositoryRoot = resolve(appsDesktopDir, '..', '..')
  const electronPath = resolveElectronPath(appsDesktopDir)
  const electronVersion = resolveElectronVersion(appsDesktopDir)
  const cachePath = defaultCachePath(repositoryRoot)
  const { mismatched, fresh } = probeNativeAddons(electronPath, findNativeAddons(repositoryRoot), {
    electronVersion,
    cachePath,
  })
  if (mismatched.length === 0) {
    console.log(`native-abi: every installed addon loads under Electron ${electronVersion}.`)
  } else if (fresh) {
    console.log(
      `native-abi: ${mismatched.length} addon(s) still mismatch Electron ${electronVersion} `
        + '(already reported for this install); run with --force to print the remedy again.',
    )
    if (process.argv.includes('--force')) report(mismatched, electronVersion)
  } else {
    report(mismatched, electronVersion)
  }
}

/**
 * Print the mismatched addons and the command that rebuilds each.
 * @param mismatched - addons Electron rejects.
 * @param electronVersion - target Electron version.
 */
function report(mismatched, electronVersion) {
  console.warn(
    `native-abi: ${mismatched.length} addon(s) are built for a different ABI than Electron ${electronVersion} `
      + 'and will fail if the host loads them:',
  )
  for (const addon of mismatched) {
    const abi = addon.builtAgainst === undefined
      ? addon.message
      : `built against NODE_MODULE_VERSION ${addon.builtAgainst}, Electron needs ${addon.requiredBy}`
    console.warn(`  ${addon.packageName} (${addon.installKey}) — ${abi}`)
    console.warn(`    cd ${addon.moduleDir} && ${rebuildCommand(addon, electronVersion)}`)
  }
  console.warn(
    'Only addons the desktop host actually imports matter: a platform branch may never reach one '
      + '(the JSONL session lock takes a Win32 kernel semaphore, so it never calls fs-ext on Windows).',
  )
}
