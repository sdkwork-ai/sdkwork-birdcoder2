/**
 * Synchronization client for the versioned model catalog.
 *
 * The client follows the protocol in
 * `sdkwork-cloudrouter/docs/architecture/tech/TECH-2026-11-15-model-catalog-sync-api.md`:
 * a conditional full snapshot on a cold start, a conditional delta afterwards,
 * a fallback to a full snapshot on a revision gap, and a local copy-on-write
 * commit for every accepted revision. A failed sync never clears the published
 * catalog; the last known good snapshot stays readable.
 *
 * Transport, storage, time, and randomness are injected so the protocol is
 * testable without a network or a disk.
 *
 * @module @deepseek-ai/dsh-llm/model-catalog/sync
 */

import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { completePageInfo } from './delta.ts'
import { ModelCatalogStore } from './store.ts'
import { ModelCatalogContractError, parseModelCatalogDelta, parseModelCatalogSnapshot } from './validation.ts'
import type { CatalogPersistence } from './persistence.ts'
import type {
  ModelCatalogDelta,
  ModelCatalogErrorCode,
  ModelCatalogModel,
  ModelCatalogSnapshot,
  ModelCatalogSyncState,
  ModelCatalogSyncStatus,
  ModelCatalogVendor,
  ModelParameterDescriptor,
} from './types.ts'

/** Header bag used by the transport. */
export interface CatalogHttpHeaders {
  readonly [name: string]: string
}

/** One HTTP request the syncer issues. */
export interface CatalogHttpRequest {
  /** Absolute URL. */
  readonly url: string
  /** Only GET is used by this contract. */
  readonly method: 'GET'
  /** Request headers. */
  readonly headers: CatalogHttpHeaders
}

/** One HTTP response returned by the transport. */
export interface CatalogHttpResponse {
  /** Status code. */
  readonly status: number
  /** Response headers, case-insensitive by convention. */
  readonly headers: CatalogHttpHeaders
  /** Response body text. */
  readonly body?: string
}

/** The network seam. */
export interface CatalogTransport {
  /** Perform one request; a network failure rejects. */
  send(request: CatalogHttpRequest): Promise<CatalogHttpResponse>
}

/** Failure codes this client can report in addition to the server's. */
export type ModelCatalogSyncFailureCode = ModelCatalogErrorCode | 'model_catalog.transport_failed'

/** Outcome of one synchronization attempt. */
export type ModelCatalogSyncResult =
  | { readonly status: 'not-modified'; readonly revision: number }
  | { readonly status: 'applied'; readonly revision: number; readonly delta: boolean }
  | { readonly status: 'empty'; readonly revision: number }
  | { readonly status: 'failed'; readonly code: ModelCatalogSyncFailureCode; readonly message: string }

/** Options for {@link ModelCatalogSync}. */
export interface ModelCatalogSyncOptions {
  /** Catalog endpoint, e.g. `https://api.sdkwork.com/app/v3/api/ai/model_catalog`. */
  readonly endpoint: string
  /** Where accepted catalogs are published. */
  readonly store: ModelCatalogStore
  /** Durable local copy. */
  readonly persistence: CatalogPersistence
  /** Network implementation. */
  readonly transport: CatalogTransport
  /** Reads the current bearer credential, when the deployment has one. */
  readonly readToken?: () => string | undefined
  /** Supplies the build-time seed used before the first successful sync. */
  readonly readSeed?: () => ModelCatalogSnapshot | undefined
  /** Clock; defaults to the system clock. */
  readonly now?: () => Date
  /** Delay function used by retries; defaults to `setTimeout`. */
  readonly sleep?: (milliseconds: number) => Promise<void>
  /** Attempts per request, including the first. Defaults to 3. */
  readonly maxAttempts?: number
  /** First retry delay. Defaults to 1000 ms. */
  readonly baseBackoffMs?: number
  /** Retry delay cap. Defaults to 60000 ms. */
  readonly maxBackoffMs?: number
  /** Snapshot page size. Defaults to 500 (the contract maximum). */
  readonly pageSize?: number
  /** Poll interval; `0` disables polling. Defaults to 30 minutes. */
  readonly pollIntervalMs?: number
  /** Whether the delta endpoint may be used after a backend snapshot. Defaults to true. */
  readonly useDelta?: boolean
  /** Receives every state transition. */
  readonly onStatus?: (status: ModelCatalogSyncStatus) => void
  /** Receives protocol diagnostics; never receives credential material. */
  readonly logger?: (event: string, detail?: unknown) => void
}

