import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  FrontendModelCatalogLoader,
  frontendModelConfigEndpoint,
  parseFrontendModelConfig,
  readSessionTokens,
  selectExposureKeys,
  type FrontendModelCatalogLoaderOptions,
} from '../src/model-catalog.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-birdcoder-model-catalog-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

function document(overrides: {
  revision?: number
  llmEnabled?: boolean
  models?: Array<{ catalogKey: string; visible?: boolean; sortOrder?: number }>
  extraChannels?: unknown[]
} = {}): Record<string, unknown> {
  return {
    revision: overrides.revision ?? 12,
    channels: [
      {
        channelCode: 'llm',
        enabled: overrides.llmEnabled ?? true,
        sortOrder: 10,
        capabilityCodes: ['chat'],
        models: (overrides.models ?? [
          { catalogKey: 'vendor/b', sortOrder: 20 },
          { catalogKey: 'vendor/a', sortOrder: 10 },
          { catalogKey: 'vendor/hidden', visible: false },
        ]).map(model => ({
          catalogKey: model.catalogKey,
          visible: model.visible ?? true,
          sortOrder: model.sortOrder ?? 0,
        })),
      },
      ...(overrides.extraChannels ?? []),
    ],
  }
}

function loaderOptions(
  dir: string,
  overrides: Partial<FrontendModelCatalogLoaderOptions> = {},
) {
  const applied: Array<{ keys: readonly string[] | undefined; revision: number }> = []
  return Object.assign({
    provider: 'birdcoder',
    channelCode: 'llm',
    endpoint: 'https://api.example.com/app/v3/api/ai/frontend_config',
    documentFile: '',
    sessionFile: join(dir, 'session.json'),
    cacheFile: join(dir, 'cache.json'),
    pollIntervalMs: 0,
    timeoutMs: 2000,
    applyPolicy: (keys: readonly string[] | undefined, metadata: { revision: number }) => {
      applied.push({ keys, revision: metadata.revision })
    },
  }, overrides, { applied })
}

describe('front-end model configuration document', () => {
  it('selects visible models in presentation order and excludes hidden rows', () => {
    const parsed = parseFrontendModelConfig(document())
    expect(selectExposureKeys(parsed, 'llm')).toEqual(['vendor/a', 'vendor/b'])
  })

  it('treats a disabled surface as an explicit empty exposure', () => {
    const parsed = parseFrontendModelConfig(document({ llmEnabled: false }))
    expect(selectExposureKeys(parsed, 'llm')).toEqual([])
  })

  it('rejects a document without a channels array', () => {
    expect(() => parseFrontendModelConfig({ revision: 3 })).toThrow(/channels/u)
  })

  it('derives the app-api endpoint from a relay origin', () => {
    expect(frontendModelConfigEndpoint('https://api.birdcoder.com/'))
      .toBe('https://api.birdcoder.com/app/v3/api/ai/frontend_config')
  })

  it('reads both tokens from a readable session and refuses an encrypted one', async () => {
    const dir = await tempDir()
    const readable = join(dir, 'readable.json')
    const encrypted = join(dir, 'encrypted.json')
    await writeFile(readable, JSON.stringify({ authToken: 'auth', accessToken: 'access' }), 'utf8')
    await writeFile(encrypted, JSON.stringify({ encrypted: true, payload: 'cipher' }), 'utf8')
    expect(readSessionTokens(readable)).toEqual({ authToken: 'auth', accessToken: 'access' })
    expect(readSessionTokens(encrypted)).toBeUndefined()
    expect(readSessionTokens(join(dir, 'missing.json'))).toBeUndefined()
  })
})

