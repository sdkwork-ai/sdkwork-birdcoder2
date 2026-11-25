/**
 * The built-in expert market integration: the 331-expert roster ships as a
 * first-party package of this repository (`@deepseek-ai/dsh-client-ui-sdkwork-experts`,
 * under `packages/client/`) and is composed by this bundle, so a shipped build —
 * and the desktop layer patched over it — offers the expert market (the Experts
 * tab's market chip, which embeds the package's roster panel) without an
 * installer step and without a pinned submodule.
 *
 * The assertions read the package's committed sources, which are always present:
 * both composed rows, the pinned entry location, the client source that declares
 * the `agency-agents` panel key and registers it under `main` and
 * `sidebar.panellist`. When this checkout has built the package, the same checks
 * are repeated against the shipped `lib/client.js`, so a build that lost the
 * binding fails here too. The panel key is the one soft contract between the two
 * packages: `ui-sdkwork-markets` hard-codes it (`EXPERT_MARKET_PANEL_ID`) and
 * renders the panel in place.
 *
 * The spec also pins the removal itself: the submodule the expert market used to
 * be (`plugins/sdkwork-dsh-agents`, the `@michengai/dsh-agency-agents` mirror)
 * must not reappear in `.gitmodules` or on disk. A checkout that re-adds it
 * would silently ship two expert markets, or a market whose data does not come
 * from `sdkwork-agents`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseEntryYaml } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Loader row ids and npm names of the built-in expert market. */
const PANEL_ROW_ID = 'agency-agents'
const REMOTE_ROW_ID = 'agency-agents-remote'
const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-sdkwork-experts'
const REMOTE_NAME = `${PACKAGE_NAME}/remote`

/** The keyed `main` panel the Experts tab embeds (see ui-sdkwork-markets). */
const PANEL_ID = 'agency-agents'

/** Committed entries every checkout carries. */
const SOURCE_ENTRIES = ['./src/index.ts', './src/remote.ts', './src/client/index.ts', './src/client/bundle-config.ts']
/** This repository's own build output, present only after a build. */
const BUILT_ENTRIES = ['./lib/index.js', './lib/client.js', './lib/remote.js']

/** The submodule the expert market used to be linked as. */
const REMOVED_SUBMODULE = 'plugins/sdkwork-dsh-agents'
const REMOVED_PACKAGE = '@michengai/dsh-agency-agents'

const bundleRoot = fileURLToPath(new URL('..', import.meta.url))
const patchPath = join(bundleRoot, 'cordis.patch.yml')
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url))
/** The desktop override layers a shipped desktop build applies over this bundle. */
const desktopLayerPaths = [
  fileURLToPath(new URL('../../sdkwork-desktop-app/cordis.patch.yml', import.meta.url)),
  fileURLToPath(new URL('../../../../apps/desktop-host/config/desktop.cordis.patch.yml', import.meta.url)),
]
const require = createRequire(import.meta.url)

/**
 * Every row a patch list inserts or addresses, in composition order.
 * @param path - the patch file; defaults to this bundle's own patch.
 * @returns the addressed rows.
 */
function rows(path: string = patchPath): EntryOptions[] {
  const parsed = parseEntryYaml(readFileSync(path, 'utf8')) as
    | ({ insert?: EntryOptions[] } & EntryOptions)[]
    | undefined
  return (parsed ?? []).flatMap(patch => patch.insert === undefined ? [patch] : patch.insert)
}

/** The linked package's root, or undefined when it does not resolve. */
function packageRoot(): string | undefined {
  try {
    return dirname(require.resolve(`${PACKAGE_NAME}/package.json`))
  } catch {
    return undefined
  }
}

/** Read one artifact of the linked package. */
function artifact(root: string, relative: string): string {
  return readFileSync(join(root, relative), 'utf8')
}

