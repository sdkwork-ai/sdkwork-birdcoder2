/**
 * Fork-owned tooltip for the rail surfaces: the merge-stable replacement for
 * upstream `Tooltip` on every fork-registered rail entry.
 *
 * Why this exists: upstream fixes land in `ui-primitives/src/Tooltip.tsx`,
 * an upstream-owned file, and every behavioral fix parked there has been
 * reverted by the next `git merge upstream/master` — the same mechanism that
 * repeatedly reverted the fish logo. This file is fork-owned, so upstream
 * merges can never touch it (BirdLogo contract, applied to behavior).
 *
 * The anchor-injection API matches upstream (label / side / delayMs /
 * disabled / maxWidth / single anchor child), plus three defenses against
 * bubbles that stick in real browsers: a click or a state swap can remount
 * or move the anchor under a stationary pointer, the browser then never
 * dispatches mouseleave/blur, and the hover/focus trigger flags wedge open:
 *
 * 1. Geometry sweep — while a bubble is visible, a document pointermove
 *    outside the anchor's box (plus a grace margin) force-dismisses, even
 *    when mouseleave was swallowed by a remount or a CSS-driven move.
 * 2. Press dismissal — any document pointerdown dismisses. On the rail a
 *    click always changes state (mode switch, panel open), so the label is
 *    dead the moment the press lands.
 * 3. Cross-bundle singleton — showing a bubble announces it through a DOM
 *    CustomEvent on `document`; every other instance dismisses itself. The
 *    bus lives on the DOM, so sibling mode packages that inline this module
 *    into their own bundles still share the one-bubble rule.
 *
 * Placement keeps upstream's geometry (right / top / bottom) but skips the
 * viewport flip-and-fit pass: the rail sits in the fixed left column and its
 * labels are short, so requested placement is always usable there.
 */
import { cloneElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FocusEventHandler, MouseEventHandler, MutableRefObject, ReactElement, Ref } from 'react'
import css from './RailTooltip.module.css'

/** Bubble placement relative to the anchor (matches upstream's vocabulary). */
export type RailTooltipSide = 'right' | 'bottom' | 'top'

/** Props RailTooltip injects into its anchor child; the child's own handlers are chained ahead of the tooltip's. */
interface AnchorProps {
  ref?: Ref<HTMLElement> | undefined
  onMouseEnter?: MouseEventHandler | undefined
  onMouseLeave?: MouseEventHandler | undefined
  onFocus?: FocusEventHandler | undefined
  onBlur?: FocusEventHandler | undefined
}

type TooltipLabel = string | (() => string)

/**
 * DOM event announcing a newly shown bubble. The detail is the showing
 * instance's id; every other instance force-dismisses. Fired on `document`
 * so inlined bundle copies share the bus.
 */
const RAIL_TOOLTIP_SHOW_EVENT = 'sdkwork:rail-tooltip:show'

/** Pointer distance beyond the anchor box that still counts as "on the anchor". */
const ANCHOR_GRACE_PX = 6

/**
 * Attach a defended hover/focus tooltip to an anchor element.
 * @param props.label - bubble text, or a resolver evaluated only while the bubble is visible.
 * @param props.side - placement relative to the anchor (default 'right').
 * @param props.delayMs - hover delay in milliseconds; keyboard focus remains immediate.
 * @param props.disabled - suppress the bubble while true; the anchor renders identically so
 * toggling never remounts it (which would cut its CSS transitions).
 * @param props.maxWidth - bubble width cap in pixels.
 * @param props.children - a single anchor element; its own ref and handlers are preserved.
 * @returns the cloned anchor plus a fixed-position bubble while hovered/focused.
 */
