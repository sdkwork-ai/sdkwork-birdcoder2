// @vitest-environment jsdom
/**
 * Contacts mode apply wiring: the rail entry and the keyed page register once
 * their slot declarations are on the ledger, forward open-conversation and
 * mount callbacks from `ctx.im`, and tear down together.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-im-contacts/client'
import type { ContactsModePageInjected, ContactsRailEntryInjected } from '@deepseek-ai/dsh-client-ui-sdkwork-im-contacts/client'
import type { ImService } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { ContactsModePage } from '../src/client/ContactsModePage.tsx'
import { ContactsRailEntry } from '../src/client/RailEntry.tsx'

const RAIL = 'mode.rail.entry'
const PAGE = 'mode.page'

function fakeIm() {
  return {
    getSnapshot: () => ({ selectedConversationId: null, totalUnread: 0, error: null }),
    subscribe: () => () => {},
    openConversation: vi.fn(),
    mountSurface: vi.fn(() => ({ update: vi.fn(), dispose: vi.fn() })),
  }
}

async function bench(declare = true, withIm = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const im = fakeIm()
  if (withIm) ctx.provide('im', im as unknown as ImService)
  ctx.provide('iam', { isSignedIn: () => true, openSignInOverlay: () => {}, subscribe: () => () => {} })
  const slots = ctx.get('slots') as unknown as SlotRegistry
  if (declare) {
    slots.register(
      { name: 'root', children: { 'mode.rail': { kind: 'single', scope: 'root' }, [PAGE]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
    slots.register({ name: 'mode.rail', children: { [RAIL]: { kind: 'keyed', scope: 'root' } } } as never, () => null)
  }
  return { ctx, slots, im }
}

describe('ui-sdkwork-im-contacts apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'iam', 'im'])
  })

  it('registers the rail entry and the contacts page', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const [entry] = b.slots.entries(RAIL)
    expect(entry?.options.key).toBe('contacts')
    expect(entry?.component).toBe(ContactsRailEntry)
    const entryFace = (entry!.inject as unknown as () => ContactsRailEntryInjected)()
    expect(entryFace.mode).toBe('contacts')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('contacts')
    expect(page?.component).toBe(ContactsModePage)
    const pageFace = (page!.inject as unknown as () => ContactsModePageInjected & { hooks: { im: ImService } })()
    expect(pageFace.mode).toBe('contacts')
    pageFace.openConversation('conversation-4')
    expect(b.im.openConversation).toHaveBeenCalledWith('conversation-4')
    const container = document.createElement('div')
    pageFace.mountSurface(container, { kind: 'contacts' })
    expect(b.im.mountSurface).toHaveBeenCalledWith(container, { kind: 'contacts' })
    expect(pageFace.hooks.im).toBe(b.im)
  })

  it('mounts with an absent IM service and binds an empty snapshot', async () => {
    const b = await bench(true, false)
    // Activate without the `im` edge to reproduce a composition whose IM
    // provider was never composed: the entry must still mount with a fallback.
    await b.ctx.plugin({ inject: ['slots', 'locale', 'iam'], apply }).await()

    const [page] = b.slots.entries(PAGE)
    const face = (page!.inject as unknown as () => {
      hooks: { im: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } }
      openConversation(id: string): void
      mountSurface(container: HTMLElement, request: { kind: string }): { update(request: { kind: string }): void; dispose(): void }
    })()
    expect(face.hooks.im.getSnapshot()).toEqual({ selectedConversationId: null, totalUnread: 0, error: 'unconfigured', notice: null })
    expect(typeof face.hooks.im.subscribe(() => {})).toBe('function')
    face.openConversation('conversation-1')
    const handle = face.mountSurface(document.createElement('div'), { kind: 'contacts' })
    handle.update({ kind: 'contacts' })
    handle.dispose()
  })

  it('teardown removes both entries and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL)).toHaveLength(1)
    expect(b.slots.entries(PAGE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(RAIL)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
  })
})
