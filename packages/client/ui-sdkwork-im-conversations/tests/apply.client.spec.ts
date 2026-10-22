// @vitest-environment jsdom
/**
 * Chat mode apply wiring: the rail entry and the keyed page (with its
 * conversation pane seat) register once their slot declarations are on the
 * ledger, expose selection and mount callbacks from `ctx.im`, and tear down
 * together.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-im-conversations/client'
import type { ChatModePageInjected, ChatRailEntryInjected } from '@deepseek-ai/dsh-client-ui-sdkwork-im-conversations/client'
import type { ImService } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { ChatModePage } from '../src/client/ChatModePage.tsx'
import { ChatRailEntry } from '../src/client/RailEntry.tsx'

const RAIL = 'mode.rail.entry'
const PAGE = 'mode.page'

function fakeIm() {
  return {
    getSnapshot: () => ({ selectedConversationId: null, totalUnread: 0, error: null }),
    subscribe: () => () => {},
    selectConversation: vi.fn(),
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

describe('ui-sdkwork-im-conversations apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'iam', 'im'])
  })

  it('registers the rail entry and the chat page with its pane seat', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const [entry] = b.slots.entries(RAIL)
    expect(entry?.options.key).toBe('chat')
    expect(entry?.component).toBe(ChatRailEntry)
    expect(entry?.locale).toBe('imConversations')
    const entryFace = (entry!.inject as unknown as () => ChatRailEntryInjected & { hooks: { im: ImService } })()
    expect(entryFace.mode).toBe('chat')
    expect(entryFace.hooks.im).toBe(b.im)

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('chat')
    expect(page?.component).toBe(ChatModePage)
    const pageFace = (page!.inject as unknown as () => ChatModePageInjected & { hooks: { im: ImService } })()
    expect(pageFace.mode).toBe('chat')
    expect(pageFace.authGate.isSignedIn()).toBe(true)
    pageFace.selectConversation('conversation-2')
    expect(b.im.selectConversation).toHaveBeenCalledWith('conversation-2')
    const container = document.createElement('div')
    pageFace.mountSurface(container, { kind: 'conversation-list' })
    expect(b.im.mountSurface).toHaveBeenCalledWith(container, { kind: 'conversation-list' })
  })

  it('mounts with an absent IM service and binds an empty snapshot', async () => {
    const b = await bench(true, false)
    // Activate without the `im` edge to reproduce a composition whose IM
    // provider was never composed: the entry must still mount with a fallback.
    await b.ctx.plugin({ inject: ['slots', 'locale', 'iam'], apply }).await()

    const [entry] = b.slots.entries(RAIL)
    const face = (entry!.inject as unknown as () => {
      hooks: { im: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } }
    })()
    expect(face.hooks.im.getSnapshot()).toEqual({ selectedConversationId: null, totalUnread: 0, error: 'unconfigured', notice: null })
    expect(typeof face.hooks.im.subscribe(() => {})).toBe('function')

    const [page] = b.slots.entries(PAGE)
    const pageFace = (page!.inject as unknown as () => {
      mountSurface(container: HTMLElement, request: { kind: string }): { update(): void; dispose(): void }
      selectConversation(id: string): void
    })()
    pageFace.selectConversation('conversation-1')
    const handle = pageFace.mountSurface(document.createElement('div'), { kind: 'conversation-list' })
    handle.update()
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
