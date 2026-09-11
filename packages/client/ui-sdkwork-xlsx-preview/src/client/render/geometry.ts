/**
 * Worksheet layout arithmetic.
 *
 * The grid lays out against cumulative pixel offsets rather than repeated
 * width lookups, so a virtual window asks for the offset of its first visible
 * column and walks from there. A sheet that states a height for its hundred
 * thousandth row costs one array entry, not a hundred thousand.
 */
import { CELL_FONT_SIZE, HEADER_SIZE, MAX_COLUMN_COUNT, MAX_ROW_COUNT, MAX_DIGIT_WIDTH } from '../xlsx/excel.ts'
import type { XlsxCell, XlsxSheet } from '../xlsx/model.ts'

/**
 * The pixel offsets a sheet's visible positions imply.
 *
 * `columnOffsets` and `rowOffsets` are indexed by the *position within the
 * sheet's visible index*, not by the sheet's own column or row number.
 */
export interface GridGeometry {
  readonly sheet: XlsxSheet
  /** Pixel offset of each visible column position. */
  readonly columnOffsets: readonly number[]
  /** Pixel offset of each visible row position. */
  readonly rowOffsets: readonly number[]
  /** Total laid-out width of the visible columns. */
  readonly width: number
  /** Total laid-out height of the visible rows. */
  readonly height: number
}

/**
 * Convert a character-count column width to pixels, as Excel lays it out.
 * @param width - the width in characters.
 * @returns the pixel width.
 */
export function columnWidthToPx(width: number): number {
  return Math.round(width * MAX_DIGIT_WIDTH) + 5
}

/**
 * Convert a point row height to pixels.
 * @param points - the height in points.
 * @returns the pixel height.
 */
export function rowHeightToPx(points: number): number {
  return points * 4 / 3
}

/**
 * The visible column positions a sheet lays out.
 *
 * The populated extent bounds the grid: a sheet with three rows does not lay
 * out a million, and a hidden column is absent rather than zero-width.
 * @param extentColumns - the last column that carries content.
 * @param widths - the columns that state a width.
 * @returns the visible positions, ascending.
 */
export function visibleColumns(extentColumns: number, widths: ReadonlyMap<number, number>): number[] {
  const columns: number[] = []
  const last = Math.min(extentColumns, MAX_COLUMN_COUNT - 1)
  for (let column = 0; column <= last; column += 1) {
    if ((widths.get(column) ?? 1) > 0) columns.push(column)
  }
  return columns
}

/**
 * The visible row positions a sheet lays out.
 * @param extentRows - the last row that carries content.
 * @param heights - the rows that state a height.
 * @returns the visible positions, ascending.
 */
export function visibleRows(extentRows: number, heights: ReadonlyMap<number, number>): number[] {
  const rows: number[] = []
  const last = Math.min(extentRows, MAX_ROW_COUNT - 1)
  for (let row = 0; row <= last; row += 1) {
    if ((heights.get(row) ?? 1) > 0) rows.push(row)
  }
  return rows
}

/**
 * The empty tail a worksheet lays out past its content.
 *
 * A spreadsheet surface fills its window whatever the workbook holds: a
 * brand-new sheet with one empty cell still paints gridlines to the right and
 * bottom edges of the page, and scrolls. The tail is therefore a floor on how
 * far the grid walks, not a limit — the sheet's own used range still wins
 * whenever it is larger.
 *
 * The floors are chosen so the laid-out grid covers any realistic window even
 * at the minimum zoom: 1024 columns are ~72 700 px of paper and 4096 rows are
 * ~77 800 px, against a 3840 px-wide 4K stage at 10 %. Laying out Excel's true
 * 16 384 x 1 048 576 limits would cost an eight-megabyte offset array for a
 * tail no reader of a preview ever scrolls to.
 */
export const MIN_GRID_COLUMNS = 1024
export const MIN_GRID_ROWS = 4096

/**
 * How many positions a grid walks, including the empty tail it fills the page
 * with.
 * @param usedPositions - one more than the last position carrying content.
 * @param floor - the tail the grid keeps regardless of content.
 * @param limit - the worksheet's own maximum position count.
 * @returns the position count to lay out.
 */
