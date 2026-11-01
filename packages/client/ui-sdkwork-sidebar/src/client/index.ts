/**
 * Fork-owned left sidebar: registers the navigation shell and its page
 * registry into the layout frame.
 *
 * It replaces upstream's `ui-sidebar` occupant at the composition level — the
 * `ui-sidebar` row in `packages/bundle/web-app/cordis.patch.yml` is repointed
 * to this package — while keeping upstream's `sidebar.*` seat contract and
 * every occupant unchanged. On top of upstream's shell this package:
 *
 * - declares the SAME `sidebar.*` children (brand, quick entries, panel list,
 *   workspace browser, settings/footer seats), so `ui-workspace`, `ui-settings`,
 *   `ui-brand-official`, `ui-sdkwork-new-chat` and every quick entry keep
 *   registering into the same holes;
 * - provides `ctx.sdkworkSidebar`, the page registry modeled on
 *   dsh-better-sidebar's `ctx.betterSidebar.registerTab` (see `service.ts`), and
 *   renders its pages as rows inside the column;
 * - owns the column's visibility preference (see `layout.ts`): the shell skips
 *   the entries the user hid, and the Sidebar settings page lists every
 *   configurable row with one switch each.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the Session root standard-props merge.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: the slot contract this shell occupies (upstream owns the types).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SidebarPanelMetadata, SidebarRootInjected } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createSidebarPageRegistry, type SidebarPage } from './service.ts'
import type { SidebarLayoutInjected } from './SidebarRoot.tsx'
import {
  createSidebarLayoutPreference, sameSidebarLayout, sidebarItems,
  type SidebarItemSource, type SidebarLayoutSnapshot,
} from './layout.ts'
import { FIXED_PANEL_ID, createPanelPins } from './panel-pins.ts'
import { HeaderLeadingControls } from './HeaderLeadingControls.tsx'
import { SidebarLayoutSection, type SidebarLayoutSectionInjected } from './SidebarLayoutSection.tsx'
import { SidebarRoot } from './SidebarRoot.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'
import { en as layoutEn, zh as layoutZh, type SidebarLayoutKey } from './layout-locales.ts'

export type { SidebarPage, SidebarPageDescriptor, SidebarPageGlyphProps, SidebarPageRegistry } from './service.ts'
export type { SidebarLayoutInjected, SidebarRootProps } from './SidebarRoot.tsx'
export type { SidebarLayoutSectionInjected, SidebarLayoutSectionProps } from './SidebarLayoutSection.tsx'
export type {
  SidebarItem, SidebarItemGroup, SidebarItemSource, SidebarLayoutPreference, SidebarLayoutSnapshot,
} from './layout.ts'
export type { SidebarLayoutKey } from './layout-locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The left column's page registry (see `service.ts`). */
    sdkworkSidebar: import('./service.ts').SidebarPageRegistry
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The sidebar-items settings page copy. */
    sidebarLayout: SidebarLayoutKey
  }
}

/** Dictionary namespace owned by this plugin (the upstream shell's namespace). */
const NS = 'sidebar'

/** Dictionary namespace owned by the sidebar-items settings page. */
const LAYOUT_NS = 'sidebarLayout'

interface WorkspaceNavigation {
  startSession(workspaceId?: Parameters<SidebarRootInjected['startSession']>[0]): void
}

/** Services required by the sidebar plugin. */
export const inject = ['slots', 'layout', 'uiWorkspace', 'locale', 'shortcuts']