export function RailTooltip({ label, side = 'right', delayMs = 0, disabled = false, maxWidth, children }: {
  label: TooltipLabel
  side?: RailTooltipSide
  delayMs?: number
  disabled?: boolean
  maxWidth?: number
  children: ReactElement<AnchorProps>
}) {
  const anchor = useRef<HTMLElement | null>(null)
  // Identity for the cross-bundle singleton bus (comparison only, never shared).
  const instanceId = useRef(Symbol('sdkwork-rail-tooltip')).current
  // React 18 keeps the element's ref outside props, React 19 moved it into
  // props; read both so wrapping an anchor never severs the owner's ref.
  const childRef = (children as ReactElement<AnchorProps> & { ref?: Ref<HTMLElement> }).ref
    ?? (children.props as AnchorProps).ref
  const mergedRef = useCallback((el: HTMLElement | null) => {
    anchor.current = el
    if (typeof childRef === 'function') childRef(el)
    else if (childRef != null) (childRef as MutableRefObject<HTMLElement | null>).current = el
  }, [childRef])
  const [pos, setPos] = useState<{ x: number; top: number; bottom: number } | null>(null)
  const bubble = useRef<HTMLSpanElement | null>(null)
  const resolvedLabel = pos === null
    ? null
    : typeof label === 'function' ? label() : label
  const y = pos === null
    ? 0
    : side === 'right'
      ? pos.top + (pos.bottom - pos.top) / 2
      : side === 'top' ? pos.top - 8 : pos.bottom + 8

  // Hover and focus are independent triggers: the bubble hides only after
  // BOTH clear (hovering away from a focused anchor must not drop it).
  const triggers = useRef({ hover: false, focus: false })
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelShow = useCallback(() => {
    if (showTimer.current === null) return
    clearTimeout(showTimer.current)
    showTimer.current = null
  }, [])
  const forceDismiss = useCallback(() => {
    cancelShow()
    triggers.current = { hover: false, focus: false }
    setPos(null)
  }, [cancelShow])

  // Disabling mid-hover must drop an already-visible bubble: no mouseleave fires.
  useEffect(() => {
    if (disabled) forceDismiss()
    return cancelShow
  }, [cancelShow, disabled, forceDismiss])

  const show = useCallback(() => {
    if (disabled) return
    const el = anchor.current
    /* v8 ignore next -- the ref is attached by event time: events fire on the cloned anchor. */
    if (el === null) return
    const r = el.getBoundingClientRect()
    setPos({ x: side === 'right' ? r.right + 10 : r.left + r.width / 2, top: r.top, bottom: r.bottom })
    // Defense 3: tell every other instance (in this document, whatever bundle
    // it was inlined into) to stand down — one rail bubble at a time.
    document.dispatchEvent(new CustomEvent(RAIL_TOOLTIP_SHOW_EVENT, { detail: instanceId }))
  }, [disabled, instanceId, side])
  const showAfterHoverDelay = useCallback(() => {
    cancelShow()
    if (delayMs <= 0) {
      show()
      return
    }
    showTimer.current = setTimeout(() => {
      showTimer.current = null
      show()
    }, delayMs)
  }, [cancelShow, delayMs, show])

  // Defense 1 + 2: geometry sweep and press dismissal, while a bubble is up.
  useEffect(() => {
    if (pos === null) return
    const onMove = (event: PointerEvent): void => {
      const r = anchor.current?.getBoundingClientRect()
      if (r === undefined) return
      const onAnchor = event.clientX >= r.left - ANCHOR_GRACE_PX && event.clientX < r.right + ANCHOR_GRACE_PX
        && event.clientY >= r.top - ANCHOR_GRACE_PX && event.clientY < r.bottom + ANCHOR_GRACE_PX
      // The bubble itself has pointer-events: none, so geometry is the whole
      // truth: a pointer that left the anchor box killed the anchor hover,
      // whatever the (possibly swallowed) mouseleave said.
      if (!onAnchor) forceDismiss()
    }
    const onDown = (): void => forceDismiss()
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [forceDismiss, pos])

  // Defense 3 receiver: another instance just showed — stand down. Mounted
  // for the component's whole life so the rule also holds between hovers.
  useEffect(() => {
    const onShow = (event: Event): void => {
      if ((event as CustomEvent<unknown>).detail !== instanceId) forceDismiss()
    }
    document.addEventListener(RAIL_TOOLTIP_SHOW_EVENT, onShow)
    return () => { document.removeEventListener(RAIL_TOOLTIP_SHOW_EVENT, onShow) }
  }, [forceDismiss, instanceId])

  // Keep the bubble clear of the viewport edges (long labels near the right
  // edge would clip): slide back inside horizontally, like upstream.
  useLayoutEffect(() => {
    if (pos === null) return
    const el = bubble.current
    /* v8 ignore next -- pos is set only while the bubble is mounted. */
    if (el === null) return
    const EDGE_MARGIN = 12
    el.style.left = `${pos.x}px`
    const r = el.getBoundingClientRect()
    let dx = 0
    if (r.right > window.innerWidth - EDGE_MARGIN) dx = window.innerWidth - EDGE_MARGIN - r.right
    if (r.left + dx < EDGE_MARGIN) dx = EDGE_MARGIN - r.left
    el.style.left = `${pos.x + dx}px`
  }, [pos, resolvedLabel])

  const handleEnter: MouseEventHandler = (e) => {
    children.props.onMouseEnter?.(e)
    if (disabled) return
    triggers.current.hover = true
    showAfterHoverDelay()
  }
  const handleLeave: MouseEventHandler = (e) => {
    children.props.onMouseLeave?.(e)
    triggers.current.hover = false
    cancelShow()
    setPos(null)
  }
  const handleFocus: FocusEventHandler = (e) => {
    children.props.onFocus?.(e)
    if (disabled) return
    triggers.current.focus = true
    cancelShow()
    show()
  }
  const handleBlur: FocusEventHandler = (e) => {
    children.props.onBlur?.(e)
    triggers.current.focus = false
    forceDismiss()
  }

  return (
    <>
      {cloneElement(children, {
        ref: mergedRef,
        onMouseEnter: handleEnter,
        onMouseLeave: handleLeave,
        onFocus: handleFocus,
        onBlur: handleBlur,
      })}
      {pos !== null && (
        <span
          ref={bubble}
          className={css.bubble}
          data-side={side}
          style={{ left: pos.x, top: y, ...maxWidth === undefined ? {} : { maxWidth } }}
          role="tooltip"
        >
          {resolvedLabel}
        </span>
      )}
    </>
  )
}
