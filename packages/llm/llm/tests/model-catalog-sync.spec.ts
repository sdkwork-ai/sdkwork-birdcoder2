import { describe, expect, it, vi } from 'vitest'
import {
  MemoryCatalogPersistence,
  ModelCatalogStore,
  ModelCatalogSync,
  resolveEffectiveCatalog,
  type CatalogHttpRequest,
  type CatalogHttpResponse,
  type CatalogTransport,
  type ModelCatalogSnapshot,
} from '../src/index.ts'
import { makeDelta, makeModel, makeSnapshot } from './model-catalog-fixtures.ts'

const ENDPOINT = 'https://api.example.com/app/v3/api/ai/model_catalog'

type Handler = (request: CatalogHttpRequest) => CatalogHttpResponse | Promise<CatalogHttpResponse>

class ScriptedTransport implements CatalogTransport {
  readonly requests: CatalogHttpRequest[] = []

  constructor(private readonly handler: Handler) {}

  async send(request: CatalogHttpRequest): Promise<CatalogHttpResponse> {
    this.requests.push(request)
    return this.handler(request)
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): CatalogHttpResponse {
  return { status, headers, body: JSON.stringify(body) }
}

function page(revision: number, options: {
  models?: readonly ReturnType<typeof makeModel>[]
  cursor?: string | null
  hasMore?: boolean
} = {}): ModelCatalogSnapshot {
  return makeSnapshot(revision, {
    models: options.models ?? [makeModel('a/a')],
    pageInfo: {
      mode: 'cursor',
      pageSize: 2,
      nextCursor: options.cursor ?? null,
      hasMore: options.hasMore ?? false,
      totalItems: 1,
    },
  })
}

function makeSync(options: {
  handler: Handler
  store?: ModelCatalogStore
  persistence?: MemoryCatalogPersistence
  seed?: ModelCatalogSnapshot
  endpoint?: string
  pageSize?: number
  maxAttempts?: number
  sleep?: (milliseconds: number) => Promise<void>
  readToken?: () => string | undefined
  onStatus?: (status: ReturnType<ModelCatalogSync['status']>) => void
}) {
  const store = options.store ?? new ModelCatalogStore()
  const persistence = options.persistence ?? new MemoryCatalogPersistence()
  const transport = new ScriptedTransport(options.handler)
  const sync = new ModelCatalogSync({
    endpoint: options.endpoint ?? ENDPOINT,
    store,
    persistence,
    transport,
    pageSize: options.pageSize ?? 2,
    maxAttempts: options.maxAttempts ?? 1,
    sleep: options.sleep ?? (async () => {}),
    ...(options.seed === undefined ? {} : { readSeed: () => options.seed }),
    ...(options.readToken === undefined ? {} : { readToken: options.readToken }),
    ...(options.onStatus === undefined ? {} : { onStatus: options.onStatus }),
  })
  return { sync, store, persistence, transport }
}

describe('model catalog sync', () => {
  it('assembles a paged cold snapshot and persists it', async () => {
    const { sync, store, persistence } = makeSync({
      handler: (request) => {
        const url = new URL(request.url)
        if (url.searchParams.get('cursor') === 'c2') {
          return json(200, page(5, { models: [makeModel('a/b')] }), { etag: '"mcat-5-dead"' })
        }
        return json(200, page(5, { models: [makeModel('a/a')], cursor: 'c2', hasMore: true }), { etag: '"mcat-5-dead"' })
      },
    })
    const result = await sync.syncNow()
    expect(result).toEqual({ status: 'applied', revision: 5, delta: false })
    expect(store.view?.snapshot.models?.map(model => model.catalogKey)).toEqual(['a/a', 'a/b'])
    expect(store.view?.source).toBe('backend')
    await expect(persistence.load()).resolves.toMatchObject({ snapshot: { revision: 5 }, etag: '"mcat-5-dead"' })
    expect(sync.status()).toMatchObject({ state: 'current', revision: 5, etag: '"mcat-5-dead"' })
  })

  it('returns not-modified when the delta endpoint answers 304', async () => {
    let call = 0
    const { sync, transport } = makeSync({
      handler: () => {
        call += 1
        return call === 1 ? json(200, page(2), { etag: '"e2"' }) : { status: 304, headers: { etag: '"e2"' }, body: '' }
      },
    })
    await expect(sync.syncNow()).resolves.toEqual({ status: 'applied', revision: 2, delta: false })
    await expect(sync.syncNow()).resolves.toEqual({ status: 'not-modified', revision: 2 })
    expect(transport.requests[1]?.url).toContain('/changes?since_revision=2')
    expect(transport.requests[1]?.headers['if-none-match']).toBe('"e2"')
  })

  it('applies a delta and honors tombstones', async () => {
    let call = 0
    const { sync, store } = makeSync({
      handler: () => {
        call += 1
        if (call === 1) return json(200, page(2, { models: [makeModel('a/a'), makeModel('a/b')] }), { etag: '"e2"' })
        return json(200, makeDelta(2, 3, {
          models: [makeModel('a/b', { displayName: 'B2' })],
          tombstones: [{ catalogKey: 'a/a', revision: 3, removedAt: '2026-11-15T09:30:00Z' }],
        }), { etag: '"e3"' })
      },
    })
    await sync.syncNow()
    await expect(sync.syncNow()).resolves.toEqual({ status: 'applied', revision: 3, delta: true })
    expect(store.view?.snapshot.models?.map(model => model.catalogKey)).toEqual(['a/b'])
    expect(store.view?.snapshot.models?.[0]?.displayName).toBe('B2')
  })

  it('falls back to a full snapshot on a revision gap', async () => {
    let call = 0
    const { sync, store } = makeSync({
      handler: () => {
        call += 1
        if (call === 1) return json(200, page(2), { etag: '"e2"' })
        if (call === 2) return { status: 409, headers: {}, body: '{"code":"model_catalog.revision_gap"}' }
        return json(200, page(6, { models: [makeModel('a/z')] }), { etag: '"e6"' })
      },
    })
    await sync.syncNow()
    await expect(sync.syncNow()).resolves.toEqual({ status: 'applied', revision: 6, delta: false })
    expect(store.view?.snapshot.models?.map(model => model.catalogKey)).toEqual(['a/z'])
  })

  it('applies a paged delta across revisions', async () => {
    let call = 0
    const { sync, store } = makeSync({
      handler: () => {
        call += 1
        if (call === 1) return json(200, page(2), { etag: '"e2"' })
        if (call === 2) return json(200, makeDelta(2, 3, { models: [makeModel('a/b')], hasMore: true, nextSinceRevision: 3 }), { etag: '"e3"' })
        return json(200, makeDelta(3, 4, { models: [makeModel('a/c')] }), { etag: '"e4"' })
      },
    })
    await sync.syncNow()
    await expect(sync.syncNow()).resolves.toEqual({ status: 'applied', revision: 4, delta: true })
    expect(store.view?.snapshot.models?.map(model => model.catalogKey)).toEqual(['a/a', 'a/b', 'a/c'])
  })

  it('restarts pagination when the revision changes mid-way', async () => {
    let call = 0
    const { sync, store } = makeSync({
      handler: (request) => {
        call += 1
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (call === 1) return json(200, page(2, { cursor: 'c1', hasMore: true }))
        if (call === 2) return json(200, page(3, { models: [makeModel('a/b')] }))
        if (cursor === 'c1' || call === 3) return json(200, page(3, { cursor: 'c1b', hasMore: true }))
        return json(200, page(3, { models: [makeModel('a/b')] }))
      },
    })
    await expect(sync.syncNow()).resolves.toEqual({ status: 'applied', revision: 3, delta: false })
    expect(call).toBe(4)
    expect(store.view?.snapshot.revision).toBe(3)
  })

  it('replaces a seed whose revision equals the first backend revision', async () => {
    const seed = makeSnapshot(1, { models: [makeModel('seed/model')] })
    const { sync, store } = makeSync({
      seed,
      handler: () => json(200, page(1, { models: [makeModel('a/backend')] })),
    })
    await sync.hydrate()
    await expect(sync.syncNow()).resolves.toEqual({ status: 'applied', revision: 1, delta: false })
    expect(store.view?.source).toBe('backend')
    expect(store.view?.snapshot.models?.map(model => model.catalogKey)).toEqual(['a/backend'])
  })

  it('keeps the seed and publishes nothing when the backend catalog is empty', async () => {
    const seed = makeSnapshot(1, { models: [makeModel('seed/model')] })
    const { sync, store } = makeSync({
      seed,
      handler: () => json(200, page(2, { models: [] })),
    })
    await sync.hydrate()
    const result = await sync.syncNow()
    expect(result).toEqual({ status: 'empty', revision: 1 })
    expect(store.view?.snapshot).toEqual(seed)
    expect(resolveEffectiveCatalog({ seed, remote: store.view?.snapshot })?.snapshot).toEqual(seed)
  })

  it('keeps the last known good catalog when every request fails', async () => {
    const seed = makeSnapshot(1, { models: [makeModel('seed/model')] })
    const { sync, store } = makeSync({
      seed,
      handler: () => {
        throw new Error('network down')
      },
    })
    const result = await sync.syncNow()
    expect(result).toMatchObject({ status: 'failed', code: 'model_catalog.transport_failed' })
    expect(store.view?.snapshot).toEqual(seed)
    expect(sync.status().state).toBe('offline')
    expect(sync.status().lastErrorCode).toBe('model_catalog.transport_failed')
  })

  it('retries a retryable status and honors Retry-After', async () => {
    const sleeps: number[] = []
    let call = 0
    const { sync, transport } = makeSync({
      maxAttempts: 2,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds)
      },
      handler: () => {
        call += 1
        return call === 1
          ? { status: 503, headers: { 'retry-after': '2' }, body: '' }
          : json(200, page(2))
      },
    })
    await expect(sync.syncNow()).resolves.toEqual({ status: 'applied', revision: 2, delta: false })
    expect(transport.requests).toHaveLength(2)
    expect(sleeps).toEqual([2000])
  })

