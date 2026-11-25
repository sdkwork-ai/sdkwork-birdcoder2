/** Wire contract and display helpers for the message center. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MessageContractError,
  groupMessagesByDay,
  localDayKey,
  parseMessageTime,
  readMessagePage,
  safeMessageActionUrl,
  type MessageItem,
} from '../src/client/message-contract.ts'

function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'n-1',
    appId: 'sdkwork-birdcoder',
    title: 'Welcome',
    desc: 'Summary',
    content: 'Body',
    time: '2026-11-16 08:00:00+00',
    type: 'info',
    read: false,
    showAsPopup: false,
    popupSeen: false,
    archived: false,
    ...overrides,
  }
}

function item(overrides: Partial<MessageItem> = {}): MessageItem {
  return {
    id: 'n-1',
    appId: 'sdkwork-birdcoder',
    title: 'Welcome',
    desc: '',
    content: 'Body',
    time: '2026-11-16T08:00:00.000Z',
    type: 'info',
    read: false,
    showAsPopup: false,
    popupSeen: false,
    archived: false,
    actionUrl: null,
    ...overrides,
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe('readMessagePage', () => {
  it('projects a notification page in server order', () => {
    const page = readMessagePage({
      items: [
        wire(),
        wire({ id: 'n-2', type: 'alert', read: true, showAsPopup: true, popupSeen: true, archived: true, actionUrl: '/console' }),
      ],
      pageInfo: { hasMore: true },
    })
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toMatchObject({ id: 'n-1', type: 'info', read: false, actionUrl: null })
    expect(page.items[1]).toMatchObject({ id: 'n-2', type: 'alert', read: true, archived: true, actionUrl: '/console' })
    expect(page.hasMore).toBe(true)
  })

  it('accepts every notification kind the API reports', () => {
    const page = readMessagePage({
      items: [wire({ type: 'info' }), wire({ id: 'two', type: 'billing' }), wire({ id: 'three', type: 'warning' }), wire({ id: 'four', type: 'alert' })],
    })
    expect(page.items.map(entry => entry.type)).toEqual(['info', 'billing', 'warning', 'alert'])
  })

  it('falls back to the summary when the body is empty', () => {
    const page = readMessagePage({ items: [wire({ content: '' })] })
    expect(page.items[0]?.content).toBe('Summary')
  })

  it('accepts a payload without page info as a single page', () => {
    const page = readMessagePage({ items: [wire()] })
    expect(page).toMatchObject({ hasMore: false })
  })

  it('derives continuation from page and total page counts', () => {
    expect(readMessagePage({ items: [], pageInfo: { page: 1, totalPages: 3 } }).hasMore).toBe(true)
    expect(readMessagePage({ items: [], pageInfo: { page: 3, totalPages: 3 } }).hasMore).toBe(false)
    expect(readMessagePage({ items: [], pageInfo: { page: 3 } }).hasMore).toBe(false)
    expect(readMessagePage({ items: [], pageInfo: 'none' }).hasMore).toBe(false)
  })

  it('skips unusable rows and keeps their valid neighbours', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const page = readMessagePage({
      items: [
        wire({ id: 'before' }),
        'not-an-object',
        wire({ id: '' }),
        wire({ title: '   ' }),
        wire({ time: '' }),
        wire({ type: 'future' }),
        wire({ appId: undefined }),
        wire({ id: 'after' }),
      ],
    })
    expect(page.items.map(entry => entry.id)).toEqual(['before', 'after'])
    expect(error).toHaveBeenCalledTimes(6)
    expect(error.mock.calls[0]?.[0]).toContain('skipping unsupported notification')
  })

  it.each([
    ['a non-object payload', []],
    ['a payload without items', { pageInfo: {} }],
    ['items that are not an array', { items: {} }],
  ])('rejects %s', (_label, payload) => {
    expect(() => readMessagePage(payload)).toThrow(MessageContractError)
  })

  it('treats missing boolean and string members as their absent defaults', () => {
    const page = readMessagePage({
      items: [{
        id: 'n-1',
        appId: 'app',
        title: 'Title',
        time: '2026-11-16T08:00:00Z',
        type: 'billing',
        desc: 42,
        content: 42,
        read: 'yes',
        actionUrl: '   ',
      }],
    })
    expect(page.items[0]).toMatchObject({
      desc: '', content: '', read: false, showAsPopup: false, popupSeen: false, archived: false, actionUrl: null,
    })
  })
})

describe('groupMessagesByDay', () => {
  it('orders newest first and groups by local calendar day', () => {
    const groups = groupMessagesByDay([
      item({ id: 'older', time: '2026-11-14T08:00:00Z' }),
      item({ id: 'today', time: new Date(2026, 10, 16, 9, 0, 0).toISOString() }),
      item({ id: 'yesterday', time: new Date(2026, 10, 15, 9, 0, 0).toISOString() }),
    ])
    expect(groups.map(group => group.day)).toEqual(['2026-11-16', '2026-11-15', '2026-11-14'])
    expect(groups.flatMap(group => group.items.map(entry => entry.id))).toEqual(['today', 'yesterday', 'older'])
  })

  it('keeps the server order for equal times', () => {
    const groups = groupMessagesByDay([
      item({ id: 'first', time: '2026-11-16T08:00:00Z' }),
      item({ id: 'second', time: '2026-11-16T08:00:00Z' }),
    ])
    expect(groups[0]?.items.map(entry => entry.id)).toEqual(['first', 'second'])
  })

  it('sorts undated notifications last', () => {
    const groups = groupMessagesByDay([
      item({ id: 'undated', time: 'not-a-date' }),
      item({ id: 'dated', time: '2026-11-16T08:00:00Z' }),
    ])
    expect(groups.map(group => [group.day, group.items.map(entry => entry.id)])).toEqual([
      ['2026-11-16', ['dated']],
      ['', ['undated']],
    ])
  })

  it('keeps the order of several undated notifications', () => {
    const groups = groupMessagesByDay([
      item({ id: 'first-undated', time: 'missing' }),
      item({ id: 'second-undated', time: 'missing' }),
      item({ id: 'third-undated', time: 'missing' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.items.map(entry => entry.id)).toEqual(['first-undated', 'second-undated', 'third-undated'])
  })

  it('compares an undated notification against dated ones in both directions', () => {
    const groups = groupMessagesByDay([
      item({ id: 'oldest', time: '2026-11-10T08:00:00Z' }),
      item({ id: 'undated', time: 'missing' }),
      item({ id: 'newest', time: '2026-11-16T08:00:00Z' }),
    ])
    expect(groups.flatMap(group => group.items.map(entry => entry.id))).toEqual(['newest', 'oldest', 'undated'])
  })

  it('groups an undated notification under its date prefix when the text carries one', () => {
    const groups = groupMessagesByDay([item({ id: 'prefixed', time: '2026-11-12 not-a-full-date' })])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.day).toBe('2026-11-12')
  })

  it('returns no groups for an empty list', () => {
    expect(groupMessagesByDay([])).toEqual([])
  })
})

describe('parseMessageTime', () => {
  it('parses the server text form and rejects unusable text', () => {
    expect(parseMessageTime('2026-11-16 08:00:00+00')).toBe(Date.UTC(2026, 10, 16, 8))
    expect(parseMessageTime('not-a-date')).toBeNull()
  })
})

describe('localDayKey', () => {
  it('pads the month and day of a local date', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 0, 0))).toBe('2026-01-05')
  })
})

describe('safeMessageActionUrl', () => {
  it.each([
    ['https://example.com/inbox', 'https://example.com/inbox'],
    ['/console/system', '/console/system'],
    ['http://example.com', 'http://example.com'],
  ])('keeps the linkable route %s', (value, expected) => {
    expect(safeMessageActionUrl(value)).toBe(expected)
  })

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,hello'],
    ['mailto:team@example.com'],
    ['   '],
  ])('refuses the route %s', (value) => {
    expect(safeMessageActionUrl(value)).toBeNull()
  })

  it('returns null for an absent route and an unparsable value', () => {
    expect(safeMessageActionUrl(null)).toBeNull()
    expect(safeMessageActionUrl('http://[invalid')).toBeNull()
  })
})
