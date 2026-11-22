/**
 * Remote front-end model configuration for the BirdCoder relay route.
 *
 * The relay route seeds from the SDKWork models catalog projected at build
 * time. Operators also publish a per-tenant front-end model configuration
 * (which catalog models each product surface exposes, in which order, enabled
 * or disabled) through the models backend, and that document changes whenever
 * vendors publish models or an operator disables one. This module loads that
 * document and turns the relay surface's exposure into an ordered allow-list
 * for the `llm-pi-ai` relay catalog policy.
 *
 * The document is read from one of two projections:
 *
 * - an explicit `documentFile` — the seat a shell or deployment uses when it
 *   holds the IAM tokens itself and must not hand them to this child process;
 * - the app-api endpoint, authenticated with the dual-token session. A
 *   deployment whose Host can read the complete session (a headless/service
 *   launch, or a desktop launch without an OS secret store) uses this path.
 *
 * Failures never wipe the last known exposure: an unreachable endpoint, a
 * rejected credential, or an invalid document keeps whatever was published
 * last, and a build-time seed remains the offline fallback.
 *
 * @module @deepseek-ai/dsh-birdcoder-account/model-catalog
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Schema version this module accepts from a projected or remote document. */
export const FRONTEND_MODEL_CONFIG_SCHEMA_VERSION = '1.0.0'

/** Size bound for a projected or remote document. */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024

/** Bound on channels one document may carry. */
const MAX_CHANNELS = 128

/** Bound on exposed models one channel may carry. */
const MAX_CHANNEL_MODELS = 5_000

/** Default surface the relay exposes. */
export const DEFAULT_CHANNEL_CODE = 'llm'

/** Default app-api path of the front-end model configuration. */
export const FRONTEND_MODEL_CONFIG_PATH = '/app/v3/api/ai/frontend_config'

/** Default relay origin whose app-api serves the configuration. */
export const DEFAULT_RELAY_ORIGIN = 'https://api.birdcoder.com'

/** First retry delay, doubled per attempt. */
const RETRY_BASE_MS = 250

/** Attempts per refresh, including the first. */
const REFRESH_ATTEMPTS = 2

/** Consecutive token-less refreshes before a previously applied policy is withdrawn. */
const SESSION_GONE_POLLS = 3

/** One exposed model row, narrowed to what the relay needs. */
export interface FrontendModelConfigModel {
  /** Stable catalog key, `<vendorCode>/<modelId>`. */
  readonly catalogKey: string
  /** Whether the surface exposes the model. */
  readonly visible: boolean
  /** Presentation order. */
  readonly sortOrder: number
}

/** One product surface of the configuration document. */
export interface FrontendModelConfigChannel {
  /** Surface code, e.g. `llm`. */
  readonly channelCode: string
  /** Whether the surface is enabled. */
  readonly enabled: boolean
  /** Presentation order of the surface. */
  readonly sortOrder: number
  /** Catalog capabilities the surface serves. */
  readonly capabilityCodes: readonly string[]
  /** Every exposed model, visible or hidden. */
  readonly models: readonly FrontendModelConfigModel[]
}

/** The validated front-end model configuration document. */
export interface FrontendModelConfig {
  /** Published configuration revision. */
  readonly revision: number
  /** Configuration channels. */
  readonly channels: readonly FrontendModelConfigChannel[]
}

/** A document that failed validation. */
export class FrontendModelConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrontendModelConfigError'
  }
}

/** One diagnostic sink; the plugin binds it to the Host logger. */
export type ModelCatalogLog = (level: 'info' | 'warn', message: string, error?: unknown) => void

/** Status of the last synchronization attempt. */
export type ModelCatalogLoadStatus =
  | 'idle'
  | 'applying'
  | 'current'
  | 'not-modified'
  | 'degraded'
  | 'unavailable'
  | 'signed-out'

/** One refresh outcome. */
export type ModelCatalogLoadResult =
  | { readonly status: 'applied'; readonly revision: number; readonly keyCount: number }
  | { readonly status: 'not-modified'; readonly revision: number }
  | { readonly status: 'skipped'; readonly reason: 'disabled' | 'no-session' | 'no-token' }
  | { readonly status: 'failed'; readonly code: ModelCatalogErrorCode; readonly message: string }

