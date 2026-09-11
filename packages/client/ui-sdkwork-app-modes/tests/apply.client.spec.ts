// @vitest-environment jsdom
/** ui-sdkwork-app-modes apply wiring: rail + keyed placeholder pages + the
 * hero scene switcher with its submission observer + the sidebar-visibility
 * preference row, each registered once its slot declaration is on the ledger;
 * a staged scene navigates when the current session's first message lands and
 * never opens the sign-in overlay from the Code surface; the boot default and
 * the row writes ride the settings scope; teardown cascades. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore, type SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { ModeRail } from '../src/client/ModeRail.tsx'
import { RailEntry } from '../src/client/RailEntry.tsx'
import { ModePage } from '../src/client/ModePage.tsx'
import { HeroModeSwitch } from '../src/client/HeroModeSwitch.tsx'
import { SceneSkillTags } from '../src/client/SceneSkillTags.tsx'
import { SidebarSettingsRow } from '../src/client/SidebarSettingsRow.tsx'
import type {
  HeroModeSwitchInjected, ModePageInjected, RailEntryInjected, SidebarSettingsRowInjected,
} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { createSidebarSettingsRowStore } from '../src/client/sidebar-settings-store.ts'
import { SIDEBAR_VISIBLE_FIELD, type UiAppModesSettings } from '../src/app-modes-settings.ts'

const RAIL = 'mode.rail'
const RAIL_ENTRY = 'mode.rail.entry'
const RAIL_SETTINGS = 'mode.rail.settings'
const PAGE = 'mode.page'
const HERO_SWITCH = 'conversation.hero.modeSwitch'
const DOCK = 'conversation.composer.dock'
const ROW = 'settings.general.item'

/** The list row id brand, cast at the fixture boundary only. */
type SessionIdOf = NonNullable<SessionListState['current']>
const sid = (value: string): SessionIdOf => value as SessionIdOf

/** One list row fixture: identity + blank bit (the only field the observer reads). */
function summary(id: SessionIdOf, blank: boolean): SessionListState['byId'][SessionIdOf] {
  return {
    id, blank, displayTitle: id, running: false, updatedAt: 0,
  } as SessionListState['byId'][SessionIdOf]
}

function listState(current: SessionIdOf | undefined, blank: boolean): SessionListState {
  return {
    ids: current === undefined ? [] : [current],
    byId: current === undefined ? {} : { [current]: summary(current, blank) },
    current, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }
}

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const layout = { setSidebarVisible: vi.fn(), toggleSidebar: vi.fn(), setMode: vi.fn() }
  ctx.provide('layout', layout)
  const stub = stubSettingsScope<UiAppModesSettings>()
  ctx.provide('settingsScope', { bind: () => stub.scope } as never)
  // The plugin declares no IAM edge; the gate stays on the bench so the
  // regression assertions can prove no path ever reaches it.
  const gate = {
    isSignedIn: vi.fn(() => true),
    openSignInOverlay: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  }
  ctx.provide('iam', gate as never)
  // The hero scene observer reads the current session's blank bit from the
  // sessions list snapshot; tests publish flips through this store.
  const list = createSnapshotStore<SessionListState>(listState(sid('s1'), true))
  ctx.provide('sessions', { list } as never)
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  if (declare) {
    // Stand in for the frame, the conversation shell, and the settings shell:
    // declare the rail, the keyed page seat, the hero switcher seat, and the
    // General item slot from root.
    slots.register(
      {
        name: 'root',
        children: {
          [RAIL]: { kind: 'single', scope: 'root' },
          [PAGE]: { kind: 'keyed', scope: 'root' },
          [HERO_SWITCH]: { kind: 'single', scope: 'root' },
          [DOCK]: { kind: 'list', scope: 'session' },
          [ROW]: { kind: 'list', scope: 'root' },
        },
      } as never,
      () => null,
    )
  }
  return { ctx, slots, layout, stub, gate, list }
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

