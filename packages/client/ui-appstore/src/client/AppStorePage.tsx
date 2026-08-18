/**
 * The App Store page: the center-column surface for the `appstore` mode, keyed
 * into the frame's `mode.page` slot. Mounts the SDKWork App Store PC surface
 * through this plugin's host adapter.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { AppstoreApp } from './appstoreHost.ts'
import css from './AppStorePage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface AppStorePageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'appstore'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type AppStorePageProps =
  PropsRuntime<'mode.page'>
  & AppStorePageInjected
  & PropsLocale<'appstore'>

/**
 * Render the App Store page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function AppStorePage({ mode }: AppStorePageProps) {
  return (
    <div className={css.page} data-appstore-surface="sdkwork" data-mode={mode} data-mode-page={mode}>
      <AppstoreApp />
    </div>
  )
}
