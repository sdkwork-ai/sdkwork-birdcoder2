/**
 * A minimal render-model sheet for the grid's own specs.
 *
 * The parser specs read a real package; these specs need to place a cell at a
 * chosen position with a chosen style, so they build the model directly and
 * keep the layout arithmetic under test rather than the XML reading above it.
 */
import { ptToPx } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { XlsxCell, XlsxCellFormat, XlsxSheet } from '../src/client/xlsx/model.ts'

/** The format a cell takes when a spec states none, as the style table writes it. */
export const DEFAULT_FORMAT: XlsxCellFormat = {
  font: {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    sizePx: ptToPx(11),
    family: 'Calibri',
    color: '#000000',
  },
  borders: {},
  alignment: { horizontal: 'general', vertical: 'bottom', wrapText: false, indent: 0, rotation: 0 },
  numberFormat: 'General',
}

/** What a spec can override on the sheet it builds. */
export interface SheetOptions {
  readonly columns?: number
  readonly rows?: number
  readonly cells?: readonly XlsxCell[]
  readonly columnWidths?: ReadonlyMap<number, number>
  readonly rowHeights?: ReadonlyMap<number, number>
  readonly defaultColumnWidth?: number
  readonly defaultRowHeight?: number
  readonly merges?: readonly { top: number; left: number; bottom: number; right: number }[]
  readonly freeze?: { readonly rows: number; readonly columns: number }
  readonly showGridLines?: boolean
  readonly showHeaders?: boolean
  readonly zoomScale?: number
}

/**
 * The row a cell sits on, read back from its A1 reference.
 * @param cell - the cell to read.
 * @returns the 0-based row.
 */
export function rowOf(cell: XlsxCell): number {
  return Number(/(\d+)$/u.exec(cell.reference)?.[1] ?? 1) - 1
}

/**
 * Build one cell with a stated text and kind.
 * @param column - the 0-based column.
 * @param row - the 0-based row.
 * @param text - the displayed text.
 * @param format - the cell's format, defaulting to the workbook default.
 * @param extra - further fields, such as a formula or hyperlink.
 * @returns the cell.
 */
export function makeCell(
  column: number,
  row: number,
  text: string,
  format: XlsxCellFormat = DEFAULT_FORMAT,
  extra: Partial<XlsxCell> = {},
): XlsxCell {
  return {
    column,
    reference: `${columnName(column)}${row + 1}`,
    text,
    raw: text,
    kind: 'string',
    format,
    ...extra,
  }
}

/**
 * The column letters for a 0-based column, as the parser writes them.
 * @param index - the 0-based column.
 * @returns the column name.
 */
export function columnName(index: number): string {
  let remaining = index
  let name = ''
  do {
    name = String.fromCharCode(65 + (remaining % 26)) + name
    remaining = Math.floor(remaining / 26) - 1
  } while (remaining >= 0)
  return name
}

/**
 * Build a sheet whose visible index matches what the parser would produce.
 * @param options - the positions, cells, and view attributes to use.
 * @returns a render-model sheet.
 */
export function makeSheet(options: SheetOptions = {}): XlsxSheet {
  const lastColumn = options.columns ?? 3
  const lastRow = options.rows ?? 3
  const columnWidths = options.columnWidths ?? new Map<number, number>()
  const rowHeights = options.rowHeights ?? new Map<number, number>()
  const columns = Array.from({ length: lastColumn + 1 }, (_, column) => column)
    .filter(column => (columnWidths.get(column) ?? 1) !== 0)
  const visibleRows = Array.from({ length: lastRow + 1 }, (_, row) => row)
    .filter(row => (rowHeights.get(row) ?? 1) !== 0)
  const cells = options.cells ?? []
  const rows = [...new Set(cells.map(rowOf))].sort((left, right) => left - right).map(row => ({
    index: row,
    height: rowHeights.get(row) ?? options.defaultRowHeight ?? 20,
    cells: cells.filter(cell => rowOf(cell) === row),
  }))
  return {
    index: 1,
    name: 'Sheet1',
    rows,
    rowMap: new Map(rows.map(row => [row.index, row])),
    columnWidths,
    defaultColumnWidth: options.defaultColumnWidth ?? 64,
    rowHeights,
    defaultRowHeight: options.defaultRowHeight ?? 20,
    merges: options.merges ?? [],
    freeze: options.freeze ?? { rows: 0, columns: 0 },
    images: [],
    index2d: {
      columns,
      rows: visibleRows,
      columnPosition: new Map(columns.map((column, position) => [column, position])),
      rowPosition: new Map(visibleRows.map((row, position) => [row, position])),
    },
    showGridLines: options.showGridLines ?? true,
    showHeaders: options.showHeaders ?? true,
    zoomScale: options.zoomScale ?? 1,
    extent: { columns: lastColumn, rows: lastRow },
  }
}
