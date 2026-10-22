// @vitest-environment jsdom
/**
 * Contacts mode page spec: the page mounts the contacts directory, keeps the
 * product shell visible while a failure is toasted, and disposes the surface on
 * unmount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ImMountStatus, ImSnapshot } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { ContactsModePage, type ContactsModePageProps } from '../src/client/ContactsModePage.tsx'

afterEach(() => { cleanup() })

const authGate = {
  isSignedIn: () => true,
  openSignInOverlay: () => {},
  subscribe: () => () => {},
}

const t = ((key: string) => key) as ContactsModePageProps['t']

function snapshot(overrides: Partial<ImSnapshot> = {}): ImSnapshot {
  return { selectedConversationId: null, totalUnread: 0, error: null, notice: null, ...overrides }
}

function props(
  state: ImSnapshot,
  mountSurface: ContactsModePageProps['mountSurface'],
): ContactsModePageProps {
  return {
    mode: 'contacts',
    authGate,
    openConversation: vi.fn(),
    mountSurface,
    useIm: (((selector: (s: ImSnapshot) => unknown) => selector(state)) as unknown) as ContactsModePageProps['useIm'],
    t,
  } as unknown as ContactsModePageProps
}

describe('ContactsModePage', () => {
  it('mounts the contacts directory', () => {
    const handle = { update: vi.fn(), dispose: vi.fn() }
    const mountSurface = vi.fn(() => handle)
    render(<ContactsModePage {...props(snapshot(), mountSurface)} />)

    expect(mountSurface).toHaveBeenCalledTimes(1)
    const [, request] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { kind: string; onConversationOpen?: unknown }]
    expect(request.kind).toBe('contacts')
    expect(typeof request.onConversationOpen).toBe('function')
  })

  it('forwards an opened conversation to the host navigation', () => {
    const openConversation = vi.fn()
    const mountSurface = vi.fn(() => ({ update: vi.fn(), dispose: vi.fn() }))
    render(
      <ContactsModePage
        {...props(snapshot(), mountSurface)}
        openConversation={openConversation}
      />,
    )
    const [, request] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { onConversationOpen: (id: string) => void }]
    request.onConversationOpen('conversation-3')
    expect(openConversation).toHaveBeenCalledWith('conversation-3')
  })

  it.each([
    ['init-failed', 'state.initFailed'],
    ['load-failed', 'state.loadFailed'],
    ['unconfigured', 'state.notConfigured'],
    ['mount-failed', 'state.signInRequired'],
  ] as const)('toasts %s as %s while the directory shell stays mounted', (code, copy) => {
    const mountSurface = vi.fn(() => ({ update: vi.fn(), dispose: vi.fn() }))
    render(<ContactsModePage {...props(snapshot({ notice: { id: 1, code } }), mountSurface)} />)
    expect(screen.getByText(copy)).toBeTruthy()
    expect(document.querySelector('[data-im-skeleton]')).not.toBeNull()
    expect(document.querySelector('[data-im-contacts]')).not.toBeNull()
  })

  it('keeps the shell and toasts a failed embed load reported by the mount', () => {
    const mountSurface = vi.fn((_container: HTMLElement, request: { onStatus?: (status: ImMountStatus) => void }) => {
      request.onStatus?.({ phase: 'error', error: 'load-failed' })
      return { update: vi.fn(), dispose: vi.fn() }
    })
    render(<ContactsModePage {...props(snapshot({ notice: { id: 1, code: 'load-failed' } }), mountSurface)} />)
    expect(screen.getByText('state.loadFailed')).toBeTruthy()
    expect(document.querySelector('[data-im-skeleton]')).not.toBeNull()
  })

  it('dismisses the notice after four seconds', () => {
    vi.useFakeTimers()
    try {
      const mountSurface = vi.fn(() => ({ update: vi.fn(), dispose: vi.fn() }))
      render(<ContactsModePage {...props(snapshot({ notice: { id: 1, code: 'init-failed' } }), mountSurface)} />)
      expect(screen.getByText('state.initFailed')).toBeTruthy()
      act(() => { vi.advanceTimersByTime(4_000) })
      expect(screen.queryByText('state.initFailed')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops the placeholder once the directory reports ready', () => {
    const mountSurface = vi.fn((_container: HTMLElement, request: { onStatus?: (status: ImMountStatus) => void }) => {
      request.onStatus?.({ phase: 'ready', error: null })
      return { update: vi.fn(), dispose: vi.fn() }
    })
    render(<ContactsModePage {...props(snapshot(), mountSurface)} />)
    expect(document.querySelector('[data-im-skeleton]')).toBeNull()
  })

  it('disposes the mounted directory on unmount', () => {
    const handle = { update: vi.fn(), dispose: vi.fn() }
    const mountSurface = vi.fn(() => handle)
    const { unmount } = render(<ContactsModePage {...props(snapshot(), mountSurface)} />)
    unmount()
    expect(handle.dispose).toHaveBeenCalledTimes(1)
  })
})
