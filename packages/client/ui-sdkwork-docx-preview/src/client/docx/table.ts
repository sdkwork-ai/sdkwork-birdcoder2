/**
 * WordprocessingML table reading.
 *
 * A table's grid is positional: every cell occupies the next free columns of
 * its row, a horizontally merged cell takes several of them, and a vertically
 * merged cell leaves a continuation marker in each row below. Reading
 * therefore walks each row's cells across the grid columns, so a continuation
 * is recognised by the grid column its restart began on — not by the cell's
 * ordinal position — and the renderer receives explicit `colSpan` and
 * `rowSpan` values instead of the markers the file writes.
 *
 * A table style's conditional bands (`w:tblStylePr`) resolve here too, gated
 * by the table's `w:tblLook`: banded rows, the header band, and the first
 * column get the shading, borders, and run underlay their band states. A
 * cell's blocks are read after its grid position is known, so the band's run
 * properties join the cascade the same way the shading does.
 */
import { child, children, twipsToPx } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import { readBorders, readShading, readTableFormat } from './format.ts'
import type { RunFormat } from './format.ts'
import type { DocxBorders, DocxTable, DocxTableCell, DocxTableRow } from './model.ts'
import type { DocxReadContext } from './content.ts'
import type { TableBandFormat, TableBandKey } from './styles.ts'
import { NS_W, wAttr, wFlag, wNum, wOnOff } from './names.ts'

/** Denominator `w:tcW` uses when it states a percentage. */
const PERCENT_DENOMINATOR = 5000

/** Which conditional areas a table's `w:tblLook` turns on. */
interface TableLook {
  readonly firstRow: boolean
  readonly lastRow: boolean
  readonly firstCol: boolean
  readonly lastCol: boolean
  readonly hBand: boolean
  readonly vBand: boolean
}

/** A cell before its grid position and vertical span are resolved. */
interface RawCell {
  readonly element: Element
  readonly colSpan: number
  readonly merge: 'none' | 'restart' | 'continue'
  readonly widthPx?: number
  readonly borders?: DocxBorders
  readonly shading?: DocxTableCell['shading']
  readonly cellMargin?: DocxTableCell['cellMargin']
  readonly verticalAlign: DocxTableCell['verticalAlign']
}

/** A placed cell still carrying its source element for deferred block reading. */
interface PlacedCell extends Omit<DocxTableCell, 'blocks'> {
  readonly element: Element
  /** An orphan `vMerge` continuation: drawn empty, blocks never read. */
  readonly empty?: true
}

/** A row before its cells are laid out on the grid. */
interface RawRow {
  readonly heightPx?: number
  readonly heightRule?: 'atLeast' | 'exact'
  readonly header: boolean
  readonly cantSplit: boolean
  readonly cells: readonly RawCell[]
}

/**
 * Which conditional areas the look enables, reading the explicit boolean
 * attributes first and falling back to the hex bit field, with Word's own
 * default (first row and column on, vertical banding off) when a table
 * states neither.
 * @param element - the `w:tblLook` element, or undefined.
 * @returns the enabled areas.
 */
function readTableLook(element: Element | undefined): TableLook {
  const bits = Number.parseInt(wAttr(element, 'val') ?? '', 16)
  const bit = (name: string, mask: number, fallback: boolean): boolean => {
    const explicit = wFlag(element, name)
    if (explicit !== undefined) return explicit
    return Number.isFinite(bits) ? (bits & mask) !== 0 : fallback
  }
  return {
    firstRow: bit('firstRow', 0x0020, true),
    lastRow: bit('lastRow', 0x0040, false),
    firstCol: bit('firstColumn', 0x0080, true),
    lastCol: bit('lastColumn', 0x0100, false),
    // The bit fields name the *suppression* of banding.
    hBand: !bit('noHBand', 0x0200, false),
    vBand: !bit('noVBand', 0x0400, true),
  }
}

