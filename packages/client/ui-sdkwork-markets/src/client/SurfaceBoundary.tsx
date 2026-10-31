/**
 * Contain render crashes of embedded SDKWork surfaces. The framework's slot
 * boundary renders an empty marker when a mode-page entry crashes, which
 * would leave the whole column blank; this boundary sits below it and keeps a
 * complete, host-themed panel with a retry action between the slot system and
 * the SDKWork surface stack. Both hosts that swap their whole body for an
 * embedded surface — the market page and the my-experts create flow — wrap
 * their surface in it.
 */
import { Component, Fragment, type ReactNode } from 'react'
import { PluginsIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import css from './MarketsPage.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/** Full props for the surface crash boundary. */
export interface SurfaceBoundaryProps {
  /** The locale seat (the crash panel's copy). */
  t: Translate
  /** The embedded surface body. */
  children?: ReactNode
}

/**
 * Contain render crashes of an embedded SDKWork surface.
 * @param props - the locale seat and the surface body.
 * @returns the surface body, or the crash panel after a render error.
 */
export class SurfaceBoundary extends Component<
  SurfaceBoundaryProps,
  { failed: boolean; attempt: number }
> {
  override state = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('ui-sdkwork-markets: embedded surface crashed:', error)
  }

  private readonly retry = (): void => {
    this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={css.empty} data-markets-empty="crashed">
          <div className={css.emptyIconTile}>
            <PluginsIcon size={28} />
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
