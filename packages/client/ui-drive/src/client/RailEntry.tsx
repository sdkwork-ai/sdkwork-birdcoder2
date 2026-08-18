/**
 * The Drive mode's rail entry: its 44px icon cell inside the rail's keyed
 * `mode.rail.entry` slot. The rail shell passes the live selection state
 * (active + setMode) as owner props; this entry knows its own mode id through
 * the registration's inject closure and swaps its glyph to the filled weight
 * while active.
 */
import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the rail-entry slot contract (ui-app-modes' declaration).
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
import { DriveIcon, DriveIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business face: this entry's mode id (the keyed registration's key). */
export interface DriveRailEntryInjected {
  /** The entry's own mode id. */
  mode: 'drive'
}

/** Full component props: runtime share (owner + standard) + injected mode + locale seat. */
export type DriveRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & DriveRailEntryInjected
  & PropsLocale<'drive'>

/**
 * Render the Drive rail entry cell.
 * @param props - composed slot props (owner share + injected mode + locale seat).
 * @returns the entry button element tree.
 */
export function DriveRailEntry({ mode, active, setMode, t }: DriveRailEntryProps) {
  const Icon = active ? DriveIconFilled : DriveIcon
  return (
    <Tooltip label={t('mode.drive')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('mode.drive.label')}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
      </button>
    </Tooltip>
  )
}
