// @vitest-environment jsdom
/**
 * Relative clock spec: the shared ticking reference the task rows read their
 * remaining time against. It samples the clock at mount, re-samples once per
 * period (the documented default, or the period a caller names), and stops
 * ticking when its component unmounts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { RELATIVE_CLOCK_PERIOD_MS, useRelativeClock } from '../src/client/relative-clock.ts'

const AT = Date.parse('2026-10-01T00:00:00.000Z')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useRelativeClock', () => {
  it('samples the clock at mount and re-samples it once per default period', () => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    const view = renderHook(() => useRelativeClock())
    expect(view.result.current).toBe(AT)

    // Advancing the timers moves the mocked clock with them, so the interval
    // samples the instant one period after mount.
    act(() => { vi.advanceTimersByTime(RELATIVE_CLOCK_PERIOD_MS) })
    expect(view.result.current).toBe(AT + RELATIVE_CLOCK_PERIOD_MS)
  })

  it('reads the period a caller names instead of the default', () => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    const view = renderHook(() => useRelativeClock(1_000))

    // The default period has not elapsed, so the first sample stands.
    act(() => { vi.advanceTimersByTime(999) })
    expect(view.result.current).toBe(AT)

    act(() => { vi.advanceTimersByTime(1) })
    expect(view.result.current).toBe(AT + 1_000)
  })

  it('stops ticking once its component unmounts', () => {
    vi.useFakeTimers()
    vi.setSystemTime(AT)
    const view = renderHook(() => useRelativeClock(1_000))
    const mounted = view.result.current

    view.unmount()
    vi.setSystemTime(AT + 60_000)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(view.result.current).toBe(mounted)
  })
})