/** Stable failure codes. */
export type ModelCatalogErrorCode =
  | 'model_catalog.invalid_document'
  | 'model_catalog.unauthorized'
  | 'model_catalog.forbidden'
  | 'model_catalog.unavailable'
  | 'model_catalog.transport_failed'
  | 'model_catalog.unreadable_file'

/** Tokens one refresh may present to the app API. */
export interface ModelCatalogSessionTokens {
  readonly authToken: string
  readonly accessToken: string
}

/** Resolved loader options. */
export interface FrontendModelCatalogLoaderOptions {
  /** Relay provider route the policy belongs to. */
  provider: string
  /** Product surface whose exposure drives the relay catalog. */
  channelCode: string
  /** Absolute app-api URL; empty disables the remote path. */
  endpoint: string
  /** Absolute path of a pre-fetched configuration document; empty disables it. */
  documentFile: string
  /** Absolute path of the complete IAM session, when one is readable. */
  sessionFile: string
  /** Explicit credential overriding the session's auth token. */
  authToken?: string
  /** Explicit credential overriding the session's access token. */
  accessToken?: string
  /** Absolute path the last accepted document is persisted to. */
  cacheFile: string
  /** Refresh interval; `0` leaves only the initial and manual refreshes. */
  pollIntervalMs: number
  /** Per-request timeout. */
  timeoutMs: number
  /** Applies the selected keys; `undefined` withdraws a previously applied policy. */
  applyPolicy: (
    catalogKeys: readonly string[] | undefined,
    metadata: { readonly revision: number; readonly updatedAt: string; readonly source: string },
  ) => void
  /** Diagnostic sink. */
  log?: ModelCatalogLog
  /** Clock, for tests. */
  now?: () => Date
  /** File reader, for tests. */
  readFile?: (path: string) => string
  /** HTTP implementation, for tests. */
  fetch?: typeof fetch
}

/** Diagnostics reported to surfaces. */
export interface FrontendModelCatalogStatus {
  readonly provider: string
  readonly channelCode: string
  readonly state: ModelCatalogLoadStatus
  readonly revision?: number
  readonly lastCheckedAt?: string
  readonly lastSyncedAt?: string
  readonly lastErrorCode?: ModelCatalogErrorCode
  readonly lastErrorMessage?: string
}

/** Read one member of a narrowed JSON object without an `any` cast. */
function member(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key]
}

/** Whether one value is a plain object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A finite non-negative integer, or the fallback. */
function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

/**
 * Validate one configuration document. The document is the models backend's
 * revisioned surface document; unknown members are ignored so a newer backend
 * stays readable.
 * @param value - parsed JSON value.
 * @returns the validated document.
 * @throws FrontendModelConfigError when the shape is not readable.
 */
export function parseFrontendModelConfig(value: unknown): FrontendModelConfig {
  if (!isObject(value)) throw new FrontendModelConfigError('front-end model configuration is not an object')
  const channels = member(value, 'channels')
  if (!Array.isArray(channels)) throw new FrontendModelConfigError('front-end model configuration has no channels array')
  if (channels.length > MAX_CHANNELS) throw new FrontendModelConfigError('front-end model configuration has too many channels')
  const revision = nonNegativeInteger(member(value, 'revision'), 0)
  const parsed: FrontendModelConfigChannel[] = []
  for (const channel of channels) {
    if (!isObject(channel)) continue
    const channelCode = member(channel, 'channelCode')
    if (typeof channelCode !== 'string' || channelCode.trim() === '') continue
    const models = member(channel, 'models')
    const parsedModels: FrontendModelConfigModel[] = []
    if (Array.isArray(models)) {
      for (const model of models.slice(0, MAX_CHANNEL_MODELS)) {
        if (!isObject(model)) continue
        const catalogKey = member(model, 'catalogKey')
        if (typeof catalogKey !== 'string' || catalogKey.trim() === '') continue
        parsedModels.push({
          catalogKey: catalogKey.trim(),
          visible: member(model, 'visible') !== false,
          sortOrder: nonNegativeInteger(member(model, 'sortOrder'), 0),
        })
      }
    }
    const capabilityCodes = member(channel, 'capabilityCodes')
    parsed.push({
      channelCode: channelCode.trim(),
      enabled: member(channel, 'enabled') !== false,
      sortOrder: nonNegativeInteger(member(channel, 'sortOrder'), 0),
      capabilityCodes: Array.isArray(capabilityCodes)
        ? capabilityCodes.filter((code): code is string => typeof code === 'string')
        : [],
      models: parsedModels,
    })
  }
  return { revision, channels: parsed }
}

