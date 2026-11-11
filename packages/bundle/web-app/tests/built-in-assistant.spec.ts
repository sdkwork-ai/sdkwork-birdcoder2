/**
 * The built-in assistant integration: the SDKWork BotHarness persona-bot layer
 * (`plugins/sdkwork-deepseekbot`, a git submodule) is composed by the web patch,
 * and the fork's assistant rail cell opens the browser half's `botharness` main
 * panel. Row, manifest, preset and built artifacts are one acceptance path: a
 * dropped row, a renamed package, a lost browser half, or a missing artifact
 * each fail here instead of at boot.
 *
 * The plugin's `lib/` and `dist/` are gitignored upstream and built from the
 * submodule by `scripts/build-deepseekbot.mjs`; this repository consumes that
 * build as its workspace members, never a published npm release.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { declaredClientExternals, unsupportedClientRequires } from '../../../../scripts/release/assistant-client-externals.ts'

/** Loader row ids, npm names, and the published artifacts each row needs. */
const CORE_ROW = 'botharness-core'
const CLIENT_ROW = 'botharness-client'
const PRESET_ROW = 'preset-deepseekbot'
const CELL_ROW = 'ui-sdkwork-assistant'
const CORE_PACKAGE = '@botharness/core'
const CLIENT_PACKAGE = '@botharness/ui'
const PRESET_PACKAGE = '@deepseek-ai/dsh-agent-preset'
const CELL_PACKAGE = '@deepseek-ai/dsh-client-ui-sdkwork-assistant'

const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url))
const require = createRequire(import.meta.url)

/** Every row the patch list inserts or addresses, in composition order. */
function rows(): EntryOptions[] {
  const parsed = yaml.load(readFileSync(patchPath, 'utf8'), { schema: entryListSchema }) as
    | ({ insert?: EntryOptions[] } & EntryOptions)[]
    | undefined
  return (parsed ?? []).flatMap(patch => patch.insert === undefined ? [patch] : patch.insert)
}

/** The row with one id, or undefined when the patch lost it. */
function row(id: string): EntryOptions | undefined {
  return rows().find(candidate => candidate.id === id)
}

