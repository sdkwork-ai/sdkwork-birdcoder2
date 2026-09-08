/**
 * Automation mode plugin, browser half: registers its quick entry into the
 * sidebar shell's `sidebar.actions` list seat (declared by ui-sidebar) and
 * its page into the keyed `mode.page` seat (declared by ui-layout's frame),
 * keyed by the `automation` mode id. The mode is an independent module:
 * glyphs, copy, and page live here and can grow the real scheduled/triggered
 * task capability without touching the sidebar shell, the rail, or the frame.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the sidebar actions seat contract (ui-sidebar's declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AutomationAction, type AutomationActionInjected } from './AutomationAction.tsx'
import { AutomationPage, type AutomationPageInjected } from './AutomationPage.tsx'
import { en, zh, type AutomationKey } from './locales.ts'

export type {
  AutomationActionInjected, AutomationActionProps,
} from './AutomationAction.tsx'
export type {
  AutomationPageInjected, AutomationPageProps,
} from './AutomationPage.tsx'
export type { AutomationKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Automation mode's copy (sidebar entry + page). */
    automation: AutomationKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'automation'

/** Services required by the Automation mode plugin. */
export const inject = ['slots', 'locale', 'layout']

/**
 * Client plugin body: register the sidebar entry and the page, each once its
 * slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-automation: dictionaries')

  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions',
    id: 'sdkwork-automation',
    // Behind Pull Request, ahead of the market entry.
    order: 30,
    locale: NS,
    inject: (): AutomationActionInjected => ({
      // Open Automation as an overlay inside the code surface: the rail
      // selection stays `code`, so the code rail entry keeps its highlight
      // while the automation page renders in the center column.
      setMode: () => { ctx.layout.openPanel('automation') },
    }),
  }, AutomationAction))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'automation',
    locale: NS,
    inject: (): AutomationPageInjected => ({ mode: 'automation' }),
  }, AutomationPage))
}
