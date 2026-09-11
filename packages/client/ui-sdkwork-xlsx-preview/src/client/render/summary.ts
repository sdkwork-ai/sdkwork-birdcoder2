/**
 * The status bar's readout of a selection.
 *
 * Excel and WPS print the same three facts under the grid whenever the
 * selection carries numbers — average, count, and sum — plus a bare count when
 * it carries text. Computing them walks the sheet's *populated* rows rather
 * than its laid-out positions, so selecting a whole 1024-column sheet costs one
 * pass over the cells the file actually wrote.
 */
import type { XlsxSheet } from '../xlsx/model.ts'
import { selectionBounds } from './selection.ts'
import type { GridSelection } from './selection.ts'

/** What the status bar reports about a selection. */
export interface SelectionSummary {
  /** Non-empty cells the selection covers. */
  readonly count: number
  /** Cells the selection covers that hold a number or a date. */
  readonly numericCount: number
  /**
   * The total and the mean of the numeric cells.
   *
   * Present exactly when the selection holds a number, so a reader of this
   * value never has to test two independent flags and never has to invent a
   * zero for a total that does not exist.
   */
  readonly totals?: { readonly sum: number; readonly average: number }
}

/**
 * Summarise the cells a selection covers.
 * @param sheet - the sheet to read.
 * @param selection - the selection to summarise.
 * @returns the counts and the two numeric facts.
 */
export function selectionSummary(sheet: XlsxSheet, selection: GridSelection): SelectionSummary {
  const bounds = selectionBounds(selection)
  let count = 0
  let numericCount = 0
  let sum = 0
  for (const row of sheet.rows) {
    if (row.index < bounds.top || row.index > bounds.bottom) continue
    for (const cell of row.cells) {
      if (cell.column < bounds.left || cell.column > bounds.right) continue
      count += 1
      // A date is a serial number, so Excel sums it as one; a boolean is not a
      // number in a total and is left out.
      if (cell.kind !== 'number' && cell.kind !== 'date') continue
      const value = Number(cell.raw)
      if (!Number.isFinite(value)) continue
      numericCount += 1
      sum += value
    }
  }
  return {
    count,
    numericCount,
    ...(numericCount === 0 ? {} : { totals: { sum, average: sum / numericCount } }),
  }
}

/**
 * Print a number the way a spreadsheet's status bar does: grouped thousands,
 * no trailing zeroes, and never more than four decimals.
 * @param value - the value to print.
 * @returns the formatted text.
 */
export function formatSummary(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 1e4) / 1e4
  const text = Math.abs(rounded).toString()
  // Splitting on a separator the value may not have would leave a `string`
  // standing in for a missing part, so the decimal point is located instead.
  const point = text.indexOf('.')
  const whole = (point === -1 ? text : text.slice(0, point)).replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  const fraction = point === -1 ? '' : text.slice(point)
  return `${rounded < 0 ? '-' : ''}${whole}${fraction}`
}