export function gridLength(usedPositions: number, floor: number, limit: number): number {
  return Math.min(limit, Math.max(usedPositions, floor))
}

/**
 * The width in pixels of a visible column position.
 * @param sheet - the sheet to measure.
 * @param position - the position within the visible index.
 * @returns the pixel width, or 0 when the position is out of range.
 */
export function visibleColumnWidth(sheet: XlsxSheet, position: number): number {
  const column = sheet.index2d.columns.at(position)
  if (column === undefined) return 0
  return Math.max(0, sheet.columnWidths.get(column) ?? sheet.defaultColumnWidth)
}

/**
 * The height in pixels of a visible row position.
 * @param sheet - the sheet to measure.
 * @param position - the position within the visible index.
 * @returns the pixel height, or 0 when the position is out of range.
 */
export function visibleRowHeight(sheet: XlsxSheet, position: number): number {
  const row = sheet.index2d.rows.at(position)
  if (row === undefined) return 0
  return Math.max(0, sheet.rowHeights.get(row) ?? sheet.defaultRowHeight)
}

/**
 * Build the cumulative offsets a sheet's visible positions imply.
 * @param sheet - the sheet to lay out.
 * @returns the sheet's geometry.
 */
export function buildGridGeometry(sheet: XlsxSheet): GridGeometry {
  const columnOffsets: number[] = []
  let columnTotal = 0
  for (let position = 0; position < sheet.index2d.columns.length; position += 1) {
    columnOffsets.push(columnTotal)
    columnTotal += visibleColumnWidth(sheet, position)
  }
  const rowOffsets: number[] = []
  let rowTotal = 0
  for (let position = 0; position < sheet.index2d.rows.length; position += 1) {
    rowOffsets.push(rowTotal)
    rowTotal += visibleRowHeight(sheet, position)
  }
  return { sheet, columnOffsets, rowOffsets, width: columnTotal, height: rowTotal }
}

/**
 * The pixel offset of a visible column position.
 * @param geometry - the sheet's geometry.
 * @param position - the position within the visible index.
 * @returns the offset from the grid's left edge.
 */
export function columnOffsetAt(geometry: GridGeometry, position: number): number {
  return geometry.columnOffsets.at(Math.max(0, position)) ?? geometry.width
}

/**
 * The pixel offset of a visible row position.
 * @param geometry - the sheet's geometry.
 * @param position - the position within the visible index.
 * @returns the offset from the grid's top edge.
 */
export function rowOffsetAt(geometry: GridGeometry, position: number): number {
  return geometry.rowOffsets.at(Math.max(0, position)) ?? geometry.height
}

/**
 * The visible position holding a pixel offset, as the last position starting at
 * or before it.
 * @param offsets - the cumulative offsets to search.
 * @param pixel - the pixel offset.
 * @returns the position, clamped into range.
 */
