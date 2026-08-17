/** ui-app-modes apply wiring: rail + keyed placeholder pages + the
 * sidebar-visibility preference row, each registered once its slot
 * declaration is on the ledger; the boot default and the row writes ride the
 * settings scope; teardown cascades. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-app-modes/client'
import { ModeRail } from '../src/client/ModeRail.tsx'
import { RailEntry } from '../src/client/RailEntry.tsx'
import { ModePage } from '../src/client/ModePage.tsx'
import { SidebarSettingsRow } from '../src/client/SidebarSettingsRow.tsx'
import type {
  ModePageInjected, RailEntryInjected, SidebarSettingsRowInjected,
} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import { createSidebarSettingsRowStore } from '../src/client/sidebar-settings-store.ts'
import { SIDEBAR_VISIBLE_FIELD, type UiAppModesSettings } from '../src/app-modes-settings.ts'

const RAIL = 'mode.rail'
const RAIL_ENTRY = 'mode.rail.entry'
const RAIL_SETTINGS = 'mode.rail.settings'
const PAGE = 'mode.page'
const ROW = 'settings.general.item'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const layout = { setSidebarVisible: vi.fn(), toggleSidebar: vi.fn() }
  ctx.provide('layout', layout)
  const stub = stubSettingsScope<UiAppModesSettings>()
  ctx.provide('settingsScope', { bind: () => stub.scope } as never)
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    // Stand in for the frame and the settings shell: declare the rail, the
    // keyed page seat, and the General item slot from root.
    slots.register(
      {
        name: 'root',
        children: {
          [RAIL]: { kind: 'single', scope: 'root' },
          [PAGE]: { kind: 'keyed', scope: 'root' },
          [ROW]: { kind: 'list', scope: 'root' },
        },
      } as never,
      () => null,
    )
  }
  return { ctx, slots, layout, stub }
}

/** Bake a real store instance from the declared handle and run the entry's
 * inject factory with its bound actions (the framework choreography). */
function rowFaceOf(slots: SlotRegistry) {
  const entry = slots.entries(ROW).find(e => e.component === SidebarSettingsRow)!
  const handle = entry.store as ReturnType<typeof createSidebarSettingsRowStore>
  const instance = handle.create()
  const face = (entry.inject as unknown as (a: typeof instance.actions) => SidebarSettingsRowInjected)(instance.actions)
  return { entry, instance, face }
}

describe('ui-app-modes apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'settingsScope', 'layout'])
  })

  it('registers the rail with its base entries, one keyed page per non-code mode, and the preference row', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(RAIL)).toHaveLength(1)
    const rail = b.slots.entries(RAIL)[0]!
    expect(rail.component).toBe(ModeRail)
    expect(rail.locale).toBe('appMode')
    // The rail declares the keyed entry seat and the settings seat; the
    // base entries occupy the former, ui-settings-general the latter.
    expect(b.slots.spec(RAIL_ENTRY)).toEqual({ kind: 'keyed', scope: 'root' })
    expect(b.slots.spec(RAIL_SETTINGS)).toEqual({ kind: 'single', scope: 'root' })
    const entries = b.slots.entries(RAIL_ENTRY)
    expect(entries.map(e => e.options.key)).toEqual(['code', 'work', 'video', 'image'])
    for (const entry of entries) {
      expect(entry.component).toBe(RailEntry)
      expect(entry.locale).toBe('appMode')
      const injected = (entry.inject as unknown as () => RailEntryInjected)()
      expect(injected.mode).toBe(entry.options.key)
    }

    const pages = b.slots.entries(PAGE)
    expect(pages.map(e => e.options.key)).toEqual(['work', 'video', 'image'])
    for (const page of pages) {
      expect(page.component).toBe(ModePage)
      const injected = (page.inject as unknown as () => ModePageInjected)()
      expect(injected.mode).toBe(page.options.key)
    }

    const row = b.slots.entries(ROW).find(e => e.component === SidebarSettingsRow)!
    expect(row.options).toMatchObject({ id: 'app-modes-sidebar', order: 30 })
    expect(row.locale).toBe('appMode')
  })

  it('registers late when the declarations arrive after apply (declaration injection)', async () => {
    const b = await bench(false)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL)).toHaveLength(0)
    b.slots.register(
      {
        name: 'root',
        children: {
          [RAIL]: { kind: 'single', scope: 'root' },
          [PAGE]: { kind: 'keyed', scope: 'root' },
          [ROW]: { kind: 'list', scope: 'root' },
        },
      } as never,
      () => null,
    )
    await Promise.resolve()
    expect(b.slots.entries(RAIL)).toHaveLength(1)
  })

  it('mirrors the scope into the row store and routes the switch write to the scope and the frame', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    b.stub.publish({
      status: 'ready', value: { sidebarVisible: true }, writable: true, revision: 1,
    })
    const { instance, face } = rowFaceOf(b.slots)
    expect(instance.getSnapshot()).toMatchObject({ visible: true, writable: true, revision: 1 })

    face.setSidebarVisible(false)
    expect(b.stub.set).toHaveBeenCalledWith(SIDEBAR_VISIBLE_FIELD, false)
    expect(b.layout.setSidebarVisible).toHaveBeenCalledWith(false)
  })

  it('applies the persisted boot default once the scope resolves (off collapses, on stays)', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.layout.setSidebarVisible).not.toHaveBeenCalled()

    // Hidden preference: applied once at first ready.
    b.stub.publish({ status: 'ready', value: { sidebarVisible: false }, writable: true, revision: 1 })
    expect(b.layout.setSidebarVisible).toHaveBeenCalledWith(false)
    // A later acceptance (revision bump) does not re-apply the default.
    b.stub.publish({ status: 'ready', value: { sidebarVisible: true }, writable: true, revision: 2 })
    expect(b.layout.setSidebarVisible).toHaveBeenCalledTimes(1)
  })

  it('the row renders nothing until the scope accepts a section (no guessed value)', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const { instance } = rowFaceOf(b.slots)
    expect(instance.getSnapshot().visible).toBeUndefined()
    // An event ahead of any inject hits the unbound-actions arm quietly.
    b.stub.publish({ status: 'ready', value: { sidebarVisible: true }, writable: true, revision: 1 })
  })

  it('teardown removes the entries and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL)).toHaveLength(1)
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(4)
    expect(b.slots.entries(PAGE)).toHaveLength(3)
    expect(b.slots.entries(ROW)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(RAIL)).toHaveLength(0)
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
    expect(b.slots.entries(ROW)).toHaveLength(0)
  })
})
