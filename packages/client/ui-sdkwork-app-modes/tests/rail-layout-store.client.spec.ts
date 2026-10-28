// @vitest-environment jsdom
/**
 * Rail layout store spec: the shipped layout shows exactly the five fixed
 * modes (Code, Video, Image, Knowledge Base, Assets); a fixed mode cannot be
 * hidden (the write is a no-op and a rehydrated blob that hides one clamps
 * back); toggles and reorders write the store and its localStorage blob;
 * unknown rehydrated ids drop and absent ids append; reset restores the
 * shipped layout. Same-value writes notify no one.
 */
import { describe, expect, it, vi } from 'vitest'
import { createRailLayoutStore } from '../src/client/rail-layout-store.ts'
import {
  CUSTOMIZABLE_MODES, DEFAULT_HIDDEN, DEFAULT_VISIBLE_MODES, FIXED_MODES,
} from '../src/client/rail-modes.ts'

const SHIPPED = { order: CUSTOMIZABLE_MODES, hidden: DEFAULT_HIDDEN }

describe('createRailLayoutStore', () => {
  it('starts at the shipped layout: the five fixed modes visible, everything else hidden', () => {
    localStorage.clear()
    const layout = createRailLayoutStore()
    expect(layout.get()).toEqual(SHIPPED)
    expect(DEFAULT_VISIBLE_MODES).toEqual(['code', 'video', 'image', 'knowledge', 'assets'])
    for (const mode of FIXED_MODES) {
      expect(layout.get().hidden).not.toContain(mode)
    }
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'appstore', 'course', 'drive'])
  })

  it('toggles visibility, refuses to hide a fixed mode, skips same-value writes, and persists the blob', () => {
    localStorage.clear()
    const layout = createRailLayoutStore()
    const listener = vi.fn()
    layout.subscribe(listener)
    layout.setVisible('appstore', true)
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'course', 'drive'])
    expect(listener).toHaveBeenCalledTimes(1)
    // Same value: no write, no notification.
    layout.setVisible('appstore', true)
    expect(listener).toHaveBeenCalledTimes(1)
    // A fixed mode cannot be hidden: the write is a no-op.
    layout.setVisible('code', false)
    layout.setVisible('video', false)
    layout.setVisible('image', false)
    layout.setVisible('knowledge', false)
    layout.setVisible('assets', false)
    expect(layout.get().hidden).toEqual(['chat', 'contacts', 'course', 'drive'])
    expect(listener).toHaveBeenCalledTimes(1)
    layout.setVisible('contacts', true)
    expect(layout.get().hidden).toEqual(['chat', 'course', 'drive'])
    expect(listener).toHaveBeenCalledTimes(2)
    expect(JSON.parse(localStorage.getItem('dsh.railLayout')!)).
      toEqual({ order: [...CUSTOMIZABLE_MODES], hidden: ['chat', 'course', 'drive'] })
  })

  it('moves an entry before a reference and to the end, ignoring an unknown reference', () => {
    localStorage.clear()
    const layout = createRailLayoutStore()
    layout.moveBefore('knowledge', 'video')
    expect(layout.get().order)
      .toEqual(['code', 'chat', 'contacts', 'knowledge', 'video', 'image', 'appstore', 'course', 'drive', 'assets'])
    layout.moveBefore('code', undefined)
    expect(layout.get().order)
      .toEqual(['chat', 'contacts', 'knowledge', 'video', 'image', 'appstore', 'course', 'drive', 'assets', 'code'])
    // An id outside the vocabulary names no row: the order stays.
    layout.moveBefore('drive', 'bogus' as never)
    expect(layout.get().order)
      .toEqual(['chat', 'contacts', 'knowledge', 'video', 'image', 'appstore', 'course', 'drive', 'assets', 'code'])
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
    localStorage.setItem('dsh.railLayout', JSON.stringify({
      order: ['assets', 'bogus', 'appstore', 'image', 'video', 'image', 'chat'],
      hidden: ['chat', 'bogus', 'contacts', 'code'],
    }))
    const layout = createRailLayoutStore()
    // Known ids keep their stored relative order; code/contacts/knowledge/
    // course/drive (absent from the blob) append in rail order; the duplicate
    // image collapses; 'bogus' drops. Hidden keeps only ids that exist, and a
    // fixed mode named there (code) clamps back to visible.
    expect(layout.get().order).toEqual([
      'assets', 'appstore', 'image', 'video', 'chat', 'code', 'contacts', 'knowledge', 'course', 'drive',
    ])
    expect(layout.get().hidden).toEqual(['chat', 'contacts'])
  })

  it('a later store sees an earlier store\u2019s persisted writes', () => {
    localStorage.clear()
    const first = createRailLayoutStore()
    first.setVisible('course', true)
    const second = createRailLayoutStore()
    expect(second.get().hidden).toEqual(['chat', 'contacts', 'appstore', 'drive'])
    expect(second.get().order).toEqual(CUSTOMIZABLE_MODES)
  })
})