/**
 * Read a table's declared width for one cell.
 * @param element - the `w:tcW` element, or undefined.
 * @param gridWidth - the table's total grid width, for percentage widths.
 * @returns the width in CSS pixels, or undefined when the cell states none.
 */
function cellWidthOf(element: Element | undefined, gridWidth: number): number | undefined {
  if (element === undefined) return undefined
  const value = wNum(element, 'w')
  if (value === undefined) return undefined
  const type = wAttr(element, 'type') ?? 'dxa'
  if (type === 'pct') return gridWidth * value / PERCENT_DENOMINATOR
  if (type === 'dxa') return twipsToPx(value)
  return undefined
}

/**
 * Read one cell, deferring its blocks until its grid position is known.
 * @param element - the `w:tc` element.
 * @param gridWidth - the table's total grid width, for percentage widths.
 * @returns the cell before its grid position is resolved.
 */
function readCell(element: Element, theme: Theme, gridWidth: number): RawCell {
  const properties = child(element, NS_W, 'tcPr')
  const merge = child(properties, NS_W, 'vMerge')
  const vertical = wAttr(child(properties, NS_W, 'vAlign'), 'val')
  const widthPx = cellWidthOf(child(properties, NS_W, 'tcW'), gridWidth)
  const borders = readBorders(child(properties, NS_W, 'tcBorders'), theme)
  const shading = readShading(child(properties, NS_W, 'shd'), theme)
  const marginElement = child(properties, NS_W, 'tcMar')
  const cellMargin = marginElement === undefined ? undefined : {
    top: twipsToPx(wNum(child(marginElement, NS_W, 'top'), 'w') ?? 0),
    left: twipsToPx(wNum(child(marginElement, NS_W, 'left'), 'w') ?? 108),
    bottom: twipsToPx(wNum(child(marginElement, NS_W, 'bottom'), 'w') ?? 0),
    right: twipsToPx(wNum(child(marginElement, NS_W, 'right'), 'w') ?? 108),
  }
  return {
    element,
    colSpan: wNum(child(properties, NS_W, 'gridSpan'), 'val') ?? 1,
    merge: merge === undefined ? 'none' : wAttr(merge, 'val') === 'restart' ? 'restart' : 'continue',
    ...(widthPx === undefined ? {} : { widthPx }),
    ...(borders === undefined ? {} : { borders }),
    ...(shading === undefined ? {} : { shading }),
    ...(cellMargin === undefined ? {} : { cellMargin }),
    verticalAlign: vertical === 'center' ? 'center' : vertical === 'bottom' ? 'bottom' : 'top',
  }
}

/**
 * Read one row.
 * @param element - the `w:tr` element.
 * @param gridWidth - the table's total grid width, for percentage widths.
 * @returns the row before its cells are laid out.
 */
function readRow(element: Element, theme: Theme, gridWidth: number): RawRow {
  const properties = child(element, NS_W, 'trPr')
  const height = wNum(child(properties, NS_W, 'trHeight'), 'val')
  const rule = wAttr(child(properties, NS_W, 'trHeight'), 'hRule')
  return {
    ...(height === undefined ? {} : { heightPx: twipsToPx(height) }),
    ...(height === undefined ? {} : { heightRule: rule === 'exact' ? 'exact' as const : 'atLeast' as const }),
    header: wOnOff(properties, 'tblHeader') === true,
    cantSplit: wOnOff(properties, 'cantSplit') === true,
    cells: children(element, NS_W, 'tc').map(cell => readCell(cell, theme, gridWidth)),
  }
}

/**
 * Sum the grid columns a cell spans.
 * @param columns - the table's column widths.
 * @param start - the first column the cell occupies.
 * @param count - how many columns it spans.
 * @returns the summed width in CSS pixels.
 */
function spanWidth(columns: readonly number[], start: number, count: number): number {
  let total = 0
  for (let index = start; index < start + count; index += 1) total += columns[index] ?? 0
  return total
}

/**
 * The grid column a row's cell occupies.
 * @param row - the raw row to walk.
 * @param index - the cell's index within the row.
 * @param consumed - the row's cells already taken as continuations.
 * @returns the cell's first grid column, or undefined past the row's end.
 */
