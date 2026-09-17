// @vitest-environment jsdom
/**
 * `SubmenuMenu`: the contract the fork's menu owners depend on, plus the three
 * defenses the fork adds over upstream `Menu`'s nested card.
 *
 * jsdom has no layout, so the geometry that placement and the pointer sweep
 * read is stubbed per element. What is asserted is the wiring: a diagonal
 * transit leaving the 40px row box must not drop the flyout, the card must land
 * where `placeSubmenu` puts it, and a click inside the card must not read as an
 * outside click.
 */
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POINTER_GRACE_MS } from '../src/pointer-grace.ts'
import { SubmenuMenu } from '../src/index.ts'
import type { MenuEntry } from '../src/index.ts'

/** The viewport the browser measurement used; jsdom installs 1024x768. */
const VIEWPORT = { width: 1418, height: 802 }
const MEASURED_FLYOUT = { left: 244, top: 216, right: 407, bottom: 584 }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  setViewport(1024, 768)
})

/** jsdom reports `innerWidth`/`innerHeight` from these own properties. */
function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

/** Stub an element's viewport rect, which jsdom reports as all zeros. */
function stubRect(element: Element, rect: { left: number; top: number; right: number; bottom: number }): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  } as DOMRect)
}

/** Stub an element's laid-out box, which jsdom reports as zero offsets. */
function stubSize(element: Element, width: number, height: number): void {
  Object.defineProperty(element, 'offsetWidth', { value: width, configurable: true })
  Object.defineProperty(element, 'offsetHeight', { value: height, configurable: true })
}

/** The compile fixture: one row with a two-item submenu, one leaf row. */
const ITEMS: readonly MenuEntry[] = [
  {
    id: 'compile',
    label: 'Compile',
    submenu: [
      { id: 'build-h5', label: 'H5' },
      { id: 'build-pc', label: 'PC' },
    ],
  },
  { id: 'rename', label: 'Rename' },
]

interface Handles {
  readonly onSelect: ReturnType<typeof vi.fn>
  readonly onClose: ReturnType<typeof vi.fn>
  readonly parentRow: HTMLElement
  readonly parentButton: HTMLElement
  readonly leafButton: HTMLElement
}

/**
 * Mount the menu open and resolve the row handles.
 * @param options - item override and a handler on the wrapping element.
 * @returns the spies and the row/button elements.
 */
function mount(options?: {
  items?: readonly MenuEntry[]
  anchor?: ReactNode
  enclosing?: () => void
}): Handles {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(
    <div onClick={options?.enclosing}>
      <SubmenuMenu
        open
        anchor={options?.anchor ?? <span>trigger</span>}
        items={options?.items ?? ITEMS}
        onSelect={onSelect}
        onClose={onClose}
      />
    </div>)
  const parentButton = screen.getByRole('menuitem', { name: 'Compile' })
  const leafButton = screen.getByRole('menuitem', { name: 'Rename' })
  return { onSelect, onClose, parentRow: parentButton.parentElement as HTMLElement, parentButton, leafButton }
}

/** Open the flyout by hovering its row and return the portaled card. */
function openFlyout(handles: Handles): HTMLElement {
  fireEvent.mouseEnter(handles.parentRow)
  // The list renders in place, the card is portaled to the body after it.
  return screen.getAllByRole('menu')[1] as HTMLElement
}

/** Give the card a real measured box and replay the placement, as a scroll would. */
function measureFlyout(
  flyout: HTMLElement,
  rect: { left: number; top: number; right: number; bottom: number },
  width: number,
  height: number,
): void {
  stubRect(flyout, rect)
  stubSize(flyout, width, height)
  fireEvent.scroll(window)
}

describe('SubmenuMenu rows', () => {
  it('marks a row that opens a flyout with a chevron and aria-haspopup, leaving leaf rows unmarked', () => {
    const { parentButton, leafButton } = mount()
    expect(parentButton.getAttribute('aria-haspopup')).toBe('menu')
    expect(parentButton.getAttribute('aria-expanded')).toBe('false')
    // The fixture row carries no icon, so its only glyph is the indicator.
    expect(parentButton.querySelectorAll('svg')).toHaveLength(1)
    expect(parentButton.querySelector('svg')?.getAttribute('class')).toMatch(/chevron/)
    expect(leafButton.querySelectorAll('svg')).toHaveLength(0)
    expect(leafButton.getAttribute('aria-haspopup')).toBeNull()
  })

  it('opens the flyout on hover, marks the row expanded, and selects a nested row without selecting the parent', () => {
    const { onSelect, parentButton, parentRow } = mount()
    fireEvent.click(parentButton)
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.mouseEnter(parentRow)
    expect(parentButton.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'H5' }))
    expect(onSelect).toHaveBeenCalledWith('build-h5')
    expect(onSelect).not.toHaveBeenCalledWith('compile')
  })

  it('caps the list height even when it holds submenu rows', () => {
    mount()
    // Upstream has to drop the cap for these menus because its in-place nested
    // card would be cropped; a portaled card has no such constraint.
    expect(screen.getByRole('menu').className).toMatch(/scrollable/)
  })
})

