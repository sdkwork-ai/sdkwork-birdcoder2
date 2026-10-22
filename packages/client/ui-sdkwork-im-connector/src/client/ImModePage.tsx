/**
 * The IM connector mode page: the IM management panel as a full app surface.
 *
 * The panel itself belongs to the linked `@xmanrui/dsh-im` plugin; this page
 * owns only the surface frame (scroll container and the centered panel width
 * the plugin's plugin-page wrapper used) and asks that plugin's `dshImClient`
 * service for the element. Rendering does not depend on any channel being
 * connected or linked: the panel's own channel cards report that state, and
 * the page always shows the complete management interface.
 */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ImModePage.module.css'

/** Injected business face: the IM panel element built by the dsh-im plugin. */
export interface ImModePageInjected {
  /** Build the management panel element for the current locale/render. */
  renderPanel: () => ReactNode
}

/** Full component props: the mode-page runtime share plus the injected renderer. */
export type ImModePageProps = PropsRuntime<'mode.page'> & ImModePageInjected

/**
 * Render the IM connector mode page.
 * @param props - composed slot props (mode-page runtime share + injected renderer).
 * @returns the page frame around the IM management panel.
 */
export function ImModePage({ renderPanel }: ImModePageProps) {
  return (
    <div className={css.page} data-im-connector-page>
      <div className={css.content}>{renderPanel()}</div>
    </div>
  )
}
