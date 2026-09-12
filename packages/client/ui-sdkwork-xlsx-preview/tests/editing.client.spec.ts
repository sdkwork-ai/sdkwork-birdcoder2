// @vitest-environment jsdom
/** The pure editing rules: key meanings, the clipboard, and a fill drag. */
import { describe, expect, it } from 'vitest'
import type { XlsxEntry } from '../src/client/xlsx/edits.ts'
import { buildMergeIndex } from '../src/client/render/cells.ts'
import {
  cellEntryOf, cellText, clearedEntries, editActionFor, editSeed, fillBlock, fillDownEntries,
  fillEntries, fillRightEntries, gridEditCommand, mergeAnchor, occupiedReferences, parseTsv,
  pasteEntries, sameEntry, selectionEntries, selectionToTsv, sheetCommandFor,
} from '../src/client/render/editing.ts'
import { dateToSerial } from '../src/client/xlsx/number-format.ts'
import { columnName, makeCell, makeSheet } from './sheet-fixture.client.ts'

/** No modifier held. */
const PLAIN = { ctrlKey: false, metaKey: false, altKey: false }

/** The merge index a table of regions resolves to. */
function mergesOf(regions: readonly { top: number; left: number; bottom: number; right: number }[]): ReturnType<typeof buildMergeIndex> {
  return buildMergeIndex(makeSheet({ merges: regions }), (column, row) => `${columnName(column)}${row + 1}`)
}

/** One number entry. */
function number(value: number): XlsxEntry {
  return { kind: 'number', value }
}

describe('cellText', () => {
  it('reads nothing out of a position that carries no cell', () => {
    expect(cellText(undefined)).toBe('')
  })

  it('reads a stored value as it stands', () => {
    expect(cellText(makeCell(0, 0, '5.00', undefined, { raw: '5' }))).toBe('5')
  })

  it('reads a formula as its own source, since it has no computed value', () => {
    expect(cellText(makeCell(0, 0, '=A1+1', undefined, { formula: 'A1+1', raw: '' }))).toBe('=A1+1')
  })
})

describe('editActionFor', () => {
  it('cancels on Escape', () => {
    expect(editActionFor('Escape', 'append', false)).toEqual({ kind: 'cancel' })
  })

  it('commits downward on Enter and upward with Shift', () => {
    expect(editActionFor('Enter', 'append', false)).toEqual({ kind: 'commit', columnStep: 0, rowStep: 1 })
    expect(editActionFor('Enter', 'replace', true)).toEqual({ kind: 'commit', columnStep: 0, rowStep: -1 })
  })

  it('commits sideways on Tab and backward with Shift', () => {
    expect(editActionFor('Tab', 'append', false)).toEqual({ kind: 'commit', columnStep: 1, rowStep: 0 })
    expect(editActionFor('Tab', 'replace', true)).toEqual({ kind: 'commit', columnStep: -1, rowStep: 0 })
  })

  it('confirms and moves on an arrow while the editor is in Enter mode', () => {
    // An editor opened by typing is in Enter mode: the arrows confirm the draft
    // and carry the selection, which is how Excel turns a column of entries
    // into one keystroke per cell.
    expect(editActionFor('ArrowDown', 'replace', false)).toEqual({ kind: 'commit', columnStep: 0, rowStep: 1 })
    expect(editActionFor('ArrowUp', 'replace', false)).toEqual({ kind: 'commit', columnStep: 0, rowStep: -1 })
    expect(editActionFor('ArrowRight', 'replace', false)).toEqual({ kind: 'commit', columnStep: 1, rowStep: 0 })
    expect(editActionFor('ArrowLeft', 'replace', false)).toEqual({ kind: 'commit', columnStep: -1, rowStep: 0 })
  })

  it('leaves the arrows to the caret while the editor is in Edit mode', () => {
    // An editor opened by F2 or a double click is in Edit mode, so the arrows
    // walk the caret instead of the selection.
    expect(editActionFor('ArrowDown', 'append', false)).toBeUndefined()
    expect(editActionFor('ArrowRight', 'append', false)).toBeUndefined()
  })

  it('leaves every other key to the field, so the caret can move', () => {
    expect(editActionFor('a', 'append', false)).toBeUndefined()
    expect(editActionFor('End', 'replace', false)).toBeUndefined()
  })
})

