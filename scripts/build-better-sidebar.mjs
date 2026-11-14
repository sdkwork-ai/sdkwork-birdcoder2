/**
 * Build the better-sidebar plugin from its git submodule.
 *
 * The web composition mounts `dsh-better-sidebar` by name, and the loader's
 * runtime dependency walk resolves that name from the web-app bundle's
 * dependencies into the submodule — whose `lib/` is gitignored upstream. A
 * fresh checkout therefore boots with the plugin's import failing until this
 * script runs: `postinstall` and the `build:artifacts` gate invoke it beside
 * the assistant plugin build, and a no-op while the artifacts still match the
 * sources that produced them.
 *
 * Freshness is content-addressed rather than mtime-based, mirroring
 * `scripts/build-deepseekbot.mjs`. The bundle externalizes every
 * `@deepseek-ai/*` module (the runtime resolution supplies them from this
 * workspace), so the stamp hashes only the submodule's own sources and build
 * inputs — no workspace closure can age into the artifacts.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = join(ROOT, 'plugins', 'dsh-better-sidebar')
const ARTIFACTS = [
  join(PLUGIN, 'lib', 'index.js'),
  join(PLUGIN, 'lib', 'client.js'),
]
/** Directories whose contents decide whether the artifacts are stale. */
const SOURCE_DIRECTORIES = [
  join(PLUGIN, 'src'),
  join(PLUGIN, 'scripts'),
]
/** Build inputs outside those source trees. */
const SOURCE_FILES = [
  join(PLUGIN, 'package.json'),
  join(PLUGIN, 'tsconfig.json'),
  join(PLUGIN, 'tsconfig.build.json'),
  join(PLUGIN, 'tsdown.config.ts'),
]
/** Build-stamp location, shared by every repository build. */
const STAMP = join(ROOT, '.dsh-build', 'better-sidebar-build.json')
const STAMP_FORMAT = 1

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
 * @returns absolute file paths.
 */
function directoryFiles(path) {
  const files = []
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) files.push(...directoryFiles(child))
    else if (entry.isFile()) files.push(child)
  }
  return files.sort()
}

/**
 * Hash every build input into one digest.
 * @returns digest of the sorted input paths and their contents.
 */
function inputDigest() {
  const files = [
    ...SOURCE_DIRECTORIES.filter(path => existsSync(path)).flatMap(directoryFiles),
    ...SOURCE_FILES.filter(path => existsSync(path)),
  ].sort()
  const digest = createHash('sha256')
  for (const path of files) digest.update(`${relativePath(path)}\0${fileDigest(path)}\n`)
  return digest.digest('hex')
}

/**
 * Hash the artifacts one successful build must have produced.
 * @returns a path-to-digest record, or undefined when one artifact is missing.
 */
function artifactDigests() {
  const digests = {}
  for (const path of ARTIFACTS) {
    if (!existsSync(path) || !statSync(path).isFile()) return undefined
    digests[relativePath(path)] = fileDigest(path)
  }
  return digests
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
 * Report whether the artifact set still matches one stamp and its inputs.
 * @param stamp - a parsed build stamp.
 * @param inputs - digest of the current build inputs.
 * @returns true only when the inputs and every artifact are unchanged.
 */
function isCurrent(stamp, inputs) {
  if (stamp === undefined || stamp.inputsSha256 !== inputs) return false
  const artifacts = artifactDigests()
  if (artifacts === undefined) return false
  const expected = Object.keys(stamp.artifacts).sort()
  const actual = Object.keys(artifacts).sort()
  if (expected.length !== actual.length || expected.some((path, index) => path !== actual[index])) return false
  return expected.every(path => stamp.artifacts[path] === artifacts[path])
}

/**
 * Record the inputs that produced the current artifacts.
 * @param inputs - digest returned by {@link inputDigest}.
 * @param artifacts - digests returned by {@link artifactDigests}.
 */
function writeStamp(inputs, artifacts) {
  mkdirSync(dirname(STAMP), { recursive: true })
  writeFileSync(STAMP, `${JSON.stringify({
    formatVersion: STAMP_FORMAT,
    inputsSha256: inputs,
    artifacts,
  }, undefined, 2)}\n`)
}

if (!existsSync(join(PLUGIN, 'package.json'))) {
  // `postinstall` runs in checkouts and CI jobs that never initialized this
  // submodule (lint-only and policy lanes do not load the plugin). Skipping is
  // safe there; an explicit build still fails loudly.
  const optional = process.argv.includes('--optional')
  const message = 'the plugins/dsh-better-sidebar submodule is not populated; '
    + 'run `git submodule update --init plugins/dsh-better-sidebar` and `pnpm install`'
  if (optional) {
    console.log(`build-better-sidebar: skipped — ${message}`)
    process.exit(0)
  }
  throw new Error(`build-better-sidebar: ${message}`)
}

const inputs = inputDigest()
if (isCurrent(readStamp(), inputs)) {
  console.log('build-better-sidebar: artifacts are current')
} else {
  const runner = join(PLUGIN, 'node_modules', 'tsdown', 'dist', 'run.mjs')
  if (!existsSync(runner)) {
    // Filtered installs (the Landlock lanes install only the node-addon
    // workspace closure) never materialize the plugin toolchain even though
    // the submodule is populated. Those lanes never load the plugin, so
    // `--optional` skips like the unpopulated case above.
    const optional = process.argv.includes('--optional')
    if (optional) {
      console.log('build-better-sidebar: skipped — tsdown is missing from the plugin workspace; run `pnpm install`')
      process.exit(0)
    }
    throw new Error('build-better-sidebar: tsdown is missing from the plugin workspace; run `pnpm install`')
  }
  console.log('build-better-sidebar: building the better-sidebar plugin')
  // The plugin's own `bundle` pipeline: its mermaid asset step, then tsdown —
  // the artifact pipeline without the plugin's release type gate, which this
  // checkout's dependency surface does not gate (its committed lib ships the
  // same shape). Shell-free child processes, mirroring the assistant plugin
  // build's tsdown invocation.
  const optional = process.argv.includes('--optional')
  const mermaidAsset = join(PLUGIN, 'scripts', 'build-mermaid-frame-asset.mjs')
  try {
    execFileSync(process.execPath, [mermaidAsset], { cwd: PLUGIN, stdio: 'inherit' })
    execFileSync(process.execPath, [runner, '--config', 'tsdown.config.ts'], { cwd: PLUGIN, stdio: 'inherit' })
  } catch (error) {
    if (optional) {
      console.log('build-better-sidebar: skipped — the plugin build failed; run `pnpm --dir plugins/dsh-better-sidebar run build` to see the error')
      process.exit(0)
    }
    throw error
  }
  const artifacts = artifactDigests()
  if (artifacts === undefined) throw new Error('build-better-sidebar: the build did not produce every expected artifact')
  writeStamp(inputs, artifacts)
}
