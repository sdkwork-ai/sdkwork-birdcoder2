/**
 * The plugin store behind the market's local views.
 *
 * The market is a view over the running application's own plugin system, so
 * this store owns exactly one truth per question and reaches the Host only
 * through the two Remotes:
 *
 * - `pluginInventory` says what the Live Loader tree IS (each entry's
 *   effective enablement and root-fiber phase).
 * - `pluginManager` says what the profile patch may WRITE (each row's
 *   addressability, each bundle's removability) and performs the writes.
 *
 * Every remote answer arrives in the `RemoteResult` envelope, which this
 * module unwraps in one place: an `ok: false` answer becomes a rejection
 * carrying the Host's own code and message, so no caller can ever read an
 * absent outcome as a successful one. Callers decide only how to WORD a
 * failure, never whether it happened.
 *
 * The store also subscribes to the three forwarded Host events the manager
 * emits — `plugin-manager/changed`, `install-log`, `install-state` — plus
 * `connection/reset`. That is what makes a change made by another surface
 * (the CLI, another browser tab, an agent) show up here without the person
 * pressing Refresh, and what streams a pnpm run's output as it happens.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  BundleInfo, ChangeResult, PluginEntryId, PluginInfo, PluginInstallCancellation,
  PluginInstallLogChunk, PluginInstallProgress, PluginInstallRequestId,
  PluginInventorySnapshot, PluginSpecInspection,
} from '@deepseek-ai/dsh-api-remotes/client'

/** One complete read of the tree: entries, their addressability, and the bundles. */
export interface PluginSnapshot {
  readonly inventory: PluginInventorySnapshot
  /** The manager's roster, keyed by Loader entry id; an absent id is unaddressable. */
  readonly rows: readonly PluginInfo[]
  /** Every bundle the profile selects, depends on, or the installation supplies. */
  readonly bundles: readonly BundleInfo[]
  /**
   * Whether this Host exposes plugin management at all. Read from the
   * inventory snapshot, which answers it independently of the manager's own
   * roster: a deployment that does not manage a profile says so here rather
   * than by omission.
   */
  readonly managementAvailable: boolean
}

/** A read that has not answered yet, has answered, or has failed. */
export type PluginReadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly detail: string }
  | { readonly status: 'ready'; readonly snapshot: PluginSnapshot }

/**
 * The store's one published state: the last read plus the open install
 * session. Both live in one snapshot so `useSyncExternalStore` sees a single
 * stable value and a phase change repaints the dialog without a second
 * subscription or a manual tick counter.
 */
export interface PluginStoreState {
  readonly read: PluginReadState
  /** The open install session, or `undefined` when the dialog is closed. */
  readonly install: InstallSession | undefined
}

/** One line of a pnpm run's output, flattened from the Host's chunks. */
export interface InstallLogLine {
  readonly stream: 'stdout' | 'stderr'
  readonly text: string
}

/**
 * One installation's client-side state, from the pre-install inspection
 * through the Host's phases to the settle. The phase vocabulary is the Host's
 * own (`installing` / `cancelling` / `applying`) plus the states only the
 * client produces (the inspection, the settle, and its folded outcomes).
 */
export interface InstallSession {
  /** The spec as typed. */
  readonly spec: string
  readonly phase: 'checking' | 'ready' | 'installing' | 'cancelling' | 'applying' | 'done' | 'failed' | 'cancelled'
  /** The Host's request id once the install started; absent before that. */
  readonly requestId?: PluginInstallRequestId | undefined
  /** What the pre-install inspection answered, when it accepted the spec. */
  readonly inspection?: Extract<PluginSpecInspection, { status: 'accepted' }> | undefined
  /** Why the inspection refused the spec, or the transport's own problem. */
  readonly problem?: { readonly problem: string; readonly reason: string } | undefined
  /**
   * The settled outcome's diagnostic key, a `'too-late'` / `'not-running'`
   * cancellation answer, or the transport's message.
   */
  readonly detail?: string | undefined
  /** The packages awaiting install-script approval after a blocked run. */
  readonly pendingBuilds?: readonly string[] | undefined
  /** The bundle the installation added, once the Host accepted it. */
  readonly bundle?: string | undefined
  /** The pnpm output so far, one entry per log chunk, in arrival order. */
  readonly log: readonly InstallLogLine[]
}

