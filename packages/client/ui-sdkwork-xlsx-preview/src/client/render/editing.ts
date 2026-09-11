/**
 * The pure half of editing a sheet: what a key press means, how a rectangle of
 * cells travels through a clipboard, and how a fill drag extends a run.
 *
 * None of this touches the DOM, so every rule Excel states about typing,
 * committing, copying, and filling has a spec that names the rule rather than
 * the element it happened to run in.
 */
import { parseCellEntry } from '../xlsx/edits.ts'
import type { XlsxEditMap, XlsxEntry } from '../xlsx/edits.ts'
import type { XlsxCell, XlsxSheet } from '../xlsx/model.ts'
import { rowAt } from '../xlsx/model.ts'
import { columnName } from '../xlsx/workbook.ts'
import type { MergeIndex } from './cells.ts'
import type { GridPoint, SelectionBounds } from './selection.ts'

/**
 * The text a cell contributes to the formula bar, to an editor opened on it, and
 * to a clipboard.
 *
 * A formula contributes its own source, because there is no computed value to
 * show and the source is what a reader edits; everything else contributes the
 * value as stored, which is what the cell's number format renders. That single
 * definition is what makes the formula bar, the editor, and a paste agree.
 * @param cell - the cell to read.
 * @returns the text, empty when the position carries no cell.
 */
export function cellText(cell: XlsxCell | undefined): string {
  if (cell === undefined) return ''
  return cell.formula === undefined ? cell.raw : `=${cell.formula}`
}

/**
 * How an editor was opened.
 *
 * Typing a character replaces the cell's whole content, while `F2` and a double
 * click open the editor on what the cell already holds, with the caret at the
 * end — the same distinction Excel draws.
 */
export type EditEntry = 'replace' | 'append'

/** What a key press inside the editor asks the grid to do. */
export type EditAction =
  /** Record the draft, then move the selection by the step. */
  | { readonly kind: 'commit'; readonly columnStep: number; readonly rowStep: number }
  /** Leave the cell as it was. */
  | { readonly kind: 'cancel' }

/**
 * Translate a key press inside the in-cell editor.
 *
 * `Enter` and `Tab` commit and carry the selection onward, which is how Excel
 * turns a column of entries into one keystroke per cell; `Shift` reverses the
 * direction and `Escape` abandons the edit. Every other key belongs to the
 * field, so the caret moves with the arrows while the selection stays put.
 * @param key - the pressed key.
 * @param shiftKey - whether `Shift` is held.
 * @returns the action, or undefined when the key is the field's own.
 */
export function editActionFor(key: string, shiftKey: boolean): EditAction | undefined {
  if (key === 'Escape') return { kind: 'cancel' }
  if (key === 'Enter') return { kind: 'commit', columnStep: 0, rowStep: shiftKey ? -1 : 1 }
  if (key === 'Tab') return { kind: 'commit', columnStep: shiftKey ? -1 : 1, rowStep: 0 }
  return undefined
}

/**
 * The character a key press would type into a cell.
 * @param key - the pressed key.
 * @param modifiers - the modifier state of the press.
 * @returns the character, or undefined when the press is a command rather than text.
 */
function typedCharacter(
  key: string,
  modifiers: { readonly ctrlKey: boolean; readonly metaKey: boolean; readonly altKey: boolean },
): string | undefined {
  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) return undefined
  return key.length === 1 ? key : undefined
}

/** What a key press on the grid asks for before the selection controller sees it. */
export type GridEditCommand =
  /**
   * Open the editor: `text` is what the reader has already typed, and `entry`
   * says whether the draft starts from the cell's own value.
   */
  | { readonly kind: 'begin'; readonly entry: EditEntry; readonly text: string }
  /** Clear every cell the selection covers, as `Delete` does. */
  | { readonly kind: 'clear' }

/**
 * Translate a key press on the grid into an editing command.
 *
 * A printable character opens the editor and replaces what the cell held, which
 * is why a reader never has to clear a cell before typing into it; `F2` opens
 * the editor on the existing value, and `Backspace` opens it on an emptied one,
 * which is the pair of behaviours Excel's own two keys have.
 * @param key - the pressed key.
 * @param modifiers - the modifier state of the press.
 * @returns the command, or undefined when the key belongs to the selection.
 */
