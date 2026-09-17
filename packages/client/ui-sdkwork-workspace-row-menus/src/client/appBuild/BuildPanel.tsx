/**
 * The build output panel: one card per compile/package task the row menus
 * launched, streaming the host process's stdout/stderr while it runs.
 *
 * Rendered through its own React root mounted on `document.body` (the same
 * decoupling the deploy plugin's publish dialog uses) rather than through a
 * slot: the panel outlives the menu component that opened it — the menu
 * closes on selection, the build keeps running — and it must not be clipped
 * by the sidebar's scroll container.
 *
 * A card can be minimized, which removes it from this panel and leaves the
 * task in the conversation-header indicator; the host owns that state, so this
 * component only reports the gesture.
 *
 * Copy arrives translated (`t`) and data arrives as plain props; the panel
 * holds no ctx, no subscription and no host access.
 */

import type { CSSProperties } from 'react'

/** Output stream one build line came from. */
export type AppBuildStream = 'stdout' | 'stderr'

/** One decoded output line. */
export interface AppBuildLine {
  stream: AppBuildStream
  text: string
}

/** Lifecycle of one panel task. */
export type AppBuildTaskStatus =
  /** The start call is in flight. */
  | 'starting'
  /** The host acknowledged the spawn and the process is running. */
  | 'running'
  /** Exited with code 0. */
  | 'succeeded'
  /** Exited non-zero. */
  | 'failed'
  /** Cancelled by the operator. */
  | 'cancelled'
  /** The host refused the start (no such script, cwd unreadable, busy). */
  | 'rejected'

/** One task as the panel renders it. */
export interface AppBuildTaskView {
  id: string
  /** Menu-facing action title, e.g. `H5 · prod`. */
  label: string
  /** Resolved command line, e.g. `pnpm run build:prod`. */
  command: string
  /** Absolute app root the command runs in. */
  cwd: string
  status: AppBuildTaskStatus
  lines: readonly AppBuildLine[]
  /** Completion read off the tool's own output, or null/absent when unknown. */
  percent?: number | null | undefined
  /** Rejection/failure detail shown under the header. */
  error?: string | undefined
  /** Wall-clock duration of the finished run. */
  durationMs?: number | undefined
}

/** Panel props: pure data plus three callbacks. */
export interface BuildPanelProps {
  tasks: readonly AppBuildTaskView[]
  /** Translate seat of the plugin's namespace. */
  t: (key: string, params?: Record<string, string>) => string
  /** Cancel a running task (the host tree-kills the process). */
  onCancel: (id: string) => void
  /** Collapse one task's card into the conversation-header indicator. */
  onMinimize: (id: string) => void
  /** Dismiss one card; a running task keeps running on the host. */
  onClose: (id: string) => void
}

/** Output lines rendered per card; older lines collapse into a count. */
const MAX_RENDERED_LINES = 400

/** Cards stacked at once; the rest collapse into a summary row. */
const MAX_VISIBLE_CARDS = 3

const PANEL: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: 520,
  maxWidth: 'calc(100vw - 32px)',
}

const CARD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  border: '1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12))',
  borderRadius: 10,
  background: 'var(--dsw-specific-menu, #ffffff)',
  color: 'var(--dsw-alias-label-primary, #1f2328)',
  boxShadow: 'var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.16))',
  fontSize: 12,
}

const HEADER: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12))',
}

