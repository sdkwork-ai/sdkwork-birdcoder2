/**
 * Crash face for the embedded Demand Hall column. The framework's slot
 * boundary renders an empty marker when a mode-page entry crashes, which would
 * leave the whole column blank; this boundary sits below it and keeps a
 * complete, host-themed column with a retry action between the slot system and
 * the SDKWork surface stack.
 */
import { Component, Fragment, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { DemandHallIcon } from './icons.tsx'
import css from './DemandHallPage.module.css'

/** Props for the Demand Hall surface crash boundary. */
export interface DemandHallSurfaceBoundaryProps {
  /** Demand Hall namespace translate seat for the crash face copy. */
  t: TranslateNS<'demand-hall'>
  /** The embedded surface tree. */
  children?: ReactNode
}

interface DemandHallSurfaceBoundaryState {
  failed: boolean
  attempt: number
}

/**
 * Contain render crashes of the embedded Demand Hall surface.
 * @param props - the Demand Hall locale seat and the surface tree.
 * @returns the surface tree, or the themed crash face with retry.
 */
/* jscpd:ignore-start -- the deliberate per-package copy shared with
   ui-sdkwork-markets and ui-sdkwork-template-library. */
export class DemandHallSurfaceBoundary extends Component<
  DemandHallSurfaceBoundaryProps,
  DemandHallSurfaceBoundaryState
> {
  override state: DemandHallSurfaceBoundaryState = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<DemandHallSurfaceBoundaryState> {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('ui-sdkwork-demand-hall: embedded Demand Hall surface crashed:', error)
  }

  private readonly retry = (): void => {
    this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={css.empty} data-demand-hall-empty="crashed">
          <div className={css.emptyIconTile}>
            <DemandHallIcon size={28} />
          </div>
          <p className={css.emptyTitle}>{this.props.t('surface.error.title')}</p>
          <p className={css.emptyDetail}>{this.props.t('surface.error.detail')}</p>
          <button type="button" className={css.emptyAction} onClick={this.retry}>
            {this.props.t('surface.error.retry')}
          </button>
        </div>
      )
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}
/* jscpd:ignore-end */
