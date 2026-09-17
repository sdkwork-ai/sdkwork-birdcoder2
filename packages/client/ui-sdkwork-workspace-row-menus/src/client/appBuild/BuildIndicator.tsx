/**
 * The conversation-header build indicator: the seat a running compile
 * collapses into, and the popover list of every tracked build behind it.
 *
 * Decoupling follows the row-menu entry's rule — props are structural and
 * optional, so this component holds no edge on the conversation package and a
 * composition that mounts the header without the app-build capability simply
 * renders nothing.
 *
 * State arrives as one observable snapshot and is read through
 * `useSyncExternalStore`: the host publishes a fresh snapshot only when a
 * field the header actually shows has changed, so output bursts do not
 * re-render this surface.
 */

import { useState, useSyncExternalStore } from 'react'
import { IconLoadingOutline16, Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import {
  APP_BUILD_STATUS_KEYS, isAppBuildTaskActive, type AppBuildTaskStatus,
} from './BuildPanel.tsx'
import type { AppBuildIndicatorSnapshot, AppBuildTrack } from './panelHost.ts'
import css from './BuildIndicator.module.css'

/**
 * Props of the header indicator. Every member is optional so the entry stays
 * assignable to the slot's composed props without importing them.
 */
export interface BuildIndicatorProps {
  /** Translate seat of the plugin's namespace. */
  t?: ((key: string, params?: Record<string, string>) => string) | undefined
  /** Host-owned observable of the tracked builds. */
  indicator?: ObservableSnapshot<AppBuildIndicatorSnapshot> | undefined
  /** Restore one task's card in the floating panel (the row click). */
  onOpenDetail?: ((id: string) => void) | undefined
}

/** Snapshot used while the host face is absent, so the hook order stays fixed. */
const EMPTY_SNAPSHOT: AppBuildIndicatorSnapshot = { tasks: [], now: 0 }

/** No-op subscription matching {@link EMPTY_SNAPSHOT}. */
const NO_SUBSCRIPTION = (): (() => void) => () => {}

/** Colour family one row renders in. */
type TrackTone = 'active' | 'success' | 'error' | 'muted'

/**
 * Tone of one task's row, statuses mapped in one place so the bar and the
 * status text can never disagree.
 * @param status - one task's lifecycle state.
 * @returns the row's colour family.
 */
function toneOf(status: AppBuildTaskStatus): TrackTone {
  if (isAppBuildTaskActive(status)) return 'active'
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'rejected') return 'error'
  return 'muted'
}

/**
 * Fill of one task's progress bar, in percent, or null for indeterminate.
 *
 * The tool's own figure drives the bar while it can still move. Once the
 * process is gone the bar stops moving, because a terminal row that still
 * shimmers reads as a hang.
 *
 * A run that ended completely fills: an exited process is complete by
 * definition, and a successful build whose last printed figure was 42% — the
 * ordinary shape, since bundlers stop reporting before they stop running —
 * would otherwise sit at 42% forever and read as "did this finish?".
 *
 * A run that stopped early keeps however far the tool got, and an unknown
 * distance reads as an empty track rather than a full one: a rejected start
 * never built anything, and a full bar would say it built everything.
 * @param track - one tracked build.
 * @returns 0-100 for a determinate bar, or null to sweep.
 */
function fillPercent(track: AppBuildTrack): number | null {
  if (isAppBuildTaskActive(track.status)) return track.percent
  if (track.status === 'succeeded') return 100
  return track.percent ?? 0
}

/**
 * Compact elapsed/duration copy: `12s`, `3m 05s`.
 * @param ms - milliseconds to render.
 * @returns the shortest unambiguous rendering.
 */
