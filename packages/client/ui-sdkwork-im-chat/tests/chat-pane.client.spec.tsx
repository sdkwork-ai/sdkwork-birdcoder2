// @vitest-environment jsdom
/**
 * Conversation pane spec: the pane mounts the conversation surface for the id
 * the chat page selected, swaps the mounted surface when that id changes, and
 * disposes it on unmount.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ChatPane, type ChatPaneProps } from '../src/client/ChatPane.tsx'

function mountApi() {
  const handle = { update: vi.fn(), dispose: vi.fn() }
  const mountSurface = vi.fn(() => handle)
  return { mountSurface, handle }
}

function props(mountSurface: ChatPaneProps['mountSurface'], conversationId: string): ChatPaneProps {
  return { conversationId, mountSurface } as unknown as ChatPaneProps
}

describe('ChatPane', () => {
  it('mounts the conversation surface and updates it when the conversation changes', () => {
    const { mountSurface, handle } = mountApi()
    const { rerender } = render(<ChatPane {...props(mountSurface, 'conversation-1')} />)

    expect(mountSurface).toHaveBeenCalledTimes(1)
    const [container, request] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { kind: string; conversationId: string }]
    expect(container).toBeInstanceOf(HTMLElement)
    expect(request).toEqual({ kind: 'conversation', conversationId: 'conversation-1' })

    rerender(<ChatPane {...props(mountSurface, 'conversation-2')} />)
    expect(mountSurface).toHaveBeenCalledTimes(1)
    expect(handle.update).toHaveBeenCalledWith({ kind: 'conversation', conversationId: 'conversation-2' })
  })

  it('gives the mounted surface a full-height block host', () => {
    // A flex container would let a width-less embedded surface shrink to its
    // content instead of filling the pane; the host must stay a plain block.
    const { mountSurface } = mountApi()
    const { container } = render(<ChatPane {...props(mountSurface, 'conversation-1')} />)
    const host = container.firstElementChild as HTMLElement
    expect(host.style.height).toBe('100%')
    expect(host.style.display).toBe('')
  })

  it('disposes the mounted surface on unmount', () => {
    const { mountSurface, handle } = mountApi()
    const { unmount } = render(<ChatPane {...props(mountSurface, 'conversation-1')} />)
    unmount()
    expect(handle.dispose).toHaveBeenCalledTimes(1)
  })
})