export function gridEditCommand(
  key: string,
  modifiers: { readonly ctrlKey: boolean; readonly metaKey: boolean; readonly altKey: boolean },
): GridEditCommand | undefined {
  if (key === 'F2') return { kind: 'begin', entry: 'append', text: '' }
  if (key === 'Backspace') return { kind: 'begin', entry: 'replace', text: '' }
  if (key === 'Delete') return { kind: 'clear' }
  const character = typedCharacter(key, modifiers)
  return character === undefined ? undefined : { kind: 'begin', entry: 'replace', text: character }
}

/**
 * The text an editor opens with.
 *
 * Typing a character replaces everything the cell held, while `F2` and a double
 * click open the editor on the value so the reader can amend it — the same
 * distinction the entry mode draws.
 * @param entry - how the editor was opened.
 * @param current - the text the cell shows.
 * @param typed - the character the press already typed, empty when none was.
 * @returns the draft the field starts with.
 */
export function editSeed(entry: EditEntry, current: string, typed: string): string {
  return entry === 'replace' ? typed : current
}

/** A command a keyboard shortcut asks of the sheet. */
export type SheetCommand = 'undo' | 'redo' | 'copy' | 'cut' | 'paste'

/**
 * Translate a keyboard shortcut into a sheet command.
 *
 * The shortcuts are Excel's own, including both `Ctrl+Y` and `Ctrl+Shift+Z` for
 * redo; `Ctrl+A` is absent because it belongs to the selection rather than to
 * the edit log.
 * @param key - the pressed key.
 * @param modifiers - the modifier state of the press.
 * @returns the command, or undefined when the press is not a shortcut.
 */
export function sheetCommandFor(
  key: string,
  modifiers: { readonly ctrlKey: boolean; readonly metaKey: boolean; readonly shiftKey: boolean },
): SheetCommand | undefined {
  if (!modifiers.ctrlKey && !modifiers.metaKey) return undefined
  switch (key.toLowerCase()) {
    case 'z': return modifiers.shiftKey ? 'redo' : 'undo'
    case 'y': return 'redo'
    case 'c': return 'copy'
    case 'x': return 'cut'
    case 'v': return 'paste'
    default: return undefined
  }
}

/**
 * The anchor of the region a position belongs to.
 *
 * Excel edits a merged cell at its anchor whatever position inside the region
 * the reader selected, because the region's other positions hold nothing; a
 * position outside every region is its own anchor.
 * @param merges - the sheet's merge index.
 * @param point - the selected position.
 * @returns the position an edit writes to.
 */
export function mergeAnchor(merges: MergeIndex, point: GridPoint): GridPoint {
  for (const merge of merges.start.values()) {
    if (point.row >= merge.top && point.row <= merge.bottom
      && point.column >= merge.left && point.column <= merge.right) {
      return { column: merge.left, row: merge.top }
    }
  }
  return point
}

/**
 * Quote one field of a tab-separated row, as Excel does when a value carries a
 * separator of its own.
 * @param value - the field's text.
 * @returns the field as a clipboard stores it.
 */
function tsvField(value: string): string {
  return /[\t\n"]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/**
 * Write a rectangle of cells as tab-separated text.
 *
 * Rows run top to bottom and columns left to right, which is the order a paste
 * reads them back in and the order a spreadsheet application expects.
 * @param sheet - the sheet to read.
 * @param bounds - the rectangle to copy.
 * @returns the text.
 */
export function selectionToTsv(sheet: XlsxSheet, bounds: SelectionBounds): string {
  const lines: string[] = []
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    const cells = rowAt(sheet, row)?.cells ?? []
    const fields: string[] = []
    for (let column = bounds.left; column <= bounds.right; column += 1) {
      fields.push(tsvField(cellText(cells.find(cell => cell.column === column))))
    }
    lines.push(fields.join('\t'))
  }
  return lines.join('\n')
}

/**
 * Read tab-separated text back into a rectangle.
 *
 * A quoted field may hold the separators that would otherwise end it, and a
 * doubled quote inside one stands for a single quote, which is what makes a
 * copied value carrying a tab or a newline survive the round trip.
 * @param text - the clipboard text.
 * @returns the fields, by row then column.
 */
export function parseTsv(text: string): readonly (readonly string[])[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character !== '"') {
        field += character
        continue
      }
      if (text[index + 1] === '"') {
        field += '"'
        index += 1
        continue
      }
      quoted = false
      continue
    }
    if (character === '"' && field === '') {
      quoted = true
      continue
    }
    if (character === '\t') {
      row.push(field)
      field = ''
      continue
    }
    if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    if (character !== '\r') field += character
  }
  row.push(field)
  rows.push(row)
  return rows
}

