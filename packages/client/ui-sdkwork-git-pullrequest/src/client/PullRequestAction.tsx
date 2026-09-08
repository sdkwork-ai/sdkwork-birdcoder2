/**
 * The Pull Request sidebar entry: the git entry in the New Session button
 * area (the `sidebar.actions` list seat declared by the sidebar shell).
 * Clicking switches the frame to the `pull-request` mode through the layout
 * service — the same store channel the mode rail drives. Wide renders the
 * icon + label row; the collapsed rail renders the icon control.
 */
import clsx from 'clsx'
import { PullRequestIcon } from './icons.tsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.actions' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './PullRequestAction.module.css'

/** Injected business face: the frame mode switch this entry drives. */
export interface PullRequestActionInjected {
  /** Switch the frame's active mode to this entry's mode. */
  setMode: () => void
}

/** Full component props: runtime share (owner + standard) + injected face + locale seat. */
export type PullRequestActionProps =
  PropsRuntime<'sidebar.actions'>
  & PullRequestActionInjected
  & PropsLocale<'pullRequest'>

/**
 * Render the Pull Request entry row.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the entry button element tree.
 */
export function PullRequestAction({ setMode, wide, t }: PullRequestActionProps) {
  return (
    <button
      type="button"
      className={clsx(css.action, wide ? css.wide : css.rail)}
      aria-label={t('mode.pullRequest.label')}
      onClick={() => { setMode() }}
    >
      <PullRequestIcon size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('mode.pullRequest')}</span>}
    </button>
  )
}
