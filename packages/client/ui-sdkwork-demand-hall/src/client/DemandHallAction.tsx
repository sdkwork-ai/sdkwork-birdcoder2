/**
 * The Demand Hall sidebar entry: the quick entry in the New Session
 * button area (the `sidebar.actions` list seat declared by the sidebar shell),
 * ordered below the template-library entry. Clicking opens the demand hall
 * page as an overlay inside the code surface through the layout service — the
 * rail selection stays `code`, so the code rail entry keeps its highlight.
 * Wide renders the icon + label row; the collapsed rail renders the icon
 * control.
 */
import clsx from 'clsx'
import { DemandHallIcon } from './icons.tsx'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.actions' seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './DemandHallAction.module.css'

/** Injected business face: the code-surface overlay switch this entry drives. */
export interface DemandHallActionInjected {
  /** Open this entry's page as a code-surface overlay. */
  setMode: () => void
}

/** Full component props: runtime share (owner + standard) + injected face + locale seat. */
export type DemandHallActionProps =
  PropsRuntime<'sidebar.actions'>
  & DemandHallActionInjected
  & PropsLocale<'demand-hall'>

/**
 * Render the Demand Hall entry row.
 * @param props - composed slot props (owner share + injected face + locale seat).
 * @returns the entry button element tree.
 */
export function DemandHallAction({ setMode, wide, t }: DemandHallActionProps) {
  return (
    <button
      type="button"
      className={clsx(css.action, wide ? css.wide : css.rail)}
      aria-label={t('mode.demand-hall.label')}
      onClick={() => { setMode() }}
    >
      <DemandHallIcon size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{t('mode.demand-hall')}</span>}
    </button>
  )
}