const DEFAULT_ATTEMPTS = 3
const DEFAULT_BASE_BACKOFF_MS = 1000
const DEFAULT_MAX_BACKOFF_MS = 60_000
const DEFAULT_PAGE_SIZE = 500
const DEFAULT_POLL_INTERVAL_MS = 30 * 60 * 1000

/** Options after defaults and bounds are applied. */
interface ResolvedSyncOptions {
  readonly endpoint: string
  readonly store: ModelCatalogStore
  readonly persistence: CatalogPersistence
  readonly transport: CatalogTransport
  readonly maxAttempts: number
  readonly baseBackoffMs: number
  readonly maxBackoffMs: number
  readonly pageSize: number
  readonly pollIntervalMs: number
  readonly useDelta: boolean
  readonly readToken?: () => string | undefined
  readonly readSeed?: () => ModelCatalogSnapshot | undefined
  readonly now?: () => Date
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly onStatus?: (status: ModelCatalogSyncStatus) => void
  readonly logger?: (event: string, detail?: unknown) => void
}

function header(headers: CatalogHttpHeaders, name: string): string | undefined {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value
  }
  return undefined
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/** A transport or HTTP failure that carries a stable code. */
class CatalogRequestError extends Error {
  readonly code: ModelCatalogSyncFailureCode
  readonly status: number | undefined

  constructor(code: ModelCatalogSyncFailureCode, message: string, status?: number) {
    super(message)
    this.name = 'CatalogRequestError'
    this.code = code
    this.status = status
  }
}

function readJsonBody(response: CatalogHttpResponse): unknown {
  if (response.body === undefined || response.body.length === 0) {
    throw new ModelCatalogContractError('model_catalog.invalid_document', 'model catalog response has no body')
  }
  try {
    return JSON.parse(response.body) as unknown
  } catch {
    throw new ModelCatalogContractError('model_catalog.invalid_document', 'model catalog response is not JSON')
  }
}

/** Versioned model-catalog synchronization client. */
export class ModelCatalogSync {
  readonly #options: ResolvedSyncOptions
  #state: ModelCatalogSyncState = 'idle'
  #etag: string | undefined
  #lastCheckedAt: string | undefined
  #lastSyncedAt: string | undefined
  #lastErrorCode: ModelCatalogSyncFailureCode | undefined
  #lastErrorMessage: string | undefined
  #hydrating: Promise<void> | undefined
  #inFlight: Promise<ModelCatalogSyncResult> | undefined
  #timer: (ReturnType<typeof setInterval> & { unref?: () => void }) | undefined
  #started = false
  #disposed = false

