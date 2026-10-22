/**
 * The contacts mode page: the SDKWork IM contacts directory filling the frame's
 * center column. The directory itself is mounted from the deployment's IM embed
 * bundle through `ctx.im`; the page only wires "send message" back to the host
 * service so the frame switches to the chat mode with that conversation
 * selected.
 *
 * A failed bundle load, a missing gateway, or a degraded IM runtime never
 * replaces the page: the product-shaped directory shell stays visible while a
 * transient toast names the failure.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the keyed mode-page contract.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  AuthenticatedSdkworkModePage,
  type AuthenticatedSdkworkModePageInjected,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {
  ImErrorCode,
  ImMountStatus,
  ImNotice,
  ImSnapshot,
  ImSurfaceHandle,
  ImSurfaceMountRequest,
} from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import css from './ContactsModePage.module.css'

/** Injected business face: the mode id, chat navigation, and the surface mount API. */
export interface ContactsModePageInjected extends AuthenticatedSdkworkModePageInjected {
  /** This page's own mode id (the keyed registration's key). */
  mode: 'contacts'
  /** Select the conversation and switch the frame to the chat page. */
  openConversation: (conversationId: string) => void
  /** Mount one IM surface into a host container. */
  mountSurface: (container: HTMLElement, request: ImSurfaceMountRequest) => ImSurfaceHandle
}

/** Full component props: runtime share + injected face + IM hook + locale seat. */
export type ContactsModePageProps =
  PropsRuntime<'mode.page'>
  & ContactsModePageInjected
  & { useIm: SnapshotSelectorHook<ImSnapshot> }
  & PropsLocale<'imContacts'>

/** Initial mount status before the embed bundle reports back. */
const INITIAL_STATUS: ImMountStatus = { phase: 'loading', error: null }

/**
 * Locale key naming one failure code.
 * @param code - failure the IM service announced.
 * @returns the dictionary key to render.
 */
function noticeKey(code: ImErrorCode): 'state.initFailed' | 'state.loadFailed' | 'state.notConfigured' | 'state.signInRequired' {
  switch (code) {
    case 'init-failed':
      return 'state.initFailed'
    case 'load-failed':
      return 'state.loadFailed'
    case 'unconfigured':
      return 'state.notConfigured'
    case 'mount-failed':
      return 'state.signInRequired'
  }
}

/** Auto-dismissing notice that leaves the page underneath untouched. */
function ImToast({ notice, t }: { notice: ImNotice | null; t: ContactsModePageProps['t'] }): ReactNode {
  const [dismissed, setDismissed] = useState<number | null>(null)
  if (notice === null || notice.id === dismissed) return null
  return (
    <Toast
      key={notice.id}
      text={t(noticeKey(notice.code))}
      onDone={() => { setDismissed(notice.id) }}
    />
  )
}

/** Product-shaped placeholder shown until the IM surface reports ready. */
function ImDirectorySkeleton(): ReactNode {
  return (
    <div className={css.skeleton} aria-hidden data-im-skeleton>
      {Array.from({ length: 8 }, (_, index) => <span key={index} className={css.skeletonRow} />)}
    </div>
  )
}

/**
 * Render the contacts mode page.
 * @param props - composed slot props (mode page share + injected face + hook + locale seat).
 * @returns the contacts directory page.
 */
export function ContactsModePage({
  mode,
  authGate,
  openConversation,
  mountSurface,
  useIm,
  t,
}: ContactsModePageProps) {
  const notice = useIm(snapshot => snapshot.notice ?? null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<ImMountStatus>(INITIAL_STATUS)

  useEffect(() => {
    const container = containerRef.current
    /* v8 ignore next 3 -- the ref is attached by effect time: the component renders the container. */
    if (container === null) {
      return
    }
    const handle = mountSurface(container, {
      kind: 'contacts',
      onConversationOpen: openConversation,
      onStatus: setStatus,
    })
    return () => { handle.dispose() }
  }, [mountSurface, openConversation])

  return (
    <AuthenticatedSdkworkModePage
      mode={mode}
      authGate={authGate}
      className={css.page}
      title={t('auth.required.title')}
      detail={t('auth.required.detail')}
      actionLabel={t('auth.required.action')}
    >
      <div ref={containerRef} className={css.directory} data-im-contacts />
      {status.phase === 'ready' ? null : <ImDirectorySkeleton />}
      <ImToast notice={notice} t={t} />
    </AuthenticatedSdkworkModePage>
  )
}
