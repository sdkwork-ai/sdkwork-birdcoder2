/**
 * The Course mode's rail entry: its 44px icon cell inside the rail's keyed
 * `mode.rail.entry` slot.
 */
import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { CourseIcon, CourseIconFilled } from './icons.tsx'
import css from './RailEntry.module.css'

/** Injected business face: this entry's mode id (the keyed registration's key). */
export interface CourseRailEntryInjected {
  /** The entry's own mode id. */
  mode: 'course'
}

/** Full component props: runtime share (owner + standard) + injected mode + locale seat. */
export type CourseRailEntryProps =
  PropsRuntime<'mode.rail.entry'>
  & CourseRailEntryInjected
  & PropsLocale<'course'>

/**
 * Render the Course rail entry cell.
 * @param props - composed slot props (owner share + injected mode + locale seat).
 * @returns the entry button element tree.
 */
export function CourseRailEntry({ mode, active, setMode, t }: CourseRailEntryProps) {
  const Icon = active ? CourseIconFilled : CourseIcon
  return (
    <Tooltip label={t('mode.course')} delayMs={500}>
      <button
        type="button"
        className={clsx(css.entry, active && css.active)}
        aria-label={t('mode.course.label')}
        aria-pressed={active}
        onClick={() => { setMode(mode) }}
      >
        <Icon size={24} />
      </button>
    </Tooltip>
  )
}