  constructor(options: ModelCatalogSyncOptions) {
    const endpoint = options.endpoint.replace(/\/+$/u, '')
    if (endpoint.length === 0) throw new Error('model catalog sync needs a non-empty endpoint')
    this.#options = {
      endpoint,
      store: options.store,
      persistence: options.persistence,
      transport: options.transport,
      maxAttempts: Math.max(1, options.maxAttempts ?? DEFAULT_ATTEMPTS),
      baseBackoffMs: Math.max(1, options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS),
      maxBackoffMs: Math.max(1, options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS),
      pageSize: Math.max(1, Math.min(500, options.pageSize ?? DEFAULT_PAGE_SIZE)),
      pollIntervalMs: Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS),
      useDelta: options.useDelta ?? true,
      ...(options.readToken === undefined ? {} : { readToken: options.readToken }),
      ...(options.readSeed === undefined ? {} : { readSeed: options.readSeed }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
      ...(options.onStatus === undefined ? {} : { onStatus: options.onStatus }),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    }
  }

  /** The store this client publishes into. */
  get store(): ModelCatalogStore {
    return this.#options.store
  }

  /** Current synchronization diagnostics. */
  status(): ModelCatalogSyncStatus {
    const view = this.#options.store.view
    return {
      state: this.#state,
      ...(view === undefined ? {} : { revision: view.snapshot.revision, catalogVersion: view.snapshot.catalogVersion }),
      ...(this.#etag === undefined ? {} : { etag: this.#etag }),
      ...(this.#lastCheckedAt === undefined ? {} : { lastCheckedAt: this.#lastCheckedAt }),
      ...(this.#lastSyncedAt === undefined ? {} : { lastSyncedAt: this.#lastSyncedAt }),
      ...(this.#lastErrorCode === undefined ? {} : { lastErrorCode: this.#lastErrorCode }),
      ...(this.#lastErrorMessage === undefined ? {} : { lastErrorMessage: this.#lastErrorMessage }),
    }
  }

  /**
   * Publish the persisted catalog (or the seed) before any network activity.
   * Idempotent; a second call after a publication does nothing.
   */
  async hydrate(): Promise<void> {
    if (this.#disposed) return
    if (this.#options.store.view !== undefined) return
    let local: ModelCatalogSnapshot | undefined
    try {
      const persisted = await this.#options.persistence.load()
      local = persisted?.snapshot
      if (persisted?.etag !== undefined) this.#etag = persisted.etag
      if (local !== undefined) {
        this.#publish(local, 'backend')
        return
      }
    } catch (error) {
      this.#options.logger?.('model_catalog.hydrate_persistence_failed', error)
    }
    const seed = this.#options.readSeed?.()
    if (seed !== undefined) this.#publish(seed, 'seed')
  }

  /** Start polling. Hydrates first, then synchronizes immediately. */
  async start(): Promise<void> {
    if (this.#started || this.#disposed) return
    this.#started = true
    await this.hydrate()
    void this.syncNow()
    if (this.#options.pollIntervalMs > 0) {
      const timer = setInterval(() => {
        void this.syncNow()
      }, this.#options.pollIntervalMs) as ReturnType<typeof setInterval> & { unref?: () => void }
      timer.unref?.()
      this.#timer = timer
    }
  }

  /** Stop polling. The published catalog stays available. */
  stop(): void {
    this.#started = false
    if (this.#timer !== undefined) {
      clearInterval(this.#timer)
      this.#timer = undefined
    }
  }

  /** Stop polling and release the store reference. */
  dispose(): void {
    this.stop()
    this.#disposed = true
  }

  /**
   * Run one synchronization attempt. Concurrent callers share the same
   * attempt; the result reports success, no-op, or a stable failure.
   * @returns the attempt outcome.
   */
  async syncNow(): Promise<ModelCatalogSyncResult> {
    if (this.#disposed) return { status: 'failed', code: 'model_catalog.unavailable', message: 'model catalog sync is disposed' }
    if (this.#inFlight !== undefined) return this.#inFlight
    const attempt = this.#run().finally(() => {
      this.#inFlight = undefined
    })
    this.#inFlight = attempt
    return attempt
  }

  async #run(): Promise<ModelCatalogSyncResult> {
    await this.#ensureHydrated()
    this.#lastCheckedAt = this.#now()
    this.#setState('syncing')
    try {
      const outcome = await this.#exchange()
      this.#lastErrorCode = undefined
      this.#lastErrorMessage = undefined
      this.#setState('current')
      if (outcome.kind === 'not-modified') return { status: 'not-modified', revision: outcome.revision }
      if (outcome.kind === 'empty') return { status: 'empty', revision: outcome.revision }
      this.#lastSyncedAt = this.#now()
      return { status: 'applied', revision: outcome.revision, delta: outcome.delta }
    } catch (error) {
      const failure = this.#classify(error)
      this.#lastErrorCode = failure.code
      this.#lastErrorMessage = failure.message
      this.#setState(failure.code === 'model_catalog.transport_failed' || failure.code === 'model_catalog.unavailable' ? 'offline' : 'degraded')
      this.#options.logger?.('model_catalog.sync_failed', failure)
      return { status: 'failed', code: failure.code, message: failure.message }
    }
  }

  async #ensureHydrated(): Promise<void> {
    if (this.#options.store.view !== undefined) return
    this.#hydrating ??= this.hydrate().finally(() => {
      this.#hydrating = undefined
    })
    await this.#hydrating
  }

  async #exchange(): Promise<
    | { readonly kind: 'not-modified'; readonly revision: number }
    | { readonly kind: 'applied'; readonly revision: number; readonly delta: boolean }
    | { readonly kind: 'empty'; readonly revision: number }
  > {
    const current = this.#options.store.view
    if (current !== undefined && current.source === 'backend' && this.#options.useDelta) {
      const delta = await this.#tryDelta(current.snapshot)
      if (delta !== 'fallback') return delta
    }
    // Only a backend-sourced snapshot participates in revision comparison: a
    // build-time seed carries no server revision, so it must never suppress the
    // first backend catalog by happening to share its number.
    return this.#syncFullSnapshot(current?.source === 'backend' ? current.snapshot : undefined)
  }

  async #tryDelta(snapshot: ModelCatalogSnapshot): Promise<
    | { readonly kind: 'not-modified'; readonly revision: number }
    | { readonly kind: 'applied'; readonly revision: number; readonly delta: boolean }
    | 'fallback'
  > {
    let since = snapshot.revision
    for (;;) {
      const response = await this.#request(
        `/changes?since_revision=${since}`,
        this.#etag === undefined ? {} : { 'if-none-match': this.#etag },
      )
      if (response.status === 304) return { kind: 'not-modified', revision: since }
      if (response.status === 409) return 'fallback'
      if (response.status === 422) {
        throw new ModelCatalogContractError('model_catalog.version_unsupported', 'server rejected the catalog schema version')
      }
      this.#assertOk(response, 'model catalog delta')
      const delta = parseModelCatalogDelta(readJsonBody(response), { currentRevision: since })
      if (delta.revision <= since) return { kind: 'not-modified', revision: since }
      const view = await this.#applyDelta(delta, response)
      if (!delta.hasMore) return { kind: 'applied', revision: view.snapshot.revision, delta: true }
      // A paged delta is a sequence of single-revision deltas: the next request
      // follows the revision just applied, and a server that names a different
      // next revision cannot be followed safely.
      if (delta.nextSinceRevision !== undefined && delta.nextSinceRevision !== delta.revision) {
        throw new ModelCatalogContractError('model_catalog.invalid_cursor', 'delta pagination did not advance to its own revision')
      }
      since = delta.revision
    }
  }

  async #applyDelta(delta: ModelCatalogDelta, response: CatalogHttpResponse): Promise<{ readonly snapshot: ModelCatalogSnapshot }> {
    this.#recordEtag(response)
    const view = this.#options.store.applyDelta(delta)
    await this.#options.persistence.save(view.snapshot, this.#etag === undefined ? {} : { etag: this.#etag })
    return view
  }

  async #syncFullSnapshot(held: ModelCatalogSnapshot | undefined): Promise<
    | { readonly kind: 'not-modified'; readonly revision: number }
    | { readonly kind: 'applied'; readonly revision: number; readonly delta: boolean }
    | { readonly kind: 'empty'; readonly revision: number }
  > {
    for (let restart = 0; restart < 2; restart += 1) {
      try {
        return await this.#collectSnapshot(held)
      } catch (error) {
        if (error instanceof ModelCatalogContractError && error.code === 'model_catalog.revision_changed_during_pagination' && restart === 0) {
          this.#options.logger?.('model_catalog.pagination_restarted', error.message)
          continue
        }
        throw error
      }
    }
    throw new ModelCatalogContractError('model_catalog.revision_changed_during_pagination', 'model catalog revision kept changing during pagination')
  }

  async #collectSnapshot(held: ModelCatalogSnapshot | undefined): Promise<
    | { readonly kind: 'not-modified'; readonly revision: number }
    | { readonly kind: 'applied'; readonly revision: number; readonly delta: boolean }
    | { readonly kind: 'empty'; readonly revision: number }
  > {
    let first: ModelCatalogSnapshot | undefined
    let cursor: string | undefined
    let expectedRevision: number | undefined
    const vendors: ModelCatalogVendor[] = []
    const models: ModelCatalogModel[] = []
    const parameters: ModelParameterDescriptor[] = []
    let etag: string | undefined
    for (;;) {
      const query = cursor === undefined
        ? `?page_size=${this.#options.pageSize}`
        : `?page_size=${this.#options.pageSize}&cursor=${encodeURIComponent(cursor)}`
      const headers = first === undefined && this.#etag !== undefined ? { 'if-none-match': this.#etag } : {}
      const response = await this.#request(query, headers)
      if (response.status === 304) return { kind: 'not-modified', revision: held?.revision ?? 0 }
      if (response.status === 422) {
        throw new ModelCatalogContractError('model_catalog.version_unsupported', 'server rejected the catalog schema version')
      }
      this.#assertOk(response, 'model catalog snapshot')
      const page = parseModelCatalogSnapshot(readJsonBody(response))
      if (first === undefined) {
        first = page
        expectedRevision = page.revision
        etag = header(response.headers, 'etag')
      } else if (page.revision !== expectedRevision) {
        throw new ModelCatalogContractError(
          'model_catalog.revision_changed_during_pagination',
          `model catalog revision changed from ${String(expectedRevision)} to ${page.revision} during pagination`,
        )
      }
      vendors.push(...(page.vendors ?? []))
      models.push(...(page.models ?? []))
      parameters.push(...(page.parameters ?? []))
      if (!page.pageInfo.hasMore) break
      if (page.pageInfo.nextCursor === undefined || page.pageInfo.nextCursor === null || page.pageInfo.nextCursor.length === 0) {
        throw new ModelCatalogContractError('model_catalog.invalid_cursor', 'model catalog page declares more pages without a cursor')
      }
      cursor = page.pageInfo.nextCursor
    }
    if (first === undefined) throw new ModelCatalogContractError('model_catalog.invalid_document', 'model catalog returned no page')
    if (held !== undefined && first.revision <= held.revision) {
      this.#recordEtagFromValue(etag)
      return { kind: 'not-modified', revision: held.revision }
    }
    const assembled = deepFreeze({
      ...first,
      ...(vendors.length === 0 ? {} : { vendors }),
      ...(models.length === 0 ? {} : { models }),
      ...(parameters.length === 0 ? {} : { parameters }),
      pageInfo: completePageInfo(models.length),
    })
    if (models.length === 0) {
      // An empty backend catalog means "not configured", not "every model was
      // removed": keep whatever seed or persisted catalog is already published.
      const currentView = this.#options.store.view
      if (currentView !== undefined && (currentView.snapshot.models?.length ?? 0) > 0) {
        this.#recordEtagFromValue(etag)
        return { kind: 'empty', revision: currentView.snapshot.revision }
      }
    }
    this.#options.store.publish(assembled, { source: 'backend' })
    this.#recordEtagFromValue(etag)
    await this.#options.persistence.save(assembled, etag === undefined ? {} : { etag })
    return { kind: 'applied', revision: assembled.revision, delta: false }
  }

  async #request(path: string, extraHeaders: CatalogHttpHeaders): Promise<CatalogHttpResponse> {
    const token = this.#options.readToken?.()
    const headers: CatalogHttpHeaders = {
      accept: 'application/json',
      ...(token === undefined || token.length === 0 ? {} : { authorization: `Bearer ${token}` }),
      ...extraHeaders,
    }
    const url = `${this.#options.endpoint}${path}`
    let lastError: unknown
    for (let attempt = 1; attempt <= this.#options.maxAttempts; attempt += 1) {
      try {
        const response = await this.#options.transport.send({ url, method: 'GET', headers })
        if (!retryableStatus(response.status) || attempt === this.#options.maxAttempts) return response
        await this.#waitBeforeRetry(attempt, header(response.headers, 'retry-after'))
      } catch (error) {
        lastError = error
        if (attempt === this.#options.maxAttempts) {
          throw new CatalogRequestError(
            'model_catalog.transport_failed',
            `model catalog request failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        await this.#waitBeforeRetry(attempt, undefined)
      }
    }
    throw new CatalogRequestError(
      'model_catalog.transport_failed',
      `model catalog request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    )
  }

  async #waitBeforeRetry(attempt: number, retryAfter: string | undefined): Promise<void> {
    const seconds = retryAfter === undefined ? undefined : Number(retryAfter)
    const hinted = seconds !== undefined && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
    const delay = hinted ?? Math.min(this.#options.maxBackoffMs, this.#options.baseBackoffMs * 2 ** (attempt - 1))
    await this.#sleep(delay)
  }

  #assertOk(response: CatalogHttpResponse, label: string): void {
    if (response.status >= 200 && response.status < 300) return
    if (response.status === 401) throw new CatalogRequestError('model_catalog.unauthorized', `${label} needs a valid credential`, 401)
    if (response.status === 403) throw new CatalogRequestError('model_catalog.forbidden', `${label} is not permitted for this credential`, 403)
    if (response.status === 404) throw new CatalogRequestError('model_catalog.model_not_found', `${label} is not available`, 404)
    if (response.status === 429) throw new CatalogRequestError('model_catalog.rate_limited', `${label} was rate limited`, 429)
    if (response.status >= 500) throw new CatalogRequestError('model_catalog.unavailable', `${label} is unavailable`, response.status)
    throw new CatalogRequestError('model_catalog.invalid_document', `${label} returned HTTP ${response.status}`, response.status)
  }

  #classify(error: unknown): { readonly code: ModelCatalogSyncFailureCode; readonly message: string } {
    if (error instanceof CatalogRequestError) return { code: error.code, message: error.message }
    if (error instanceof ModelCatalogContractError) return { code: error.code, message: error.message }
    return {
      code: 'model_catalog.transport_failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }

  #publish(snapshot: ModelCatalogSnapshot, source: 'backend' | 'seed'): void {
    this.#options.store.publish(snapshot, { source })
  }

  #recordEtag(response: CatalogHttpResponse): void {
    this.#recordEtagFromValue(header(response.headers, 'etag'))
  }

  #recordEtagFromValue(etag: string | undefined): void {
    if (etag !== undefined) this.#etag = etag
  }

  #setState(state: ModelCatalogSyncState): void {
    this.#state = state
    try {
      this.#options.onStatus?.(this.status())
    } catch {
      // A diagnostics observer must not fail the synchronization it reports on.
    }
  }

  #now(): string {
    return (this.#options.now ?? (() => new Date()))().toISOString()
  }

  #sleep(milliseconds: number): Promise<void> {
    return this.#options.sleep?.(milliseconds) ?? new Promise(resolve => setTimeout(resolve, milliseconds))
  }
}
