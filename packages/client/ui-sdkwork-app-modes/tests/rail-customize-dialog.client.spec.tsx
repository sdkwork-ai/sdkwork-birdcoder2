// @vitest-environment jsdom
/**
 * Rail customize dialog spec: one row per entry in layout order, each with a
 * drag handle, the mode's inert glyph, its name, and a visibility checkbox
 * that writes immediately; the handle reorders through pointer capture
 * (commit on drop, discard on lost capture) and Alt+Arrow keys; reset
 * restores the shipped layout; Done closes. Runs against the real layout
 * store, so the persisted blob moves with every write.
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

/** Stub each row's box by DOM position (row i occupies [i*100, i*100+40)). */
function stubRowRects(): HTMLElement[] {
  const rows = [...document.body.querySelectorAll<HTMLElement>('[data-rail-customize-row]')]
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () => ({
      x: 0, y: index * 100, top: index * 100, left: 0, right: 40, bottom: index * 100 + 40,
      width: 40, height: 40, toJSON: () => ({}),
    })
  })
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
      // The shipped layout checks the fixed modes plus Chat; a fixed row's
      // checkbox renders disabled — always shown, by design.
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
    expect(layout.get().hidden).toEqual(['contacts', 'appstore', 'course', 'drive'])
    expect((rows[1]!.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
    // Show another hidden one (App Store, row 5).
    const appstoreCheck = rows[5]!.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(appstoreCheck)
    expect(layout.get().hidden).toEqual(['contacts', 'course', 'drive'])
    // Reset puts everything back.
    fireEvent.click(screen.getByRole('button', { name: 'rail.customize.reset' }))
    expect(layout.get().order).toEqual(CUSTOMIZABLE_MODES)
    expect(layout.get().hidden).toEqual(DEFAULT_HIDDEN)
  })

  it('dragging a handle reorders the rows; the drop writes the store and the blob', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      const layout = mountDialog()
      const rows = stubRowRects()
      const handle = rows[0]!.querySelector('button')!
      // Press row 0, move past the third row's midpoint (clientY 225 inserts
      // before row 3), release: the previewed arrangement commits.
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 20 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 225 })
      // The mid-drag preview already shows the new arrangement; the store does not.
      const preview = [...document.body.querySelectorAll<HTMLElement>('[data-rail-customize-row]')]
        .map(row => row.textContent)
      expect(preview[3]).toBe('mode.code')
      expect(layout.get().order[0]).toBe('code')
      fireEvent.pointerUp(handle, { pointerId: 1, clientY: 225 })
      expect(layout.get().order)
        .toEqual(['chat', 'contacts', 'video', 'code', 'image', 'appstore', 'knowledge', 'course', 'drive', 'assets'])
      expect(JSON.parse(localStorage.getItem('dsh.railLayout')!).order).toEqual(layout.get().order)
      // The rows render the committed order once the drag clears.
      const committed = [...document.body.querySelectorAll<HTMLElement>('[data-rail-customize-row]')]
        .map(row => row.textContent)
      expect(committed).toEqual(layout.get().order.map(mode => `mode.${mode}`))
    } finally {
      restoreCapture()
    }
  })

  it('a lost pointer capture discards the draft and keeps the stored order', () => {
    localStorage.clear()
    const restoreCapture = stubPointerCapture()
    try {
      const layout = mountDialog()
      const rows = stubRowRects()
      const before = layout.get().order
      const handle = rows[1]!.querySelector('button')!
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 120 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 320 })
      // The preview moved the row; nothing is stored yet.
      expect(layout.get().order).toEqual(before)
      fireEvent.lostPointerCapture(handle)
      // The draft cleared: rows render the stored order again.
      const rendered = [...document.body.querySelectorAll<HTMLElement>('[data-rail-customize-row]')]
        .map(row => row.textContent)
      expect(rendered).toEqual(before.map(mode => `mode.${mode}`))
      expect(layout.get().order).toEqual(before)
    } finally {
      restoreCapture()
    }
  })

  it('Alt+Arrow moves the focused row one position without a drag', () => {
    localStorage.clear()
    const layout = mountDialog()
    const rows = stubRowRects()
    const handle = rows[1]!.querySelector('button')!
    fireEvent.keyDown(handle, { key: 'ArrowUp', altKey: true })
    expect(layout.get().order).toEqual([
      'chat', 'code', 'contacts', 'video', 'image', 'appstore', 'knowledge', 'course', 'drive', 'assets',
    ])
    fireEvent.keyDown(handle, { key: 'ArrowDown', altKey: true })
    expect(layout.get().order).toEqual(CUSTOMIZABLE_MODES)
  })

  it('Done closes through onClose', () => {
    const onClose = vi.fn()
    mountDialog(onClose)
    fireEvent.click(screen.getByRole('button', { name: 'rail.customize.done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