  it('sends the bearer credential and shares one concurrent attempt', async () => {
    const handler = vi.fn(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 5))
      return json(200, page(2))
    })
    const { sync, transport } = makeSync({
      handler,
      readToken: () => 'token-1',
    })
    const first = sync.syncNow()
    const second = sync.syncNow()
    const [left, right] = await Promise.all([first, second])
    expect(left).toEqual({ status: 'applied', revision: 2, delta: false })
    expect(right).toEqual(left)
    expect(transport.requests).toHaveLength(1)
    expect(transport.requests[0]?.headers.authorization).toBe('Bearer token-1')
  })

  it('hydrates from persistence before any network call', async () => {
    const snapshot = makeSnapshot(7, { models: [makeModel('a/persisted')] })
    const persistence = new MemoryCatalogPersistence({ snapshot, etag: '"e7"' })
    const { sync, store, transport } = makeSync({
      handler: () => json(200, page(8)),
      persistence,
    })
    await sync.hydrate()
    expect(store.view?.snapshot.revision).toBe(7)
    expect(store.view?.source).toBe('backend')
    expect(sync.status().etag).toBe('"e7"')
    expect(transport.requests).toHaveLength(0)
  })

  it('reports a version-unsupported response as a degraded failure', async () => {
    const { sync, store } = makeSync({
      handler: () => json(422, { code: 'model_catalog.version_unsupported' }),
    })
    const result = await sync.syncNow()
    expect(result).toEqual({
      status: 'failed',
      code: 'model_catalog.version_unsupported',
      message: expect.any(String),
    })
    expect(sync.status().state).toBe('degraded')
    expect(store.view).toBeUndefined()
  })

  it('does not sync after dispose', async () => {
    const { sync } = makeSync({ handler: () => json(200, page(2)) })
    sync.dispose()
    await expect(sync.syncNow()).resolves.toEqual({
      status: 'failed',
      code: 'model_catalog.unavailable',
      message: 'model catalog sync is disposed',
    })
  })
})