describe('front-end model catalog loader', () => {
  it('applies an authenticated document, caches it and honors a later 304', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'session.json'), JSON.stringify({ authToken: 'auth', accessToken: 'access' }), 'utf8')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(document()), {
      status: 200,
      headers: { 'content-type': 'application/json', etag: '"fmc-12"' },
    }))
    const options = loaderOptions(dir, { fetch: fetchMock })
    const loader = new FrontendModelCatalogLoader(options)
    const first = await loader.refresh()
    expect(first).toEqual({ status: 'applied', revision: 12, keyCount: 2 })
    expect(options.applied).toEqual([{ keys: ['vendor/a', 'vendor/b'], revision: 12 }])
    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(requestHeaders.get('authorization')).toBe('Bearer auth')
    expect(requestHeaders.get('access-token')).toBe('access')
    const cached = JSON.parse(await readFile(options.cacheFile, 'utf8')) as { version: number; etag: string }
    expect(cached.version).toBe(1)
    expect(cached.etag).toBe('"fmc-12"')

    const notModified = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 304 }))
    const second = new FrontendModelCatalogLoader({ ...options, fetch: notModified })
    const rehydrated = await second.refresh()
    expect(rehydrated).toEqual({ status: 'not-modified', revision: 12 })
    expect(new Headers(notModified.mock.calls[0]?.[1]?.headers).get('if-none-match')).toBe('"fmc-12"')
  })

  it('keeps the last exposure when a refresh fails', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'session.json'), JSON.stringify({ authToken: 'auth', accessToken: 'access' }), 'utf8')
    const options = loaderOptions(dir, {
      fetch: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('upstream down', { status: 503 })),
    })
    const loader = new FrontendModelCatalogLoader(options)
    const result = await loader.refresh()
    expect(result).toMatchObject({ status: 'failed', code: 'model_catalog.unavailable' })
    expect(options.applied).toEqual([])
    expect(loader.status().state).toBe('unavailable')
  })

  it('rejects an unauthenticated answer without withdrawing the previous policy', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'session.json'), JSON.stringify({ authToken: 'auth', accessToken: 'access' }), 'utf8')
    const options = loaderOptions(dir, {
      fetch: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 401 })),
    })
    const loader = new FrontendModelCatalogLoader(options)
    await loader.refresh()
    expect(options.applied).toEqual([])
    expect(loader.status().state).toBe('degraded')
  })

  it('skips the remote path when no token pair is available', async () => {
    const dir = await tempDir()
    const fetchMock = vi.fn()
    const options = loaderOptions(dir, { fetch: fetchMock as unknown as typeof fetch })
    const loader = new FrontendModelCatalogLoader(options)
    const result = await loader.refresh()
    expect(result).toEqual({ status: 'skipped', reason: 'no-token' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('applies a projected document without any credential', async () => {
    const dir = await tempDir()
    const documentFile = join(dir, 'frontend-model-config.json')
    await writeFile(documentFile, JSON.stringify(document({ revision: 21 })), 'utf8')
    const fetchMock = vi.fn()
    const options = loaderOptions(dir, {
      documentFile,
      fetch: fetchMock as unknown as typeof fetch,
    })
    const loader = new FrontendModelCatalogLoader(options)
    const result = await loader.refresh()
    expect(result).toEqual({ status: 'applied', revision: 21, keyCount: 2 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(options.applied.at(-1)).toEqual({ keys: ['vendor/a', 'vendor/b'], revision: 21 })
  })

  it('publishes an empty exposure when the operator disabled the llm surface', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'session.json'), JSON.stringify({ authToken: 'auth', accessToken: 'access' }), 'utf8')
    const options = loaderOptions(dir, {
      fetch: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
        JSON.stringify(document({ llmEnabled: false })),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )),
    })
    const loader = new FrontendModelCatalogLoader(options)
    await loader.refresh()
    expect(options.applied).toEqual([{ keys: [], revision: 12 }])
  })

  it('reports an invalid document and leaves the previous exposure in place', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'session.json'), JSON.stringify({ authToken: 'auth', accessToken: 'access' }), 'utf8')
    const options = loaderOptions(dir, {
      fetch: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{"revision": 1}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    })
    const loader = new FrontendModelCatalogLoader(options)
    const result = await loader.refresh()
    expect(result).toMatchObject({ status: 'failed', code: 'model_catalog.invalid_document' })
    expect(options.applied).toEqual([])
  })
})



describe('front-end model catalog replay', () => {
  it('re-publishes the last exposure for a late-mounting consumer', async () => {
    const dir = await tempDir()
    const documentFile = join(dir, 'frontend-model-config.json')
    await writeFile(documentFile, JSON.stringify(document({ revision: 33 })), 'utf8')
    const options = loaderOptions(dir, { documentFile })
    const loader = new FrontendModelCatalogLoader(options)
    await loader.refresh()
    expect(options.applied).toHaveLength(1)
    loader.republish()
    expect(options.applied).toHaveLength(2)
    expect(options.applied.at(-1)).toEqual({ keys: ['vendor/a', 'vendor/b'], revision: 33 })
  })

  it('replays an explicit empty exposure as the current policy', async () => {
    const dir = await tempDir()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify(document({ llmEnabled: false })),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    await writeFile(join(dir, 'session.json'), JSON.stringify({ authToken: 'auth', accessToken: 'access' }), 'utf8')
    const options = loaderOptions(dir, { fetch: fetchMock })
    const loader = new FrontendModelCatalogLoader(options)
    await loader.refresh()
    expect(options.applied).toHaveLength(1)
    loader.republish()
    expect(options.applied).toHaveLength(2)
    expect(options.applied.at(-1)).toEqual({ keys: [], revision: 12 })
  })
})


describe('desktop shell projection contract', () => {
  it('reads the shell envelope that wraps the document', async () => {
    const dir = await tempDir()
    const documentFile = join(dir, 'frontend-model-config.json')
    await writeFile(documentFile, JSON.stringify({
      version: 1,
      savedAt: '2026-11-23T02:00:00Z',
      source: 'https://api.birdcoder.com/app/v3/api/ai/frontend_config',
      document: document({ revision: 44 }),
    }), 'utf8')
    const options = loaderOptions(dir, { documentFile })
    const loader = new FrontendModelCatalogLoader(options)
    const result = await loader.refresh()
    expect(result).toEqual({ status: 'applied', revision: 44, keyCount: 2 })
    expect(options.applied.at(-1)).toEqual({ keys: ['vendor/a', 'vendor/b'], revision: 44 })
  })
})
