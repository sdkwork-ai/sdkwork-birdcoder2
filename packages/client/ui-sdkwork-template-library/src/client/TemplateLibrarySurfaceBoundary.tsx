/**
 * Crash face for the embedded Template Library column. The framework's slot
 * boundary renders an empty marker when a mode-page entry crashes, which would
 * leave the whole column blank; this boundary sits below it and keeps a
 * complete, host-themed column with a retry action between the slot system and
 * the SDKWork surface stack.
 */
import { Component, Fragment, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { TemplateLibraryIcon } from './icons.tsx'
import css from './TemplateLibraryPage.module.css'

/** Props for the Template Library surface crash boundary. */
export interface TemplateLibrarySurfaceBoundaryProps {
  /** Template Library namespace translate seat for the crash face copy. */
  t: TranslateNS<'template-library'>
  /** The embedded surface tree. */
  children?: ReactNode
}

interface TemplateLibrarySurfaceBoundaryState {
  failed: boolean
  attempt: number
}

/**
 * Contain render crashes of the embedded Template Library surface.
 * @param props - the Template Library locale seat and the surface tree.
 * @returns the surface tree, or the themed crash face with retry.
 */
/* jscpd:ignore-start -- the deliberate per-package copy shared with
   ui-sdkwork-markets and ui-sdkwork-appstore. */
export class TemplateLibrarySurfaceBoundary extends Component<
  TemplateLibrarySurfaceBoundaryProps,
  TemplateLibrarySurfaceBoundaryState
> {
  override state: TemplateLibrarySurfaceBoundaryState = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<TemplateLibrarySurfaceBoundaryState> {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('ui-sdkwork-template-library: embedded Template Library surface crashed:', error)
  }

  private readonly retry = (): void => {
    this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={css.empty} data-template-library-empty="crashed">
          <div className={css.emptyIconTile}>
            <TemplateLibraryIcon size={28} />
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
