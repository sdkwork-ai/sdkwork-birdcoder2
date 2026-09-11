/**
 * The edit model's specs.
 *
 * Two halves: the input rules Excel applies to a keystroke sequence, and the
 * overlay that folds the result back over a parsed sheet. The overlay specs
 * build their own model rather than parsing a package, so a failure names the
 * overlay rather than the XML reader underneath it.
 */
import { describe, expect, it } from 'vitest'
import {
  applyCellEdits, applyWorkbookEdits, commitEdits, hasEdits, NO_EDITS, parseCellEntry, redoEdits,
  TYPED_DATE_FORMAT, undoEdits, UNDO_DEPTH,
} from '../src/client/xlsx/edits.ts'
import type { XlsxEditMap, XlsxEditSession, XlsxEntry } from '../src/client/xlsx/edits.ts'
import { dateToSerial, serialToDateParts } from '../src/client/xlsx/number-format.ts'
import type { XlsxCell, XlsxWorkbook } from '../src/client/xlsx/model.ts'
import { columnName, DEFAULT_FORMAT, makeCell, makeSheet } from './sheet-fixture.client.ts'

/** The 2024-01-15 serial in the 1900 system, read from the parser's own inverse. */
const JANUARY_15 = dateToSerial(2024, 1, 15, false)

/**
 * A batch of entries, as one commit would carry them.
 * @param reference - the first reference.
 * @param entry - the first entry.
 * @param more - further reference and entry pairs.
 * @returns the batch.
 */
function batch(
  reference: string,
  entry: XlsxEntry,
  ...more: readonly (readonly [string, XlsxEntry])[]
): XlsxEditMap {
  return new Map([[reference, entry], ...more])
}

/**
 * A cell's own formula-bar text, which is what committing it again would read.
 * @param cell - the cell to read.
 * @returns the text the formula bar holds.
 */
function barText(cell: XlsxCell): string {
  return cell.formula === undefined ? cell.raw : `=${cell.formula}`
}

