// @vitest-environment node
/** Selection rectangles, names, and the cell/merge lookups the grid draws with. */
import { describe, expect, it } from 'vitest'
import { makeCell, makeSheet } from './sheet-fixture.client.ts'
import type { XlsxCell } from '../src/client/xlsx/model.ts'
import { buildMergeIndex, cellAt, editorSpan, editorSpillDirection, spillSpan } from '../src/client/render/cells.ts'
import {
  initialSelection, isSelected, selectionBounds, selectionName,
} from '../src/client/render/selection.ts'
import type { GridSelection } from '../src/client/render/selection.ts'
import { columnName, DEFAULT_FORMAT } from './sheet-fixture.client.ts'

/** The reference a column and row pair names. */
const referenceOf = (column: number, row: number): string => `${columnName(column)}${row + 1}`

describe('selection', () => {
  it('starts on the first visible cell', () => {
    const sheet = makeSheet({ columns: 3, rows: 3, columnWidths: new Map([[0, 0]]), rowHeights: new Map([[0, 0]]) })
    expect(initialSelection(sheet)).toEqual({
      anchor: { column: 1, row: 1 },
      focus: { column: 1, row: 1 },
      kind: 'cell',
    })
  })

  it('falls back to the origin when a sheet shows nothing', () => {
    const empty = makeSheet({ columns: 0, rows: 0, columnWidths: new Map([[0, 0]]), rowHeights: new Map([[0, 0]]) })
    expect(initialSelection(empty).focus).toEqual({ column: 0, row: 0 })
  })

  it('normalises a backwards drag into a rectangle', () => {
    const selection: GridSelection = {
      anchor: { column: 3, row: 4 },
      focus: { column: 1, row: 2 },
      kind: 'cell',
    }
    expect(selectionBounds(selection)).toEqual({ top: 2, left: 1, bottom: 4, right: 3 })
  })

  it('answers whether a position is selected for every kind', () => {
    const base = { anchor: { column: 1, row: 1 }, focus: { column: 2, row: 3 } }
    expect(isSelected({ ...base, kind: 'cell' }, 2, 3)).toBe(true)
    expect(isSelected({ ...base, kind: 'cell' }, 0, 0)).toBe(false)
    expect(isSelected({ ...base, kind: 'row' }, 9, 2)).toBe(true)
    expect(isSelected({ ...base, kind: 'row' }, 9, 0)).toBe(false)
    expect(isSelected({ ...base, kind: 'column' }, 2, 9)).toBe(true)
    expect(isSelected({ ...base, kind: 'column' }, 0, 9)).toBe(false)
    expect(isSelected({ ...base, kind: 'sheet' }, 99, 99)).toBe(true)
  })

  it('names every kind of selection as the Name Box prints it', () => {
    const single: GridSelection = {
      anchor: { column: 0, row: 1 },
      focus: { column: 0, row: 1 },
      kind: 'cell',
    }
    expect(selectionName(single, referenceOf, columnName)).toBe('A2')
    const range: GridSelection = {
      anchor: { column: 1, row: 1 },
      focus: { column: 2, row: 2 },
      kind: 'cell',
    }
    expect(selectionName(range, referenceOf, columnName)).toBe('B2:C3')
    const rows: GridSelection = {
      anchor: { column: 0, row: 1 },
      focus: { column: 4, row: 2 },
      kind: 'row',
    }
    expect(selectionName(rows, referenceOf, columnName)).toBe('2:3')
    const columns: GridSelection = {
      anchor: { column: 1, row: 0 },
      focus: { column: 2, row: 5 },
      kind: 'column',
    }
    expect(selectionName(columns, referenceOf, columnName)).toBe('B:C')
    const sheet: GridSelection = {
      anchor: { column: 0, row: 0 },
      focus: { column: 5, row: 5 },
      kind: 'sheet',
    }
    expect(selectionName(sheet, referenceOf, columnName)).toBe('A1')
  })
})

describe('cell lookup', () => {
  const sheet = makeSheet({
    columns: 3,
    rows: 3,
    cells: [makeCell(0, 0, 'a'), makeCell(2, 0, 'c'), makeCell(0, 2, 'z')],
  })

  it('reads a populated position and refuses an empty one', () => {
    expect(cellAt(sheet, 0, 0)?.text).toBe('a')
    expect(cellAt(sheet, 2, 0)?.text).toBe('c')
    expect(cellAt(sheet, 1, 0)).toBeUndefined()
    expect(cellAt(sheet, 0, 1)).toBeUndefined()
  })
})

describe('text spill', () => {
  it('confines a cell that states its own alignment', () => {
    const sheet = makeSheet({ columns: 4, rows: 0, cells: [makeCell(1, 0, 'wide')] })
    expect(spillSpan(sheet, 0, 1, true)).toEqual({ first: 1, last: 1, clipped: false })
  })

  it('spills rightward across empty neighbours up to the sheet edge', () => {
    const sheet = makeSheet({ columns: 4, rows: 0, cells: [makeCell(1, 0, 'wide')] })
    // Left-aligned text starts at its own cell and paints rightward only, the
    // direction its alignment points; it never reaches back over the empty
    // column to its left.
    expect(spillSpan(sheet, 0, 1, false)).toEqual({ first: 1, last: 4, clipped: false })
  })

  it('stops at the first occupied neighbour to the right', () => {
    const sheet = makeSheet({
      columns: 5,
      rows: 0,
      cells: [makeCell(0, 0, 'left'), makeCell(2, 0, 'wide'), makeCell(4, 0, 'right')],
    })
    // The span covers the empty positions up to the neighbour, and `clipped`
    // says the painted band is cut at that neighbour's left edge.
    expect(spillSpan(sheet, 0, 2, false)).toEqual({ first: 2, last: 3, clipped: true })
  })

  it('stops at the occupied neighbour right of a cell that does not begin the sheet', () => {
    const sheet = makeSheet({
      columns: 5,
      rows: 0,
      cells: [makeCell(1, 0, 'left'), makeCell(3, 0, 'wide'), makeCell(5, 0, 'right')],
    })
    expect(spillSpan(sheet, 0, 3, false)).toEqual({ first: 3, last: 4, clipped: true })
    expect(spillSpan(sheet, 0, 3, true)).toEqual({ first: 3, last: 3, clipped: false })
  })

  it('stops at the sheet edge when nothing occupies the right', () => {
    const sheet = makeSheet({ columns: 2, rows: 0, cells: [makeCell(0, 0, 'wide')] })
    expect(spillSpan(sheet, 0, 0, false)).toEqual({ first: 0, last: 2, clipped: false })
  })
})

