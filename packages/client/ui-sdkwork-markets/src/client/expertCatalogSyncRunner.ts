/**
 * Trigger the SDKWork expert-catalog sync from the market page's host adapter.
 *
 * The adapter publishes environment and IAM changes; this runner waits until the
 * gateway is configured, a session is signed in, and the expert market plugin's
 * `agencyAgents` Remote namespace is mounted, then pushes the catalog once per
 * (identity, gateway, locale). A missing Remote — the plugin row may activate
 * after the market page — is retried a bounded number of times. Failures are
 * logged and retried on the next adapter change; the plugin keeps its bundled
 * roster until a sync succeeds.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/expertCatalogSyncRunner
 */
import {
  syncExpertCatalogFromSdkworkAgents,
  type ExpertCatalogSdkClient,
  type ExpertCatalogSyncRemote,
  type ExpertCatalogSyncSummary,
} from './expertCatalogSync.ts'

/** The host-adapter slice the runner reads. */
export interface ExpertCatalogSyncAdapter {
  subscribe(listener: () => void): () => void
  getSnapshot(): { configured: boolean }
  getIdentityKey(): string
  resolveHostLanguage(): string
}

/** Options for {@link startExpertCatalogSync}. */
export interface StartExpertCatalogSyncOptions {
  adapter: ExpertCatalogSyncAdapter
  /** Resolve the plugin's mounted Remote namespace, or undefined while it is absent. */
  resolveRemote: () => ExpertCatalogSyncRemote | undefined
  /** Read the configured generated App SDK client. */
  readClient: () => ExpertCatalogSdkClient
  /** Diagnostic sink; defaults to `console.warn`. */
  log?: (message: string, error?: unknown) => void
  /** Delays between Remote-availability retries; defaults to four attempts. */
  retryDelaysMs?: readonly number[]
}

/** The started sync runner. */
export interface ExpertCatalogSyncRunner {
  dispose(): void
  /** Force one sync attempt (used by focused tests). */
  syncNow(): Promise<ExpertCatalogSyncSummary | undefined>
}

const DEFAULT_RETRY_DELAYS_MS = [250, 1000, 2500, 5000] as const

/**
 * Start the catalog sync runner.
 * @param options - adapter, Remote resolver, client reader, and retry policy.
 * @returns the runner; call `dispose` from the plugin effect.
 */
export function startExpertCatalogSync(options: StartExpertCatalogSyncOptions): ExpertCatalogSyncRunner {
  const log = options.log ?? ((message, error) =>{  console.warn(`[sdkwork-markets] ${message}`, error) })
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  let disposed = false
  let inFlight = false
  let retryIndex = 0
  let lastKey = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let off: (() => void) | undefined

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const scheduleRetry = (): void => {
    if (disposed || retryIndex >= retryDelays.length) return
    const delay = retryDelays[retryIndex] ?? 0
    retryIndex += 1
    clearTimer()
    timer = setTimeout(() => {
      timer = undefined
      void run()
    }, delay)
  }

  const syncNow = async (): Promise<ExpertCatalogSyncSummary | undefined> => {
    if (disposed) return undefined
    const snapshot = options.adapter.getSnapshot()
    const identity = options.adapter.getIdentityKey()
    if (!snapshot.configured || identity === '') return undefined
    const remote = options.resolveRemote()
    if (remote === undefined) {
      scheduleRetry()
      return undefined
    }
    const locale = options.adapter.resolveHostLanguage() === 'en-US' ? 'en-US' : 'zh-CN'
    const key = `${identity}|${locale}|${snapshot.configured}`
    if (key === lastKey) return undefined
    if (inFlight) return undefined
    inFlight = true
    try {
      const summary = await syncExpertCatalogFromSdkworkAgents({
        client: options.readClient(),
        remote,
        locale: locale,
      })
      lastKey = key
      retryIndex = 0
      clearTimer()
      return summary
    } catch (error) {
      log('expert catalog sync failed; keeping the bundled roster', error)
      return undefined
    } finally {
      inFlight = false
    }
  }

  const run = (): Promise<ExpertCatalogSyncSummary | undefined> => syncNow()

  off = options.adapter.subscribe(() => {
    retryIndex = 0
    void run()
  })
  void run()

  return {
    async syncNow() {
      lastKey = ''
      return run()
    },
    dispose() {
      disposed = true
      clearTimer()
      off?.()
      off = undefined
    },
  }
}
