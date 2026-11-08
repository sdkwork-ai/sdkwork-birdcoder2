/**
 * Build the assistant plugin from its git submodule.
 *
 * `plugins/sdkwork-deepseekbot` commits neither `lib/` nor `dist/`, so a fresh
 * checkout (and every CI lane) has to produce them before the Web bundle, the
 * Desktop runtime or the bundle's acceptance spec can load the plugin. The
 * submodule is a workspace member, so its build toolchain is installed by this
 * repository's `pnpm install`; this script only runs that toolchain, and it is
 * a no-op while every artifact is newer than the plugin's sources.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = join(ROOT, 'plugins', 'sdkwork-deepseekbot')
const ARTIFACTS = [
  join(PLUGIN, 'packages', 'client', 'lib', 'client.js'),
  join(PLUGIN, 'packages', 'core', 'dist', 'index.mjs'),
  join(PLUGIN, 'packages', 'deepseekbot', 'dist', 'subagent-control.mjs'),
]
/** Directories whose newest file decides whether the artifacts are stale. */
const SOURCE_DIRECTORIES = [
  join(PLUGIN, 'packages', 'client', 'src'),
  join(PLUGIN, 'packages', 'core', 'src'),
  join(PLUGIN, 'packages', 'deepseekbot', 'src'),
]
/** Build inputs outside those source trees. */
const SOURCE_FILES = [
  join(PLUGIN, 'tsdown.config.ts'),
  join(PLUGIN, 'tsdown.client.config.ts'),
  join(PLUGIN, 'scripts', 'stylex-plugin.mjs'),
  join(PLUGIN, 'scripts', 'dockview-css-plugin.mjs'),
  join(PLUGIN, 'scripts', 'desktop-zoom-compat.mjs'),
]

/**
 * Newest modification time below one path.
 * @param path - file or directory to inspect.
 * @returns milliseconds since the epoch; 0 when the path does not exist.
 */
function newest(path) {
  if (!existsSync(path)) return 0
  const stat = statSync(path)
  if (stat.isFile()) return stat.mtimeMs
  let latest = stat.mtimeMs
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    latest = Math.max(latest, newest(join(path, entry.name)))
  }
  return latest
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
const missing = ARTIFACTS.filter(path => !existsSync(path))
const sourceTime = Math.max(...[...SOURCE_DIRECTORIES, ...SOURCE_FILES].map(newest))
const artifactTime = missing.length === 0 ? Math.min(...ARTIFACTS.map(newest)) : 0
if (missing.length === 0 && artifactTime >= sourceTime) {
  console.log('build-deepseekbot: artifacts are current')
} else {
  const runner = join(PLUGIN, 'node_modules', 'tsdown', 'dist', 'run.mjs')
  if (!existsSync(runner)) {
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
  for (const path of ARTIFACTS) {
    if (!existsSync(path)) throw new Error(`build-deepseekbot: the plugin build produced no ${path}`)
  }
  console.log('build-deepseekbot: artifacts are current')
}
