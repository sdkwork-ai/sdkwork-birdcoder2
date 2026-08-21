/**
 * Assets mode plugin, browser half: registers its rail entry into
 * the keyed `mode.rail.entry` seat (declared by ui-sdkwork-app-modes' rail shell)
 * and its placeholder page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), both keyed by the `assets` mode id. The mode is an
 * independent module: glyphs, copy, and page live here and can grow into
 * the real Assets surface without touching the rail shell or the
 * frame.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the rail-entry slot contract (ui-sdkwork-app-modes' declaration) and
// the AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AssetsRailEntry, type AssetsRailEntryInjected } from './RailEntry.tsx'
import { AssetsPage, type AssetsPageInjected } from './AssetsPage.tsx'
import { en, zh, type AssetsKey } from './locales.ts'

export type {
  AssetsPageInjected, AssetsPageProps,
} from './AssetsPage.tsx'
export type {
  AssetsRailEntryInjected, AssetsRailEntryProps,
} from './RailEntry.tsx'
export type { AssetsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Assets mode's copy (rail entry + page). */
    assets: AssetsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'assets'

/** Services required by the Assets mode plugin. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the rail entry and the placeholder page, each
 * once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-assets: dictionaries')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'assets',
    locale: NS,
    inject: (): AssetsRailEntryInjected => ({ mode: 'assets' }),
  }, AssetsRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'assets',
    locale: NS,
    inject: (): AssetsPageInjected => ({ mode: 'assets' }),
  }, AssetsPage))
}
