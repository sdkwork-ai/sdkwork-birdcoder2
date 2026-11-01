// @vitest-environment jsdom
/**
 * The left column's layout preference: the grouped item list the settings page
 * edits, the snapshot equality guard, and the persisted hidden-id set —
 * including rehydration normalization, the no-op write, and reset.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SIDEBAR_LAYOUT_STORAGE_KEY,
  createSidebarLayoutPreference,
  sameSidebarLayout,
  sidebarItems,
  type SidebarLayoutSnapshot,
} from '../src/client/layout.ts'

beforeEach(() => {
  localStorage.clear()
})

describe('sidebarItems', () => {
  it('groups the three stacks in display order and sorts each by its own order', () => {
    const items = sidebarItems({
      actions: [
        { id: 'b', title: 'Second', order: 20 },
        { id: 'a', title: 'First', order: 10 },
      ],
      pages: [{ id: 'page', title: 'Page', order: 5 }],
      panels: [{ id: 'panel', title: 'Panel', order: 1 }],
    })
    expect(items).toEqual([
      { id: 'a', group: 'actions', title: 'First', order: 10 },
      { id: 'b', group: 'actions', title: 'Second', order: 20 },
      { id: 'page', group: 'pages', title: 'Page', order: 5 },
      { id: 'panel', group: 'panels', title: 'Panel', order: 1 },
    ])
  })

  it('keeps registration order for equal orders and returns an empty list for no contributions', () => {
    expect(sidebarItems({
      actions: [{ id: 'first', title: 'First', order: 0 }, { id: 'second', title: 'Second', order: 0 }],
      pages: [],
      panels: [],
    }).map(item => item.id)).toEqual(['first', 'second'])
    expect(sidebarItems({ actions: [], pages: [], panels: [] })).toEqual([])
  })
})

describe('sameSidebarLayout', () => {
  const base: SidebarLayoutSnapshot = {
    items: [{ id: 'a', group: 'actions', title: 'A', order: 0 }],
    hidden: ['b'],
  }

  it('treats two independently built snapshots with the same content as equal', () => {
    expect(sameSidebarLayout(base, { ...base, items: [...base.items], hidden: [...base.hidden] })).toBe(true)
  })

  it('detects a changed hidden set, row set, or row title', () => {
    expect(sameSidebarLayout(base, { ...base, hidden: [] })).toBe(false)
    expect(sameSidebarLayout(base, { ...base, hidden: ['c'] })).toBe(false)
    expect(sameSidebarLayout(base, { items: [], hidden: base.hidden })).toBe(false)
    expect(sameSidebarLayout(base, {
      ...base,
      items: [{ id: 'a', group: 'actions', title: 'Renamed', order: 0 }],
    })).toBe(false)
    expect(sameSidebarLayout(base, { ...base, items: [{ id: 'a', group: 'pages', title: 'A', order: 0 }] })).toBe(false)
  })
})

describe('createSidebarLayoutPreference', () => {
  it('starts with nothing hidden and keeps one snapshot reference until it changes', () => {
    const preference = createSidebarLayoutPreference()
    const first = preference.get()
    expect(first).toEqual([])
    expect(preference.get()).toBe(first)
  })

  it('hides and restores one id, and ignores writes that ask for the current state', () => {
    const preference = createSidebarLayoutPreference()
    const listener = vi.fn()
    const off = preference.subscribe(listener)
    preference.setVisible('a', true)
    expect(listener).not.toHaveBeenCalled()
    preference.setVisible('a', false)
    expect(preference.get()).toEqual(['a'])
    expect(listener).toHaveBeenCalledTimes(1)
    preference.setVisible('a', false)
    expect(listener).toHaveBeenCalledTimes(1)
    preference.setVisible('a', true)
    expect(preference.get()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    preference.setVisible('a', false)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('persists the hidden set and rehydrates it in a later instance', () => {
    createSidebarLayoutPreference().setVisible('a', false)
    expect(localStorage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY)).toBe(JSON.stringify({ hidden: ['a'] }))
    expect(createSidebarLayoutPreference().get()).toEqual(['a'])
  })

  it('normalizes a corrupted or duplicated stored blob', () => {
    localStorage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify({ hidden: ['a', 'a', '', 7, 'b'] }))
    expect(createSidebarLayoutPreference().get()).toEqual(['a', 'b'])
    localStorage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify({ hidden: 'not-a-list' }))
    expect(createSidebarLayoutPreference().get()).toEqual([])
    localStorage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify({}))
    expect(createSidebarLayoutPreference().get()).toEqual([])
  })

  it('resets every hidden id and skips the write when nothing is hidden', () => {
    const preference = createSidebarLayoutPreference()
    const listener = vi.fn()
    preference.subscribe(listener)
    preference.reset()
    expect(listener).not.toHaveBeenCalled()
    preference.setVisible('a', false)
    preference.setVisible('b', false)
    preference.reset()
    expect(preference.get()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