describe('parseCellEntry', () => {
  it('clears on nothing typed', () => {
    expect(parseCellEntry('')).toEqual({ kind: 'empty' })
    expect(parseCellEntry('   ')).toEqual({ kind: 'empty' })
  })

  it('consumes a leading apostrophe to force text', () => {
    expect(parseCellEntry("'123")).toEqual({ kind: 'text', value: '123' })
    expect(parseCellEntry("'=A1")).toEqual({ kind: 'text', value: '=A1' })
    expect(parseCellEntry("' spaced")).toEqual({ kind: 'text', value: ' spaced' })
    expect(parseCellEntry("'")).toEqual({ kind: 'empty' })
  })

  it('reads a leading equals sign as a formula', () => {
    expect(parseCellEntry('=SUM(A1:A3)')).toEqual({ kind: 'formula', formula: 'SUM(A1:A3)' })
    expect(parseCellEntry('=A1+1')).toEqual({ kind: 'formula', formula: 'A1+1' })
    expect(parseCellEntry('= A1')).toEqual({ kind: 'formula', formula: 'A1' })
    expect(parseCellEntry('= " a"')).toEqual({ kind: 'formula', formula: '" a"' })
  })

  it('keeps a lone equals sign as text, as Excel refuses it as a formula', () => {
    expect(parseCellEntry('=')).toEqual({ kind: 'text', value: '=' })
  })

  it('reads the boolean keywords whatever their case', () => {
    expect(parseCellEntry('TRUE')).toEqual({ kind: 'boolean', value: true })
    expect(parseCellEntry('true')).toEqual({ kind: 'boolean', value: true })
    expect(parseCellEntry('False')).toEqual({ kind: 'boolean', value: false })
  })

  it('reads a plain number', () => {
    expect(parseCellEntry('42')).toEqual({ kind: 'number', value: 42 })
    expect(parseCellEntry(' 42 ')).toEqual({ kind: 'number', value: 42 })
    expect(parseCellEntry('-3.5')).toEqual({ kind: 'number', value: -3.5 })
    expect(parseCellEntry('+7')).toEqual({ kind: 'number', value: 7 })
    expect(parseCellEntry('.5')).toEqual({ kind: 'number', value: 0.5 })
    expect(parseCellEntry('5.')).toEqual({ kind: 'number', value: 5 })
  })

  it('reads a thousands-grouped number but not a misgrouped one', () => {
    expect(parseCellEntry('1,234')).toEqual({ kind: 'number', value: 1234 })
    expect(parseCellEntry('1,234,567.5')).toEqual({ kind: 'number', value: 1234567.5 })
    expect(parseCellEntry('1,23')).toEqual({ kind: 'text', value: '1,23' })
    expect(parseCellEntry('1234,567')).toEqual({ kind: 'text', value: '1234,567' })
  })

  it('reads a percent as a fraction, spaced or not', () => {
    expect(parseCellEntry('50%')).toEqual({ kind: 'number', value: 0.5 })
    expect(parseCellEntry('12.5%')).toEqual({ kind: 'number', value: 0.125 })
    expect(parseCellEntry('50 %')).toEqual({ kind: 'number', value: 0.5 })
    expect(parseCellEntry('%')).toEqual({ kind: 'text', value: '%' })
  })

  it('reads parentheses as a negative and a currency symbol as a decoration', () => {
    expect(parseCellEntry('(1,200)')).toEqual({ kind: 'number', value: -1200 })
    expect(parseCellEntry('$1.23')).toEqual({ kind: 'number', value: 1.23 })
    expect(parseCellEntry('¥500')).toEqual({ kind: 'number', value: 500 })
    expect(parseCellEntry('-$5')).toEqual({ kind: 'number', value: -5 })
    expect(parseCellEntry('$-5')).toEqual({ kind: 'number', value: -5 })
    expect(parseCellEntry('($5)')).toEqual({ kind: 'number', value: -5 })
  })

  it('reads an exponent', () => {
    expect(parseCellEntry('1e3')).toEqual({ kind: 'number', value: 1000 })
    expect(parseCellEntry('1.5E+3')).toEqual({ kind: 'number', value: 1500 })
    expect(parseCellEntry('1e')).toEqual({ kind: 'text', value: '1e' })
    // A number too large to be finite is text rather than an infinite cell.
    expect(parseCellEntry('1e999')).toEqual({ kind: 'text', value: '1e999' })
  })

  it('keeps a lone sign or separator as text', () => {
    expect(parseCellEntry('-')).toEqual({ kind: 'text', value: '-' })
    expect(parseCellEntry('+')).toEqual({ kind: 'text', value: '+' })
    expect(parseCellEntry('.')).toEqual({ kind: 'text', value: '.' })
    expect(parseCellEntry('1.2.3')).toEqual({ kind: 'text', value: '1.2.3' })
    // Grouping and an exponent do not combine in a typed entry.
    expect(parseCellEntry('1,234e3')).toEqual({ kind: 'text', value: '1,234e3' })
  })

  it('reads an unambiguous calendar date as the serial it stores', () => {
    expect(parseCellEntry('2024-01-15')).toEqual({ kind: 'number', value: JANUARY_15, format: TYPED_DATE_FORMAT })
    expect(parseCellEntry('2024/1/5')).toEqual({
      kind: 'number',
      value: dateToSerial(2024, 1, 5, false),
      format: TYPED_DATE_FORMAT,
    })
  })

  it('keeps a date the calendar does not have as text', () => {
    expect(parseCellEntry('2024-02-31')).toEqual({ kind: 'text', value: '2024-02-31' })
    expect(parseCellEntry('2024-13-01')).toEqual({ kind: 'text', value: '2024-13-01' })
    // A two-number date reads differently in every locale, so it stays text.
    expect(parseCellEntry('1/2/2024')).toEqual({ kind: 'text', value: '1/2/2024' })
  })

  it('reads the serial against the workbook date system', () => {
    expect(parseCellEntry('1904-01-01', true)).toEqual({
      kind: 'number',
      value: dateToSerial(1904, 1, 1, true),
      format: TYPED_DATE_FORMAT,
    })
  })

  it('keeps anything else as text', () => {
    expect(parseCellEntry('hello')).toEqual({ kind: 'text', value: 'hello' })
    expect(parseCellEntry('12 apples')).toEqual({ kind: 'text', value: '12 apples' })
  })
})

