/**
 * Cell, range, and whole-row/column selection.
 *
 * A selection is an anchor (where the drag or keystroke started) plus a focus
 * (where it ended), normalised into a rectangle on demand. Excel's `Ctrl+A`
 * and header clicks select a whole row, column, or sheet, so the kind travels
 * with the selection rather than being inferred from the rectangle.
 */
import type { XlsxSheet } from '../xlsx/model.ts'

/** What a selection covers. */
export type SelectionKind = 'cell' | 'row' | 'column' | 'sheet'

/** A grid coordinate. */
export interface GridPoint {
  /** 0-based column. */
  readonly column: number
  /** 0-based row. */
  readonly row: number
}

/** What the reader currently has selected. */
export interface GridSelection {
  readonly anchor: GridPoint
  readonly focus: GridPoint
  readonly kind: SelectionKind
}

/** A normalised rectangle of cells. */
export interface SelectionBounds {
  readonly top: number
  readonly left: number
  readonly bottom: number
  readonly right: number
}

/**
 * The selection a freshly loaded sheet starts with.
 * @param sheet - the sheet being shown.
 * @returns the top-left visible cell selected.
 */
export function initialSelection(sheet: XlsxSheet): GridSelection {
  const point = {
    column: sheet.index2d.columns.at(0) ?? 0,
    row: sheet.index2d.rows.at(0) ?? 0,
  }
  return { anchor: point, focus: point, kind: 'cell' }
}

/**
 * Normalise a selection into a rectangle.
 * @param selection - the selection to normalise.
 * @returns the covered rectangle.
 */
export function selectionBounds(selection: GridSelection): SelectionBounds {
  return {
    top: Math.min(selection.anchor.row, selection.focus.row),
    left: Math.min(selection.anchor.column, selection.focus.column),
    bottom: Math.max(selection.anchor.row, selection.focus.row),
    right: Math.max(selection.anchor.column, selection.focus.column),
  }
}

/**
 * Whether a position sits inside a selection.
 * @param selection - the selection to test.
 * @param column - the 0-based column.
 * @param row - the 0-based row.
 * @returns whether the position is selected.
 */
export function isSelected(selection: GridSelection, column: number, row: number): boolean {
  if (selection.kind === 'sheet') return true
  const bounds = selectionBounds(selection)
  if (selection.kind === 'row') return row >= bounds.top && row <= bounds.bottom
  if (selection.kind === 'column') return column >= bounds.left && column <= bounds.right
  return row >= bounds.top && row <= bounds.bottom && column >= bounds.left && column <= bounds.right
}

/**
 * The A1 reference a selection names, as Excel's Name Box prints it.
 * @param selection - the selection to describe.
 * @param referenceOf - the A1 reference for a column and row pair.
 * @param columnName - the column letters for a 0-based column.
 * @returns the reference text.
 */
export function selectionName(
  selection: GridSelection,
  referenceOf: (column: number, row: number) => string,
  columnName: (column: number) => string,
): string {
  const bounds = selectionBounds(selection)
  if (selection.kind === 'sheet') return 'A1'
  if (selection.kind === 'row') return `${bounds.top + 1}:${bounds.bottom + 1}`
  if (selection.kind === 'column') return `${columnName(bounds.left)}:${columnName(bounds.right)}`
  if (bounds.top === bounds.bottom && bounds.left === bounds.right) {
    return referenceOf(bounds.left, bounds.top)
  }
  return `${referenceOf(bounds.left, bounds.top)}:${referenceOf(bounds.right, bounds.bottom)}`
}
