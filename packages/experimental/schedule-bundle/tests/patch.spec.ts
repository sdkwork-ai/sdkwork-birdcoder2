/** The experimental Schedule bundle: its rows, and the fork's replacement rule on upstream's task page. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { evaluate, isJsExpr, type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

const root = fileURLToPath(new URL('..', import.meta.url))

interface Manifest {
  name?: string
  icon?: string
  private?: boolean
  publishConfig?: { access?: string }
  exports?: Record<string, unknown>
  dependencies?: Record<string, string>
  dsh?: { bundle?: { patch?: string } }
}

/** The Loader scope a `disabled` expression is evaluated against. */
function loaderScope(enabledIds: readonly string[]): object {
  return {
    get: (key: string) => key === 'loader'
      ? { entries: () => enabledIds.map(id => ({ options: { id }, disabled: false })) }
      : undefined,
  }
}

describe('experimental Schedule bundle', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as Manifest
  const parsed = yaml.load(readFileSync(resolve(root, './cordis.patch.yml'), 'utf8'), { schema: entryListSchema }) as [
    { insert: (EntryOptions & { id?: string })[] },
  ]

  it('publishes as an experimental bundle with plugin-manager display metadata', () => {
    expect(manifest.name).toBe('@deepseek-ai/dsh-experimental-schedule-bundle')
    expect(manifest.private).toBeUndefined()
    expect(manifest.publishConfig?.access).toBe('public')
    expect(manifest.icon).toBe('./icon.svg')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.exports?.['./locale/*.json']).toBe('./locale/*.json')
    expect(manifest.exports?.['./cordis.patch.yml']).toBe('./cordis.patch.yml')
    // Each inserted row names a package the bundle depends on, so the rows resolve from the bundle.
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      '@deepseek-ai/dsh-client-ui-schedule', '@deepseek-ai/dsh-schedule', '@deepseek-ai/dsh-time-context',
    ])
  })

  it('inserts the Schedule rows, hiding upstream\'s task page while the fork\'s one runs', () => {
    const [patch] = parsed
    const rows = patch?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['time-context', '@deepseek-ai/dsh-time-context'],
      ['schedule', '@deepseek-ai/dsh-schedule'],
      ['ui-schedule', '@deepseek-ai/dsh-client-ui-schedule'],
    ])
    // The two host rows are the capability this bundle exists for; they stay on.
    expect(rows.filter(row => row.id !== 'ui-schedule').every(row => row.disabled === undefined)).toBe(true)

    // FORK REPLACEMENT RULE: the fork's Automation mode page is the product's
    // task surface, so upstream's page is composed only while that replacement
    // row is switched off — one task surface, whichever way the profile leans.
    const uiSchedule = rows.find(row => row.id === 'ui-schedule')
    // `disabled` is declared `boolean | null`, so the serialized expression the
    // include tag produces is only reachable through the loader's own guard.
    const disabled = uiSchedule?.disabled
    if (!isJsExpr(disabled)) throw new Error('the ui-schedule row must gate on a `!!js` disabled expression')
    const expression = disabled.__jsExpr
    expect(Boolean(evaluate(loaderScope(['ui-sdkwork-automation']), expression))).toBe(true)
    expect(Boolean(evaluate(loaderScope([]), expression))).toBe(false)
  })
})
