/**
 * The Drive page: the center-column surface for the `drive` mode, keyed into
 * the frame's `mode.page` slot. Mounts the SDKWork Drive PC surface through
 * this plugin's host adapter after IAM reports signed in.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  AuthenticatedSdkworkModePage,
  type AuthenticatedSdkworkModePageInjected,
} from '@deepseek-ai/dsh-client-ui-iam/client'
import { DriveApp } from './driveHost.ts'
import css from './DrivePage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface DrivePageInjected extends AuthenticatedSdkworkModePageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'drive'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type DrivePageProps =
  PropsRuntime<'mode.page'>
  & DrivePageInjected
  & PropsLocale<'drive'>

/**
 * Render the Drive page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function DrivePage({ mode, authGate, t }: DrivePageProps) {
  return (
    <AuthenticatedSdkworkModePage
      mode={mode}
      authGate={authGate}
      className={css.page}
      dataAttributes={{ 'data-drive-surface': 'sdkwork' }}
      title={t('auth.required.title')}
      detail={t('auth.required.detail')}
      actionLabel={t('auth.required.action')}
    >
      <DriveApp />
    </AuthenticatedSdkworkModePage>
  )
}
