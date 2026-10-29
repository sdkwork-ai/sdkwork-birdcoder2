/**
 * SDKWork Search runtime spec: the local catalog query answers without a
 * gateway, a credentialed deployment merges the SDKWork index through the
 * generated app SDK transport, the wire payload is normalized at that boundary,
 * and a failing index degrades the outcome instead of failing the query.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSearchCatalog, SEARCH_CATALOG } from '../src/client/catalog.ts'
import { zh, type SearchKey } from '../src/client/locales.ts'
import { createSearchRuntime, type SearchRuntimeOptions } from '../src/client/searchRuntime.ts'

/** Locale lookup over the shipped dictionary. */
const t = (key: SearchKey): string => zh[key]

/** Every registered mode page id (the full shipped composition). */
const allModes = new Set<string>(['code', ...SEARCH_CATALOG.map(entry => entry.mode)])

/**
 * Build runtime options over the shipped catalog.
 * @param overrides - environment and IAM stand-ins for the case under test.
 * @returns runtime options pointing at the local catalog.
 */
function options(overrides: Partial<SearchRuntimeOptions> = {}): SearchRuntimeOptions {
  const catalog = buildSearchCatalog(t, mode => allModes.has(mode))
  return {
    env: { apiBaseUrl: () => '', accessToken: () => '' },
    iam: { controller: { getState: () => ({ session: null }) } },
    catalog: () => catalog,
    ...overrides,
  }
}

/** A signed-in deployment with a gateway, so the runtime also queries the index. */
function credentialed(): Partial<SearchRuntimeOptions> {
  return {
    env: { apiBaseUrl: () => 'https://search.example', accessToken: () => 'access-token' },
    iam: { controller: { getState: () => ({ session: { accessToken: 'access-token' } }) } },
  }
}

/** One SDKWork v3 envelope carrying a single indexed hit plus one malformed row. */
const remotePayload = {
  code: 0,
  data: {
    items: [
      {
        document: {
          id: 'docs:alpha',
          title: 'Alpha guide',
          group: 'Docs',
          groupOrder: 1,
          metadata: { mode: 'assets' },
        },
        matchedOn: 'title',
        score: 160,
      },
      // Malformed: no title, so the boundary drops it instead of rendering it.
      { document: { id: 'docs:broken' }, matchedOn: 'title', score: 10 },
    ],
    pageInfo: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
    q: 'alpha',
  },
}

/**
 * Stub the browser transport with one JSON envelope.
 * @param payload - the envelope body the generated client receives.
 * @returns the fetch mock.
 */
function stubFetch(payload: unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SDKWork search runtime', () => {
  it('answers from the local catalog without a gateway', async () => {
    const outcome = await createSearchRuntime(options()).run('assets')
    expect(outcome.degraded).toBe(false)
    expect(outcome.total).toBe(1)
    expect(outcome.groups[0]?.heading).toBe(zh['group.creation'])
    expect(outcome.groups[0]?.results[0]).toMatchObject({
      id: 'mode:assets',
      title: zh['catalog.assets'],
      origin: 'local',
      destination: { mode: 'assets' },
    })
  })

  it('resolves a blank query to an empty outcome', async () => {
    const outcome = await createSearchRuntime(options()).run('   ')
    expect(outcome).toEqual({ groups: [], total: 0, degraded: false })
  })

  it('merges the SDKWork index through the generated app client', async () => {
    const fetchMock = stubFetch(remotePayload)
    const outcome = await createSearchRuntime(options(credentialed())).run('alpha')

    expect(outcome.degraded).toBe(false)
    expect(outcome.total).toBe(1)
    const [remoteGroup] = outcome.groups
    expect(remoteGroup?.heading).toBe('Docs')
    expect(remoteGroup?.results[0]).toEqual({
      id: 'docs:alpha',
      title: 'Alpha guide',
      origin: 'remote',
      destination: { mode: 'assets' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/search/queries')
    const body = init.body
    expect(JSON.parse(typeof body === 'string' ? body : 'null')).toMatchObject({ q: 'alpha' })
  })

  it('degrades to local results when the index is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const outcome = await createSearchRuntime(options(credentialed())).run('assets')
    expect(outcome.degraded).toBe(true)
    expect(outcome.total).toBe(1)
    expect(outcome.groups[0]?.results[0]?.origin).toBe('local')
  })

  it('keeps a remote hit without a catalog mode as text only', async () => {
    stubFetch({
      code: 0,
      data: {
        items: [{ document: { id: 'docs:beta', title: 'Beta note' }, matchedOn: 'title', score: 10 }],
        pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        q: 'beta',
      },
    })
    const outcome = await createSearchRuntime(options(credentialed())).run('beta')
    expect(outcome.total).toBe(1)
    expect(outcome.groups[0]?.results[0]).toEqual({ id: 'docs:beta', title: 'Beta note', origin: 'remote' })
  })
})
