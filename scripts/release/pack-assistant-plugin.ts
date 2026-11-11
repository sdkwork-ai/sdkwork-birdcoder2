/**
 * Pack the assistant plugin's runtime packages beside the dsh release tarballs.
 *
 * The plugin is a git submodule whose root is a private build workspace; the
 * bundles mount three runtime packages, and none of them is published to a
 * registry. A release-shaped input set therefore has to carry the same tarballs
 * the bundle's workspace dependencies name, or the package closure and the
 * packed-install verification cannot resolve them.
 *
 * `sdkwork-deepseekbot` itself keeps `link:` dependencies on sibling sources that
 * this deployment does not mount (the Bot Browser and Computer capability
 * packages). A tarball cannot install a `link:` dependency, so the packed
 * manifest names the two packages this fork does mount instead.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { assertAssistantClientExternals } from './assistant-client-externals.ts'
import { capture, pnpmCommand } from './process.ts'

/** Plugin directory, relative to the repository root. */
const PLUGIN = join('plugins', 'sdkwork-deepseekbot')
/** Runtime packages packed as-is. */
const RUNTIME_PACKAGES = ['core', 'client'] as const
/** Fork-carried plugin packages whose pinned versions no registry serves. */
const FORK_PLUGINS = ['plugins/dsh-ui-usage-billing'] as const
/** Files the `sdkwork-deepseekbot` tarball carries (its manifest `files`). */
const DEEPSEEKBOT_FILES = ['dist', 'cordis.patch.yml', 'desktop-theme', 'desktop-theme-0.2.2-rc.1'] as const

function packDirectory(directory: string, destination: string): void {
  const [pnpm, ...args] = pnpmCommand()
  // The plugin workspace pins its own pnpm (12.4.2); a corepack-managed pnpm
  // (the container image) cannot switch versions under corepack, so the
  // version check is downgraded to a warning for this pack-only operation.
  capture(pnpm, [...args, '--pm-on-fail=ignore', '--dir', directory, 'pack', '--pack-destination', destination])
}

/**
 * Stage `sdkwork-deepseekbot` with an installable manifest.
 * @param source - the plugin's `packages/deepseekbot` directory.
 * @returns the staging directory; the caller removes it.
 */
function stageDeepseekbot(source: string): string {
  const stage = mkdtempSync(join(tmpdir(), 'dsh-assistant-deepseekbot-'))
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as Record<string, unknown>
  manifest['dependencies'] = { '@botharness/core': '0.0.0', '@botharness/ui': '0.0.0' }
  // A packed manifest describes what a consumer installs, so the plugin
  // workspace's development-only edges stay behind: `pnpm pack` refuses a
  // `workspace:` spec outside that workspace (`@deepseek-ai/dsh` here), and the
  // host runtime is not a dependency of the released tarball.
  delete manifest['devDependencies']
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
  for (const entry of DEEPSEEKBOT_FILES) {
    const from = join(source, entry)
    if (existsSync(from)) cpSync(from, join(stage, entry), { recursive: true })
  }
  return stage
}

/**
 * Pack the assistant plugin's runtime packages into one release input set.
 * @param root - repository root.
 * @param destination - directory receiving the `.tgz` files.
 */
export function packAssistantPlugin(root: string, destination: string): void {
  const plugin = join(root, PLUGIN)
  if (!existsSync(join(plugin, 'packages', 'core', 'dist', 'index.mjs'))
    || !existsSync(join(plugin, 'packages', 'client', 'lib', 'client.js'))) {
    throw new Error('pack-assistant-plugin: the assistant plugin is not built; run `pnpm run build:deepseekbot`')
  }
  // The browser bundle is built from the plugin's own workspace, not this
  // repository's client pipeline, so nothing else compares its runtime imports
  // with the Web module table before the tarball is packed. A bundle that
  // requests an unseeded module boots to a dropped plugin in the installed
  // application, never here, so the release boundary refuses it.
  assertAssistantClientExternals(join(plugin, 'packages', 'client'), '@botharness/ui')
  mkdirSync(destination, { recursive: true })
  for (const name of RUNTIME_PACKAGES) packDirectory(join(plugin, 'packages', name), destination)
  const stage = stageDeepseekbot(join(plugin, 'packages', 'deepseekbot'))
  try {
    packDirectory(stage, destination)
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
  for (const pluginDirectory of FORK_PLUGINS) {
    packDirectory(join(root, pluginDirectory), destination)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: false })
  if (values.out === undefined) throw new Error('usage: pack-assistant-plugin --out <directory>')
  packAssistantPlugin(resolve(import.meta.dirname, '..', '..'), resolve(values.out))
}
