/**
 * The worksheet surface: header bands, the virtualised cell grid, and the
 * selection chrome Excel draws over it.
 *
 * Only the positions a scroll window covers are mounted, so a sheet with a
 * hundred thousand populated rows builds the same element tree as a small one;
 * the scrollbars still reach every position because the content box carries the
 * sheet's full laid-out size. Frozen panes are pinned by compensating for the
 * scroll offset rather than by scrolling with it, which is why the mounted
 * range unions the frozen positions with the scrolled ones rather than
 * intersecting them.
 *
 * The surface is two layers because a spreadsheet pins one of them: the
 * scrollport holds the cells, and the row-number and column-letter bands are
 * its siblings, translated by the scroll offset, so they stay on the page's
 * edges the way Excel keeps them.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode,
} from 'react'
import type { XlsxBorderSide, XlsxCell, XlsxSheet } from '../xlsx/model.ts'
import { rowAt } from '../xlsx/model.ts'
import { columnName } from '../xlsx/workbook.ts'
import { CellEditor } from './CellEditor.tsx'
import { buildMergeIndex, editorSpan, editorSpillDirection, spillSpan } from './cells.ts'
import type { MergeIndex } from './cells.ts'
import { gridEditCommand, sheetCommandFor } from './editing.ts'
import type { EditEntry, OpenEditor } from './editing.ts'
import { buildGridGeometry, clipsToCell, columnOffsetAt, rowOffsetAt, visibleRange } from './geometry.ts'
import type { GridGeometry } from './geometry.ts'
import { textWidthPx } from './measure.ts'
import {
  ACTIVE_BORDER, CELL_FONT_FAMILY, CELL_FONT_SIZE, CELL_PADDING_LEFT, CELL_PADDING_RIGHT, CELL_TEXT_COLOR,
  FILL_HANDLE_SIZE, FROZEN_PANE_BORDER, GRIDLINE_COLOR, HEADER_ACTIVE_BACKGROUND,
  HEADER_ACTIVE_LABEL, HEADER_BACKGROUND, HEADER_BORDER, HEADER_HOVER_BACKGROUND, HEADER_LABEL,
  HEADER_SELECTED_BACKGROUND, HEADER_SIZE, HYPERLINK_COLOR, SELECTION_FILL, SHEET_BACKGROUND,
} from '../xlsx/excel.ts'
import { extendsBounds, isSelected, selectionBounds } from './selection.ts'
import type { GridPoint, GridSelection, SelectionBounds } from './selection.ts'
import { movePoint, parsePointReference, pointReference } from './useGridSelection.ts'
import type { GridSelectionHandle } from './useGridSelection.ts'
import css from './SheetGrid.module.css'

/** How many off-screen positions the window keeps mounted on each side. */
const OVERSCAN = 2

/** The half-pixel inset that keeps a 1px SVG stroke inside its own viewBox. */
const ANT_INSET = 0.5

/** The sheet's own palette, handed to the layout sheet as custom properties. */
const sheetPalette = {
  '--sheet-paper': SHEET_BACKGROUND,
  '--sheet-gridline': GRIDLINE_COLOR,
  '--sheet-header': HEADER_BACKGROUND,
  '--sheet-header-border': HEADER_BORDER,
  '--sheet-header-label': HEADER_LABEL,
  '--sheet-header-hover': HEADER_HOVER_BACKGROUND,
  '--sheet-header-selected': HEADER_SELECTED_BACKGROUND,
  '--sheet-header-active': HEADER_ACTIVE_BACKGROUND,
  '--sheet-header-label-active': HEADER_ACTIVE_LABEL,
  '--sheet-active': ACTIVE_BORDER,
  '--sheet-selection': SELECTION_FILL,
  '--sheet-frozen': FROZEN_PANE_BORDER,
  '--sheet-font': CELL_FONT_FAMILY,
} as CSSProperties

/**
 * Blend a cell's own fill with the selection wash, as Excel layers them.
 *
 * The wash lands under the text rather than over it, which is why the mix is
 * computed here instead of an overlay painting on top of the cell. A cell that
 * states no fill takes the translucent wash alone, so the paper and a
 * neighbour's spilled text both stay visible through it, the way Excel's wash
 * sits on the sheet rather than on a card of its own.
 * @param fill - the cell's own fill, when it states one.
 * @returns the CSS background.
 */
