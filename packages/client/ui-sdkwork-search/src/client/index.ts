/**
 * Search mode plugin, browser half: registers its rail entry into the keyed
 * `mode.rail.entry` seat (declared by ui-sdkwork-app-modes' rail shell) and its
 * SDKWork Search-backed page into the keyed `mode.page` seat (declared by
 * ui-layout's frame), both keyed by the `search` mode id. The plugin owns the
 * SDKWork Search runtime, the locale-resolved local catalog, and result
 * navigation: a hit whose destination is a mode switches the frame through
 * `ctx.layout`, exactly like the rail does.
 *
 * The catalog is rebuilt per query from the registered `mode.page` keys, so a
 * deployment that drops a mode plugin neither offers nor navigates to a dead
 * surface; Code is always offered because the frame's main panel owns it.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the rail-entry slot contract (ui-sdkwork-app-modes' declaration) and
// the AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the slots Context merge (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.env and ctx.iam into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import { buildSearchCatalog } from './catalog.ts'
import {
  createSearchRuntime, type SearchResultItem, type SearchRuntimeIam,
} from './searchRuntime.ts'
import { SearchRailEntry, type SearchRailEntryInjected } from './RailEntry.tsx'
import { SearchPage, type SearchPageInjected } from './SearchPage.tsx'
import { en, zh, type SearchKey } from './locales.ts'

export type {
  SearchPageInjected, SearchPageProps,
} from './SearchPage.tsx'
export type {
  SearchRailEntryInjected, SearchRailEntryProps,
} from './RailEntry.tsx'
export type { SearchKey } from './locales.ts'
export type {
  SearchOutcome, SearchResultGroup, SearchResultItem, SearchResultOrigin, SearchRuntime,
} from './searchRuntime.ts'
export type {
  SearchCatalog, SearchCatalogEntry, SearchCatalogGroup, SearchDestination, SearchDocument,
} from './catalog.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Search mode's copy (rail entry, page chrome, local catalog). */
    search: SearchKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'search'

/** Services required by the Search mode plugin. */
export const inject = ['slots', 'locale', 'env', 'iam', 'layout']

/**
 * Client plugin body: register the rail entry and the page, each once its slot
 * declaration is on the ledger, and own the SDKWork Search runtime they read.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-search: dictionaries')

  // The frame renders `code` from its main panel and every other mode from a
  // keyed `mode.page` entry, so the live key set is exactly the catalog's
  // navigable surface set.
  const availableModes = (): ReadonlySet<string> => {
    const modes = new Set<string>(['code'])
    for (const entry of ctx.slots.entries('mode.page')) {
      if (entry.options.key !== undefined) modes.add(entry.options.key)
    }
    return modes
  }

  const runtime = createSearchRuntime({
    env: ctx.get('env') as EnvService,
    iam: ctx.get('iam') as SearchRuntimeIam,
    catalog: () => {
      const modes = availableModes()
      const t = ctx.locale.bind(NS)
      return buildSearchCatalog(key => t(key), (mode: AppModeId) => modes.has(mode))
    },
  })
  ctx.effect(() => () => { runtime.dispose() }, 'ui-sdkwork-search: SDKWork search runtime')

  ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
    name: 'mode.rail.entry',
    key: 'search',
    locale: NS,
    inject: (): SearchRailEntryInjected => ({ mode: 'search' }),
  }, SearchRailEntry))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'search',
    locale: NS,
    inject: (): SearchPageInjected => ({
      mode: 'search',
      runSearch: query => runtime.run(query),
      openResult: (result: SearchResultItem) => {
        if (result.destination !== undefined) ctx.layout.setMode(result.destination.mode)
      },
    }),
  }, SearchPage))
}