const TITLE: CSSProperties = { flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

const BADGE: CSSProperties = {
  padding: '1px 6px',
  borderRadius: 6,
  fontSize: 11,
  color: 'var(--dsw-alias-label-tertiary, #6b7280)',
  whiteSpace: 'nowrap',
}

const META: CSSProperties = {
  padding: '6px 10px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 11,
  color: 'var(--dsw-alias-label-tertiary, #6b7280)',
  wordBreak: 'break-all',
}

const LOG: CSSProperties = {
  maxHeight: 220,
  overflow: 'auto',
  padding: '6px 10px 10px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 11,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const BUTTON: CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.16))',
  borderRadius: 6,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: 11,
  padding: '2px 8px',
  cursor: 'pointer',
}

/**
 * Status copy key per lifecycle state. Exported because the conversation-
 * header indicator renders the same statuses: a second table would let the two
 * surfaces name one state differently.
 */
export const APP_BUILD_STATUS_KEYS: Record<AppBuildTaskStatus, string> = {
  starting: 'build.status.starting',
  running: 'build.status.running',
  succeeded: 'build.status.succeeded',
  failed: 'build.status.failed',
  cancelled: 'build.status.cancelled',
  rejected: 'build.status.rejected',
}

/** Text style for a failed or rejected task. */
const ERROR_STYLE: CSSProperties = { color: 'var(--dsw-alias-state-error-primary, #d1242f)' }

/** Text style for a neutral or successful task. */
const MUTED_STYLE: CSSProperties = { color: 'var(--dsw-alias-label-tertiary, #6b7280)' }

/** Status text style: failures and rejections take the error alias, others stay muted. */
function statusStyle(status: AppBuildTaskStatus): CSSProperties {
  return status === 'failed' || status === 'rejected' ? ERROR_STYLE : MUTED_STYLE
}

/**
 * Whether a task still has a live process behind it. Exported because the
 * panel host runs its elapsed clock off the same predicate: two copies would
 * drift the moment a status is added.
 * @param status - one task's lifecycle state.
 * @returns true while the task's process is alive.
 */
export function isAppBuildTaskActive(status: AppBuildTaskStatus): boolean {
  return status === 'starting' || status === 'running'
}

/** Completion shown on the status badge: a live figure only while it can move. */
function percentText(task: AppBuildTaskView): string {
  const percent = task.percent ?? null
  if (percent === null || !isAppBuildTaskActive(task.status)) return ''
  return ` ${String(percent)}%`
}

/** One task card. */
function BuildCard({ task, t, onCancel, onMinimize, onClose }: {
  task: AppBuildTaskView
  t: BuildPanelProps['t']
  onCancel: BuildPanelProps['onCancel']
  onMinimize: BuildPanelProps['onMinimize']
  onClose: BuildPanelProps['onClose']
}) {
  const hidden = Math.max(0, task.lines.length - MAX_RENDERED_LINES)
  const visible = hidden === 0 ? task.lines : task.lines.slice(hidden)
  const duration = task.durationMs === undefined
    ? ''
    : ` · ${(task.durationMs / 1000).toFixed(1)}s`
  return (
    <section style={CARD} role="group" aria-label={task.label}>
      <header style={HEADER}>
        <span style={TITLE}>{task.label}</span>
        <span style={{ ...BADGE, ...statusStyle(task.status) }}>
          {t(APP_BUILD_STATUS_KEYS[task.status])}{percentText(task)}{duration}
        </span>
        {isAppBuildTaskActive(task.status) && (
          <button type="button" style={BUTTON} onClick={() => { onCancel(task.id) }}>
            {t('build.cancel')}
          </button>
        )}
        <button
          type="button"
          style={BUTTON}
          title={t('build.minimize')}
          aria-label={t('build.minimize')}
          onClick={() => { onMinimize(task.id) }}
        >
          ⌄
        </button>
        <button type="button" style={BUTTON} onClick={() => { onClose(task.id) }} aria-label={t('build.dismiss')}>
          ×
        </button>
      </header>
      <div style={META}>
        <div>$ {task.command}</div>
        <div>{task.cwd}</div>
      </div>
      {task.error !== undefined && (
        <div style={{ ...META, ...ERROR_STYLE }}>{task.error}</div>
      )}
      <div style={LOG}>
        {hidden > 0 && <div style={MUTED_STYLE}>{t('build.omitted', { count: String(hidden) })}</div>}
        {visible.map((line, index) => (
          <div key={index} style={line.stream === 'stderr' ? ERROR_STYLE : undefined}>
            {line.text}
          </div>
        ))}
      </div>
    </section>
  )
}

/** The floating build panel: nothing while no task is tracked. */
export function BuildPanel({ tasks, t, onCancel, onMinimize, onClose }: BuildPanelProps) {
  if (tasks.length === 0) return null
  const visible = tasks.slice(0, MAX_VISIBLE_CARDS)
  const hidden = tasks.length - visible.length
  return (
    <div style={PANEL}>
      {visible.map(task => (
        <BuildCard key={task.id} task={task} t={t} onCancel={onCancel} onMinimize={onMinimize} onClose={onClose} />
      ))}
      {hidden > 0 && (
        <div style={META}>{t('build.moreTasks', { count: String(hidden) })}</div>
      )}
    </div>
  )
}
