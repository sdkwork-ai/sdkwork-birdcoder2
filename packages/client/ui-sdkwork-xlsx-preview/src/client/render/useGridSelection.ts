/**
 * Keyboard navigation and range selection for the sheet grid.
 *
 * The hook owns the anchor/focus pair and every semantic move Excel defines:
 * the four arrows, `Tab`/`Enter` walking a row or a column, `Home`/`End`, the
 * `Ctrl` variants, `PageUp`/`PageDown` by a screenful, and `Ctrl+A` taking the
 * whole sheet. It reports the selection and lets the view scroll the moved cell
 * into sight, so no DOM measurement leaks into the model.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { columnName } from '../xlsx/workbook.ts'
import type { XlsxSheet } from '../xlsx/model.ts'
import { initialSelection } from './selection.ts'
import type { GridPoint, GridSelection } from './selection.ts'

/** A selection laid out over the sheet's own coordinates. */
interface Extent {
  readonly columns: number
  readonly rows: number
}

/**
 * Clamp a value into an inclusive range.
 *
 * A sheet's extent is never negative, so the range is always well formed.
 * @param value - the value to clamp.
 * @param minimum - the lowest permitted value.
 * @param maximum - the highest permitted value.
 * @returns the clamped value.
 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Move a position by a signed delta, clamped into range.
 * @param point - the position to move.
 * @param columnStep - the column delta.
 * @param rowStep - the row delta.
 * @param extent - the sheet's populated extent.
 * @returns the clamped position.
 */
export function movePoint(
  point: GridPoint,
  columnStep: number,
  rowStep: number,
  extent: Extent,
): GridPoint {
  return {
    column: clamp(point.column + columnStep, 0, extent.columns),
    row: clamp(point.row + rowStep, 0, extent.rows),
  }
}

/**
 * What a key press asks the grid to do.
 *
 * `move` walks with `Shift` extending the range, `select` jumps and replaces
 * the selection, and `sheet` takes the whole sheet.
 */
export type GridMove =
  | { readonly kind: 'move'; readonly columnStep: number; readonly rowStep: number; readonly extend: boolean }
  | { readonly kind: 'select'; readonly point: GridPoint; readonly extend: boolean }
  | { readonly kind: 'sheet' }

/** What the hook reports back to the view. */
export interface GridSelectionHandle {
  readonly selection: GridSelection
  /** The active cell, which the grid frames and scrolls into sight. */
  readonly active: GridPoint
  /** Replace or extend the selection from a pointer press. */
  readonly selectPoint: (point: GridPoint, extend: boolean) => void
  /** Select a whole row, as a row-header press does. */
  readonly selectRow: (row: number, extend: boolean) => void
  /** Select a whole column, as a column-header press does. */
  readonly selectColumn: (column: number, extend: boolean) => void
  /** Select the whole sheet. */
  readonly selectSheet: () => void
  /** Apply a pointer drag's extension. */
  readonly extendTo: (point: GridPoint) => void
  /** Handle a key press on the grid. */
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  /** Put the selection on a cell, as the Name Box does. */
  readonly goTo: (reference: string) => void
}

/**
 * The top-left visible cell, which a freshly bound sheet selects.
 * @param sheet - the sheet being shown.
 * @returns the selection to start from.
 */
function freshSelection(sheet: XlsxSheet): GridSelection {
  return initialSelection(sheet)
}

/**
 * Bind selection state to a sheet.
 * @param sheet - the sheet the grid shows.
 * @param pageRows - how many rows a `PageUp`/`PageDown` crosses.
 * @param pageColumns - how many columns a horizontal page step crosses.
 * @param onActiveChange - called whenever the active cell moves.
 * @returns the selection and the mutations the grid performs on it.
 */
