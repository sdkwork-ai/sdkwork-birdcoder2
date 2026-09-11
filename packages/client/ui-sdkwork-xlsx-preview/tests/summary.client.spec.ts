// @vitest-environment jsdom
/**
 * The status bar's readout: what a selection sums to, and how it prints.
 *
 * The readout is the one place a reader can see a total without typing a
 * formula, so the two things that matter are which cells it counts — a date is
 * a number, a boolean is not — and that a whole-sheet selection costs one pass
 * over the populated rows rather than over the grid's empty tail.
 */
import { describe, expect, it } from 'vitest'
import { formatSummary, selectionSummary } from '../src/client/render/summary.ts'
import type { GridSelection } from '../src/client/render/selection.ts'
import { DEFAULT_FORMAT, makeCell, makeSheet } from './sheet-fixture.client.ts'

/** A cell selection over one rectangle. */
function range(top: number, left: number, bottom: number, right: number): GridSelection {
  return { anchor: { column: left, row: top }, focus: { column: right, row: bottom }, kind: 'cell' }
}

/** The sheet the summary specs read. */
function sheet() {
  return makeSheet({
    columns: 3,
    rows: 3,
    cells: [
      makeCell(0, 0, 'Product'),
      makeCell(1, 0, 'Total'),
      makeCell(0, 1, 'Chair'),
      makeCell(1, 1, '1899', DEFAULT_FORMAT, { raw: '1899', kind: 'number' }),
      makeCell(2, 1, '34', DEFAULT_FORMAT, { raw: '34', kind: 'number' }),
      makeCell(0, 2, 'Desk'),
      makeCell(1, 2, '2699', DEFAULT_FORMAT, { raw: '2699', kind: 'number' }),
      makeCell(2, 2, '18', DEFAULT_FORMAT, { raw: '18', kind: 'number' }),
    ],
  })
}

describe('selectionSummary', () => {
  it('counts every non-empty cell and totals only the numbers', () => {
    const summary = selectionSummary(sheet(), range(0, 0, 2, 2))
    expect(summary.count).toBe(8)
    expect(summary.numericCount).toBe(4)
    expect(summary.totals).toEqual({ sum: 4650, average: 1162.5 })
  })

  it('reports no total for a selection that holds no numbers', () => {
    const summary = selectionSummary(sheet(), range(0, 0, 0, 0))
    expect(summary).toEqual({ count: 1, numericCount: 0 })
    expect(summary.totals).toBeUndefined()
  })

  it('leaves a numeric cell whose stored text is not a number out of the total', () => {
    // A workbook can state a numeric type and still write something the reader
    // cannot add — the cached text of a cell that failed to calculate.
    const damaged = makeSheet({
      columns: 0,
      rows: 1,
      cells: [
        makeCell(0, 0, '#VALUE!', DEFAULT_FORMAT, { raw: '#VALUE!', kind: 'number' }),
        makeCell(0, 1, '7', DEFAULT_FORMAT, { raw: '7', kind: 'number' }),
      ],
    })
    expect(selectionSummary(damaged, range(0, 0, 1, 0))).toEqual({
      count: 2,
      numericCount: 1,
      totals: { sum: 7, average: 7 },
    })
  })

  it('reads an empty stored value as the zero it is', () => {
    // `Number('')` is zero, so a numeric cell with nothing stored still adds.
    const blank = makeSheet({
      columns: 0,
      rows: 0,
      cells: [makeCell(0, 0, '', DEFAULT_FORMAT, { raw: '', kind: 'number' })],
    })
    expect(selectionSummary(blank, range(0, 0, 0, 0))).toEqual({ count: 1, numericCount: 1, totals: { sum: 0, average: 0 } })
  })

  it('sums a date as the serial number it is stored as', () => {
    const dated = makeSheet({
      columns: 0,
      rows: 1,
      cells: [
        makeCell(0, 0, '2026-09-11', DEFAULT_FORMAT, { raw: '46265', kind: 'date' }),
        makeCell(0, 1, '1', DEFAULT_FORMAT, { raw: '1', kind: 'date' }),
      ],
    })
    expect(selectionSummary(dated, range(0, 0, 1, 0)).totals?.sum).toBe(46266)
  })

  it('leaves a boolean out of the total but counts it', () => {
    const flags = makeSheet({
      columns: 0,
      rows: 1,
      cells: [
        makeCell(0, 0, 'TRUE', DEFAULT_FORMAT, { raw: '1', kind: 'boolean' }),
        makeCell(0, 1, '5', DEFAULT_FORMAT, { raw: '5', kind: 'number' }),
      ],
    })
    expect(selectionSummary(flags, range(0, 0, 1, 0))).toEqual({
      count: 2,
      numericCount: 1,
      totals: { sum: 5, average: 5 },
    })
  })

  it('reads a whole sheet in one pass over the populated rows', () => {
    const wide = makeSheet({
      columns: 1,
      rows: 2,
      cells: [
        makeCell(0, 0, '1', DEFAULT_FORMAT, { raw: '1', kind: 'number' }),
        makeCell(1, 2, '4', DEFAULT_FORMAT, { raw: '4', kind: 'number' }),
      ],
    })
    // The grid lays out a tail of thousands of empty rows; the summary walks the
    // rows the workbook wrote, so the empty ones cost nothing and contribute
    // nothing.
    expect(selectionSummary(wide, { anchor: { column: 0, row: 0 }, focus: { column: 1, row: 2 }, kind: 'sheet' }))
      .toEqual({ count: 2, numericCount: 2, totals: { sum: 5, average: 2.5 } })
  })

  it('keeps a row and a column selection to the rectangle it covers', () => {
    const book = sheet()
    expect(selectionSummary(book, { anchor: { column: 1, row: 0 }, focus: { column: 1, row: 2 }, kind: 'column' }).count).toBe(3)
    expect(selectionSummary(book, { anchor: { column: 0, row: 1 }, focus: { column: 2, row: 1 }, kind: 'row' }).count).toBe(3)
  })
})

describe('formatSummary', () => {
  it('groups thousands and drops trailing zeroes', () => {
    expect(formatSummary(483730)).toBe('483,730')
    expect(formatSummary(1162.5)).toBe('1,162.5')
    expect(formatSummary(-1234.25)).toBe('-1,234.25')
    expect(formatSummary(0)).toBe('0')
  })

  it('never prints more than four decimals', () => {
    expect(formatSummary(1 / 3)).toBe('0.3333')
    expect(formatSummary(2 / 3)).toBe('0.6667')
  })

  it('refuses to print a value that is not a number', () => {
    expect(formatSummary(Number.NaN)).toBe('—')
    expect(formatSummary(Number.POSITIVE_INFINITY)).toBe('—')
  })
})
