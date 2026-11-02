/**
 * The built-in plugin market: the third-party `dshmarket` plugin is a
 * dependency of this bundle and one row mounts it, so a shipped build — and
 * the desktop layer patched over it — opens the Plugins tab's leading chip on
 * the community catalog with no installer step.
 *
 * The package is not authored here and is not edited here, so the assertions
 * read the published artifacts as shipped rather than pinning source text: the
 * row exists and is enabled, the package resolves with both halves declared and
 * present, and the browser half still publishes the `market` control that
 * `ui-sdkwork-markets` renders in place. That control is the one soft contract
 * between the two packages — the page accepts only contract version 1 with a
 * `render` method and otherwise falls back to the install affordance — so a
 * market release that changes it has to fail here instead of quietly turning
 * the leading chip back into "not installed".
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Loader row id and npm name of the built-in plugin market. */
const ROW_ID = 'dsh-market'
const PACKAGE_NAME = 'dshmarket'

/** The client service the Plugins tab renders in place (see ui-sdkwork-markets). */
const CONTROL_NAME = 'market'

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

/** The installed package's root, or undefined when it does not resolve. */
function packageRoot(): string | undefined {
  try {
    return dirname(require.resolve(`${PACKAGE_NAME}/package.json`))
  } catch {
    return undefined
  }
}

/** Read one artifact of the installed package. */
function artifact(root: string, relative: string): string {
  return readFileSync(join(root, relative), 'utf8')
}

/**
 * Every way the composed plugin market integration can be incomplete.
 * @param row - the composed Loader row, or undefined when the patch lost it.
 * @param manifest - the installed package manifest, or undefined when unresolved.
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
    found.push(`${PACKAGE_NAME} does not resolve from this bundle (is it in the bundle's dependencies?)`)
    return found
  }
  const dsh = typeof manifest.dsh === 'object' && manifest.dsh !== null ? manifest.dsh as Record<string, unknown> : {}
  const client = typeof dsh.client === 'object' && dsh.client !== null ? dsh.client as Record<string, unknown> : undefined
  const bundle = typeof dsh.bundle === 'object' && dsh.bundle !== null ? dsh.bundle as Record<string, unknown> : undefined
  if (client?.platform !== 'web') found.push(`${PACKAGE_NAME} declares no dsh.client web half`)
  // The package ships its own bundle patch. The profile does not list it — this
  // bundle's row is the single composition — but a package that stopped
  // declaring one is worth noticing before an install path assumes it.
  if (bundle?.patch === undefined) found.push(`${PACKAGE_NAME} declares no dsh.bundle.patch`)
  for (const entry of present) {
    if (!entry.exists) {
      found.push(`${PACKAGE_NAME} is missing its shipped ${entry.path}`)
      continue
    }
    const source = entry.source ?? ''
    if (entry.path.endsWith('/client.js') || entry.path === './client/client.js') {
      // The Plugins tab attaches only a control that publishes itself under the
      // name `market`, carries contract version 1, and offers `render`. Reading
      // the bundle text is the only check available without a browser host, so
      // it pins those three facts rather than the object's identity.
      if (!/ctx\.provide\(\s*["']market["']/.test(source)) {
        found.push(`${PACKAGE_NAME} client half publishes no ${CONTROL_NAME} control`)
      } else if (!/version:\s*1\s*,/.test(source)) {
        found.push(`${PACKAGE_NAME} client half publishes no contract version 1`)
      } else if (!/\brender:\s*\(/.test(source)) {
        found.push(`${PACKAGE_NAME} client half publishes no render method`)
      }
    } else if (!/ctx\.inject\(\s*\[\s*['"]webServer['"]/.test(source)) {
      found.push(`${PACKAGE_NAME} host half does not inject webServer`)
    } else if (!/mountMarketRoutes\s*\(/.test(source)) {
      found.push(`${PACKAGE_NAME} host half mounts no market routes`)
    }
  }
  return found
}

/** Resolve the installed package manifest and both entry artifacts as the row sees them. */
function inspect(): { manifest: Record<string, unknown> | undefined; present: { path: string; exists: boolean; source?: string }[] } {
  const root = packageRoot()
  if (root === undefined) return { manifest: undefined, present: [] }
  const manifest = JSON.parse(artifact(root, 'package.json')) as Record<string, unknown>
  const exportsField = manifest.exports as Record<string, unknown> | undefined
  const relative = [exportsField?.['.'], exportsField?.['./client']]
    .flatMap((value) => {
      if (typeof value === 'string') return [value]
      if (typeof value === 'object' && value !== null) {
        const fallback = (value as Record<string, unknown>).default
        return typeof fallback === 'string' ? [fallback] : []
      }
      return []
    })
  return {
    manifest,
    present: relative.map((value) => {
      const exists = existsSync(join(root, value))
      return exists ? { path: value, exists, source: artifact(root, value) } : { path: value, exists }
    }),
  }
}

