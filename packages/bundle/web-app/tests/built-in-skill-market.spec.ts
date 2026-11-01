/**
 * The built-in skill market integration: `@montersy123/dsh-skill-market` is
 * linked into this repository as the `plugins/dsh-skill-market` git submodule
 * and composed by this bundle, so a shipped build — and the desktop layer
 * patched over it — offers the SkillHub market (and the Skills tab's link into
 * it) without an installer step.
 *
 * The submodule contents are not edited by this repository, so the assertions
 * below read the artifacts as shipped rather than pinning source text: the row
 * exists and is enabled, the package resolves with both halves declared and
 * present, and the shipped client still registers the keyed `main` panel the
 * Skills tab navigates to. The last check is the one soft contract between the
 * two packages: `ui-sdkwork-markets` hard-codes that panel key
 * (`SKILL_MARKET_PANEL_ID`), so a rename upstream has to fail here instead of
 * leaving a button that throws `layout.selectPanel` at click time.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Loader row id and npm name of the built-in skill market plugin. */
const ROW_ID = 'montersy-skill-market'
const PACKAGE_NAME = '@montersy123/dsh-skill-market'

/** The keyed `main` panel the Skills tab opens (see ui-sdkwork-markets). */
const PANEL_ID = 'skill-market'

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
 * Every way the composed skill market integration can be incomplete.
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
    found.push(`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/dsh-skill-market submodule checked out?)`)
    return found
  }
  const dsh = manifest.dsh
  const client = typeof dsh === 'object' && dsh !== null
    ? (dsh as { client?: { platform?: unknown }; bundle?: { patch?: unknown } }).client
    : undefined
  if (client?.platform !== 'web') found.push(`${PACKAGE_NAME} declares no dsh.client web half`)
  const bundle = typeof dsh === 'object' && dsh !== null
    ? (dsh as { bundle?: { patch?: unknown } }).bundle
    : undefined
  // The package ships its own bundle patch. It must not be the only mount: the
  // profile does not list it, this bundle's row is the single composition, so
  // a package whose patch went missing is still complete but a package that
  // stopped declaring one at all is worth noticing.
  if (bundle?.patch === undefined) found.push(`${PACKAGE_NAME} declares no dsh.bundle.patch`)
  for (const entry of present) {
    if (!entry.exists) found.push(`${PACKAGE_NAME} is missing its built ${entry.path}`)
    else if (entry.exists && entry.source !== undefined) {
      const source = entry.source
      if (entry.path.endsWith('client.js')) {
        if (!/const\s+PANEL_ID\s*=\s*'skill-market'/.test(source)) {
          found.push(`${PACKAGE_NAME} declares no ${PANEL_ID} panel id`)
        } else if (!/key:\s*PANEL_ID/.test(source)) {
          found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} main panel`)
        } else if (!/id:\s*PANEL_ID/.test(source)) {
          found.push(`${PACKAGE_NAME} registers no ${PANEL_ID} sidebar entry`)
        }
      } else if (!/export\s+const\s+inject\s*=\s*\[\s*'webServer'\s*\]/.test(source)) {
        found.push(`${PACKAGE_NAME} host half does not inject webServer`)
      } else if (!/ctx\.skills\.register\(/.test(source)) {
        found.push(`${PACKAGE_NAME} host half publishes no skill to ctx.skills`)
      } else if (!/provider:\s*'skill-market'/.test(source)) {
        // The second soft contract with the Settings page: the manager groups
        // and labels an installed skill by this provider (the Host reports the
        // market's own source string as `unknown`), so a rename upstream would
        // silently move every market row into the fallback bucket.
        found.push(`${PACKAGE_NAME} host half registers skills under no skill-market provider`)
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
    .filter((value): value is string => typeof value === 'string')
  return {
    manifest,
    present: relative.map((value) => {
      const exists = existsSync(join(root, value))
      return exists ? { path: value, exists, source: artifact(root, value) } : { path: value, exists }
    }),
  }
}

describe('built-in skill market', () => {
  it('composes @montersy123/dsh-skill-market by default from the linked submodule', () => {
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
      .toEqual([`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/dsh-skill-market submodule checked out?)`])
    expect(violations(row, { ...manifest, dsh: {} }, present))
      .toEqual([`${PACKAGE_NAME} declares no dsh.client web half`, `${PACKAGE_NAME} declares no dsh.bundle.patch`])
    expect(violations(row, manifest, present.map(entry => ({ ...entry, exists: false }))))
      .toEqual(present.map(entry => `${PACKAGE_NAME} is missing its built ${entry.path}`))
    // The panel key is the one contract the Skills tab navigates by: a client
    // artifact that no longer registers it must fail here.
    expect(violations(row, manifest, present.map(entry => (
      entry.path.endsWith('client.js') ? { ...entry, source: 'export const apply = () => {}' } : entry
    ))))
      .toEqual([`${PACKAGE_NAME} declares no ${PANEL_ID} panel id`])
    // And the host half is the half that makes an installed skill real: it
    // proxies SkillHub and publishes to the skill registry.
    expect(violations(row, manifest, present.map(entry => (
      entry.path.endsWith('index.js') ? { ...entry, source: 'export function apply() {}' } : entry
    ))))
      .toEqual([`${PACKAGE_NAME} host half does not inject webServer`])
    // The provider string is what the Settings page groups and labels a market
    // skill by, because the Host collapses the market's own source to `unknown`.
    expect(violations(row, manifest, present.map(entry => (
      entry.path.endsWith('index.js')
        ? {
          ...entry,
          source: "export const inject = ['webServer']\nctx.skills.register({ provider: 'other' })",
        }
        : entry
    ))))
      .toEqual([`${PACKAGE_NAME} host half registers skills under no skill-market provider`])
  })

  it('stays enabled under every desktop layer a shipped build applies', () => {
    // The desktop profile composes this bundle and patches over it, so the row
    // arrives in a desktop build with no second declaration. What could still
    // take the market away is an override layer disabling it by id; neither
    // the desktop bundle patch nor the desktop host's own override does.
    for (const layer of desktopLayerPaths) {
      const addressed = rows(layer).find(candidate => candidate.id === ROW_ID)
      expect(
        addressed === undefined || addressed.disabled === undefined,
        `${ROW_ID} is disabled by ${layer}`,
      ).toBe(true)
      // A layer that re-points the row at another package is the other way to
      // lose the market without saying "disabled".
      if (addressed !== undefined) expect(addressed.name).toBe(PACKAGE_NAME)
    }
  })
})
