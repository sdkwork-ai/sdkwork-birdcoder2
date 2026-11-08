// @vitest-environment jsdom
/**
 * ui-sdkwork-assistant apply wiring: both navigation entries follow the linked
 * persona-bot layer's `botharness` main panel — the rail cell and the sidebar
 * quick entry are registered only while that panel exists, either one selects
 * the panel through the layout service, the plugin's own sidebar row is
 * suppressed in favor of the quick entry, and either side's teardown removes
 * the navigation.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-assistant/client'
import { AssistantAction, type AssistantActionInjected } from '../src/client/AssistantAction.tsx'
import { AssistantRailEntry, type AssistantRailEntryInjected } from '../src/client/AssistantRailEntry.tsx'
import { en, zh } from '../src/client/locales.ts'

const RAIL_ENTRY = 'mode.rail.entry'
const SIDEBAR_ACTION = 'sidebar.actions'
const MAIN = 'main'
const BOT_PANEL = 'botharness'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const layout = { setMode: vi.fn(), selectPanel: vi.fn() }
  ctx.provide('layout', layout)
  const restoreRow = vi.fn()
  const suppressPanel = vi.fn(() => restoreRow)
  ctx.provide('sdkworkSidebar', { suppressPanel })
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  // Stand in for the frame's root entry: the keyed mode-rail entry seat, the
  // sidebar's quick-entry list seat, and the keyed main-panel seat the linked
  // plugin fills.
  slots.register(
    {
      name: 'root',
      children: {
        [RAIL_ENTRY]: { kind: 'keyed', scope: 'root' },
        [SIDEBAR_ACTION]: { kind: 'list', scope: 'root' },
        [MAIN]: { kind: 'keyed', scope: 'root' },
      },
    } as never,
    () => null,
  )
  return { ctx, slots, layout, suppressPanel, restoreRow }
}

/** The linked persona-bot layer's whole interface, as its browser half registers it. */
function registerBotPanel(slots: SlotRegistry) {
  return slots.register({ name: MAIN, key: BOT_PANEL } as never, () => null)
}

describe('ui-sdkwork-assistant apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout'])
  })

  it('declares the host control rail while mounted and releases it on teardown', async () => {
    expect(document.documentElement.hasAttribute('data-bh-host-rail')).toBe(false)
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(document.documentElement.hasAttribute('data-bh-host-rail')).toBe(true)
    await fiber.dispose()
    expect(document.documentElement.hasAttribute('data-bh-host-rail')).toBe(false)
  })

  it('names both entries 助理 / Assistant', () => {
    expect(zh['entry.label']).toBe('助理')
    expect(zh['entry.aria']).toBe('打开助理')
    expect(en['entry.label']).toBe('Assistant')
    expect(en['entry.aria']).toBe('Open Assistant')
  })

  it('suppresses the plugin\'s own sidebar row in favor of the quick entry', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.suppressPanel).toHaveBeenCalledExactlyOnceWith(BOT_PANEL)
  })

  it('registers no entry while the linked main panel is absent', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL_ENTRY)).toEqual([])
    expect(b.slots.entries(SIDEBAR_ACTION)).toEqual([])
    // Teardown without a registration is the empty arm of the effect.
    await fiber.dispose()
  })

  it('registers the rail cell and the sidebar entry once the panel appears', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const removePanel = registerBotPanel(b.slots)

    await vi.waitFor(() => { expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(1) })
    const [cell] = b.slots.entries(RAIL_ENTRY)
    expect(cell?.options.key).toBe('assistant')
    expect(cell?.component).toBe(AssistantRailEntry)

    const [action] = b.slots.entries(SIDEBAR_ACTION)
    expect(action?.options.id).toBe('sdkwork-assistant')
    expect(action?.options.order).toBe(35)
    expect(action?.component).toBe(AssistantAction)
    expect(action?.locale).toBe('assistant')
    // The row's settings-page label resolves through the active locale, so it
    // reads one of the registered dictionaries rather than a fixed language.
    expect([zh['entry.label'], en['entry.label']])
      .toContain((action?.options.label as () => string)())

    const cellInjected = (cell?.inject as unknown as () => AssistantRailEntryInjected)()
    cellInjected.open()
    const actionInjected = (action?.inject as unknown as () => AssistantActionInjected)()
    actionInjected.open()
    expect(b.layout.selectPanel).toHaveBeenCalledTimes(2)
    expect(b.layout.selectPanel).toHaveBeenNthCalledWith(1, BOT_PANEL)
    expect(b.layout.selectPanel).toHaveBeenNthCalledWith(2, BOT_PANEL)
    expect(b.layout.setMode).not.toHaveBeenCalled()

    removePanel()
  })

  it('removes both entries when the panel goes away', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const removePanel = registerBotPanel(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries(SIDEBAR_ACTION)).toHaveLength(1) })

    removePanel()
    await vi.waitFor(() => {
      expect(b.slots.entries(RAIL_ENTRY)).toEqual([])
      expect(b.slots.entries(SIDEBAR_ACTION)).toEqual([])
    })
  })

  it('registers both entries for a panel that was already there', async () => {
    const b = await bench()
    registerBotPanel(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(1)
    expect(b.slots.entries(SIDEBAR_ACTION)).toHaveLength(1)
  })

  it('teardown removes both entries and restores the plugin\'s row', async () => {
    const b = await bench()
    registerBotPanel(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SIDEBAR_ACTION)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(RAIL_ENTRY)).toEqual([])
    expect(b.slots.entries(SIDEBAR_ACTION)).toEqual([])
    expect(b.restoreRow).toHaveBeenCalledTimes(1)
  })
})
