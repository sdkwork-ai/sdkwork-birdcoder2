/**
 * Build panel host: owns the task list, drives the `sdkworkAppBuild` Remote
 * (start → streamed follow → optional cancel), and mounts the panel into an
 * isolated React root on `document.body`.
 *
 * The host keeps running builds alive across menu closes — the menu component
 * unmounts on selection, while the spawned process and this host keep going —
 * and it degrades to a no-op when no build Remote is mounted, so compositions
 * without the host capability simply never open a panel.
 *
 * It owns two surfaces over one task list: the floating panel (per-task cards
 * with the full output) and the conversation-header indicator that the same
 * tasks collapse into. The header surface reads a **separate, lightweight
 * snapshot** — no output lines ride it — because it re-renders on every frame
 * the clock ticks and on every output batch, and a 5000-line history would be
 * copied through it thousands of times per build.
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import {
  BuildPanel, isAppBuildTaskActive,
  type AppBuildLine, type AppBuildTaskStatus, type AppBuildTaskView,
} from './BuildPanel.tsx'
import { percentOfLines } from './progress.ts'
import type {
  AppBuildLocalePort, AppBuildRemoteNamespace, AppBuildRemoteResult, AppBuildRunRequest,
} from './contract.ts'

/** Host options. */
export interface AppBuildPanelHostOptions {
  /** Resolve the live build Remote namespace, or undefined when not mounted. */
  remote: () => AppBuildRemoteNamespace | undefined
  /** Locale seat driving the panel copy. */
  locale: AppBuildLocalePort
}

/**
 * One tracked build as the conversation-header indicator renders it. Output
 * lines are deliberately absent: the indicator shows label, status and
 * completion, and the card behind "open detail" owns the transcript.
 */
export interface AppBuildTrack {
  /** Stable host-side task id (also the indicator row's key). */
  id: string
  /** Menu-facing action title, e.g. `H5 · prod`. */
  label: string
  /** Lifecycle the row's status copy comes from. */
  status: AppBuildTaskStatus
  /** Completion 0-100 read off the tool's own output, or null when unknown. */
  percent: number | null
  /** Wall-clock start, so the row can render a live elapsed time. */
  startedAt: number
  /** Wall-clock duration of a finished run, or null while it runs. */
  durationMs: number | null
  /** Whether this task's card is currently collapsed into the header. */
  minimized: boolean
}

/** What the conversation-header indicator renders from. */
export interface AppBuildIndicatorSnapshot {
  /** Every tracked build, newest first, minimized or not. */
  tasks: readonly AppBuildTrack[]
  /** Ticking wall clock: advances once a second while any task is active. */
  now: number
}

/** The panel host face the plugin provides. */
export interface AppBuildPanelHost {
  /** Start one catalog command and stream it into the panel. */
  run(request: AppBuildRunRequest): void
  /** Collapse one task's card into the conversation-header indicator. */
  minimize(id: string): void
  /** Restore one task's card — the header list's "open detail". */
  expand(id: string): void
  /** Observable view backing the conversation-header indicator. */
  indicator: ObservableSnapshot<AppBuildIndicatorSnapshot>
  /** Tear down the panel root and stop observing locale changes. */
  dispose(): void
}

/** Output lines retained per task before the oldest drop (memory guard). */
const MAX_RETAINED_LINES = 5000

/** Elapsed-time refresh cadence while at least one task is active. */
const CLOCK_INTERVAL_MS = 1000

/** Internal task record: the view shape plus the host-side build id. */
interface PanelTask extends AppBuildTaskView {
  /** Host build id, present once the start call succeeded. */
  buildId: string | undefined
  /** Wall-clock start, for the header's elapsed readout. */
  startedAt: number
  /** Whether the card is collapsed into the header indicator. */
  minimized: boolean
}

/** Whether two published tracks carry the same renderable state. */
function sameTrack(left: AppBuildTrack | undefined, right: AppBuildTrack): boolean {
  return left !== undefined
    && left.id === right.id
    && left.label === right.label
    && left.status === right.status
    && left.percent === right.percent
    && left.startedAt === right.startedAt
    && left.durationMs === right.durationMs
    && left.minimized === right.minimized
}

/**
 * Create the build panel host.
 * @param options - Remote resolver and locale seat.
 * @returns the host face.
 */