/** The exported entry paths a manifest declares for its plugin halves. */
function entryPaths(manifest: Record<string, unknown>): { index: string; client: string; remote: string } | undefined {
  const exportsField = manifest.exports as Record<string, unknown> | undefined
  const read = (key: string): string | undefined => {
    const value = exportsField?.[key]
    if (typeof value === 'string') return value
    const nested = (value as { default?: unknown } | undefined)?.default
    return typeof nested === 'string' ? nested : undefined
  }
  const index = read('.')
  const client = read('./client')
  const remote = read('./remote')
  return index === undefined || client === undefined || remote === undefined
    ? undefined
    : { index, client, remote }
}

/**
 * The identifier the shipped client binds the panel key to, when it binds one.
 * @param source - the built `lib/client.js` or the client source.
 * @returns the bound identifier, or undefined when no such binding exists.
 */
function panelBinding(source: string): string | undefined {
  return /(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[`'"]agency-agents[`'"]/u.exec(source)?.[1]
}

/**
 * Every way the composed expert-market integration can be incomplete.
 * @param panelRow - the composed panel row, or undefined when the patch lost it.
 * @param remoteRow - the composed remote row, or undefined when the patch lost it.
 * @param manifest - the linked package manifest, or undefined when unresolved.
 * @param present - the committed source entries.
 * @param built - this checkout's build output; empty when the package is unbuilt.
 * @returns one message per violation, empty when the integration is complete.
 */
function violations(
  panelRow: EntryOptions | undefined,
  remoteRow: EntryOptions | undefined,
  manifest: Record<string, unknown> | undefined,
  present: { path: string; exists: boolean; source?: string }[],
  built: { path: string; exists: boolean; source?: string }[] = [],
): string[] {
  const found: string[] = []
  if (panelRow === undefined) found.push(`the web patch declares no ${PANEL_ROW_ID} row`)
  else {
    if (panelRow.name !== PACKAGE_NAME) found.push(`${PANEL_ROW_ID} names ${panelRow.name}, not ${PACKAGE_NAME}`)
    if (panelRow.disabled !== undefined) found.push(`${PANEL_ROW_ID} is not enabled by default`)
    // The plugin registers its panel only while its own entry is enabled. The
    // row pins the location this composition needs, so losing the config makes
    // the Experts tab's market chip show a notice instead of the roster.
    const config = panelRow.config as { entryLocation?: unknown } | undefined
    if (config?.entryLocation !== 'both') {
      found.push(`${PANEL_ROW_ID} does not pin the plugin entry to both locations`)
    }
  }
  if (remoteRow === undefined) found.push(`the web patch declares no ${REMOTE_ROW_ID} row`)
  else {
    if (remoteRow.name !== REMOTE_NAME) found.push(`${REMOTE_ROW_ID} names ${remoteRow.name}, not ${REMOTE_NAME}`)
    if (remoteRow.disabled !== undefined) found.push(`${REMOTE_ROW_ID} is not enabled by default`)
  }
  if (manifest === undefined) {
    found.push(`${PACKAGE_NAME} does not resolve from this bundle (is the package built and linked?)`)
    return found
  }
  const dsh = manifest.dsh as { client?: { platform?: unknown }; bundle?: { patch?: unknown } } | undefined
  if (dsh?.client?.platform !== 'web') found.push(`${PACKAGE_NAME} declares no dsh.client web half`)
  for (const entry of present) {
    if (!entry.exists) found.push(`${PACKAGE_NAME} is missing its source entry ${entry.path}`)
  }
  // The client source declares the key and registers both seats on it. Read the
  // two client modules together: bundle-config owns the seats, index the key.
  const clientSource = present
    .filter(entry => entry.exists && entry.path.endsWith('bundle-config.ts'))
    .map(entry => entry.source ?? '')
    .join('\n')
  if (clientSource !== '') {
    const panel = panelBinding(clientSource)
    if (panel === undefined) {
      found.push(`${PACKAGE_NAME} declares no ${PANEL_ID} panel id`)
    } else if (!/name:\s*['"`]main['"`]/u.test(clientSource) || !/key:\s*[A-Za-z_$][\w$]*/u.test(clientSource)) {
      found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} main panel`)
    } else if (!/name:\s*['"`]sidebar\.panellist['"`]/u.test(clientSource)) {
      found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} sidebar entry`)
    }
  }
  // A built lane additionally pins the shipped artifact. A checkout that has not
  // built the package skips this arm rather than failing on missing output.
  const builtClient = built.find(entry => entry.path.endsWith('client.js'))
  if (builtClient?.exists === true && builtClient.source !== undefined) {
    const panel = panelBinding(builtClient.source)
    if (panel === undefined) {
      found.push(`${PACKAGE_NAME} declares no ${PANEL_ID} panel id`)
    } else if (!new RegExp(`key:\\s*${panel}\\b`, 'u').test(builtClient.source)) {
      found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} main panel`)
    } else if (!new RegExp(`id:\\s*${panel}\\b`, 'u').test(builtClient.source)) {
      found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} sidebar entry`)
    }
  }
  return found
}

/** Resolve the linked package manifest, its source entries, and any build output. */
function inspect(): {
  manifest: Record<string, unknown> | undefined
  present: { path: string; exists: boolean; source?: string }[]
  built: { path: string; exists: boolean; source?: string }[]
} {
  const root = packageRoot()
  if (root === undefined) return { manifest: undefined, present: [], built: [] }
  const manifest = JSON.parse(artifact(root, 'package.json')) as Record<string, unknown>
  const paths = entryPaths(manifest)
  if (paths === undefined) return { manifest, present: [], built: [] }
  const read = (values: readonly string[]) => values.map((value) => {
    const exists = existsSync(join(root, value))
    return exists ? { path: value, exists, source: artifact(root, value) } : { path: value, exists }
  })
  return { manifest, present: read(SOURCE_ENTRIES), built: read(BUILT_ENTRIES) }
}

describe('built-in expert market', () => {
  it('composes the first-party expert package by default', () => {
    const { manifest, present, built } = inspect()
    expect(violations(
      rows().find(row => row.id === PANEL_ROW_ID),
      rows().find(row => row.id === REMOTE_ROW_ID),
      manifest,
      present,
      built,
    )).toEqual([])
    // The declared exports point at the built entries; the source entries every
    // checkout carries are what this unit lane checks.
    expect(SOURCE_ENTRIES).toEqual(['./src/index.ts', './src/remote.ts', './src/client/index.ts', './src/client/bundle-config.ts'])
  })

  it('no longer links the MichengAI submodule', () => {
    // `.gitmodules` and the working tree are the two places a re-added
    // submodule would show up; either one means a second expert market.
    const gitmodules = readFileSync(join(repositoryRoot, '.gitmodules'), 'utf8')
    expect(gitmodules).not.toContain(REMOVED_SUBMODULE)
    expect(gitmodules).not.toContain(REMOVED_PACKAGE)
    expect(existsSync(join(repositoryRoot, REMOVED_SUBMODULE))).toBe(false)
    // The workspace must not resolve the old package name either.
    expect(rows().some(row => String(row.name).includes(REMOVED_PACKAGE))).toBe(false)
  })

  it('rejects each way the integration can be incomplete', () => {
    const { manifest, present, built } = inspect()
    const panelRow = rows().find(candidate => candidate.id === PANEL_ROW_ID)
    const remoteRow = rows().find(candidate => candidate.id === REMOTE_ROW_ID)
    if (panelRow === undefined || remoteRow === undefined || manifest === undefined) {
      throw new Error('the integration is already incomplete')
    }

    expect(violations(undefined, remoteRow, manifest, present))
      .toEqual([`the web patch declares no ${PANEL_ROW_ID} row`])
    expect(violations({ ...panelRow, name: '@deepseek-ai/dsh-client-ui-theme' }, remoteRow, manifest, present))
      .toEqual([`${PANEL_ROW_ID} names @deepseek-ai/dsh-client-ui-theme, not ${PACKAGE_NAME}`])
    expect(violations({ ...panelRow, disabled: true }, remoteRow, manifest, present))
      .toEqual([`${PANEL_ROW_ID} is not enabled by default`])
    // Without the pinned location the plugin's entry falls back to its shipped
    // settings-only default, its `main` panel is never registered, and the
    // Experts tab's market chip has nothing to embed.
    expect(violations({ ...panelRow, config: {} }, remoteRow, manifest, present))
      .toEqual([`${PANEL_ROW_ID} does not pin the plugin entry to both locations`])
    expect(violations(panelRow, undefined, manifest, present))
      .toEqual([`the web patch declares no ${REMOTE_ROW_ID} row`])
    expect(violations(panelRow, { ...remoteRow, name: PACKAGE_NAME }, manifest, present))
      .toEqual([`${REMOTE_ROW_ID} names ${PACKAGE_NAME}, not ${REMOTE_NAME}`])
    expect(violations(panelRow, { ...remoteRow, disabled: true }, manifest, present))
      .toEqual([`${REMOTE_ROW_ID} is not enabled by default`])
    expect(violations(panelRow, remoteRow, undefined, present))
      .toEqual([`${PACKAGE_NAME} does not resolve from this bundle (is the package built and linked?)`])
    expect(violations(panelRow, remoteRow, { ...manifest, dsh: {} }, present))
      .toEqual([`${PACKAGE_NAME} declares no dsh.client web half`])
    expect(violations(panelRow, remoteRow, manifest, present.map(entry => ({ ...entry, exists: false }))))
      .toEqual(present.map(entry => `${PACKAGE_NAME} is missing its source entry ${entry.path}`))
    // The panel key is the one contract the Experts tab embeds by: a client
    // source that no longer binds it must fail here.
    expect(violations(panelRow, remoteRow, manifest, present.map(entry => (
      entry.path.endsWith('bundle-config.ts') ? { ...entry, source: 'export const apply = () => {}' } : entry
    ))))
      .toEqual([`${PACKAGE_NAME} declares no ${PANEL_ID} panel id`])
    // A key that is declared but never registered under `main` is the other
    // half of the same break.
    expect(violations(panelRow, remoteRow, manifest, present.map(entry => (
      entry.path.endsWith('bundle-config.ts')
        ? { ...entry, source: 'const SIDEBAR_PANEL_ID = `agency-agents`;ctx.slots.register({name:`sidebar.panellist`,id:SIDEBAR_PANEL_ID})' }
        : entry
    ))))
      .toEqual([`${PACKAGE_NAME} registers no ${PANEL_ID} main panel`])
    // And a `main` panel with no sidebar row would be listed twice in the left
    // column once the market embeds it.
    expect(violations(panelRow, remoteRow, manifest, present.map(entry => (
      entry.path.endsWith('bundle-config.ts')
        ? { ...entry, source: 'const SIDEBAR_PANEL_ID = `agency-agents`;ctx.slots.register({name:`main`,key:SIDEBAR_PANEL_ID})' }
        : entry
    ))))
      .toEqual([`${PACKAGE_NAME} registers no ${PANEL_ID} sidebar entry`])
    // A build that loses the shipped binding fails even when the sources agree.
    expect(violations(panelRow, remoteRow, manifest, present, built.map(entry => (
      entry.path.endsWith('client.js') ? { ...entry, source: 'export const apply = () => {}' } : entry
    ))))
      .toEqual([`${PACKAGE_NAME} declares no ${PANEL_ID} panel id`])
  })

  it('stays enabled under every desktop layer a shipped build applies', () => {
    // The desktop profile composes this bundle and patches over it, so the rows
    // arrive in a desktop build with no second declaration. What could still
    // take the expert market away is an override layer disabling one by id.
    for (const layer of desktopLayerPaths) {
      for (const [rowId, name] of [[PANEL_ROW_ID, PACKAGE_NAME], [REMOTE_ROW_ID, REMOTE_NAME]] as const) {
        const addressed = rows(layer).find(candidate => candidate.id === rowId)
        expect(
          addressed === undefined || addressed.disabled === undefined,
          `${rowId} is disabled by ${layer}`,
        ).toBe(true)
        // A layer that re-points the row at another package is the other way to
        // lose the market without saying "disabled".
        if (addressed !== undefined) expect(addressed.name).toBe(name)
      }
    }
  })
})
