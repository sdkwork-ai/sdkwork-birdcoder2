/**
 * The Demand Hall page: the center-column surface for the `demand-hall` mode,
 * keyed into the frame's `mode.page` slot. Hosts the SDKWork App Store
 * 需求大厅 (demand publishing and claiming page) through this plugin's host
 * adapter, without a sign-in wall: the embedded surface opens its own sign-in
 * flow for account-bound actions (publishing and claiming demand the session).
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { DemandHallApp } from './demandHallHost.ts'
import { DemandHallSurfaceBoundary } from './DemandHallSurfaceBoundary.tsx'
import css from './DemandHallPage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface DemandHallPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'demand-hall'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type DemandHallPageProps =
  PropsRuntime<'mode.page'>
  & DemandHallPageInjected
  & PropsLocale<'demand-hall'>

/**
 * Render the Demand Hall page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function DemandHallPage({ mode, t }: DemandHallPageProps) {
  return (
    <div
      className={css.page}
      data-mode={mode}
      data-mode-page={mode}
      data-demand-hall-surface="sdkwork"
    >
      <DemandHallSurfaceBoundary t={t}>
        <DemandHallApp t={t} />
      </DemandHallSurfaceBoundary>
    </div>
  )
}
