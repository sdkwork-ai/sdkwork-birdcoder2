/**
 * Reads the published update configuration from the Deployments API.
 *
 * The source is fail-open by design: an unreachable endpoint, an invalid
 * document or a refused feed host never blocks updates, it only means "keep
 * doing what the packaged manifest says". The order is:
 *
 * 1. no `configUrl` configured → packaged feed (the pre-Deployments behaviour);
 * 2. a fresh cached document → use it without a network round-trip;
 * 3. fetch with a bounded timeout and size, validate, cache, use it;
 * 4. on any failure, reuse the last known good document even if stale;
 * 5. only when nothing was ever cached → packaged feed.
 *
 * Two operator decisions are enforced here rather than in the UI: `enabled:
 * false` pauses ordinary checks, and the staged-rollout percentage excludes the
 * install (a manual check bypasses the percentage so an operator can verify a
 * staged release on a machine outside the bucket).
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { PublicUpdateConfig, UpdateConfigDocument } from './contract.ts'
import { applyFeed, type ResolvedUpdateFeed, type UpdateFeedResolution } from './feed.ts'
import { isInRollout } from './rollout.ts'
import { MAX_UPDATE_CONFIG_BYTES, parseUpdateConfigDocument } from './validate.ts'

/** Default cache lifetime for a document that is not being force-refreshed. */
export const DEFAULT_CONFIG_TTL_MS = 30 * 60 * 1000
/** Default bound on one configuration request. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000

/** Inputs the main process knows at startup. */
export interface UpdateConfigSourceOptions {
  /** Absolute endpoint, absent when the build has no Deployments distribution. */
  readonly configUrl: string | undefined
  readonly productKey: string
  readonly platform: 'windows' | 'macos' | 'linux'
  readonly architecture: 'x64' | 'arm64'
  /** Feed hosts this build may follow; empty disables the host check. */
  readonly allowedHosts: readonly string[]
  /** Absolute path of the configuration cache file. */
  readonly cachePath: string
  /** Absolute path of the persisted installation id. */
  readonly installIdPath: string
  readonly currentVersion: string
  readonly fetchImpl?: typeof fetch
  readonly now?: () => number
  readonly ttlMs?: number
  readonly requestTimeoutMs?: number
}

/** The resolver the coordinator calls before every check. */
export interface UpdateConfigSource {
  /**
   * Resolves what this check should do.
   * @param options - `manual` bypasses the rollout gate and the cache TTL.
   */
  resolve(options?: { readonly manual?: boolean }): Promise<UpdateFeedResolution>
  /** Last resolution facts for the update journal; no URLs or credentials. */
  readonly last: { provenance: string; revision: string; host?: string } | undefined
  /** Applies one resolved feed (exposed for tests and diagnostics). */
  apply(updater: Parameters<typeof applyFeed>[0], feed: ResolvedUpdateFeed): void
}

interface CachedConfig {
  readonly fetchedAt: number
  readonly document: UpdateConfigDocument
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCache(value: unknown): CachedConfig | undefined {
  if (!isRecord(value)) return undefined
  const fetchedAt = value.fetchedAt
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return undefined
  const document = parseUpdateConfigDocument(value.document)
  return document === undefined ? undefined : { fetchedAt, document }
}

function httpsHost(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return undefined
    if (parsed.username !== '' || parsed.password !== '') return undefined
    return parsed.hostname
  } catch {
    return undefined
  }
}

