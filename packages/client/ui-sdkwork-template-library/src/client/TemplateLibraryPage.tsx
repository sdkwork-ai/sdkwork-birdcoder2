/**
 * The Template Library page: the center-column surface for the
 * `template-library` mode, keyed into the frame's `mode.page` slot. Mounts the
 * SDKWork App Store templates catalog through this plugin's host adapter
 * without a sign-in wall: catalog browsing stays anonymous, and the embedded
 * surface opens its own sign-in flow for account-bound actions.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { TemplateLibraryApp } from './templateLibraryHost.ts'
import { TemplateLibrarySurfaceBoundary } from './TemplateLibrarySurfaceBoundary.tsx'
import css from './TemplateLibraryPage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface TemplateLibraryPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'template-library'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type TemplateLibraryPageProps =
  PropsRuntime<'mode.page'>
  & TemplateLibraryPageInjected
  & PropsLocale<'template-library'>

/**
 * Render the Template Library page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function TemplateLibraryPage({ mode, t }: TemplateLibraryPageProps) {
  return (
    <div
      className={css.page}
      data-mode={mode}
      data-mode-page={mode}
      data-template-library-surface="sdkwork"
    >
      <TemplateLibrarySurfaceBoundary t={t}>
        <TemplateLibraryApp t={t} />
      </TemplateLibrarySurfaceBoundary>
    </div>
  )
}