describe('ui-sdkwork-app-modes apply', () => {
  it('declares the services it uses', () => {
    // No IAM edge: nothing this plugin registers opens a sign-in surface.
    expect(inject).toEqual(['slots', 'locale', 'settingsScope', 'layout', 'sessions'])
  })

  it('registers the rail with its base entries, one keyed page per non-code mode, the hero switcher, and the preference row', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(RAIL)).toHaveLength(1)
    const rail = b.slots.entries(RAIL)[0]!
    expect(rail.component).toBe(ModeRail)
    expect(rail.locale).toBe('appMode')
    // The rail injects nothing: a mode switch is a plain mode write, so no
    // rail registration can carry a sign-in gate into the frame.
    expect(rail.inject).toBeUndefined()
    // The rail declares the keyed entry seat and the settings seat; the
    // base entries occupy the former, ui-settings-general the latter.
    expect(b.slots.spec(RAIL_ENTRY)).toEqual({ kind: 'keyed', scope: 'root' })
    expect(b.slots.spec(RAIL_SETTINGS)).toEqual({ kind: 'single', scope: 'root' })
    const entries = b.slots.entries(RAIL_ENTRY)
    expect(entries.map(e => e.options.key)).toEqual(['code', 'work', 'document'])
    for (const entry of entries) {
      expect(entry.component).toBe(RailEntry)
      expect(entry.locale).toBe('appMode')
      const injected = (entry.inject as unknown as () => RailEntryInjected)()
      expect(injected.mode).toBe(entry.options.key)
    }

    const pages = b.slots.entries(PAGE)
    expect(pages.map(e => e.options.key)).toEqual(['work', 'document'])
    for (const page of pages) {
      expect(page.component).toBe(ModePage)
      const injected = (page.inject as unknown as () => ModePageInjected)()
      expect(injected.mode).toBe(page.options.key)
    }

    const heroSwitch = b.slots.entries(HERO_SWITCH)
    expect(heroSwitch).toHaveLength(1)
    expect(heroSwitch[0]!.component).toBe(HeroModeSwitch)
    expect(heroSwitch[0]!.locale).toBe('appMode')
    // The switcher seat is root-scoped: the pills stage without a session.
    expect(b.slots.spec(HERO_SWITCH)).toEqual({ kind: 'single', scope: 'root' })
    const switchInjected = (heroSwitch[0]!.inject as unknown as () => HeroModeSwitchInjected)()
    // The Code surface's switcher face is the staging store alone: no IAM
    // gate reaches the hero, so no pill click can raise a sign-in surface.
    expect(switchInjected).not.toHaveProperty('authGate')
    // The injected scene store is live read/write state shared with the tags.
    switchInjected.scene.set('video')
    expect(switchInjected.scene.get()).toBe('video')
    switchInjected.scene.set('code')

    // The skill-tag strip rides the composer dock below the input card.
    const dock = b.slots.entries(DOCK)
    expect(dock).toHaveLength(1)
    expect(dock[0]!.component).toBe(SceneSkillTags)
    expect(dock[0]!.locale).toBe('appMode')
    expect(dock[0]!.options).toMatchObject({ id: 'hero-scene-skills' })
    expect(b.slots.spec(DOCK)).toEqual({ kind: 'list', scope: 'session' })

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
          [HERO_SWITCH]: { kind: 'single', scope: 'root' },
          [ROW]: { kind: 'list', scope: 'root' },
        },
      } as never,
      () => null,
    )
    await Promise.resolve()
    expect(b.slots.entries(RAIL)).toHaveLength(1)
  })

  it('navigates to the staged scene and consumes the staging when the first message lands', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const hero = b.slots.entries(HERO_SWITCH)[0]!
    const scene = (hero.inject as unknown as () => HeroModeSwitchInjected)().scene!
    scene.set('video')
    // The same current session flips blank → non-blank: the submission.
    b.list.update((d) => { d.byId[sid('s1')]!.blank = false })
    expect(b.layout.setMode).toHaveBeenCalledWith('video')
    expect(scene.get()).toBe('code')
    expect(b.gate.openSignInOverlay).not.toHaveBeenCalled()
  })

  it('navigates to document through the same observer without touching the gate', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const hero = b.slots.entries(HERO_SWITCH)[0]!
    const scene = (hero.inject as unknown as () => HeroModeSwitchInjected)().scene!
    scene.set('document')
    b.list.update((d) => { d.byId[sid('s1')]!.blank = false })
    expect(b.layout.setMode).toHaveBeenCalledWith('document')
    expect(scene.get()).toBe('code')
  })

  it('a signed-out gated staging still navigates, and the Code surface never opens the sign-in overlay', async () => {
    const b = await bench()
    b.gate.isSignedIn.mockImplementation(() => false)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const hero = b.slots.entries(HERO_SWITCH)[0]!
    const scene = (hero.inject as unknown as () => HeroModeSwitchInjected)().scene!
    scene.set('video')
    b.list.update((d) => { d.byId[sid('s1')]!.blank = false })
    // The frame lands on the scene; the destination page owns asking for a
    // session, so no navigation path here raises the overlay.
    expect(b.layout.setMode).toHaveBeenCalledWith('video')
    expect(b.gate.openSignInOverlay).not.toHaveBeenCalled()
  })

  it('another session becoming current never consumes a staging on its own', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const hero = b.slots.entries(HERO_SWITCH)[0]!
    const scene = (hero.inject as unknown as () => HeroModeSwitchInjected)().scene!
    scene.set('video')
    // Switch current to an already-active session: a session change is not a
    // first-message flip, so the staging survives untouched.
    b.list.update((d) => {
      const row = summary(sid('s2'), false)
      d.byId[row.id] = row
      d.ids = [...d.ids, row.id]
      d.current = row.id
    })
    expect(b.layout.setMode).not.toHaveBeenCalled()
    expect(scene.get()).toBe('video')
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
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(3)
    expect(b.slots.entries(PAGE)).toHaveLength(2)
    expect(b.slots.entries(HERO_SWITCH)).toHaveLength(1)
    expect(b.slots.entries(DOCK)).toHaveLength(1)
    expect(b.slots.entries(ROW)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(RAIL)).toHaveLength(0)
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
    expect(b.slots.entries(HERO_SWITCH)).toHaveLength(0)
    expect(b.slots.entries(DOCK)).toHaveLength(0)
    expect(b.slots.entries(ROW)).toHaveLength(0)
  })
})