/** Read one installed package's manifest, or undefined when it does not resolve. */
function manifestOf(name: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** Absolute paths of the built files the composition runs, whether each exists. */
function artifacts(): { path: string; exists: boolean }[] {
  const files = [
    [CORE_PACKAGE, 'dist/index.mjs'],
    [CLIENT_PACKAGE, 'lib/client.js'],
    ['deepseekbot', 'dist/subagent-control.mjs'],
  ] as const
  return files.flatMap(([name, file]) => {
    const manifest = manifestOf(name)
    if (manifest === undefined) return []
    const root = dirname(require.resolve(`${name}/package.json`))
    const relative = name === CLIENT_PACKAGE
      ? (manifest.exports as Record<string, { default?: string }> | undefined)?.['./client']?.default
      : `./${file}`
    if (relative === undefined) return []
    return [{ path: `${name}/${relative.replace(/^\.\//, '')}`, exists: existsSync(join(root, relative)) }]
  })
}

/**
 * Every way the composed assistant integration can be incomplete.
 * @param found - the composed Loader rows by role, or undefined when a row is missing.
 * @param manifests - the four manifests, or undefined where one does not resolve.
 * @param present - the built artifacts the rows run.
 * @returns one message per violation, empty when the integration is complete.
 */
function violations(
  found: {
    core?: EntryOptions | undefined
    client?: EntryOptions | undefined
    preset?: EntryOptions | undefined
    cell?: EntryOptions | undefined
  },
  manifests: {
    core?: Record<string, unknown> | undefined
    client?: Record<string, unknown> | undefined
    preset?: Record<string, unknown> | undefined
    cell?: Record<string, unknown> | undefined
  },
  present: readonly { path: string; exists: boolean }[],
): string[] {
  const problems: string[] = []
  if (found.core === undefined) problems.push(`the web patch declares no ${CORE_ROW} row`)
  else {
    if (found.core.name !== CORE_PACKAGE) problems.push(`${CORE_ROW} names ${found.core.name}, not ${CORE_PACKAGE}`)
    if (found.core.disabled !== undefined) problems.push(`${CORE_ROW} is not enabled by default`)
    const config = found.core.config as { agentPreset?: unknown } | undefined
    if (config?.agentPreset !== 'deepseekbot') problems.push(`${CORE_ROW} names no deepseekbot agent preset`)
  }
  if (found.client === undefined) problems.push(`the web patch declares no ${CLIENT_ROW} row`)
  else if (found.client.name !== CLIENT_PACKAGE) problems.push(`${CLIENT_ROW} names ${found.client.name}, not ${CLIENT_PACKAGE}`)
  if (found.preset === undefined) problems.push(`the web patch declares no ${PRESET_ROW} row`)
  else if (found.preset.name !== PRESET_PACKAGE) problems.push(`${PRESET_ROW} names ${found.preset.name}, not ${PRESET_PACKAGE}`)
  if (found.cell === undefined) problems.push(`the web patch declares no ${CELL_ROW} row`)
  else {
    if (found.cell.name !== CELL_PACKAGE) problems.push(`${CELL_ROW} names ${found.cell.name}, not ${CELL_PACKAGE}`)
    if (found.cell.disabled !== undefined) problems.push(`${CELL_ROW} is not enabled by default`)
  }
  if (manifests.core === undefined) {
    problems.push(`${CORE_PACKAGE} does not resolve from this bundle (is the deepseekbot dependency installed?)`)
    return problems
  }
  if (manifests.client === undefined) problems.push(`${CLIENT_PACKAGE} does not resolve from this bundle`)
  if (manifests.preset === undefined) problems.push(`${PRESET_PACKAGE} does not resolve from this bundle`)
  if (manifests.cell === undefined) problems.push(`${CELL_PACKAGE} does not resolve from this bundle`)
  else {
    const dsh = manifests.cell.dsh
    const client = typeof dsh === 'object' && dsh !== null
      ? (dsh as { client?: { platform?: unknown } }).client
      : undefined
    if (client?.platform !== 'web') problems.push(`${CELL_PACKAGE} declares no dsh.client web half`)
  }
  const clientDsh = manifests.client?.dsh
  const pluginClient = typeof clientDsh === 'object' && clientDsh !== null
    ? (clientDsh as { client?: { platform?: unknown } }).client
    : undefined
  if (pluginClient?.platform !== 'web') problems.push(`${CLIENT_PACKAGE} declares no dsh.client web half`)
  for (const artifact of present) {
    if (!artifact.exists) problems.push(`${artifact.path} is missing`)
  }
  return problems
}

describe('built-in assistant', () => {
  it('composes the persona-bot plugin and the assistant rail cell by default', () => {
    const found = {
      core: row(CORE_ROW), client: row(CLIENT_ROW), preset: row(PRESET_ROW), cell: row(CELL_ROW),
    }
    const manifests = {
      core: manifestOf(CORE_PACKAGE), client: manifestOf(CLIENT_PACKAGE),
      preset: manifestOf(PRESET_PACKAGE), cell: manifestOf(CELL_PACKAGE),
    }
    const present = artifacts()
    expect(present).toHaveLength(3)
    expect(violations(found, manifests, present)).toEqual([])
  })

  it('consumes the plugin from its git submodule through workspace members, so row names resolve in a shipped build', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies?: Record<string, string> }
    const pluginRoot = `${sep}plugins${sep}sdkwork-deepseekbot${sep}`
    for (const name of [CORE_PACKAGE, CLIENT_PACKAGE, 'deepseekbot']) {
      expect(manifest.dependencies?.[name]).toBe('workspace:*')
      expect(require.resolve(`${name}/package.json`)).toContain(pluginRoot)
    }
    expect(manifest.dependencies?.[CELL_PACKAGE]).toBe('workspace:*')
  })

  it('ships a browser bundle the Web module table can satisfy', () => {
    const manifest = manifestOf(CLIENT_PACKAGE)
    if (manifest === undefined) throw new Error(`${CLIENT_PACKAGE} does not resolve from this bundle`)
    const client = (manifest.exports as Record<string, { default?: string }> | undefined)?.['./client']?.default
    if (client === undefined) throw new Error(`${CLIENT_PACKAGE} exports no ./client entry`)
    const root = dirname(require.resolve(`${CLIENT_PACKAGE}/package.json`))
    const source = readFileSync(join(root, client), 'utf8')
    expect(unsupportedClientRequires(source, declaredClientExternals(manifest))).toEqual([])
  })

  it('rejects each way the integration can be incomplete', () => {
    const found = {
      core: row(CORE_ROW), client: row(CLIENT_ROW), preset: row(PRESET_ROW), cell: row(CELL_ROW),
    }
    const manifests = {
      core: manifestOf(CORE_PACKAGE), client: manifestOf(CLIENT_PACKAGE),
      preset: manifestOf(PRESET_PACKAGE), cell: manifestOf(CELL_PACKAGE),
    }
    const present = artifacts()
    for (const candidate of [found.core, found.client, found.preset, found.cell]) {
      if (candidate === undefined) throw new Error('the integration is already incomplete')
    }
    expect(violations({ ...found, core: undefined }, manifests, present))
      .toEqual([`the web patch declares no ${CORE_ROW} row`])
    expect(violations({ ...found, client: undefined }, manifests, present))
      .toEqual([`the web patch declares no ${CLIENT_ROW} row`])
    expect(violations({ ...found, preset: undefined }, manifests, present))
      .toEqual([`the web patch declares no ${PRESET_ROW} row`])
    expect(violations({ ...found, cell: undefined }, manifests, present))
      .toEqual([`the web patch declares no ${CELL_ROW} row`])
    expect(violations({ ...found, core: { ...found.core!, name: '@deepseek-ai/dsh-client-ui-theme' } }, manifests, present))
      .toEqual([`${CORE_ROW} names @deepseek-ai/dsh-client-ui-theme, not ${CORE_PACKAGE}`])
    expect(violations({ ...found, core: { ...found.core!, disabled: true } }, manifests, present))
      .toEqual([`${CORE_ROW} is not enabled by default`])
    expect(violations(
      { ...found, core: { ...found.core!, config: { agentPreset: 'standard' } } }, manifests, present))
      .toEqual([`${CORE_ROW} names no deepseekbot agent preset`])
    expect(violations(found, { ...manifests, core: undefined }, present))
      .toEqual([`${CORE_PACKAGE} does not resolve from this bundle (is the deepseekbot dependency installed?)`])
    expect(violations(found, { ...manifests, client: { ...manifests.client, dsh: {} } }, present))
      .toEqual([`${CLIENT_PACKAGE} declares no dsh.client web half`])
    expect(violations(found, { ...manifests, cell: { ...manifests.cell, dsh: {} } }, present))
      .toEqual([`${CELL_PACKAGE} declares no dsh.client web half`])
    expect(violations(found, manifests, present.map(artifact => ({ ...artifact, exists: false }))))
      .toEqual(present.map(artifact => `${artifact.path} is missing`))
  })
})
