/**
 * Deployed-applications inventory model: paging termination, the application
 * kind facet, recency ordering, and the `deploy_app` enum labels the settings
 * drawer renders. Pure functions, driven directly.
 */
import { describe, expect, it, vi } from 'vitest'
import type { AppKind, AppResponse, AppStatus } from '@sdkwork/deployments-app-sdk'
import {
  APP_KIND_LABEL_KEYS,
  APP_KIND_ORDER,
  APP_STATUS_LABEL_KEYS,
  OWNED_APPS_MAX_PAGES,
  OWNED_APPS_PAGE_SIZE,
  countAppKindFacets,
  filterAppsByKind,
  formatUpdatedAt,
  initialOf,
  loadOwnedApps,
  messageOf,
  sortAppsByUpdatedAt,
} from '../src/client/deployedApps.ts'
import type { DeployKey } from '../src/client/locales.ts'
import { en, zh } from '../src/client/locales.ts'

/** One `deploy_app` row with the fields the drawer reads. */
function app(over: {
  id?: string
  name?: string
  appKind?: AppKind
  appStatus?: AppStatus
  latestReleaseTag?: string
  updatedAt?: string
} = {}): AppResponse {
  return {
    id: over.id ?? 'app-1',
    name: over.name ?? 'Store',
    slug: 'store',
    appKind: over.appKind ?? 'SPA_WEB',
    appStatus: over.appStatus ?? 'ACTIVE',
    defaultEnvironment: 'production',
    ownerType: 'USER',
    tenantId: 'tenant-1',
    nginxConfigOverridden: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: over.updatedAt ?? '2026-01-02T00:00:00Z',
    version: '1',
    ...(over.latestReleaseTag === undefined ? {} : { latestReleaseTag: over.latestReleaseTag }),
  }
}

describe('loadOwnedApps', () => {
  it('accumulates pages until a short page ends the walk', async () => {
    const full = Array.from({ length: OWNED_APPS_PAGE_SIZE }, (_value, index) => app({ id: `a-${index}` }))
    const loadPage = vi.fn(async (page: number) => (
      page === 1 ? { items: full, pageInfo: { hasMore: true } } : { items: [app({ id: 'last' })], pageInfo: { hasMore: false } }
    ))
    const snapshot = await loadOwnedApps(loadPage)
    expect(loadPage).toHaveBeenCalledTimes(2)
    expect(snapshot.items).toHaveLength(OWNED_APPS_PAGE_SIZE + 1)
    expect(snapshot.truncated).toBe(false)
  })

  it('falls back to the short-page rule when the envelope forwards no pageInfo', async () => {
    const loadPage = vi.fn(async (page: number) => (
      page === 1 ? { items: [app({ id: 'a-1' })] } : { items: [] }
    ))
    const snapshot = await loadOwnedApps(loadPage)
    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.truncated).toBe(false)
  })

  it('terminates on an empty page and reports truncation at the page ceiling', async () => {
    const empty = await loadOwnedApps(async () => ({ items: [], pageInfo: { hasMore: true } }))
    expect(empty).toEqual({ items: [], truncated: false })

    const full = Array.from({ length: OWNED_APPS_PAGE_SIZE }, (_value, index) => app({ id: `a-${index}` }))
    const truncated = await loadOwnedApps(async () => ({ items: full, pageInfo: { hasMore: true } }))
    expect(truncated.items).toHaveLength(OWNED_APPS_PAGE_SIZE * OWNED_APPS_MAX_PAGES)
    expect(truncated.truncated).toBe(true)
  })
})

