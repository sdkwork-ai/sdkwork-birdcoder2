/**
 * Build progress read off a running command's own output.
 *
 * The host stream carries no progress channel — only `started`, `output` and
 * `exit` frames — so the only progress signal that exists is what the tool
 * itself prints. This module mines it, best-effort:
 *
 *  - Last-percent-wins, and only when the percentage is the line's **trailing
 *    token** (`Packaging   45%`), so prose that merely mentions a figure
 *    (`50% of users…`) never moves the bar.
 *  - A `[done/total]` step marker counts too (`[3/10] Bundling…`), which is
 *    what several bundlers print instead of a percentage. The marker is read
 *    at either end of the line: bundlers lead with it, tools that finish a
 *    phase trail with it.
 *
 * A tool that prints neither yields `null` and the UI shows an indeterminate
 * bar rather than a fabricated number.
 */

/**
 * A percentage that ends its line, allowing trailing punctuation only.
 * `/u` plus the explicit class keeps the match anchored to the line's own tail.
 */
const TRAILING_PERCENT = /(\d{1,3})\s*%\s*[\])}.,;:·…—–-]*\s*$/u

/** A `[done/total]` step marker at the head of a line. */
const LEADING_COUNTER = /^\s*\[\s*(\d+)\s*\/\s*(\d+)\s*\]/u

/** A `[done/total]` step marker that ends its line. */
const TRAILING_COUNTER = /\[\s*(\d+)\s*\/\s*(\d+)\s*\]\s*[\])}.,;:·…—–-]*\s*$/u

/**
 * Best-effort completion percentage of one output line.
 *
 * Both patterns are end-anchored, so on a line carrying several figures the
 * scan settles on the trailing one — regex matching starts at index 0 and only
 * the last position satisfies the anchor. That is what makes a new phase
 * printing its own `0%` reset the bar instead of leaving the previous `100%`
 * stuck on screen.
 *
 * @param text - one decoded output line, without its newline.
 * @returns a percentage in `[0, 100]`, or null when the line carries no signal.
 */
export function percentFromLine(text: string): number | null {
  const percent = TRAILING_PERCENT.exec(text)
  if (percent !== null) {
    const value = Number(percent[1])
    // Out-of-range figures (a tool printing `120%`) are not progress; fall
    // through so a step counter on the same line still gets its chance.
    if (value >= 0 && value <= 100) return value
  }
  const counter = LEADING_COUNTER.exec(text) ?? TRAILING_COUNTER.exec(text)
  if (counter !== null) {
    const done = Number(counter[1])
    const total = Number(counter[2])
    // `total === 0` is a divisor, and `done > total` is a tool counting
    // something other than steps (a byte total drifting past its estimate).
    if (total > 0 && done <= total) return Math.round((done / total) * 100)
  }
  return null
}

/**
 * Fold one batch of output lines into the completion seen so far.
 *
 * Lines are scanned in order and the **last** one carrying a signal wins, so a
 * batch containing a phase change reports the new phase's figure.
 *
 * @param lines - decoded text of the batch, in arrival order.
 * @param previous - completion already on record, or null when none was.
 * @returns the new completion, or `previous` when the batch carried no signal.
 */
export function percentOfLines(lines: readonly string[], previous: number | null): number | null {
  let seen = previous
  for (const line of lines) {
    const percent = percentFromLine(line)
    if (percent !== null) seen = percent
  }
  return seen
}
