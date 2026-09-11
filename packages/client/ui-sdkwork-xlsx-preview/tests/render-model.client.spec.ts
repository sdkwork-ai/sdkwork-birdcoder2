// @vitest-environment node
/** Selection rectangles, names, and the cell/merge lookups the grid draws with. */
import { describe, expect, it } from 'vitest'
import { makeCell, makeSheet } from './sheet-fixture.client.ts'
import { buildMergeIndex, cellAt, spillSpan } from '../src/client/render/cells.ts'
import {
  initialSelection, isSelected, selectionBounds, selectionName,
} from '../src/client/render/selection.ts'
import type { GridSelection } from '../src/client/render/selection.ts'
import { columnName } from '../src/client/xlsx/workbook.ts'

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

  it('spills across empty neighbours up to the sheet edge', () => {
    const sheet = makeSheet({ columns: 4, rows: 0, cells: [makeCell(1, 0, 'wide')] })
    expect(spillSpan(sheet, 0, 1, false)).toEqual({ first: 0, last: 4, clipped: false })
  })

  it('stops at the first occupied neighbour on each side', () => {
    const sheet = makeSheet({
      columns: 5,
      rows: 0,
      cells: [makeCell(0, 0, 'left'), makeCell(2, 0, 'wide'), makeCell(4, 0, 'right')],
    })
    expect(spillSpan(sheet, 0, 2, false)).toEqual({ first: 0, last: 4, clipped: true })
  })

  it('starts at the occupied neighbour to the left when the sheet does not begin there', () => {
    const sheet = makeSheet({
      columns: 5,
      rows: 0,
      cells: [makeCell(1, 0, 'left'), makeCell(3, 0, 'wide'), makeCell(5, 0, 'right')],
    })
    // The band reaches the occupied position on each side, so the text is
    // clipped at both edges rather than at the sheet's own.
    expect(spillSpan(sheet, 0, 3, false)).toEqual({ first: 1, last: 5, clipped: true })
    expect(spillSpan(sheet, 0, 3, true)).toEqual({ first: 3, last: 3, clipped: false })
  })

  it('stops at the sheet edge when nothing occupies either side', () => {
    const sheet = makeSheet({ columns: 2, rows: 0, cells: [makeCell(0, 0, 'wide')] })
    expect(spillSpan(sheet, 0, 0, false)).toEqual({ first: 0, last: 2, clipped: false })
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