describe('gridEditCommand', () => {
  it('opens the editor on the character a reader typed', () => {
    expect(gridEditCommand('a', PLAIN)).toEqual({ kind: 'begin', entry: 'replace', text: 'a' })
    expect(gridEditCommand('7', PLAIN)).toEqual({ kind: 'begin', entry: 'replace', text: '7' })
    expect(gridEditCommand(' ', PLAIN)).toEqual({ kind: 'begin', entry: 'replace', text: ' ' })
    expect(gridEditCommand('=', PLAIN)).toEqual({ kind: 'begin', entry: 'replace', text: '=' })
  })

  it('opens the editor on the cell’s own value for F2', () => {
    expect(gridEditCommand('F2', PLAIN)).toEqual({ kind: 'begin', entry: 'append', text: '' })
  })

  it('clears the selection on Delete and on Backspace', () => {
    // Both keys empty the selected cells without opening an editor, which is
    // the pair of behaviours Excel's own two keys have.
    expect(gridEditCommand('Delete', PLAIN)).toEqual({ kind: 'clear' })
    expect(gridEditCommand('Backspace', PLAIN)).toEqual({ kind: 'clear' })
  })

  it('leaves a modified press and every named key to the selection', () => {
    // A shortcut is not text, so `Ctrl+C` must reach the clipboard.
    expect(gridEditCommand('c', { ctrlKey: true, metaKey: false, altKey: false })).toBeUndefined()
    expect(gridEditCommand('c', { ctrlKey: false, metaKey: true, altKey: false })).toBeUndefined()
    expect(gridEditCommand('v', { ctrlKey: false, metaKey: false, altKey: true })).toBeUndefined()
    expect(gridEditCommand('ArrowDown', PLAIN)).toBeUndefined()
    expect(gridEditCommand('Enter', PLAIN)).toBeUndefined()
    expect(gridEditCommand('PageDown', PLAIN)).toBeUndefined()
  })
})

describe('mergeAnchor', () => {
  const merges = mergesOf([{ top: 0, left: 0, bottom: 0, right: 1 }, { top: 2, left: 1, bottom: 4, right: 3 }])

  it('names the anchor for any position a region covers', () => {
    expect(mergeAnchor(merges, { column: 0, row: 0 })).toEqual({ column: 0, row: 0 })
    expect(mergeAnchor(merges, { column: 1, row: 0 })).toEqual({ column: 0, row: 0 })
    expect(mergeAnchor(merges, { column: 2, row: 2 })).toEqual({ column: 1, row: 2 })
    expect(mergeAnchor(merges, { column: 3, row: 3 })).toEqual({ column: 1, row: 2 })
  })

  it('names the position itself when no region covers it', () => {
    expect(mergeAnchor(merges, { column: 3, row: 0 })).toEqual({ column: 3, row: 0 })
    expect(mergeAnchor(merges, { column: 0, row: 2 })).toEqual({ column: 0, row: 2 })
  })
})

