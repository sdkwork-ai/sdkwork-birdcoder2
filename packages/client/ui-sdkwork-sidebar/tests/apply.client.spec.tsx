// @vitest-environment jsdom
/**
 * ui-sdkwork-sidebar apply wiring: the shell and the Sidebar settings page are
 * registered over the composition's declarations, the layout hook publishes the
 * rows the column can draw with their resolved titles, the settings page's
 * writes change that layout and persist, and teardown removes the whole
 * contribution.
 */
import type { ReactNode } from 'react'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRootInjected } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { SidebarLayoutSection } from '../src/client/SidebarLayoutSection.tsx'
import type { SidebarLayoutInjected } from '../src/client/SidebarRoot.tsx'
import type { SidebarLayoutSectionInjected } from '../src/client/SidebarLayoutSection.tsx'
import { SIDEBAR_LAYOUT_STORAGE_KEY, createSidebarLayoutPreference, type SidebarLayoutSnapshot } from '../src/client/layout.ts'

const owners = new Set<Fiber>()
afterEach(async () => {
  try {
    for (const owner of owners) await owner.dispose()
  } finally {
    owners.clear()
  }
})
beforeEach(() => { localStorage.clear() })

/** Root stand-in: the composition's frame declaring the seats under test. */
function TestFrame({ renderSlot }: PropsRenderSlots<'sidebar'>): ReactNode {
  return renderSlot('sidebar', { collapsed: false, width: 300, drawer: false })
}

async function bench() {
  const root = new Context()
  let ctx: Context | undefined
  const owner = root.plugin((owned: Context) => { ctx = owned })
  owners.add(owner)
  await owner.await()
  if (ctx === undefined) throw new Error('the sidebar fixture owner did not activate')
  await ctx.plugin(SlotRegistry).await()
  const layout = { toggleSidebar: vi.fn(), selectPanel: vi.fn() }
  const uiWorkspace = { startSession: vi.fn() }
  ctx.provide('shortcuts', { catalog: createSnapshotStore([]) } as never)
  ctx.provide('layout', layout)
  ctx.provide('uiWorkspace', uiWorkspace as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: {
      'sidebar': { kind: 'single', scope: 'root' },
      'shell.leading': { kind: 'single', scope: 'root' },
      // The settings host declares the section ledger the page registers into.
      'settings.section': { kind: 'list', scope: 'root' },
    },
  }, TestFrame)
  return { ctx, slots, layout, uiWorkspace }
}

/** The shell's injected face, read the way the renderer reads it. */
function shellInject(slots: SlotRegistry): SidebarRootInjected & SidebarLayoutInjected {
  return (slots.entries('sidebar')[0].inject as () => SidebarRootInjected & SidebarLayoutInjected)()
}

/** The settings page's injected face. */
function sectionInject(slots: SlotRegistry): SidebarLayoutSectionInjected {
  return (slots.entries('settings.section')[0].inject as () => SidebarLayoutSectionInjected)()
}

