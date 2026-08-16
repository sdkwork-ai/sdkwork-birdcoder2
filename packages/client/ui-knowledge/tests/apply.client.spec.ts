/** ui-knowledge apply wiring: the rail entry and the placeholder page, each
 * keyed by the `knowledge` mode id, registered once their slot declarations
 * are on the ledger; teardown cascades. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-knowledge/client'
import type {
  KnowledgePageInjected, KnowledgeRailEntryInjected,
} from '@deepseek-ai/dsh-client-ui-knowledge/client'
import { KnowledgeRailEntry } from '../src/client/RailEntry.tsx'
import { KnowledgePage } from '../src/client/KnowledgePage.tsx'

const RAIL_ENTRY = 'mode.rail.entry'
const PAGE = 'mode.page'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    // Stand in for the rail shell and the frame: the root declares the rail
    // seat, the rail occupant declares the keyed entry seat, and the root
    // declares the keyed page seat.
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

describe('ui-knowledge apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the rail entry and the page keyed by the knowledge mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [entry] = b.slots.entries(RAIL_ENTRY)
    expect(entry?.options.key).toBe('knowledge')
    expect(entry?.component).toBe(KnowledgeRailEntry)
    expect(entry?.locale).toBe('knowledge')
    expect((entry!.inject as unknown as () => KnowledgeRailEntryInjected)().mode).toBe('knowledge')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('knowledge')
    expect(page?.component).toBe(KnowledgePage)
    expect((page!.inject as unknown as () => KnowledgePageInjected)().mode).toBe('knowledge')
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
