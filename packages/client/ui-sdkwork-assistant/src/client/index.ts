/**
 * SDKWork assistant plugin, browser half: two navigation entries to the linked
 * persona-bot layer's surface — the rail cell directly below Home, and the
 * sidebar quick entry in the New Session button area — plus the suppression of
 * the plugin's own sidebar row so the surface keeps exactly one entry per
 * column.
 *
 * The surface itself belongs to `@botharness/ui` (the DeepSeekBot / Tobs
 * plugin): its browser half registers the whole interface as one keyed `main`
 * panel, and its own `sidebar.panellist` row is a second entry to it. This
 * package owns only the product name, the glyph, and the navigation — both
 * entries select that panel through `ctx.layout.selectPanel`, exactly like the
 * plugin's own row does, and never copy or re-register the plugin's component
 * tree.
 *
 * Both entries follow the panel's presence: the linked plugin may be absent (a
 * profile that disabled its row, or a build that does not ship it), and a
 * navigation entry pointing at a surface nobody registered would be dead. The
 * child injections own the registrations, so the plugin's teardown removes
 * them with the panel.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// The plugin's workspace stylesheet assumes a three-track frame; this sheet
// maps the assistant panel onto this fork's four-track frame.
import './assistant-workspace.css'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the rail's entry seat declaration (mode.rail.entry).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
// Type-only: pulls the sidebar's Context merge (ctx.sdkworkSidebar), the
// `sidebar.actions` seat declaration, and its panel-suppression contract.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AssistantAction, type AssistantActionInjected } from './AssistantAction.tsx'
import { AssistantRailEntry, type AssistantRailEntryInjected } from './AssistantRailEntry.tsx'
import { en, zh, type AssistantKey } from './locales.ts'
import { ASSISTANT_MODE, ASSISTANT_PANEL_ID } from './surface.ts'

export type { AssistantActionInjected, AssistantActionProps } from './AssistantAction.tsx'
export type { AssistantRailEntryInjected, AssistantRailEntryProps } from './AssistantRailEntry.tsx'
export type { AssistantKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The assistant entries' copy. */
    assistant: AssistantKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'assistant'

/**
 * Attribute on `<html>` telling the linked persona-bot layer that this host
 * already renders the surface's control rail (the mode rail beside it), so the
 * layer must not draw its own rail column inside the assistant surface.
 */
const HOST_RAIL_ATTRIBUTE = 'data-bh-host-rail'

/** Services required by the assistant navigation plugin. */
export const inject = ['slots', 'locale', 'layout']

/**
 * Client plugin body: register the dictionaries, keep both entries in step with
 * whether the linked layer's main panel is registered, and drop the plugin's
 * own sidebar row in favor of the assistant quick entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-assistant: dictionaries')

  // The linked layer would draw its own control rail inside the surface, which
  // duplicates this shell's mode rail and leaves a narrow strip of icon chrome
  // beside the channel list. Declare that this host owns the rail; the plugin
  // drops its own and the channel list becomes the surface's leftmost column.
  ctx.effect(() => {
    const root = typeof document === 'undefined' ? undefined : document.documentElement
    if (root === undefined) return () => {}
    root.setAttribute(HOST_RAIL_ATTRIBUTE, '')
    return () => { root.removeAttribute(HOST_RAIL_ATTRIBUTE) }
  }, 'ui-sdkwork-assistant: host control rail')

  // The plugin draws its own `sidebar.panellist` row with its avatar artwork
  // and onboarding badge; the assistant quick entry is the surface's navigation
  // in this column, so that row would be a second entry. Suppression follows
  // the sidebar service, so a profile without this column keeps working.
  ctx.inject(['sdkworkSidebar'], sidebarCtx =>
    sidebarCtx.sdkworkSidebar.suppressPanel(ASSISTANT_PANEL_ID))

  let disposeCell: (() => void) | undefined
  let disposeAction: (() => void) | undefined
  const reconcile = (): void => {
    const available = ctx.slots.entriesOfSlot('main').some(entry => entry.options.key === ASSISTANT_PANEL_ID)
    if (available) {
      disposeCell ??= ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
        name: 'mode.rail.entry',
        key: ASSISTANT_MODE,
        locale: NS,
        inject: (): AssistantRailEntryInjected => ({
          open: () => { ctx.layout.selectPanel(ASSISTANT_PANEL_ID) },
        }),
      }, AssistantRailEntry))
      disposeAction ??= ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
        name: 'sidebar.actions',
        id: 'sdkwork-assistant',
        // Directly after the scheduled-tasks entry, ahead of the market entry.
        order: 35,
        // The Sidebar settings page lists this entry by this label; the row's
        // own copy comes from the component.
        label: () => ctx.locale.bind(NS)('entry.label'),
        locale: NS,
        inject: (): AssistantActionInjected => ({
          open: () => { ctx.layout.selectPanel(ASSISTANT_PANEL_ID) },
        }),
      }, AssistantAction))
    } else {
      disposeCell?.()
      disposeCell = undefined
      disposeAction?.()
      disposeAction = undefined
    }
  }
  ctx.effect(() => {
    reconcile()
    return ctx.slots.subscribe('main', reconcile)
  }, 'ui-sdkwork-assistant: assistant panel presence')
}