export function createAppBuildPanelHost(options: AppBuildPanelHostOptions): AppBuildPanelHost {
  let tasks: PanelTask[] = []
  let root: Root | undefined
  let container: HTMLDivElement | undefined
  let sequence = 0
  let clock: ReturnType<typeof setInterval> | undefined
  const followers = new Map<string, AbortController>()
  const store = createSnapshotStore<AppBuildIndicatorSnapshot>({ tasks: [], now: Date.now() })

  const t = (): ((key: string, params?: Record<string, string>) => string) => options.locale.translate()

  /** Detach the floating panel without touching the task list. */
  function teardownRoot(): void {
    root?.unmount()
    container?.remove()
    root = undefined
    container = undefined
  }

  function render(): void {
    const visible = tasks.filter(task => !task.minimized)
    if (visible.length === 0) {
      teardownRoot()
      return
    }
    if (root === undefined) {
      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
    }
    root.render(createElement(BuildPanel, {
      tasks: visible,
      t: t(),
      onCancel: cancel,
      onMinimize: minimize,
      onClose: close,
    }))
  }

  /**
   * Publish the header snapshot, skipping writes no consumer could observe.
   * Output appends touch only `lines` and therefore usually publish nothing;
   * a batch that carried a progress figure does.
   */
  function publish(): void {
    const previous = store.getSnapshot().tasks
    const next: AppBuildTrack[] = tasks.map(task => ({
      id: task.id,
      label: task.label,
      status: task.status,
      percent: task.percent,
      startedAt: task.startedAt,
      durationMs: task.durationMs ?? null,
      minimized: task.minimized,
    }))
    if (next.length === previous.length && next.every((track, index) => sameTrack(previous[index], track))) {
      return
    }
    store.update((draft) => { draft.tasks = next })
  }

  /**
   * Run the elapsed clock only while something is building. A finished list
   * holds no timer, so an idle plugin costs nothing.
   */
  function syncClock(): void {
    const active = tasks.some(task => isAppBuildTaskActive(task.status))
    if (active && clock === undefined) {
      clock = setInterval(() => {
        store.update((draft) => { draft.now = Date.now() })
      }, CLOCK_INTERVAL_MS)
    } else if (!active && clock !== undefined) {
      clearInterval(clock)
      clock = undefined
    }
  }

  function update(id: string, patch: Partial<PanelTask>): void {
    let changed = false
    tasks = tasks.map((task) => {
      if (task.id !== id) return task
      changed = true
      return { ...task, ...patch }
    })
    if (!changed) return
    syncClock()
    publish()
    render()
  }

  function appendLines(id: string, lines: readonly AppBuildLine[]): void {
    const task = tasks.find(candidate => candidate.id === id)
    if (task === undefined) return
    const merged = [...task.lines, ...lines]
    const trimmed = merged.length > MAX_RETAINED_LINES ? merged.slice(merged.length - MAX_RETAINED_LINES) : merged
    const percent = percentOfLines(lines.map(line => line.text), task.percent ?? null)
    update(id, { lines: trimmed, ...(percent === task.percent ? {} : { percent }) })
  }

  /** Consume one build's frames until its exit frame lands. */
  async function follow(taskId: string, buildId: string, namespace: AppBuildRemoteNamespace): Promise<void> {
    const abort = new AbortController()
    followers.set(taskId, abort)
    const pending: AppBuildLine[] = []
    let scheduled = false
    // Coalesce output bursts into one render per microtask: a chatty build
    // emits thousands of lines and each one must not cost a React render.
    const flush = (): void => {
      scheduled = false
      if (pending.length === 0) return
      const batch = pending.splice(0, pending.length)
      appendLines(taskId, batch)
    }
    try {
      for await (const frame of namespace.follow(buildId, abort.signal)) {
        if (frame.type === 'output') {
          pending.push({ stream: frame.stream, text: frame.text })
          if (!scheduled) {
            scheduled = true
            queueMicrotask(flush)
          }
          continue
        }
        if (frame.type === 'exit') {
          flush()
          update(taskId, {
            status: frame.outcome === 'succeeded' ? 'succeeded'
              : frame.outcome === 'cancelled' ? 'cancelled' : 'failed',
            durationMs: frame.durationMs,
          })
        }
      }
    } catch (error: unknown) {
      flush()
      update(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      followers.delete(taskId)
    }
  }

  function cancel(id: string): void {
    const task = tasks.find(candidate => candidate.id === id)
    const namespace = options.remote()
    if (task === undefined || task.buildId === undefined || namespace === undefined) return
    void namespace.cancel({ buildId: task.buildId }).catch(() => {})
  }

  function minimize(id: string): void {
    const task = tasks.find(candidate => candidate.id === id)
    if (task === undefined || task.minimized) return
    update(id, { minimized: true })
  }

  function expand(id: string): void {
    const task = tasks.find(candidate => candidate.id === id)
    if (task === undefined || !task.minimized) return
    update(id, { minimized: false })
  }

  function close(id: string): void {
    // A closed card stops following; the host process is deliberately left
    // running (cancellation is an explicit, separate gesture).
    const follower = followers.get(id)
    if (follower !== undefined) {
      follower.abort()
      followers.delete(id)
    }
    tasks = tasks.filter(task => task.id !== id)
    if (tasks.length === 0) {
      teardownRoot()
      syncClock()
      publish()
      return
    }
    syncClock()
    publish()
    render()
  }

  function run(request: AppBuildRunRequest): void {
    const namespace = options.remote()
    if (namespace === undefined) return
    sequence += 1
    const id = `app-build-${String(sequence)}`
    tasks = [...tasks, {
      id,
      buildId: undefined,
      label: request.label,
      command: request.script,
      cwd: request.cwd,
      status: 'starting',
      lines: [],
      percent: null,
      startedAt: Date.now(),
      minimized: false,
    }]
    syncClock()
    publish()
    render()
    void (async () => {
      let started: AppBuildRemoteResult<{ buildId: string; command: string; cwd: string }>
      try {
        started = await namespace.start({ cwd: request.cwd, script: request.script })
      } catch (error: unknown) {
        update(id, {
          status: 'rejected',
          error: error instanceof Error ? error.message : String(error),
        })
        return
      }
      if (!started.ok) {
        update(id, { status: 'rejected', error: `${started.error.code}: ${started.error.message}` })
        return
      }
      update(id, {
        buildId: started.value.buildId,
        command: started.value.command,
        status: 'running',
      })
      await follow(id, started.value.buildId, namespace)
    })()
  }

  const offLocale = options.locale.subscribe(() => {
    if (tasks.length > 0) render()
  })

  return {
    run,
    minimize,
    expand,
    indicator: store,
    dispose: () => {
      offLocale()
      if (clock !== undefined) {
        clearInterval(clock)
        clock = undefined
      }
      for (const abort of followers.values()) abort.abort()
      followers.clear()
      teardownRoot()
      tasks = []
      publish()
    },
  }
}