export function selectedFill(fill: string | undefined): string {
  if (fill === undefined) return SELECTION_FILL
  const match = /^#([0-9a-f]{6})$/iu.exec(fill)
  if (match === null) return fill
  const value = Number.parseInt(match[1], 16)
  const wash = [33, 115, 70]
  const channel = (shift: number): number => {
    const base = (value >> shift) & 0xff
    return Math.round(base * 0.9 + wash[shift === 16 ? 0 : shift === 8 ? 1 : 2] * 0.1)
  }
  return `#${[channel(16), channel(8), channel(0)]
    .map(part => part.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/**
 * The positions a scroll window covers, with the frozen ones kept beside it.
 * @param count - how many positions the sheet shows.
 * @param frozen - how many leading positions are pinned.
 * @param offsets - the cumulative pixel offset of each position.
 * @param start - the window's start, in content pixels.
 * @param end - the window's end, in content pixels.
 * @returns the positions to mount, ascending and free of duplicates.
 */
export function renderRange(
  count: number,
  frozen: number,
  offsets: readonly number[],
  start: number,
  end: number,
): number[] {
  const scrolled = visibleRange(offsets, start, end, OVERSCAN)
  const positions = new Set<number>()
  for (let position = 0; position < frozen && position < count; position += 1) positions.add(position)
  // `visibleRange` already clamps both ends into the sheet's positions, so the
  // window is safe to walk as it stands.
  for (let position = scrolled.first; position <= scrolled.last; position += 1) positions.add(position)
  return [...positions].sort((left, right) => left - right)
}

/**
 * The width of a mounted column position.
 * @param geometry - the sheet's geometry.
 * @param position - the visible position.
 * @returns the pixel width.
 */
function positionWidth(geometry: GridGeometry, position: number): number {
  const next = geometry.columnOffsets.at(position + 1) ?? geometry.width
  return Math.max(0, next - columnOffsetAt(geometry, position))
}

/**
 * The height of a mounted row position.
 * @param geometry - the sheet's geometry.
 * @param position - the visible position.
 * @returns the pixel height.
 */
function positionHeight(geometry: GridGeometry, position: number): number {
  const next = geometry.rowOffsets.at(position + 1) ?? geometry.height
  return Math.max(0, next - rowOffsetAt(geometry, position))
}

/**
 * The right edge of a mounted column position.
 * @param geometry - the sheet's geometry.
 * @param position - the visible position.
 * @returns the content offset.
 */
function columnEdge(geometry: GridGeometry, position: number): number {
  return columnOffsetAt(geometry, position) + positionWidth(geometry, position)
}

/**
 * The bottom edge of a mounted row position.
 * @param geometry - the sheet's geometry.
 * @param position - the visible position.
 * @returns the content offset.
 */
function rowEdge(geometry: GridGeometry, position: number): number {
  return rowOffsetAt(geometry, position) + positionHeight(geometry, position)
}

/**
 * The pixel width a spill span paints across.
 * @param geometry - the sheet's geometry.
 * @param span - the span, whose `last` names the last position the band covers
 * and whose `clipped` flag says an occupied neighbour sits just past it.
 * @returns the width, cut at that neighbour's left edge when clipped.
 */
function spillWidth(geometry: GridGeometry, span: { readonly first: number; readonly last: number; readonly clipped: boolean }): number {
  const edge = span.clipped ? columnOffsetAt(geometry, span.last + 1) : columnEdge(geometry, span.last)
  return Math.max(0, edge - columnOffsetAt(geometry, span.first))
}

/** A rectangle in the sheet's own pixels. */
interface Rect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/**
 * The content rectangle a grid rectangle occupies.
 *
 * Each edge is pinned on its own, so a rectangle that starts inside a frozen
 * pane keeps its leading edge on the page while its trailing edge follows the
 * scroll. Excel splits such a rectangle into one per quadrant; a single
 * rectangle whose edges move independently never hides what it frames, which is
 * what the reader needs from it.
 * @param geometry - the sheet's geometry.
 * @param bounds - the grid rectangle.
 * @param scrolled - the scrollport's offset in the sheet's own pixels.
 * @returns the rectangle, or undefined when a covered position is hidden.
 */
function boundsRect(
  geometry: GridGeometry,
  bounds: SelectionBounds,
  scrolled: { readonly left: number; readonly top: number },
): Rect | undefined {
  const sheet = geometry.sheet
  const first = sheet.index2d.columnPosition.get(bounds.left)
  const last = sheet.index2d.columnPosition.get(bounds.right)
  const topRow = sheet.index2d.rowPosition.get(bounds.top)
  const bottomRow = sheet.index2d.rowPosition.get(bounds.bottom)
  if (first === undefined || last === undefined || topRow === undefined || bottomRow === undefined) {
    return undefined
  }
  const pinned = (value: number, limit: number): number => (value < limit ? scrolled.left : 0)
  const pinnedRows = (value: number): number => (value < sheet.freeze.rows ? scrolled.top : 0)
  const left = HEADER_SIZE + columnOffsetAt(geometry, first) + pinned(bounds.left, sheet.freeze.columns)
  const top = HEADER_SIZE + rowOffsetAt(geometry, topRow) + pinnedRows(bounds.top)
  const right = HEADER_SIZE + columnEdge(geometry, last) + pinned(bounds.right, sheet.freeze.columns)
  const bottom = HEADER_SIZE + rowEdge(geometry, bottomRow) + pinnedRows(bounds.bottom)
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * The rectangle a fill drag currently covers.
 *
 * The drag begins on the selection's own handle, so the rectangle it reports
 * always contains the selection it started from.
 * @param source - the rectangle the drag started from.
 * @param point - the position the pointer is over.
 * @returns the covered rectangle.
 */
function extendedBounds(source: SelectionBounds, point: GridPoint): SelectionBounds {
  return {
    top: Math.min(source.top, point.row),
    left: Math.min(source.left, point.column),
    bottom: Math.max(source.bottom, point.row),
    right: Math.max(source.right, point.column),
  }
}

/**
 * The visible position a sheet column occupies, when it is not hidden.
 * @param sheet - the sheet to read.
 * @param column - the 0-based column.
 * @returns the position, or undefined.
 */
function visibleColumnPosition(sheet: XlsxSheet, column: number): number | undefined {
  return sheet.index2d.columnPosition.get(column)
}

/**
 * The visible position a sheet row occupies, when it is not hidden.
 * @param sheet - the sheet to read.
 * @param row - the 0-based row.
 * @returns the position, or undefined.
 */
function visibleRowPosition(sheet: XlsxSheet, row: number): number | undefined {
  return sheet.index2d.rowPosition.get(row)
}

/**
 * The border sides a cell states, as CSS.
 * @param cell - the cell to read.
 * @returns the border properties.
 */
function borderStyle(cell: XlsxCell): CSSProperties {
  const side = (edge: XlsxBorderSide | undefined): string | undefined => (
    edge === undefined ? undefined : `${edge.dashed ? 'dashed' : 'solid'} ${edge.widthPx}px ${edge.color}`
  )
  return {
    borderTop: side(cell.format.borders.top),
    borderRight: side(cell.format.borders.right),
    borderBottom: side(cell.format.borders.bottom),
    borderLeft: side(cell.format.borders.left),
  }
}

/**
 * How a cell places its text, which Excel decides from alignment and kind.
 *
 * A cell that states no vertical alignment sits on its cell's bottom edge, as
 * Excel's own default does; a merged title is usually the one that asks for the
 * middle.
 * @param cell - the cell to read.
 * @returns the flex and text alignment properties.
 */
function textPlacement(cell: XlsxCell): CSSProperties {
  const { horizontal, vertical } = cell.format.alignment
  const numeric = cell.kind === 'number' || cell.kind === 'boolean' || cell.kind === 'date'
  const align = horizontal === 'general' ? (numeric ? 'right' : 'left') : horizontal
  return {
    justifyContent: align === 'center' ? 'center' : align === 'right' || align === 'fill' ? 'flex-end' : 'flex-start',
    textAlign: align === 'center' ? 'center' : align === 'right' || align === 'fill' ? 'right' : 'left',
    alignItems: vertical === 'top' ? 'flex-start' : vertical === 'bottom' ? 'flex-end' : 'center',
  }
}

/**
 * The rotation a cell's text carries, as CSS.
 *
 * OOXML states rotation clockwise in degrees, except for 255, which means the
 * bottom-to-top orientation a reader sees in a vertical header.
 * @param rotation - the cell's stated rotation.
 * @returns the transform and origin.
 */
function rotationStyle(rotation: number): CSSProperties {
  if (rotation === 0) return {}
  if (rotation === 255) return { transform: 'rotate(270deg)', transformOrigin: 'top right' }
  return { transform: `rotate(${-rotation}deg)`, transformOrigin: 'bottom left' }
}

/**
 * The rendered line height for a cell, so the browser does not reflow text the
 * workbook already sized.
 * @param cell - the cell to read.
 * @returns the line height in pixels.
 */
function cellLineHeight(cell: XlsxCell): string {
  return `${Math.round(cell.format.font.sizePx * 1.22)}px`
}

/**
 * The editing surface the grid drives, when the workbook is editable.
 *
 * The grid owns the keyboard and the pointer, and the edit log owns what a
 * keystroke means; this is the seam between them, so the grid never reaches for
 * the workbook model and the log never reaches for the DOM.
 *
 * The selection still belongs to the grid: a commit is reported back through
 * `commit`, and moving the selection afterwards is the grid's own business.
 */
export interface GridEditing {
  /** The in-cell editor that is open, when one is. */
  readonly open: OpenEditor | undefined
  /** The accessible name of the in-cell field. */
  readonly editLabel: string
  /** The hint the in-cell field carries. */
  readonly editHint: string
  /**
   * The rectangle the clipboard holds, when one does.
   *
   * Excel draws its marching-ants outline over the range a copy or a cut took
   * until the reader pastes it or presses `Escape`; the grid paints the frame
   * from this rectangle.
   */
  readonly clipboard: SelectionBounds | undefined
  /** Open the editor on a cell, seeded the way the key press asked. */
  begin: (point: GridPoint, entry: EditEntry, typed: string) => void
  /** Replace the open editor's draft. */
  draft: (text: string) => void
  /** Record the open editor's draft and close it. */
  commit: () => void
  /** Close the open editor, leaving the cell as it was. */
  cancel: () => void
  /** Take the marching-ants outline down. */
  cancelClipboard: () => void
  /** Clear every populated cell a rectangle covers. */
  clear: (bounds: SelectionBounds) => void
  /** Put a rectangle on the clipboard as tab-separated text. */
  copy: (bounds: SelectionBounds) => void
  /** Copy a rectangle and then clear it, the way Excel's cut does. */
  cut: (bounds: SelectionBounds) => void
  /** Write the clipboard's text from a top-left position. */
  paste: (point: GridPoint) => void
  /** Extend a rectangle into the filled rectangle a drag chose. */
  fill: (source: SelectionBounds, target: SelectionBounds) => void
  /** Copy each selected column's top cell over the rows beneath it. */
  fillDown: (bounds: SelectionBounds) => void
  /** Copy each selected row's left cell across the columns beside it. */
  fillRight: (bounds: SelectionBounds) => void
  undo: () => void
  redo: () => void
}

/**
 * The in-cell editor's seat, as the grid hands it to the one cell it edits.
 *
 * The cell that draws the field is the cell the editor names, so the field
 * inherits that cell's rectangle rather than being positioned against the grid.
 */
export interface CellEditorSeat {
  readonly editor: OpenEditor
  /** The field's accessible name. */
  readonly label: string
  /** The hint the field carries. */
  readonly hint: string
  readonly onDraft: (text: string) => void
  readonly onCommit: (columnStep: number, rowStep: number) => void
  readonly onCancel: () => void
}

/** Props the grid needs from its host. */
export interface SheetGridProps {
  /** The sheet to draw. */
  readonly sheet: XlsxSheet
  /** The viewer's scale, applied as `zoom` so layout space stays unzoomed. */
  readonly scale: number
  /** Binds the scrollport the document owner restores across remounts. */
  readonly resizeObserver: (node: HTMLDivElement | null) => void
  /** The selection the grid draws and mutates. */
  readonly controller: GridSelectionHandle
  /** The accessible name of the select-all box at the bands' crossing. */
  readonly selectAllLabel: string
  /**
   * The editing surface, absent when the workbook is only being read.
   *
   * A grid without one behaves exactly as a preview always did: the keyboard
   * moves the selection, a double click takes the whole sheet, and the fill
   * handle is inert.
   */
  readonly editing?: GridEditing
}

/**
 * Draw one sheet.
 * @param props - the sheet, the scale it is shown at, and the selection to draw.
 * @returns the scrollable worksheet surface.
 */
export function SheetGrid({ sheet, scale, resizeObserver, controller, selectAllLabel, editing }: SheetGridProps): ReactNode {
  const geometry = useMemo(() => buildGridGeometry(sheet), [sheet])
  const merges = useMemo(
    () => buildMergeIndex(sheet, (column, row) => `${columnName(column)}${row + 1}`),
    [sheet],
  )
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [offset, setOffset] = useState({ left: 0, top: 0 })
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  // A degenerate scale reaches here only from a spec; laying out at actual size
  // keeps every offset finite rather than dividing them into infinity.
  const factor = scale > 0 ? scale : 1
  // The rectangle the selection covers, which the keyboard, the pointer, and
  // every clipboard command all read.
  const bounds = selectionBounds(controller.selection)

  const bindStage = useCallback((node: HTMLDivElement | null): void => {
    stageRef.current = node
    resizeObserver(node)
    setStageSize({ width: node?.clientWidth ?? 0, height: node?.clientHeight ?? 0 })
    // The document owner restores the previous scroll offset across remounts,
    // so the virtual window starts where the reader left it rather than at the
    // sheet's origin.
    setOffset({ left: node?.scrollLeft ?? 0, top: node?.scrollTop ?? 0 })
  }, [resizeObserver])

  // The scrollport's offset converted into the sheet's own pixels, which is the
  // space every offset in `geometry` is stated in.
  const scrolledLeft = offset.left / factor
  const scrolledTop = offset.top / factor

  const scrollActiveIntoView = useCallback((point: GridPoint): void => {
    // The stage is bound before the effect that calls this runs, because the
    // ref callback fires during the same commit as the mount.
    const node = stageRef.current as HTMLDivElement
    const columnPosition = visibleColumnPosition(sheet, point.column)
    const rowPosition = visibleRowPosition(sheet, point.row)
    if (columnPosition === undefined || rowPosition === undefined) return
    const frozenColumns = sheet.freeze.columns
    const frozenRows = sheet.freeze.rows
    const paneLeft = frozenColumns === 0 ? 0 : columnOffsetAt(geometry, frozenColumns)
    const paneTop = frozenRows === 0 ? 0 : rowOffsetAt(geometry, frozenRows)
    const viewLeft = node.scrollLeft / factor
    const viewTop = node.scrollTop / factor
    const viewWidth = node.clientWidth / factor
    const viewHeight = node.clientHeight / factor
    if (columnPosition >= frozenColumns) {
      const left = columnOffsetAt(geometry, columnPosition)
      const right = columnEdge(geometry, columnPosition)
      if (left < viewLeft + paneLeft) node.scrollLeft = Math.max(0, (left - paneLeft) * factor)
      else if (right > viewLeft + viewWidth) node.scrollLeft = (right - viewWidth) * factor
    }
    if (rowPosition >= frozenRows) {
      const top = rowOffsetAt(geometry, rowPosition)
      const bottom = rowEdge(geometry, rowPosition)
      if (top < viewTop + paneTop) node.scrollTop = Math.max(0, (top - paneTop) * factor)
      else if (bottom > viewTop + viewHeight) node.scrollTop = (bottom - viewHeight) * factor
    }
  }, [factor, geometry, sheet])

  const bodyHeight = Math.max(0, stageSize.height - HEADER_SIZE * factor) / factor
  const bodyWidth = Math.max(0, stageSize.width - HEADER_SIZE * factor) / factor
  const rows = useMemo(
    () => renderRange(sheet.index2d.rows.length, sheet.freeze.rows, geometry.rowOffsets, scrolledTop, scrolledTop + bodyHeight),
    [bodyHeight, geometry.rowOffsets, scrolledTop, sheet],
  )
  const columns = useMemo(
    () => renderRange(sheet.index2d.columns.length, sheet.freeze.columns, geometry.columnOffsets, scrolledLeft, scrolledLeft + bodyWidth),
    [bodyWidth, geometry.columnOffsets, scrolledLeft, sheet],
  )
  const rowCells = useMemo(() => {
    const lookup = new Map<number, ReadonlyMap<number, XlsxCell>>()
    for (const row of rows) {
      const cells = new Map<number, XlsxCell>()
      // A sheet may number its rows sparsely, so a mounted position can name a
      // row the workbook never wrote; it simply carries nothing.
      for (const cell of rowAt(sheet, row)?.cells ?? []) cells.set(cell.column, cell)
      lookup.set(row, cells)
    }
    return lookup
  }, [rows, sheet])

  // A band press leaves the keyboard on the grid, as Excel keeps it, because
  // the bands are the scrollport's siblings rather than its children.
  const focusStage = useCallback((): void => { stageRef.current?.focus() }, [])

  // A press lands on whichever element the browser puts under the pointer,
  // which is a cell's own text box rather than the cell that carries the
  // address, so the cell is found by walking up from the target. A press that
  // reaches no cell — the surface between cells, a band, a stray node that
  // claims an address it cannot parse — selects nothing. The DOM targets an
  // element for every event it dispatches through this tree, which is narrower
  // than React's own `EventTarget` type.
  const pointUnder = useCallback((event: MouseEvent<HTMLDivElement>): GridPoint | undefined => {
    const host = (event.target as Element).closest<HTMLElement>('[data-xlsx-cell]')
    const reference = host?.dataset.xlsxCell
    return reference === undefined ? undefined : parsePointReference(reference)
  }, [])

  // A press holds the selection open, and a press on the fill handle holds a
  // fill open instead. The window owns the release because a drag that ends
  // outside the grid must not leave either one stuck open.
  const dragging = useRef(false)
  const filling = useRef<{ readonly source: SelectionBounds; readonly target: SelectionBounds } | undefined>(undefined)
  const [fillPreview, setFillPreview] = useState<SelectionBounds>()
  useEffect(() => {
    const finish = (): void => {
      dragging.current = false
      const fill = filling.current
      filling.current = undefined
      setFillPreview(undefined)
      // A handle the reader pressed without moving has nothing to fill, and a
      // rectangle that only shrank would write the selection back over itself.
      if (fill === undefined || !extendsBounds(fill.source, fill.target)) return
      editing?.fill(fill.source, fill.target)
      // Excel leaves the whole filled rectangle selected, which is what makes a
      // second drag continue the series it just wrote.
      controller.selectPoint({ column: fill.target.left, row: fill.target.top }, false)
      controller.extendTo({ column: fill.target.right, row: fill.target.bottom })
    }
    // A cancelled pointer is a gesture the browser took away, so the rectangle
    // it was outlining is abandoned rather than written.
    const abort = (): void => {
      dragging.current = false
      filling.current = undefined
      setFillPreview(undefined)
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', abort)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', abort)
    }
  }, [controller, editing])

  const startFill = useCallback((): void => {
    filling.current = { source: bounds, target: bounds }
    setFillPreview(bounds)
  }, [bounds])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    // A press inside the field the reader is typing into belongs to the field.
    if ((event.target as Element).closest('[data-xlsx-cell-editor]') !== null) return
    const point = pointUnder(event)
    if (point === undefined) return
    // The grid takes the keyboard on a press, so the arrows work straight after
    // the pointer has put the selection somewhere.
    focusStage()
    // A press on another cell confirms an open editor, as Excel's does.
    editing?.commit()
    dragging.current = true
    if (event.shiftKey) controller.extendTo(point)
    else controller.selectPoint(point, false)
  }, [controller, editing, focusStage, pointUnder])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const fill = filling.current
    if (fill !== undefined) {
      const point = pointUnder(event)
      if (point !== undefined) {
        const target = extendedBounds(fill.source, point)
        filling.current = { source: fill.source, target }
        setFillPreview(target)
      }
      return
    }
    if (!dragging.current) return
    const point = pointUnder(event)
    if (point !== undefined) controller.extendTo(point)
  }, [controller, pointUnder])

  // A double click opens the editor on the cell it lands in, which is how Excel
  // begins an edit without the keyboard.
  const handleDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>): void => {
    const point = pointUnder(event)
    if (point !== undefined) editing?.begin(point, 'append', '')
  }, [editing, pointUnder])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>): void => {
    // A grid with no editing surface keeps every key for the selection, exactly
    // as a preview always did.
    if (editing === undefined) {
      controller.onKeyDown(event)
      return
    }
    // `Escape` takes the marching-ants outline down first, which is how Excel
    // dismisses a copied range; the selection has no other use for the key.
    if (event.key === 'Escape') {
      if (editing.clipboard !== undefined) {
        event.preventDefault()
        editing.cancelClipboard()
      }
      return
    }
    // The field owns every key while it is open — the arrows walk the caret
    // rather than the selection — and it reports its own endings.
    if (editing.open !== undefined) return
    const command = sheetCommandFor(event.key, event)
    if (command !== undefined) {
      event.preventDefault()
      if (command === 'copy') editing.copy(bounds)
      else if (command === 'cut') editing.cut(bounds)
      else if (command === 'paste') editing.paste(controller.active)
      else if (command === 'fillDown') editing.fillDown(bounds)
      else if (command === 'fillRight') editing.fillRight(bounds)
      else if (command === 'undo') editing.undo()
      else editing.redo()
      return
    }
    const edit = gridEditCommand(event.key, event)
    if (edit === undefined) {
      controller.onKeyDown(event)
      return
    }
    event.preventDefault()
    if (edit.kind === 'clear') editing.clear(bounds)
    else editing.begin(controller.active, edit.entry, edit.text)
  }, [bounds, controller, editing])

  // The field the open editor draws, handed to whichever cell it edits. A grid
  // the reader cannot edit, and a grid whose editor is closed, both have no
  // field — which is why the seat carries the commit rather than a callback
  // that would have to re-test for a log it can never be without.
  const seat = useMemo<CellEditorSeat | undefined>(() => {
    const session = editing
    const open = session?.open
    if (session === undefined || open === undefined) return undefined
    return {
      editor: open,
      label: session.editLabel,
      hint: session.editHint,
      onDraft: session.draft,
      // The grid moves the selection a commit asks for rather than the log
      // doing it, so the log never has to know which cell is on screen.
      onCommit: (columnStep, rowStep) => {
        session.commit()
        controller.goTo(pointReference(movePoint(controller.active, columnStep, rowStep, sheet.extent)))
      },
      onCancel: session.cancel,
    }
  }, [controller, editing, sheet.extent])

  // The active cell follows every move the keyboard makes, so the grid keeps
  // it in sight rather than scrolling only when a pointer asked for it.
  const activeColumn = controller.active.column
  const activeRow = controller.active.row
  useEffect(() => {
    scrollActiveIntoView({ column: activeColumn, row: activeRow })
  }, [activeColumn, activeRow, scrollActiveIntoView])

  const contentWidth = HEADER_SIZE + geometry.width
  const contentHeight = HEADER_SIZE + geometry.height
  const bandSize = HEADER_SIZE * factor

  return (
    <div className={css.shell} style={sheetPalette}>
      <div
        ref={bindStage}
        className={css.stage}
        tabIndex={0}
        data-xlsx-stage
        role="grid"
        aria-label={sheet.name}
        onKeyDown={handleKeyDown}
        onScroll={(event) => { setOffset({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }) }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onDoubleClick={handleDoubleClick}
      >
        <div
          className={css.content}
          style={{ width: `${contentWidth}px`, height: `${contentHeight}px`, zoom: factor }}
          data-xlsx-sheet-content
        >
          {columns.map(position => rows.map(rowPosition => (
            <CellView
              key={`${position}:${rowPosition}`}
              sheet={sheet}
              geometry={geometry}
              merges={merges}
              selection={controller.selection}
              cells={rowCells.get(rowPosition) as ReadonlyMap<number, XlsxCell>}
              position={position}
              rowPosition={rowPosition}
              scrolled={{ left: scrolledLeft, top: scrolledTop }}
              seat={seat}
            />
          )))}
          {sheet.freeze.rows > 0 && (
            <div
              className={css.frozenSeam}
              style={{
                top: `${HEADER_SIZE + rowOffsetAt(geometry, sheet.freeze.rows) + scrolledTop}px`,
                left: `${HEADER_SIZE}px`,
              }}
              data-xlsx-frozen-rows
            />
          )}
          {sheet.freeze.columns > 0 && (
            <div
              className={css.frozenSeamVertical}
              style={{
                left: `${HEADER_SIZE + columnOffsetAt(geometry, sheet.freeze.columns) + scrolledLeft}px`,
                top: `${HEADER_SIZE}px`,
              }}
              data-xlsx-frozen-columns
            />
          )}
          <FillPreview
            geometry={geometry}
            bounds={fillPreview}
            scrolled={{ left: scrolledLeft, top: scrolledTop }}
          />
          <ClipboardFrame
            geometry={geometry}
            bounds={editing?.clipboard}
            scrolled={{ left: scrolledLeft, top: scrolledTop }}
          />
          <ActiveFrame
            geometry={geometry}
            bounds={bounds}
            scale={factor}
            scrolled={{ left: scrolledLeft, top: scrolledTop }}
            onFillStart={editing === undefined ? undefined : startFill}
          />
        </div>
      </div>
      {sheet.showHeaders && (
        <>
          <div
            className={`${css.band} ${css.rowBand}`}
            style={{ top: `${bandSize}px`, bottom: 0, width: `${bandSize}px` }}
            data-xlsx-row-band
          >
            <div className={css.bandShift} style={{ transform: `translateY(${-offset.top}px)` }}>
              <div className={css.bandLayer} style={{ width: `${HEADER_SIZE}px`, zoom: factor }}>
                {rows.map((position) => {
                  // A mounted position always names a real row, because the
                  // window was built from the sheet's own row index.
                  const row = sheet.index2d.rows[position]
                  const frozen = row < sheet.freeze.rows
                  const selected = row >= bounds.top && row <= bounds.bottom
                  const current = row === controller.active.row
                  return (
                    <div
                      key={`row-${position}`}
                      className={[
                        css.rowHeader,
                        frozen ? css.pinned : '',
                        selected ? css.headerSelected : '',
                        current ? css.headerActive : '',
                      ].filter(part => part !== '').join(' ')}
                      style={{
                        top: `${rowOffsetAt(geometry, position) + (frozen ? scrolledTop : 0)}px`,
                        width: `${HEADER_SIZE}px`,
                        height: `${positionHeight(geometry, position)}px`,
                      }}
                      data-xlsx-row-header={row + 1}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        focusStage()
                        controller.selectRow(row, event.shiftKey)
                      }}
                    >
                      {row + 1}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div
            className={`${css.band} ${css.columnBand}`}
            style={{ left: `${bandSize}px`, right: 0, height: `${bandSize}px` }}
            data-xlsx-column-band
          >
            <div className={css.bandShift} style={{ transform: `translateX(${-offset.left}px)` }}>
              <div
                className={css.bandLayer}
                style={{ width: `${geometry.width}px`, height: `${HEADER_SIZE}px`, zoom: factor }}
              >
                {columns.map((position) => {
                  const column = sheet.index2d.columns[position]
                  const frozen = column < sheet.freeze.columns
                  const selected = column >= bounds.left && column <= bounds.right
                  const current = column === controller.active.column
                  return (
                    <div
                      key={`column-${position}`}
                      className={[
                        css.columnHeader,
                        frozen ? css.pinned : '',
                        selected ? css.headerSelected : '',
                        current ? css.headerActive : '',
                      ].filter(part => part !== '').join(' ')}
                      style={{
                        left: `${columnOffsetAt(geometry, position) + (frozen ? scrolledLeft : 0)}px`,
                        width: `${positionWidth(geometry, position)}px`,
                        height: `${HEADER_SIZE}px`,
                      }}
                      data-xlsx-column-header={columnName(column)}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        focusStage()
                        controller.selectColumn(column, event.shiftKey)
                      }}
                    >
                      {columnName(column)}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div
            className={css.corner}
            style={{ width: `${bandSize}px`, height: `${bandSize}px` }}
            data-xlsx-corner
            role="button"
            aria-label={selectAllLabel}
            onPointerDown={(event) => {
              event.stopPropagation()
              focusStage()
              controller.selectSheet()
            }}
          />
        </>
      )}
    </div>
  )
}

/** One mounted grid position. */
function CellView({ sheet, geometry, merges, selection, cells, position, rowPosition, scrolled, seat }: {
  readonly sheet: XlsxSheet
  readonly geometry: GridGeometry
  readonly merges: MergeIndex
  readonly selection: GridSelection
  readonly cells: ReadonlyMap<number, XlsxCell>
  readonly position: number
  readonly rowPosition: number
  readonly scrolled: { readonly left: number; readonly top: number }
  /** The in-cell editor, when one is open on this sheet. */
  readonly seat: CellEditorSeat | undefined
}): ReactNode {
  // A mounted position always names a real column and row, and its row always
  // carries a cell lookup, because the window was built from those indexes.
  const sheetColumn = sheet.index2d.columns[position]
  const sheetRow = sheet.index2d.rows[rowPosition]
  const reference = `${columnName(sheetColumn)}${sheetRow + 1}`
  const merge = merges.start.get(reference)
  // A position inside a region but not at its anchor is drawn by the anchor.
  if (merge === undefined && merges.covered.has(reference)) return null

  const cell = cells.get(sheetColumn)
  // A frozen pane does not scroll, so its positions add back exactly the offset
  // the scrollport moved them by.
  const frozenColumn = sheetColumn < sheet.freeze.columns
  const frozenRow = sheetRow < sheet.freeze.rows
  const left = HEADER_SIZE + columnOffsetAt(geometry, position) + (frozenColumn ? scrolled.left : 0)
  const top = HEADER_SIZE + rowOffsetAt(geometry, rowPosition) + (frozenRow ? scrolled.top : 0)
  const width = merge === undefined
    ? positionWidth(geometry, position)
    : spanWidth(geometry, position, merge.right - merge.left + 1)
  const height = merge === undefined
    ? positionHeight(geometry, rowPosition)
    : spanHeight(geometry, rowPosition, merge.bottom - merge.top + 1)
  const selected = isSelected(selection, sheetColumn, sheetRow)
  // The active cell carries its own frame, so it never takes the selection
  // wash as well — Excel keeps it the one cell that reads as "current".
  const isActive = selection.focus.column === sheetColumn && selection.focus.row === sheetRow

  let textLeft = left
  let textWidth = width
  if (cell !== undefined && merge === undefined) {
    const span = spillSpan(sheet, sheetRow, position, clipsToCell(cell))
    textLeft = HEADER_SIZE + columnOffsetAt(geometry, span.first) + (frozenColumn ? scrolled.left : 0)
    textWidth = spillWidth(geometry, span)
  }
  // The editor replaces the cell's own painting rather than sitting beside it,
  // which is what Excel does and why the two never show at once.
  const editing = seat !== undefined && seat.editor.column === sheetColumn && seat.editor.row === sheetRow
    ? seat
    : undefined
  // While the draft needs more room than the cell has, the field grows over the
  // empty neighbours beside it, in the direction the cell's alignment points —
  // the growth Excel's own edit field makes as a value is typed.
  let editorLeft = 0
  let editorWidth = width
  if (editing !== undefined) {
    const font = cell?.format.font
    const needed = Math.ceil(textWidthPx(editing.editor.text, {
      family: font?.family ?? 'Calibri',
      sizePx: font?.sizePx ?? CELL_FONT_SIZE,
      bold: font?.bold,
      italic: font?.italic,
    })) + CELL_PADDING_LEFT + CELL_PADDING_RIGHT + 1
    const span = editorSpan(
      sheet, sheetRow, position, editorSpillDirection(cell), needed, width,
    )
    editorLeft = columnOffsetAt(geometry, span.first) - columnOffsetAt(geometry, position)
    editorWidth = Math.max(width, spillWidth(geometry, span))
  }

  return (
    <div
      className={`${css.cell}${frozenColumn || frozenRow ? ` ${css.pinned}` : ''}`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        // A cell paints only when it states a fill of its own: the sheet's paper
        // comes from the stage behind it, which is what lets a neighbour's
        // spilled text show across an empty position the way Excel draws it.
        background: selected && !isActive ? selectedFill(cell?.format.fill) : cell?.format.fill,
        ...(cell === undefined ? {} : borderStyle(cell)),
      }}
      data-xlsx-cell={reference}
      role="gridcell"
      aria-selected={selected}
    >
      {editing !== undefined && (
        <CellEditor
          text={editing.editor.text}
          entry={editing.editor.entry}
          label={editing.label}
          hint={editing.hint}
          style={{
            left: `${editorLeft}px`,
            width: `${editorWidth}px`,
            ...(cell === undefined ? {} : {
              fontFamily: `"${cell.format.font.family}", ${CELL_FONT_FAMILY}`,
              fontSize: `${cell.format.font.sizePx}px`,
              fontWeight: cell.format.font.bold ? 700 : 400,
              fontStyle: cell.format.font.italic ? 'italic' : 'normal',
              color: cell.format.font.color ?? CELL_TEXT_COLOR,
              ...textPlacement(cell),
            }),
          }}
          onDraft={editing.onDraft}
          onCommit={editing.onCommit}
          onCancel={editing.onCancel}
        />
      )}
      {editing === undefined && cell !== undefined && cell.text !== '' && (
        <div
          className={css.text}
          style={{
            left: `${textLeft - left}px`,
            width: `${textWidth}px`,
            height: `${height}px`,
            paddingLeft: `${CELL_PADDING_LEFT}px`,
            paddingRight: `${CELL_PADDING_RIGHT}px`,
            fontFamily: `"${cell.format.font.family}", ${CELL_FONT_FAMILY}`,
            fontSize: `${cell.format.font.sizePx}px`,
            fontWeight: cell.format.font.bold ? 700 : 400,
            fontStyle: cell.format.font.italic ? 'italic' : 'normal',
            color: cell.hyperlink === undefined ? cell.format.font.color ?? CELL_TEXT_COLOR : HYPERLINK_COLOR,
            lineHeight: cellLineHeight(cell),
            whiteSpace: cell.format.alignment.wrapText ? 'pre-wrap' : 'nowrap',
            textDecoration: cell.hyperlink === undefined
              ? [
                cell.format.font.underline ? 'underline' : '',
                cell.format.font.strike ? 'line-through' : '',
              ].filter(part => part !== '').join(' ') || undefined
              : 'underline',
            ...textPlacement(cell),
            ...rotationStyle(cell.format.alignment.rotation),
          }}
        >
          {cell.text}
        </div>
      )}
    </div>
  )
}

/**
 * The pixel width a merge region spans.
 * @param geometry - the sheet's geometry.
 * @param position - the anchor's visible position.
 * @param count - how many positions the region covers.
 * @returns the pixel width.
 */
function spanWidth(geometry: GridGeometry, position: number, count: number): number {
  const last = Math.min(position + count - 1, geometry.columnOffsets.length - 1)
  return columnOffsetAt(geometry, last) + positionWidth(geometry, last) - columnOffsetAt(geometry, position)
}

/**
 * The pixel height a merge region spans.
 * @param geometry - the sheet's geometry.
 * @param position - the anchor's visible position.
 * @param count - how many positions the region covers.
 * @returns the pixel height.
 */
function spanHeight(geometry: GridGeometry, position: number, count: number): number {
  const last = Math.min(position + count - 1, geometry.rowOffsets.length - 1)
  return rowEdge(geometry, last) - rowOffsetAt(geometry, position)
}

/**
 * The frame Excel draws around the active cell, with its fill handle.
 * @param props - the geometry, the selection bounds, and the viewer's scale.
 * @returns the frame and its handle.
 */
function ActiveFrame({ geometry, bounds, scale, scrolled, onFillStart }: {
  readonly geometry: GridGeometry
  readonly bounds: SelectionBounds
  readonly scale: number
  readonly scrolled: { readonly left: number; readonly top: number }
  /** Starts a fill drag, absent when the sheet is only being read. */
  readonly onFillStart?: () => void
}): ReactNode {
  const rect = boundsRect(geometry, bounds, scrolled)
  if (rect === undefined) return null
  const multiple = !(bounds.top === bounds.bottom && bounds.left === bounds.right)
  // The handle keeps one size on screen, so it is laid out divided by the zoom
  // the sheet is drawn at. `scale` has already been cleared of the degenerate
  // zero that reached the grid from a spec.
  const handle = FILL_HANDLE_SIZE / scale
  return (
    <>
      {multiple && (
        <div
          className={css.selectionWash}
          style={{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
          data-xlsx-selection
        />
      )}
      <div
        className={css.activeFrame}
        style={{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
        data-xlsx-active-frame
      />
      {/* Excel draws the handle on the corner of whatever is selected, not only
          on a single cell — a run of two cells is what makes a fill continue a
          series instead of repeating one value, so a range has to be able to
          start one. */}
      <div
        className={css.fillHandle}
        style={{
          left: `${rect.left + rect.width - handle}px`,
          top: `${rect.top + rect.height - handle}px`,
          width: `${handle}px`,
          height: `${handle}px`,
        }}
        data-xlsx-fill-handle
        onPointerDown={onFillStart === undefined ? undefined : (event) => {
          // The drag is the grid's own; the press must not also move the
          // selection onto the cell the handle happens to sit over.
          event.stopPropagation()
          onFillStart()
        }}
      />
    </>
  )
}

/**
 * The outline Excel draws around the rectangle a fill drag covers.
 *
 * It is drawn while the pointer is still down, so the reader can see how far
 * the fill reaches before committing to it; the filled rectangle is only
 * written on release.
 * @param props - the geometry, the covered rectangle, and the scroll offset.
 * @returns the outline, or nothing while no drag is running.
 */
function FillPreview({ geometry, bounds, scrolled }: {
  readonly geometry: GridGeometry
  readonly bounds: SelectionBounds | undefined
  readonly scrolled: { readonly left: number; readonly top: number }
}): ReactNode {
  if (bounds === undefined) return null
  // The outline extends a rectangle the grid has already proved it can draw, and
  // reaches only positions the pointer found on screen, so every position it
  // names is drawable too.
  const rect = boundsRect(geometry, bounds, scrolled) as Rect
  return (
    <div
      className={css.fillPreview}
      style={{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
      data-xlsx-fill-preview
    />
  )
}

/**
 * The marching-ants outline Excel draws around the range the clipboard holds.
 *
 * An SVG rectangle carries the dashes so the animation walks `stroke-dashoffset`
 * — the marching effect a dashed CSS border cannot make — and the dash period
 * and its travel share one length so the loop never jumps.
 * @param props - the geometry, the clipboard's rectangle, and the scroll offset.
 * @returns the outline, or nothing while the clipboard holds no rectangle.
 */
function ClipboardFrame({ geometry, bounds, scrolled }: {
  readonly geometry: GridGeometry
  readonly bounds: SelectionBounds | undefined
  readonly scrolled: { readonly left: number; readonly top: number }
}): ReactNode {
  if (bounds === undefined) return null
  const rect = boundsRect(geometry, bounds, scrolled)
  if (rect === undefined) return null
  return (
    <svg
      className={css.clipboardFrame}
      style={{ left: `${rect.left}px`, top: `${rect.top}px` }}
      width={rect.width}
      height={rect.height}
      data-xlsx-clipboard-frame
    >
      <rect
        className={css.clipboardAnts}
        x={ANT_INSET}
        y={ANT_INSET}
        width={Math.max(0, rect.width - ANT_INSET * 2)}
        height={Math.max(0, rect.height - ANT_INSET * 2)}
      />
    </svg>
  )
}
