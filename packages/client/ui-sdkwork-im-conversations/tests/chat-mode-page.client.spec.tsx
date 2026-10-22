// @vitest-environment jsdom
/**
 * Chat mode page spec: the page mounts the conversation list once, passes the
 * selected conversation to the pane seat, shows the empty state without a
 * selection, and reports a failed embed load as an unavailable strip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ImMountStatus, ImSnapshot } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { ChatModePage, type ChatModePageProps } from '../src/client/ChatModePage.tsx'

afterEach(() => { cleanup() })

const authGate = {
  isSignedIn: () => true,
  openSignInOverlay: () => {},
  subscribe: () => () => {},
}

const t = ((key: string) => key) as ChatModePageProps['t']

function snapshot(overrides: Partial<ImSnapshot> = {}): ImSnapshot {
  return { selectedConversationId: null, totalUnread: 0, error: null, notice: null, ...overrides }
}

function mountApi() {
  const handle = { update: vi.fn(), dispose: vi.fn() }
  const mountSurface = vi.fn(() => handle)
  return { mountSurface, handle }
}

function props(
  state: ImSnapshot,
  mountSurface: ChatModePageProps['mountSurface'],
): ChatModePageProps {
  return {
    mode: 'chat',
    authGate,
    selectConversation: vi.fn(),
    mountSurface,
    useIm: (((selector: (s: ImSnapshot) => unknown) => selector(state)) as unknown) as ChatModePageProps['useIm'],
    renderSlot: (((_name: string, owner: { conversationId: string }) => <div data-testid="pane">{owner.conversationId}</div>) as unknown) as ChatModePageProps['renderSlot'],
    t,
  } as unknown as ChatModePageProps
}

describe('ChatModePage', () => {
  it('mounts the conversation list and shows the empty state without a selection', () => {
    const { mountSurface } = mountApi()
    render(<ChatModePage {...props(snapshot(), mountSurface)} />)

    expect(mountSurface).toHaveBeenCalledTimes(1)
    const [, request] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { kind: string }]
    expect(request.kind).toBe('conversation-list')
    expect(screen.getByText('empty.title')).toBeTruthy()
    expect(screen.queryByTestId('pane')).toBeNull()
  })

  it('renders the pane seat for the selected conversation and keeps the list mounted', () => {
    const { mountSurface, handle } = mountApi()
    render(<ChatModePage {...props(snapshot({ selectedConversationId: 'conversation-7' }), mountSurface)} />)
    expect(screen.getByTestId('pane').textContent).toBe('conversation-7')
    // Selection changes update the mounted list instead of remounting it.
    expect(handle.update).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'conversation-list',
      selectedConversationId: 'conversation-7',
    }))
  })

  it('keeps the product shell and toasts a failed embed load', () => {
    const mountSurface = vi.fn((_container: HTMLElement, request: { onStatus?: (status: ImMountStatus) => void }) => {
      request.onStatus?.({ phase: 'error', error: 'load-failed' })
      return { update: vi.fn(), dispose: vi.fn() }
    })
    render(<ChatModePage {...props(snapshot({ notice: { id: 1, code: 'load-failed' } }), mountSurface)} />)
    expect(screen.getByText('state.loadFailed')).toBeTruthy()
    expect(document.querySelector('[data-im-skeleton]')).not.toBeNull()
    // The two-column product shell stays in the tree under the placeholder.
    expect(document.querySelector('[data-im-chat-pane]')).not.toBeNull()
    expect(document.querySelector('[data-im-conversation-list]')).not.toBeNull()
  })

  it.each([
    ['init-failed', 'state.initFailed'],
    ['load-failed', 'state.loadFailed'],
    ['unconfigured', 'state.notConfigured'],
    ['mount-failed', 'state.signInRequired'],
  ] as const)('toasts %s as %s while the shell stays mounted', (code, copy) => {
    const { mountSurface } = mountApi()
    render(<ChatModePage {...props(snapshot({ notice: { id: 1, code } }), mountSurface)} />)
    expect(screen.getByText(copy)).toBeTruthy()
    expect(document.querySelector('[data-im-skeleton]')).not.toBeNull()
  })

  it('dismisses the notice after four seconds without touching the shell', () => {
    vi.useFakeTimers()
    try {
      const { mountSurface } = mountApi()
      render(<ChatModePage {...props(snapshot({ notice: { id: 1, code: 'init-failed' } }), mountSurface)} />)
      expect(screen.getByText('state.initFailed')).toBeTruthy()
      act(() => { vi.advanceTimersByTime(4_000) })
      expect(screen.queryByText('state.initFailed')).toBeNull()
      expect(document.querySelector('[data-im-chat-pane]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops the placeholder once the surface reports ready', () => {
    const mountSurface = vi.fn((_container: HTMLElement, request: { onStatus?: (status: ImMountStatus) => void }) => {
      request.onStatus?.({ phase: 'ready', error: null })
      return { update: vi.fn(), dispose: vi.fn() }
    })
    render(<ChatModePage {...props(snapshot(), mountSurface)} />)
    expect(document.querySelector('[data-im-skeleton]')).toBeNull()
  })

  it('disposes the mounted list on unmount', () => {
    const { mountSurface, handle } = mountApi()
    const { unmount } = render(<ChatModePage {...props(snapshot(), mountSurface)} />)
    unmount()
    expect(handle.dispose).toHaveBeenCalledTimes(1)
  })

  it('does not render when the IAM gate reports signed out', () => {
    const { mountSurface } = mountApi()
    const signedOut = { ...authGate, isSignedIn: () => false }
    render(<ChatModePage {...props(snapshot(), mountSurface)} authGate={signedOut} />)
    expect(mountSurface).not.toHaveBeenCalled()
  })

  it('forwards the load status callback to the mount request', () => {
    const { mountSurface } = mountApi()
    render(<ChatModePage {...props(snapshot(), mountSurface)} />)
    const [, request] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { onStatus?: (status: ImMountStatus) => void }]
    expect(typeof request.onStatus).toBe('function')
  })
})
