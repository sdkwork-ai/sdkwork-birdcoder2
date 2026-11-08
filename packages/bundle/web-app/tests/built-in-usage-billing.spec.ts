/**
 * The built-in usage billing integration: `@kenz1117/dsh-ui-usage-billing` is
 * linked into this repository as the `plugins/dsh-ui-usage-billing` git
 * submodule and composed by this bundle, so a shipped build — and the desktop
 * layer patched over it — offers the usage/cost dashboard without an installer
 * step.
 *
 * The submodule contents are not edited by this repository, so the assertions
 * below read the artifacts as shipped rather than pinning source text: the row
 * exists and is enabled, the package resolves with both halves declared and
 * present, the host half still serves the `/api/billing/*` routes its browser
 * half calls, and the client half still registers the two seats the surface
 * lives in. This bundle's row is the only mount — the package's own
 * `dsh.bundle.patch` stays out of every profile's bundle list — so a lost row,
 * a renamed package, or a rebuilt artifact that no longer registers its seats
 * has to fail here instead of at boot.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Loader row id and npm name of the built-in usage billing plugin. */
const ROW_ID = 'ui-usage-billing'
const PACKAGE_NAME = '@kenz1117/dsh-ui-usage-billing'

/** The host services the plugin's `apply` cannot start without. */
const REQUIRED_INJECTIONS = ['webServer', 'sessionPersistence', 'credentials', 'settings'] as const

/** The one route path the browser dashboard reads its ledger from. */
const USAGE_STATS_PATH = '/api/billing/usage-stats'

/** The browser seats the surface is drawn into. The settings-menu account card
 *  is the shipped entry: the sidebar trigger is hidden by default, so the card
 *  under the account identity row is where the surface stays reachable. */
const CLIENT_SEATS = ['sidebar.footer.action', 'settings.section', 'settings.menu.account'] as const

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

/**
 * The file an `exports` map entry names. This plugin declares its two entries in
 * condition-map form (`{ types, default }`), where other submodules declare a
 * bare string, so both shapes resolve to the shipped artifact here.
 * @param value - one `exports` entry.
 * @returns the artifact path, or undefined when the entry names no file.
 */
function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) return undefined
  const conditions = value as Record<string, unknown>
  for (const condition of ['default', 'import', 'node'] as const) {
    const target = conditions[condition]
    if (typeof target === 'string') return target
  }
  return undefined
}

/**
 * Whether the host artifact declares every service its `apply` reads.
 * @param source - the shipped `lib/index.js`.
 * @returns one violation message per missing injection.
 */
function injectionViolations(source: string): string[] {
  const declared = /const inject\s*=\s*\[([^\]]*)\]/.exec(source)
  if (declared === null) return [`${PACKAGE_NAME} host half declares no inject list`]
  return REQUIRED_INJECTIONS
    .filter(service => !new RegExp(`['"]${service}['"]`).test(declared[1]!))
    .map(service => `${PACKAGE_NAME} host half does not inject ${service}`)
}

/**
 * Every way the composed usage billing integration can be incomplete.
 * @param row - the composed Loader row, or undefined when the patch lost it.
 * @param manifest - the linked package manifest, or undefined when unresolved.
 * @param present - the shipped halves, with their source when readable.
 * @returns one message per violation, empty when the integration is complete.
 */
function violations(
  row: EntryOptions | undefined,
  manifest: Record<string, unknown> | undefined,
  present: { path: string; exists: boolean; source?: string }[],
): string[] {
  const found: string[] = []
  if (row === undefined) found.push(`the web patch declares no ${ROW_ID} row`)
  else {
    if (row.name !== PACKAGE_NAME) found.push(`${ROW_ID} names ${row.name}, not ${PACKAGE_NAME}`)
    if (row.disabled !== undefined) found.push(`${ROW_ID} is not enabled by default`)
  }
  if (manifest === undefined) {
    found.push(`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/dsh-ui-usage-billing submodule checked out?)`)
    return found
  }
  const dsh = typeof manifest.dsh === 'object' && manifest.dsh !== null
    ? manifest.dsh as { client?: { platform?: unknown }; bundle?: { patch?: unknown } }
    : undefined
  if (dsh?.client?.platform !== 'web') found.push(`${PACKAGE_NAME} declares no dsh.client web half`)
  // The package ships its own bundle patch, and this bundle deliberately does
  // not list it: one row, one mount. A patch that disappeared upstream would
  // mean the package changed its own composition story, which is worth failing
  // on rather than discovering as a second, silently different mount.
  if (dsh?.bundle?.patch === undefined) found.push(`${PACKAGE_NAME} declares no dsh.bundle.patch`)
  for (const entry of present) {
    if (!entry.exists) {
      found.push(`${PACKAGE_NAME} is missing its built ${entry.path}`)
      continue
    }
    if (entry.source === undefined) continue
    const source = entry.source
    if (entry.path.endsWith('client.js')) {
      // A client half that stopped registering either seat leaves a shipped
      // build with no card, no recovery entry, and no way to name the loss.
      for (const seat of CLIENT_SEATS) {
        if (!source.includes(seat)) found.push(`${PACKAGE_NAME} client half registers no ${seat} seat`)
      }
      if (!source.includes(PACKAGE_NAME)) found.push(`${PACKAGE_NAME} client half carries no ${PACKAGE_NAME} bundle id`)
    } else {
      found.push(...injectionViolations(source))
      // The browser half polls this one route for every number it draws; a
      // route prefix that moved leaves the dashboard permanently empty.
      if (!source.includes(USAGE_STATS_PATH)) {
        found.push(`${PACKAGE_NAME} host half serves no ${USAGE_STATS_PATH} route`)
      }
    }
  }
  return found
}

