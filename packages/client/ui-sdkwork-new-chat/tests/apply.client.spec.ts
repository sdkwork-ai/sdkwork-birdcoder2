/** ui-sdkwork-new-chat apply wiring: the New Chat entry registered into the
 * sidebar shell's `sidebar.actions` list seat once the declaration is on the
 * ledger; teardown cascades. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-new-chat/client'
import { NewChatAction } from '../src/client/NewChatAction.tsx'

const ACTIONS = 'sidebar.actions'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  if (declare) {
    // Stand in for the sidebar shell: the root declares the sidebar seat, the
    // shell entry declares the actions list seat.
    slots.register(
      { name: 'root', children: { 'sidebar': { kind: 'single', scope: 'root' } } } as never,
      () => null,
    )
    slots.register(
      { name: 'sidebar', children: { [ACTIONS]: { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots }
}

describe('ui-sdkwork-new-chat apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the New Chat entry leading the quick-entry stack', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    expect(action?.options.id).toBe('sdkwork-new-chat')
    expect(action?.options.order).toBe(10)
    expect(action?.component).toBe(NewChatAction)
    expect(action?.locale).toBe('newChat')
  })

  it('teardown removes the entry and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(ACTIONS)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(ACTIONS)).toHaveLength(0)
  })
})