/** Registers the sidebar shell, its page registry and their service callbacks.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const workspaceNavigation = ctx.get('uiWorkspace') as unknown as WorkspaceNavigation
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-sdkwork-sidebar: dictionaries')
  ctx.effect(
    () => ctx.locale.register(LAYOUT_NS, { zh: layoutZh, en: layoutEn }),
    'ui-sdkwork-sidebar: layout dictionaries',
  )

  // The page registry: the fork's projection of dsh-better-sidebar's tab
  // model onto this column. Published before the shell renders, so a plugin
  // that injects `sdkworkSidebar` is ready the moment it activates.
  const registry = createSidebarPageRegistry()
  ctx.provide('sdkworkSidebar', registry)
  const pages = createSnapshotStore<readonly SidebarPage[]>(registry.getPages())
  ctx.effect(() => registry.subscribe(() => { pages.set(registry.getPages()) }), 'ui-sdkwork-sidebar: page rows')
  // A function-valued page title is locale copy: re-resolve it on every
  // language/preference change and republish only when the list moved.
  ctx.effect(() => ctx.locale.subscribe(() => {
    registry.refreshTitles()
    pages.set(registry.getPages())
  }), 'ui-sdkwork-sidebar: page titles')

  const panels = createSnapshotStore<readonly SidebarPanelMetadata[]>([])
  // A global panel exposed as a rail shortcut (`mode.rail.panel`, the mode
  // rail's seat above Settings) navigates from the rail in both column states,
  // so this column does not list it a second time. Read as a sibling
  // navigation contract: a composition without the rail filters nothing.
  // List registrations require an id; StoredEntry erases the slot kind.
  const railPanelIds = (): ReadonlySet<string> => new Set(
    ctx.slots.entriesOfSlot('mode.rail.panel').map(({ options }) => options.id as string))
  const syncPanels = (): void => {
    const railShortcuts = railPanelIds()
    // A panel whose content another surface embeds has that surface as its
    // navigation entry (`suppressPanel`); the row here would be the second
    // entry to the same page.
    const embedded = registry.getSuppressedPanels()
    const next = ctx.slots.entriesOfSlot('sidebar.panellist').flatMap(({ options }) => {
      const id = options.id as MainPanelId
      if (railShortcuts.has(id) || embedded.has(id)) return []
      return [{ id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id }]
    }).sort((a, b) => a.order - b.order)
    const previous = panels.getSnapshot()
    if (previous.length === next.length && previous.every((panel, index) => {
      const candidate = next[index]
      return panel.id === candidate.id && panel.order === candidate.order && panel.label === candidate.label
    })) return
    panels.set(next)
  }
  ctx.effect(() => ctx.slots.subscribe('sidebar.panellist', syncPanels), 'ui-sdkwork-sidebar: panel entries')
  ctx.effect(() => ctx.slots.subscribe('mode.rail.panel', syncPanels), 'ui-sdkwork-sidebar: rail panel shortcuts')
  ctx.effect(() => registry.subscribe(syncPanels), 'ui-sdkwork-sidebar: embedded panel rows')
  ctx.effect(() => ctx.locale.subscribe(syncPanels), 'ui-sdkwork-sidebar: panel labels')
  const panelPins = createPanelPins()
  const entryActions = {
    getSnapshot: () => ctx.slots.entriesOfSlot('sidebar.panellist.actions').length > 0,
    subscribe: (listener: () => void) => ctx.slots.subscribe('sidebar.panellist.actions', listener),
  }

  // The user's visibility choice, and the published layout the column and the
  // settings page both read: the rows the column can draw (quick entries,
  // registry pages, panel rows) plus the ids the user hid. One store keeps the
  // two surfaces one fact, and the preference is the only writer.
  const layoutPreference = createSidebarLayoutPreference()
  const layout = createSnapshotStore<SidebarLayoutSnapshot>({
    items: [],
    hidden: layoutPreference.get(),
  })
  // A quick entry's display label is registration metadata (`label`), not
  // something the shell can read off the component: the entry draws its own
  // copy. An entry that declares none still lists, under its id, so a fork
  // plugin that forgot the label remains configurable instead of invisible.
  const actionSources = (): readonly SidebarItemSource[] => ctx.slots.entriesOfSlot('sidebar.actions')
    .flatMap(({ options }) => options.id === undefined ? [] : [{
      id: options.id,
      order: options.order ?? 0,
      title: resolveSlotLabel(options.label) ?? options.id,
    }])
  const publishLayout = (): void => {
    const next: SidebarLayoutSnapshot = {
      items: sidebarItems({
        actions: actionSources(),
        pages: registry.getPages().map(page => ({
          id: page.id, order: page.order, title: page.title,
        })),
        // The fixed panel launcher always shows (its row is the product's
        // permanent entry), so it is not offered as a configurable row.
        panels: panels.getSnapshot()
          .filter(({ id }) => id !== FIXED_PANEL_ID)
          .map(({ id, label, order }) => ({ id, order, title: label })),
      }),
      hidden: layoutPreference.get(),
    }
    if (sameSidebarLayout(layout.getSnapshot(), next)) return
    layout.set(next)
  }
  ctx.effect(() => ctx.slots.subscribe('sidebar.actions', publishLayout), 'ui-sdkwork-sidebar: layout entries')
  ctx.effect(() => registry.subscribe(publishLayout), 'ui-sdkwork-sidebar: layout pages')
  ctx.effect(() => panels.subscribe(publishLayout), 'ui-sdkwork-sidebar: layout panels')
  ctx.effect(() => layoutPreference.subscribe(publishLayout), 'ui-sdkwork-sidebar: layout preference')
  ctx.effect(() => ctx.locale.subscribe(publishLayout), 'ui-sdkwork-sidebar: layout titles')

  const injectProps = (): SidebarRootInjected & SidebarLayoutInjected => ({
    // The shell's New Session button rides the Workspace UI's shared action
    // (current Session Workspace, then recent Workspace).
    startSession: (workspaceId) => { workspaceNavigation.startSession(workspaceId) },
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
    selectPanel: (id) => { ctx.layout.selectPanel(id) },
    setPinned: panelPins.setPinned,
    trackEntryClick: (attributes) => { ctx.get('productAnalytics')?.track('sidebar_menu_click', attributes) },
    hooks: { panels, pages, layout, shortcuts: ctx.shortcuts.catalog, entryPins: panelPins.unpinned, entryActions },
  })
  ctx.slots.inject('sidebar', () => ctx.slots.register({
    name: 'sidebar',
    locale: NS,
    // The shell owns geometry, global panel rows and the page registry; the
    // quick entries (fork plugins) fill the New Session button area,
    // ui-workspace registers the whole browsing region (header, search,
    // session list, workspace dialogs), ui-settings registers the foot
    // trigger + settings panel.
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
      'sidebar.actions': { kind: 'list', scope: 'root' },
      'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
      'sidebar.workspaces': { kind: 'single', scope: 'root' },
      'sidebar.settings': { kind: 'single', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
    inject: injectProps,
  }, SidebarRoot))
  // macOS desktop hides the collapsed sidebar entirely, so the open/New
  // Session controls move into the frame's window-chrome seat beside the
  // traffic lights; the occupant reuses the shell's injected actions, and
  // the AppFrame mounts the seat only while the column is fully hidden.
  ctx.slots.inject('shell.leading', () => ctx.slots.register({
    name: 'shell.leading',
    locale: NS,
    inject: injectProps,
  }, HeaderLeadingControls))

  // The settings page that edits the preference. Directly behind General: the
  // dialog's own chrome and navigation preferences read as one block, ahead of
  // the feature pages. A composition without the settings shell leaves this
  // fiber pending; the column itself works with no page to edit it.
  const sectionInjected = (): SidebarLayoutSectionInjected => ({
    hooks: { layout },
    setVisible: (id, visible) => { layoutPreference.setVisible(id, visible) },
    reset: () => { layoutPreference.reset() },
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'sidebar-layout',
    order: 1,
    label: () => ctx.locale.bind(LAYOUT_NS)('nav'),
    locale: LAYOUT_NS,
    inject: sectionInjected,
  }, SidebarLayoutSection))

  syncPanels()
  publishLayout()
}
