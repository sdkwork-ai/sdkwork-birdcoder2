import { describe, expect, it, vi } from 'vitest'
import {
  CopyOnWriteCatalogPersistence,
  MemoryCatalogPersistence,
  ModelCatalogContractError,
  ModelCatalogStore,
  applyCatalogDelta,
  catalogSchemaMajor,
  completePageInfo,
  isCatalogSchemaSupported,
  nextDeltaRevision,
  parseModelCatalogDelta,
  parseModelCatalogSnapshot,
  resolveEffectiveCatalog,
  type CatalogFileSystem,
  type ModelCatalogSnapshot,
} from '../src/index.ts'
import { makeDelta, makeModel, makeParameter, makeSnapshot, makeVendor } from './model-catalog-fixtures.ts'

/** In-memory filesystem that records the operation order copy-on-write relies on. */
class FakeFileSystem implements CatalogFileSystem {
  readonly files = new Map<string, string>()
  readonly reads: string[] = []
  readonly writes: string[] = []
  readonly removals: string[] = []

  async readText(path: string): Promise<string | undefined> {
    this.reads.push(path)
    return this.files.get(path)
  }

  async writeTextAtomic(path: string, content: string): Promise<void> {
    this.writes.push(path)
    this.files.set(path, content)
  }

  async listFiles(directory: string): Promise<readonly string[]> {
    const prefix = `${directory}/`
    return [...this.files.keys()]
      .filter(path => path.startsWith(prefix))
      .map(path => path.slice(prefix.length))
      .filter(name => !name.includes('/'))
  }

  async removeFile(path: string): Promise<void> {
    this.removals.push(path)
    this.files.delete(path)
  }

  async ensureDirectory(): Promise<void> {}
}

function hash(text: string): string {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0).toString(16).padStart(8, '0')
}

function revisionFiles(fs: FakeFileSystem): string[] {
  return [...fs.files.keys()]
    .filter(path => path.startsWith('catalog/revisions/'))
    .map(path => path.slice('catalog/revisions/'.length))
    .sort()
}

function pointer(fs: FakeFileSystem): Record<string, unknown> {
  return JSON.parse(fs.files.get('catalog/current.json') ?? '{}') as Record<string, unknown>
}

describe('model catalog validation', () => {
  it('accepts a complete snapshot and freezes it', () => {
    const snapshot = makeSnapshot(4, {
      models: [makeModel('deepseek/deepseek-flash', { parameters: ['temperature'] })],
      vendors: [makeVendor('deepseek')],
      parameters: [makeParameter('temperature')],
    })
    const parsed = parseModelCatalogSnapshot(snapshot)
    expect(parsed.revision).toBe(4)
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.models)).toBe(true)
  })

  it('keeps unknown fields for forward compatibility', () => {
    const snapshot = {
      ...makeSnapshot(1, { models: [makeModel('a/b')] }),
      futureField: { retained: true },
      models: [{ ...makeModel('a/b'), futureModelField: 7 }],
    }
    const parsed = parseModelCatalogSnapshot(snapshot) as ModelCatalogSnapshot & { futureField: unknown }
    expect(parsed.futureField).toEqual({ retained: true })
    expect((parsed.models?.[0] as unknown as { futureModelField?: number }).futureModelField).toBe(7)
  })

  it('rejects an unsupported schema major with a stable code', () => {
    const snapshot = { ...makeSnapshot(1), schemaVersion: '2.0.0' }
    expect(() => parseModelCatalogSnapshot(snapshot)).toThrowError(
      expect.objectContaining({ code: 'model_catalog.version_unsupported' }),
    )
  })

  it('rejects duplicate catalog keys and duplicate parameter names', () => {
    const duplicateModels = makeSnapshot(1, { models: [makeModel('a/b'), makeModel('a/b')] })
    expect(() => parseModelCatalogSnapshot(duplicateModels)).toThrowError(
      expect.objectContaining({ code: 'model_catalog.invalid_document' }),
    )
    const duplicateParameters = makeSnapshot(1, {
      models: [makeModel('a/b')],
      parameters: [makeParameter('temperature'), makeParameter('temperature')],
    })
    expect(() => parseModelCatalogSnapshot(duplicateParameters)).toThrowError(
      expect.objectContaining({ code: 'model_catalog.invalid_document' }),
    )
  })

  it('rejects a parameter reference absent from the registry', () => {
    const snapshot = makeSnapshot(1, {
      models: [makeModel('a/b', { parameters: ['nope'] })],
      parameters: [makeParameter('temperature')],
    })
    expect(() => parseModelCatalogSnapshot(snapshot)).toThrowError(
      expect.objectContaining({ code: 'model_catalog.invalid_document' }),
    )
  })

  it('rejects a malformed catalog version and a non-positive revision', () => {
    expect(() => parseModelCatalogSnapshot({ ...makeSnapshot(1), catalogVersion: 'latest' })).toThrowError(
      ModelCatalogContractError,
    )
    expect(() => parseModelCatalogSnapshot({ ...makeSnapshot(1), revision: 0 })).toThrowError(
      ModelCatalogContractError,
    )
  })

  it('parses the resolved presentation policy and rejects an invalid switch', () => {
    const snapshot = {
      ...makeSnapshot(1, { models: [makeModel('a/b')] }),
      presentation: {
        openApiEnabled: true,
        appApiEnabled: false,
        includeParameters: true,
        includePricing: false,
        includeExtensions: false,
        exposeDeprecatedModels: false,
        defaultPageSize: 100,
        maxPageSize: 500,
        vendorOrder: ['deepseek'],
      },
    }
    const parsed = parseModelCatalogSnapshot(snapshot)
    expect(parsed.presentation).toMatchObject({ appApiEnabled: false, maxPageSize: 500 })
    expect(Object.isFrozen(parsed.presentation)).toBe(true)
    expect(() => parseModelCatalogSnapshot({
      ...snapshot,
      presentation: { ...snapshot.presentation, openApiEnabled: 'yes' },
    })).toThrowError(expect.objectContaining({ code: 'model_catalog.invalid_document' }))
  })

  it('parses a delta and reports a revision gap', () => {
    const delta = makeDelta(3, 4, { models: [makeModel('a/c')] })
    expect(parseModelCatalogDelta(delta, { currentRevision: 3 }).revision).toBe(4)
    expect(() => parseModelCatalogDelta(delta, { currentRevision: 2 })).toThrowError(
      expect.objectContaining({ code: 'model_catalog.revision_gap' }),
    )
  })

  it('rejects a delta that does not advance', () => {
    expect(() => parseModelCatalogDelta(makeDelta(4, 4))).toThrowError(ModelCatalogContractError)
  })

  it('reports schema helpers', () => {
    expect(catalogSchemaMajor('1.4.2')).toBe(1)
    expect(catalogSchemaMajor('nope')).toBeUndefined()
    expect(isCatalogSchemaSupported('1.9.9')).toBe(true)
    expect(isCatalogSchemaSupported('2.0.0')).toBe(false)
    expect(completePageInfo(3)).toMatchObject({ hasMore: false, totalItems: 3 })
  })
})