describe('editorSpillDirection', () => {
  it('grows a fresh cell rightward, as general text types', () => {
    expect(editorSpillDirection(undefined)).toBe('right')
    expect(editorSpillDirection(makeCell(0, 0, 'x'))).toBe('right')
  })

  it('grows each alignment in the direction it points', () => {
    const withAlignment = (horizontal: 'left' | 'right' | 'center'): XlsxCell => makeCell(0, 0, 'x', {
      ...DEFAULT_FORMAT,
      alignment: { ...DEFAULT_FORMAT.alignment, horizontal },
    }, { kind: horizontal === 'right' ? 'number' : 'string' })
    expect(editorSpillDirection(withAlignment('left'))).toBe('right')
    expect(editorSpillDirection(withAlignment('right'))).toBe('left')
    expect(editorSpillDirection(withAlignment('center'))).toBe('both')
  })

  it('keeps a wrapped, rotated, filled, or oversized cell inside its own box', () => {
    const base = { ...DEFAULT_FORMAT }
    expect(editorSpillDirection(makeCell(0, 0, 'x', {
      ...base,
      alignment: { ...base.alignment, wrapText: true },
    }))).toBe('none')
    expect(editorSpillDirection(makeCell(0, 0, 'x', {
      ...base,
      alignment: { ...base.alignment, rotation: 45 },
    }))).toBe('none')
    expect(editorSpillDirection(makeCell(0, 0, 'x', {
      ...base,
      alignment: { ...base.alignment, horizontal: 'fill' },
    }))).toBe('none')
    expect(editorSpillDirection(makeCell(0, 0, 'x', {
      ...base,
      font: { ...base.font, sizePx: base.font.sizePx * 3 },
    }))).toBe('none')
  })
})

describe('editorSpan', () => {
  /** A sheet of four empty columns beside the one the editor sits on. */
  const sheet = makeSheet({ columns: 4, rows: 0 })

  it('stays on the cell while the draft fits it', () => {
    expect(editorSpan(sheet, 0, 1, 'right', 60, 64)).toEqual({ first: 1, last: 1, clipped: false })
    // A direction of none never grows, whatever the draft asks for.
    expect(editorSpan(sheet, 0, 1, 'none', 999, 64)).toEqual({ first: 1, last: 1, clipped: false })
  })

  it('grows rightward across empty columns until the draft fits', () => {
    expect(editorSpan(sheet, 0, 0, 'right', 130, 64)).toEqual({ first: 0, last: 2, clipped: false })
    // A draft wider than the sheet stops at the edge without being clipped.
    expect(editorSpan(sheet, 0, 0, 'right', 999, 64)).toEqual({ first: 0, last: 4, clipped: false })
  })

  it('grows leftward for a right-aligned value and both ways for a centred one', () => {
    expect(editorSpan(sheet, 0, 2, 'left', 130, 64)).toEqual({ first: 0, last: 2, clipped: false })
    expect(editorSpan(sheet, 0, 2, 'both', 130, 64)).toEqual({ first: 1, last: 3, clipped: false })
  })

  it('stops at an occupied neighbour and reports the growth it clipped', () => {
    const busy = makeSheet({ columns: 4, rows: 0, cells: [makeCell(2, 0, 'taken')] })
    expect(editorSpan(busy, 0, 1, 'right', 130, 64)).toEqual({ first: 1, last: 1, clipped: true })
    expect(editorSpan(busy, 0, 1, 'both', 130, 64)).toEqual({ first: 0, last: 1, clipped: true })
  })
})

describe('merge index', () => {
  it('names each region by its anchor and marks every covered reference', () => {
    const sheet = makeSheet({ columns: 3, rows: 3, merges: [{ top: 0, left: 0, bottom: 0, right: 1 }] })
    const index = buildMergeIndex(sheet, referenceOf)
    expect(index.start.get('A1')).toEqual({ top: 0, left: 0, bottom: 0, right: 1 })
    expect([...index.covered].sort()).toEqual(['A1', 'B1'])
    expect(index.start.has('B1')).toBe(false)
  })

  it('indexes a two-dimensional region', () => {
    const sheet = makeSheet({ columns: 3, rows: 3, merges: [{ top: 1, left: 1, bottom: 2, right: 2 }] })
    const index = buildMergeIndex(sheet, referenceOf)
    expect(index.start.get('B2')).toEqual({ top: 1, left: 1, bottom: 2, right: 2 })
    expect([...index.covered].sort()).toEqual(['B2', 'B3', 'C2', 'C3'])
  })
})
