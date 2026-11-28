/**
 * Viewport-aware placement for the side flyout a menu row opens.
 *
 * Why this is fork-owned: upstream's `Menu.tsx` positions its nested card with
 * plain CSS (`bottom: -4px; left: calc(100% + 10px)`) — bottom-aligned to the
 * menu card and never measured against the viewport. A parent row in the upper
 * half of the screen therefore opens a card whose top edge sits above `y = 0`,
 * and a row near the right edge opens one past the right edge. Measured on a
 * 1418x802 viewport with a 9-row flyout:
 *
 * - parent row at `top: 216` (210x40) -> flyout `top: -108`, height 368;
 * - parent row at `right: 1402` -> flyout `right: 1575`, i.e. 157px past the edge.
 *
 * Both numbers come from the placement rules below being absent, so this module
 * owns exactly those rules — kept free of the DOM (rects and sizes come in as
 * plain numbers) so every branch is unit-testable without a browser.
 *
 * The rules, in order:
 * 1. Side: keep the flyout on the right of the row while it fits inside the
 *    right margin; otherwise open left when the left side has room; otherwise
 *    take whichever side has more space, so a narrow window still gets the
 *    larger usable slice of the card.
 * 2. Horizontal: clamp the resolved `left` inside `[margin, width - margin]`.
 * 3. Vertical: top-align the flyout with the parent row — the row the user
 *    aimed at leads the card, the way a menu flyout is expected to read — then
 *    pull it up if it would cross the bottom margin.
 * 4. Oversize: when the card is taller than the viewport can hold, cap its
 *    height at `height - 2 * margin` and pin it to the top margin so the
 *    caller's internal scroll can reach every row.
 * @module @deepseek-ai/dsh-client-ui-primitives/submenu-placement
 */

/** A rectangle in viewport coordinates — the `DOMRect` fields this module reads. */
export interface SubmenuRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** The laid-out box of the flyout card. */
export interface SubmenuSize {
  readonly width: number
  readonly height: number
}

/** The viewport the flyout must stay inside. */
export interface SubmenuViewport {
  readonly width: number
  readonly height: number
}

/** Side of the parent row the flyout opened on (the row mirrors its arrow). */
export type SubmenuSide = 'right' | 'left'

/** Resolved fixed-position geometry for the flyout card. */
export interface SubmenuPlacement {
  /** Side the flyout opened on. */
  readonly side: SubmenuSide
  /** Viewport-relative `left` for the card. */
  readonly left: number
  /** Viewport-relative `top` for the card. */
  readonly top: number
  /** Height cap to apply when the card exceeds the viewport, else undefined. */
  readonly maxHeight: number | undefined
}

/** Distance kept between the flyout and the parent row's trailing edge. */
export const SUBMENU_GAP = 10

/** Distance kept between the flyout and every viewport edge (matches `Menu`'s portal margin). */
export const SUBMENU_VIEWPORT_MARGIN = 12

/** Placement distances, both defaulted from the exported constants. */
export interface SubmenuPlacementOptions {
  /** Gap between the parent row and the flyout. */
  gap?: number | undefined
  /** Margin kept against each viewport edge. */
  margin?: number | undefined
}

/** Clamp `value` into `[low, high]`, tolerating a `high` below `low` (degenerate viewport). */
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

/**
 * Resolve the flyout's fixed-position geometry against the viewport.
 * @param anchor - the parent row's viewport rect.
 * @param size - the flyout's measured box.
 * @param viewport - current viewport size (`window.innerWidth`/`innerHeight`).
 * @param options - gap/margin overrides; both default to this module's constants.
 * @returns the side, the clamped `left`/`top`, and an optional height cap.
 */
export function placeSubmenu(
  anchor: SubmenuRect,
  size: SubmenuSize,
  viewport: SubmenuViewport,
  options?: SubmenuPlacementOptions,
): SubmenuPlacement {
  const gap = options?.gap ?? SUBMENU_GAP
  const margin = options?.margin ?? SUBMENU_VIEWPORT_MARGIN

  // Room the card would have on each side, ignoring its own width so a wide
  // card can still flip to a side it only partly fits (the clamp below then
  // pulls it back inside, which reads better than an off-screen card).
  const roomRight = viewport.width - margin - (anchor.right + gap)
  const roomLeft = anchor.left - gap - margin
  const side: SubmenuSide = size.width <= roomRight || roomRight >= roomLeft ? 'right' : 'left'

  const usableWidth = Math.max(0, viewport.width - 2 * margin)
  const width = Math.min(size.width, usableWidth)
  const left = side === 'right' ? anchor.right + gap : anchor.left - gap - width

  // A card taller than the viewport can hold is capped and scrolls internally;
  // otherwise the cap is absent and the full height is placed as-is.
  const usableHeight = Math.max(0, viewport.height - 2 * margin)
  const maxHeight = size.height > usableHeight ? usableHeight : undefined
  const height = maxHeight ?? size.height

  return {
    side,
    left: clamp(left, margin, viewport.width - margin - width),
    // Top-aligned with the row, then pulled up off the bottom margin.
    top: clamp(anchor.top, margin, viewport.height - margin - height),
    maxHeight,
  }
}

/**
 * Whether a viewport point falls inside `rect`.
 * Used by the flyout's pointer geometry sweep, where the flyout, the parent
 * row, and the corridor between them together count as "still inside".
 * @param rect - the rectangle to test.
 * @param x - point x in viewport coordinates.
 * @param y - point y in viewport coordinates.
 * @returns true when the point is inside the rectangle's bounds.
 */
export function isInsideRect(rect: SubmenuRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/**
 * The bridge between a parent row and its flyout, spanning the gap that
 * separates them and the full vertical extent of both.
 *
 * The pointer crosses this band whenever it travels diagonally from the row to
 * the card. Without it the sweep sees a point inside neither box for a few
 * frames and arms a close; with it the crossing is continuous, which is what
 * makes a diagonal approach survivable rather than only a perfectly
 * horizontal one.
 * @param row - the parent row's viewport rect.
 * @param flyout - the flyout's viewport rect.
 * @returns the corridor rectangle (empty-width when the two boxes touch).
 */
export function submenuCorridor(row: SubmenuRect, flyout: SubmenuRect): SubmenuRect {
  const left = Math.min(row.right, flyout.right)
  const right = Math.max(row.left, flyout.left)
  return {
    left,
    right,
    top: Math.min(row.top, flyout.top),
    bottom: Math.max(row.bottom, flyout.bottom),
  }
}
