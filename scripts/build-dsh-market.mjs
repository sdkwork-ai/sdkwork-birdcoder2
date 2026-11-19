/**
 * Build the plugin market's host half from its git submodule.
 *
 * The plugin (`plugins/dsh-market`, the SDKWork fork of `dsh-market/dsh-market`)
 * ships its browser half as a committed `client/client.js` but gitignores
 * `lib/`, the `tsc` output the loader imports. A fresh checkout therefore boots
 * with the `dsh-market` row failing to import until this script runs:
 * `postinstall` and the `build:artifacts` gate invoke it beside the assistant
 * and better-sidebar plugin builds, and it is a no-op while the artifacts still
 * match the sources that produced them.
 *
 * Only the host half is produced here. `lib/` compiles from `src/` with the
 * plugin's own `tsconfig.json` (its only framework imports are
 * `@deepseek-ai/schemastery` and the `@deepseek-ai/cordis` types, which the
 * scoped `dshmarket>` overrides in `pnpm-workspace.yaml` link to this
 * workspace's sources). `client/client.js` is upstream-committed and this
 * repository never regenerates it: a client change lands in the fork's own
 * build, and the gitlink bumps with it.
 *
 * Freshness is content-addressed rather than mtime-based, mirroring
 * `scripts/build-better-sidebar.mjs`: `src/client` is not a build input, since
 * nothing here compiles it into `lib/`.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = join(ROOT, 'plugins', 'dsh-market')
/** The compiled host half, relative to the plugin root. */
const LIB = join(PLUGIN, 'lib')
/** The one host artifact the loader imports; the build must produce it. */
const ENTRY = join(LIB, 'index.js')
/** The browser half the fork commits; this build only requires it to be present. */
const CLIENT = join(PLUGIN, 'client', 'client.js')
/**
 * The framework packages the host half imports, resolved by the scoped
 * `dshmarket>` overrides to this checkout's `vendor/` copies. Their declaration
 * files are build outputs, so a checkout that has not run the Host compiler yet
 * carries the sources but no `lib/types`.
 */
const FRAMEWORK_PACKAGES = ['@deepseek-ai/cordis', '@deepseek-ai/schemastery']
/** Directories whose contents decide whether `lib/` is stale. */
const SOURCE_DIRECTORIES = [join(PLUGIN, 'src')]
/** Build inputs outside those source trees. */
const SOURCE_FILES = [join(PLUGIN, 'package.json'), join(PLUGIN, 'tsconfig.json')]
/** Build-stamp location, shared by every repository build. */
const STAMP = join(ROOT, '.dsh-build', 'dsh-market-build.json')
const STAMP_FORMAT = 2

/**
 * Read one file's SHA-256.
 * @param path - absolute file path.
 * @returns lowercase hex digest.
 */
function fileDigest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Repository-relative POSIX path, which keeps the digest platform-independent.
 * @param path - absolute path.
 * @returns path relative to the repository root with `/` separators.
 */
function relativePath(path) {
  return relative(ROOT, path).split(sep).join('/')
}

/**
 * Every file below one directory, in stable path order.
 * @param path - directory to walk.
 * @param excluded - directory whose subtree is skipped.
 * @returns absolute file paths.
 */
function directoryFiles(path, excluded) {
  const files = []
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (excluded !== undefined && child === excluded) continue
    if (entry.isDirectory()) files.push(...directoryFiles(child, excluded))
    else if (entry.isFile()) files.push(child)
  }
  return files.sort()
}

/**
 * Hash every build input into one digest.
 * @returns digest of the sorted input paths and their contents.
 */
function inputDigest() {
  // The browser half is compiled by the fork's own build, not by this one, so
  // its sources cannot make `lib/` stale.
  const excluded = join(PLUGIN, 'src', 'client')
  const files = [
    ...SOURCE_DIRECTORIES.filter(path => existsSync(path)).flatMap(path => directoryFiles(path, excluded)),
    ...SOURCE_FILES.filter(path => existsSync(path)),
  ].sort()
  const digest = createHash('sha256')
  for (const path of files) digest.update(`${relativePath(path)}\0${fileDigest(path)}\n`)
  return digest.digest('hex')
}

/**
 * Hash the artifacts one successful build must have produced.
 * @returns a path-to-digest record, or undefined when `lib/` is absent or empty.
 */
function artifactDigests() {
  if (!existsSync(ENTRY) || !statSync(ENTRY).isFile()) return undefined
  const digests = {}
  for (const path of directoryFiles(LIB)) digests[relativePath(path)] = fileDigest(path)
  return Object.keys(digests).length === 0 ? undefined : digests
}

/**
 * Whether this checkout has built the framework declaration files the host half
 * type-checks against. A fresh checkout runs `postinstall` before any Host
 * compiler pass, so these are absent until `pnpm run build:artifacts` (or
 * `build:lib`) compiles `vendor/cordis` and `vendor/schemastery`.
 * @returns true when both linked packages carry their declared types entry.
 */
function frameworkDeclarationsBuilt() {
  return FRAMEWORK_PACKAGES.every((name) => {
    const directory = join(PLUGIN, 'node_modules', ...name.split('/'))
    const manifestPath = join(directory, 'package.json')
    if (!existsSync(manifestPath)) return false
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const declared = typeof manifest.types === 'string'
      ? manifest.types
      : typeof manifest.exports?.['.'] === 'object' ? manifest.exports['.'].types : undefined
    return typeof declared === 'string' && existsSync(join(directory, declared))
  })
}

/**
 * Read the last successful build stamp.
 * @returns the parsed stamp, or undefined when it is absent or unreadable.
 */
