/**
 * Build the assistant plugin from its git submodule.
 *
 * `plugins/sdkwork-deepseekbot` commits neither `lib/` nor `dist/`, so a fresh
 * checkout (and every CI lane) has to produce them before the Web bundle, the
 * Desktop runtime or the bundle's acceptance spec can load the plugin. The
 * submodule is a workspace member, so its build toolchain is installed by this
 * repository's `pnpm install`; this script only runs that toolchain, and it is
 * a no-op while the artifacts still match the sources that produced them.
 *
 * Freshness is content-addressed rather than mtime-based: a checkout can leave
 * an artifact newer than every source file it no longer represents, and a
 * release then ships that stale bundle. The stamp records the hashed build
 * inputs and the hashed artifacts, so any source or artifact change rebuilds.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = join(ROOT, 'plugins', 'sdkwork-deepseekbot')
const ARTIFACTS = [
  join(PLUGIN, 'packages', 'client', 'lib', 'client.js'),
  join(PLUGIN, 'packages', 'core', 'dist', 'index.mjs'),
  join(PLUGIN, 'packages', 'deepseekbot', 'dist', 'subagent-control.mjs'),
]
/** Directories whose contents decide whether the artifacts are stale. */
const SOURCE_DIRECTORIES = [
  join(PLUGIN, 'packages', 'client', 'src'),
  join(PLUGIN, 'packages', 'core', 'src'),
  join(PLUGIN, 'packages', 'deepseekbot', 'src'),
]
/** Build inputs outside those source trees. */
const SOURCE_FILES = [
  join(PLUGIN, 'package.json'),
  join(PLUGIN, 'pnpm-lock.yaml'),
  join(PLUGIN, 'pnpm-workspace.yaml'),
  join(PLUGIN, 'tsconfig.json'),
  join(PLUGIN, 'tsdown.config.ts'),
  join(PLUGIN, 'tsdown.client.config.ts'),
  join(PLUGIN, 'scripts', 'stylex-plugin.mjs'),
  join(PLUGIN, 'scripts', 'dockview-css-plugin.mjs'),
  join(PLUGIN, 'scripts', 'desktop-zoom-compat.mjs'),
  join(PLUGIN, 'packages', 'client', 'package.json'),
  join(PLUGIN, 'packages', 'core', 'package.json'),
  join(PLUGIN, 'packages', 'deepseekbot', 'package.json'),
]
/** Build-stamp location, shared by every repository build. */
const STAMP = join(ROOT, '.dsh-build', 'deepseekbot-build.json')
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
    ...SOURCE_DIRECTORIES.flatMap(directoryFiles),
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
  // safe there; an explicit build or the artifact gate still fails loudly.
  const optional = process.argv.includes('--optional')
  const message = 'the plugins/sdkwork-deepseekbot submodule is not populated; '
    + 'run `git submodule update --init plugins/sdkwork-deepseekbot` and `pnpm install`'
  if (optional) {
    console.log(`build-deepseekbot: skipped — ${message}`)
    process.exit(0)
  }
  throw new Error(`build-deepseekbot: ${message}`)
}
const inputs = inputDigest()
if (isCurrent(readStamp(), inputs)) {
  console.log('build-deepseekbot: artifacts are current')
} else {
  const runner = join(PLUGIN, 'node_modules', 'tsdown', 'dist', 'run.mjs')
  if (!existsSync(runner)) {
    // Filtered installs (the Landlock lanes install only the node-addon
    // workspace closure) never materialize the plugin toolchain even though the
    // submodule is populated. Those lanes never load the plugin, so
    // `--optional` skips like the unpopulated case above; a lane that needs the
    // artifacts fails at the artifact gate instead of here.
    const optional = process.argv.includes('--optional')
    if (optional) {
      console.log('build-deepseekbot: skipped — tsdown is missing from the plugin workspace; run `pnpm install`')
      process.exit(0)
    }
    throw new Error('build-deepseekbot: tsdown is missing from the plugin workspace; run `pnpm install`')
  }
  console.log('build-deepseekbot: building the assistant plugin')
  // The plugin's own configuration also builds optional capability packages this
  // deployment never mounts and rewrites their tracked client bundles, and its
  // last step packages a desktop zoom theme from a dependency alias only the
  // plugin's own workspace carries. A temporary configuration beside the plugin
  // sources keeps the entries and their tsconfig relative to that directory
  // while selecting the runtime packages and dropping that packaging step.
  const configPath = join(PLUGIN, '.fork-assistant-build.config.ts')
  writeFileSync(
    configPath,
    [
      "import configs from './tsdown.config.ts'",
      '',
      '/** Output directories this fork ships. */',
      'const RUNTIME_OUT_DIRS = new Set([',
      "  'packages/core/dist',",
      "  'packages/core/cli',",
      "  'packages/client/dist',",
      "  'packages/client/lib',",
      "  'packages/deepseekbot/dist',",
      '])',
      '',
      'export default (Array.isArray(configs) ? configs : [configs])',
      '  .filter(config => RUNTIME_OUT_DIRS.has(String(config.outDir)))',
      '  .map(config => String(config.outDir) === \'packages/deepseekbot/dist\'',
      '    ? { ...config, onSuccess: undefined }',
      '    : config)',
      '',
    ].join('\n'),
  )
  try {
    execFileSync(
      process.execPath,
      [runner, '--config', '.fork-assistant-build.config.ts', '--config-loader', 'unrun'],
      { cwd: PLUGIN, stdio: 'inherit' },
    )
  } finally {
    rmSync(configPath, { force: true })
  }
  const artifacts = artifactDigests()
  if (artifacts === undefined) {
    const missing = ARTIFACTS.filter(path => !existsSync(path)).map(relativePath)
    throw new Error(`build-deepseekbot: the plugin build produced no ${missing.join(', ')}`)
  }
  writeStamp(inputDigest(), artifacts)
  console.log('build-deepseekbot: artifacts are current')
}
