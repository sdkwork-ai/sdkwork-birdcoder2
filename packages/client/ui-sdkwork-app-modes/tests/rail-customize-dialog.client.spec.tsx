// @vitest-environment jsdom
/**
 * Rail customize dialog spec: one row per entry in layout order, each with a
 * drag handle, the mode's inert glyph, its name, and a visibility checkbox
 * that writes immediately. Reordering is a press-anywhere-on-the-row drag: the
 * lifted row follows the pointer, an insertion line marks the drop gap, the
 * list scrolls at its edges, and the release commits one store write; Escape
 * and a lost capture discard the drag. The grip reorders with
 * ArrowUp/ArrowDown/Home/End. Reset restores the shipped layout; Done closes.
 * Runs against the real layout store, so the persisted blob moves with every
 * write.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RailCustomizeDialog } from '../src/client/RailCustomizeDialog.tsx'
import type { RailCustomizeDialogProps } from '../src/client/RailCustomizeDialog.tsx'
import { createRailLayoutStore, type RailLayoutStore } from '../src/client/rail-layout-store.ts'
import {
  CUSTOMIZABLE_MODES, DEFAULT_HIDDEN, DEFAULT_VISIBLE_MODES, FIXED_MODES,
} from '../src/client/rail-modes.ts'

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as RailCustomizeDialogProps['t']

/** Entry glyph stand-in: a tagged span the row must carry. */
const renderEntry = (mode: RailCustomizeDialogProps['entries'][number]) =>
  <span data-glyph={mode} />

/**
 * One dialog over the real (fresh) layout store, wrapped the way ModeRail
 * mounts it: the wrapper subscribes to the store and re-derives the entries,
 * so rows follow every committed write.
 */
function mountDialog(onClose = () => {}) {
  const layout: RailLayoutStore = createRailLayoutStore()
  function MountedDialog() {
    const { order } = useSyncExternalStore(layout.subscribe, layout.get)
    return (
      <RailCustomizeDialog
        open
        onClose={onClose}
        layout={layout}
        entries={order}
        onVisibleChange={(mode, visible) => { layout.setVisible(mode, visible) }}
        renderEntry={renderEntry}
        t={t}
      />
    )
  }
  render(<MountedDialog />)
  return layout
}

/**
 * Stub each row's box by DOM position (row i occupies [i*100, i*100+40)) and
 * the list's box over the whole stack, so pointer math and edge scrolling are
 * deterministic.
 * @returns the row elements in display order.
 */
function stubRowRects(): HTMLElement[] {
  const rows = [...document.body.querySelectorAll<HTMLElement>('[data-rail-customize-row]')]
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () => ({
      x: 0, y: index * 100, top: index * 100, left: 0, right: 40, bottom: index * 100 + 40,
      width: 40, height: 40, toJSON: () => ({}),
    })
  })
  const list = rows[0]?.parentElement
  if (list !== null && list !== undefined) {
    list.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, right: 560, bottom: rows.length * 100,
      width: 560, height: rows.length * 100, toJSON: () => ({}),
    })
  }
  return rows
}

/** jsdom lacks pointer capture: emulate per-element for the hasPointerCapture gates. */
function stubPointerCapture() {
  const captured = new Set<Element>()
  const originals = (['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const)
    .map(name => [name, Object.getOwnPropertyDescriptor(Element.prototype, name)] as const)
  Element.prototype.setPointerCapture = function () { captured.add(this) }
  Element.prototype.releasePointerCapture = function () { captured.delete(this) }
  Element.prototype.hasPointerCapture = function () { return captured.has(this) }
  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor === undefined) Reflect.deleteProperty(Element.prototype, name)
      else Object.defineProperty(Element.prototype, name, descriptor)
    }
  }
}

afterEach(cleanup)