/**
 * The run a rectangle of numbers forms.
 *
 * This is what Excel continues when a fill handle is dragged — `1, 2` becomes
 * `1, 2, 3, 4` — so a rectangle that is not such a run has no run to continue and
 * the fill repeats it instead.
 */
interface Progression {
  /** The amount each filled value rises by. */
  readonly step: number
  /** The source's last value, which the fill counts from. */
  readonly last: number
}

/**
 * Read a single-column rectangle as an arithmetic run.
 * @param source - the source rectangle, by row then column.
 * @returns the run, or undefined when the rectangle is not a run of numbers.
 */
function progressionOf(source: readonly (readonly XlsxEntry[])[]): Progression | undefined {
  const values: number[] = []
  for (const row of source) {
    if (row.length !== 1) return undefined
    const entry = row[0]
    if (entry.kind !== 'number') return undefined
    values.push(entry.value)
  }
  if (values.length < 2) return undefined
  const step = values[1] - values[0]
  for (let index = 2; index < values.length; index += 1) {
    if (values[index] - values[index - 1] !== step) return undefined
  }
  // A source of identical values has no direction to continue.
  return step === 0 ? undefined : { step, last: values[values.length - 1] }
}

/**
 * The entries a fill drag writes into a target rectangle.
 *
 * A drag that extends a single column of numbers continues the run, which is
 * what a reader expects from dragging `1, 2` down; every other source repeats as
 * a block, so a formula or a label is copied rather than invented.
 * @param source - the source rectangle's entries, by row then column.
 * @param rows - how many rows the filled rectangle spans.
 * @param columns - how many columns it spans.
 * @returns the entries to write, by row then column.
 */
export function fillBlock(
  source: readonly (readonly XlsxEntry[])[],
  rows: number,
  columns: number,
): readonly (readonly XlsxEntry[])[] {
  const sourceRows = source.length
  const sourceColumns = sourceRows === 0 ? 0 : source[0].length
  if (sourceRows === 0 || sourceColumns === 0) return []
  const run = rows > sourceRows && columns === sourceColumns ? progressionOf(source) : undefined
  const filled: XlsxEntry[][] = []
  for (let row = 0; row < rows; row += 1) {
    const line: XlsxEntry[] = []
    for (let column = 0; column < columns; column += 1) {
      if (run !== undefined && row >= sourceRows) {
        line.push({ kind: 'number', value: run.last + run.step * (row - sourceRows + 1) })
        continue
      }
      line.push(source[row % sourceRows][column % sourceColumns])
    }
    filled.push(line)
  }
  return filled
}

/**
 * Read a parsed cell back as the entry that reproduces it.
 *
 * A copy and a fill both work on entries rather than on cells, so a cell has to
 * be able to state itself as one. A number contributes the value it stores
 * rather than the text its format prints — filling `1,000` from a `1,000` cell
 * continues `1,000, 2,000`, which is what a reader dragging a formatted column
 * down expects.
 * @param cell - the cell to read.
 * @returns the entry the cell holds.
 */
export function cellEntryOf(cell: XlsxCell | undefined): XlsxEntry {
  if (cell === undefined) return { kind: 'empty' }
  if (cell.formula !== undefined) return { kind: 'formula', formula: cell.formula }
  if (cell.kind === 'boolean') return { kind: 'boolean', value: cell.raw === 'TRUE' }
  if (cell.kind === 'number' || cell.kind === 'date') {
    const value = Number(cell.raw)
    if (cell.raw.trim() !== '' && Number.isFinite(value)) return { kind: 'number', value }
  }
  // An error, a string, and a number the model could not read all travel as the
  // text they store, which is the one form that survives a round trip.
  return { kind: 'text', value: cell.raw }
}

/**
 * Read a rectangle of cells as entries.
 *
 * A position that carries nothing contributes an explicit `empty`, so a fill or
 * a paste over it clears whatever it held rather than leaving it behind.
 * @param sheet - the sheet to read.
 * @param bounds - the rectangle to read.
 * @returns the entries, by row then column.
 */
export function selectionEntries(sheet: XlsxSheet, bounds: SelectionBounds): readonly (readonly XlsxEntry[])[] {
  const rectangle: XlsxEntry[][] = []
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    const cells = rowAt(sheet, row)?.cells ?? []
    const line: XlsxEntry[] = []
    for (let column = bounds.left; column <= bounds.right; column += 1) {
      line.push(cellEntryOf(cells.find(cell => cell.column === column)))
    }
    rectangle.push(line)
  }
  return rectangle
}

