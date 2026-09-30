/**
 * Authoritative Automation task catalog: one Remote read of every retained
 * task, with deletion and retry, behind one framework-observable source.
 *
 * The Host `schedule` capability is opt-in, so a read that finds no active
 * Remote method for `schedule/catalog` reports {@link CatalogSnapshot.status}
 * `'unavailable'` rather than a query failure: the page then explains that
 * scheduled tasks are not enabled instead of offering a retry that cannot
 * succeed.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleCatalogEntry, ScheduleDeleteResult, ScheduleId } from '@deepseek-ai/dsh-schedule/client'

/** How one deletion settled; the caller reports it. */
export type CatalogDeleteOutcome = 'deleted' | 'failed' | 'pending'

/** Catalog query state shown to the page. */
export type CatalogStatus =
  /** A read is in flight and no record is authoritative yet. */
  | 'loading'
  /** The newest read succeeded. */
  | 'ready'
  /** The newest read failed for a reason unrelated to capability. */
  | 'error'
  /** No Host Schedule capability is mounted, so no read can succeed. */
  | 'unavailable'

/** Task records and query state exposed to the Automation page. */
export interface CatalogSnapshot {
  /** Every retained Host task, active and inactive, newest read wins. */
  readonly records: readonly ScheduleCatalogEntry[]
  /** State of the newest read. */
  readonly status: CatalogStatus
  /** Tasks with a deletion in flight. */
  readonly deleting: readonly ScheduleId[]
  /**
   * Whether an authoritative read has ever succeeded.
   *
   * A consumer may read `records` as the answer only once this holds: the first
   * snapshot reports `loading` with no records, and a later refresh republishes
   * `loading` over the records of the last successful read, so `status` alone
   * cannot separate a first read from a refresh. A failed read leaves it alone.
   */
  readonly settled: boolean
  /**
   * Count of reads this source has been asked for, by a consumer and by its own
   * `schedule/changed`, connection-reset, and post-deletion acknowledgement
   * paths.
   *
   * Counters rather than timestamps, so the answer never compares the browser's
   * clock with the Host's.
   */
  readonly readRequest: number
  /** Ordinal of the read whose result the current records came from, 0 before any read succeeded. */
  readonly readSettled: number
}

/** Remote operations and invalidations the catalog depends on. */
export interface CatalogDependencies {
  /** Read every retained task. */
  readonly list: () => Promise<RemoteResult<ScheduleCatalogEntry[]>>
  /** Delete one task within its original Session binding. */
  readonly remove: (id: ScheduleId) => Promise<RemoteResult<ScheduleDeleteResult>>
  /** Subscribe to the Host's task-set change notification. */
  readonly subscribeChanged: (listener: () => void) => () => void
  /** Subscribe to connection resets, after which the catalog is re-read. */
  readonly subscribeReset: (listener: () => void) => () => void
}

/** Catalog data and actions injected into the page. */
export interface CatalogInjected {
  /** The observable catalog the framework binds to a `useCatalog` hook. */
  readonly hooks: { readonly catalog: HostObservable<CatalogSnapshot> }
  /**
   * Delete one task and refresh after the Remote acknowledgement.
   * @param id - task shown in the catalog.
   * @returns `'deleted'` after the acknowledged deletion's refreshed read,
   * `'failed'` when the deletion was not confirmed, and `'pending'` when a
   * deletion of the same task was already in flight.
   */
  readonly onDelete: (id: ScheduleId) => Promise<CatalogDeleteOutcome>
  /**
   * Reload the catalog: after a query failure or an acknowledged update, and
   * from a surface that needs a read newer than one it already observed.
   *
   * Requests made in one commit share a single read, so several consumers
   * mounting together still send one. A caller that has already observed a
   * request passes that ordinal as `since`, and only a read requested later
   * than it is shared.
   * @param since - request ordinal the caller last observed, 0 to share any read in flight.
   * @returns Resolution after publishing the read result; failures remain in catalog state.
   */
  readonly onRetry: (since?: number) => Promise<void>
}

/**
 * The Remote failure code the Host returns when no active Remote method exports
 * the endpoint, which is how an unmounted `schedule` row presents itself.
 */
