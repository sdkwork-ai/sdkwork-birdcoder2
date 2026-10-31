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
 *   renders its pages as rows inside the column.
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
import type { SidebarPagesInjected } from './SidebarRoot.tsx'
import { createPanelPins } from './panel-pins.ts'
import { HeaderLeadingControls } from './HeaderLeadingControls.tsx'
import { SidebarRoot } from './SidebarRoot.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'

export type { SidebarPage, SidebarPageDescriptor, SidebarPageGlyphProps, SidebarPageRegistry } from './service.ts'
export type { SidebarPagesInjected, SidebarRootProps } from './SidebarRoot.tsx'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The left column's page registry (see `service.ts`). */
    sdkworkSidebar: import('./service.ts').SidebarPageRegistry
  }
}

/** Dictionary namespace owned by this plugin (the upstream shell's namespace). */
const NS = 'sidebar'

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
    const next = ctx.slots.entriesOfSlot('sidebar.panellist').flatMap(({ options }) => {
      const id = options.id as MainPanelId
      if (railShortcuts.has(id)) return []
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
  ctx.effect(() => ctx.locale.subscribe(syncPanels), 'ui-sdkwork-sidebar: panel labels')
  const panelPins = createPanelPins()
  const entryActions = {
    getSnapshot: () => ctx.slots.entriesOfSlot('sidebar.panellist.actions').length > 0,
    subscribe: (listener: () => void) => ctx.slots.subscribe('sidebar.panellist.actions', listener),
  }

  const injectProps = (): SidebarRootInjected & SidebarPagesInjected => ({
    // The shell's New Session button rides the Workspace UI's shared action
    // (current Session Workspace, then recent Workspace).
    startSession: (workspaceId) => { workspaceNavigation.startSession(workspaceId) },
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
    selectPanel: (id) => { ctx.layout.selectPanel(id) },
    setPinned: panelPins.setPinned,
    trackEntryClick: (attributes) => { ctx.get('productAnalytics')?.track('sidebar_menu_click', attributes) },
    hooks: { panels, pages, shortcuts: ctx.shortcuts.catalog, entryPins: panelPins.unpinned, entryActions },
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
  syncPanels()
}
