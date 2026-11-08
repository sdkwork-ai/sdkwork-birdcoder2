/**
 * The built-in Bot team integration: DS Bot is linked into this repository as
 * the `plugins/sdkwork-dsh-bot` git submodule, composed by this bundle, and
 * surfaced through the 助理 rail entry, so a shipped build — and the desktop
 * layer patched over it — offers the Bot team without an installer step. Row,
 * manifest, built halves, and the one service the rail entry drives are one
 * acceptance path: a missing submodule checkout, a renamed package, a lost
 * browser declaration, a missing artifact, or a lost `ctx.botSurface` each fail
 * here instead of at boot (where the 助理 entry would silently never appear).
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Loader row id and npm name of the built-in Bot team plugin. */
const ROW_ID = 'sdkwork-bot'
const PACKAGE_NAME = 'ds-bot'
/** The rail entry's row, the one consumer of the published surface service. */
const ASSISTANT_ROW_ID = 'ui-sdkwork-assistant'
const ASSISTANT_PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-sdkwork-assistant'
/** The service name the rail entry waits on; a rename breaks the entry silently. */
const SURFACE_SERVICE = 'botSurface'
/** The provider call that publishes it, in either quote style the build emits. */
const PROVIDES_SURFACE = new RegExp(`provide\\(["']${SURFACE_SERVICE}["']`)

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
 * Every way the composed built-in Bot team integration can be incomplete.
 * @param row - the composed Loader row, or undefined when the patch lost it.
 * @param assistantRow - the 助理 rail entry's row, or undefined when the patch lost it.
 * @param manifest - the linked package manifest, or undefined when unresolved.
 * @param present - the entry artifacts the rows need, with whether each exists.
 * @param clientSource - the shipped browser half, or undefined when unreadable.
 * @returns one message per violation, empty when the integration is complete.
 */
function violations(
  row: EntryOptions | undefined,
  assistantRow: EntryOptions | undefined,
  manifest: Record<string, unknown> | undefined,
  present: readonly { path: string; exists: boolean }[],
  clientSource: string | undefined,
): string[] {
  const found: string[] = []
  if (row === undefined) found.push(`the web patch declares no ${ROW_ID} row`)
  else {
    if (row.name !== PACKAGE_NAME) found.push(`${ROW_ID} names ${row.name}, not ${PACKAGE_NAME}`)
    if (row.disabled !== undefined) found.push(`${ROW_ID} is not enabled by default`)
  }
  if (assistantRow === undefined) found.push(`the web patch declares no ${ASSISTANT_ROW_ID} row`)
  else if (assistantRow.name !== ASSISTANT_PACKAGE_NAME) {
    found.push(`${ASSISTANT_ROW_ID} names ${assistantRow.name}, not ${ASSISTANT_PACKAGE_NAME}`)
  }
  // Without both rows the artifact contract below says nothing about whether a
  // user can reach the surface, so composition problems are the whole answer.
  if (row === undefined || assistantRow === undefined) return found
  if (manifest === undefined) {
    found.push(`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/sdkwork-dsh-bot submodule checked out?)`)
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
  if (clientSource === undefined || !PROVIDES_SURFACE.test(clientSource)) {
    found.push(`${PACKAGE_NAME} publishes no ctx.${SURFACE_SERVICE}; the 助理 rail entry would never appear`)
  }
  return found
}

/** Resolve the linked package manifest and its entry artifacts as the row sees them. */
function inspect(): {
  manifest: Record<string, unknown> | undefined
  present: { path: string; exists: boolean }[]
  clientSource: string | undefined
} {
  let manifestPath: string
  try {
    manifestPath = require.resolve(`${PACKAGE_NAME}/package.json`)
  } catch {
    return { manifest: undefined, present: [], clientSource: undefined }
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const root = dirname(manifestPath)
  const exportsField = manifest.exports as Record<string, unknown> | undefined
  const relative = [exportsField?.['.'], exportsField?.['./client']]
    .filter((value): value is string => typeof value === 'string')
  const clientPath = typeof exportsField?.['./client'] === 'string' ? join(root, exportsField['./client']) : undefined
  let clientSource: string | undefined
  try {
    clientSource = clientPath === undefined ? undefined : readFileSync(clientPath, 'utf8')
  } catch {
    clientSource = undefined
  }
  return {
    manifest,
    present: relative.map(value => ({ path: value, exists: existsSync(join(root, value)) })),
    clientSource,
  }
}

describe('built-in Bot team', () => {
  it('composes ds-bot and its 助理 rail entry by default from the linked submodule', () => {
    const { manifest, present, clientSource } = inspect()
    const row = rows().find(candidate => candidate.id === ROW_ID)
    const assistantRow = rows().find(candidate => candidate.id === ASSISTANT_ROW_ID)
    expect(violations(row, assistantRow, manifest, present, clientSource)).toEqual([])
  })

  it('rejects each way the integration can be incomplete', () => {
    const { manifest, present, clientSource } = inspect()
    const row = rows().find(candidate => candidate.id === ROW_ID)
    const assistantRow = rows().find(candidate => candidate.id === ASSISTANT_ROW_ID)
    if (row === undefined || assistantRow === undefined || manifest === undefined) {
      throw new Error('the integration is already incomplete')
    }

    expect(violations(undefined, assistantRow, manifest, present, clientSource))
      .toEqual([`the web patch declares no ${ROW_ID} row`])
    expect(violations(row, undefined, manifest, present, clientSource))
      .toEqual([`the web patch declares no ${ASSISTANT_ROW_ID} row`])
    expect(violations(row, { ...assistantRow, name: '@deepseek-ai/dsh-client-ui-theme' }, manifest, present, clientSource))
      .toEqual([`${ASSISTANT_ROW_ID} names @deepseek-ai/dsh-client-ui-theme, not ${ASSISTANT_PACKAGE_NAME}`])
    expect(violations({ ...row, name: '@deepseek-ai/dsh-client-ui-theme' }, assistantRow, manifest, present, clientSource))
      .toEqual([`${ROW_ID} names @deepseek-ai/dsh-client-ui-theme, not ${PACKAGE_NAME}`])
    expect(violations({ ...row, disabled: true }, assistantRow, manifest, present, clientSource))
      .toEqual([`${ROW_ID} is not enabled by default`])
    expect(violations(row, assistantRow, undefined, present, clientSource))
      .toEqual([`${PACKAGE_NAME} does not resolve from this bundle (is the plugins/sdkwork-dsh-bot submodule checked out?)`])
    expect(violations(row, assistantRow, { ...manifest, dsh: {} }, present, clientSource))
      .toEqual([`${PACKAGE_NAME} declares no dsh.client web half`])
    expect(violations(row, assistantRow, manifest, present.map(entry => ({ ...entry, exists: false })), clientSource))
      .toEqual(present.map(entry => `${PACKAGE_NAME} is missing its built ${entry.path}`))
    // The service contract: without it the 助理 entry waits forever instead of
    // failing, which is exactly why the acceptance check reads for it.
    expect(violations(row, assistantRow, manifest, present, clientSource?.replaceAll(SURFACE_SERVICE, 'bot-surface')))
      .toEqual([`${PACKAGE_NAME} publishes no ctx.${SURFACE_SERVICE}; the 助理 rail entry would never appear`])
  })
})
