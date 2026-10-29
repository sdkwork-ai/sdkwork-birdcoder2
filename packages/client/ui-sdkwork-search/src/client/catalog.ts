/**
 * The Search page's local capability catalog: the product surfaces the rail can
 * switch to, resolved from this plugin's locale dictionaries and handed to the
 * SDKWork search pipeline as documents. A surface joins the catalog only while
 * its keyed `mode.page` entry is registered, so a deployment that drops a mode
 * plugin never offers a dead search result; Code is always present because the
 * frame's main panel owns that surface instead of a keyed page.
 *
 * Every document carries the destination it opens (`metadata.mode` plus the
 * in-memory map). Remote SDKWork documents are resolved against the same map's
 * mode set, so a backend hit can only navigate to a surface this client can
 * actually render.
 */
import type { AppModeId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SearchKey } from './locales.ts'

/** Result group a catalog entry belongs to. */
export type SearchCatalogGroup = 'navigation' | 'creation' | 'platform'

/** Locale key naming one catalog group's result section. */
export const SEARCH_GROUP_KEYS: Readonly<Record<SearchCatalogGroup, SearchKey>> = {
  navigation: 'group.navigation',
  creation: 'group.creation',
  platform: 'group.platform',
}

/** Group paint order: navigation first, then creation surfaces, then platform tools. */
const GROUP_ORDER: Readonly<Record<SearchCatalogGroup, number>> = {
  navigation: 0,
  creation: 1,
  platform: 2,
}

/** One product surface the local catalog offers as a search result. */
export interface SearchCatalogEntry {
  /** The frame mode the result switches to. */
  readonly mode: AppModeId
  /** Locale key of the result title. */
  readonly titleKey: SearchKey
  /** Locale key of the one-line result description. */
  readonly descriptionKey: SearchKey
  /** The result section the entry is grouped under. */
  readonly group: SearchCatalogGroup
}

/** The shipped catalog, in result order. */
export const SEARCH_CATALOG: readonly SearchCatalogEntry[] = [
  { mode: 'code', titleKey: 'catalog.code', descriptionKey: 'catalog.code.description', group: 'navigation' },
  { mode: 'chat', titleKey: 'catalog.chat', descriptionKey: 'catalog.chat.description', group: 'navigation' },
  { mode: 'contacts', titleKey: 'catalog.contacts', descriptionKey: 'catalog.contacts.description', group: 'navigation' },
  { mode: 'video', titleKey: 'catalog.video', descriptionKey: 'catalog.video.description', group: 'creation' },
  { mode: 'image', titleKey: 'catalog.image', descriptionKey: 'catalog.image.description', group: 'creation' },
  { mode: 'knowledge', titleKey: 'catalog.knowledge', descriptionKey: 'catalog.knowledge.description', group: 'creation' },
  { mode: 'course', titleKey: 'catalog.course', descriptionKey: 'catalog.course.description', group: 'creation' },
  { mode: 'drive', titleKey: 'catalog.drive', descriptionKey: 'catalog.drive.description', group: 'creation' },
  { mode: 'assets', titleKey: 'catalog.assets', descriptionKey: 'catalog.assets.description', group: 'creation' },
  { mode: 'appstore', titleKey: 'catalog.appstore', descriptionKey: 'catalog.appstore.description', group: 'platform' },
  { mode: 'markets', titleKey: 'catalog.markets', descriptionKey: 'catalog.markets.description', group: 'platform' },
  { mode: 'template-library', titleKey: 'catalog.templateLibrary', descriptionKey: 'catalog.templateLibrary.description', group: 'platform' },
  { mode: 'demand-hall', titleKey: 'catalog.demandHall', descriptionKey: 'catalog.demandHall.description', group: 'platform' },
  { mode: 'automation', titleKey: 'catalog.automation', descriptionKey: 'catalog.automation.description', group: 'platform' },
  { mode: 'token-plan', titleKey: 'catalog.tokenPlan', descriptionKey: 'catalog.tokenPlan.description', group: 'platform' },
]

/** A document fed to the SDKWork search service (the `SdkworkSearchDocument` fields this page uses). */
export interface SearchDocument {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly group?: string
  readonly groupOrder?: number
  readonly order?: number
  readonly keywords?: readonly string[]
  readonly scope?: string
  readonly source?: string
  readonly capability?: string
  readonly kind?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** Where one result navigates, resolved when the catalog was built. */
export interface SearchDestination {
  /** The frame mode the result switches to. */
  readonly mode: AppModeId
}

/** The resolved local catalog. */
export interface SearchCatalog {
  /** Documents handed to the SDKWork search pipeline. */
  readonly documents: readonly SearchDocument[]
  /** Navigable destinations by document id. */
  readonly destinations: ReadonlyMap<string, SearchDestination>
  /**
   * Resolve a mode named by a catalog document or a remote document's
   * `metadata.mode` to a navigable destination.
   * @param mode - the raw mode id.
   * @returns the destination when this client can render that surface.
   */
  readonly destinationForMode: (mode: string) => SearchDestination | undefined
}

/**
 * Resolve the document id the catalog assigns one mode surface, so a caller can
 * address the same document the catalog builds.
 * @param mode - the frame mode id.
 * @returns the stable document id for that mode.
 */
export function searchDocumentId(mode: AppModeId): string {
  return `mode:${mode}`
}

/**
 * Build the local catalog from the plugin's locale dictionary.
 * @param t - the plugin's locale lookup for the `search` namespace.
 * @param isAvailable - whether a mode's keyed `mode.page` entry is registered.
 * @returns documents plus their destinations.
 */
export function buildSearchCatalog(
  t: (key: SearchKey) => string,
  isAvailable: (mode: AppModeId) => boolean,
): SearchCatalog {
  const documents: SearchDocument[] = []
  const destinations = new Map<string, SearchDestination>()
  const destinationsByMode = new Map<string, SearchDestination>()
  let order = 0
  for (const entry of SEARCH_CATALOG) {
    if (!isAvailable(entry.mode)) continue
    const id = searchDocumentId(entry.mode)
    const destination: SearchDestination = { mode: entry.mode }
    documents.push({
      id,
      title: t(entry.titleKey),
      description: t(entry.descriptionKey),
      group: t(SEARCH_GROUP_KEYS[entry.group]),
      groupOrder: GROUP_ORDER[entry.group],
      order,
      keywords: [entry.mode],
      scope: 'app',
      source: 'birdcoder',
      capability: entry.group,
      kind: 'mode',
      metadata: { mode: entry.mode },
    })
    destinations.set(id, destination)
    destinationsByMode.set(entry.mode, destination)
    order += 1
  }
  return {
    documents,
    destinations,
    destinationForMode: mode => destinationsByMode.get(mode),
  }
}
