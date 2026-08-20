/**
 * The Course page: the center-column surface for the `course` mode, keyed into
 * the frame's `mode.page` slot. Mounts the SDKWork Course PC surface through
 * this plugin's host adapter after IAM reports signed in.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  AuthenticatedSdkworkModePage,
  type AuthenticatedSdkworkModePageInjected,
} from '@deepseek-ai/dsh-client-ui-iam/client'
import { CourseApp } from './courseHost.ts'
import css from './CoursePage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface CoursePageInjected extends AuthenticatedSdkworkModePageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'course'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type CoursePageProps =
  PropsRuntime<'mode.page'>
  & CoursePageInjected
  & PropsLocale<'course'>

/**
 * Render the Course page.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function CoursePage({ mode, authGate, t }: CoursePageProps) {
  return (
    <AuthenticatedSdkworkModePage
      mode={mode}
      authGate={authGate}
      className={css.page}
      dataAttributes={{ 'data-course-surface': 'sdkwork' }}
      title={t('auth.required.title')}
      detail={t('auth.required.detail')}
      actionLabel={t('auth.required.action')}
    >
      <CourseApp />
    </AuthenticatedSdkworkModePage>
  )
}