function columnOfCell(row: RawRow, index: number, consumed: ReadonlySet<number>): number | undefined {
  let column = 0
  for (const [cellIndex, cell] of row.cells.entries()) {
    if (cellIndex === index) return column
    if (!consumed.has(cellIndex)) column += cell.colSpan
  }
  return undefined
}

/**
 * Resolve every row's cells onto the table grid.
 * @param rows - the table's raw rows.
 * @param columns - the table's column widths.
 * @param borders - the table's own borders, which cells inherit.
 * @returns the placed rows, without their blocks yet.
 */
function layoutRows(rows: readonly RawRow[], columns: readonly number[], borders: DocxBorders): readonly (Omit<DocxTableRow, 'cells'> & { readonly cells: readonly PlacedCell[] })[] {
  const consumed = rows.map(() => new Set<number>())
  const orphans = rows.map(() => new Set<number>())
  const spans = new Map<string, number>()
  const occupied = rows.map(() => new Set<number>())
  for (let row = 0; row < rows.length; row += 1) {
    for (const [index, cell] of rows[row].cells.entries()) {
      if (consumed[row].has(index)) continue
      const column = columnOfCell(rows[row], index, consumed[row])
      if (column === undefined) continue
      if (cell.merge === 'continue') {
        if (occupied[row].has(column)) {
          // Spanned by a restart above: the restart's rowSpan draws the cell.
          consumed[row].add(index)
        } else {
          // A continuation with no restart above draws as an empty cell; Word
          // drops the content a malformed file parks in it.
          orphans[row].add(index)
        }
      }
      if (cell.merge === 'restart') {
        let span = 1
        for (let below = row + 1; below < rows.length; below += 1) {
          const continuation = findContinuation(rows[below], consumed[below], column)
          if (continuation === undefined) break
          consumed[below].add(continuation)
          span += 1
        }
        spans.set(`${row}:${index}`, span)
      }
      for (let spanned = row; spanned < row + (spans.get(`${row}:${index}`) ?? 1); spanned += 1) {
        for (let offset = 0; offset < cell.colSpan; offset += 1) occupied[spanned].add(column + offset)
      }
    }
  }

  return rows.map((source: RawRow, row: number) => {
    const placed: PlacedCell[] = []
    for (const [index, cell] of source.cells.entries()) {
      if (consumed[row].has(index)) continue
      const cellColumn = columnOfCell(source, index, consumed[row])
      if (cellColumn === undefined) continue
      placed.push({
        colSpan: cell.colSpan,
        rowSpan: spans.get(`${row}:${index}`) ?? 1,
        widthPx: cell.widthPx ?? spanWidth(columns, cellColumn, cell.colSpan),
        borders: { ...borders, ...cell.borders },
        verticalAlign: cell.verticalAlign,
        ...(cell.shading === undefined ? {} : { shading: cell.shading }),
        ...(cell.cellMargin === undefined ? {} : { cellMargin: cell.cellMargin }),
        ...(orphans[row].has(index) ? { empty: true } : {}),
        element: cell.element,
      })
    }
    return {
      ...(source.heightPx === undefined ? {} : { heightPx: source.heightPx }),
      ...(source.heightRule === undefined ? {} : { heightRule: source.heightRule }),
      header: source.header,
      cantSplit: source.cantSplit,
      cells: placed,
    }
  })
}

/**
 * Find the cell of a row that continues a vertical merge at a grid column.
 * @param row - the raw row below a restart.
 * @param occupied - grid columns earlier restarts already cover in this row.
 * @param consumed - this row's cells already taken as continuations.
 * @param column - the restart's grid column.
 * @returns the continuation cell's index, or undefined when the column holds a fresh cell.
 */