/** Resolve the linked package manifest and both entry artifacts as the row sees them. */
function inspect(): { manifest: Record<string, unknown> | undefined; present: { path: string; exists: boolean; source?: string }[] } {
  const root = packageRoot()
  if (root === undefined) return { manifest: undefined, present: [] }
  const manifest = JSON.parse(artifact(root, 'package.json')) as Record<string, unknown>
  const exportsField = manifest.exports as Record<string, unknown> | undefined
  const relative = [exportsField?.['.'], exportsField?.['./client']]
    .map(exportTarget)
    .filter((value): value is string => value !== undefined)
  return {
    manifest,
    present: relative.map((value) => {
      const exists = existsSync(join(root, value))
      return exists ? { path: value, exists, source: artifact(root, value) } : { path: value, exists }
    }),
  }
}

describe('built-in usage billing', () => {
  it('composes @kenz1117/dsh-ui-usage-billing by default from the linked submodule', () => {
    const { manifest, present } = inspect()
    expect(violations(rows().find(row => row.id === ROW_ID), manifest, present)).toEqual([])
    // Both halves must be the shipped artifacts: this repository runs the
    // plugin's committed `lib/` files rather than rebuilding them.
    expect(present.map(entry => entry.path)).toEqual(['./lib/index.js', './lib/client.js'])
  })

  it('rejects each way the integration can be incomplete', () => {
    const { manifest, present } = inspect()
    const row = rows().find(candidate => candidate.id === ROW_ID)
    if (row === undefined || manifest === undefined) throw new Error('the integration is already incomplete')

    expect(violations(undefined, manifest, present)).toEqual([`the web patch declares no ${ROW_ID} row`])
    expect(violations({ ...row, name: '@deepseek-ai/dsh-client-ui-theme' }, manifest, present))
      .toEqual([`${ROW_ID} names @deepseek-ai/dsh-client-ui-theme, not ${PACKAGE_NAME}`])
    expect(violations({ ...row, disabled: true }, manifest, present))
      .toEqual([`${ROW_ID} is not enabled by default`])
    expect(violations(row, undefined, present))
      .toEqual([`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/dsh-ui-usage-billing submodule checked out?)`])
    expect(violations(row, { ...manifest, dsh: {} }, present))
      .toEqual([`${PACKAGE_NAME} declares no dsh.client web half`, `${PACKAGE_NAME} declares no dsh.bundle.patch`])
    expect(violations(row, manifest, present.map(entry => ({ ...entry, exists: false }))))
      .toEqual(present.map(entry => `${PACKAGE_NAME} is missing its built ${entry.path}`))
    // The client half is the surface: losing any seat loses the card, the
    // settings page that brings it back after it is hidden, or the
    // settings-menu card that is the shipped default entry.
    expect(violations(row, manifest, present.map(entry => (
      entry.path.endsWith('client.js') ? { ...entry, source: 'window.__ModuleLoader__.load({ factory: () => ({}) })' } : entry
    ))))
      .toEqual([
        ...CLIENT_SEATS.map(seat => `${PACKAGE_NAME} client half registers no ${seat} seat`),
        `${PACKAGE_NAME} client half carries no ${PACKAGE_NAME} bundle id`,
      ])
    // The host half is where every number comes from: without its injections the
    // entry never starts, and without the route the dashboard draws nothing.
    expect(violations(row, manifest, present.map(entry => (
      entry.path.endsWith('index.js') ? { ...entry, source: 'export function apply() {}' } : entry
    ))))
      .toEqual([
        `${PACKAGE_NAME} host half declares no inject list`,
        `${PACKAGE_NAME} host half serves no ${USAGE_STATS_PATH} route`,
      ])
    expect(violations(row, manifest, present.map(entry => (
      entry.path.endsWith('index.js')
        ? { ...entry, source: `const inject = ['webServer']\n${USAGE_STATS_PATH}` }
        : entry
    ))))
      .toEqual([
        `${PACKAGE_NAME} host half does not inject sessionPersistence`,
        `${PACKAGE_NAME} host half does not inject credentials`,
        `${PACKAGE_NAME} host half does not inject settings`,
      ])
  })

  it('stays enabled under every desktop layer a shipped build applies', () => {
    // The desktop profile composes this bundle and patches over it, so the row
    // arrives in a desktop build with no second declaration. What could still
    // take the dashboard away is an override layer disabling it by id; neither
    // the desktop bundle patch nor the desktop host's own override does.
    for (const layer of desktopLayerPaths) {
      const addressed = rows(layer).find(candidate => candidate.id === ROW_ID)
      expect(
        addressed === undefined || addressed.disabled === undefined,
        `${ROW_ID} is disabled by ${layer}`,
      ).toBe(true)
      // A layer that re-points the row at another package is the other way to
      // lose the dashboard without saying "disabled".
      if (addressed !== undefined) expect(addressed.name).toBe(PACKAGE_NAME)
    }
  })
})
