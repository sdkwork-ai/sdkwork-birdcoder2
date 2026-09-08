/**
 * The Markets sidebar entry: the market entry in the New Session button area
 * (the `sidebar.actions` list seat declared by the sidebar shell). Clicking
 * switches the frame to the `markets` mode through the layout service — the
 * same store channel the mode rail drives. Wide renders the icon + label row;
 * the collapsed rail renders the icon control.
 */
import clsx from 'clsx'
import { MarketsIcon } from './icons.tsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.actions' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './MarketsAction.module.css'

/** Injected business face: the frame mode switch this entry drives. */
export interface MarketsActionInjected {
  /** Switch the frame's active mode to this entry's mode. */
  setMode: () => void
}

/** Full component props: runtime share (owner + standard) + injected face + locale seat. */
export type MarketsActionProps =
  PropsRuntime<'sidebar.actions'>
  & MarketsActionInjected
  & PropsLocale<'markets'>

/**
 * Render the Markets entry row.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the entry button element tree.
 */
export function MarketsAction({ setMode, wide, t }: MarketsActionProps) {
  return (
    <button
      type="button"
      className={clsx(css.action, wide ? css.wide : css.rail)}
      aria-label={t('mode.markets.label')}
      onClick={() => { setMode() }}
    >
      <MarketsIcon size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('mode.markets')}</span>}
    </button>
  )
}