function findContinuation(
  row: RawRow,
  consumed: ReadonlySet<number>,
  column: number,
): number | undefined {
  let cursor = 0
  for (const [index, cell] of row.cells.entries()) {
    if (consumed.has(index)) continue
    const start = cursor
    cursor += cell.colSpan
    if (column >= start && column < cursor) {
      return cell.merge === 'continue' ? index : undefined
    }
  }
  return undefined
}

/**
 * The bands a grid position belongs to, under the table's look.
 * @param row - the row index.
 * @param rowCount - how many rows the table has.
 * @param column - the cell's first grid column.
 * @param columnCount - how many grid columns the table has.
 * @param look - the enabled areas.
 * @returns the band keys the position carries.
 */
function bandsOf(
  row: number,
  rowCount: number,
  column: number,
  columnCount: number,
  look: TableLook,
): readonly TableBandKey[] {
  const keys: TableBandKey[] = []
  const lastRow = rowCount - 1
  const lastColumn = Math.max(0, columnCount - 1)
  const rowIsFirst = look.firstRow && row === 0
  const rowIsLast = look.lastRow && row === lastRow && row !== 0
  const colIsFirst = look.firstCol && column === 0
  const colIsLast = look.lastCol && column === lastColumn && column !== 0
  if (rowIsFirst) keys.push('firstRow')
  if (rowIsLast) keys.push('lastRow')
  if (colIsFirst) keys.push('firstCol')
  if (colIsLast) keys.push('lastCol')
  // Banding covers the rows between the first and last bands, alternating
  // from the first band.
  const bodyStart = rowIsFirst || (look.firstRow && lastRow > 0) ? 1 : 0
  const bodyEnd = rowIsLast || (look.lastRow && lastRow > 0) ? lastRow - 1 : lastRow
  if (look.hBand && row >= bodyStart && row <= bodyEnd) {
    keys.push((row - bodyStart) % 2 === 0 ? 'band1Horz' : 'band2Horz')
  }
  const bodyColStart = colIsFirst || (look.firstCol && lastColumn > 0) ? 1 : 0
  const bodyColEnd = colIsLast || (look.lastCol && lastColumn > 0) ? lastColumn - 1 : lastColumn
  if (look.vBand && column >= bodyColStart && column <= bodyColEnd) {
    keys.push((column - bodyColStart) % 2 === 0 ? 'band1Vert' : 'band2Vert')
  }
  return keys
}

/**
 * The paint one cell's matching bands contribute.
 * @param keys - the band keys the cell's grid position carries.
 * @param bands - the style's conditional formats.
 * @returns the row band, the column band, and their merged run underlay.
 */
function bandsForCell(
  keys: readonly TableBandKey[],
  bands: Partial<Record<TableBandKey, TableBandFormat>>,
): { readonly rowBand?: TableBandFormat; readonly colBand?: TableBandFormat } {
  let rowBand: TableBandFormat | undefined
  let colBand: TableBandFormat | undefined
  for (const key of keys) {
    const band = bands[key]
    if (band === undefined) continue
    if (key === 'firstRow' || key === 'lastRow' || key.endsWith('Horz')) rowBand = rowBand === undefined ? band : { ...rowBand, ...band }
    else colBand = colBand === undefined ? band : { ...colBand, ...band }
  }
  return { rowBand, colBand }
}

/**
 * Read one table.
 * @param element - the `w:tbl` element.
 * @param context - the resolved document context.
 * @returns the table with every cell placed on its grid.
 */