describe('model catalog delta', () => {
  const current = makeSnapshot(2, {
    models: [makeModel('a/a'), makeModel('a/b'), makeModel('a/c')],
    vendors: [makeVendor('a')],
  })

  it('replaces in place, appends new rows, and removes tombstones', () => {
    const delta = makeDelta(2, 3, {
      models: [makeModel('a/b', { displayName: 'B2' }), makeModel('a/d')],
      tombstones: [{ catalogKey: 'a/a', revision: 3, removedAt: '2026-11-15T09:30:00Z' }],
    })
    const next = applyCatalogDelta(current, delta)
    expect(next.models?.map(model => model.catalogKey)).toEqual(['a/b', 'a/c', 'a/d'])
    expect(next.models?.[0]?.displayName).toBe('B2')
    expect(next.revision).toBe(3)
    expect(next.pageInfo.hasMore).toBe(false)
    expect(next.pageInfo.totalItems).toBe(3)
  })

  it('never mutates the held snapshot', () => {
    const before = JSON.stringify(current)
    applyCatalogDelta(current, makeDelta(2, 3, { models: [makeModel('a/e')], tombstones: [{ catalogKey: 'a/a', revision: 3, removedAt: '2026-11-15T09:30:00Z' }] }))
    expect(JSON.stringify(current)).toBe(before)
  })

  it('refuses a delta that does not start at the held revision', () => {
    expect(() => applyCatalogDelta(current, makeDelta(1, 3))).toThrowError(
      expect.objectContaining({ code: 'model_catalog.revision_gap' }),
    )
  })

  it('advances with nextSinceRevision when present', () => {
    expect(nextDeltaRevision(makeDelta(2, 3))).toBe(3)
    expect(nextDeltaRevision(makeDelta(2, 3, { nextSinceRevision: 5 }))).toBe(5)
  })
})

