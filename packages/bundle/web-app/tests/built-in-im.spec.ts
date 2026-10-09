/**
 * The built-in IM channels integration: `@xmanrui/dsh-im` is linked into this
 * repository as the `plugins/dsh-im` git submodule and composed by this bundle,
 * so a shipped build — and the desktop layer patched over it — offers
 * 设置 → IM机器人 without an installer step. Row, manifest, and built halves are
 * one acceptance path: a missing submodule checkout, a renamed package, a lost
 * browser declaration, or a missing artifact each fail here instead of at boot.
 *
 * The submodule contents are not edited by this repository, so the assertions
 * below deliberately read the artifacts as shipped rather than pinning text.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Loader row id and npm name of the built-in IM plugin. */
const ROW_ID = 'xmanrui-dsh-im'
const PACKAGE_NAME = '@xmanrui/dsh-im'

const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const require = createRequire(import.meta.url)

/** Every row the patch list inserts or addresses, in composition order. */
function rows(): EntryOptions[] {
  const parsed = yaml.load(readFileSync(patchPath, 'utf8'), { schema: entryListSchema }) as
    | ({ insert?: EntryOptions[] } & EntryOptions)[]
    | undefined
  return (parsed ?? []).flatMap(patch => patch.insert === undefined ? [patch] : patch.insert)
}

/**
 * Every way the composed built-in IM integration can be incomplete.
 * @param row - the composed Loader row, or undefined when the patch lost it.
 * @param manifest - the linked package manifest, or undefined when unresolved.
 * @param present - absolute paths of the two entry artifacts the row needs.
 * @returns one message per violation, empty when the integration is complete.
 */
function violations(
  row: EntryOptions | undefined,
  manifest: Record<string, unknown> | undefined,
  present: readonly { path: string; exists: boolean }[],
): string[] {
  const found: string[] = []
  if (row === undefined) found.push(`the web patch declares no ${ROW_ID} row`)
  else {
    if (row.name !== PACKAGE_NAME) found.push(`${ROW_ID} names ${row.name}, not ${PACKAGE_NAME}`)
    if (row.disabled !== undefined) found.push(`${ROW_ID} is not enabled by default`)
  }
  if (manifest === undefined) {
    found.push(`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/dsh-im submodule checked out?)`)
    return found
  }
  const dsh = manifest.dsh
  const client = typeof dsh === 'object' && dsh !== null
    ? (dsh as { client?: { platform?: unknown } }).client
    : undefined
  if (client?.platform !== 'web') found.push(`${PACKAGE_NAME} declares no dsh.client web half`)
  for (const entry of present) {
    if (!entry.exists) found.push(`${PACKAGE_NAME} is missing its built ${entry.path}`)
  }
  return found
}

/** Resolve the linked package manifest and both entry artifacts as the row sees them. */
function inspect(): { manifest: Record<string, unknown> | undefined; present: { path: string; exists: boolean }[] } {
  let manifestPath: string
  try {
    manifestPath = require.resolve(`${PACKAGE_NAME}/package.json`)
  } catch {
    return { manifest: undefined, present: [] }
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const root = dirname(manifestPath)
  const exportsField = manifest.exports as Record<string, unknown> | undefined
  const relative = [exportsField?.['.'], exportsField?.['./client']]
    .filter((value): value is string => typeof value === 'string')
  return {
    manifest,
    present: relative.map(value => ({ path: value, exists: existsSync(join(root, value)) })),
  }
}

describe('built-in IM channels', () => {
  it('composes @xmanrui/dsh-im by default from the linked submodule', () => {
    const { manifest, present } = inspect()
    expect(violations(rows().find(row => row.id === ROW_ID), manifest, present)).toEqual([])
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
      .toEqual([`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/dsh-im submodule checked out?)`])
    expect(violations(row, { ...manifest, dsh: {} }, present))
      .toEqual([`${PACKAGE_NAME} declares no dsh.client web half`])
    expect(violations(row, manifest, present.map(entry => ({ ...entry, exists: false }))))
      .toEqual(present.map(entry => `${PACKAGE_NAME} is missing its built ${entry.path}`))
  })
})
