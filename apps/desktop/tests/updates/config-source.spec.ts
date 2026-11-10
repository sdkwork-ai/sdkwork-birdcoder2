import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createUpdateConfigSource,
  parseUpdateConfigDocument,
  stableBucket,
  UPDATE_CONFIG_SCHEMA_VERSION,
  type UpdateConfigDocument,
} from '../../src/updates/config/index.ts'

const PRODUCT = 'app.sdkwork.birdcoder'
const VERSION = '0.2.2-rc.1'
const INSTALL = 'install-1'

function document(update: Partial<UpdateConfigDocument['update']> = {}): UpdateConfigDocument {
  return {
    schemaVersion: UPDATE_CONFIG_SCHEMA_VERSION,
    catalogKey: 'birdcoder-desktop',
    itemKey: 'desktop-windows-x64',
    productKey: PRODUCT,
    platform: 'windows',
    architecture: 'x64',
    version: VERSION,
    revision: 'sha256:abc',
    update: {
      enabled: true,
      provider: 'deployments',
      feedUrl: 'https://deploy.example.com/app/v3/api/downloads/feed/p/windows/x64/',
      githubOwner: '',
      githubRepo: '',
      channel: 'nightly',
      channelFile: 'nightly.yml',
      allowedChannels: ['nightly', 'stable'],
      allowPrerelease: true,
      allowDowngrade: false,
      minimumSupportedVersion: '0.2.0',
      checkIntervalMinutes: 10,
      rolloutPercentage: 100,
      releaseNotesUrl: '',
      ...update,
    },
  }
}

const created: string[] = []
async function workspace(): Promise<{ cachePath: string; installIdPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-update-config-'))
  created.push(directory)
  return { cachePath: join(directory, 'update-config.json'), installIdPath: join(directory, 'install-id') }
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(created.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function source(options: {
  paths: { cachePath: string; installIdPath: string }
  document?: UpdateConfigDocument
  status?: number
  allowedHosts?: readonly string[]
  configUrl?: string | undefined
}) {
  const body = options.document === undefined ? '{}' : JSON.stringify(options.document)
  const fetchImpl = (async () => new Response(body, { status: options.status ?? 200 })) as typeof fetch
  return createUpdateConfigSource({
    configUrl: options.configUrl ?? 'https://deploy.example.com/app/v3/api/downloads/config',
    productKey: PRODUCT,
    platform: 'windows',
    architecture: 'x64',
    allowedHosts: options.allowedHosts ?? ['deploy.example.com'],
    cachePath: options.paths.cachePath,
    installIdPath: options.paths.installIdPath,
    currentVersion: '0.2.1',
    fetchImpl,
    now: () => 1_000,
  })
}

describe('update config document validation', () => {
  it('accepts the published document', () => {
    expect(parseUpdateConfigDocument(document())?.revision).toBe('sha256:abc')
  })

  it('refuses a document from another contract version', () => {
    expect(parseUpdateConfigDocument({ ...document(), schemaVersion: 'v0' })).toBeUndefined()
  })

  it('refuses an unknown provider', () => {
    expect(
      parseUpdateConfigDocument({ ...document(), update: { ...document().update, provider: 'ftp' } }),
    ).toBeUndefined()
  })
})

describe('staged rollout bucketing', () => {
  it('matches the server-side bucket for a known install', () => {
    expect(stableBucket(INSTALL, PRODUCT, VERSION)).toBe(80)
  })

  it('is stable and bounded', () => {
    const first = stableBucket(INSTALL, PRODUCT, VERSION)
    expect(stableBucket(INSTALL, PRODUCT, VERSION)).toBe(first)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(100)
  })
})

describe('update config source', () => {
  it('resolves the published feed and normalizes the trailing slash', async () => {
    const paths = await workspace()
    const resolution = await source({ paths, document: document() }).resolve()
    expect(resolution.kind).toBe('remote')
    if (resolution.kind !== 'remote') return
    expect(resolution.feed.provider).toBe('generic')
    expect(resolution.feed.url).toBe('https://deploy.example.com/app/v3/api/downloads/feed/p/windows/x64/')
    expect(resolution.feed.channel).toBe('nightly')
    expect(resolution.provenance).toBe('network')
  })

  it('falls back to the cached document when the API is unavailable', async () => {
    const paths = await workspace()
    await source({ paths, document: document() }).resolve()
    const offline = source({ paths, status: 503 })
    const resolution = await offline.resolve()
    expect(resolution.kind).toBe('remote')
    if (resolution.kind !== 'remote') return
    expect(resolution.provenance).toBe('cache')
  })

  it('keeps the packaged feed when the document is invalid', async () => {
    const paths = await workspace()
    const resolution = await source({ paths, document: { ...document(), schemaVersion: 'v0' } }).resolve()
    expect(resolution).toEqual({ kind: 'packaged' })
  })

  it('honours the operator pause switch', async () => {
    const paths = await workspace()
    const resolution = await source({ paths, document: document({ enabled: false }) }).resolve()
    expect(resolution).toEqual({ kind: 'disabled', reason: 'operator-disabled' })
  })

  it('excludes an install outside the rollout, and lets a manual check through', async () => {
    const paths = await workspace()
    await writeFile(paths.installIdPath, `${INSTALL}\n`)
    const staged = document({ rolloutPercentage: 10 })
    const automatic = await source({ paths, document: staged }).resolve()
    expect(automatic).toEqual({ kind: 'disabled', reason: 'rollout-excluded' })
    const manual = await source({ paths, document: staged }).resolve({ manual: true })
    expect(manual.kind).toBe('remote')
  })

  it('refuses a feed host outside the build allowlist', async () => {
    const paths = await workspace()
    const resolution = await source({
      paths,
      document: document({ feedUrl: 'https://evil.example.net/feed/' }),
      allowedHosts: ['deploy.example.com'],
    }).resolve()
    expect(resolution).toEqual({ kind: 'packaged' })
  })

  it('persists the installation id used for bucketing', async () => {
    const paths = await workspace()
    await source({ paths, document: document({ rolloutPercentage: 10 }) }).resolve()
    const installId = (await readFile(paths.installIdPath, 'utf8')).trim()
    expect(installId.length).toBeGreaterThan(0)
  })
})