describe('dateToSerial', () => {
  it('inverts serialToDateParts across both date systems', () => {
    for (const date1904 of [false, true]) {
      for (const [year, month, day] of [[1900, 1, 1], [1900, 2, 28], [1900, 3, 1],
        [1999, 12, 31], [2024, 1, 15], [2024, 2, 29], [2100, 6, 1]]) {
        const parts = serialToDateParts(dateToSerial(year, month, day, date1904), date1904)
        expect([parts.year, parts.month, parts.day]).toEqual([year, month, day])
      }
    }
  })

  it('counts the 1900 phantom leap day the way the parser does', () => {
    expect(dateToSerial(1900, 1, 1, false)).toBe(1)
    expect(dateToSerial(1900, 2, 28, false)).toBe(59)
    expect(dateToSerial(1900, 3, 1, false)).toBe(61)
    expect(dateToSerial(1904, 1, 1, true)).toBe(0)
    expect(dateToSerial(1904, 1, 2, true)).toBe(1)
  })
})

describe('applyCellEdits', () => {
  it('returns the sheet itself when nothing was edited', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    expect(applyCellEdits(sheet, new Map())).toBe(sheet)
  })

  it('replaces a cell and keeps the format and link it carried', () => {
    const format = { ...DEFAULT_FORMAT, numberFormat: '0.00' }
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'old', format, { hyperlink: 'https://example.com' })] })
    const cell = applyCellEdits(sheet, batch('A1', { kind: 'number', value: 5 })).rows[0].cells[0]
    expect(cell).toMatchObject({ text: '5.00', raw: '5', kind: 'number', hyperlink: 'https://example.com' })
    expect(cell.format.numberFormat).toBe('0.00')
  })

  it('gives a cell with no predecessor the workbook default format', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    expect(applyCellEdits(sheet, batch('B1', { kind: 'text', value: 'b' })).rows[0].cells[1].format)
      .toEqual(DEFAULT_FORMAT)
  })

  it('renders a rewritten number through the format the cell states', () => {
    const format = { ...DEFAULT_FORMAT, numberFormat: '0.0%' }
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'old', format)] })
    expect(applyCellEdits(sheet, batch('A1', { kind: 'number', value: 0.5 })).rows[0].cells[0].text).toBe('50.0%')
  })

  it('writes a boolean with the keywords the parser reads back', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    expect(applyCellEdits(sheet, batch('A1', parseCellEntry('false'))).rows[0].cells[0])
      .toMatchObject({ text: 'FALSE', raw: 'FALSE', kind: 'boolean' })
    expect(applyCellEdits(sheet, batch('A1', parseCellEntry('TRUE'))).rows[0].cells[0])
      .toMatchObject({ text: 'TRUE', raw: 'TRUE', kind: 'boolean' })
  })

  it('shows an edited formula as its own source, since nothing recalculates here', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a', DEFAULT_FORMAT, { hyperlink: 'https://example.com' })] })
    expect(applyCellEdits(sheet, batch('A1', parseCellEntry('=SUM(A1:A3)'))).rows[0].cells[0]).toMatchObject({
      text: '=SUM(A1:A3)',
      raw: '',
      formula: 'SUM(A1:A3)',
      kind: 'string',
      hyperlink: 'https://example.com',
    })
  })

  it('gives a typed date the ISO form when its cell states no date format', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    const cell = applyCellEdits(sheet, batch('A1', parseCellEntry('2024-01-15'))).rows[0].cells[0]
    expect(cell).toMatchObject({
      text: '2024-01-15',
      raw: String(JANUARY_15),
      kind: 'date',
    })
    expect(cell.format.numberFormat).toBe(TYPED_DATE_FORMAT)
  })

  it('keeps the date format a cell already states', () => {
    const format = { ...DEFAULT_FORMAT, numberFormat: 'dd/mm/yyyy' }
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a', format)] })
    const cell = applyCellEdits(sheet, batch('A1', parseCellEntry('2024-01-15'))).rows[0].cells[0]
    expect(cell.text).toBe('15/01/2024')
    expect(cell.format).toBe(format)
  })

  it('formats a plain number through an inherited date format, as Excel does', () => {
    const format = { ...DEFAULT_FORMAT, numberFormat: 'yyyy-mm-dd' }
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a', format)] })
    expect(applyCellEdits(sheet, batch('A1', { kind: 'number', value: JANUARY_15 })).rows[0].cells[0])
      .toMatchObject({ text: '2024-01-15', kind: 'date' })
  })

  it('keeps text as text even under a date format', () => {
    const format = { ...DEFAULT_FORMAT, numberFormat: 'yyyy-mm-dd' }
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a', format)] })
    expect(applyCellEdits(sheet, batch('A1', { kind: 'text', value: 'later' })).rows[0].cells[0])
      .toMatchObject({ text: 'later', kind: 'string' })
  })

  it('honours the workbook date system when it places a typed serial', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    const edited = applyCellEdits(sheet, batch('A1', parseCellEntry('1904-01-02', true)), true)
    expect(edited.rows[0].cells[0].raw).toBe('1')
  })

  it('reproduces a cell from the text its own formula bar holds', () => {
    for (const text of ['42', 'TRUE', 'false', 'hello', '=A1+1', '-3.5', '50%', '2024-01-15']) {
      const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
      const first = applyCellEdits(sheet, batch('A1', parseCellEntry(text)))
      const once = first.rows[0].cells[0]
      const again = applyCellEdits(first, batch('A1', parseCellEntry(barText(once))))
      expect(again.rows[0].cells[0]).toEqual(once)
    }
  })

  it('clears a cell without disturbing its row', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a'), makeCell(1, 0, 'b')] })
    const edited = applyCellEdits(sheet, batch('A1', { kind: 'empty' }))
    expect(edited.rows[0].cells.map(cell => cell.reference)).toEqual(['B1'])
  })

  it('inserts a new cell into its row in column order', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a'), makeCell(2, 0, 'c')] })
    const edited = applyCellEdits(sheet, batch('B1', { kind: 'text', value: 'b' }))
    expect(edited.rows[0].cells.map(cell => cell.reference)).toEqual(['A1', 'B1', 'C1'])
    expect(edited.rows[0].cells[1].text).toBe('b')
  })

  it('inserts several new cells into a row at once, in column order', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    const edited = applyCellEdits(sheet, batch('D1', { kind: 'text', value: 'd' }, ['C1', { kind: 'text', value: 'c' }]))
    expect(edited.rows[0].cells.map(cell => cell.reference)).toEqual(['A1', 'C1', 'D1'])
  })

  it('creates the rows an edit reaches past the parsed ones', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    const edited = applyCellEdits(sheet, batch('A5', { kind: 'text', value: 'x' }))
    expect(edited.rows.map(row => row.index)).toEqual([0, 4])
    expect(edited.rows[1].cells[0].reference).toBe('A5')
    expect(edited.rows[1].height).toBe(sheet.defaultRowHeight)
    expect(edited.extent.rows).toBe(4)
  })

  it('clears a position that never held a cell without adding one', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    const edited = applyCellEdits(sheet, batch('C1', { kind: 'empty' }))
    expect(edited.rows[0].cells.map(cell => cell.reference)).toEqual(['A1'])
    expect(edited.extent.columns).toBe(0)
  })

  it('creates no row when the edit that reached it clears it again', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    expect(applyCellEdits(sheet, batch('A5', { kind: 'empty' })).rows.map(row => row.index)).toEqual([0])
  })

  it('places the cells of a new row in column order', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    const edited = applyCellEdits(sheet, batch('D5', { kind: 'text', value: 'd' }, ['B5', { kind: 'text', value: 'b' }]))
    expect(edited.rows[1].cells.map(cell => cell.reference)).toEqual(['B5', 'D5'])
  })

  it('keeps the rows in order when an edit adds one in the middle', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a'), makeCell(0, 4, 'e')] })
    expect(applyCellEdits(sheet, batch('A3', { kind: 'text', value: 'c' })).rows.map(row => row.index))
      .toEqual([0, 2, 4])
  })

  it('widens the extent, and the index the grid walks, past the used range', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    const edited = applyCellEdits(sheet, batch(`${columnName(1024)}1`, { kind: 'text', value: 'x' }))
    expect(edited.extent.columns).toBe(1024)
    // The index never walks fewer positions than the grid's own floor; the edit
    // pushes the walk past it.
    expect(edited.index2d.columns).toHaveLength(1025)
    expect(edited.index2d.columns.at(-1)).toBe(1024)
    expect(edited.index2d.columnPosition.get(1024)).toBe(1024)
  })

  it('widens the row index the grid walks', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    const edited = applyCellEdits(sheet, batch('A5001', { kind: 'text', value: 'x' }))
    expect(edited.extent.rows).toBe(5000)
    expect(edited.index2d.rows).toHaveLength(5001)
    expect(edited.index2d.rowPosition.get(5000)).toBe(5000)
  })

  it('keeps a merge region inside the extent even when the edit is narrower', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')], merges: [{ top: 0, left: 0, bottom: 0, right: 5 }] })
    expect(applyCellEdits(sheet, batch('A1', { kind: 'text', value: 'x' })).extent.columns).toBe(5)
  })

  it('drops an edit no grid can draw', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')], columns: 0, rows: 0 })
    const outOfRange = applyCellEdits(sheet, batch(
      `${columnName(16_384)}1`, { kind: 'text', value: 'x' },
      ['A1048577', { kind: 'text', value: 'y' }],
    ))
    expect(outOfRange.rows).toEqual(sheet.rows)
    expect(outOfRange.extent).toEqual(sheet.extent)
    // Neither the extent nor the virtual index may be sized from an entry the
    // grid would never reach, or a malformed edit could lay out a million rows.
    expect(outOfRange.index2d.columns).toHaveLength(1024)
    expect(outOfRange.index2d.rows).toHaveLength(4096)
  })

  it('drops an edit whose reference does not parse', () => {
    const sheet = makeSheet({ cells: [makeCell(0, 0, 'a')] })
    expect(applyCellEdits(sheet, batch('not-a-reference', { kind: 'text', value: 'x' })).rows).toEqual(sheet.rows)
  })

  it('carries the sheet geometry and view through untouched', () => {
    const sheet = makeSheet({
      cells: [makeCell(0, 0, 'a')],
      columnWidths: new Map([[0, 120]]),
      rowHeights: new Map([[0, 30]]),
      freeze: { rows: 2, columns: 1 },
      showGridLines: false,
      zoomScale: 1.5,
    })
    const edited = applyCellEdits(sheet, batch('A1', { kind: 'text', value: 'x' }))
    expect(edited.columnWidths).toBe(sheet.columnWidths)
    expect(edited.rowHeights).toBe(sheet.rowHeights)
    expect(edited.freeze).toEqual({ rows: 2, columns: 1 })
    expect(edited.showGridLines).toBe(false)
    expect(edited.zoomScale).toBe(1.5)
    expect(edited.rowMap.get(0)).toBe(edited.rows[0])
  })
})

