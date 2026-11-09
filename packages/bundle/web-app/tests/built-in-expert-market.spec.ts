/**
 * The built-in expert market integration: `@michengai/dsh-agency-agents` is
 * linked into this repository as the `plugins/sdkwork-dsh-agents` git submodule
 * and composed by this bundle, so a shipped build — and the desktop layer
 * patched over it — offers the expert market (the Experts tab's market chip,
 * which embeds the plugin's roster panel) without an installer step.
 *
 * The submodule contents are not edited by this repository, so the assertions
 * below read the artifacts as shipped rather than pinning source text: both
 * rows exist and are enabled, the package resolves with its web client and
 * bundle patch declared and its three entry artifacts present, and the shipped
 * client still registers the keyed `main` panel and the sidebar row under the
 * `agency-agents` id. That id is the one soft contract between the two
 * packages: `ui-sdkwork-markets` hard-codes it
 * (`EXPERT_MARKET_PANEL_ID`) and renders the panel in place, so a rename
 * upstream has to fail here instead of leaving the Experts tab with a notice
 * that never lifts.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Loader row ids and npm names of the built-in expert market. */
const PANEL_ROW_ID = 'agency-agents'
const REMOTE_ROW_ID = 'agency-agents-remote'
const PACKAGE_NAME = '@michengai/dsh-agency-agents'
const REMOTE_NAME = `${PACKAGE_NAME}/remote`

/** The keyed `main` panel the Experts tab embeds (see ui-sdkwork-markets). */
const PANEL_ID = 'agency-agents'

const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
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
  const parsed = yaml.load(readFileSync(path, 'utf8'), { schema: entryListSchema }) as
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

/** The exported entry paths a manifest declares for its two plugin halves. */
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
 * @param source - the built `lib/client.js`.
 * @returns the bound identifier, or undefined when no such binding exists.
 */
function panelBinding(source: string): string | undefined {
  return /(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*`agency-agents`/u.exec(source)?.[1]
}

/**
 * Every way the composed expert-market integration can be incomplete.
 * @param panelRow - the composed panel row, or undefined when the patch lost it.
 * @param remoteRow - the composed remote row, or undefined when the patch lost it.
 * @param manifest - the linked package manifest, or undefined when unresolved.
 * @param present - the shipped halves, with their source when readable.
 * @returns one message per violation, empty when the integration is complete.
 */
function violations(
  panelRow: EntryOptions | undefined,
  remoteRow: EntryOptions | undefined,
  manifest: Record<string, unknown> | undefined,
  present: { path: string; exists: boolean; source?: string }[],
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
    found.push(`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/sdkwork-dsh-agents submodule checked out?)`)
    return found
  }
  const dsh = manifest.dsh as { client?: { platform?: unknown }; bundle?: { patch?: unknown } } | undefined
  if (dsh?.client?.platform !== 'web') found.push(`${PACKAGE_NAME} declares no dsh.client web half`)
  if (dsh?.bundle?.patch === undefined) found.push(`${PACKAGE_NAME} declares no dsh.bundle.patch`)
  for (const entry of present) {
    if (!entry.exists) {
      found.push(`${PACKAGE_NAME} is missing its built ${entry.path}`)
      continue
    }
    if (entry.source === undefined) continue
    if (entry.path.endsWith('client.js')) {
      const panel = panelBinding(entry.source)
      if (panel === undefined) {
        found.push(`${PACKAGE_NAME} declares no ${PANEL_ID} panel id`)
      } else if (!new RegExp(`key:\\s*${panel}\\b`, 'u').test(entry.source)) {
        found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} main panel`)
      } else if (!new RegExp(`id:\\s*${panel}\\b`, 'u').test(entry.source)) {
        found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} sidebar entry`)
      }
    }
  }
  return found
}

/** Resolve the linked package manifest and its three entry artifacts as the rows see them. */
function inspect(): {
  manifest: Record<string, unknown> | undefined
  present: { path: string; exists: boolean; source?: string }[]
} {
  const root = packageRoot()
  if (root === undefined) return { manifest: undefined, present: [] }
  const manifest = JSON.parse(artifact(root, 'package.json')) as Record<string, unknown>
  const paths = entryPaths(manifest)
  if (paths === undefined) return { manifest, present: [] }
  return {
    manifest,
    present: [paths.index, paths.client, paths.remote].map((value) => {
      const exists = existsSync(join(root, value))
      return exists ? { path: value, exists, source: artifact(root, value) } : { path: value, exists }
    }),
  }
}

describe('built-in expert market', () => {
  it('composes @michengai/dsh-agency-agents by default from the linked submodule', () => {
    const { manifest, present } = inspect()
    expect(violations(
      rows().find(row => row.id === PANEL_ROW_ID),
      rows().find(row => row.id === REMOTE_ROW_ID),
      manifest,
      present,
    )).toEqual([])
    // All three halves must be the shipped artifacts: this repository runs the
    // plugin's committed `lib/` files rather than rebuilding them.
    expect(present.map(entry => entry.path)).toEqual(['./lib/index.js', './lib/client.js', './lib/remote.js'])
  })

  it('rejects each way the integration can be incomplete', () => {
    const { manifest, present } = inspect()
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
      .toEqual([`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/sdkwork-dsh-agents submodule checked out?)`])
    expect(violations(panelRow, remoteRow, { ...manifest, dsh: {} }, present))
      .toEqual([`${PACKAGE_NAME} declares no dsh.client web half`, `${PACKAGE_NAME} declares no dsh.bundle.patch`])
    expect(violations(panelRow, remoteRow, manifest, present.map(entry => ({ ...entry, exists: false }))))
      .toEqual(present.map(entry => `${PACKAGE_NAME} is missing its built ${entry.path}`))
    // The panel key is the one contract the Experts tab embeds by: a client
    // artifact that no longer binds it must fail here.
    expect(violations(panelRow, remoteRow, manifest, present.map(entry => (
      entry.path.endsWith('client.js') ? { ...entry, source: 'export const apply = () => {}' } : entry
    ))))
      .toEqual([`${PACKAGE_NAME} declares no ${PANEL_ID} panel id`])
    // A key that is declared but never registered under `main` is the other
    // half of the same break.
    expect(violations(panelRow, remoteRow, manifest, present.map(entry => (
      entry.path.endsWith('client.js')
        ? { ...entry, source: 'let Wc=`agency-agents`;ctx.slots.register({name:`sidebar.panellist`,id:Wc})' }
        : entry
    ))))
      .toEqual([`${PACKAGE_NAME} registers no ${PANEL_ID} main panel`])
    // And a `main` panel with no sidebar row would be listed twice in the left
    // column once the market embeds it.
    expect(violations(panelRow, remoteRow, manifest, present.map(entry => (
      entry.path.endsWith('client.js')
        ? { ...entry, source: 'let Wc=`agency-agents`;ctx.slots.register({name:`main`,key:Wc})' }
        : entry
    ))))
      .toEqual([`${PACKAGE_NAME} registers no ${PANEL_ID} sidebar entry`])
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
