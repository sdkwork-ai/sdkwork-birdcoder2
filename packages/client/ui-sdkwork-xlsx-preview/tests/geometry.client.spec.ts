// @vitest-environment node
/** Worksheet layout arithmetic: conversions, visible positions, and windows. */
import { describe, expect, it } from 'vitest'
import { DEFAULT_FORMAT, makeCell, makeSheet } from './sheet-fixture.client.ts'
import {
  buildGridGeometry, clipsToCell, columnOffsetAt, columnWidthToPx, DEFAULT_LINE_HEIGHT, fitScale,
  gridLength, lastPositionWithin, lineHeightFor, MIN_GRID_COLUMNS, MIN_GRID_ROWS, MIN_ZOOM, positionAtOffset,
  rowHeightToPx, rowOffsetAt, usedRangeSize, visibleColumnWidth,
  visibleColumns, visibleRange, visibleRowHeight, visibleRows,
} from '../src/client/render/geometry.ts'
import { CELL_FONT_SIZE } from '../src/client/xlsx/excel.ts'
import type { XlsxAlignment, XlsxCellFormat } from '../src/client/xlsx/model.ts'

describe('unit conversion', () => {
  it('converts Excel character widths and point heights to pixels', () => {
    expect(columnWidthToPx(8.43)).toBe(64)
    expect(columnWidthToPx(20)).toBe(145)
    expect(rowHeightToPx(15)).toBe(20)
    expect(rowHeightToPx(30)).toBe(40)
    expect(lineHeightFor(12)).toBe(15)
    expect(DEFAULT_LINE_HEIGHT).toBe(lineHeightFor(CELL_FONT_SIZE))
  })
})

describe('visible positions', () => {
  it('drops hidden columns and rows from the index', () => {
    const widths = new Map([[1, 0]])
    const heights = new Map([[2, 0]])
    expect(visibleColumns(3, widths)).toEqual([0, 2, 3])
    expect(visibleRows(3, heights)).toEqual([0, 1, 3])
  })

  it('bounds the walk by the populated extent', () => {
    expect(visibleColumns(0, new Map())).toEqual([0])
    expect(visibleRows(0, new Map())).toEqual([0])
  })

  it('keeps the empty tail a grid walks to fill the page, inside the sheet limits', () => {
    // A brand-new workbook still lays out a page's worth of paper.
    expect(gridLength(1, MIN_GRID_COLUMNS, 16384)).toBe(1024)
    expect(gridLength(1, MIN_GRID_ROWS, 1_048_576)).toBe(4096)
    // A sheet larger than the floor keeps its own size, and a malformed one is
    // still held to the worksheet's own limits.
    expect(gridLength(5000, 1024, 16384)).toBe(5000)
    expect(gridLength(999_999, 4096, 16_384)).toBe(16_384)
  })
})

describe('geometry', () => {
  it('lays out the visible positions in order', () => {
    const sheet = makeSheet({
      columns: 3,
      rows: 3,
      columnWidths: new Map([[0, 100], [2, 0]]),
      rowHeights: new Map([[1, 30]]),
      defaultColumnWidth: 50,
      defaultRowHeight: 20,
    })
    const geometry = buildGridGeometry(sheet)
    // Column C is hidden, so it contributes neither width nor offset.
    expect(geometry.columnOffsets).toEqual([0, 100, 150])
    expect(geometry.rowOffsets).toEqual([0, 20, 50, 70])
    expect(geometry.width).toBe(200)
    expect(geometry.height).toBe(90)
    expect(columnOffsetAt(geometry, 1)).toBe(100)
    expect(rowOffsetAt(geometry, 2)).toBe(50)
    // An out-of-range position reports the sheet's edge.
    expect(columnOffsetAt(geometry, 9)).toBe(200)
    expect(rowOffsetAt(geometry, 9)).toBe(90)
    expect(columnOffsetAt(geometry, -1)).toBe(0)
    expect(rowOffsetAt(geometry, -1)).toBe(0)
  })

  it('measures a visible position from the index', () => {
    const sheet = makeSheet({
      columns: 2,
      rows: 2,
      columnWidths: new Map([[0, 0], [1, 90]]),
      rowHeights: new Map([[0, 0]]),
      defaultColumnWidth: 50,
      defaultRowHeight: 20,
    })
    expect(visibleColumnWidth(sheet, 0)).toBe(90)
    expect(visibleColumnWidth(sheet, 5)).toBe(0)
    expect(visibleRowHeight(sheet, 0)).toBe(20)
    expect(visibleRowHeight(sheet, 5)).toBe(0)
  })

  it('never reports a negative size', () => {
    const sheet = makeSheet({ columns: 1, rows: 1, columnWidths: new Map([[0, -5]]), rowHeights: new Map([[0, -5]]) })
    expect(visibleColumnWidth(sheet, 0)).toBe(0)
    expect(visibleRowHeight(sheet, 0)).toBe(0)
  })
})

describe('position lookup', () => {
  const offsets = [0, 20, 40, 60]

  it('finds the position a pixel lands in', () => {
    expect(positionAtOffset(offsets, -10)).toBe(0)
    expect(positionAtOffset(offsets, 0)).toBe(0)
    expect(positionAtOffset(offsets, 25)).toBe(1)
    expect(positionAtOffset(offsets, 400)).toBe(3)
    expect(positionAtOffset([], 12)).toBe(0)
  })

  it('reports the last position inside an extent', () => {
    expect(lastPositionWithin(offsets, 41)).toBe(2)
    expect(lastPositionWithin(offsets, 0)).toBe(0)
    expect(lastPositionWithin([], 41)).toBe(-1)
  })
})