describe('applyWorkbookEdits', () => {
  const first = makeSheet({ cells: [makeCell(0, 0, 'a')] })
  const second = { ...makeSheet({ cells: [makeCell(0, 0, 'b')], partName: 'xl/worksheets/sheet2.xml' }), index: 2 }
  const workbook: XlsxWorkbook = { sheets: [first, second], date1904: false }

  it('returns the workbook itself when nothing was edited', () => {
    expect(applyWorkbookEdits(workbook, new Map())).toBe(workbook)
  })

  it('overlays only the sheets that carry an edit', () => {
    const edited = applyWorkbookEdits(workbook, new Map([[1, batch('A1', { kind: 'text', value: 'x' })]]))
    expect(edited.sheets[0].rows[0].cells[0].text).toBe('x')
    expect(edited.sheets[0]).not.toBe(first)
    expect(edited.sheets[1]).toBe(second)
    expect(edited.date1904).toBe(false)
  })

  it('passes the workbook date system down to the overlay', () => {
    const dated: XlsxWorkbook = { sheets: [first], date1904: true }
    const edited = applyWorkbookEdits(dated, new Map([[1, batch('A1', parseCellEntry('1904-01-02', true))]]))
    expect(edited.sheets[0].rows[0].cells[0].raw).toBe('1')
  })
})