describe('selectionToTsv', () => {
  const sheet = makeSheet({
    cells: [
      makeCell(0, 0, 'Region', undefined, { raw: 'Region' }),
      makeCell(1, 0, '5.00', undefined, { raw: '5' }),
      makeCell(0, 1, 'North', undefined, { raw: 'North' }),
    ],
  })

  it('writes a rectangle row by row', () => {
    expect(selectionToTsv(sheet, { top: 0, left: 0, bottom: 1, right: 1 })).toBe('Region\t5\nNorth\t')
  })

  it('writes an empty field for a position that carries nothing', () => {
    expect(selectionToTsv(sheet, { top: 0, left: 2, bottom: 0, right: 2 })).toBe('')
  })

  it('writes an empty line for a row the sheet never wrote', () => {
    // A sheet numbers its rows sparsely, so a copied range can cross a row the
    // workbook never recorded.
    const sparse = makeSheet({
      cells: [makeCell(0, 0, 'a', undefined, { raw: 'a' }), makeCell(0, 4, 'e', undefined, { raw: 'e' })],
    })
    expect(selectionToTsv(sparse, { top: 0, left: 0, bottom: 4, right: 0 })).toBe('a\n\n\n\ne')
  })

  it('writes a formula as its own source', () => {
    const withFormula = makeSheet({ cells: [makeCell(0, 0, '3', undefined, { formula: 'A1+1', raw: '3' })] })
    expect(selectionToTsv(withFormula, { top: 0, left: 0, bottom: 0, right: 0 })).toBe('=A1+1')
  })

  it('quotes a field that carries a separator of its own', () => {
    const awkward = makeSheet({
      cells: [
        makeCell(0, 0, 'a\tb', undefined, { raw: 'a\tb' }),
        makeCell(1, 0, 'say "hi"', undefined, { raw: 'say "hi"' }),
        makeCell(2, 0, 'two\nlines', undefined, { raw: 'two\nlines' }),
      ],
    })
    expect(selectionToTsv(awkward, { top: 0, left: 0, bottom: 0, right: 2 }))
      .toBe('"a\tb"\t"say ""hi"""\t"two\nlines"')
  })
})

