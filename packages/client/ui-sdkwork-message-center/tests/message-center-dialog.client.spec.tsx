// @vitest-environment jsdom
/** The message-center overlay: state blocks, day groups, detail, pagination, and close. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  MessageCenterDialog,
  type MessageCenterDialogProps,
} from '../src/client/MessageCenterDialog.tsx'
import { createMessageCenterUiStore } from '../src/client/message-ui-store.ts'
import type { MessageItem } from '../src/client/message-contract.ts'
import type { MessageCenterSnapshot } from '../src/client/message-service.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** Translate seat over the plugin's own dictionary. */
const t = makeTranslate(en) as MessageCenterDialogProps['t']

/** One notification. */
function message(overrides: Partial<MessageItem> = {}): MessageItem {
  return {
    id: 'n-1',
    appId: 'sdkwork-birdcoder',
    title: 'Welcome',
    desc: 'Summary',
    content: 'Body',
    time: new Date().toISOString(),
    type: 'info',
    read: false,
    showAsPopup: false,
    popupSeen: false,
    archived: false,
    actionUrl: null,
    ...overrides,
  }
}

/** One observable snapshot that a test can move. */
function snapshotSource(initial: MessageCenterSnapshot) {
  let current = initial
  const listeners = new Set<() => void>()
  const observable: HostObservable<MessageCenterSnapshot> = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return {
    observable,
    publish(next: MessageCenterSnapshot): void {
      current = next
      for (const listener of listeners) listener()
    },
  }
}

/** A ready snapshot over the given notifications. */
function readySnapshot(items: readonly MessageItem[], overrides: Partial<MessageCenterSnapshot> = {}): MessageCenterSnapshot {
  return {
    status: 'ready',
    items,
    unreadCount: items.filter(item => !item.read).length,
    hasMore: false,
    failure: null,
    ...overrides,
  }
}

/** Render the overlay over one snapshot with scripted injected gestures. */
function renderCenter(options: {
  snapshot: MessageCenterSnapshot
  open?: boolean
  canSignIn?: boolean
}) {
  const store = createMessageCenterUiStore().create()
  if (options.open !== false) store.actions.openDialog()
  const source = snapshotSource(options.snapshot)
  const injected = {
    refresh: vi.fn(),
    loadMore: vi.fn(),
    markRead: vi.fn(),
    signIn: vi.fn(),
    canSignIn: options.canSignIn ?? true,
  }
  const view = render(
    <MessageCenterDialog
      {...({} as GlobalStandardProps)}
      useStore={bindSnapshotSelector(store)}
      actions={store.actions}
      useSnapshot={bindSnapshotSelector(source.observable)}
      {...injected}
      t={t}
    />,
  )
  return { ...view, store, source, injected }
}

