/**
 * Flyout placement rules: the arithmetic that keeps a submenu card inside the
 * viewport.
 *
 * These numbers are the fix for two defects measured in a real browser at
 * 1418x802 with upstream `Menu` (see `submenu-placement.ts`): a row at
 * `top: 216` opened a 368px card at `top: -108`, and a row at `right: 1402`
 * opened one at `right: 1575`. The example cases below pin both, and the sweep
 * over viewport sizes and row positions asserts the invariant that matters:
 * a fitting card is always fully inside the margin box.
 */
import { describe, expect, it } from 'vitest'
import {
  isInsideRect, placeSubmenu, submenuCorridor, SUBMENU_GAP, SUBMENU_VIEWPORT_MARGIN,
} from '../src/index.ts'

/** The row / card / viewport used by the browser measurement this module fixes. */
const VIEWPORT = { width: 1418, height: 802 }
const FLYOUT = { width: 163, height: 368 }

describe('placeSubmenu', () => {
  it('opens right of the row and top-aligns with it instead of hanging off the viewport top', () => {
    // Measured upstream: the same row produced a card at top -108 (108px above
    // the viewport) because the card was bottom-aligned to the menu.
    const placed = placeSubmenu(
      { left: 24, top: 216, right: 234, bottom: 256 }, FLYOUT, VIEWPORT)
    expect(placed.side).toBe('right')
    expect(placed.left).toBe(234 + SUBMENU_GAP)
    expect(placed.top).toBe(216)
    expect(placed.maxHeight).toBeUndefined()
  })

  it('flips to the left of the row when the right side has no room', () => {
    // Measured upstream: this row produced a card spanning 1412..1575, i.e.
    // 157px past the 1418px viewport.
    const placed = placeSubmenu(
      { left: 1192, top: 216, right: 1402, bottom: 256 }, FLYOUT, VIEWPORT)
    expect(placed.side).toBe('left')
    expect(placed.left).toBe(1192 - SUBMENU_GAP - FLYOUT.width)
    expect(placed.left + FLYOUT.width).toBeLessThanOrEqual(VIEWPORT.width - SUBMENU_VIEWPORT_MARGIN)
    expect(placed.top).toBe(216)
  })

  it('pulls the card up off the bottom margin when the row sits near the bottom', () => {
    const placed = placeSubmenu(
      { left: 24, top: 700, right: 234, bottom: 740 }, FLYOUT, VIEWPORT)
    expect(placed.top + FLYOUT.height).toBe(VIEWPORT.height - SUBMENU_VIEWPORT_MARGIN)
    expect(placed.top).toBe(802 - 12 - 368)
  })

  it('caps a card taller than the viewport and pins it inside the top margin', () => {
    const placed = placeSubmenu(
      { left: 24, top: 216, right: 234, bottom: 256 }, { width: 163, height: 1000 }, VIEWPORT)
    expect(placed.maxHeight).toBe(802 - 2 * SUBMENU_VIEWPORT_MARGIN)
    expect(placed.top).toBe(SUBMENU_VIEWPORT_MARGIN)
  })

  it('takes the roomier side when neither side fits the card', () => {
    // Right has 118px of room, left has none, and the 163px card fits on
    // neither: the roomier side wins and the clamp pulls the card back inside.
    const placed = placeSubmenu(
      { left: 20, top: 10, right: 60, bottom: 50 }, { width: 163, height: 100 }, { width: 200, height: 200 })
    expect(placed.side).toBe('right')
    expect(placed.left).toBe(200 - SUBMENU_VIEWPORT_MARGIN - 163)
  })

  it('honours gap and margin overrides', () => {
    const placed = placeSubmenu(
      { left: 24, top: 216, right: 234, bottom: 256 }, FLYOUT, VIEWPORT, { gap: 4, margin: 40 })
    expect(placed.left).toBe(238)
    expect(placed.top).toBe(216)
  })

  it('never returns a non-finite coordinate in a degenerate viewport', () => {
    const placed = placeSubmenu(
      { left: 0, top: 0, right: 100, bottom: 20 }, { width: 163, height: 100 }, { width: 20, height: 20 })
    expect(Number.isFinite(placed.left)).toBe(true)
    expect(Number.isFinite(placed.top)).toBe(true)
    expect(placed.left).toBe(SUBMENU_VIEWPORT_MARGIN)
    expect(placed.top).toBe(SUBMENU_VIEWPORT_MARGIN)
  })

  it('keeps a fitting card fully inside the margin box for every viewport, size, and row position', () => {
    const margin = SUBMENU_VIEWPORT_MARGIN
    const viewports = [
      { width: 1418, height: 802 }, { width: 1280, height: 720 }, { width: 900, height: 600 },
      { width: 600, height: 400 }, { width: 480, height: 360 },
    ]
    for (const viewport of viewports) {
      const usable = { width: viewport.width - 2 * margin, height: viewport.height - 2 * margin }
      const sizes = [
        { width: Math.min(163, usable.width), height: Math.min(368, usable.height) },
        { width: Math.min(163, usable.width), height: Math.min(120, usable.height) },
        { width: Math.min(240, usable.width), height: Math.min(300, usable.height) },
      ]
      for (const size of sizes) {
        for (let left = 0; left <= viewport.width - 210; left += 97) {
          for (let top = 0; top <= viewport.height - 40; top += 53) {
            const placed = placeSubmenu(
              { left, top, right: left + 210, bottom: top + 40 }, size, viewport)
            const where = `viewport ${viewport.width}x${viewport.height} size ${size.width}x${size.height} row ${left},${top}`
            expect(placed.maxHeight, where).toBeUndefined()
            expect(placed.left, where).toBeGreaterThanOrEqual(margin)
            expect(placed.left + size.width, where).toBeLessThanOrEqual(viewport.width - margin)
            expect(placed.top, where).toBeGreaterThanOrEqual(margin)
            expect(placed.top + size.height, where).toBeLessThanOrEqual(viewport.height - margin)
          }
        }
      }
    }
  })
})

