/**
 * The assets page: the center-column surface for the `assets` mode, keyed into
 * the frame's `mode.page` slot. Mounts the SDKWork Agents assets (资产) PC
 * surface through this plugin's host adapter.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { AssetsApp } from './assetsHost.ts'
import css from './AssetsPage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface AssetsPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'assets'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type AssetsPageProps =
  PropsRuntime<'mode.page'>
  & AssetsPageInjected
  & PropsLocale<'generationsAssets'>

/**
 * Render the SDKWork Agents assets (资产) page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function AssetsPage({ mode }: AssetsPageProps) {
  return (
    <div className={css.page} data-assets-surface="sdkwork" data-mode={mode} data-mode-page={mode}>
      <AssetsApp />
    </div>
  )
}