describe('MessageCenterDialog', () => {
  it('renders nothing while the shared store is closed', () => {
    const { container } = renderCenter({ snapshot: readySnapshot([message()]), open: false })
    expect(container.innerHTML).toBe('')
  })

  it('renders the loading state', () => {
    renderCenter({ snapshot: { status: 'loading', items: [], unreadCount: 0, hasMore: false, failure: null } })
    expect(screen.getByText('Loading messages…')).toBeTruthy()
  })

  it('explains the missing configuration', () => {
    renderCenter({ snapshot: { status: 'unconfigured', items: [], unreadCount: 0, hasMore: false, failure: null } })
    expect(screen.getByText('Message service not configured')).toBeTruthy()
    expect(screen.getByText(/no SDKWork service address/u)).toBeTruthy()
  })

  it('offers sign-in only when the composition can raise it', () => {
    const closed = renderCenter({
      snapshot: { status: 'signed-out', items: [], unreadCount: 0, hasMore: false, failure: null },
      canSignIn: false,
    })
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    closed.unmount()

    const available = renderCenter({
      snapshot: { status: 'signed-out', items: [], unreadCount: 0, hasMore: false, failure: null },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(available.injected.signIn).toHaveBeenCalledOnce()
  })

  it.each([
    ['unauthorized', 'Sign in with your SDKWork account to view account messages.'],
    ['unavailable', 'The message service is unreachable. Try again later.'],
    ['unknown', 'Messages could not be loaded. Try again later.'],
    [null, 'Messages could not be loaded. Try again later.'],
  ] as const)('explains the %s failure and retries', (failure, copy) => {
    const view = renderCenter({
      snapshot: { status: 'error', items: [], unreadCount: 0, hasMore: false, failure },
    })
    expect(screen.getByText(copy)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(view.injected.refresh).toHaveBeenCalledOnce()
  })

  it('renders the empty state', () => {
    renderCenter({ snapshot: readySnapshot([]) })
    expect(screen.getByText('No messages yet')).toBeTruthy()
  })

  it('groups notifications by day, shows the unread summary, and expands a long summary', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    renderCenter({
      snapshot: readySnapshot([
        message({ id: 'a', title: 'Alpha', desc: 'Short summary' }),
        message({ id: 'b', title: 'Beta', desc: 'x'.repeat(90), read: true, time: yesterday }),
        message({ id: 'c', title: 'Gamma', desc: '', read: true, time: '2020-01-02T08:00:00.000Z' }),
      ]),
    })
    expect(screen.getByRole('heading', { name: 'Message center' })).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Yesterday')).toBeTruthy()
    expect(screen.getByText('2020-01-02')).toBeTruthy()
    expect(screen.getByText('1 unread')).toBeTruthy()
    expect(screen.getByText('Alpha').closest('article')?.getAttribute('data-unread')).toBe('true')
    expect(screen.getByText('Beta').closest('article')?.getAttribute('data-unread')).toBe('false')
    // A blank summary renders no paragraph and no expand toggle.
    expect(screen.getByText('Gamma').closest('article')?.querySelector('p')).toBeNull()

    const expand = screen.getByRole('button', { name: 'Expand' })
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(expand)
    const collapse = screen.getByRole('button', { name: 'Collapse' })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(collapse)
    expect(screen.getByRole('button', { name: 'Expand' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the refresh-failure banner over cached notifications', () => {
    const view = renderCenter({
      snapshot: readySnapshot([message()], { failure: 'unavailable' }),
    })
    expect(screen.getByText('Refresh failed; showing the last loaded messages.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(view.injected.refresh).toHaveBeenCalledOnce()
  })

  it('pages with the load-more action', () => {
    const view = renderCenter({ snapshot: readySnapshot([message()], { hasMore: true }) })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(view.injected.loadMore).toHaveBeenCalledOnce()
  })

  it('opens the detail view, marks an unread notification read, and returns', () => {
    const view = renderCenter({
      snapshot: readySnapshot([message({ id: 'unread', title: 'Unread', content: 'Full body' })]),
    })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(view.injected.markRead).toHaveBeenCalledWith('unread')
    expect(screen.getByRole('heading', { name: 'Message details' })).toBeTruthy()
    expect(screen.getByText('Full body')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Message center' })).toBeTruthy()
  })

  it('does not re-acknowledge a read notification', () => {
    const view = renderCenter({
      snapshot: readySnapshot([message({ id: 'read', read: true })]),
    })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(view.injected.markRead).not.toHaveBeenCalled()
  })

  it('links only a safe action route and shows the raw time when it does not parse', () => {
    const safe = renderCenter({
      snapshot: readySnapshot([message({ actionUrl: '/console', time: 'not-a-date' })]),
    })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByRole('link', { name: 'Open related link' }).getAttribute('href')).toBe('/console')
    expect(screen.getByText('not-a-date')).toBeTruthy()
    safe.unmount()

    renderCenter({ snapshot: readySnapshot([message({ actionUrl: 'javascript:alert(1)' })]) })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.queryByRole('link', { name: 'Open related link' })).toBeNull()
  })

  it('closes the shared store and resets the detail view when reopened', () => {
    const view = renderCenter({
      snapshot: readySnapshot([message({ id: 'n-1' })]),
    })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(view.store.getSnapshot().open).toBe(false)
    act(() => { view.store.actions.openDialog() })
    expect(screen.getByRole('heading', { name: 'Message center' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Message details' })).toBeNull()
  })

  it('keeps the English copy distinct from the Chinese copy', () => {
    expect(en['title']).toBe('Message center')
    expect(en['action.view']).toBe('View')
    expect(en['summary.unread']).toBe('{count} unread')
  })
})
