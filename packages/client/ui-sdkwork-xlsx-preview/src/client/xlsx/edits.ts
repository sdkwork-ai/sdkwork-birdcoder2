/**
 * Edits a reader makes to a worksheet, and how they overlay the parsed model.
 *
 * Excel turns a keystroke sequence into one of five things — a formula, a
 * number, a boolean, text, or nothing — and the parsed model already names all
 * five. `parseCellEntry` applies those input rules, and `applyCellEdits` folds
 * the result back over a parsed sheet, so the grid and a saved copy both read a
 * model they already understand and no second rendering path can drift from
 * the first.
 *
 * An edit is held per sheet and per A1 reference, and always records the *final*
 * state of that cell rather than a delta: retyping replaces the entry, and
 * clearing replaces it with `empty`. Undo therefore costs one extra copy of the
 * log rather than an inverse operation, which is what makes the history cheap
 * to keep and impossible to desynchronize.
 */
import { gridLength, MIN_GRID_COLUMNS, MIN_GRID_ROWS, visibleColumns, visibleRows } from '../render/geometry.ts'
import { MAX_COLUMN_COUNT, MAX_ROW_COUNT } from './excel.ts'
import { dateToSerial, formatCellValue, isDateFormat } from './number-format.ts'
import { DEFAULT_CELL_FORMAT } from './styles.ts'
import { columnName, parseReference } from './workbook.ts'
import type { XlsxCell, XlsxCellFormat, XlsxCellKind, XlsxRow, XlsxSheet, XlsxWorkbook } from './model.ts'

/**
 * What a typed entry means once Excel's input rules are applied.
 *
 * `empty` is a real entry rather than an absent one: clearing a cell is an edit
 * like any other, and it has to be distinguishable from a cell nobody touched
 * so saving can remove it.
 */
export type XlsxEntry =
  | { readonly kind: 'empty' }
  /** A stored number, which a date entry also is: its serial counts as one. */
  | { readonly kind: 'number'; readonly value: number; readonly format?: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'formula'; readonly formula: string }

/** The edits in force on one sheet, keyed by A1 reference. */
export type XlsxEditMap = ReadonlyMap<string, XlsxEntry>

/** The edits in force across a workbook, keyed by each sheet's own 1-based index. */
export type XlsxEditLog = ReadonlyMap<number, XlsxEditMap>

/**
 * The number format a typed date takes when its cell states no date format.
 *
 * A cell that already formats a date keeps its own code, exactly as Excel keeps
 * the format of the cell a value is typed into.
 */
export const TYPED_DATE_FORMAT = 'yyyy-mm-dd'

/** A leading sign and currency symbol, in either order, as `-$5` or `$-5`. */
/** A currency symbol a typed number may carry, which only decorates it. */
const CURRENCY = /^[$¥€£￥]/u

/** Digits grouped in threes with an optional fraction, as `1,234,567.5`. */
const GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/u

/** A number body: digits, an optional fraction, and an optional exponent. */
const NUMERIC = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu

/** An unambiguous calendar date. Locale-ambiguous forms stay text. */
const CALENDAR_DATE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/u

/**
 * Split a typed number's leading sign and currency symbol from its body.
 *
 * A sign and a currency symbol may lead in either order, as `-$5` or `$-5`, so
 * the symbol is stripped on both sides of the sign.
 * @param body - the entry body.
 * @returns the remaining body, and whether the entry negates.
 */
function leadingMarks(body: string): { readonly rest: string; readonly negative: boolean } {
  const afterCurrency = body.replace(CURRENCY, '')
  const negative = afterCurrency.startsWith('-')
  const afterSign = negative || afterCurrency.startsWith('+') ? afterCurrency.slice(1) : afterCurrency
  return { rest: afterSign.replace(CURRENCY, ''), negative }
}

/**
 * Read a typed entry as a number, with the conventions Excel accepts.
 *
 * Parentheses negate, a currency symbol and a sign may lead in either order,
 * thousands may group, and a trailing percent divides by a hundred — so `(1,200)`
 * is -1200 and `50%` is 0.5.
 * @param text - the trimmed entry.
 * @returns the value, or undefined when the entry is not a number.
 */
