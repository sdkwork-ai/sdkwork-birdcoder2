/**
 * The fork's plugin surface is a REPLACEMENT, never a companion: the web-app
 * composition enables the fork's market page and hides upstream's Plugins page
 * for exactly as long as that replacement row runs. The expression is checked
 * here because it is what keeps a profile switch from rendering two plugin
 * surfaces — the seats' single declarer makes a second live page a load failure.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { evaluate, isJsExpr, type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))

/** The Loader scope a `disabled` expression is evaluated against. */
function loaderScope(enabledIds: readonly string[]): object {
  return {
    get: (key: string) => key === 'loader'
      ? { entries: () => enabledIds.map(id => ({ options: { id }, disabled: false })) }
      : undefined,
  }
}

/** Every row the patch list inserts or addresses, in composition order. */
function rows(): EntryOptions[] {
  const parsed = yaml.load(readFileSync(patchPath, 'utf8'), { schema: entryListSchema }) as
    | ({ insert?: EntryOptions[] } & EntryOptions)[]
    | undefined
  return (parsed ?? []).flatMap(patch => patch.insert === undefined ? [patch] : patch.insert)
}

describe('web-app plugin surface replacement', () => {
  it('keeps the fork\'s market page and hides upstream\'s Plugins page while it runs', () => {
    const all = rows()
    const markets = all.find(row => row.id === 'ui-sdkwork-markets')
    const upstream = all.find(row => row.id === 'ui-plugin-manager')

    // Both rows are composed: the fork's page is the surface, and upstream's
    // page stays addressable so switching the replacement off restores it.
    expect(markets?.name).toBe('@deepseek-ai/dsh-client-ui-sdkwork-markets')
    expect(markets?.disabled).toBeUndefined()
    expect(upstream?.name).toBe('@deepseek-ai/dsh-client-ui-plugin-manager')
    expect(isJsExpr(upstream?.disabled)).toBe(true)

    const expression = (upstream?.disabled as { __jsExpr: string }).__jsExpr
    expect(Boolean(evaluate(loaderScope(['ui-sdkwork-markets']), expression))).toBe(true)
    expect(Boolean(evaluate(loaderScope([]), expression))).toBe(false)
  })
})