export function readTable(element: Element, context: DocxReadContext): DocxTable {
  const properties = child(element, NS_W, 'tblPr')
  const style = context.styles.table(wAttr(child(properties, NS_W, 'tblStyle'), 'val'))
  const own = readTableFormat(properties, context.theme)
  const borders = { ...style.table.borders, ...own.borders }
  const widthPctElement = child(properties, NS_W, 'tblW')
  const widthPct = wAttr(widthPctElement, 'type') === 'pct' ? wNum(widthPctElement, 'w') : undefined
  const widthAuto = wAttr(widthPctElement, 'type') === 'auto' || wNum(widthPctElement, 'w') === 0
  const fixedLayout = wAttr(child(properties, NS_W, 'tblLayout'), 'type') === 'fixed'
  const bidiVisual = wOnOff(properties, 'bidiVisual') === true
  const columns = children(child(element, NS_W, 'tblGrid'), NS_W, 'gridCol')
    .map(column => twipsToPx(wNum(column, 'w') ?? 0))
  const gridWidth = columns.reduce((total, width) => total + width, 0)
  const rows = children(element, NS_W, 'tr').map(row => readRow(row, context.theme, gridWidth))
  const look = readTableLook(child(properties, NS_W, 'tblLook'))
  const laid = layoutRows(rows, columns, borders)
  const hasBands = Object.keys(style.bands).length > 0

  // An autofit column grows to fit the declared width of a nested table, the
  // way Word's own autofit keeps an embedded table whole. The growth lands on
  // the last column the cell spans, so earlier columns keep their grid share.
  const finalRows = laid.map((row, rowIndex) => ({
    ...row,
    cells: row.cells.map((cell: PlacedCell) => {
      // The cell's own element is not part of the drawn model.
      const { element: cellElement, empty, ...rest } = cell
      const column = gridColumnOf(row.cells, cell)
      let underlay: RunFormat | undefined
      let shading = cell.shading
      let cellBorders = cell.borders
      if (hasBands) {
        const { rowBand, colBand } = bandsForCell(bandsOf(rowIndex, laid.length, column, columns.length, look), style.bands)
        if (rowBand !== undefined || colBand !== undefined) {
          if (shading === undefined) shading = rowBand?.shading ?? colBand?.shading
          cellBorders = { ...cellBorders, ...colBand?.borders, ...rowBand?.borders }
          const merged = colBand === undefined ? rowBand?.run : { ...colBand.run, ...rowBand?.run }
          if (merged !== undefined && Object.keys(merged).length > 0) underlay = merged
        }
      }
      const blocks = empty === true
        ? []
        : context.readBlocks(cellElement, { ...context, ...(underlay === undefined ? {} : { runUnderlay: underlay }) })
      return {
        ...rest,
        borders: cellBorders,
        ...(shading === undefined ? {} : { shading }),
        blocks,
      }
    }),
  }))

  return {
    kind: 'table',
    pageBreakBefore: false,
    keepNext: false,
    indentPx: own.indentPx ?? style.table.indentPx ?? 0,
    columns: bidiVisual ? [...columns].reverse() : columns,
    ...(fixedLayout ? { fixedLayout: true } : {}),
    ...(widthAuto ? { widthAuto: true } : {}),
    ...(widthPct === undefined ? {} : { widthPct: Math.min(5000, Math.max(0, widthPct)) }),
    rows: bidiVisual ? finalRows.map(row => ({ ...row, cells: reverseMirrored(row.cells) })) : finalRows,
    borders,
    cellMargin: own.cellMargin ?? style.table.cellMargin ?? { top: 0, left: twipsToPx(108), bottom: 0, right: twipsToPx(108) },
    align: own.align ?? style.table.align ?? 'left',
  }
}

/**
 * Reverse a row's cells for a right-to-left table and swap each cell's
 * horizontal border edges, which mirror with the column order.
 * @param cells - the cells in left-to-right order.
 * @returns the cells right-to-left, edges mirrored.
 */
function reverseMirrored(cells: readonly DocxTableCell[]): readonly DocxTableCell[] {
  return [...cells].reverse().map(cell => ({
    ...cell,
    borders: {
      ...cell.borders,
      left: cell.borders.right,
      right: cell.borders.left,
    },
  }))
}

/**
 * The grid column a placed cell starts at.
 * @param cells - the placed row's cells.
 * @param cell - the placed cell.
 * @returns the cell's first grid column.
 */
function gridColumnOf(cells: readonly { readonly colSpan: number }[], cell: unknown): number {
  let column = 0
  for (const placed of cells) {
    if (placed === cell) return column
    column += placed.colSpan
  }
  return column
}