function numberEntry(text: string): number | undefined {
  let body = text
  let negative = false
  if (body.startsWith('(') && body.endsWith(')')) {
    negative = true
    body = body.slice(1, -1)
  }
  const marks = leadingMarks(body)
  body = marks.rest
  if (marks.negative) negative = !negative
  let percent = false
  if (body.endsWith('%')) {
    percent = true
    body = body.slice(0, -1).trimEnd()
  }
  if (body.includes(',')) {
    if (!GROUPED.test(body)) return undefined
    body = body.replaceAll(',', '')
  }
  if (!NUMERIC.test(body)) return undefined
  const value = Number(body)
  if (!Number.isFinite(value)) return undefined
  const signed = negative ? -value : value
  return percent ? signed / 100 : signed
}

/**
 * Read a typed entry as a calendar date.
 *
 * Only the unambiguous forms are recognised, because a two-number date reads
 * differently in every locale and guessing would silently change what a reader
 * meant. A date the month does not have stays text rather than rolling over.
 * @param text - the trimmed entry.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the serial number, or undefined when the entry is not a date.
 */
function dateEntry(text: string, date1904: boolean): number | undefined {
  const match = CALENDAR_DATE.exec(text)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) return undefined
  return dateToSerial(year, month, day, date1904)
}

/**
 * Interpret one typed entry the way Excel does.
 *
 * A leading apostrophe forces text and is consumed, a leading equals sign makes
 * a formula, `TRUE` and `FALSE` are booleans, and everything else is tried as a
 * number, then as a date, then kept as text.
 * @param text - exactly what the editor holds.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the entry to store; `empty` when nothing was typed.
 */
export function parseCellEntry(text: string, date1904 = false): XlsxEntry {
  if (text.startsWith("'")) {
    const forced = text.slice(1)
    return forced === '' ? { kind: 'empty' } : { kind: 'text', value: forced }
  }
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'empty' }
  if (trimmed.startsWith('=')) {
    // Excel refuses a lone `=`; with no body there is no formula to store.
    return trimmed.length === 1
      ? { kind: 'text', value: trimmed }
      : { kind: 'formula', formula: trimmed.slice(1).trim() }
  }
  const keyword = trimmed.toUpperCase()
  if (keyword === 'TRUE' || keyword === 'FALSE') return { kind: 'boolean', value: keyword === 'TRUE' }
  const amount = numberEntry(trimmed)
  if (amount !== undefined) return { kind: 'number', value: amount }
  const serial = dateEntry(trimmed, date1904)
  if (serial !== undefined) return { kind: 'number', value: serial, format: TYPED_DATE_FORMAT }
  return { kind: 'text', value: trimmed }
}

/**
 * Build the cell an entry leaves at a position.
 * @param entry - the typed entry.
 * @param column - the 0-based column.
 * @param row - the 0-based row.
 * @param inherited - the cell being replaced, whose format and link carry over.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the cell, or undefined when the entry leaves the position empty.
 */
function cellFor(
  entry: XlsxEntry,
  column: number,
  row: number,
  inherited: XlsxCell | undefined,
  date1904: boolean,
): XlsxCell | undefined {
  if (entry.kind === 'empty') return undefined
  const reference = `${columnName(column)}${row + 1}`
  const base = inherited?.format ?? DEFAULT_CELL_FORMAT
  const link = inherited?.hyperlink === undefined ? {} : { hyperlink: inherited.hyperlink }
  if (entry.kind === 'text') {
    return { column, reference, text: entry.value, raw: entry.value, kind: 'string', format: base, ...link }
  }
  if (entry.kind === 'boolean') {
    return {
      column,
      reference,
      text: formatCellValue(entry.value, base.numberFormat, date1904),
      raw: entry.value ? 'TRUE' : 'FALSE',
      kind: 'boolean',
      format: base,
      ...link,
    }
  }
  if (entry.kind === 'formula') {
    // Nothing here recalculates, so the cell shows the formula it stores until
    // a spreadsheet application opens the saved copy.
    return {
      column,
      reference,
      text: `=${entry.formula}`,
      raw: '',
      formula: entry.formula,
      kind: 'string',
      format: base,
      ...link,
    }
  }
  // A typed date arrives as its serial. It keeps the cell's own date format
  // when there is one, and otherwise takes the ISO form the reader typed.
  const code = entry.format !== undefined && !isDateFormat(base.numberFormat) ? entry.format : base.numberFormat
  const format: XlsxCellFormat = code === base.numberFormat ? base : { ...base, numberFormat: code }
  const isDate = isDateFormat(code)
  const kind: XlsxCellKind = isDate ? 'date' : 'number'
  return {
    column,
    reference,
    text: formatCellValue(entry.value, code, date1904),
    raw: String(entry.value),
    kind,
    format,
    ...link,
  }
}