describe('countAppKindFacets', () => {
  it('counts every row per kind in the fixed facet order, keeping zero counts', () => {
    const facets = countAppKindFacets([
      app({ id: 'a-1', appKind: 'SPA_WEB' }),
      app({ id: 'a-2', appKind: 'SPA_WEB' }),
      app({ id: 'a-3', appKind: 'ANDROID_APP' }),
    ])
    expect(facets.map(facet => facet.appKind)).toEqual(APP_KIND_ORDER)
    expect(facets.find(facet => facet.appKind === 'SPA_WEB')?.count).toBe(2)
    expect(facets.find(facet => facet.appKind === 'ANDROID_APP')?.count).toBe(1)
    expect(facets.find(facet => facet.appKind === 'IOS_APP')?.count).toBe(0)
  })
})

describe('filterAppsByKind', () => {
  const rows = [
    app({ id: 'a-1', appKind: 'SPA_WEB' }),
    app({ id: 'a-2', appKind: 'ANDROID_APP' }),
    app({ id: 'a-3', appKind: 'SPA_WEB' }),
  ]

  it('treats an empty selection as no narrowing', () => {
    expect(filterAppsByKind(rows, new Set()).map(row => row.id)).toEqual(['a-1', 'a-2', 'a-3'])
  })

  it('keeps every selected kind (OR semantics)', () => {
    expect(filterAppsByKind(rows, new Set<AppKind>(['SPA_WEB'])).map(row => row.id)).toEqual(['a-1', 'a-3'])
    expect(filterAppsByKind(rows, new Set<AppKind>(['SPA_WEB', 'ANDROID_APP'])).map(row => row.id))
      .toEqual(['a-1', 'a-2', 'a-3'])
  })
})

describe('sortAppsByUpdatedAt', () => {
  it('orders newest first without mutating the input', () => {
    const rows = [
      app({ id: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
      app({ id: 'new', updatedAt: '2026-03-01T00:00:00Z' }),
      app({ id: 'broken', updatedAt: 'not-a-date' }),
    ]
    expect(sortAppsByUpdatedAt(rows).map(row => row.id)).toEqual(['new', 'old', 'broken'])
    expect(rows.map(row => row.id)).toEqual(['old', 'new', 'broken'])
  })

  it('treats a blank or malformed timestamp as the oldest row', () => {
    const rows = [
      app({ id: 'dated', updatedAt: '2026-01-01T00:00:00Z' }),
      { ...app({ id: 'blank' }), updatedAt: '' },
      { ...app({ id: 'broken' }), updatedAt: 'not-a-date' },
    ]
    expect(sortAppsByUpdatedAt(rows).map(row => row.id)).toEqual(['dated', 'blank', 'broken'])
  })
})

describe('formatUpdatedAt', () => {
  it('renders a stable UTC minute form', () => {
    expect(formatUpdatedAt('2026-03-01T08:09:10Z')).toBe('2026-03-01 08:09')
  })

  it('renders nothing for absent or invalid timestamps', () => {
    expect(formatUpdatedAt(undefined)).toBe('')
    expect(formatUpdatedAt('')).toBe('')
    expect(formatUpdatedAt('not-a-date')).toBe('')
  })
})

describe('initialOf', () => {
  it('uppercases the first code point and falls back for a blank name', () => {
    expect(initialOf('  store')).toBe('S')
    expect(initialOf('应用')).toBe('应')
    expect(initialOf('   ')).toBe('?')
  })
})

describe('messageOf', () => {
  it('prefers a non-empty error message and falls back to the string form', () => {
    expect(messageOf(new Error('boom'))).toBe('boom')
    expect(messageOf(new Error(''))).toBe('Error')
    expect(messageOf('failed')).toBe('failed')
  })
})

describe('deploy_app enum labels', () => {
  it('covers every kind and status with copy in both dictionaries', () => {
    expect(Object.keys(APP_KIND_LABEL_KEYS).sort()).toEqual([...APP_KIND_ORDER].sort())
    const keys = [
      ...Object.values(APP_KIND_LABEL_KEYS),
      ...Object.values(APP_STATUS_LABEL_KEYS),
    ] as DeployKey[]
    for (const key of keys) {
      expect(zh[key]).not.toBe('')
      expect(en[key]).not.toBe('')
    }
  })
})