describe('the edit session', () => {
  it('starts with nothing in force and nothing to save', () => {
    expect(NO_EDITS.present.size).toBe(0)
    expect(NO_EDITS.past).toEqual([])
    expect(NO_EDITS.future).toEqual([])
    expect(hasEdits(NO_EDITS)).toBe(false)
  })

  it('keeps the session itself when an empty batch arrives', () => {
    expect(commitEdits(NO_EDITS, 1, new Map())).toBe(NO_EDITS)
  })

  it('records a batch per sheet and reports it as work to save', () => {
    const two = commitEdits(commitEdits(NO_EDITS, 1, batch('A1', { kind: 'text', value: 'a' })), 2, batch('B2', { kind: 'text', value: 'b' }))
    expect(two.present.get(1)?.get('A1')).toEqual({ kind: 'text', value: 'a' })
    expect(two.present.get(2)?.get('B2')).toEqual({ kind: 'text', value: 'b' })
    expect(hasEdits(two)).toBe(true)
  })

  it('merges a second batch into a sheet that already carries one', () => {
    const one = commitEdits(NO_EDITS, 1, batch('A1', { kind: 'text', value: 'a' }))
    const two = commitEdits(one, 1, batch('B1', { kind: 'text', value: 'b' }))
    expect([...(two.present.get(1)?.keys() ?? [])]).toEqual(['A1', 'B1'])
  })

  it('holds a session unchanged when there is nothing to step through', () => {
    expect(undoEdits(NO_EDITS)).toBe(NO_EDITS)
    expect(redoEdits(NO_EDITS)).toBe(NO_EDITS)
  })

  it('steps back and forward through the log', () => {
    const edited = commitEdits(NO_EDITS, 1, batch('A1', { kind: 'text', value: 'a' }))
    const undone = undoEdits(edited)
    expect(hasEdits(undone)).toBe(false)
    expect(undone.future).toHaveLength(1)
    const redone = redoEdits(undone)
    expect(redone.present.get(1)?.get('A1')).toEqual({ kind: 'text', value: 'a' })
    expect(redone.future).toEqual([])
  })

  it('drops the redo history once a new edit lands, as Excel does', () => {
    const undone = undoEdits(commitEdits(NO_EDITS, 1, batch('A1', { kind: 'text', value: 'a' })))
    expect(undone.future).toHaveLength(1)
    expect(commitEdits(undone, 1, batch('A1', { kind: 'text', value: 'b' })).future).toEqual([])
  })

  it('bounds the history to its own depth', () => {
    let session: XlsxEditSession = NO_EDITS
    for (let step = 0; step < UNDO_DEPTH + 5; step += 1) {
      session = commitEdits(session, 1, batch(`A${step + 1}`, { kind: 'number', value: step }))
    }
    expect(session.past).toHaveLength(UNDO_DEPTH)
  })
})
