/**
 * The settings-menu drawer's scaffold-inventory model: the page walk with its
 * ceiling, the status facet counts and OR filter, the recency ordering, the
 * latest-version resolution, and the install-count display rule. The component
 * spec drives the same functions through the rendered tab.
 */
import { describe, expect, it, vi } from 'vitest'
import type { ApplicationScaffoldResponse } from '@sdkwork/deployments-app-sdk'
import {
  OWNED_TEMPLATES_MAX_PAGES,
  OWNED_TEMPLATES_PAGE_SIZE,
  countScaffoldStatusFacets,
  filterScaffoldsByStatus,
  hasInstallCount,
  latestScaffoldVersion,
  loadOwnedScaffolds,
  resolveScaffoldVersions,
  sortScaffoldsByUpdatedAt,
  type ScaffoldStatus,
} from '../src/client/deployedScaffolds.ts'

/** One listing row as the deployments client returns it. */
function scaffold(over: Partial<ApplicationScaffoldResponse> = {}): ApplicationScaffoldResponse {
  return {
    id: 'tpl-1',
    templateKey: 'starter-app',
    displayName: 'Starter App',
    summary: '',
    description: '',
    appUuid: 'app-1',
    templateType: 'APP',
    categoryUuid: 'category-1',
    authorUserId: 'user-1',
    visibility: 'PRIVATE',
    pricingModel: 'FREE',
    priceMinor: '0',
    currency: 'CNY',
    status: 'PUBLISHED',
    isFeatured: false,
    installCount: '0',
    viewCount: '0',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    version: '1',
    ...over,
  }
}

/** A full page of distinct rows. */
function fullPage(prefix: string): ApplicationScaffoldResponse[] {
  return Array.from(
    { length: OWNED_TEMPLATES_PAGE_SIZE },
    (_unused, index) => scaffold({ id: `${prefix}-${index}`, displayName: `${prefix} ${index}` }),
  )
}

