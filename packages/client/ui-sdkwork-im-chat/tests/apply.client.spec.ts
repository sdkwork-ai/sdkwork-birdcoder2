// @vitest-environment jsdom
/**
 * Conversation pane apply wiring: the pane registers into the chat page's
 * `im.chat.pane` seat once that seat is declared, forwards the mount API from
 * `ctx.im`, and tears down with the plugin fiber.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-im-chat/client'
import type { ChatPaneInjected } from '@deepseek-ai/dsh-client-ui-sdkwork-im-chat/client'
import type { ImService } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { ChatPane } from '../src/client/ChatPane.tsx'

const PANE = 'im.chat.pane'

function fakeIm() {
  return {
    mountSurface: vi.fn(() => ({ update: vi.fn(), dispose: vi.fn() })),
  }
}

async function bench(declare = true, withIm = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const im = fakeIm()
  if (withIm) ctx.provide('im', im as unknown as ImService)
  const slots = ctx.get('slots') as unknown as SlotRegistry
  if (declare) {
    // Stand in for the chat page's registration: a root entry declares the
    // conversation pane seat the plugin fills.
    slots.register({ name: 'root', children: { [PANE]: { kind: 'single', scope: 'root' } } } as never, () => null)
  }
  return { ctx, slots, im }
}

describe('ui-sdkwork-im-chat apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'im'])
  })

  it('registers the pane into the declared seat and forwards the mount API', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [entry] = b.slots.entries(PANE)
    expect(entry?.component).toBe(ChatPane)
    const face = (entry!.inject as unknown as () => ChatPaneInjected)()
    const container = document.createElement('div')
    face.mountSurface(container, { kind: 'conversation', conversationId: 'conversation-5' })
    expect(b.im.mountSurface).toHaveBeenCalledWith(container, { kind: 'conversation', conversationId: 'conversation-5' })
  })

  it('mounts with an absent IM service and returns a no-op surface handle', async () => {
    const b = await bench(true, false)
    // Activate without the `im` edge to reproduce a composition whose IM
    // provider was never composed: the pane must still register and mount.
    await b.ctx.plugin({ inject: ['slots'], apply }).await()
    const [entry] = b.slots.entries(PANE)
    const face = (entry!.inject as unknown as () => ChatPaneInjected)()
    const handle = face.mountSurface(document.createElement('div'), { kind: 'conversation', conversationId: 'conversation-5' })
    handle.update({ kind: 'conversation', conversationId: 'conversation-6' })
    handle.dispose()
    expect(b.im.mountSurface).not.toHaveBeenCalled()
  })

  it('teardown removes the pane registration', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(PANE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(PANE)).toHaveLength(0)
  })
})
