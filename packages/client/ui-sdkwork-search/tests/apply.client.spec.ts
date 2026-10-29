// @vitest-environment jsdom
/**
 * ui-sdkwork-search apply wiring: the rail entry and the SDKWork Search page,
 * each keyed by the `search` mode id, register once their slot declarations are
 * on the ledger; the runtime queries only live `mode.page` surfaces, result
 * navigation writes the frame mode, and teardown removes both contributions.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-search/client'
import type {
  SearchPageInjected, SearchRailEntryInjected,
} from '@deepseek-ai/dsh-client-ui-sdkwork-search/client'
import { SearchRailEntry } from '../src/client/RailEntry.tsx'
import { SearchPage } from '../src/client/SearchPage.tsx'

const RAIL_ENTRY = 'mode.rail.entry'
const PAGE = 'mode.page'

/** Environment stand-in: no gateway, so the runtime answers from the local catalog. */
function fakeEnv() {
  return {
    apiBaseUrl: () => '',
    accessToken: () => '',
    subscribe: () => () => {},
  }
}

/** Signed-out IAM stand-in: no remote query is attempted. */
function fakeIam() {
  return {
    controller: {
      getState: () => ({ session: null }),
      subscribe: () => () => {},
    },
  }
}

async function bench(setMode = vi.fn()) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('env', fakeEnv())
  ctx.provide('iam', fakeIam())
  ctx.provide('layout', { setMode })
  const slots = ctx.get('slots') as unknown as SlotRegistry
  // Stand in for the rail shell and the frame: the root declares the rail seat
  // and the keyed page seat, the rail occupant declares the keyed entry seat.
  slots.register(
    {
      name: 'root',
      children: {
        'mode.rail': { kind: 'single', scope: 'root' },
        [PAGE]: { kind: 'keyed', scope: 'root' },
      },
    } as never,
    () => null,
  )
  slots.register(
    { name: 'mode.rail', children: { [RAIL_ENTRY]: { kind: 'keyed', scope: 'root' } } } as never,
    () => null,
  )
  // A live destination: the catalog only offers modes with a registered page.
  slots.register({ name: PAGE, key: 'assets' } as never, () => null)
  return { ctx, slots, setMode }
}

/** The keyed page entry this plugin registered (the bench also declares a fake destination). */
function searchPageEntry(slots: SlotRegistry) {
  const entry = slots.entries(PAGE).find(candidate => candidate.options.key === 'search')
  if (entry === undefined) throw new Error('search page entry not registered')
  return entry
}

describe('ui-sdkwork-search apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam', 'layout'])
  })

  it('registers the rail entry and the page keyed by the search mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [entry] = b.slots.entries(RAIL_ENTRY)
    expect(entry?.options.key).toBe('search')
    expect(entry?.component).toBe(SearchRailEntry)
    expect(entry?.locale).toBe('search')
    expect((entry.inject as unknown as () => SearchRailEntryInjected)().mode).toBe('search')

    const page = searchPageEntry(b.slots)
    expect(page.component).toBe(SearchPage)
    expect((page.inject as unknown as () => SearchPageInjected)().mode).toBe('search')
  })

  it('queries the live surface catalog and navigates a hit to its mode', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (searchPageEntry(b.slots).inject as unknown as () => SearchPageInjected)()

    const outcome = await injected.runSearch('assets')
    expect(outcome.degraded).toBe(false)
    expect(outcome.total).toBe(1)
    const [result] = outcome.groups[0].results
    expect(result?.origin).toBe('local')
    expect(result?.destination).toEqual({ mode: 'assets' })

    injected.openResult(result)
    expect(b.setMode).toHaveBeenCalledWith('assets')
  })

  it('teardown removes the entries and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(1)
    expect(b.slots.entries(PAGE)).toHaveLength(2)
    await fiber.dispose()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(1)
  })
})