describe('model catalog precedence', () => {
  const seed = makeSnapshot(1, { models: [makeModel('seed/model')] })
  const remote = makeSnapshot(9, { models: [makeModel('remote/model')] })

  it('prefers a non-empty backend catalog wholesale', () => {
    expect(resolveEffectiveCatalog({ seed, local: seed, remote })?.source).toBe('backend')
    expect(resolveEffectiveCatalog({ seed, local: seed, remote })?.snapshot.revision).toBe(9)
  })

  it('keeps the local catalog when the backend catalog is empty', () => {
    const empty = makeSnapshot(10, { models: [] })
    expect(resolveEffectiveCatalog({ seed, local: seed, remote: empty })?.snapshot).toBe(seed)
  })

  it('falls back to the seed when nothing backend-sourced is non-empty', () => {
    expect(resolveEffectiveCatalog({ seed })?.source).toBe('seed')
    const empty = makeSnapshot(2, { models: [] })
    expect(resolveEffectiveCatalog({ seed, remote: empty })?.snapshot).toBe(seed)
  })

  it('returns an empty backend catalog when it is the only source', () => {
    const empty = makeSnapshot(2, { models: [] })
    expect(resolveEffectiveCatalog({ remote: empty })).toEqual({ snapshot: empty, source: 'backend' })
    expect(resolveEffectiveCatalog({})).toBeUndefined()
  })
})

