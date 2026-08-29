/**
 * Common app-header plugin, browser half: occupies the frame's
 * `shell.app-header` seat with a drag-region title bar for every non-code mode.
 * Code mode keeps the conversation session header; all sidebar-launched modules
 * (video, image, app store, knowledge base, drive, assets, token plan, account)
 * render beneath this bar so desktop window controls no longer overlap content.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the shell.app-header slot declaration (declared by ui-layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AppHeader, type AppHeaderInjected } from './AppHeader.tsx'
import { en, zh, type AppHeaderKey } from './locales.ts'
import { platformOf } from './platform.ts'

export type { AppHeaderInjected, AppHeaderProps } from './AppHeader.tsx'
export type { AppHeaderKey } from './locales.ts'
export type { AppHeaderMode, AppHeaderPlatform } from './platform.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shared app-header copy (module titles). */
    appHeader: AppHeaderKey
  }
  interface SlotMap {
    /**
     * Optional keyed leading chrome per non-code mode (icon, badge). The
     * header dispatches by the active mode id; absent a contribution the seat
     * renders empty and the title stands alone.
     */
    'shell.app-header.leading': { kind: 'keyed'; scope: 'root' }
    /**
     * Additive trailing actions beside the window-control spacer (refresh,
     * help, mode-specific utilities).
     */
    'shell.app-header.actions': { kind: 'list'; scope: 'root' }
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'appHeader'

/** Services required by the common app-header plugin. */
export const inject = ['slots', 'locale']

/** Whether the desktop preload exposes the window-controls surface. */
function hasWindowControls(): boolean {
  return (globalThis as { desktopBridge?: { windowControls?: unknown } })
    .desktopBridge?.windowControls !== undefined
}

/**
 * Client plugin body: register the shared app header once its slot declaration
 * is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-common-app-header: dictionaries')

  const injectHeader = (): AppHeaderInjected => ({
    hasWindowControls: hasWindowControls(),
    platform: platformOf(),
  })

  ctx.slots.inject('shell.app-header', () => ctx.slots.register({
    name: 'shell.app-header',
    locale: NS,
    children: {
      'shell.app-header.leading': { kind: 'keyed', scope: 'root' },
      'shell.app-header.actions': { kind: 'list', scope: 'root' },
    },
    inject: injectHeader,
  }, AppHeader))
}
