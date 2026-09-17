/**
 * Anchored dropdown menu whose second-level flyout is actually reachable.
 *
 * Why this sits next to upstream's `Menu` instead of fixing it. `Menu`'s
 * nested card closes on the row's `mouseleave` with no grace, and is placed by
 * plain CSS (`bottom: -4px; left: calc(100% + 10px)`) that never consults the
 * viewport. Driven with real mouse input on a 1418x802 viewport, a 9-row build
 * flyout measured as two independent defects:
 *
 * - the flyout disappeared ~25ms into a diagonal approach — pointer at
 *   `(1325, 213)` against a row box of `y 216..256`, i.e. 3px of vertical
 *   overshoot cleared the open row outright — so at speed the second level was
 *   effectively unreachable;
 * - the card is bottom-aligned to the list, so a row at `top: 216` opened a
 *   368px card at `top: -108` (108px above the viewport), and a row at
 *   `right: 1402` opened one at `right: 1575` (157px past the right edge).
 *
 * `Menu.tsx` is upstream-owned: its own spec pins the instant-close behavior
 * (`fireEvent.mouseLeave(wrap)` -> submenu gone), and fork fixes parked in it
 * are reverted by the next upstream merge — the same reasoning that put
 * `RailTooltip` next to `Tooltip` and `BirdLogo` next to `FishLogo`. So this is
 * a fork-owned file that keeps `Menu`'s props and DOM roles and adds the three
 * things upstream does not have:
 *
 * 1. a chevron on every row that opens a flyout, mirrored when the card
 *    resolved to the opposite side;
 * 2. a 200ms pointer grace on the open row plus a document `pointermove`
 *    geometry sweep, so row, corridor and card count as one region and a
 *    diagonal approach survives;
 * 3. a portaled, measured, viewport-clamped flyout (`placeSubmenu`) that flips
 *    left when the right side has no room.
 *
 * It is not a general-purpose `Menu` replacement: it implements the prop
 * surface the fork's menus use (`dense` and keyboard `autoFocus` navigation
 * stay upstream-only).
 * @module @deepseek-ai/dsh-client-ui-primitives/SubmenuMenu
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { IconCheckOutline16, IconChevronRightOutline14 } from './icons/index.tsx'
import { usePointerGrace } from './pointer-grace.ts'
import { isInsideRect, placeSubmenu, submenuCorridor } from './submenu-placement.ts'
import type { SubmenuPlacement, SubmenuRect } from './submenu-placement.ts'
import type { MenuEntry, MenuLabel, MenuSeparator } from './Menu.tsx'
import css from './SubmenuMenu.module.css'

/** Unplaced portal card: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real. */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'type' in entry && entry.type === 'separator'
}

function isLabel(entry: MenuEntry): entry is MenuLabel {
  return 'type' in entry && entry.type === 'label'
}

/** Narrow a `DOMRect` to the plain numbers the placement module reads. */
function toRect(rect: DOMRect): SubmenuRect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

/** A pointer position in viewport coordinates. */
interface PointerPoint {
  readonly x: number
  readonly y: number
}

/** Props of {@link SubmenuMenu} — a subset of upstream `Menu`'s, see the module note. */
export interface SubmenuMenuProps {
  /** Whether the list is showing (owner-controlled). */
  open: boolean
  /** The trigger element, rendered in place. */
  anchor: ReactNode
  /** Rows, separators, and headings. A row with a `submenu` opens the flyout. */
  items: readonly MenuEntry[]
  /** Rows pinned below the scrolling items area, separated by a hairline. */
  footer?: readonly MenuEntry[] | undefined
  /** Row shown as selected (trailing check). */
  selectedId?: string | undefined
  /** Rows shown as selected when a menu contains independent option groups. */
  selectedIds?: readonly string[] | undefined
  /** Row click callback; a submenu parent opens its flyout instead. */
  onSelect: (id: string) => void
  /** Invoked on outside click, Escape, or a window blur that moved focus into an iframe. */
  onClose: () => void
  /** List alignment against the anchor (default `'start'`). */
  align?: 'start' | 'end'
  /** Open below/above the anchor, or to its right (portal mode only). */
  side?: 'bottom' | 'top' | 'right'
  /** Render the list into `document.body`, fixed-positioned from the anchor rect. */
  portal?: boolean
  /** Close the list once the pointer has left both trigger and list for the pointer grace. */
  closeOnPointerLeave?: boolean
  /** Portal mode only: supply the anchor rect directly instead of measuring the wrapper. */
  getAnchorRect?: () => DOMRect | null
  /** Extra class on the anchor wrapper. */
  className?: string | undefined
}