function normalizeFeedUrl(url: string): string | undefined {
  const trimmed = url.trim()
  if (trimmed === '') return undefined
  const host = httpsHost(trimmed)
  if (host === undefined) return undefined
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function toFeed(
  document: UpdateConfigDocument,
  update: PublicUpdateConfig,
  options: UpdateConfigSourceOptions,
): ResolvedUpdateFeed | undefined {
  const base = {
    channel: update.channel,
    allowPrerelease: update.allowPrerelease,
    allowDowngrade: update.allowDowngrade,
    checkIntervalMinutes: update.checkIntervalMinutes,
    rolloutPercentage: update.rolloutPercentage,
    ...(update.minimumSupportedVersion === ''
      ? {}
      : { minimumSupportedVersion: update.minimumSupportedVersion }),
    ...(update.releaseNotesUrl === '' ? {} : { releaseNotesUrl: update.releaseNotesUrl }),
    ...(update.channelFile === '' ? {} : { channelFile: update.channelFile }),
    revision: document.revision,
  }
  if (update.provider === 'github') {
    if (update.githubOwner.trim() === '' || update.githubRepo.trim() === '') return undefined
    return { ...base, provider: 'github', owner: update.githubOwner, repo: update.githubRepo }
  }
  const url = normalizeFeedUrl(update.feedUrl)
  if (url === undefined) return undefined
  const host = httpsHost(url)
  if (host === undefined) return undefined
  if (options.allowedHosts.length > 0 && !options.allowedHosts.includes(host)) return undefined
  return { ...base, provider: 'generic', url }
}

/**
 * Creates the configuration source used by the update coordinator.
 * @param options - Paths, build identity and network overrides.
 * @returns A resolver that never throws.
 */
export function createUpdateConfigSource(options: UpdateConfigSourceOptions): UpdateConfigSource {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => Date.now())
  const ttlMs = options.ttlMs ?? DEFAULT_CONFIG_TTL_MS
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  let last: UpdateConfigSource['last']
  let installId: string | undefined

  const loadInstallId = async (): Promise<string | undefined> => {
    if (installId !== undefined) return installId
    try {
      const existing = (await readFile(options.installIdPath, 'utf8')).trim()
      if (existing !== '') {
        installId = existing
        return existing
      }
    } catch {
      // Missing file is the first-run case.
    }
    try {
      const created = randomUUID()
      await mkdir(dirname(options.installIdPath), { recursive: true })
      await writeFile(options.installIdPath, `${created}\n`, { mode: 0o600 })
      installId = created
      return created
    } catch {
      return undefined
    }
  }

  const readCacheFile = async (): Promise<CachedConfig | undefined> => {
    try {
      return readCache(JSON.parse(await readFile(options.cachePath, 'utf8')))
    } catch {
      return undefined
    }
  }

  const writeCacheFile = async (document: UpdateConfigDocument): Promise<void> => {
    try {
      const temporary = `${options.cachePath}.tmp`
      await mkdir(dirname(options.cachePath), { recursive: true })
      await writeFile(
        temporary,
        `${JSON.stringify({ fetchedAt: now(), document })}\n`,
        { mode: 0o600 },
      )
      await rename(temporary, options.cachePath)
    } catch {
      // A cache that cannot be written only costs a network round-trip later.
    }
  }

  const fetchDocument = async (): Promise<UpdateConfigDocument | undefined> => {
    if (options.configUrl === undefined) return undefined
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const separator = options.configUrl.includes('?') ? '&' : '?'
      const url = `${options.configUrl}${separator}product_key=${encodeURIComponent(options.productKey)}`
        + `&platform=${encodeURIComponent(options.platform)}`
        + `&architecture=${encodeURIComponent(options.architecture)}`
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })
      if (!response.ok) return undefined
      const body = await response.text()
      if (body.length > MAX_UPDATE_CONFIG_BYTES) return undefined
      return parseUpdateConfigDocument(JSON.parse(body))
    } catch {
      return undefined
    } finally {
      clearTimeout(deadline)
    }
  }

  const resolveFrom = async (
    document: UpdateConfigDocument,
    provenance: 'network' | 'cache',
    manual: boolean,
  ): Promise<UpdateFeedResolution | undefined> => {
    const update = document.update
    if (!update.enabled || update.provider === 'none') {
      return { kind: 'disabled', reason: 'operator-disabled' }
    }
    const feed = toFeed(document, update, options)
    if (feed === undefined) return undefined
    if (!manual && update.rolloutPercentage < 100) {
      const id = await loadInstallId()
      if (id !== undefined) {
        const version = document.version ?? options.currentVersion
        if (!isInRollout(id, options.productKey, version, update.rolloutPercentage)) {
          return { kind: 'disabled', reason: 'rollout-excluded' }
        }
      }
    }
    last = {
      provenance,
      revision: document.revision,
      ...(feed.url === undefined ? {} : { host: httpsHost(feed.url) ?? '' }),
    }
    return { kind: 'remote', feed, provenance }
  }

  return {
    get last() {
      return last
    },

    apply(updater, feed) {
      applyFeed(updater, feed)
    },

    async resolve(checkOptions = {}) {
      const manual = checkOptions.manual === true
      if (options.configUrl === undefined) return { kind: 'packaged' }

      const cached = await readCacheFile()
      if (!manual && cached !== undefined && now() - cached.fetchedAt < ttlMs) {
        const resolution = await resolveFrom(cached.document, 'cache', manual)
        if (resolution !== undefined) return resolution
      }

      const fetched = await fetchDocument()
      if (fetched !== undefined) {
        const resolution = await resolveFrom(fetched, 'network', manual)
        if (resolution !== undefined) {
          await writeCacheFile(fetched)
          if (resolution.kind === 'disabled') last = { provenance: 'network', revision: fetched.revision }
          return resolution
        }
      }

      if (cached !== undefined) {
        const resolution = await resolveFrom(cached.document, 'cache', manual)
        if (resolution !== undefined) return resolution
      }
      return { kind: 'packaged' }
    },
  }
}
