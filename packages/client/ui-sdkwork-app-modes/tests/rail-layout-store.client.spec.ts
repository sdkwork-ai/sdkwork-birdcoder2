// @vitest-environment jsdom
/**
 * Rail layout store spec: the shipped layout shows the five fixed modes
 * (Code, Video, Image, Knowledge Base, Assets) plus App Store; every other
 * hideable mode — Search included — starts hidden and is enabled from the
 * customize dialog; a fixed mode cannot be hidden (the write is a no-op and a
 * rehydrated blob that hides one clamps back); a layout stored under older
 * shipped defaults adopts App Store once; toggles and reorders write the store
 * and its localStorage blob; unknown rehydrated ids drop and absent ids
 * append; reset restores the shipped layout. Same-value writes notify no one.
 */
import { describe, expect, it, vi } from 'vitest'
import { LAYOUT_REVISION, createRailLayoutStore } from '../src/client/rail-layout-store.ts'
import {
  CUSTOMIZABLE_MODES, DEFAULT_HIDDEN, DEFAULT_VISIBLE_MODES, FIXED_MODES,
} from '../src/client/rail-modes.ts'

const SHIPPED = { order: CUSTOMIZABLE_MODES, hidden: DEFAULT_HIDDEN }

describe('createRailLayoutStore', () => {
  it('starts at the shipped layout: the fixed modes and App Store visible, everything else hidden', () => {
    localStorage.clear()
    const layout = createRailLayoutStore()
    expect(layout.get()).toEqual(SHIPPED)
    expect(DEFAULT_VISIBLE_MODES).toEqual(['code', 'video', 'image', 'appstore', 'knowledge', 'assets'])
    for (const mode of FIXED_MODES) {
      expect(layout.get().hidden).not.toContain(mode)
    }
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'course', 'drive', 'search'])
  })

  it('toggles visibility, refuses to hide a fixed mode, skips same-value writes, and persists the blob', () => {
    localStorage.clear()
    const layout = createRailLayoutStore()
    const listener = vi.fn()
    layout.subscribe(listener)
    layout.setVisible('course', true)
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'drive', 'search'])
    expect(listener).toHaveBeenCalledTimes(1)
    // Same value: no write, no notification.
    layout.setVisible('course', true)
    expect(listener).toHaveBeenCalledTimes(1)
    // A fixed mode cannot be hidden: the write is a no-op.
    layout.setVisible('code', false)
    layout.setVisible('video', false)
    layout.setVisible('image', false)
    layout.setVisible('knowledge', false)
    layout.setVisible('assets', false)
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'drive', 'search'])
    expect(listener).toHaveBeenCalledTimes(1)
    // Search is hideable and hidden in the shipped layout: enabling it is the
    // same user-owned write, and hiding it again puts the seat back.
    layout.setVisible('search', true)
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'drive'])
    expect(listener).toHaveBeenCalledTimes(2)
    layout.setVisible('search', false)
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'drive', 'search'])
    expect(listener).toHaveBeenCalledTimes(3)
    // App Store ships visible but is user-owned: hiding and re-showing writes.
    layout.setVisible('appstore', false)
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'drive', 'search', 'appstore'])
    expect(listener).toHaveBeenCalledTimes(4)
    layout.setVisible('appstore', true)
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'drive', 'search'])
    expect(listener).toHaveBeenCalledTimes(5)
    layout.setVisible('contacts', true)
    expect(layout.get().hidden).toEqual(['chat', 'drive', 'search'])
    expect(listener).toHaveBeenCalledTimes(6)
    expect(JSON.parse(localStorage.getItem('dsh.railLayout')!)).
      toEqual({ order: [...CUSTOMIZABLE_MODES], hidden: ['chat', 'drive', 'search'] })
  })

  it('adopts App Store once from a layout stored under the previous shipped defaults', () => {
    localStorage.clear()
    localStorage.setItem('dsh.railLayout', JSON.stringify({
      order: [...CUSTOMIZABLE_MODES],
      hidden: ['chat', 'contacts', 'appstore', 'course', 'drive', 'search'],
    }))
    const layout = createRailLayoutStore()
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'course', 'drive', 'search'])
    expect(localStorage.getItem('dsh.railLayoutRevision')).toBe(String(LAYOUT_REVISION))
    // A choice made after the migration survives the next store creation.
    layout.setVisible('appstore', false)
    expect(createRailLayoutStore().get().hidden).toContain('appstore')
  })

  it('moves an entry before a reference and to the end, ignoring an unknown reference', () => {
    localStorage.clear()
    const layout = createRailLayoutStore()
    layout.moveBefore('knowledge', 'video')
    expect(layout.get().order)
      .toEqual(['code', 'chat', 'contacts', 'knowledge', 'video', 'image', 'appstore', 'course', 'drive', 'assets', 'search'])
    layout.moveBefore('code', undefined)
    expect(layout.get().order)
      .toEqual(['chat', 'contacts', 'knowledge', 'video', 'image', 'appstore', 'course', 'drive', 'assets', 'search', 'code'])
    // An id outside the vocabulary names no row: the order stays.
    layout.moveBefore('drive', 'bogus' as never)
    expect(layout.get().order)
      .toEqual(['chat', 'contacts', 'knowledge', 'video', 'image', 'appstore', 'course', 'drive', 'assets', 'search', 'code'])
    // Reordering keeps the hidden set.
    expect(layout.get().hidden).toEqual(SHIPPED.hidden)
  })

  it('reset restores the shipped layout and re-persists it', () => {
    localStorage.clear()
    const layout = createRailLayoutStore()
    layout.setVisible('contacts', true)
    layout.moveBefore('assets', 'contacts')
    layout.reset()
    expect(layout.get()).toEqual(SHIPPED)
    expect(JSON.parse(localStorage.getItem('dsh.railLayout')!)).toEqual({ ...SHIPPED })
  })

  it('normalizes a rehydrated blob: unknown ids drop, duplicates collapse, absent ids append, fixed hidden clamps', () => {
    localStorage.clear()
    localStorage.setItem('dsh.railLayout', JSON.stringify({
      order: ['assets', 'bogus', 'appstore', 'image', 'video', 'image', 'chat'],
      hidden: ['chat', 'bogus', 'contacts', 'code', 'search'],
    }))
    const layout = createRailLayoutStore()
    // Known ids keep their stored relative order; code/contacts/knowledge/
    // course/drive/search (absent from the blob) append in rail order; the
    // duplicate image collapses; 'bogus' drops. Hidden keeps only ids that
    // exist; a fixed mode named there (code) clamps back to visible while a
    // hideable one (search) keeps the user's choice.
    expect(layout.get().order).toEqual([
      'assets', 'appstore', 'image', 'video', 'chat', 'code', 'contacts', 'knowledge', 'course', 'drive', 'search',
    ])
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'search'])
  })

  it('a later store sees an earlier store\u2019s persisted writes', () => {
    localStorage.clear()
    const first = createRailLayoutStore()
    first.setVisible('course', true)
    const second = createRailLayoutStore()
    expect(second.get().hidden).toEqual(['chat', 'contacts', 'drive', 'search'])
    expect(second.get().order).toEqual(CUSTOMIZABLE_MODES)
  })
})