/** The empty install session: the state the dialog opens on. */
export function emptyInstallSession(spec = ''): InstallSession {
  return { spec, phase: 'ready', log: [] }
}

/**
 * The Host's own failure vocabulary, carried through the store so the panel
 * can word an operation failure without re-deriving it from a message.
 */
export class PluginStoreError extends Error {
  /**
   * @param code - the Host's error code, or `transport` for a failed call.
   * @param message - the Host's own message, or the transport's.
   */
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'PluginStoreError'
  }
}

/** The store's public face: reads, writes, installs, and its own subscriptions. */
export interface PluginStore {
  /** Read the current tree and bundles, and publish them to subscribers. */
  refresh: () => Promise<void>
  /** The last published state (read + install session). */
  getSnapshot: () => PluginStoreState
  /** Subscribe to published state changes; returns the disposer. */
  subscribe: (listener: () => void) => () => void

  /** Persist one row's desired enablement. */
  setPluginEnabled: (entryId: PluginEntryId, enabled: boolean) => Promise<ChangeResult>
  /** Select or drop one bundle layer. */
  setBundleEnabled: (name: string, enabled: boolean) => Promise<ChangeResult>
  /** Uninstall one bundle's dependency from the profile. */
  removeBundle: (name: string) => Promise<ChangeResult>

  /** Open the dialog on a fresh session. */
  openInstall: (spec?: string) => void
  /** Close the dialog, cancelling any run in flight first. */
  closeInstall: () => void
  /** Replace the typed spec and discard the previous inspection. */
  editInstallSpec: (spec: string) => void
  /** Inspect the typed spec, then publish what the Host answered. */
  inspectInstall: () => Promise<void>
  /** Run the install for the typed spec, optionally approving pending scripts. */
  runInstall: (approvedBuilds?: readonly string[]) => Promise<void>
  /** Stop a run in flight and report what the Host decided. */
  cancelInstall: () => Promise<void>

  /** Unsubscribe from every Host event; called on plugin teardown. */
  dispose: () => void
}

/** One unwrapped Remote answer, or a rejection carrying the Host's own words. */
async function unwrap<T>(
  call: () => Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message: string } }>,
  label: string,
): Promise<T> {
  const result = await call()
  if (!result.ok) throw new PluginStoreError(result.error.code, `${label}: ${result.error.message}`)
  return result.value
}

/** Flatten one Host phase onto the client's session phase. */
function phaseOfHost(phase: PluginInstallProgress['phase']): InstallSession['phase'] {
  if (phase === 'cancelling') return 'cancelling'
  if (phase === 'applying') return 'applying'
  return 'installing'
}

/**
 * Build the store over one client context. The returned store is the single
 * place the market writes through, so every switch, uninstall, and install
 * reaches the Host the same way and reports the same envelope.
 *
 * @param ctx - the client root context carrying the remote services.
 * @returns the store, with its subscriptions already live.
 */
