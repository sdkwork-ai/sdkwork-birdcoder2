// @vitest-environment jsdom
/**
 * RailTooltip spec — the fork-owned defended tooltip for the rail entries.
 *
 * Doubles as the upstream-merge sentinel: these tests pin the three defenses
 * (geometry sweep, press dismissal, cross-bundle singleton) that upstream
 * `Tooltip` deliberately does not have. If a merge rewires the entries back
 * onto upstream `Tooltip` or drops the defenses, this suite goes red and the
 * merge checklist says re-apply.
 *
 * The geometry-sweep case is the one real browsers need and jsdom usually
 * hides: a bubble stays visible after a remount/move swallows mouseleave,
 * and only a document-level pointermove can notice the pointer is gone.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RailTooltip } from '../src/client/RailTooltip.tsx'

afterEach(cleanup)

describe('RailTooltip', () => {
  it('shows on hover after the delay and hides on mouse leave (baseline)', () => {
    vi.useFakeTimers()
    try {
      render(
        <RailTooltip label="Drive mode" delayMs={500}>
          <button type="button">anchor</button>
        </RailTooltip>,
      )
      const anchor = screen.getByText('anchor')
      fireEvent.mouseEnter(anchor)
      act(() => { vi.advanceTimersByTime(499) })
      expect(screen.queryByRole('tooltip')).toBeNull()
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.getByRole('tooltip').textContent).toBe('Drive mode')
      fireEvent.mouseLeave(anchor)
      expect(screen.queryByRole('tooltip')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows immediately on keyboard focus without the hover delay', () => {
    render(
      <RailTooltip label="Drive mode" delayMs={500}>
        <button type="button">anchor</button>
      </RailTooltip>,
    )
    const anchor = screen.getByText('anchor')
    fireEvent.focus(anchor)
    expect(screen.getByRole('tooltip').textContent).toBe('Drive mode')
    fireEvent.blur(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('force-dismisses when the pointer is detected outside the anchor without any mouseleave', () => {
    // The stuck-bubble scenario: the anchor moves/remounts under a stationary
    // pointer, the browser swallows mouseleave, and only the geometry sweep
    // can notice the pointer is gone.
    vi.useFakeTimers()
    try {
      render(
        <RailTooltip label="Drive mode" delayMs={500}>
          <button type="button">anchor</button>
        </RailTooltip>,
      )
      fireEvent.mouseEnter(screen.getByText('anchor'))
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByRole('tooltip')).not.toBeNull()
      // No mouseLeave fires — just a document pointermove far from the anchor
      // (jsdom rects are all-zero, so any coordinate beyond the grace margin
      // is "outside").
      act(() => {
        fireEvent.pointerMove(document, { clientX: 500, clientY: 500 })
      })
      expect(screen.queryByRole('tooltip')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the bubble while the pointer stays within the anchor grace margin', () => {
    vi.useFakeTimers()
    try {
      render(
        <RailTooltip label="Drive mode" delayMs={0}>
          <button type="button">anchor</button>
        </RailTooltip>,
      )
      fireEvent.mouseEnter(screen.getByText('anchor'))
      expect(screen.getByRole('tooltip')).not.toBeNull()
      act(() => {
        // jsdom rects are zero-size at 0,0; a coordinate inside the grace
        // margin must NOT dismiss.
        fireEvent.pointerMove(document, { clientX: 2, clientY: 2 })
      })
      expect(screen.getByRole('tooltip')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dismisses on any document pointerdown (press dismissal)', () => {
    vi.useFakeTimers()
    try {
      render(
        <RailTooltip label="Drive mode" delayMs={0}>
          <button type="button">anchor</button>
        </RailTooltip>,
      )
      fireEvent.mouseEnter(screen.getByText('anchor'))
      expect(screen.getByRole('tooltip')).not.toBeNull()
      act(() => {
        fireEvent.pointerDown(document.body)
      })
      expect(screen.queryByRole('tooltip')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('enforces one bubble at a time across instances (the cross-bundle rule)', () => {
    vi.useFakeTimers()
    try {
      render(
        <>
          <RailTooltip label="First" delayMs={0}>
            <button type="button">first-anchor</button>
          </RailTooltip>
          <RailTooltip label="Second" delayMs={0}>
            <button type="button">second-anchor</button>
          </RailTooltip>
        </>,
      )
      fireEvent.mouseEnter(screen.getByText('first-anchor'))
      expect(screen.getByRole('tooltip').textContent).toBe('First')
      // Hovering the second entry must stand the first bubble down — even if
      // the first instance never received a mouseleave (the real-browser
      // swallow case), and across bundle copies (DOM event bus).
      fireEvent.mouseEnter(screen.getByText('second-anchor'))
      const bubbles = screen.getAllByRole('tooltip')
      expect(bubbles).toHaveLength(1)
      expect(bubbles[0]?.textContent).toBe('Second')
    } finally {
      vi.useRealTimers()
    }
  })

  it('suppresses the bubble entirely while disabled and keeps the anchor mounted', () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(
        <RailTooltip label="Drive mode" delayMs={0} disabled>
          <button type="button">anchor</button>
        </RailTooltip>,
      )
      fireEvent.mouseEnter(screen.getByText('anchor'))
      expect(screen.queryByRole('tooltip')).toBeNull()
      // Disabling mid-hover drops an already-visible bubble.
      rerender(
        <RailTooltip label="Drive mode" delayMs={0}>
          <button type="button">anchor</button>
        </RailTooltip>,
      )
      fireEvent.mouseEnter(screen.getByText('anchor'))
      expect(screen.getByRole('tooltip')).not.toBeNull()
      rerender(
        <RailTooltip label="Drive mode" delayMs={0} disabled>
          <button type="button">anchor</button>
        </RailTooltip>,
      )
      expect(screen.queryByRole('tooltip')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves lazy labels only while the bubble is visible', () => {
    vi.useFakeTimers()
    try {
      const label = vi.fn(() => 'Resolved')
      render(
        <RailTooltip label={label} delayMs={500}>
          <button type="button">anchor</button>
        </RailTooltip>,
      )
      expect(label).not.toHaveBeenCalled()
      fireEvent.mouseEnter(screen.getByText('anchor'))
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByRole('tooltip').textContent).toBe('Resolved')
      expect(label).toHaveBeenCalledOnce()
      fireEvent.mouseLeave(screen.getByText('anchor'))
      expect(screen.queryByRole('tooltip')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
