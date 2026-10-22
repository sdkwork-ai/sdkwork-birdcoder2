/**
 * The chat mode page: the SDKWork IM conversation list on the left and the
 * selected conversation's pane on the right. The page owns the two-column shell
 * and the selection; the IM product UI itself is mounted from the deployment's
 * embed bundle through `ctx.im`, and ui-sdkwork-im-chat fills the
 * `im.chat.pane` seat with the conversation surface.
 *
 * A failed bundle load, a missing gateway, or a degraded IM runtime never
 * replaces the page: the product-shaped two-column shell stays visible while a
 * transient toast names the failure.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the keyed mode-page contract and the chat pane seat declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from './contract/slots.ts'
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
import css from './ChatModePage.module.css'

/** Injected business face: the mode id, selection writes, and the surface mount API. */
export interface ChatModePageInjected extends AuthenticatedSdkworkModePageInjected {
  /** This page's own mode id (the keyed registration's key). */
  mode: 'chat'
  /** Write the selected conversation into the host service. */
  selectConversation: (conversationId: string) => void
  /** Mount one IM surface into a host container. */
  mountSurface: (container: HTMLElement, request: ImSurfaceMountRequest) => ImSurfaceHandle
}

/** Full component props: runtime share + pane slot + injected face + hook + locale seat. */
export type ChatModePageProps =
  PropsRuntime<'mode.page'>
  & PropsRenderSlots<'im.chat.pane'>
  & ChatModePageInjected
  & { useIm: SnapshotSelectorHook<ImSnapshot> }
  & PropsLocale<'imConversations'>

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
function ImToast({ notice, t }: { notice: ImNotice | null; t: ChatModePageProps['t'] }): ReactNode {
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
function ImShellSkeleton(): ReactNode {
  return (
    <div className={css.skeleton} aria-hidden data-im-skeleton>
      <div className={css.skeletonList}>
        {Array.from({ length: 6 }, (_, index) => <span key={index} className={css.skeletonRow} />)}
      </div>
      <div className={css.skeletonPane}>
        <span className={css.skeletonHeading} />
        <span className={css.skeletonBody} />
      </div>
    </div>
  )
}

/**
 * Render the chat mode page.
 * @param props - composed slot props (mode page share + pane slot + injected face + hook + locale seat).
 * @returns the two-column chat page.
 */
export function ChatModePage({
  mode,
  authGate,
  selectConversation,
  mountSurface,
  useIm,
  renderSlot,
  t,
}: ChatModePageProps) {
  const selectedConversationId = useIm(snapshot => snapshot.selectedConversationId ?? null)
  const notice = useIm(snapshot => snapshot.notice ?? null)
  const listContainerRef = useRef<HTMLDivElement | null>(null)
  const listHandleRef = useRef<ImSurfaceHandle | null>(null)
  const [status, setStatus] = useState<ImMountStatus>(INITIAL_STATUS)

  useEffect(() => {
    const container = listContainerRef.current
    /* v8 ignore next 3 -- the ref is attached by effect time: the component renders the container. */
    if (container === null) {
      return
    }
    const handle = mountSurface(container, {
      kind: 'conversation-list',
      onConversationSelect: selectConversation,
      onStatus: setStatus,
    })
    listHandleRef.current = handle
    return () => {
      handle.dispose()
      listHandleRef.current = null
    }
  }, [mountSurface, selectConversation])

  useEffect(() => {
    listHandleRef.current?.update({
      kind: 'conversation-list',
      selectedConversationId: selectedConversationId ?? undefined,
      onConversationSelect: selectConversation,
      onStatus: setStatus,
    })
  }, [selectedConversationId, selectConversation])

  return (
    <AuthenticatedSdkworkModePage
      mode={mode}
      authGate={authGate}
      className={css.page}
      title={t('auth.required.title')}
      detail={t('auth.required.detail')}
      actionLabel={t('auth.required.action')}
    >
      <div className={css.body}>
        <div ref={listContainerRef} className={css.list} data-im-conversation-list />
        <div className={css.pane} data-im-chat-pane>
          {selectedConversationId === null
            ? (
              <div className={css.empty}>
                <h2 className={css.emptyTitle}>{t('empty.title')}</h2>
                <p className={css.emptyDetail}>{t('empty.detail')}</p>
              </div>
            )
            : renderSlot('im.chat.pane', { conversationId: selectedConversationId })}
        </div>
        {status.phase === 'ready' ? null : <ImShellSkeleton />}
        <ImToast notice={notice} t={t} />
      </div>
    </AuthenticatedSdkworkModePage>
  )
}
