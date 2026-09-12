/**
 * Cell-level questions the grid asks while drawing.
 *
 * Excel decides most of a cell's look from its neighbours: text spills only
 * across positions that carry nothing, and a merge hides the positions it
 * covers. Both answers are derived from the sheet's own visible index, so a
 * cell never searches the grid for its neighbours.
 */
import type { XlsxCell, XlsxMerge, XlsxSheet } from '../xlsx/model.ts'
import { rowAt } from '../xlsx/model.ts'
import { CELL_FONT_SIZE } from '../xlsx/excel.ts'
import { visibleColumnWidth } from './geometry.ts'

/**
 * The populated cell at a position.
 * @param sheet - the sheet to read.
 * @param column - the 0-based column.
 * @param row - the 0-based row.
 * @returns the cell, or undefined when the position carries nothing.
 */
export function cellAt(sheet: XlsxSheet, column: number, row: number): XlsxCell | undefined {
  const cells = rowAt(sheet, row)?.cells
  if (cells === undefined) return undefined
  return cells.find(candidate => candidate.column === column)
}

/** The visible positions a cell's text may paint across. */
export interface SpillSpan {
  /** First visible column position the text may cover. */
  readonly first: number
  /**
   * Last visible column position the text may cover.
   *
   * When an occupied neighbour clips the text, this is that neighbour's own
   * position, so the band is cut at the neighbour's left edge rather than
   * stopping short of it.
   */
  readonly last: number
  /** Whether an occupied neighbour clips the text on the right. */
  readonly clipped: boolean
}

/**
 * The band a cell's text may paint across, as Excel spills it.
 *
 * A cell that confines its own text gets exactly its own position. An
 * overflowing left-aligned string paints rightward across the neighbouring
 * positions that carry nothing, stopping at the first occupied position — Excel
 * spills text in the direction its alignment points, and the only alignment
 * this renderer lets spill points right.
 * @param sheet - the sheet to read.
 * @param row - the 0-based row the cell sits on.
 * @param position - the cell's visible column position.
 * @param confines - whether the cell's alignment confines its text.
 * @returns the first and last visible position.
 */
export function spillSpan(
  sheet: XlsxSheet,
  row: number,
  position: number,
  confines: boolean,
): SpillSpan {
  if (confines) return { first: position, last: position, clipped: false }
  const columns = sheet.index2d.columns
  let last = position
  for (let next = position + 1; next < columns.length; next += 1) {
    const column = columns.at(next)
    if (column !== undefined && cellAt(sheet, column, row) !== undefined) {
      return { first: position, last, clipped: true }
    }
    last = next
  }
  return { first: position, last, clipped: false }
}

/** The directions an in-cell editor may grow past its own cell. */
export type SpillDirection = 'none' | 'right' | 'left' | 'both'

/**
 * The directions the field a reader is typing into may grow past its cell, as
 * Excel decides them from the cell's alignment: left-aligned text grows right,
 * a right-aligned value grows left, a centred value grows both ways, and a
 * wrapped, rotated, or filled value never leaves its cell. An empty cell types
 * as general text, which grows right.
 * @param cell - the cell being edited, absent for a position that carries none.
 * @returns the permitted directions.
 */
export function editorSpillDirection(cell: XlsxCell | undefined): SpillDirection {
  if (cell === undefined) return 'right'
  const { alignment, font } = cell.format
  if (alignment.wrapText || alignment.rotation !== 0 || alignment.horizontal === 'fill') return 'none'
  if (alignment.horizontal === 'center') return 'both'
  if (alignment.horizontal === 'right') return 'left'
  if (alignment.horizontal === 'general' && (cell.kind === 'number' || cell.kind === 'boolean' || cell.kind === 'date')) {
    return 'left'
  }
  // An oversized run is wider than its cell sooner, which the measure decides;
  // kind and alignment alone decide the direction here.
  if (font.sizePx > CELL_FONT_SIZE * 2) return 'none'
  return 'right'
}

/**
 * The band the in-cell editor covers while its draft is wider than the cell.
 *
 * Excel grows the field across the neighbouring positions that carry nothing,
 * in the direction the cell's alignment points, and shrinks it back the moment
 * the draft fits again; an occupied neighbour always stops it.
 * @param sheet - the sheet to read.
 * @param row - the 0-based row the cell sits on.
 * @param position - the cell's visible column position.
 * @param direction - the directions the field may grow in.
 * @param neededWidth - the width the draft asks for, in pixels.
 * @param startWidth - the width of the cell itself, in pixels.
 * @returns the first and last visible position, with `clipped` set when an
 * occupied neighbour stops the growth short of the width the draft asked for.
 */
export function editorSpan(
  sheet: XlsxSheet,
  row: number,
  position: number,
  direction: SpillDirection,
  neededWidth: number,
  startWidth: number,
): SpillSpan {
  if (direction === 'none' || neededWidth <= startWidth) {
    return { first: position, last: position, clipped: false }
  }
  const columns = sheet.index2d.columns
  const widthOf = (next: number): number => visibleColumnWidth(sheet, columns.at(next) ?? 0)
  const occupiedAt = (next: number): boolean => {
    const column = columns.at(next)
    return column !== undefined && cellAt(sheet, column, row) !== undefined
  }
  const mayGrowRight = direction !== 'left'
  const mayGrowLeft = direction !== 'right'
  let first = position
  let last = position
  let width = startWidth
  while (width < neededWidth) {
    const canRight = mayGrowRight && last + 1 < columns.length && !occupiedAt(last + 1)
    const canLeft = mayGrowLeft && first - 1 >= 0 && !occupiedAt(first - 1)
    if (canRight) {
      last += 1
      width += widthOf(last)
    }
    if (width < neededWidth && canLeft) {
      first -= 1
      width += widthOf(first)
    }
    if (!canRight && !canLeft) {
      // Both directions are exhausted: an occupied neighbour stops the field
      // when one sits beside the band, and the sheet's edge otherwise — only
      // the neighbour cuts the band short of the edge it has already reached.
      const blockedByCell = (mayGrowRight && last + 1 < columns.length && occupiedAt(last + 1))
        || (mayGrowLeft && first - 1 >= 0 && occupiedAt(first - 1))
      return { first, last, clipped: blockedByCell }
    }
  }
  return { first, last, clipped: false }
}

/** The merge regions a sheet declares, resolved for lookup by reference. */
export interface MergeIndex {
  /** The region starting at a reference, when one does. */
  readonly start: ReadonlyMap<string, XlsxMerge>
  /** Every reference a region covers, including its anchor. */
  readonly covered: ReadonlySet<string>
}

/**
 * Index a sheet's merge regions by reference.
 * @param sheet - the sheet to read.
 * @param referenceOf - the A1 reference for a column and row pair.
 * @returns the merge index.
 */
export function buildMergeIndex(
  sheet: XlsxSheet,
  referenceOf: (column: number, row: number) => string,
): MergeIndex {
  const start = new Map<string, XlsxMerge>()
  const covered = new Set<string>()
  for (const merge of sheet.merges) {
    start.set(referenceOf(merge.left, merge.top), merge)
    for (let row = merge.top; row <= merge.bottom; row += 1) {
      for (let column = merge.left; column <= merge.right; column += 1) {
        covered.add(referenceOf(column, row))
      }
    }
  }
  return { start, covered }
}
