/** Reference clock for the relative "time remaining" text of the task list. */
import { useEffect, useState } from 'react'

/**
 * Refresh period for relative-time text.
 *
 * The text names whole seconds, minutes, hours, or days, so a half-minute period
 * keeps it correct to its own granularity without re-rendering a mounted page on
 * every frame.
 */
export const RELATIVE_CLOCK_PERIOD_MS = 30_000

/**
 * Current epoch milliseconds, re-sampled on a fixed period.
 *
 * A relative duration is read against the moment it renders, not against the
 * moment its component mounted: a page left open across a delivery would keep
 * showing the time until the previous target.
 * @param periodMs - refresh period; defaults to {@link RELATIVE_CLOCK_PERIOD_MS}.
 * @returns epoch milliseconds, updated once per period.
 */
export function useRelativeClock(periodMs: number = RELATIVE_CLOCK_PERIOD_MS): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()) }, periodMs)
    return () => { clearInterval(timer) }
  }, [periodMs])
  return now
}
