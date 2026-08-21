/** ui-sdkwork-appstore apply wiring: the rail entry and the SDKWork page, each keyed
 * by the `appstore` mode id, register once their slot declarations are on the
 * ledger; the host adapter and slot contributions tear down together. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-appstore/client'
import type {
  AppStorePageInjected, AppStoreRailEntryInjected,
} from '@deepseek-ai/dsh-client-ui-sdkwork-appstore/client'
import { AppStoreRailEntry } from '../src/client/RailEntry.tsx'
import { AppStorePage } from '../src/client/AppStorePage.tsx'

const RAIL_ENTRY = 'mode.rail.entry'
const PAGE = 'mode.page'

function fakeEnv() {
  return {
    apiBaseUrl: () => 'https://fixture.example',
    accessToken: () => '',
    subscribe: () => () => {},
  }
}

function fakeIam() {
  return {
    controller: {
      getState: () => ({ session: null }),
      subscribe: () => () => {},
    },
  }
}

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('env', fakeEnv())
  ctx.provide('iam', fakeIam())
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    slots.register(
      { name: 'root', children: { 'mode.rail': { kind: 'single', scope: 'root' }, [PAGE]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
    slots.register(
      { name: 'mode.rail', children: { [RAIL_ENTRY]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots }
}

describe('ui-sdkwork-appstore apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam'])
  })

  it('registers the rail entry and the page keyed by the appstore mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [entry] = b.slots.entries(RAIL_ENTRY)
    expect(entry?.options.key).toBe('appstore')
    expect(entry?.component).toBe(AppStoreRailEntry)
    expect(entry?.locale).toBe('appstore')
    expect((entry!.inject as unknown as () => AppStoreRailEntryInjected)().mode).toBe('appstore')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('appstore')
    expect(page?.component).toBe(AppStorePage)
    expect((page!.inject as unknown as () => AppStorePageInjected)().mode).toBe('appstore')
  })

  it('teardown removes the entries and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(1)
    expect(b.slots.entries(PAGE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
  })
})
