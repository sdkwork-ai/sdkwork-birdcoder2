/** Host half: the synced Config schema and the no-op Host entry. */
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply, Config } from '../src/index.ts'

describe('message-center Host entry', () => {
  it('defaults the poll interval and page size the browser falls back to', () => {
    const config = Config({})
    expect(config.pollIntervalMs.get()).toBe(60_000)
    expect(config.pageSize.get()).toBe(20)
  })

  it('rejects settings outside the API and timer bounds', () => {
    expect(() => Config({ pollIntervalMs: 0 })).toThrow()
    expect(() => Config({ pollIntervalMs: 2_147_483_648 })).toThrow()
    expect(() => Config({ pageSize: 0 })).toThrow()
    expect(() => Config({ pageSize: 201 })).toThrow()
  })

  it('registers no Host behavior', () => {
    expect(() => { apply({} as Context, Config({})) }).not.toThrow()
  })
})