describe('loadOwnedScaffolds', () => {
  it('walks every page the server still has', async () => {
    const loadPage = vi.fn(async (page: number) => ({
      items: [scaffold({ id: `t-${page}` })],
      pageInfo: { hasMore: page < 2 },
    }))
    const snapshot = await loadOwnedScaffolds(loadPage)
    expect(snapshot.items.map(row => row.id)).toEqual(['t-1', 't-2'])
    expect(snapshot.truncated).toBe(false)
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('stops on an empty page and never asks for another one', async () => {
    const loadPage = vi.fn(async () => ({ items: [], pageInfo: { hasMore: true } }))
    await expect(loadOwnedScaffolds(loadPage)).resolves.toEqual({ items: [], truncated: false })
    expect(loadPage).toHaveBeenCalledTimes(1)
  })

  it('falls back to the short-page rule when the wrapper forwards no pageInfo', async () => {
    const loadPage = vi.fn(async (page: number) => ({
      items: page === 1 ? fullPage('first') : [],
    }))
    const snapshot = await loadOwnedScaffolds(loadPage)
    expect(snapshot.items).toHaveLength(OWNED_TEMPLATES_PAGE_SIZE)
    expect(snapshot.truncated).toBe(false)
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('reports truncation at the page ceiling while the server still has rows', async () => {
    const loadPage = vi.fn(async (page: number) => ({
      items: fullPage(`page-${page}`),
      pageInfo: { hasMore: true },
    }))
    const snapshot = await loadOwnedScaffolds(loadPage)
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.items).toHaveLength(OWNED_TEMPLATES_PAGE_SIZE * OWNED_TEMPLATES_MAX_PAGES)
    expect(loadPage).toHaveBeenCalledTimes(OWNED_TEMPLATES_MAX_PAGES)
  })
})

describe('countScaffoldStatusFacets', () => {
  it('counts every status in facet display order and keeps zero-count statuses', () => {
    const facets = countScaffoldStatusFacets([
      scaffold({ id: 'a', status: 'PUBLISHED' }),
      scaffold({ id: 'b', status: 'PUBLISHED' }),
      scaffold({ id: 'c', status: 'REJECTED' }),
      scaffold({ id: 'd', status: 'PUBLISHED' }),
    ])
    expect(facets).toEqual([
      { status: 'PUBLISHED', count: 3 },
      { status: 'PENDING_REVIEW', count: 0 },
      { status: 'DRAFT', count: 0 },
      { status: 'REJECTED', count: 1 },
      { status: 'DISABLED', count: 0 },
    ])
  })
})

describe('filterScaffoldsByStatus', () => {
  const rows = [
    scaffold({ id: 'published', status: 'PUBLISHED' }),
    scaffold({ id: 'draft', status: 'DRAFT' }),
  ]

  it('returns a copy of every row for an empty selection', () => {
    const visible = filterScaffoldsByStatus(rows, new Set())
    expect(visible).toEqual(rows)
    expect(visible).not.toBe(rows)
  })

  it('selects by status with OR semantics', () => {
    expect(filterScaffoldsByStatus(rows, new Set<ScaffoldStatus>(['DRAFT'])).map(row => row.id))
      .toEqual(['draft'])
    expect(filterScaffoldsByStatus(rows, new Set<ScaffoldStatus>(['PUBLISHED', 'DRAFT'])))
      .toHaveLength(2)
  })
})

describe('sortScaffoldsByUpdatedAt', () => {
  it('orders newest first and tolerates malformed timestamps', () => {
    const sorted = sortScaffoldsByUpdatedAt([
      scaffold({ id: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
      scaffold({ id: 'broken', updatedAt: 'not a date' }),
      scaffold({ id: 'new', updatedAt: '2026-03-01T00:00:00Z' }),
      scaffold({ id: 'missing', updatedAt: '' }),
    ])
    expect(sorted.map(row => row.id)).toEqual(['new', 'old', 'broken', 'missing'])
  })
})

describe('latestScaffoldVersion', () => {
  it('matches the version the listing points at', () => {
    expect(latestScaffoldVersion('v-2', {
      items: [{ id: 'v-2', templateVersion: ' 2.1.0 ' }, { id: 'v-1', templateVersion: '1.0.0' }],
    })).toBe('2.1.0')
  })

  it('falls back to the page’s first version when the pointer is absent from it', () => {
    expect(latestScaffoldVersion('v-9', {
      items: [{ id: 'v-2', templateVersion: '2.1.0' }],
    })).toBe('2.1.0')
  })

  it('reports no version without a pointer or a page', () => {
    expect(latestScaffoldVersion(undefined, { items: [{ id: 'v-1', templateVersion: '1.0.0' }] }))
      .toBeUndefined()
    expect(latestScaffoldVersion('v-1', undefined)).toBeUndefined()
  })

  it('reports no version when the page carries an empty or missing number', () => {
    expect(latestScaffoldVersion('v-1', { items: [] })).toBeUndefined()
    expect(latestScaffoldVersion('v-1', { items: [{ id: 'v-1' }] })).toBeUndefined()
    expect(latestScaffoldVersion('v-1', { items: [{ id: 'v-1', templateVersion: '   ' }] })).toBeUndefined()
  })
})

describe('resolveScaffoldVersions', () => {
  it('resolves each listing and skips one without a latest-version pointer', async () => {
    const loadVersions = vi.fn(async (templateId: string) => ({
      items: [{ id: `${templateId}-version`, templateVersion: '3.0.0' }],
    }))
    const versions = await resolveScaffoldVersions([
      scaffold({ id: 'with-version', latestVersionUuid: 'with-version-version' }),
      scaffold({ id: 'without-version' }),
    ], loadVersions)
    expect(versions).toEqual({ 'with-version': '3.0.0' })
    expect(loadVersions).toHaveBeenCalledTimes(1)
    expect(loadVersions).toHaveBeenCalledWith('with-version', undefined)
  })

  it('omits a listing whose version page carries no semantic version', async () => {
    const versions = await resolveScaffoldVersions([
      scaffold({ id: 'blank', latestVersionUuid: 'blank-version' }),
    ], async () => ({ items: [{ id: 'blank-version', templateVersion: '   ' }] }))
    expect(versions).toEqual({})
  })

  it('stops reading when the caller has already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const loadVersions = vi.fn(async () => ({ items: [{ id: 'version-1', templateVersion: '1.0.0' }] }))
    const versions = await resolveScaffoldVersions([
      scaffold({ id: 'tpl-1', latestVersionUuid: 'version-1' }),
    ], loadVersions, { signal: controller.signal })
    expect(versions).toEqual({})
    expect(loadVersions).not.toHaveBeenCalled()
  })

  it('hands the caller’s signal to every version read', async () => {
    const controller = new AbortController()
    const loadVersions = vi.fn(async (_templateId: string, _signal?: AbortSignal) => ({
      items: [{ id: 'version-1', templateVersion: '1.0.0' }],
    }))
    await resolveScaffoldVersions([
      scaffold({ id: 'tpl-1', latestVersionUuid: 'version-1' }),
    ], loadVersions, { signal: controller.signal })
    expect(loadVersions).toHaveBeenCalledWith('tpl-1', controller.signal)
  })

  it('keeps the other listings when one version read fails', async () => {
    const versions = await resolveScaffoldVersions([
      scaffold({ id: 'broken', latestVersionUuid: 'broken-version' }),
      scaffold({ id: 'ok', latestVersionUuid: 'ok-version' }),
    ], async (templateId) => {
      if (templateId === 'broken') throw new Error('offline')
      return { items: [{ id: 'ok-version', templateVersion: '1.4.2' }] }
    })
    expect(versions).toEqual({ ok: '1.4.2' })
  })

  it('bounds how many version reads run at once for a large account', async () => {
    let inFlight = 0
    let peak = 0
    const rows = Array.from(
      { length: 10 },
      (_unused, index) => scaffold({ id: `tpl-${index}`, latestVersionUuid: `version-${index}` }),
    )
    const versions = await resolveScaffoldVersions(rows, async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      await Promise.resolve()
      inFlight -= 1
      return { items: [{ id: 'unknown', templateVersion: '1.0.0' }] }
    })
    expect(peak).toBe(4)
    expect(Object.keys(versions)).toHaveLength(10)
  })

  it('makes no version read for an empty set', async () => {
    const loadVersions = vi.fn(async () => ({ items: [] }))
    await expect(resolveScaffoldVersions([], loadVersions)).resolves.toEqual({})
    expect(loadVersions).not.toHaveBeenCalled()
  })
})

describe('hasInstallCount', () => {
  it('shows only a positive, parsable installation count', () => {
    expect(hasInstallCount('12')).toBe(true)
    expect(hasInstallCount('0')).toBe(false)
    expect(hasInstallCount('  ')).toBe(false)
    expect(hasInstallCount(undefined)).toBe(false)
    expect(hasInstallCount('many')).toBe(false)
    expect(hasInstallCount('Infinity')).toBe(false)
  })
})