describe('submenuCorridor', () => {
  it('spans the gap between the row and a right-side card', () => {
    const corridor = submenuCorridor(
      { left: 24, top: 216, right: 234, bottom: 256 },
      { left: 244, top: 216, right: 407, bottom: 584 })
    expect(corridor).toEqual({ left: 234, right: 244, top: 216, bottom: 584 })
  })

  it('spans the gap between the row and a left-side card', () => {
    const corridor = submenuCorridor(
      { left: 1192, top: 216, right: 1402, bottom: 256 },
      { left: 1019, top: 216, right: 1182, bottom: 584 })
    expect(corridor).toEqual({ left: 1182, right: 1192, top: 216, bottom: 584 })
  })

  it('covers the vertical extent of both boxes so a diagonal crossing stays inside', () => {
    const corridor = submenuCorridor(
      { left: 24, top: 216, right: 234, bottom: 256 },
      { left: 244, top: 100, right: 407, bottom: 584 })
    expect(corridor.top).toBe(100)
    expect(corridor.bottom).toBe(584)
  })
})

describe('isInsideRect', () => {
  const rect = { left: 10, top: 20, right: 30, bottom: 40 }

  it('includes the edges so a boundary crossing reads as continuous', () => {
    expect(isInsideRect(rect, 10, 20)).toBe(true)
    expect(isInsideRect(rect, 30, 40)).toBe(true)
    expect(isInsideRect(rect, 20, 30)).toBe(true)
  })

  it('excludes a point past any edge', () => {
    expect(isInsideRect(rect, 9, 30)).toBe(false)
    expect(isInsideRect(rect, 31, 30)).toBe(false)
    expect(isInsideRect(rect, 20, 19)).toBe(false)
    expect(isInsideRect(rect, 20, 41)).toBe(false)
  })
})
