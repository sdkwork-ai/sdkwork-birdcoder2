// @vitest-environment jsdom
/** The message-center rail shortcut: glyph, unread badge, accessible name, selection, open gesture. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
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

/** One observable panel selection. */
function panelSource(activePanelId: PanelInfo['activePanelId']): HostObservable<PanelInfo> {
  const info: PanelInfo = { activePanelId }
  return { getSnapshot: () => info, subscribe: () => () => {} }
}

/** Compose the shortcut's slot props over a snapshot and a panel selection. */
function entryProps(unreadCount: number, activePanelId: PanelInfo['activePanelId'] = null) {
  const open = vi.fn()
  const props = {
    ...({} as GlobalStandardProps),
    activeMode: 'code' as const,
    useSnapshot: bindSnapshotSelector(snapshotSource(unreadCount)),
    usePanelInfo: bindSnapshotSelector(panelSource(activePanelId)),
    open,
    t,
  } as MessageCenterRailEntryProps
  return { props, open }
}

describe('MessageCenterRailEntry', () => {
  it('labels the unread-free shortcut and selects the page on click', () => {
    const { props, open } = entryProps(0)
    const { getByRole, container } = render(<MessageCenterRailEntry {...props} />)
    const button = getByRole('button', { name: 'Open the message center' })
    expect(button.getAttribute('aria-current')).toBeNull()
    expect(container.querySelector('[class*="badge"]')).toBeNull()
    expect(container.querySelector('[class*="active"]')).toBeNull()
    fireEvent.click(button)
    expect(open).toHaveBeenCalledOnce()
  })

  it('reports the unread count in the accessible name and shows the badge', () => {
    const { props } = entryProps(3)
    const { getByRole, container } = render(<MessageCenterRailEntry {...props} />)
    expect(getByRole('button', { name: 'Open the message center, 3 unread' })).toBeTruthy()
    expect(container.querySelector('[class*="badge"]')).not.toBeNull()
  })

  it('paints the selected cell while the message page owns the center column', () => {
    const { props } = entryProps(0, 'message-center' as PanelInfo['activePanelId'])
    const { getByRole, container } = render(<MessageCenterRailEntry {...props} />)
    expect(getByRole('button', { name: 'Open the message center' }).getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('[class*="active"]')).not.toBeNull()
  })

  it('has a translated label and no literal copy in the component', () => {
    expect(en['rail.label']).toBe('Message center')
    expect(en['rail.aria']).toBe('Open the message center')
    expect(en['rail.unreadAria']).toBe('Open the message center, {count} unread')
  })
})