describe('RailCustomizeDialog', () => {
  it('renders one row per entry in order: handle, inert glyph, name, visibility checkbox', () => {
    mountDialog()
    const rows = stubRowRects()
    expect(rows).toHaveLength(CUSTOMIZABLE_MODES.length)
    // The row text is the mode's name key (the locale stand-in renders keys).
    expect(rows.map(row => row.textContent)).toEqual(CUSTOMIZABLE_MODES.map(mode => `mode.${mode}`))
    for (const [index, mode] of CUSTOMIZABLE_MODES.entries()) {
      const row = rows[index]!
      expect(row.querySelector(`[data-glyph="${mode}"]`)).not.toBeNull()
      const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement
      // A fixed row's checkbox renders disabled — always shown, by design.
      expect(checkbox.checked).toBe(DEFAULT_VISIBLE_MODES.includes(mode))
      expect(checkbox.disabled).toBe(FIXED_MODES.includes(mode))
    }
    // The dialog names itself for the frame.
    expect(screen.getByRole('dialog', { name: 'rail.customize.title' })).not.toBeNull()
  })

  it('a checkbox writes visibility immediately, reset restores the shipped layout', () => {
    const layout = mountDialog()
    const rows = stubRowRects()
    // Fixed rows render disabled: clicking them leaves the store alone.
    const codeCheck = rows[0]!.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(codeCheck.disabled).toBe(true)
    const assetsCheck = rows[9]!.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(assetsCheck.disabled).toBe(true)
    // Show a hidden, hideable mode (Chat, row 1).
    const chatCheck = rows[1]!.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(chatCheck.checked).toBe(false)
    fireEvent.click(chatCheck)
    expect(layout.get().hidden).toEqual(['contacts', 'course', 'drive', 'search'])
    expect((rows[1]!.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
    // Show another hidden one (Course, row 7).
    const courseCheck = rows[7]!.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(courseCheck)
    expect(layout.get().hidden).toEqual(['contacts', 'drive', 'search'])
    // App Store ships checked but stays user-owned: unchecking it hides the row.
    const appstoreCheck = rows[5]!.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(appstoreCheck.checked).toBe(true)
    fireEvent.click(appstoreCheck)
    expect(layout.get().hidden).toEqual(['contacts', 'drive', 'search', 'appstore'])
    // Reset puts everything back.
    fireEvent.click(screen.getByRole('button', { name: 'rail.customize.reset' }))
    expect(layout.get().order).toEqual(CUSTOMIZABLE_MODES)
    expect(layout.get().hidden).toEqual(DEFAULT_HIDDEN)
  })

  it('presses any row to drag it, marks the drop gap, and commits on release', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      const layout = mountDialog()
      const rows = stubRowRects()
      const chatRow = rows[1]!
      // Press the row's body (not the grip) at Chat's midpoint.
      fireEvent.pointerDown(chatRow, { pointerId: 1, button: 0, clientY: 120 })
      expect(chatRow.getAttribute('data-dragging')).toBe('')
      // Moving past Video's midpoint retargets the gap after Video (before
      // Image) and lifts the row with the pointer; the store stays untouched.
      fireEvent.pointerMove(chatRow, { pointerId: 1, clientY: 325 })
      expect(chatRow.style.transform).toBe('translateY(205px)')
      expect(rows[4]!.getAttribute('data-drop-before')).toBe('')
      expect(chatRow.getAttribute('data-drop-before')).toBeNull()
      expect(rows[10]!.hasAttribute('data-drop-after')).toBe(false)
      expect(layout.get().order).toEqual(CUSTOMIZABLE_MODES)

      fireEvent.pointerUp(chatRow, { pointerId: 1, clientY: 325 })
      expect(layout.get().order).toEqual([
        'code', 'contacts', 'video', 'chat', 'image', 'appstore', 'knowledge', 'course', 'drive', 'assets', 'search',
      ])
      expect(JSON.parse(localStorage.getItem('dsh.railLayout')!).order).toEqual(layout.get().order)
      // The gesture cleared: no lifted row, no indicator, committed order shown.
      expect(chatRow.hasAttribute('data-dragging')).toBe(false)
      expect(document.body.querySelector('[data-drop-before]')).toBeNull()
      expect(document.body.querySelector('[data-drop-after]')).toBeNull()
      const rendered = [...document.body.querySelectorAll<HTMLElement>('[data-rail-customize-row]')]
        .map(row => row.textContent)
      expect(rendered).toEqual(layout.get().order.map(mode => `mode.${mode}`))
    } finally {
      restoreCapture()
    }
  })

  it('drops a row past the last gap and marks the trailing edge', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      const layout = mountDialog()
      const rows = stubRowRects()
      const chatRow = rows[1]!
      fireEvent.pointerDown(chatRow, { pointerId: 1, button: 0, clientY: 120 })
      fireEvent.pointerMove(chatRow, { pointerId: 1, clientY: 1200 })
      // Past every candidate: the indicator sits below the last row (Search).
      expect(rows[10]!.getAttribute('data-drop-after')).toBe('')
      fireEvent.pointerUp(chatRow, { pointerId: 1, clientY: 1200 })
      expect(layout.get().order.at(-1)).toBe('chat')
      expect(document.body.querySelector('[data-drop-after]')).toBeNull()
    } finally {
      restoreCapture()
    }
  })

  it('scrolls the list when the pointer reaches an edge during a drag', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      mountDialog()
      const rows = stubRowRects()
      const list = rows[0]!.parentElement as HTMLElement
      const chatRow = rows[1]!
      fireEvent.pointerDown(chatRow, { pointerId: 1, button: 0, clientY: 120 })
      // Within the bottom edge band the list steps toward the end…
      fireEvent.pointerMove(chatRow, { pointerId: 1, clientY: rows.length * 100 - 10 })
      expect(list.scrollTop).toBe(16)
      // …and within the top band it steps back.
      fireEvent.pointerMove(chatRow, { pointerId: 1, clientY: 5 })
      expect(list.scrollTop).toBe(0)
      fireEvent.pointerUp(chatRow, { pointerId: 1, clientY: 5 })
    } finally {
      restoreCapture()
    }
  })

  it('Escape cancels the drag in flight without closing the dialog', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      const onClose = vi.fn()
      const layout = mountDialog(onClose)
      const rows = stubRowRects()
      const chatRow = rows[1]!
      fireEvent.pointerDown(chatRow, { pointerId: 1, button: 0, clientY: 120 })
      fireEvent.pointerMove(chatRow, { pointerId: 1, clientY: 325 })
      expect(chatRow.getAttribute('data-dragging')).toBe('')
      fireEvent.keyDown(chatRow, { key: 'Escape' })
      expect(chatRow.hasAttribute('data-dragging')).toBe(false)
      expect(document.body.querySelector('[data-drop-before]')).toBeNull()
      expect(layout.get().order).toEqual(CUSTOMIZABLE_MODES)
      // The cancelled gesture leaves no capture behind: the release writes nothing.
      fireEvent.pointerUp(chatRow, { pointerId: 1, clientY: 325 })
      expect(layout.get().order).toEqual(CUSTOMIZABLE_MODES)
      expect(onClose).not.toHaveBeenCalled()
    } finally {
      restoreCapture()
    }
  })

  it('a lost pointer capture discards the drag and keeps the stored order', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      const layout = mountDialog()
      const rows = stubRowRects()
      const chatRow = rows[1]!
      fireEvent.pointerDown(chatRow, { pointerId: 1, button: 0, clientY: 120 })
      fireEvent.pointerMove(chatRow, { pointerId: 1, clientY: 325 })
      expect(chatRow.getAttribute('data-dragging')).toBe('')
      fireEvent.lostPointerCapture(chatRow)
      expect(chatRow.hasAttribute('data-dragging')).toBe(false)
      expect(document.body.querySelector('[data-drop-before]')).toBeNull()
      expect(layout.get().order).toEqual(CUSTOMIZABLE_MODES)
    } finally {
      restoreCapture()
    }
  })

  it('starts a touch drag only from the grip, so a swipe still scrolls the list', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      mountDialog()
      const rows = stubRowRects()
      const chatRow = rows[1]!
      fireEvent.pointerDown(chatRow, { pointerId: 1, button: 0, pointerType: 'touch', clientY: 120 })
      expect(chatRow.hasAttribute('data-dragging')).toBe(false)
      // The grip is the touch affordance.
      const handle = chatRow.querySelector('button')!
      fireEvent.pointerDown(handle, { pointerId: 2, button: 0, pointerType: 'touch', clientY: 120 })
      expect(chatRow.getAttribute('data-dragging')).toBe('')
      fireEvent.pointerUp(handle, { pointerId: 2, button: 0, pointerType: 'touch', clientY: 120 })
    } finally {
      restoreCapture()
    }
  })

  it('leaves the visibility checkbox to its own gesture', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      mountDialog()
      const rows = stubRowRects()
      const checkbox = rows[1]!.querySelector('input[type="checkbox"]') as HTMLInputElement
      fireEvent.pointerDown(checkbox, { pointerId: 1, button: 0, clientY: 120 })
      expect(rows[1]!.hasAttribute('data-dragging')).toBe(false)
    } finally {
      restoreCapture()
    }
  })

  it('arrow keys move the focused row; Home and End jump to the ends', () => {
    localStorage.clear()
    const layout = mountDialog()
    const rows = stubRowRects()
    const handle = rows[1]!.querySelector('button')!
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(layout.get().order.slice(0, 2)).toEqual(['chat', 'code'])
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    // Already first: the boundary key is a no-op, not a wrap.
    expect(layout.get().order.slice(0, 2)).toEqual(['chat', 'code'])
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(layout.get().order).toEqual(CUSTOMIZABLE_MODES)
    fireEvent.keyDown(handle, { key: 'End' })
    expect(layout.get().order.at(-1)).toBe('chat')
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(layout.get().order[0]).toBe('chat')
    // The Alt modifier stays supported for the documented keyboard path.
    fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true })
    expect(layout.get().order[0]).toBe('code')
  })

  it('Done closes through onClose', () => {
    const onClose = vi.fn()
    mountDialog(onClose)
    fireEvent.click(screen.getByRole('button', { name: 'rail.customize.done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
