/**
 * ui-sdkwork-im-connector apply wiring: the rail shortcut and the IM mode page
 * follow the linked IM plugin's `dshImClient` service — both are registered
 * only while that panel renderer exists, the shortcut switches the frame to
 * the IM mode, and either side's teardown removes the product navigation.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-im-connector/client'
import { ImConnectorEntry, type ImConnectorEntryInjected } from '../src/client/ImConnectorEntry.tsx'
import { ImModePage, type ImModePageInjected } from '../src/client/ImModePage.tsx'
import { en, zh } from '../src/client/locales.ts'

const RAIL_PANEL = 'mode.rail.panel'
const MODE_PAGE = 'mode.page'
const IM_PANEL = 'xmanrui-dsh-im'

/** The plugin's published panel service stand-in. */
function panelService() {
  const panel = { marker: 'panel-element' }
  return { version: 1, render: vi.fn(() => panel as never), panel }
}

async function bench(provideClient = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const layout = { setMode: vi.fn(), selectPanel: vi.fn() }
  ctx.provide('layout', layout)
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  // Stand in for the frame's root entry: the keyed mode-page seat and the
  // rail's panel-shortcut seat.
  slots.register(
    {
      name: 'root',
      children: {
        [MODE_PAGE]: { kind: 'keyed', scope: 'root' },
        [RAIL_PANEL]: { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
  const im = panelService()
  const removeClient = provideClient ? ctx.provide('dshImClient', im) : undefined
  return { ctx, slots, layout, im, removeClient }
}

describe('ui-sdkwork-im-connector apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout'])
  })

  it('names the shortcut IM链接器 / IM connector', () => {
    expect(zh['entry.label']).toBe('IM链接器')
    expect(zh['entry.aria']).toBe('打开 IM链接器')
    expect(en['entry.label']).toBe('IM connector')
    expect(en['entry.aria']).toBe('Open IM connector')
  })

  it('registers nothing while the IM panel service is absent', async () => {
    const b = await bench(false)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL_PANEL)).toEqual([])
    expect(b.slots.entries(MODE_PAGE)).toEqual([])
    // Teardown without registrations is the empty arm of the child fiber.
    await fiber.dispose()
  })

  it('registers the mode page and the rail shortcut against the panel service', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const [page] = b.slots.entries(MODE_PAGE)
    expect(page?.options.key).toBe('im')
    expect(page?.component).toBe(ImModePage)
    const pageInjected = (page?.inject as unknown as () => ImModePageInjected)()
    expect(pageInjected.renderPanel()).toBe(b.im.panel)

    const [shortcut] = b.slots.entries(RAIL_PANEL)
    expect(shortcut?.options.id).toBe(IM_PANEL)
    expect(shortcut?.options.order).toBe(10)
    expect(shortcut?.component).toBe(ImConnectorEntry)
    expect(shortcut?.locale).toBe('imConnector')

    const injected = (shortcut?.inject as unknown as () => ImConnectorEntryInjected)()
    expect(injected.mode).toBe('im')
    injected.selectMode()
    expect(b.layout.setMode).toHaveBeenCalledExactlyOnceWith('im')
  })

  it('removes the navigation when the panel service goes away', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(RAIL_PANEL)).toHaveLength(1)
    expect(b.slots.entries(MODE_PAGE)).toHaveLength(1)

    b.removeClient?.()
    await vi.waitFor(() => {
      expect(b.slots.entries(RAIL_PANEL)).toEqual([])
      expect(b.slots.entries(MODE_PAGE)).toEqual([])
    })
  })

  it('teardown removes the page and the shortcut', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL_PANEL)).toHaveLength(1)
    expect(b.slots.entries(MODE_PAGE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(RAIL_PANEL)).toEqual([])
    expect(b.slots.entries(MODE_PAGE)).toEqual([])
  })
})