/**
 * The references of the cells a rectangle actually populates.
 *
 * A clear walks these rather than the rectangle itself, so `Ctrl+A` then
 * `Delete` on a sheet of a thousand million positions costs what the sheet
 * holds rather than what it could address.
 * @param sheet - the sheet to read.
 * @param bounds - the rectangle to clear.
 * @returns the A1 references, in sheet order.
 */
export function occupiedReferences(sheet: XlsxSheet, bounds: SelectionBounds): readonly string[] {
  const references: string[] = []
  for (const row of sheet.rows) {
    if (row.index < bounds.top || row.index > bounds.bottom) continue
    for (const cell of row.cells) {
      if (cell.column < bounds.left || cell.column > bounds.right) continue
      references.push(cell.reference)
    }
  }
  return references
}

/**
 * The edits that empty a set of cells.
 * @param references - the A1 references to clear.
 * @returns the entries, one per reference.
 */
export function clearedEntries(references: readonly string[]): XlsxEditMap {
  const edits = new Map<string, XlsxEntry>()
  for (const reference of references) edits.set(reference, { kind: 'empty' })
  return edits
}

/**
 * Read tab-separated text as the entries a paste writes.
 *
 * Each field goes through the same input rules a typed entry does, so a pasted
 * `=B2*2` becomes a formula and a pasted `2021-01-01` becomes a date, exactly
 * as if the reader had typed them.
 * @param text - the clipboard text.
 * @param origin - the top-left position the paste lands on.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @returns the entries, keyed by A1 reference.
 */
export function pasteEntries(text: string, origin: GridPoint, date1904: boolean): XlsxEditMap {
  const rows = parseTsv(text)
  const edits = new Map<string, XlsxEntry>()
  for (let row = 0; row < rows.length; row += 1) {
    const fields = rows[row]
    for (let column = 0; column < fields.length; column += 1) {
      edits.set(
        `${columnName(origin.column + column)}${origin.row + row + 1}`,
        parseCellEntry(fields[column], date1904),
      )
    }
  }
  return edits
}

/**
 * The entries a fill drag writes into a rectangle.
 * @param source - the source rectangle's entries, by row then column.
 * @param target - the rectangle the drag covers, which contains the source.
 * @returns the entries, keyed by A1 reference.
 */
export function fillEntries(
  source: readonly (readonly XlsxEntry[])[],
  target: SelectionBounds,
): XlsxEditMap {
  const block = fillBlock(source, target.bottom - target.top + 1, target.right - target.left + 1)
  const edits = new Map<string, XlsxEntry>()
  for (let row = 0; row < block.length; row += 1) {
    const line = block[row]
    for (let column = 0; column < line.length; column += 1) {
      edits.set(`${columnName(target.left + column)}${target.top + row + 1}`, line[column])
    }
  }
  return edits
}

/**
 * The editor a reader has open on one cell.
 *
 * The position is resolved before the editor opens — a position inside a merged
 * region opens the region's anchor — so a commit writes to the position the
 * model actually stores rather than to a position that holds nothing.
 */
export interface OpenEditor {
  /** The 0-based column the editor writes to. */
  readonly column: number
  /** The 0-based row the editor writes to. */
  readonly row: number
  /** How the editor was opened, which decides what a commit seeds from. */
  readonly entry: EditEntry
  /** The draft the field holds, which is what a commit interprets. */
  readonly text: string
}

/**
 * A canonical form of an entry, for comparing two of them.
 *
 * The number format is left out on purpose: the question this answers is
 * whether a commit changes what a cell holds, and a cell that gains only a
 * display format has not been edited.
 * @param entry - the entry to name.
 * @returns the canonical text.
 */
function entryKey(entry: XlsxEntry): string {
  if (entry.kind === 'empty') return 'empty'
  if (entry.kind === 'number') return `n:${entry.value}`
  if (entry.kind === 'boolean') return `b:${entry.value}`
  if (entry.kind === 'text') return `t:${entry.value}`
  return `f:${entry.formula}`
}

/**
 * Whether two entries leave a cell holding the same thing.
 *
 * A commit that changes nothing is dropped rather than recorded, so opening the
 * editor on a cell and confirming it leaves the workbook clean — the same thing
 * Excel does when `F2` is followed straight by `Enter`.
 * @param left - one entry.
 * @param right - the other entry.
 * @returns whether the two agree.
 */
export function sameEntry(left: XlsxEntry, right: XlsxEntry): boolean {
  return entryKey(left) === entryKey(right)
}
