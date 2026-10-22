/**
 * SDKWork IM connector plugin, browser half: registers the product navigation
 * for the IM management panel as a full app mode — a rail shortcut above
 * Settings (`mode.rail.panel`) and the keyed `mode.page` that renders the
 * panel. The panel belongs to the linked `@xmanrui/dsh-im` plugin, which
 * publishes the optional `dshImClient` service (version 1); this package owns
 * only the product name, glyph, page frame, and navigation.
 *
 * The IM surface is an app mode like the app store, so the frame renders the
 * icon rail and the page, not the workspace sidebar. The page always renders
 * the complete management interface: channel state (unbound, connecting,
 * failed) is the panel's own content, so a missing or unreachable IM link
 * never replaces the UI.
 *
 * The plugin is a black box: no value import and no editing its bundle. The
 * panel id used as the shortcut's list id is its published navigation key —
 * the same id its sidebar row uses — so registering the shortcut by that id
 * also hides the plugin's duplicate sidebar row (ui-sidebar filters
 * rail-backed panel ids).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the rail's panel-shortcut seat declaration (mode.rail.panel)
// and the mode.page contract.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ImConnectorEntry, type ImConnectorEntryInjected } from './ImConnectorEntry.tsx'
import { ImModePage, type ImModePageInjected } from './ImModePage.tsx'
import { en, zh, type ImConnectorKey } from './locales.ts'

export type { ImConnectorEntryInjected, ImConnectorEntryProps } from './ImConnectorEntry.tsx'
export type { ImModePageInjected, ImModePageProps } from './ImModePage.tsx'
export type { ImConnectorKey } from './locales.ts'

/**
 * The optional client service the linked IM plugin publishes for hosts that
 * embed its management panel (documented as `dshImClient` v1).
 */
interface DshImClient {
  /** Protocol version; this integration speaks version 1. */
  version: number
  /** Build the management panel element for the host's React instance. */
  render: (props?: { preferredSectionId?: string | undefined }) => ReactNode
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** dsh-im's optional client panel service; absent without the IM plugin. */
    dshImClient?: DshImClient | undefined
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The IM connector rail shortcut's copy. */
    imConnector: ImConnectorKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'imConnector'

/**
 * Main-panel key the linked IM plugin registers (its `IM_MAIN_PANEL_ID`),
 * reused as this shortcut's list id so the sidebar drops the plugin's own row.
 */
const IM_MAIN_PANEL_ID = 'xmanrui-dsh-im'

/** The app mode that hosts the IM management panel. */
const IM_MODE: AppModeId = 'im'

/** Services required by the IM connector plugin. */
export const inject = ['slots', 'locale', 'layout']

/**
 * Client plugin body: register the dictionaries, then follow the IM plugin's
 * panel service with the rail shortcut and the mode page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-im-connector: dictionaries')

  // The panel renderer is the one fact this integration needs: without it
  // there is no interface to show, so neither the shortcut nor the page is
  // registered. The child fiber owns both registrations, so a dsh-im teardown
  // removes the product navigation with its panel.
  ctx.inject(['slots', 'layout', 'dshImClient'], (imCtx) => {
    const im = imCtx.dshImClient
    if (im === undefined || im.version !== 1) {
      return
    }
    imCtx.slots.inject('mode.page', () => imCtx.slots.register({
      name: 'mode.page',
      key: IM_MODE,
      inject: (): ImModePageInjected => ({ renderPanel: () => im.render() }),
    }, ImModePage))
    imCtx.slots.inject('mode.rail.panel', () => imCtx.slots.register({
      name: 'mode.rail.panel',
      id: IM_MAIN_PANEL_ID,
      // The rail's foot cluster is Settings-first; later panel shortcuts order
      // above this one in ascending order.
      order: 10,
      locale: NS,
      inject: (): ImConnectorEntryInjected => ({
        mode: IM_MODE,
        selectMode: () => { imCtx.layout.setMode(IM_MODE) },
      }),
    }, ImConnectorEntry))
  })
}
