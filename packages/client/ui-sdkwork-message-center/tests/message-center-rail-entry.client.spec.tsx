// @vitest-environment jsdom
/** The message-center rail shortcut: glyph, unread badge, accessible name, open gesture. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  MessageCenterRailEntry,
  type MessageCenterRailEntryProps,
} from '../src/client/MessageCenterRailEntry.tsx'
import type { MessageCenterSnapshot } from '../src/client/message-service.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** Translate seat over the plugin's own dictionary. */
const t = makeTranslate(en) as MessageCenterRailEntryProps['t']

/** One observable message-center snapshot. */
function snapshotSource(unreadCount: number): HostObservable<MessageCenterSnapshot> {
  const snapshot: MessageCenterSnapshot = {
    status: 'ready', items: [], unreadCount, hasMore: false, failure: null,
  }
  return { getSnapshot: () => snapshot, subscribe: () => () => {} }
}

/** Compose the shortcut's slot props over a snapshot that reports `unreadCount`. */
function entryProps(unreadCount: number) {
  const refresh = vi.fn()
  const openDialog = vi.fn()
  const props = {
    ...({} as GlobalStandardProps),
    activeMode: 'code',
    useSnapshot: bindSnapshotSelector(snapshotSource(unreadCount)),
    actions: { openDialog, closeDialog: vi.fn() },
    refresh,
    t,
  } as MessageCenterRailEntryProps
  return { props, refresh, openDialog }
}

describe('MessageCenterRailEntry', () => {
  it('labels the unread-free shortcut and opens the center on click', () => {
    const { props, refresh, openDialog } = entryProps(0)
    const { getByRole, container } = render(<MessageCenterRailEntry {...props} />)
    const button = getByRole('button', { name: 'Open the message center' })
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(container.querySelector('[class*="badge"]')).toBeNull()
    fireEvent.click(button)
    expect(refresh).toHaveBeenCalledOnce()
    expect(openDialog).toHaveBeenCalledOnce()
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(openDialog.mock.invocationCallOrder[0] ?? 0)
  })

  it('reports the unread count in the accessible name and shows the badge', () => {
    const { props } = entryProps(3)
    const { getByRole, container } = render(<MessageCenterRailEntry {...props} />)
    expect(getByRole('button', { name: 'Open the message center, 3 unread' })).toBeTruthy()
    expect(container.querySelector('[class*="badge"]')).not.toBeNull()
  })

  it('has a translated label and no literal copy in the component', () => {
    expect(en['rail.label']).toBe('Message center')
    expect(en['rail.aria']).toBe('Open the message center')
    expect(en['rail.unreadAria']).toBe('Open the message center, {count} unread')
  })
})
