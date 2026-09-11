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

/**
 * The first occupied position to one side of another.
 * @param sheet - the sheet to read.
 * @param row - the 0-based row the walk stays on.
 * @param from - the position the walk starts at, exclusive.
 * @param step - 1 to walk right, -1 to walk left.
 * @returns the occupied position, or undefined when the walk reaches the edge.
 */
function occupied(sheet: XlsxSheet, row: number, from: number, step: 1 | -1): number | undefined {
  const columns = sheet.index2d.columns
  for (let position = from + step; position >= 0 && position < columns.length; position += step) {
    const column = columns.at(position)
    if (column !== undefined && cellAt(sheet, column, row) !== undefined) return position
  }
  return undefined
}

/** The visible positions a cell's text may paint across. */
export interface SpillSpan {
  /** First visible column position the text may cover. */
  readonly first: number
  /**
   * Last visible column position the text may cover.
   *
   * When an occupied neighbour clips the text, this is that neighbour's own
   * position, so the band reaches its left edge rather than stopping short.
   */
  readonly last: number
  /** Whether an occupied neighbour clips the text on the right. */
  readonly clipped: boolean
}

/**
 * The band a cell's text may paint across, as Excel spills it.
 *
 * A cell that confines its own text gets exactly its own position. An
 * overflowing left-aligned string paints across the neighbouring positions that
 * carry nothing, stopping at the first occupied position on each side.
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
  const right = occupied(sheet, row, position, 1)
  const left = occupied(sheet, row, position, -1)
  return {
    first: left === undefined ? 0 : left,
    last: right ?? sheet.index2d.columns.length - 1,
    clipped: right !== undefined,
  }
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