/**
 * The ordered catalog keys one surface exposes.
 *
 * An explicit channel that is disabled, or that exposes no visible model,
 * yields an empty list: the operator hid the surface, so the relay must not
 * fall back to the seed. When the named surface is absent, the first enabled
 * surface serves as the answer, and an entirely absent or disabled document
 * still yields the empty list.
 * @param document - validated configuration document.
 * @param channelCode - surface the relay corresponds to.
 * @returns deduplicated catalog keys in presentation order.
 */
export function selectExposureKeys(document: FrontendModelConfig, channelCode: string): string[] {
  const named = document.channels.find(channel => channel.channelCode === channelCode)
  const channel = named ?? [...document.channels]
    .filter(candidate => candidate.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder)[0]
  if (channel === undefined || !channel.enabled) return []
  const visible = channel.models
    .filter(model => model.visible)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.catalogKey.localeCompare(right.catalogKey))
  const seen = new Set<string>()
  const keys: string[] = []
  for (const model of visible) {
    if (seen.has(model.catalogKey)) continue
    seen.add(model.catalogKey)
    keys.push(model.catalogKey)
  }
  return keys
}

/** One persisted cache entry. */
interface CatalogCacheFile {
  readonly version: 1
  readonly etag?: string
  readonly savedAt: string
  readonly document: FrontendModelConfig
}

/**
 * Resolve the app-api endpoint for a relay origin.
 * @param origin - relay origin such as `https://api.birdcoder.com`.
 * @returns the absolute configuration URL.
 */
export function frontendModelConfigEndpoint(origin: string): string {
  return `${origin.replace(/\/+$/u, '')}${FRONTEND_MODEL_CONFIG_PATH}`
}

/**
 * Read the complete IAM session when it is readable in this process. An
 * encrypted session (the desktop shell's OS-secret-store file) is not.
 * @param path - absolute session file path.
 * @param readFile - file reader.
 * @returns both tokens, or `undefined` when the file is unreadable, encrypted, or incomplete.
 */
export function readSessionTokens(
  path: string,
  readFile: (file: string) => string = file => readFileSync(file, 'utf8'),
): ModelCatalogSessionTokens | undefined {
  let text: string
  try {
    text = readFile(path)
  } catch {
    return undefined
  }
  if (text.length > MAX_DOCUMENT_BYTES) return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isObject(value) || member(value, 'encrypted') === true) return undefined
  const authToken = member(value, 'authToken')
  const accessToken = member(value, 'accessToken')
  if (typeof authToken !== 'string' || authToken.trim() === '') return undefined
  if (typeof accessToken !== 'string' || accessToken.trim() === '') return undefined
  return { authToken: authToken.trim(), accessToken: accessToken.trim() }
}

/**
 * Read the document member of a projected or cached envelope.
 *
 * Two writers persist a document here: this loader's own cache
 * (`{ version, savedAt, document }`) and the desktop shell's projection
 * (`{ version, savedAt, source, document }`). Both wrap the configuration, so
 * the reader accepts the wrapper and, defensively, a bare document.
 * @param value - parsed JSON value.
 * @returns the configuration candidate.
 */
function documentMember(value: unknown): unknown {
  if (isObject(value) && isObject(member(value, 'document'))) return member(value, 'document')
  return value
}

/**
 * One HTTP exchange result.
 */
type ExchangeResult =
  | { readonly kind: 'not-modified' }
  | { readonly kind: 'document'; readonly body: string; readonly etag?: string }
  | { readonly kind: 'failure'; readonly code: ModelCatalogErrorCode; readonly message: string; readonly retryable: boolean }

/**
 * Load the remote front-end configuration and publish the relay exposure.
 *
 * Construction performs no I/O. {@link start} hydrates the persisted snapshot,
 * publishes it, performs the first refresh, and installs the poll timer.
 */