describe('model catalog store', () => {
  it('publishes atomically and notifies after the swap', () => {
    const store = new ModelCatalogStore({ now: () => new Date('2026-11-15T09:30:00Z') })
    const first = makeSnapshot(1, { models: [makeModel('a/a')] })
    store.publish(first, { source: 'seed' })
    const held = store.view
    const listener = vi.fn(() => {
      expect(store.view?.snapshot.revision).toBe(2)
    })
    store.subscribe(listener)
    store.publish(makeSnapshot(2, { models: [makeModel('a/a'), makeModel('a/b')] }), { source: 'backend' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(held?.snapshot.revision).toBe(1)
    expect(store.view?.loadedAt).toBe('2026-11-15T09:30:00.000Z')
    expect(store.view?.source).toBe('backend')
  })

  it('rejects a stale or replayed revision without changing the view', () => {
    const store = new ModelCatalogStore()
    store.publish(makeSnapshot(2, { models: [makeModel('a/a')] }), { source: 'backend' })
    expect(() => store.publish(makeSnapshot(2, { models: [makeModel('a/a')] }), { source: 'backend' })).toThrowError(
      expect.objectContaining({ code: 'model_catalog.stale_revision' }),
    )
    expect(() => store.publish(makeSnapshot(1, { models: [makeModel('a/a')] }), { source: 'backend' })).toThrowError(
      expect.objectContaining({ code: 'model_catalog.stale_revision' }),
    )
    expect(store.view?.snapshot.revision).toBe(2)
  })

  it('lets the first backend revision replace a seed with the same number', () => {
    const store = new ModelCatalogStore()
    store.publish(makeSnapshot(1, { models: [makeModel('seed/model')] }), { source: 'seed' })
    expect(() => store.publish(makeSnapshot(1, { models: [makeModel('a/a')] }), { source: 'backend' })).not.toThrow()
    expect(store.view?.source).toBe('backend')
    expect(store.view?.snapshot.models?.[0]?.catalogKey).toBe('a/a')
    expect(() => store.publish(makeSnapshot(1, { models: [makeModel('a/b')] }), { source: 'backend' })).toThrowError(
      expect.objectContaining({ code: 'model_catalog.stale_revision' }),
    )
  })

  it('applies a delta through the same commit path', () => {
    const store = new ModelCatalogStore()
    store.publish(makeSnapshot(1, { models: [makeModel('a/a')] }), { source: 'backend' })
    store.applyDelta(makeDelta(1, 2, { models: [makeModel('a/b')] }))
    expect(store.view?.snapshot.models?.map(model => model.catalogKey)).toEqual(['a/a', 'a/b'])
    expect(store.view?.source).toBe('backend')
  })

  it('refuses a delta before any publication', () => {
    const store = new ModelCatalogStore()
    expect(() => store.applyDelta(makeDelta(1, 2))).toThrowError(
      expect.objectContaining({ code: 'model_catalog.revision_gap' }),
    )
  })

  it('isolates a throwing subscriber from the commit and from other subscribers', () => {
    const store = new ModelCatalogStore()
    store.publish(makeSnapshot(1, { models: [makeModel('a/a')] }), { source: 'seed' })
    const good = vi.fn()
    store.subscribe(() => {
      throw new Error('subscriber failed')
    })
    store.subscribe(good)
    expect(() => store.publish(makeSnapshot(2, { models: [makeModel('a/a')] }), { source: 'backend' })).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    expect(store.view?.snapshot.revision).toBe(2)
  })

  it('stops notifications after unsubscribe, reset, and dispose', () => {
    const store = new ModelCatalogStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.publish(makeSnapshot(1, { models: [makeModel('a/a')] }), { source: 'seed' })
    unsubscribe()
    store.publish(makeSnapshot(2, { models: [makeModel('a/a')] }), { source: 'seed' })
    expect(listener).toHaveBeenCalledTimes(1)
    store.reset()
    expect(store.view).toBeUndefined()
    store.publish(makeSnapshot(3, { models: [makeModel('a/a')] }), { source: 'seed' })
    store.dispose()
    expect(() => store.publish(makeSnapshot(4, { models: [makeModel('a/a')] }), { source: 'seed' })).toThrow()
    expect(store.subscribe(listener)()).toBeUndefined()
  })
})

describe('copy-on-write persistence', () => {
  it('writes the revision file before the pointer and reloads it', async () => {
    const fs = new FakeFileSystem()
    const persistence = new CopyOnWriteCatalogPersistence({ directory: 'catalog', fileSystem: fs, hash })
    const snapshot = makeSnapshot(3, { models: [makeModel('a/a')] })
    await persistence.save(snapshot, { etag: '"mcat-3-abc"' })
    const revisionWrite = fs.writes.findIndex(path => path.startsWith('catalog/revisions/'))
    const pointerWrite = fs.writes.findIndex(path => path === 'catalog/current.json')
    expect(revisionWrite).toBeGreaterThanOrEqual(0)
    expect(pointerWrite).toBeGreaterThan(revisionWrite)
    expect(revisionFiles(fs)).toHaveLength(1)
    expect(pointer(fs)).toMatchObject({ revision: 3, generation: 1, etag: '"mcat-3-abc"' })

    const loaded = await persistence.load()
    expect(loaded?.snapshot.revision).toBe(3)
    expect(loaded?.etag).toBe('"mcat-3-abc"')
  })

  it('falls back to the newest valid revision when the pointer is corrupt', async () => {
    const fs = new FakeFileSystem()
    const persistence = new CopyOnWriteCatalogPersistence({ directory: 'catalog', fileSystem: fs, hash })
    await persistence.save(makeSnapshot(2, { models: [makeModel('a/a')] }))
    fs.files.set('catalog/current.json', '{not json')
    const loaded = await persistence.load()
    expect(loaded?.snapshot.revision).toBe(2)
    expect(pointer(fs)).toMatchObject({ revision: 2 })
  })

  it('quarantines a corrupt newest revision and serves the previous one', async () => {
    const fs = new FakeFileSystem()
    const persistence = new CopyOnWriteCatalogPersistence({ directory: 'catalog', fileSystem: fs, hash, keepRevisions: 3 })
    await persistence.save(makeSnapshot(2, { models: [makeModel('a/a')] }))
    await persistence.save(makeSnapshot(3, { models: [makeModel('a/b')] }))
    const newest = revisionFiles(fs).find(file => file.startsWith('3-'))
    expect(newest).toBeDefined()
    if (newest !== undefined) fs.files.set(`catalog/revisions/${newest}`, '{broken')
    const loaded = await persistence.load()
    expect(loaded?.snapshot.revision).toBe(2)
    expect([...fs.files.keys()].some(path => path.startsWith('catalog/quarantine/'))).toBe(true)
  })

  it('never reads a pointer file name outside the revisions directory', async () => {
    const fs = new FakeFileSystem()
    fs.files.set('catalog/current.json', JSON.stringify({
      generation: 1,
      revision: 1,
      file: '../evil.json',
      savedAt: '2026-11-15T09:30:00Z',
    }))
    const persistence = new CopyOnWriteCatalogPersistence({ directory: 'catalog', fileSystem: fs, hash })
    await expect(persistence.load()).resolves.toBeUndefined()
    expect(fs.reads.some(path => path.includes('evil'))).toBe(false)
  })

  it('prunes older revisions but keeps the pointed one', async () => {
    const fs = new FakeFileSystem()
    const persistence = new CopyOnWriteCatalogPersistence({ directory: 'catalog', fileSystem: fs, hash, keepRevisions: 2 })
    for (let revision = 1; revision <= 4; revision += 1) {
      await persistence.save(makeSnapshot(revision, { models: [makeModel('a/a')] }))
    }
    const files = revisionFiles(fs)
    expect(files).toHaveLength(2)
    expect(files.some(file => file.startsWith('4-'))).toBe(true)
    expect(files.some(file => file.startsWith('3-'))).toBe(true)
  })

  it('returns undefined when nothing valid is stored', async () => {
    const fs = new FakeFileSystem()
    const persistence = new CopyOnWriteCatalogPersistence({ directory: 'catalog', fileSystem: fs, hash })
    await expect(persistence.load()).resolves.toBeUndefined()
  })

  it('memory persistence stores the latest snapshot and validator', async () => {
    const persistence = new MemoryCatalogPersistence()
    const snapshot = makeSnapshot(1, { models: [makeModel('a/a')] })
    await persistence.save(snapshot, { etag: '"e"' })
    await expect(persistence.load()).resolves.toEqual({ snapshot, etag: '"e"' })
  })
})