describe('visible window', () => {
  const offsets = [0, 20, 40, 60, 80, 100]

  it('covers the scrolled window plus its overscan', () => {
    expect(visibleRange(offsets, 40, 80, 1)).toEqual({ first: 1, last: 5 })
    expect(visibleRange(offsets, 0, 0, 2)).toEqual({ first: 0, last: 4 })
    expect(visibleRange([], 0, 100, 2)).toEqual({ first: 0, last: -1 })
  })

  it('keeps a full screen mounted before the stage is measured', () => {
    expect(visibleRange(offsets, 10, 10, 0)).toEqual({ first: 0, last: 2 })
  })
})

describe('fit scale', () => {
  it('shrink-fits a sheet wider than its stage, never magnifying one', () => {
    const sheet = makeSheet({
      columns: 4,
      rows: 4,
      defaultColumnWidth: 100,
      defaultRowHeight: 100,
    })
    expect(fitScale(sheet, { width: 500, height: 500 })).toBeCloseTo(0.8692, 4)
    expect(fitScale(sheet, { width: 5000, height: 5000 })).toBe(1)
    expect(fitScale(sheet, { width: 0, height: 0 })).toBe(1)
  })

  it('reports actual size for a sheet with nothing laid out', () => {
    const empty = makeSheet({ columns: 0, rows: 0, columnWidths: new Map([[0, 0]]), rowHeights: new Map([[0, 0]]) })
    expect(fitScale(empty, { width: 400, height: 400 })).toBe(1)
  })

  it('fits the region the sheet uses, not the empty tail that fills the page', () => {
    // The grid lays out an empty tail past the content so the page is never
    // half blank; a fit that measured the tail would shrink a four-column table
    // to a speck instead of leaving it legible at actual size.
    const sheet = makeSheet({ columns: 3, rows: 2, defaultColumnWidth: 100, defaultRowHeight: 100 })
    expect(usedRangeSize(sheet, buildGridGeometry(sheet))).toEqual({ width: 400, height: 300 })
    expect(fitScale(sheet, { width: 500, height: 500 })).toBeCloseTo(1, 4)

    const padded = makeSheet({
      columns: 3,
      rows: 2,
      defaultColumnWidth: 100,
      defaultRowHeight: 100,
      index2dColumns: 1024,
      index2dRows: 4096,
    })
    expect(usedRangeSize(padded, buildGridGeometry(padded))).toEqual({ width: 400, height: 300 })
    expect(fitScale(padded, { width: 500, height: 500 })).toBeCloseTo(1, 4)
  })

  it('never shrinks a fit past the viewer’s own floor', () => {
    const tall = makeSheet({ columns: 3, rows: 800, defaultColumnWidth: 100, defaultRowHeight: 100 })
    expect(fitScale(tall, { width: 500, height: 200 })).toBe(MIN_ZOOM)
  })
})

describe('text confinement', () => {
  /**
   * The default format with one alignment override.
   * @param alignment - the alignment fields to replace.
   * @returns the cell format.
   */
  const aligned = (alignment: XlsxAlignment): XlsxCellFormat => ({
    ...DEFAULT_FORMAT,
    alignment,
  })

  it('spills only general-aligned or left-aligned text', () => {
    expect(clipsToCell(makeCell(0, 0, 'text'))).toBe(false)
    expect(clipsToCell(makeCell(0, 0, 'text', aligned({ ...DEFAULT_FORMAT.alignment, horizontal: 'left' })))).toBe(false)
  })

  it('confines a number, a centred value, and a wrapped value', () => {
    expect(clipsToCell(makeCell(0, 0, '42', DEFAULT_FORMAT, { kind: 'number' }))).toBe(true)
    expect(clipsToCell(makeCell(0, 0, 'x', aligned({ ...DEFAULT_FORMAT.alignment, horizontal: 'center' })))).toBe(true)
    expect(clipsToCell(makeCell(0, 0, 'x', aligned({ ...DEFAULT_FORMAT.alignment, horizontal: 'right' })))).toBe(true)
    expect(clipsToCell(makeCell(0, 0, 'x', aligned({ ...DEFAULT_FORMAT.alignment, horizontal: 'fill' })))).toBe(true)
    expect(clipsToCell(makeCell(0, 0, 'x', aligned({ ...DEFAULT_FORMAT.alignment, wrapText: true })))).toBe(true)
    expect(clipsToCell(makeCell(0, 0, 'x', aligned({ ...DEFAULT_FORMAT.alignment, rotation: 90 })))).toBe(true)
  })

  it('confines an oversized run', () => {
    const big = makeCell(0, 0, 'x', {
      ...DEFAULT_FORMAT,
      font: { ...DEFAULT_FORMAT.font, sizePx: CELL_FONT_SIZE * 3 },
    })
    expect(clipsToCell(big)).toBe(true)
  })

  it('confines a general-aligned date and boolean', () => {
    expect(clipsToCell(makeCell(0, 0, '01-01-21', DEFAULT_FORMAT, { kind: 'date' }))).toBe(true)
    expect(clipsToCell(makeCell(0, 0, 'TRUE', DEFAULT_FORMAT, { kind: 'boolean' }))).toBe(true)
  })
})