export class FrontendModelCatalogLoader {
  private readonly options: FrontendModelCatalogLoaderOptions
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date
  private readonly readFile: (path: string) => string
  private timer: ReturnType<typeof setInterval> | undefined
  private inflight: Promise<ModelCatalogLoadResult> | undefined
  private disposed = false
  private state: ModelCatalogLoadStatus = 'idle'
  private etag: string | undefined
  private revision: number | undefined
  private lastCheckedAt: string | undefined
  private lastSyncedAt: string | undefined
  private lastErrorCode: ModelCatalogErrorCode | undefined
  private lastErrorMessage: string | undefined
  private missingSessionPolls = 0
  private applied = false
  private hydrated = false
  private lastProjectedSignature: string | undefined
  private lastPublished: {
    readonly keys: readonly string[]
    readonly revision: number
    readonly updatedAt: string
    readonly source: string
  } | undefined

  constructor(options: FrontendModelCatalogLoaderOptions) {
    this.options = options
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date())
    this.readFile = options.readFile ?? (path => readFileSync(path, 'utf8'))
  }

  /** Current diagnostics. */
  status(): FrontendModelCatalogStatus {
    return {
      provider: this.options.provider,
      channelCode: this.options.channelCode,
      state: this.state,
      ...(this.revision === undefined ? {} : { revision: this.revision }),
      ...(this.lastCheckedAt === undefined ? {} : { lastCheckedAt: this.lastCheckedAt }),
      ...(this.lastSyncedAt === undefined ? {} : { lastSyncedAt: this.lastSyncedAt }),
      ...(this.lastErrorCode === undefined ? {} : { lastErrorCode: this.lastErrorCode }),
      ...(this.lastErrorMessage === undefined ? {} : { lastErrorMessage: this.lastErrorMessage }),
    }
  }

  /** Hydrate the persisted snapshot, publish it, refresh once, and start polling. */
  start(): void {
    if (this.disposed) return
    this.hydrated = true
    this.hydrate()
    void this.refresh()
    if (this.options.pollIntervalMs > 0) {
      this.timer = setInterval(() => { void this.refresh() }, this.options.pollIntervalMs)
      this.timer.unref()
    }
  }

  /** Stop polling. A published policy stays in effect. */
  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /** Stop polling and release state. */
  dispose(): void {
    this.stop()
    this.disposed = true
  }

  /**
   * Re-publish the last accepted exposure.
   *
   * A consumer that mounts after the first publication (the adapter plugin can
   * load in any order) misses the event; re-emitting on the registry's
   * readiness notification makes the policy order-independent. Withdrawals are
   * not replayed: a withdrawn policy has nothing to restore.
   */
  republish(): void {
    const last = this.lastPublished
    if (last === undefined || this.disposed) return
    this.options.applyPolicy(last.keys, {
      revision: last.revision,
      updatedAt: last.updatedAt,
      source: last.source,
    })
  }

  /**
   * Run one refresh. Concurrent callers share the attempt.
   * @returns the attempt outcome.
   */
  refresh(): Promise<ModelCatalogLoadResult> {
    if (this.disposed) return Promise.resolve({ status: 'skipped', reason: 'disabled' })
    this.inflight ??= this.run().finally(() => { this.inflight = undefined })
    return this.inflight
  }

  /** Read and apply the persisted snapshot written by the last accepted refresh. */
  private hydrate(): void {
    let text: string
    try {
      text = this.readFile(this.options.cacheFile)
    } catch {
      return
    }
    if (text.length > MAX_DOCUMENT_BYTES) return
    try {
      const value: unknown = JSON.parse(text)
      if (!isObject(value) || member(value, 'version') !== 1) return
      const document = parseFrontendModelConfig(documentMember(value))
      const etag = member(value, 'etag')
      this.etag = typeof etag === 'string' ? etag : undefined
      this.revision = document.revision
      this.applyDocument(document, 'cache')
    } catch (error) {
      this.options.log?.('warn', 'birdcoder-account: persisted front-end model configuration is unusable', error)
    }
  }

  /** One refresh attempt. */
  private async run(): Promise<ModelCatalogLoadResult> {
    if (!this.hydrated) {
      this.hydrated = true
      this.hydrate()
    }
    this.lastCheckedAt = this.now().toISOString()
    // A deployment-projected document needs no credential: the writer already
    // authenticated. Read it first so a desktop launch with an encrypted
    // session still reflects the operator's surface.
    if (this.options.documentFile !== '') {
      const projected = this.readProjectedDocument()
      if (projected !== undefined) return projected
    }
    const tokens = this.resolveTokens()
    if (tokens === undefined) {
      this.missingSessionPolls += 1
      if (this.applied && this.missingSessionPolls >= SESSION_GONE_POLLS) {
        this.applyPolicy(undefined, 'signed-out')
        this.state = 'signed-out'
      } else {
        this.state = this.applied ? this.state : 'signed-out'
      }
      return { status: 'skipped', reason: 'no-token' }
    }
    this.missingSessionPolls = 0
    this.state = 'applying'
    const exchange = await this.exchange(tokens)
    if (exchange.kind === 'not-modified') {
      this.state = 'not-modified'
      this.lastErrorCode = undefined
      this.lastErrorMessage = undefined
      return { status: 'not-modified', revision: this.revision ?? 0 }
    }
    if (exchange.kind === 'failure') {
      this.lastErrorCode = exchange.code
      this.lastErrorMessage = exchange.message
      this.state = exchange.code === 'model_catalog.transport_failed' || exchange.code === 'model_catalog.unavailable'
        ? 'unavailable'
        : 'degraded'
      this.options.log?.('warn', `birdcoder-account: front-end model configuration load failed: ${exchange.message}`)
      return { status: 'failed', code: exchange.code, message: exchange.message }
    }
    let document: FrontendModelConfig
    try {
      document = parseFrontendModelConfig(JSON.parse(exchange.body) as unknown)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.lastErrorCode = 'model_catalog.invalid_document'
      this.lastErrorMessage = message
      this.state = 'degraded'
      this.options.log?.('warn', 'birdcoder-account: front-end model configuration is invalid', error)
      return { status: 'failed', code: 'model_catalog.invalid_document', message }
    }
    this.etag = exchange.etag ?? this.etag
    const keyCount = this.applyDocument(document, 'app-api')
    this.lastSyncedAt = this.now().toISOString()
    this.lastErrorCode = undefined
    this.lastErrorMessage = undefined
    this.state = 'current'
    this.persist(document)
    return { status: 'applied', revision: document.revision, keyCount }
  }

  /** Read a pre-fetched document, when configured and present. */
  private readProjectedDocument(): ModelCatalogLoadResult | undefined {
    let text: string
    try {
      text = this.readFile(this.options.documentFile)
    } catch {
      return undefined
    }
    if (text.length > MAX_DOCUMENT_BYTES) return undefined
    try {
      const document = parseFrontendModelConfig(documentMember(JSON.parse(text) as unknown))
      const keys = selectExposureKeys(document, this.options.channelCode)
      // The shell rewrites the projection on every refresh; an unchanged
      // document must not re-publish or re-persist on every Host poll.
      const signature = `${String(document.revision)}\u0000${keys.join('\u0000')}`
      this.state = 'current'
      this.lastSyncedAt = this.now().toISOString()
      if (signature === this.lastProjectedSignature) {
        return { status: 'applied', revision: document.revision, keyCount: keys.length }
      }
      this.lastProjectedSignature = signature
      this.applyDocument(document, 'document-file')
      this.persist(document)
      return { status: 'applied', revision: document.revision, keyCount: keys.length }
    } catch (error) {
      this.lastErrorCode = 'model_catalog.invalid_document'
      this.lastErrorMessage = error instanceof Error ? error.message : String(error)
      this.state = 'degraded'
      this.options.log?.('warn', 'birdcoder-account: projected front-end model configuration is invalid', error)
      return {
        status: 'failed',
        code: 'model_catalog.invalid_document',
        message: this.lastErrorMessage,
      }
    }
  }

  /** Resolve the app-api token pair from configuration or the readable session. */
  private resolveTokens(): ModelCatalogSessionTokens | undefined {
    if (this.options.authToken !== undefined && this.options.accessToken !== undefined
      && this.options.authToken !== '' && this.options.accessToken !== '') {
      return { authToken: this.options.authToken, accessToken: this.options.accessToken }
    }
    return readSessionTokens(this.options.sessionFile, this.readFile)
  }

  /** Apply one document and report how many keys were published. */
  private applyDocument(document: FrontendModelConfig, source: string): number {
    const keys = selectExposureKeys(document, this.options.channelCode)
    this.applyPolicy(keys, source, document.revision)
    return keys.length
  }

  /** Publish one exposure through the caller's policy sink. */
  private applyPolicy(
    keys: readonly string[] | undefined,
    source: string,
    revision = this.revision ?? 0,
  ): void {
    this.applied = true
    this.revision = revision
    const metadata = {
      revision,
      updatedAt: this.now().toISOString(),
      source: `birdcoder-account:${source}`,
    }
    if (keys === undefined) {
      // A withdrawal leaves nothing to re-publish.
      this.lastPublished = undefined
    } else {
      this.lastPublished = { keys: Object.freeze([...keys]), ...metadata }
    }
    this.options.applyPolicy(keys, metadata)
  }

  /** Persist the accepted document and validator. */
  private persist(document: FrontendModelConfig): void {
    const payload: CatalogCacheFile = {
      version: 1,
      ...(this.etag === undefined ? {} : { etag: this.etag }),
      savedAt: this.now().toISOString(),
      document,
    }
    const text = JSON.stringify(payload)
    const temporary = `${this.options.cacheFile}.tmp`
    try {
      mkdirSync(dirname(this.options.cacheFile), { recursive: true })
      writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, this.options.cacheFile)
    } catch (error) {
      try { rmSync(temporary, { force: true }) } catch { /* best-effort cleanup */ }
      this.options.log?.('warn', 'birdcoder-account: could not persist front-end model configuration', error)
    }
  }

  /** Perform one conditional GET with a bounded timeout and bounded retries. */
  private async exchange(tokens: ModelCatalogSessionTokens): Promise<ExchangeResult> {
    const endpoint = this.options.endpoint
    if (endpoint === '') return { kind: 'failure', code: 'model_catalog.transport_failed', message: 'no front-end model configuration endpoint configured', retryable: false }
    let last: ExchangeResult | undefined
    for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt += 1) {
      const result = await this.request(endpoint, tokens)
      if (result.kind !== 'failure' || !result.retryable) return result
      last = result
      if (attempt < REFRESH_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, RETRY_BASE_MS * 2 ** (attempt - 1)))
      }
    }
    return last ?? { kind: 'failure', code: 'model_catalog.transport_failed', message: 'request failed', retryable: false }
  }

  /** One conditional GET. */
  private async request(endpoint: string, tokens: ModelCatalogSessionTokens): Promise<ExchangeResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, this.options.timeoutMs)
    timer.unref()
    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        authorization: `Bearer ${tokens.authToken}`,
        'access-token': tokens.accessToken,
      }
      if (this.etag !== undefined) headers['if-none-match'] = this.etag
      const response = await this.fetchImpl(endpoint, { method: 'GET', headers, signal: controller.signal })
      if (response.status === 304) return { kind: 'not-modified' }
      if (response.status === 401) return { kind: 'failure', code: 'model_catalog.unauthorized', message: 'front-end model configuration needs a valid session', retryable: false }
      if (response.status === 403) return { kind: 'failure', code: 'model_catalog.forbidden', message: 'front-end model configuration is not permitted for this session', retryable: false }
      if (response.status === 429 || response.status >= 500) {
        return { kind: 'failure', code: 'model_catalog.unavailable', message: `front-end model configuration returned HTTP ${response.status}`, retryable: true }
      }
      if (!response.ok) {
        return { kind: 'failure', code: 'model_catalog.invalid_document', message: `front-end model configuration returned HTTP ${response.status}`, retryable: false }
      }
      const declared = Number(response.headers.get('content-length') ?? Number.NaN)
      if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) {
        return { kind: 'failure', code: 'model_catalog.invalid_document', message: 'front-end model configuration is too large', retryable: false }
      }
      const body = await response.text()
      if (body.length > MAX_DOCUMENT_BYTES) {
        return { kind: 'failure', code: 'model_catalog.invalid_document', message: 'front-end model configuration is too large', retryable: false }
      }
      const etag = response.headers.get('etag')
      return { kind: 'document', body, ...(etag === null ? {} : { etag }) }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      return {
        kind: 'failure',
        code: 'model_catalog.transport_failed',
        message: aborted ? 'front-end model configuration request timed out' : `front-end model configuration request failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