export function useGridSelection(
  sheet: XlsxSheet,
  pageRows: number,
  pageColumns: number,
  onActiveChange: (point: GridPoint) => void,
): GridSelectionHandle {
  const [selection, setSelection] = useState<GridSelection>(() => freshSelection(sheet))
  const extent = sheet.extent
  const callback = useRef(onActiveChange)
  callback.current = onActiveChange

  // A new sheet means the previous selection names cells that may not exist.
  useEffect(() => {
    setSelection(freshSelection(sheet))
  }, [sheet])

  const selectPoint = useCallback((point: GridPoint, extend: boolean): void => {
    callback.current(point)
    setSelection(current => ({
      anchor: extend ? current.anchor : point,
      focus: point,
      kind: 'cell',
    }))
  }, [])

  const extendTo = useCallback((point: GridPoint): void => {
    callback.current(point)
    setSelection(current => ({ ...current, focus: point }))
  }, [])

  const selectRow = useCallback((row: number, extend: boolean): void => {
    setSelection(current => ({
      anchor: { column: 0, row: extend ? current.anchor.row : row },
      focus: { column: extent.columns, row },
      kind: 'row',
    }))
  }, [extent.columns])

  const selectColumn = useCallback((column: number, extend: boolean): void => {
    setSelection(current => ({
      anchor: { column: extend ? current.anchor.column : column, row: 0 },
      focus: { column, row: extent.rows },
      kind: 'column',
    }))
  }, [extent.rows])

  const selectSheet = useCallback((): void => {
    setSelection({
      anchor: { column: 0, row: 0 },
      focus: { column: extent.columns, row: extent.rows },
      kind: 'sheet',
    })
  }, [extent.columns, extent.rows])

  const applyMove = useCallback((move: GridMove): void => {
    setSelection((current) => {
      const from = current.focus
      if (move.kind === 'sheet') {
        return { anchor: { column: 0, row: 0 }, focus: { column: extent.columns, row: extent.rows }, kind: 'sheet' }
      }
      const target = move.kind === 'select'
        ? move.point
        : movePoint(from, move.columnStep, move.rowStep, extent)
      callback.current(target)
      return { anchor: move.extend ? current.anchor : target, focus: target, kind: 'cell' }
    })
  }, [extent])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>): void => {
    const move = resolveKey(
      event.key,
      event.shiftKey,
      event.ctrlKey || event.metaKey,
      selection.focus,
      extent,
      pageRows,
      pageColumns,
      event.altKey,
    )
    if (move === undefined) return
    event.preventDefault()
    applyMove(move)
  }, [applyMove, extent, pageColumns, pageRows, selection.focus])

  const goTo = useCallback((reference: string): void => {
    const point = parsePointReference(reference)
    if (point === undefined) return
    const target = {
      column: clamp(point.column, 0, extent.columns),
      row: clamp(point.row, 0, extent.rows),
    }
    callback.current(target)
    setSelection({ anchor: target, focus: target, kind: 'cell' })
  }, [extent])

  return { selection, active: selection.focus, selectPoint, selectRow, selectColumn, selectSheet, extendTo, onKeyDown, goTo }
}

/**
 * Translate a key press into a grid move.
 * @param key - the pressed key.
 * @param extend - whether `Shift` is held.
 * @param control - whether `Ctrl` or `Cmd` is held.
 * @param focus - the position the press starts from.
 * @param extent - the sheet's populated extent.
 * @param pageRows - rows a page step crosses.
 * @param pageColumns - columns a horizontal page step crosses.
 * @param jump - whether `Alt` is held, which pages horizontally.
 * @returns the move, or undefined when the key is not the grid's.
 */
export function resolveKey(
  key: string,
  extend: boolean,
  control: boolean,
  focus: GridPoint,
  extent: Extent,
  pageRows: number,
  pageColumns: number,
  jump: boolean,
): GridMove | undefined {
  if (control && key === 'a') return { kind: 'sheet' }
  switch (key) {
    case 'ArrowUp': return { kind: 'move', columnStep: 0, rowStep: -1, extend }
    case 'ArrowDown': return { kind: 'move', columnStep: 0, rowStep: 1, extend }
    case 'ArrowLeft': return { kind: 'move', columnStep: -1, rowStep: 0, extend }
    case 'ArrowRight': return { kind: 'move', columnStep: 1, rowStep: 0, extend }
    case 'Tab': return { kind: 'move', columnStep: extend ? -1 : 1, rowStep: 0, extend }
    case 'Enter': return { kind: 'move', columnStep: 0, rowStep: extend ? -1 : 1, extend }
    case 'Home': return control
      ? { kind: 'select', point: { column: 0, row: 0 }, extend }
      : { kind: 'select', point: { column: 0, row: focus.row }, extend }
    case 'End': return control
      ? { kind: 'select', point: { column: extent.columns, row: extent.rows }, extend }
      : { kind: 'select', point: { column: extent.columns, row: focus.row }, extend }
    case 'PageUp': return jump
      ? { kind: 'move', columnStep: -pageColumns, rowStep: 0, extend }
      : { kind: 'move', columnStep: 0, rowStep: -pageRows, extend }
    case 'PageDown': return jump
      ? { kind: 'move', columnStep: pageColumns, rowStep: 0, extend }
      : { kind: 'move', columnStep: 0, rowStep: pageRows, extend }
    default: return undefined
  }
}

/**
 * The sheet coordinate an A1 reference names.
 * @param reference - the reference to parse.
 * @returns the coordinate, or undefined when it is unparseable.
 */
export function parsePointReference(reference: string): GridPoint | undefined {
  const match = /^([A-Z]+)(\d+)$/u.exec(reference.trim().toUpperCase())
  if (match === null) return undefined
  let column = 0
  for (const character of match[1]) column = column * 26 + (character.charCodeAt(0) - 64)
  return { column: column - 1, row: Number(match[2]) - 1 }
}

/**
 * The A1 reference for a position.
 * @param point - the position to name.
 * @returns the reference.
 */
export function pointReference(point: GridPoint): string {
  return `${columnName(point.column)}${point.row + 1}`
}

/**
 * The number of rows and columns a stage shows, for paging.
 * @param height - the stage height in pixels.
 * @param width - the stage width in pixels.
 * @param defaultRowHeight - the sheet's default row height.
 * @param defaultColumnWidth - the sheet's default column width.
 * @returns the page sizes.
 */
export function pageSize(
  height: number,
  width: number,
  defaultRowHeight: number,
  defaultColumnWidth: number,
): { readonly rows: number; readonly columns: number } {
  return {
    rows: Math.max(1, Math.floor(height / Math.max(1, defaultRowHeight))),
    columns: Math.max(1, Math.floor(width / Math.max(1, defaultColumnWidth))),
  }
}
