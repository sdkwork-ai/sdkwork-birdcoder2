/**
 * Search catalog spec: the locale-resolved documents, the live-surface filter,
 * and the destination map the runtime resolves hits against.
 */
import { describe, expect, it } from 'vitest'
import { buildSearchCatalog, SEARCH_CATALOG, searchDocumentId } from '../src/client/catalog.ts'
import { zh, type SearchKey } from '../src/client/locales.ts'

/** Locale lookup over the shipped dictionary. */
const t = (key: SearchKey): string => zh[key]

/** Every registered mode page id (the full shipped composition). */
const allModes = new Set<string>(['code', ...SEARCH_CATALOG.map(entry => entry.mode)])

describe('search catalog', () => {
  it('builds one document and destination per catalog entry', () => {
    const catalog = buildSearchCatalog(t, mode => allModes.has(mode))
    expect(catalog.documents).toHaveLength(SEARCH_CATALOG.length)
    const assets = catalog.documents.find(document => document.id === searchDocumentId('assets'))
    expect(assets?.title).toBe(zh['catalog.assets'])
    expect(assets?.description).toBe(zh['catalog.assets.description'])
    expect(assets?.group).toBe(zh['group.creation'])
    expect(assets?.keywords).toEqual(['assets'])
    expect(assets?.metadata).toEqual({ mode: 'assets' })
    expect(catalog.destinations.get('mode:assets')).toEqual({ mode: 'assets' })
    expect(catalog.destinationForMode('assets')).toEqual({ mode: 'assets' })
  })

  it('drops modes whose page is not registered and keeps Code', () => {
    const live = new Set<string>(['code', 'assets'])
    const catalog = buildSearchCatalog(t, mode => live.has(mode))
    expect(catalog.documents.map(document => document.id)).toEqual(['mode:code', 'mode:assets'])
    expect(catalog.destinationForMode('drive')).toBeUndefined()
  })

  it('offers no destination for a mode outside the catalog', () => {
    const catalog = buildSearchCatalog(t, () => true)
    expect(catalog.destinationForMode('account')).toBeUndefined()
  })
})