describe('parseTsv', () => {
  it('reads a rectangle back', () => {
    expect(parseTsv('Region\t5\nNorth\t')).toEqual([['Region', '5'], ['North', '']])
  })

  it('reads a single field with no separator', () => {
    expect(parseTsv('hello')).toEqual([['hello']])
  })

  it('reads an empty field', () => {
    expect(parseTsv('')).toEqual([['']])
  })

  it('keeps the separators a quoted field holds', () => {
    expect(parseTsv('"a\tb"\t"say ""hi"""\t"two\nlines"')).toEqual([['a\tb', 'say "hi"', 'two\nlines']])
  })

  it('drops the carriage returns a Windows clipboard writes', () => {
    expect(parseTsv('a\tb\r\nc\td')).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('round-trips everything a rectangle wrote', () => {
    const sheet = makeSheet({
      cells: [
        makeCell(0, 0, 'plain', undefined, { raw: 'plain' }),
        makeCell(1, 0, 'a\tb', undefined, { raw: 'a\tb' }),
        makeCell(0, 1, '', undefined, { raw: '' }),
        makeCell(1, 1, 'quote " here', undefined, { raw: 'quote " here' }),
      ],
    })
    const bounds = { top: 0, left: 0, bottom: 1, right: 1 }
    expect(parseTsv(selectionToTsv(sheet, bounds))).toEqual([['plain', 'a\tb'], ['', 'quote " here']])
  })
})

describe('fillBlock', () => {
  it('returns nothing for an empty source', () => {
    expect(fillBlock([], 2, 1)).toEqual([])
    expect(fillBlock([[]], 2, 1)).toEqual([])
  })

  it('repeats a single value down a column', () => {
    expect(fillBlock([[number(7)]], 3, 1)).toEqual([[number(7)], [number(7)], [number(7)]])
  })

  it('continues a run of numbers, which is what dragging 1, 2 down does', () => {
    expect(fillBlock([[number(1)], [number(2)]], 4, 1))
      .toEqual([[number(1)], [number(2)], [number(3)], [number(4)]])
  })

  it('continues a run whose step is not one', () => {
    expect(fillBlock([[number(10)], [number(20)]], 3, 1))
      .toEqual([[number(10)], [number(20)], [number(30)]])
  })

  it('accepts a run of three that holds its step', () => {
    expect(fillBlock([[number(1)], [number(2)], [number(3)]], 4, 1))
      .toEqual([[number(1)], [number(2)], [number(3)], [number(4)]])
  })

  it('repeats a run that is not arithmetic rather than inventing a value', () => {
    expect(fillBlock([[number(1)], [number(5)], [number(2)]], 4, 1))
      .toEqual([[number(1)], [number(5)], [number(2)], [number(1)]])
  })

  it('repeats a run of identical numbers, which has no direction', () => {
    expect(fillBlock([[number(4)], [number(4)]], 3, 1))
      .toEqual([[number(4)], [number(4)], [number(4)]])
  })

  it('repeats text rather than continuing it', () => {
    const text: XlsxEntry = { kind: 'text', value: 'a' }
    expect(fillBlock([[text], [text]], 3, 1)).toEqual([[text], [text], [text]])
  })

  it('repeats the whole block when a drag widens it', () => {
    expect(fillBlock([[number(1)], [number(2)]], 2, 2))
      .toEqual([[number(1), number(1)], [number(2), number(2)]])
  })

  it('repeats a multi-column block without continuing anything', () => {
    const block = [[number(1), number(2)]]
    expect(fillBlock(block, 2, 2)).toEqual([[number(1), number(2)], [number(1), number(2)]])
  })
})

describe('editSeed', () => {
  it('starts a typed entry on nothing but the character typed', () => {
    expect(editSeed('replace', 'Region', 'a')).toBe('a')
  })

  it('starts F2 on the value the cell already holds', () => {
    expect(editSeed('append', 'Region', '')).toBe('Region')
  })
})

/** The modifier keys `sheetCommandFor` reads. */
interface Modifiers {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

describe('sheetCommandFor', () => {
  /** A modifier state with only the keys a spec states held. */
  const held = (extra: Partial<Modifiers>): Modifiers => ({ ctrlKey: false, metaKey: false, shiftKey: false, ...extra })

  it('reads Excel’s own shortcuts', () => {
    expect(sheetCommandFor('z', held({ ctrlKey: true }))).toBe('undo')
    // Excel accepts both redo spellings, including the shifted one.
    expect(sheetCommandFor('Z', held({ ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(sheetCommandFor('y', held({ metaKey: true }))).toBe('redo')
    expect(sheetCommandFor('c', held({ ctrlKey: true }))).toBe('copy')
    expect(sheetCommandFor('x', held({ ctrlKey: true }))).toBe('cut')
    expect(sheetCommandFor('v', held({ ctrlKey: true }))).toBe('paste')
  })

  it('leaves an unmodified press and every other shortcut alone', () => {
    expect(sheetCommandFor('z', held({}))).toBeUndefined()
    // `Ctrl+A` belongs to the selection rather than to the edit log.
    expect(sheetCommandFor('a', held({ ctrlKey: true }))).toBeUndefined()
  })

  it('reads the fill pair Excel keeps on Ctrl+D and Ctrl+R', () => {
    expect(sheetCommandFor('d', held({ ctrlKey: true }))).toBe('fillDown')
    expect(sheetCommandFor('r', held({ ctrlKey: true }))).toBe('fillRight')
  })
})

describe('fillDownEntries', () => {
  it('copies each column’s top cell over the rows beneath it', () => {
    const sheet = makeSheet({
      columns: 2,
      rows: 2,
      cells: [makeCell(0, 0, 'a', undefined, { raw: 'a' }), makeCell(1, 0, '5.00', undefined, { raw: '5', kind: 'number' })],
    })
    const edits = fillDownEntries(sheet, { top: 0, left: 0, bottom: 2, right: 1 })
    expect(edits.get('A2')).toEqual({ kind: 'text', value: 'a' })
    expect(edits.get('A3')).toEqual({ kind: 'text', value: 'a' })
    expect(edits.get('B2')).toEqual({ kind: 'number', value: 5 })
    expect(edits.get('B3')).toEqual({ kind: 'number', value: 5 })
  })

  it('fills nothing when one row is selected', () => {
    const sheet = makeSheet({ columns: 2, rows: 0, cells: [makeCell(0, 0, 'a')] })
    expect([...fillDownEntries(sheet, { top: 0, left: 0, bottom: 0, right: 1 })]).toEqual([])
  })
})

describe('fillRightEntries', () => {
  it('copies each row’s left cell across the columns beside it', () => {
    const sheet = makeSheet({
      columns: 2,
      rows: 2,
      cells: [makeCell(0, 0, 'a', undefined, { raw: 'a' }), makeCell(0, 1, '7', undefined, { raw: '7', kind: 'number' })],
    })
    const edits = fillRightEntries(sheet, { top: 0, left: 0, bottom: 1, right: 2 })
    expect(edits.get('B1')).toEqual({ kind: 'text', value: 'a' })
    expect(edits.get('C1')).toEqual({ kind: 'text', value: 'a' })
    expect(edits.get('B2')).toEqual({ kind: 'number', value: 7 })
    expect(edits.get('C2')).toEqual({ kind: 'number', value: 7 })
  })

  it('fills nothing when one column is selected', () => {
    const sheet = makeSheet({ columns: 1, rows: 2, cells: [makeCell(0, 0, 'a')] })
    expect([...fillRightEntries(sheet, { top: 0, left: 0, bottom: 1, right: 0 })]).toEqual([])
  })
})

describe('cellEntryOf', () => {
  it('reads a position that carries no cell as empty', () => {
    expect(cellEntryOf(undefined)).toEqual({ kind: 'empty' })
  })

  it('reads a formula as its own source, since it has no computed value', () => {
    expect(cellEntryOf(makeCell(0, 0, '=A1+1', undefined, { formula: 'A1+1', raw: '' })))
      .toEqual({ kind: 'formula', formula: 'A1+1' })
  })

  it('reads a boolean as its value', () => {
    expect(cellEntryOf(makeCell(0, 0, 'TRUE', undefined, { raw: 'TRUE', kind: 'boolean' })))
      .toEqual({ kind: 'boolean', value: true })
    expect(cellEntryOf(makeCell(0, 0, 'FALSE', undefined, { raw: 'FALSE', kind: 'boolean' })))
      .toEqual({ kind: 'boolean', value: false })
  })

  it('reads a number and a date as the value they store, not the text they print', () => {
    expect(cellEntryOf(makeCell(0, 0, '1,000.00', undefined, { raw: '1000', kind: 'number' })))
      .toEqual({ kind: 'number', value: 1000 })
    expect(cellEntryOf(makeCell(0, 0, '2021年1月1日', undefined, { raw: '44197', kind: 'date' })))
      .toEqual({ kind: 'number', value: 44197 })
  })

  it('reads a numeric position with no readable value as the text it stores', () => {
    // A blank stored value is not the number zero, and an unreadable one is not
    // a number at all; both travel as text so a copy reproduces them exactly.
    expect(cellEntryOf(makeCell(0, 0, '', undefined, { raw: '', kind: 'number' })))
      .toEqual({ kind: 'text', value: '' })
    expect(cellEntryOf(makeCell(0, 0, 'n/a', undefined, { raw: 'n/a', kind: 'number' })))
      .toEqual({ kind: 'text', value: 'n/a' })
  })

  it('reads a string and an error as the text they store', () => {
    expect(cellEntryOf(makeCell(0, 0, 'North'))).toEqual({ kind: 'text', value: 'North' })
    expect(cellEntryOf(makeCell(0, 0, '#DIV/0!', undefined, { raw: '#DIV/0!', kind: 'error' })))
      .toEqual({ kind: 'text', value: '#DIV/0!' })
  })
})

describe('selectionEntries', () => {
  it('reads a rectangle row by row, with an empty for a position that carries nothing', () => {
    const sheet = makeSheet({ columns: 2, rows: 2, cells: [makeCell(0, 0, 'a'), makeCell(1, 1, 'b')] })
    expect(selectionEntries(sheet, { top: 0, left: 0, bottom: 1, right: 1 })).toEqual([
      [{ kind: 'text', value: 'a' }, { kind: 'empty' }],
      [{ kind: 'empty' }, { kind: 'text', value: 'b' }],
    ])
  })

  it('reads a row the sheet never wrote as empty positions', () => {
    // A sheet numbers only the rows it holds, so a rectangle reaching past the
    // last of them names rows the model has no record of at all.
    const sheet = makeSheet({ columns: 2, rows: 2, cells: [makeCell(0, 0, 'a')] })
    expect(selectionEntries(sheet, { top: 3, left: 0, bottom: 3, right: 1 }))
      .toEqual([[{ kind: 'empty' }, { kind: 'empty' }]])
  })
})

describe('occupiedReferences', () => {
  const sheet = makeSheet({
    columns: 3,
    rows: 3,
    cells: [makeCell(0, 0, 'a'), makeCell(1, 1, 'b'), makeCell(2, 2, 'c')],
  })

  it('names only the populated positions a rectangle covers', () => {
    expect(occupiedReferences(sheet, { top: 0, left: 0, bottom: 1, right: 1 })).toEqual(['A1', 'B2'])
  })

  it('names nothing for a rectangle over positions that carry nothing', () => {
    // A1 is populated, so the rectangle has to step past it to be empty.
    expect(occupiedReferences(sheet, { top: 0, left: 1, bottom: 0, right: 2 })).toEqual([])
    // A position inside the rectangle but on an unpopulated row is not walked.
    expect(occupiedReferences(sheet, { top: 3, left: 0, bottom: 3, right: 3 })).toEqual([])
  })
})

describe('clearedEntries', () => {
  it('writes an empty for every reference it is given', () => {
    expect([...clearedEntries(['A1', 'B2'])]).toEqual([
      ['A1', { kind: 'empty' }],
      ['B2', { kind: 'empty' }],
    ])
  })
})

describe('pasteEntries', () => {
  it('places a rectangle from its origin, applying the input rules', () => {
    const edits = pasteEntries('1\tTRUE\n=B2*2\ttext', { column: 1, row: 1 }, false)
    expect(edits.get('B2')).toEqual({ kind: 'number', value: 1 })
    expect(edits.get('C2')).toEqual({ kind: 'boolean', value: true })
    expect(edits.get('B3')).toEqual({ kind: 'formula', formula: 'B2*2' })
    expect(edits.get('C3')).toEqual({ kind: 'text', value: 'text' })
  })

  it('reads a pasted date the way the workbook counts it', () => {
    const edits = pasteEntries('2021-01-01', { column: 0, row: 0 }, true)
    expect(edits.get('A1')).toEqual({
      kind: 'number',
      value: dateToSerial(2021, 1, 1, true),
      format: 'yyyy-mm-dd',
    })
  })
})

describe('fillEntries', () => {
  it('continues a run of numbers over the rectangle a drag covers', () => {
    const edits = fillEntries([[number(1)], [number(2)]], { top: 0, left: 0, bottom: 3, right: 0 })
    expect(edits.get('A1')).toEqual(number(1))
    expect(edits.get('A4')).toEqual(number(4))
  })

  it('repeats a block that is not a run', () => {
    const label: XlsxEntry = { kind: 'text', value: 'x' }
    const edits = fillEntries([[label]], { top: 1, left: 2, bottom: 3, right: 2 })
    expect([...edits.keys()]).toEqual(['C2', 'C3', 'C4'])
    expect(edits.get('C4')).toEqual(label)
  })
})

describe('sameEntry', () => {
  it('agrees across the forms an entry takes', () => {
    expect(sameEntry({ kind: 'empty' }, { kind: 'empty' })).toBe(true)
    // A commit that only changes how a value is displayed has not edited it.
    expect(sameEntry(number(5), { kind: 'number', value: 5, format: '0.00' })).toBe(true)
    expect(sameEntry({ kind: 'boolean', value: true }, { kind: 'boolean', value: true })).toBe(true)
    expect(sameEntry({ kind: 'text', value: 'a' }, { kind: 'text', value: 'a' })).toBe(true)
    expect(sameEntry({ kind: 'formula', formula: 'A1' }, { kind: 'formula', formula: 'A1' })).toBe(true)
  })

  it('separates entries that differ in kind or in value', () => {
    expect(sameEntry({ kind: 'empty' }, number(5))).toBe(false)
    expect(sameEntry(number(5), number(6))).toBe(false)
    expect(sameEntry(number(5), { kind: 'text', value: '5' })).toBe(false)
    expect(sameEntry({ kind: 'boolean', value: true }, { kind: 'boolean', value: false })).toBe(false)
    expect(sameEntry({ kind: 'text', value: 'a' }, { kind: 'text', value: 'b' })).toBe(false)
    expect(sameEntry({ kind: 'formula', formula: 'A1' }, { kind: 'formula', formula: 'B1' })).toBe(false)
  })
})