describe('SubmenuMenu reachability', () => {
  it('survives a transit that leaves the row box and reaches the card inside the grace', () => {
    vi.useFakeTimers()
    try {
      setViewport(VIEWPORT.width, VIEWPORT.height)
      const handles = mount()
      stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
      const flyout = openFlyout(handles)
      measureFlyout(flyout, MEASURED_FLYOUT, 163, 368)
      expect(flyout.style.left).toBe('244px')
      expect(flyout.style.top).toBe('216px')

      // The transit that killed upstream's card in ~25ms: the pointer leaves
      // the row box (3px above it) and is still short of the card, so it is
      // inside neither element and the row's leave fires.
      fireEvent.mouseLeave(handles.parentRow)
      fireEvent.pointerMove(document, { clientX: 240, clientY: 213 })
      act(() => { vi.advanceTimersByTime(POINTER_GRACE_MS - 40) })
      expect(screen.getAllByRole('menu')).toHaveLength(2)

      // Arriving at the card within the grace keeps it.
      fireEvent.pointerMove(document, { clientX: 300, clientY: 250 })
      act(() => { vi.advanceTimersByTime(POINTER_GRACE_MS * 4) })
      expect(screen.getAllByRole('menu')).toHaveLength(2)
      expect(screen.getByRole('menuitem', { name: 'H5' })).toBeDefined()

      // Leaving the region for good still closes the card, and only the card.
      fireEvent.pointerMove(document, { clientX: 900, clientY: 700 })
      act(() => { vi.advanceTimersByTime(POINTER_GRACE_MS + 1) })
      expect(screen.getAllByRole('menu')).toHaveLength(1)
      expect(screen.getByRole('menuitem', { name: 'Compile' })).toBeDefined()
      expect(handles.parentButton.getAttribute('aria-expanded')).toBe('false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats the corridor between row and card as inside, so a crossing never arms a close', () => {
    vi.useFakeTimers()
    try {
      setViewport(VIEWPORT.width, VIEWPORT.height)
      const handles = mount()
      stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
      const flyout = openFlyout(handles)
      measureFlyout(flyout, MEASURED_FLYOUT, 163, 368)

      // Inside the 10px gap, level with the card, having already left the row.
      fireEvent.pointerMove(document, { clientX: 240, clientY: 400 })
      act(() => { vi.advanceTimersByTime(POINTER_GRACE_MS * 4) })
      expect(screen.getAllByRole('menu')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-checks the geometry when a pending close fires', () => {
    vi.useFakeTimers()
    try {
      setViewport(VIEWPORT.width, VIEWPORT.height)
      const handles = mount()
      stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
      const flyout = openFlyout(handles)
      measureFlyout(flyout, MEASURED_FLYOUT, 163, 368)

      // The pointer is last seen on the row, then a leave arms the close. A
      // real browser can deliver that pair while the card is still under the
      // pointer, and closing then would shut a card the pointer never left.
      fireEvent.pointerMove(document, { clientX: 100, clientY: 236 })
      fireEvent.mouseLeave(handles.parentRow)
      act(() => { vi.advanceTimersByTime(POINTER_GRACE_MS * 4) })
      expect(screen.getAllByRole('menu')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the card on a leave that is not followed by a return', () => {
    vi.useFakeTimers()
    try {
      setViewport(VIEWPORT.width, VIEWPORT.height)
      const handles = mount()
      stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
      const flyout = openFlyout(handles)
      measureFlyout(flyout, MEASURED_FLYOUT, 163, 368)
      fireEvent.pointerMove(document, { clientX: 900, clientY: 700 })
      fireEvent.mouseLeave(handles.parentRow)
      act(() => { vi.advanceTimersByTime(POINTER_GRACE_MS + 1) })
      expect(screen.getAllByRole('menu')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SubmenuMenu placement', () => {
  it('flips the card to the row\'s left when the right side has no room, and mirrors the chevron', () => {
    setViewport(VIEWPORT.width, VIEWPORT.height)
    const handles = mount()
    // Measured upstream: this row opened a card at 1412..1575 in a 1418px
    // viewport, i.e. 157px past the right edge.
    stubRect(handles.parentRow, { left: 1192, top: 216, right: 1402, bottom: 256 })
    const flyout = openFlyout(handles)
    measureFlyout(flyout, { left: 1019, top: 216, right: 1182, bottom: 584 }, 163, 368)
    expect(flyout.style.left).toBe('1019px')
    expect(flyout.style.left).not.toBe('1412px')
    expect(flyout.style.top).toBe('216px')
    expect(handles.parentButton.querySelector('svg')?.getAttribute('class')).toMatch(/chevronMirrored/)
  })

  it('caps a card taller than the viewport and keeps it inside the top margin', () => {
    setViewport(VIEWPORT.width, VIEWPORT.height)
    const handles = mount()
    stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
    const flyout = openFlyout(handles)
    measureFlyout(flyout, { left: 244, top: 12, right: 407, bottom: 790 }, 163, 1000)
    expect(flyout.style.maxHeight).toBe('778px')
    expect(flyout.style.top).toBe('12px')
  })

  it('portals the card to the body, outside the list card', () => {
    const handles = mount()
    stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
    const flyout = openFlyout(handles)
    const list = screen.getAllByRole('menu')[0] as HTMLElement
    expect(flyout.parentElement).toBe(document.body)
    expect(list.contains(flyout)).toBe(false)
  })
})

describe('SubmenuMenu dismissal', () => {
  it('does not treat a click inside the card as an outside click', () => {
    const handles = mount()
    stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
    openFlyout(handles)
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'H5' }))
    expect(handles.onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(document.body)
    expect(handles.onClose).toHaveBeenCalledTimes(1)
  })

  it('does not let a nested row click reach the element enclosing the anchor', () => {
    const enclosing = vi.fn()
    const handles = mount({ enclosing })
    stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
    openFlyout(handles)
    fireEvent.click(screen.getByRole('menuitem', { name: 'H5' }))
    expect(handles.onSelect).toHaveBeenCalledWith('build-h5')
    expect(enclosing).not.toHaveBeenCalled()
  })

  it('closes the card first and the list second on Escape', () => {
    const handles = mount()
    stubRect(handles.parentRow, { left: 24, top: 216, right: 234, bottom: 256 })
    openFlyout(handles)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(handles.onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(handles.onClose).toHaveBeenCalledTimes(1)
  })
})