export function positionAtOffset(offsets: readonly number[], pixel: number): number {
  if (offsets.length === 0) return 0
  if (pixel <= 0) return 0
  let low = 0
  let high = offsets.length - 1
  let found = 0
  while (low <= high) {
    const middle = (low + high) >> 1
    const start = offsets[middle]
    if (start <= pixel) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/**
 * The visible positions a pixel window covers, plus overscan on each side.
 * @param offsets - the cumulative offsets to search.
 * @param start - the window's start, in pixels.
 * @param end - the window's end, in pixels.
 * @param overscan - how many extra positions to keep on each side.
 * @returns the first and last visible position, inclusive.
 */
export function visibleRange(
  offsets: readonly number[],
  start: number,
  end: number,
  overscan: number,
): { readonly first: number; readonly last: number } {
  const count = offsets.length
  if (count === 0) return { first: 0, last: -1 }
  // A stage that has not been measured yet still shows a full screen's worth,
  // so the first paint is not an empty grid waiting for a resize observer.
  if (end <= start) return { first: 0, last: Math.min(count - 1, Math.max(overscan, 1) * 2) }
  const first = Math.max(0, positionAtOffset(offsets, start) - overscan)
  const last = Math.min(count - 1, positionAtOffset(offsets, end) + overscan)
  return { first, last: Math.max(first, last) }
}

/**
 * The last visible position whose offset starts inside an extent.
 * @param offsets - the cumulative offsets to search.
 * @param limit - the pixel extent.
 * @returns the position, or -1 when nothing fits.
 */
export function lastPositionWithin(offsets: readonly number[], limit: number): number {
  if (offsets.length === 0) return -1
  return positionAtOffset(offsets, Math.max(0, limit - 1))
}

/**
 * The line height a font size needs.
 * @param sizePx - the font size in pixels.
 * @returns the line height in pixels.
 */
export function lineHeightFor(sizePx: number): number {
  return Math.round(sizePx * 1.22)
}

/** The default line height, for a cell that states no font size. */
export const DEFAULT_LINE_HEIGHT = lineHeightFor(CELL_FONT_SIZE)

/** The padding a fitted sheet keeps between itself and the stage's edges. */
const FIT_PADDING = 48

/**
 * The lowest scale the viewer permits.
 *
 * Excel's own zoom floor is 10 %, and the grid only lays out a tail long enough
 * to keep the paper covering the window at that scale.
 */
export const MIN_ZOOM = 0.1

/** The highest scale the viewer permits. */
export const MAX_ZOOM = 4

/** What each zoom press multiplies the current scale by. */
export const ZOOM_STEP = 1.25

/**
 * The pixel size of the region a sheet actually uses.
 *
 * The grid lays out an empty tail past the content so the page is never half
 * blank, so a fit has to measure the used range rather than the laid-out grid —
 * otherwise "fit to window" would shrink a four-column table to a speck to make
 * the tail match the window.
 * @param sheet - the sheet being measured.
 * @param geometry - the sheet's laid-out geometry.
 * @returns the width and height of the used region.
 */
export function usedRangeSize(sheet: XlsxSheet, geometry: GridGeometry): { readonly width: number; readonly height: number } {
  const lastColumn = sheet.index2d.columnPosition.get(sheet.extent.columns)
  const width = lastColumn === undefined
    ? 0
    : columnOffsetAt(geometry, lastColumn) + visibleColumnWidth(sheet, lastColumn)
  const lastRow = sheet.index2d.rowPosition.get(sheet.extent.rows)
  const height = lastRow === undefined
    ? 0
    : rowOffsetAt(geometry, lastRow) + visibleRowHeight(sheet, lastRow)
  return { width, height }
}

/**
 * The scale that fits a sheet's used range inside a stage.
 *
 * A sheet already smaller than the stage stays at actual size, as Excel's
 * "Fit selection" never magnifies a sheet past 100%, and never shrinks one past
 * the viewer's own floor.
 * @param sheet - the sheet being fitted.
 * @param stageSize - the measured stage, in CSS pixels.
 * @returns the fitting scale, between the zoom floor and 1.
 */
export function fitScale(
  sheet: XlsxSheet,
  stageSize: { readonly width: number; readonly height: number },
): number {
  if (stageSize.width === 0 || stageSize.height === 0) return 1
  const geometry = buildGridGeometry(sheet)
  const used = usedRangeSize(sheet, geometry)
  if (used.width === 0 || used.height === 0) return 1
  return Math.max(MIN_ZOOM, Math.min(
    (stageSize.width - FIT_PADDING) / (used.width + HEADER_SIZE),
    (stageSize.height - FIT_PADDING) / (used.height + HEADER_SIZE),
    1,
  ))
}

/**
 * Whether a cell's text is confined to its own cell rather than allowed to
 * spill across empty neighbours, as Excel decides it.
 *
 * Excel spills only left-aligned (or general-aligned) text across empty
 * neighbours; a number, a centred value, and a wrapped value all stay inside
 * the cell.
 * @param cell - the cell to test.
 * @returns whether the cell confines its text.
 */
export function clipsToCell(cell: XlsxCell): boolean {
  const { alignment, font } = cell.format
  if (alignment.wrapText || alignment.rotation !== 0) return true
  if (alignment.horizontal === 'center' || alignment.horizontal === 'right' || alignment.horizontal === 'fill') return true
  if (alignment.horizontal === 'general' && (cell.kind === 'number' || cell.kind === 'boolean' || cell.kind === 'date')) return true
  // An oversized run is wider than its cell sooner, which the renderer measures
  // for itself; kind and alignment alone decide the direction here.
  return font.sizePx > CELL_FONT_SIZE * 2
}
