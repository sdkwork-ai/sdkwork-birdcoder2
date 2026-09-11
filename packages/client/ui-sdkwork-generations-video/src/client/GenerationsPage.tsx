/**
 * The video generation page: the center-column surface for the `video` mode,
 * keyed into the frame's `mode.page` seat. Mounts the SDKWork Agents creative
 * (生成) PC surface through this plugin's host adapter with video as the default
 * generation modality in the input dialog.
 *
 * The page defers its sign-in requirement: the composer, presets, and
 * inspiration feed render while signed out, and the overlay is raised by the
 * transport only when a request actually needs a session.
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  AuthenticatedSdkworkModePage,
  type AuthenticatedSdkworkModePageInjected,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { CreativeApp } from './creativeHost.ts'
import css from './GenerationsPage.module.css'

/** Injected business face: which mode this keyed entry renders. */
export interface VideoGenerationsPageInjected extends AuthenticatedSdkworkModePageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'video'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type VideoGenerationsPageProps =
  PropsRuntime<'mode.page'>
  & VideoGenerationsPageInjected
  & PropsLocale<'generationsVideo'>

/**
 * Render the SDKWork Agents creative (生成) page for video mode.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function VideoGenerationsPage({ mode, authGate }: VideoGenerationsPageProps) {
  return (
    <AuthenticatedSdkworkModePage
      mode={mode}
      authGate={authGate}
      className={css.page}
      dataAttributes={{ 'data-creative-surface': 'sdkwork' }}
      signInPolicy="deferred"
    >
      <CreativeApp />
    </AuthenticatedSdkworkModePage>
  )
}