function readStamp() {
  if (!existsSync(STAMP)) return undefined
  try {
    const value = JSON.parse(readFileSync(STAMP, 'utf8'))
    if (
      value?.formatVersion !== STAMP_FORMAT
      || typeof value.inputsSha256 !== 'string'
      || (value.mode !== 'checked' && value.mode !== 'emit-only')
      || typeof value.artifacts !== 'object'
      || value.artifacts === null
      || Array.isArray(value.artifacts)
    ) return undefined
    return value
  } catch {
    return undefined
  }
}

/**
 * Report whether the artifact set still matches one stamp, its inputs, and the
 * build mode that produced it. A checked build replaces an emit-only one, so
 * the artifact gate type-checks once the Host compiler has run.
 * @param stamp - a parsed build stamp.
 * @param inputs - digest of the current build inputs.
 * @param mode - `checked` or `emit-only`, as chosen for this run.
 * @returns true only when the inputs, mode, and every artifact are unchanged.
 */
function isCurrent(stamp, inputs, mode) {
  if (stamp === undefined || stamp.inputsSha256 !== inputs || stamp.mode !== mode) return false
  const artifacts = artifactDigests()
  if (artifacts === undefined) return false
  const expected = Object.keys(stamp.artifacts).sort()
  const actual = Object.keys(artifacts).sort()
  if (expected.length !== actual.length || expected.some((path, index) => path !== actual[index])) return false
  return expected.every(path => stamp.artifacts[path] === artifacts[path])
}

/**
 * Record the inputs and build mode that produced the current artifacts.
 * @param inputs - digest returned by {@link inputDigest}.
 * @param artifacts - digests returned by {@link artifactDigests}.
 * @param mode - `checked` or `emit-only`.
 */
function writeStamp(inputs, artifacts, mode) {
  mkdirSync(dirname(STAMP), { recursive: true })
  writeFileSync(STAMP, `${JSON.stringify({
    formatVersion: STAMP_FORMAT,
    inputsSha256: inputs,
    mode,
    artifacts,
  }, undefined, 2)}\n`)
}

/**
 * The plugin's own `tsc` entry, resolved from the `bin` field of its installed
 * TypeScript so the compile runs the compiler version its manifest pins.
 * @returns the absolute script path, or undefined when the toolchain is absent.
 */
function typeScriptEntry() {
  const manifestPath = join(PLUGIN, 'node_modules', 'typescript', 'package.json')
  if (!existsSync(manifestPath)) return undefined
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.tsc
  if (typeof bin !== 'string') return undefined
  const entry = join(PLUGIN, 'node_modules', 'typescript', bin)
  return existsSync(entry) ? entry : undefined
}

const optional = process.argv.includes('--optional')

if (!existsSync(join(PLUGIN, 'package.json'))) {
  // `postinstall` runs in checkouts and CI jobs that never initialized this
  // submodule (lint-only and policy lanes do not load the plugin). Skipping is
  // safe there; an explicit build or the artifact gate still fails loudly.
  const message = 'the plugins/dsh-market submodule is not populated; '
    + 'run `git submodule update --init plugins/dsh-market` and `pnpm install`'
  if (optional) {
    console.log(`build-dsh-market: skipped — ${message}`)
    process.exit(0)
  }
  throw new Error(`build-dsh-market: ${message}`)
}

if (!existsSync(CLIENT)) {
  throw new Error(
    'build-dsh-market: the fork ships no client/client.js; '
    + 'the gitlink points at a revision whose committed browser half is missing',
  )
}

const inputs = inputDigest()
const mode = frameworkDeclarationsBuilt() ? 'checked' : 'emit-only'
if (isCurrent(readStamp(), inputs, mode)) {
  console.log('build-dsh-market: artifacts are current')
} else {
  const tsc = typeScriptEntry()
  if (tsc === undefined) {
    // Filtered installs (the Landlock lanes install only the node-addon
    // workspace closure) never materialize the plugin toolchain even though the
    // submodule is populated. Those lanes never load the plugin, so `--optional`
    // skips like the unpopulated case above.
    const message = 'TypeScript is missing from the plugin workspace; run `pnpm install`'
    if (optional) {
      console.log(`build-dsh-market: skipped — ${message}`)
      process.exit(0)
    }
    throw new Error(`build-dsh-market: ${message}`)
  }
  console.log(mode === 'checked'
    ? 'build-dsh-market: building the plugin market host half (type-checked)'
    : 'build-dsh-market: building the plugin market host half (emit-only: the workspace framework declarations are not built yet)')
  // A clean tree keeps a deleted source from leaving a stale module the loader
  // would still import; `tsc` itself never removes outputs. `--noCheck` keeps a
  // fresh checkout's `postinstall` working before the Host compiler has emitted
  // `vendor/*/lib/types`; the artifact gate re-runs the checked build after it.
  const args = mode === 'checked' ? ['-p', 'tsconfig.json'] : ['-p', 'tsconfig.json', '--noCheck']
  rmSync(LIB, { recursive: true, force: true })
  try {
    execFileSync(process.execPath, [tsc, ...args], { cwd: PLUGIN, stdio: 'inherit' })
  } catch (error) {
    if (optional) {
      console.log('build-dsh-market: skipped — the plugin build failed; run `pnpm --dir plugins/dsh-market exec tsc -p tsconfig.json` to see the error')
      process.exit(0)
    }
    throw error
  }
  const artifacts = artifactDigests()
  if (artifacts === undefined) {
    throw new Error(`build-dsh-market: the build produced no ${relativePath(ENTRY)}`)
  }
  writeStamp(inputs, artifacts, mode)
  console.log('build-dsh-market: artifacts are current')
}
