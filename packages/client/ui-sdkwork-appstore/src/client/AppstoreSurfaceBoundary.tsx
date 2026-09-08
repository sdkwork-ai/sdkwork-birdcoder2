/**
 * Crash face for the embedded App Store column. The framework's slot boundary
 * renders an empty marker when a mode-page entry crashes, which would leave
 * the whole column blank; this boundary sits below it and keeps a complete,
 * host-themed column with a retry action between the slot system and the
 * SDKWork surface stack.
 */
import { Component, Fragment, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { AppStoreIcon } from './icons.tsx'
import css from './AppStorePage.module.css'

/** Props for the App Store surface crash boundary. */
export interface AppstoreSurfaceBoundaryProps {
  /** App Store namespace translate seat for the crash face copy. */
  t: TranslateNS<'appstore'>
  /** The embedded surface tree. */
  children?: ReactNode
}

interface AppstoreSurfaceBoundaryState {
  failed: boolean
  attempt: number
}

/**
 * Contain render crashes of the embedded App Store surface.
 * @param props - the App Store locale seat and the surface tree.
 * @returns the surface tree, or the themed crash face with retry.
 */
export class AppstoreSurfaceBoundary extends Component<
  AppstoreSurfaceBoundaryProps,
  AppstoreSurfaceBoundaryState
> {
  override state: AppstoreSurfaceBoundaryState = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<AppstoreSurfaceBoundaryState> {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('ui-sdkwork-appstore: embedded App Store surface crashed:', error)
  }

  private readonly retry = (): void => {
    this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={css.empty} data-appstore-empty="crashed">
          <div className={css.emptyIconTile}>
            <AppStoreIcon size={28} />
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
