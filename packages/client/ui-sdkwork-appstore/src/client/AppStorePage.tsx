/**
 * The App Store page: the center-column surface for the `appstore` mode, keyed
 * into the frame's `mode.page` slot. Mounts the SDKWork App Store PC surface
 * through this plugin's host adapter without a sign-in wall: catalog browsing
 * stays anonymous, and the embedded surface opens its own sign-in flow for
 * account-bound routes (library, wishlist, updates, console, admin, publisher)
 * and for install or publish actions.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { AppstoreApp } from './appstoreHost.ts'
import { AppstoreSurfaceBoundary } from './AppstoreSurfaceBoundary.tsx'
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
export function AppStorePage({ mode, t }: AppStorePageProps) {
  return (
    <div
      className={css.page}
      data-mode={mode}
      data-mode-page={mode}
      data-appstore-surface="sdkwork"
    >
      <AppstoreSurfaceBoundary t={t}>
        <AppstoreApp t={t} />
      </AppstoreSurfaceBoundary>
    </div>
  )
}