describe('ui-sdkwork-sidebar apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts'])
  })

  it('delegates the shell callbacks to their services', async () => {
    const b = await bench()
    const sidebar = b.ctx.plugin({ inject: [...inject], apply })
    await sidebar.await()
    const injected = shellInject(b.slots)
    injected.startSession()
    expect(b.uiWorkspace.startSession).toHaveBeenCalledWith(undefined)
    injected.toggleSidebar()
    expect(b.layout.toggleSidebar).toHaveBeenCalledOnce()
    const panelId = 'panel' as MainPanelId
    injected.selectPanel(panelId)
    expect(b.layout.selectPanel).toHaveBeenCalledExactlyOnceWith(panelId)
    // Pin state is the column's own store; the layout preference never reaches it.
    injected.setPinned(panelId, false)
    expect(injected.hooks.entryPins.getSnapshot()).toEqual([panelId])
    injected.setPinned(panelId, true)
    expect(injected.hooks.entryPins.getSnapshot()).toEqual([])
    // Entry reporting is optional: without the analytics service it no-ops.
    expect(() => { injected.trackEntryClick({ menu_name: 'more', position: 'sidebar' }) }).not.toThrow()
    const track = vi.fn()
    b.ctx.provide('productAnalytics', { track } as never)
    injected.trackEntryClick({ menu_name: 'new_session', position: 'titlebar' })
    expect(track).toHaveBeenCalledExactlyOnceWith(
      'sidebar_menu_click', { menu_name: 'new_session', position: 'titlebar' },
    )
  })

  it('publishes the layout hook with the column rows and the hidden set', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = shellInject(b.slots)
    const snapshot: SidebarLayoutSnapshot = injected.hooks.layout.getSnapshot()
    expect(snapshot).toEqual({ items: [], hidden: [] })
    expect(injected.hooks.layout).toBe(sectionInject(b.slots).hooks.layout)
  })

  it('registers the Sidebar settings page behind General with the layout face', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [entry] = b.slots.entries('settings.section')
    expect(entry?.component).toBe(SidebarLayoutSection)
    expect(entry?.options.id).toBe('sidebar-layout')
    expect(entry?.options.order).toBe(1)
    expect(resolveSlotLabel(entry?.options.label)).toBe('Sidebar')
    expect(entry?.locale).toBe('sidebarLayout')
  })

  it('lists registered quick entries, pages and panels with their resolved titles', async () => {
    const b = await bench()
    const sidebar = b.ctx.plugin({ inject: [...inject], apply })
    await sidebar.await()
    const injected = shellInject(b.slots)
    const contributor = b.ctx.plugin({
      inject: ['slots', 'sdkworkSidebar'],
      apply(ctx: Context) {
        ctx.slots.register({
          name: 'sidebar.actions',
          id: 'quick',
          order: 20,
          label: 'Quick entry',
        }, () => null)
        ctx.effect(() => ctx.sdkworkSidebar.registerPage({
          id: 'page',
          order: 5,
          title: 'Registered page',
          icon: () => null,
          open: () => {},
        }), 'page')
        ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'panel',
          order: 7,
          label: 'Panel row',
        }, () => null)
        ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'later-panel',
          order: 9,
          label: 'Later panel row',
        }, () => null)
      },
    })
    try {
      await contributor.await()
      await vi.waitFor(() => {
        expect(injected.hooks.layout.getSnapshot().items).toEqual([
          { id: 'quick', group: 'actions', title: 'Quick entry', order: 20 },
          { id: 'page', group: 'pages', title: 'Registered page', order: 5 },
          { id: 'panel', group: 'panels', title: 'Panel row', order: 7 },
          { id: 'later-panel', group: 'panels', title: 'Later panel row', order: 9 },
        ])
      })
      // An entry without a declared label stays configurable under its id.
      const unlabeled = b.ctx.plugin({
        inject: ['slots'],
        apply(ctx: Context) {
          ctx.slots.register({ name: 'sidebar.actions', id: 'unlabeled', order: 30 }, () => null)
        },
      })
      await unlabeled.await()
      await vi.waitFor(() => {
        expect(injected.hooks.layout.getSnapshot().items).toContainEqual(
          { id: 'unlabeled', group: 'actions', title: 'unlabeled', order: 30 },
        )
      })
      await unlabeled.dispose()
      await vi.waitFor(() => {
        expect(injected.hooks.layout.getSnapshot().items.some(item => item.id === 'unlabeled')).toBe(false)
      })
    } finally {
      await contributor.dispose()
      await sidebar.dispose()
    }
  })

  it('re-resolves entry titles when the language changes', async () => {
    const b = await bench()
    const sidebar = b.ctx.plugin({ inject: [...inject], apply })
    await sidebar.await()
    const injected = shellInject(b.slots)
    let title = 'Entry'
    const contributor = b.ctx.plugin({
      inject: ['slots'],
      apply(ctx: Context) {
        ctx.slots.register({
          name: 'sidebar.actions', id: 'quick', label: () => title,
        }, () => null)
      },
    })
    try {
      await contributor.await()
      await vi.waitFor(() => {
        expect(injected.hooks.layout.getSnapshot().items[0]?.title).toBe('Entry')
      })
      title = 'Renamed entry'
      const locale = b.ctx.get('locale') as LocaleRuntime
      locale.setLocale(locale.getLocale().active === 'zh' ? 'en' : 'zh')
      await vi.waitFor(() => {
        expect(injected.hooks.layout.getSnapshot().items[0]?.title).toBe('Renamed entry')
      })
    } finally {
      await contributor.dispose()
      await sidebar.dispose()
    }
  })

  it('writes the preference through the settings page and drops the row from the layout', async () => {
    const b = await bench()
    const sidebar = b.ctx.plugin({ inject: [...inject], apply })
    await sidebar.await()
    const injected = shellInject(b.slots)
    const contributor = b.ctx.plugin({
      inject: ['slots'],
      apply(ctx: Context) {
        ctx.slots.register({ name: 'sidebar.actions', id: 'quick', label: 'Quick entry' }, () => null)
      },
    })
    try {
      await contributor.await()
      await vi.waitFor(() => {
        expect(injected.hooks.layout.getSnapshot().items).toHaveLength(1)
      })
      const section = sectionInject(b.slots)
      section.setVisible('quick', false)
      expect(injected.hooks.layout.getSnapshot().hidden).toEqual(['quick'])
      expect(JSON.parse(localStorage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY) ?? '{}')).toEqual({ hidden: ['quick'] })
      // A separate instance (the next page load) reads the same preference.
      expect(createSidebarLayoutPreference().get()).toEqual(['quick'])
      section.reset()
      expect(injected.hooks.layout.getSnapshot().hidden).toEqual([])
      expect(JSON.parse(localStorage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY) ?? '{}')).toEqual({ hidden: [] })
    } finally {
      await contributor.dispose()
      await sidebar.dispose()
    }
  })

  it('removes the shell and the settings page on teardown', async () => {
    const b = await bench()
    const sidebar = b.ctx.plugin({ inject: [...inject], apply })
    await sidebar.await()
    const injected = shellInject(b.slots)
    await sidebar.dispose()
    expect(b.slots.entries('sidebar')).toEqual([])
    expect(b.slots.entries('shell.leading')).toEqual([])
    expect(b.slots.entries('settings.section')).toEqual([])
    // The retired store keeps its last published layout for whoever still
    // holds the handle; nothing publishes into it any more.
    expect(injected.hooks.layout.getSnapshot()).toEqual({ items: [], hidden: [] })
  })
})