/**
 * Rebuild one row with its edits applied.
 * @param row - the row as parsed.
 * @param edits - the entries keyed by column, when the row has any.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the row, unchanged when it carries no edit.
 */
function rebuildRow(
  row: XlsxRow,
  edits: ReadonlyMap<number, XlsxEntry> | undefined,
  date1904: boolean,
): XlsxRow {
  if (edits === undefined) return row
  const cells: XlsxCell[] = []
  const claimed = new Set<number>()
  for (const cell of row.cells) {
    const entry = edits.get(cell.column)
    if (entry === undefined) {
      cells.push(cell)
      continue
    }
    claimed.add(cell.column)
    const next = cellFor(entry, cell.column, row.index, cell, date1904)
    if (next !== undefined) cells.push(next)
  }
  for (const [column, entry] of edits) {
    if (claimed.has(column)) continue
    const next = cellFor(entry, column, row.index, undefined, date1904)
    if (next !== undefined) cells.push(next)
  }
  cells.sort((left, right) => left.column - right.column)
  return { index: row.index, height: row.height, cells }
}

/**
 * The rightmost populated column across a set of rows.
 * @param rows - the rows to walk.
 * @returns the 0-based column, or 0 when nothing is populated.
 */
function widestColumn(rows: readonly XlsxRow[]): number {
  let widest = 0
  for (const row of rows) {
    for (const cell of row.cells) widest = Math.max(widest, cell.column)
  }
  return widest
}

/**
 * Group a sheet's edits by row and then by column.
 *
 * Both the render overlay and the serializer need the same grouping, and both
 * have to ignore a reference no grid can reach: an entry naming a column or row
 * past the worksheet's own limits is dropped rather than allowed to size an
 * index or be written into a part.
 * @param edits - the entries in force, keyed by A1 reference.
 * @returns the entries, keyed by 0-based row and then by 0-based column.
 */
export function groupEdits(edits: XlsxEditMap): ReadonlyMap<number, ReadonlyMap<number, XlsxEntry>> {
  const byRow = new Map<number, Map<number, XlsxEntry>>()
  for (const [reference, entry] of edits) {
    const position = parseReference(reference)
    if (position === undefined) continue
    if (position.column >= MAX_COLUMN_COUNT || position.row >= MAX_ROW_COUNT) continue
    const row = byRow.get(position.row) ?? new Map<number, XlsxEntry>()
    row.set(position.column, entry)
    byRow.set(position.row, row)
  }
  return byRow
}

/**
 * Overlay a sheet's edits onto the model the grid draws.
 *
 * The sheet's own geometry, merges, and view carry over untouched; only the
 * rows, the extent, and the visible index are recomputed, and the index is
 * recomputed because an edit past the used range has to widen it.
 * @param sheet - the sheet as parsed.
 * @param edits - the entries in force, keyed by A1 reference.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the edited sheet, or the same sheet when no edit applies.
 */