/**
 * Render an anchored menu with viewport-aware submenu flyouts.
 * @param props - see {@link SubmenuMenuProps}.
 * @returns the anchor wrapper with the conditional list and flyout.
 */
export function SubmenuMenu({
  open, anchor, items, footer, selectedId, selectedIds, onSelect, onClose,
  align = 'start', side = 'bottom', portal = false, closeOnPointerLeave = false,
  getAnchorRect, className,
}: SubmenuMenuProps) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  /** Row wrappers by row id: the open flyout hangs from the matching rect. */
  const rowsRef = useRef(new Map<string, HTMLDivElement>())
  /** Last observed pointer position: the close decision is made at fire time. */
  const pointerRef = useRef<PointerPoint | null>(null)
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null)
  const [fixedPos, setFixedPos] = useState<CSSProperties | null>(null)
  const [flyoutPos, setFlyoutPos] = useState<SubmenuPlacement | null>(null)
  const { arm: armListClose, cancel: cancelListClose } = usePointerGrace(onClose)
  // Read at fire time (200ms later, after any state from the same gesture has
  // settled), never captured at arm time — see `closeFlyout`.
  const openSubmenuIdRef = useRef<string | null>(null)
  openSubmenuIdRef.current = openSubmenuId

  /**
   * Whether a point lies in the region that keeps the open flyout alive: its
   * parent row, the card itself, or the gap between them. Shared by the
   * continuous sweep and by the close action so both answer the same question
   * from the same geometry.
   */
  const keepsFlyoutOpen = useCallback((point: PointerPoint): boolean => {
    const id = openSubmenuIdRef.current
    if (id === null) return false
    const row = rowsRef.current.get(id)
    if (row === undefined) return false
    const rowRect = toRect(row.getBoundingClientRect())
    if (isInsideRect(rowRect, point.x, point.y)) return true
    const flyout = flyoutRef.current
    if (flyout === null) return false
    const flyoutRect = toRect(flyout.getBoundingClientRect())
    return isInsideRect(flyoutRect, point.x, point.y)
      || isInsideRect(submenuCorridor(rowRect, flyoutRect), point.x, point.y)
  }, [])

  // Re-decide on the geometry as it stands when the grace elapses. The pointer
  // can have crossed onto another submenu row inside the grace window, and the
  // sweep that armed this close was still holding the previous row's closure —
  // closing here without re-checking would shut a flyout the user is now on.
  const closeFlyout = useCallback(() => {
    const point = pointerRef.current
    if (point !== null && keepsFlyoutOpen(point)) return
    setOpenSubmenuId(null)
  }, [keepsFlyoutOpen])
  const { arm: armFlyoutClose, cancel: cancelFlyoutClose } = usePointerGrace(closeFlyout)

  // Portal mode: fixed-position the list from the anchor rect before paint, and
  // track the anchor while open (capture-phase scroll catches nested panes).
  useLayoutEffect(() => {
    if (!open || !portal) { setFixedPos(null); return }
    const place = () => {
      let rect: DOMRect | null
      if (getAnchorRect !== undefined) {
        rect = getAnchorRect()
      } else {
        /* v8 ignore next 2 -- the ref is attached before the layout effect runs. */
        rect = rootRef.current?.getBoundingClientRect() ?? null
      }
      if (rect === null) return
      const margin = 12
      const vw = window.innerWidth
      const vh = window.innerHeight
      const listEl = listRef.current
      const lw = listEl?.offsetWidth ?? 0
      const lh = listEl?.offsetHeight ?? 0
      let x: number
      let y: number
      if (side === 'right') {
        x = rect.right + 4
        y = rect.top
      } else if (align === 'start') {
        x = rect.left
        y = side === 'bottom' ? rect.bottom + 4 : rect.top - lh - 4
      } else {
        x = rect.right - lw
        y = side === 'bottom' ? rect.bottom + 4 : rect.top - lh - 4
      }
      if (lw > 0) x = Math.min(Math.max(x, margin), vw - lw - margin)
      if (lh > 0) y = Math.min(Math.max(y, margin), vh - lh - margin)
      setFixedPos({ left: x, top: y })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, portal, align, side, getAnchorRect])

  // The flyout is measured against the row it hangs from and against the
  // viewport, then clamped/flipped by `placeSubmenu` — the whole reason the
  // nested card cannot drift off screen. Re-runs while open so the card keeps
  // its row as the list scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!open || openSubmenuId === null) { setFlyoutPos(null); return }
    const place = () => {
      const row = rowsRef.current.get(openSubmenuId)
      const flyout = flyoutRef.current
      if (row === undefined || flyout === null) return
      setFlyoutPos(placeSubmenu(
        toRect(row.getBoundingClientRect()),
        { width: flyout.offsetWidth, height: flyout.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ))
    }
    // Same commit as the flyout's mount, so the first painted frame already
    // carries the resolved coordinates instead of the measuring origin.
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, openSubmenuId])

  useEffect(() => {
    if (!open) {
      setOpenSubmenuId(null)
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      // The portaled list is outside the anchor subtree; the flyout is outside
      // both, so a click on a flyout row must not read as an outside click.
      if (rootRef.current?.contains(event.target) === true) return
      if (listRef.current?.contains(event.target) === true) return
      if (flyoutRef.current?.contains(event.target) === true) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape closes the topmost layer only: the flyout, then the list.
      if (openSubmenuIdRef.current !== null) {
        setOpenSubmenuId(null)
        return
      }
      onClose()
    }
    // A pointerdown inside a cross-origin iframe never reaches this document;
    // the focus move it causes blurs the window instead. Only that case closes.
    const onWindowBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [open, onClose])

  // A close from selection/Escape/outside click outruns a pending grace close;
  // left armed it would shut a list reopened inside the grace window.
  useEffect(() => { if (!open) cancelListClose() }, [open, cancelListClose])
  useEffect(() => { if (!open) cancelFlyoutClose() }, [open, cancelFlyoutClose])

  // The geometric half of the reachability fix. React's enter/leave can only
  // report the discrete boxes it is handed, and the pointer leaves the 40px row
  // box before it reaches the card (3px of vertical drift was enough); this
  // sweep decides continuously instead, so row + corridor + card are one region
  // and a diagonal approach never reads as "left". Leaving that union arms the
  // same 200ms grace, so a genuine exit still closes promptly.
  useEffect(() => {
    if (!open || openSubmenuId === null) return
    const onMove = (event: PointerEvent) => {
      const point = { x: event.clientX, y: event.clientY }
      pointerRef.current = point
      if (keepsFlyoutOpen(point)) cancelFlyoutClose()
      else armFlyoutClose()
    }
    document.addEventListener('pointermove', onMove)
    return () => { document.removeEventListener('pointermove', onMove) }
  }, [open, openSubmenuId, armFlyoutClose, cancelFlyoutClose, keepsFlyoutOpen])

  const renderEntry = (entry: MenuEntry) => {
    if (isSeparator(entry)) {
      return <div key={entry.id} className={css.separator} role="separator" />
    }
    if (isLabel(entry)) {
      return <div key={entry.id} className={css.label} role="presentation">{entry.text}</div>
    }
    const hasSub = entry.submenu !== undefined && entry.submenu.length > 0
    const subOpen = hasSub && openSubmenuId === entry.id
    const selected = entry.id === selectedId || selectedIds?.includes(entry.id) === true
    const mirrored = subOpen && flyoutPos?.side === 'left'
    return (
      <div
        key={entry.id}
        // Registered for every row: the open flyout is placed from the row's
        // rect, and reading it from the map beats threading a ref through the
        // click/focus/hover handlers.
        ref={(element) => {
          if (!hasSub) return
          if (element === null) rowsRef.current.delete(entry.id)
          else rowsRef.current.set(entry.id, element)
        }}
        className={css.itemWrap}
        onMouseEnter={() => {
          cancelFlyoutClose()
          setOpenSubmenuId(hasSub ? entry.id : null)
        }}
        onMouseLeave={() => { if (hasSub) armFlyoutClose() }}
      >
        <button
          type="button"
          role="menuitem"
          className={clsx(css.item, selected && css.selected, entry.danger === true && css.danger)}
          disabled={entry.disabled}
          aria-haspopup={hasSub ? 'menu' : undefined}
          aria-expanded={hasSub ? subOpen : undefined}
          onFocus={() => {
            if (!hasSub) return
            cancelFlyoutClose()
            setOpenSubmenuId(entry.id)
          }}
          onClick={() => {
            if (hasSub) {
              cancelFlyoutClose()
              setOpenSubmenuId(entry.id)
              return
            }
            onSelect(entry.id)
          }}
        >
          {entry.icon !== undefined && <span className={css.itemIcon}>{entry.icon}</span>}
          <span className={css.itemLabel}>{entry.label}</span>
          {selected && <IconCheckOutline16 className={css.check} />}
          {/* Structural affordance: a row with a second level says so before it
              is hovered, and the glyph points at the side the card took. */}
          {hasSub && (
            <IconChevronRightOutline14
              className={clsx(css.chevron, mirrored && css.chevronMirrored)}
            />
          )}
        </button>
        {subOpen && entry.submenu !== undefined && createPortal(
          <div
            ref={flyoutRef}
            className={css.flyout}
            style={flyoutPos === null
              ? MEASURE_STYLE
              : { left: flyoutPos.left, top: flyoutPos.top, maxHeight: flyoutPos.maxHeight }}
            role="menu"
            onMouseEnter={cancelFlyoutClose}
            onMouseLeave={armFlyoutClose}
            // React portals bubble synthetic events through the React tree:
            // without this stop the click reaches the anchor row's own onClick.
            onClick={(event) => { event.stopPropagation() }}
          >
            {entry.submenu.map(sub => (
              <button
                key={sub.id}
                type="button"
                role="menuitem"
                className={css.item}
                disabled={sub.disabled}
                onClick={() => { onSelect(sub.id) }}
              >
                {sub.icon !== undefined && <span className={css.itemIcon}>{sub.icon}</span>}
                <span className={css.itemLabel}>{sub.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>
    )
  }

  const list = open && (
    <div
      ref={listRef}
      // Always scroll-capped: the flyout is portaled, so the overflow clip that
      // upstream's in-place nested card had to avoid cannot crop it.
      className={clsx(css.list, css.scrollable, portal && css.portal, side === 'top' && !portal && css.sideTop, align === 'end' && !portal && css.alignEnd)}
      style={portal ? fixedPos ?? MEASURE_STYLE : undefined}
      role="menu"
      onClick={(event) => { event.stopPropagation() }}
    >
      <div className={css.viewport} role="presentation">
        {items.map(renderEntry)}
      </div>
      {footer !== undefined && footer.length > 0 && (
        <div className={css.footer} role="presentation">
          {footer.map(renderEntry)}
        </div>
      )}
    </div>
  )

  // Pointer-leave dismissal watches the WRAPPER, not the list: React's
  // enter/leave traversal runs over the React tree, so trigger, list, and the
  // portaled flyout are one region here — crossing the gap to reach the flyout
  // therefore never counts as leaving.
  return (
    <span
      ref={rootRef}
      className={clsx(css.root, className)}
      onPointerEnter={closeOnPointerLeave ? cancelListClose : undefined}
      onPointerLeave={closeOnPointerLeave ? () => { if (open) armListClose() } : undefined}
    >
      {anchor}
      {portal ? (list !== false && createPortal(list, document.body)) : list}
    </span>
  )
}
