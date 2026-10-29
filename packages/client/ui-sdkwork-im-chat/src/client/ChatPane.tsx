/**
 * The conversation pane: fills the chat mode's `im.chat.pane` seat with the
 * conversation surface the deployed SDKWork IM embed bundle exposes.
 *
 * The page owns selection and mounts the surface through `ctx.im`; the pane
 * only forwards the selected conversation id and swaps the mounted surface when
 * that id changes.
 */
import { useEffect, useRef } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the im.chat.pane seat declaration (ui-sdkwork-im-conversations).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-im-conversations/client'
import type { ImSurfaceHandle, ImSurfaceMountRequest } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'

/** Injected business face: the surface mount API owned by `ctx.im`. */
export interface ChatPaneInjected {
  /** Mount one IM surface into a host container. */
  mountSurface: (container: HTMLElement, request: ImSurfaceMountRequest) => ImSurfaceHandle
}

/** Full component props: the pane owner share plus the mount API. */
export type ChatPaneProps = PropsRuntime<'im.chat.pane'> & ChatPaneInjected

/**
 * Render the selected conversation.
 * @param props - the conversation id the page selected and the mount API.
 * @returns the host container the conversation surface fills.
 */
export function ChatPane({ conversationId, mountSurface }: ChatPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<ImSurfaceHandle | null>(null)

  useEffect(() => {
    const container = containerRef.current
    /* v8 ignore next 3 -- the ref is attached by effect time: the component renders the container. */
    if (container === null) {
      return
    }
    const handle = mountSurface(container, { kind: 'conversation', conversationId })
    handleRef.current = handle
    return () => {
      handle.dispose()
      handleRef.current = null
    }
  }, [mountSurface])

  useEffect(() => {
    handleRef.current?.update({ kind: 'conversation', conversationId })
  }, [conversationId])

  return <div ref={containerRef} style={{ height: '100%', minHeight: 0 }} data-im-conversation />
}