export function createPluginStore(ctx: ClientContext): PluginStore {
  const listeners = new Set<() => void>()
  let read: PluginReadState = { status: 'loading' }
  let install: InstallSession | undefined
  // The published value is replaced (never mutated) on every change, so
  // `useSyncExternalStore` compares by identity and sees each transition.
  let state: PluginStoreState = { read, install }
  let generation = 0
  let inFlight: Promise<void> | undefined
  let rerun = false

  const publish = (): void => {
    state = { read, install }
    for (const listener of [...listeners]) listener()
  }
  const setState = (next: PluginReadState): void => { read = next; publish() }
  const setInstall = (next: InstallSession | undefined): void => { install = next; publish() }

  /**
   * Read the tree once. The inventory answers what the rows ARE and whether
   * this deployment manages a profile at all; the manager answers what may be
   * written and which bundles exist. A manager read that fails leaves every
   * row unaddressed (rather than wrongly writable) but still renders the
   * roster, so a deployment without the manager Remote stays readable.
   */
  const load = async (): Promise<void> => {
    const myGeneration = ++generation
    const inventory = await unwrap(() => ctx.remote.pluginInventory.list(), 'pluginInventory.list')
    const [rows, bundles] = await Promise.all([
      unwrap(() => ctx.remote.pluginManager.listPlugins(), 'pluginManager.listPlugins')
        .catch(() => [] as readonly PluginInfo[]),
      unwrap(() => ctx.remote.pluginManager.listBundles(), 'pluginManager.listBundles')
        .catch(() => [] as readonly BundleInfo[]),
    ])
    // A superseded read never publishes: the newer read owns the state.
    if (myGeneration !== generation) return
    setState({
      status: 'ready',
      snapshot: { inventory, rows, bundles, managementAvailable: inventory.managementAvailable !== false },
    })
  }

  const refresh = async (): Promise<void> => {
    // One read at a time, with a single trailing re-run: a burst of Host
    // change events during a pnpm run collapses into one final read rather
    // than a queue of them.
    if (inFlight !== undefined) { rerun = true; return inFlight }
    inFlight = load().catch((error: unknown) => {
      setState({ status: 'error', detail: error instanceof PluginStoreError ? error.message : String(error) })
      throw error
    }).finally(() => {
      inFlight = undefined
      if (rerun) { rerun = false; void refresh().catch(() => {}) }
    })
    return inFlight
  }

  const setPluginEnabled: PluginStore['setPluginEnabled'] = (entryId, enabled) =>
    unwrap(() => ctx.remote.pluginManager.setPluginEnabled(entryId, enabled), 'pluginManager.setPluginEnabled')

  const setBundleEnabled: PluginStore['setBundleEnabled'] = (name, enabled) =>
    unwrap(() => ctx.remote.pluginManager.setBundleEnabled(name, enabled), 'pluginManager.setBundleEnabled')

  const removeBundle: PluginStore['removeBundle'] = name =>
    unwrap(() => ctx.remote.pluginManager.removeBundle(name), 'pluginManager.removeBundle')

  /** Fold one settled ChangeResult onto the session, then re-read the tree. */
  const settle = (result: ChangeResult, spec: string): void => {
    const base = install ?? emptyInstallSession(spec)
    if (result.application === 'failed') {
      const pending = result.pendingBuilds
      setInstall({
        ...base,
        phase: 'failed',
        requestId: undefined,
        ...(pending === undefined || pending.length === 0 ? {} : { pendingBuilds: pending }),
        detail: result.error?.diagnostic ?? result.error?.code,
      })
    } else if (result.application === 'cancelled') {
      setInstall({ ...base, phase: 'cancelled', requestId: undefined })
    } else {
      setInstall({
        ...base,
        phase: 'done',
        requestId: undefined,
        ...(result.bundle === undefined ? {} : { bundle: result.bundle }),
        ...(result.application === 'restart-required' ? { detail: 'restart-required' } : {}),
      })
    }
    void refresh().catch(() => {})
  }

  /**
   * Run one install against the typed spec, or retry with approved scripts.
   *
   * The single Install action both checks and installs, exactly as the upstream
   * manager does: it reads what the spec names first, so a refused spec is
   * refused up front in the field (with the Host's own reason) rather than
   * after a pnpm run, and an accepted one becomes the subject the run shows.
   */
  const runInstall = async (approvedBuilds?: readonly string[]): Promise<void> => {
    const current = install
    if (current === undefined) return
    const spec = current.spec.trim()
    if (spec === '' || current.phase === 'checking') return
    // A run already on the wire ignores a second trigger.
    if (current.phase === 'installing' || current.phase === 'cancelling' || current.phase === 'applying') return
    // First read what the spec names; a refused spec returns to the field with
    // the Host's own reason, an accepted one proceeds to the install.
    setInstall({ ...current, phase: 'checking', problem: undefined, inspection: undefined, detail: undefined, log: [] })
    try {
      const inspected = await unwrap(() => ctx.remote.pluginManager.inspect(spec), 'pluginManager.inspect')
      const live = install ?? current
      if (inspected.status === 'refused') {
        setInstall({ ...live, phase: 'ready', problem: { problem: inspected.problem, reason: inspected.reason } })
        return
      }
      // The request id is minted here so a cancellation can name this very run;
      // the Host echoes it on every phase event and log chunk.
      const requestId = `markets-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` as PluginInstallRequestId
      setInstall({ ...live, phase: 'installing', inspection: inspected, requestId, pendingBuilds: undefined, detail: undefined, log: [] })
      const result = await unwrap(
        () => ctx.remote.pluginManager.installBundle(spec, {
          requestId,
          ...(approvedBuilds === undefined || approvedBuilds.length === 0 ? {} : { approvedBuilds: [...approvedBuilds] }),
        }),
        'pluginManager.installBundle',
      )
      settle(result, spec)
    } catch (error) {
      // A transport rejection has no ChangeResult, so there is no change to
      // fold: the session keeps its own spec and reports the transport's word.
      setInstall({
        ...(install ?? emptyInstallSession(current.spec)),
        phase: 'failed',
        requestId: undefined,
        detail: error instanceof PluginStoreError ? error.message : String(error),
      })
      void refresh().catch(() => {})
    }
  }

  const inspectInstall = async (): Promise<void> => {
    const current = install
    if (current === undefined) return
    setInstall({ ...current, phase: 'checking', problem: undefined, inspection: undefined, detail: undefined })
    try {
      const inspection = await unwrap(() => ctx.remote.pluginManager.inspect(current.spec), 'pluginManager.inspect')
      const live = install ?? current
      if (inspection.status === 'refused') {
        setInstall({ ...live, phase: 'ready', problem: { problem: inspection.problem, reason: inspection.reason } })
        return
      }
      setInstall({ ...live, phase: 'ready', inspection })
    } catch (error) {
      const detail = error instanceof PluginStoreError ? error.message : String(error)
      setInstall({ ...(install ?? current), phase: 'ready', problem: { problem: 'unknown', reason: detail } })
    }
  }

  const cancelInstall = async (): Promise<void> => {
    const current = install
    if (current === undefined || current.requestId === undefined) return
    setInstall({ ...current, phase: 'cancelling' })
    try {
      const answer: PluginInstallCancellation = await unwrap(
        () => ctx.remote.pluginManager.cancelInstall(current.requestId as PluginInstallRequestId),
        'pluginManager.cancelInstall',
      )
      const live = install ?? current
      // The Host's own answer decides what the dialog says: a run already
      // applying cannot be stopped, and one already gone is not an error.
      if (answer.status === 'cancelled') setInstall({ ...live, phase: 'cancelled', requestId: undefined })
      else if (answer.status === 'too-late') setInstall({ ...live, phase: 'applying', detail: 'too-late' })
      else setInstall({ ...live, phase: 'failed', requestId: undefined, detail: 'not-running' })
    } catch (error) {
      setInstall({
        ...(install ?? current),
        phase: 'failed',
        requestId: undefined,
        detail: error instanceof PluginStoreError ? error.message : String(error),
      })
    }
  }

  // The forwarded Host events. Subscribing here (rather than in the page)
  // means a change from any surface refreshes the market, and an install's
  // output streams into the dialog as pnpm produces it.
  const disposers: Array<() => void> = [
    ctx.remote.$on('plugin-manager/changed', () => { void refresh().catch(() => {}) }),
    ctx.remote.$on('plugin-manager/install-state', (progress: PluginInstallProgress) => {
      const current = install
      if (current === undefined || current.requestId !== progress.requestId) return
      setInstall({ ...current, phase: phaseOfHost(progress.phase) })
    }),
    ctx.remote.$on('plugin-manager/install-log', (chunk: PluginInstallLogChunk) => {
      const current = install
      // A chunk with no request id belongs to an install another surface
      // started (the CLI, an agent); it is not this dialog's output.
      if (current === undefined || current.requestId !== chunk.requestId) return
      setInstall({ ...current, log: [...current.log, { stream: chunk.stream, text: chunk.text }] })
    }),
    ctx.on('connection/reset', () => { void refresh().catch(() => {}) }),
  ]

  return {
    refresh,
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setPluginEnabled,
    setBundleEnabled,
    removeBundle,
    openInstall: (spec) => { setInstall(emptyInstallSession(spec ?? '')) },
    closeInstall: () => {
      const current = install
      // Closing a run in flight stops it, so no pnpm process keeps writing
      // into a profile after the person dismissed the dialog.
      if (current !== undefined && current.requestId !== undefined
        && (current.phase === 'installing' || current.phase === 'applying' || current.phase === 'cancelling')) {
        void cancelInstall().catch(() => {})
      }
      setInstall(undefined)
    },
    editInstallSpec: (spec) => {
      const current = install
      if (current === undefined) return
      setInstall({ ...current, spec, inspection: undefined, problem: undefined, detail: undefined })
    },
    inspectInstall,
    runInstall,
    cancelInstall,
    dispose: () => { for (const dispose of disposers) dispose() },
  }
}
