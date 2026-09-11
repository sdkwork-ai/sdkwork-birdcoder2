/**
 * Window-title plugin, browser half: occupies the frame's `shell.window-title`
 * seat in every non-code mode and projects that mode's name into the document
 * title. The desktop shell's window is natively framed, so the module title
 * belongs to that title bar rather than to an in-page bar of its own; the web
 * composition reaches the same projection through the browser tab.
 *
 * The package name predates the arrangement — it owns the copy the shell's
 * header shows, and the header is now the host window's chrome.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the shell.window-title slot declaration (declared by ui-layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { WindowTitle } from './WindowTitle.tsx'
import { en, zh, type AppHeaderKey } from './locales.ts'

export type { WindowTitleProps } from './WindowTitle.tsx'
export type { WindowTitleMode } from './mode-titles.ts'
export type { AppHeaderKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Module names the shell shows in the host window's title (non-code modes). */
    appHeader: AppHeaderKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'appHeader'

/** Services required by the window-title plugin. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the window-title projection into the frame's
 * seat once that seat is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-common-app-header: dictionaries')

  ctx.slots.inject('shell.window-title', () => ctx.slots.register({
    name: 'shell.window-title',
    locale: NS,
  }, WindowTitle))
}