export function applyCellEdits(sheet: XlsxSheet, edits: XlsxEditMap, date1904 = false): XlsxSheet {
  if (edits.size === 0) return sheet
  const byRow = groupEdits(edits)
  const rows: XlsxRow[] = []
  const parsed = new Set(sheet.rows.map(row => row.index))
  for (const row of sheet.rows) rows.push(rebuildRow(row, byRow.get(row.index), date1904))
  for (const [index, rowEdits] of byRow) {
    if (parsed.has(index)) continue
    const cells = [...rowEdits]
      .map(([column, entry]) => cellFor(entry, column, index, undefined, date1904))
      .filter((cell): cell is XlsxCell => cell !== undefined)
      .sort((left, right) => left.column - right.column)
    if (cells.length > 0) rows.push({ index, height: sheet.defaultRowHeight, cells })
  }
  rows.sort((left, right) => left.index - right.index)
  const extent = {
    columns: Math.max(widestColumn(rows), sheet.merges.reduce((widest, merge) => Math.max(widest, merge.right), 0), 0),
    rows: Math.max(
      rows.reduce((lowest, row) => Math.max(lowest, row.index), 0),
      sheet.merges.reduce((lowest, merge) => Math.max(lowest, merge.bottom), 0),
      0,
    ),
  }
  const columns = visibleColumns(
    gridLength(extent.columns + 1, MIN_GRID_COLUMNS, MAX_COLUMN_COUNT) - 1,
    sheet.columnWidths,
  )
  const visible = visibleRows(
    gridLength(extent.rows + 1, MIN_GRID_ROWS, MAX_ROW_COUNT) - 1,
    sheet.rowHeights,
  )
  return {
    ...sheet,
    rows,
    rowMap: new Map(rows.map(row => [row.index, row])),
    index2d: {
      columns,
      rows: visible,
      columnPosition: new Map(columns.map((column, position) => [column, position])),
      rowPosition: new Map(visible.map((row, position) => [row, position])),
    },
    extent,
  }
}

/**
 * Overlay every edited sheet of a workbook.
 * @param workbook - the workbook as parsed.
 * @param log - the edits in force, keyed by sheet index.
 * @returns the edited workbook, or the same workbook when nothing was edited.
 */
export function applyWorkbookEdits(workbook: XlsxWorkbook, log: XlsxEditLog): XlsxWorkbook {
  if (log.size === 0) return workbook
  const sheets = workbook.sheets.map((sheet) => {
    const edits = log.get(sheet.index)
    return edits === undefined ? sheet : applyCellEdits(sheet, edits, workbook.date1904)
  })
  return { ...workbook, sheets }
}

/**
 * The state a reader's work sits in: the log in force, and the ones around it.
 *
 * Excel drops the redo history as soon as a new edit lands, so `commit` does the
 * same; anything else would let a reader redo a value their later edit replaced.
 */
export interface XlsxEditSession {
  /** The edits in force. */
  readonly present: XlsxEditLog
  /** Earlier logs, most recent last. */
  readonly past: readonly XlsxEditLog[]
  /** Logs undone from the present, most recent last. */
  readonly future: readonly XlsxEditLog[]
}

/** The session of a workbook nobody has edited. */
export const NO_EDITS: XlsxEditSession = { present: new Map(), past: [], future: [] }

/** How many logs the undo history keeps before dropping the oldest. */
export const UNDO_DEPTH = 100

/**
 * Record a batch of entries against one sheet.
 * @param session - the session to extend.
 * @param sheet - the sheet's own 1-based index, which the batch applies to.
 * @param batch - the entries to record, keyed by A1 reference.
 * @returns the new session; the same one when the batch is empty.
 */
export function commitEdits(session: XlsxEditSession, sheet: number, batch: XlsxEditMap): XlsxEditSession {
  if (batch.size === 0) return session
  const present = new Map(session.present)
  present.set(sheet, new Map([...(present.get(sheet) ?? []), ...batch]))
  const past = [...session.past, session.present].slice(-UNDO_DEPTH)
  return { present, past, future: [] }
}

/**
 * Step the session back one log.
 * @param session - the session to step.
 * @returns the earlier session; the same one when there is nothing to undo.
 */
export function undoEdits(session: XlsxEditSession): XlsxEditSession {
  const previous = session.past.at(-1)
  if (previous === undefined) return session
  return { present: previous, past: session.past.slice(0, -1), future: [...session.future, session.present] }
}

/**
 * Step the session forward one log.
 * @param session - the session to step.
 * @returns the later session; the same one when there is nothing to redo.
 */
export function redoEdits(session: XlsxEditSession): XlsxEditSession {
  const next = session.future.at(-1)
  if (next === undefined) return session
  return { present: next, past: [...session.past, session.present], future: session.future.slice(0, -1) }
}

/**
 * Whether a session holds anything worth saving.
 * @param session - the session to read.
 * @returns true when at least one sheet carries an entry.
 */
export function hasEdits(session: XlsxEditSession): boolean {
  // A sheet only appears in the log through a non-empty batch, so a present
  // entry always carries something to save.
  return session.present.size > 0
}