const NO_CAPABILITY_CODE = 'gateway/invocation-unavailable'

/**
 * Create a catalog whose Remote subscriptions follow its framework subscribers.
 * Mutations retain visible rows until an authoritative read succeeds, and each
 * deletion resolves with its own outcome for the caller to report.
 * @param deps - Remote calls and invalidation subscriptions.
 * @returns observable catalog and page callbacks.
 */
export function createCatalogSource(deps: CatalogDependencies): CatalogInjected {
  let snapshot: CatalogSnapshot = {
    records: [], status: 'loading', deleting: [], settled: false, readRequest: 0, readSettled: 0,
  }
  const listeners = new Set<() => void>()
  let disposers: readonly (() => void)[] = []
  let epoch = 0
  let lifecycle = 0
  const publish = (next: CatalogSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  const read = async (request: number, current: number): Promise<void> => {
    let result: RemoteResult<ScheduleCatalogEntry[]>
    try {
      result = await deps.list()
    } catch (_error: unknown) {
      // Transport rejection has the same visible retry path as a Remote failure.
      if (current === epoch) publish({ ...snapshot, status: 'error' })
      return
    }
    if (current !== epoch) return
    publish(result.ok
      ? { ...snapshot, records: result.value, status: 'ready', settled: true, readSettled: request }
      : { ...snapshot, status: result.error.code === NO_CAPABILITY_CODE ? 'unavailable' : 'error' })
  }
  let batching = false
  let inFlight: Promise<void> | undefined
  let inFlightRequest = 0
  // Every mount effect of one commit flushes in one task, so requests made in
  // the same commit share one read. The read is issued synchronously, so a
  // caller observes the read it asked for; the marker clears in a microtask, and
  // a request that has already seen the read in flight starts its own read and
  // supersedes it, so a change published in between is not missed.
  const refresh = (supersede = false, since = 0): Promise<void> => {
    const request = snapshot.readRequest + 1
    publish({ ...snapshot, status: 'loading', readRequest: request })
    if (!supersede && batching && inFlight !== undefined && inFlightRequest > since) return inFlight
    if (!batching) {
      batching = true
      void Promise.resolve().then(() => { batching = false })
    }
    const current = ++epoch
    const pending = read(request, current)
    inFlightRequest = request
    inFlight = pending
    // Only this read may clear the field: a newer request can replace it while it
    // is still in flight, and that handle stays joinable.
    void pending.finally(() => { if (inFlight === pending) inFlight = undefined })
    return pending
  }
  // A change or a reset states that the connection moved, so its read supersedes
  // whatever is in flight instead of joining it.
  const invalidate = (): void => { void refresh(true) }
  const remove = async (id: ScheduleId): Promise<CatalogDeleteOutcome> => {
    if (snapshot.deleting.includes(id)) return 'pending'
    const started = lifecycle
    publish({ ...snapshot, deleting: [...snapshot.deleting, id] })
    let result: RemoteResult<ScheduleDeleteResult>
    try {
      result = await deps.remove(id)
    } catch (_error: unknown) {
      // A rejected deletion does not establish that the durable record changed.
      if (started === lifecycle) {
        publish({ ...snapshot, deleting: snapshot.deleting.filter(value => value !== id) })
      }
      return 'failed'
    }
    if (started !== lifecycle) return result.ok ? 'deleted' : 'failed'
    publish({ ...snapshot, deleting: snapshot.deleting.filter(value => value !== id) })
    // The deletion changed the authoritative state, so the acknowledgement reads
    // again rather than joining a read that may have been sent before it.
    if (result.ok) await refresh(true)
    return result.ok ? 'deleted' : 'failed'
  }
  return {
    hooks: {
      catalog: {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          if (listeners.size === 1) {
            lifecycle++
            disposers = [deps.subscribeChanged(invalidate), deps.subscribeReset(invalidate)]
            invalidate()
          }
          return () => {
            listeners.delete(listener)
            if (listeners.size !== 0) return
            for (const dispose of disposers) dispose()
            disposers = []
            epoch++
            lifecycle++
            snapshot = { ...snapshot, deleting: [] }
          }
        },
      },
    },
    onDelete: remove,
    onRetry: (since = 0) => refresh(false, since),
  }
}
