/**
 * The Automation sidebar entry: the clock entry in the New Session button
 * area (the `sidebar.actions` list seat declared by the sidebar shell).
 * Clicking switches the frame to the `automation` mode through the layout
 * service — the same store channel the mode rail drives. Wide renders the
 * icon + label row; the collapsed rail renders the icon control.
 */
import clsx from 'clsx'
import { AutomationIcon } from './icons.tsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.actions' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './AutomationAction.module.css'

/** Injected business face: the frame mode switch this entry drives. */
export interface AutomationActionInjected {
  /** Switch the frame's active mode to this entry's mode. */
  setMode: () => void
}

/** Full component props: runtime share (owner + standard) + injected face + locale seat. */
export type AutomationActionProps =
  PropsRuntime<'sidebar.actions'>
  & AutomationActionInjected
  & PropsLocale<'automation'>

/**
 * Render the Automation entry row.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the entry button element tree.
 */
export function AutomationAction({ setMode, wide, t }: AutomationActionProps) {
  return (
    <button
      type="button"
      className={clsx(css.action, wide ? css.wide : css.rail)}
      aria-label={t('mode.automation.label')}
      onClick={() => { setMode() }}
    >
      <AutomationIcon size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('mode.automation')}</span>}
    </button>
  )
}