describe('built-in plugin market', () => {
  it('composes dshmarket by default from this bundle', () => {
    const { manifest, present } = inspect()
    expect(violations(rows().find(row => row.id === ROW_ID), manifest, present)).toEqual([])
    // Both halves are the published artifacts: this repository installs the
    // package from npm and never rebuilds it.
    expect(present.map(entry => entry.path)).toEqual(['./lib/index.js', './client/client.js'])
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
      .toEqual([`${PACKAGE_NAME} does not resolve from this bundle (is it in the bundle's dependencies?)`])
    expect(violations(row, { ...manifest, dsh: {} }, present))
      .toEqual([`${PACKAGE_NAME} declares no dsh.client web half`, `${PACKAGE_NAME} declares no dsh.bundle.patch`])
    expect(violations(row, manifest, present.map(entry => ({ ...entry, exists: false }))))
      .toEqual(present.map(entry => `${PACKAGE_NAME} is missing its shipped ${entry.path}`))
    // The `market` control is the one contract the Plugins tab renders by: a
    // client artifact that stopped publishing it must fail here.
    const client = present.map(entry => (
      entry.path.endsWith('/client.js') ? { ...entry, source: 'export const apply = () => {}' } : entry
    ))
    expect(violations(row, manifest, client))
      .toEqual([`${PACKAGE_NAME} client half publishes no ${CONTROL_NAME} control`])
    expect(violations(row, manifest, client.map(entry => (
      entry.path.endsWith('/client.js')
        ? { ...entry, source: 'ctx.provide("market", control)\nrender: () => null' }
        : entry
    ))))
      .toEqual([`${PACKAGE_NAME} client half publishes no contract version 1`])
    expect(violations(row, manifest, client.map(entry => (
      entry.path.endsWith('/client.js')
        ? { ...entry, source: 'ctx.provide("market", control)\nversion: 1,' }
        : entry
    ))))
      .toEqual([`${PACKAGE_NAME} client half publishes no render method`])
    // And the host half is the half that makes the catalog real: it serves the
    // routes the panel calls.
    expect(violations(row, manifest, present.map(entry => (
      entry.path.endsWith('/client.js') ? entry : { ...entry, source: 'export function apply() {}' }
    ))))
      .toEqual([`${PACKAGE_NAME} host half does not inject webServer`])
    expect(violations(row, manifest, present.map(entry => (
      entry.path.endsWith('/client.js')
        ? entry
        : { ...entry, source: "ctx.inject(['webServer'], () => {})" }
    ))))
      .toEqual([`${PACKAGE_NAME} host half mounts no market routes`])
  })

  it('stays enabled under every desktop layer a shipped build applies', () => {
    // The desktop profile composes this bundle and patches over it, so the row
    // arrives in a desktop build with no second declaration. What could still
    // take the market away is an override layer disabling it by id; neither the
    // desktop bundle patch nor the desktop host's own override does.
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