function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${String(seconds)}s`
  return `${String(Math.floor(seconds / 60))}m ${String(seconds % 60).padStart(2, '0')}s`
}

/** Order rows as the operator needs them: live builds first, newest first. */
function ordered(tasks: readonly AppBuildTrack[]): readonly AppBuildTrack[] {
  return [...tasks].sort((left, right) => {
    const leftLive = isAppBuildTaskActive(left.status) ? 0 : 1
    const rightLive = isAppBuildTaskActive(right.status) ? 0 : 1
    if (leftLive !== rightLive) return leftLive - rightLive
    return right.startedAt - left.startedAt
  })
}

/** One build row: label, status copy, and its progress bar. */
function IndicatorRow({ track, now, t }: {
  track: AppBuildTrack
  now: number
  t: (key: string, params?: Record<string, string>) => string
}) {
  const live = isAppBuildTaskActive(track.status)
  const percent = live ? track.percent : null
  // A terminal task without a recorded duration (a rejected start, a lost
  // clone) shows no time rather than a fabricated `0s`.
  const elapsed = track.durationMs ?? (live ? now - track.startedAt : null)
  const parts = [t(APP_BUILD_STATUS_KEYS[track.status])]
  if (percent !== null) parts.push(`${String(percent)}%`)
  if (elapsed !== null) parts.push(elapsedText(elapsed))
  const fill = fillPercent(track)
  return (
    <span className={css.row} data-tone={toneOf(track.status)}>
      <span className={css.rowHead}>
        <span className={css.rowLabel}>{track.label}</span>
        {track.minimized && <span className={css.minimized}>{t('indicator.minimized')}</span>}
        <span className={css.rowStatus}>{parts.join(' · ')}</span>
      </span>
      <span
        className={css.bar}
        data-tone={toneOf(track.status)}
        data-indeterminate={fill === null ? 'true' : 'false'}
      >
        <span className={css.fill} style={fill === null ? undefined : { width: `${String(fill)}%` }} />
      </span>
    </span>
  )
}

/**
 * Session-header build indicator.
 * @param props - observable face, translate seat, and the detail callback.
 * @returns the indicator button and its list, or null with nothing to track.
 */
export function BuildIndicator(props: BuildIndicatorProps): React.JSX.Element | null {
  const t = props.t ?? ((key: string): string => key)
  const indicator = props.indicator
  const [open, setOpen] = useState(false)
  const snapshot = useSyncExternalStore(
    indicator?.subscribe ?? NO_SUBSCRIPTION,
    indicator?.getSnapshot ?? ((): AppBuildIndicatorSnapshot => EMPTY_SNAPSHOT),
  )
  // Hooks run before this return so mounting the host face later never
  // reorders them; with no build tracked there is nothing to indicate.
  if (snapshot.tasks.length === 0) return null

  const rows = ordered(snapshot.tasks)
  const activeCount = snapshot.tasks.filter(task => isAppBuildTaskActive(task.status)).length
  const label = activeCount > 0
    ? t('indicator.aria', { count: String(activeCount) })
    : t('indicator.ariaIdle')
  const items: MenuEntry[] = [
    // A heading row, not a selectable one: nothing happens when it is clicked.
    { type: 'label', id: 'sdkwork-app-build-heading', text: t('indicator.listTitle') },
    ...rows.map(track => ({
      id: track.id,
      label: <IndicatorRow track={track} now={snapshot.now} t={t} />,
    })),
  ]

  return (
    <Menu
      open={open}
      align="end"
      dense
      portal
      selection="fill"
      className={css.root}
      items={items}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        setOpen(false)
        props.onOpenDetail?.(id)
      }}
      anchor={(
        <button
          type="button"
          className={css.button}
          data-active={activeCount > 0 ? 'true' : 'false'}
          aria-expanded={open}
          aria-haspopup="menu"
          title={label}
          aria-label={label}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconLoadingOutline16 size={15} className={activeCount > 0 ? `${css.icon} ${css.spin}` : css.icon} />
          {activeCount > 0 && <span className={css.count}>{String(activeCount)}</span>}
        </button>
      )}
    />
  )
}
