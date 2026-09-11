/**
 * Write an edited workbook back into a package.
 *
 * A save must not rebuild a worksheet: only the `<c>` elements an edit names are
 * replaced, so every style index, column definition, merge, drawing anchor, and
 * unrelated cell in the part keeps its exact original text and a diff of the
 * saved file shows only what the reader typed. That is why this works on the
 * part's text rather than re-serializing a parsed document — a re-serialization
 * would normalize the whole part and lose exactly the fidelity a save is for.
 *
 * Text entry is written as an inline string rather than added to the shared
 * string table: an inline `<is>` is the same OOXML, costs no new part, and
 * leaves `sharedStrings.xml` byte-identical.
 */
import { rewriteZip, ZipPackage } from '@deepseek-ai/dsh-client-sdkwork-office'
import { groupEdits } from './edits.ts'
import type { XlsxEditLog, XlsxEditMap, XlsxEntry } from './edits.ts'
import type { XlsxWorkbook } from './model.ts'
import { parseReference, readWorkbookPart } from './workbook.ts'

/** A `<c>` element, self-closing or paired. `<col` cannot match: `c` and `o` share a word. */
const CELL = /<c\b(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/c>)/gu

/** A `<row>` element, self-closing or paired. */
const ROW = /<row\b(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/row>)/gu

/** A sheet's `<sheetData>` element, self-closing or paired. */
const SHEET_DATA = /<sheetData\b(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/sheetData>)/u

/** A workbook's recalculation settings, self-closing or paired. */
const CALC_PR = /<calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/calcPr>)/u

/** Characters XML 1.0 forbids outright. */
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu

/** The tag a row closes with. */
const CLOSE_ROW = '</row>'

/** The flag that makes a spreadsheet application recalculate a saved workbook. */
const FULL_RECALC = '<calcPr fullCalcOnLoad="1"/>'

/**
 * Read an attribute out of an element's start tag.
 * @param tag - the start tag, including its angle brackets.
 * @param name - the attribute name.
 * @returns the value, or undefined when the element states none.
 */
function attributeOf(tag: string, name: string): string | undefined {
  return new RegExp(`(?:^|[\\s<])${name}="([^"]*)"`, 'u').exec(tag)?.[1]
}

/**
 * The start tag of an element, up to and including its closing angle bracket.
 * @param text - the element.
 * @returns the start tag.
 */
function startTagOf(text: string): string {
  return text.slice(0, text.indexOf('>') + 1)
}

/**
 * The 0-based column a cell element sits in.
 * @param text - the cell element.
 * @returns the column, or undefined when the element names no parsable reference.
 */
function columnOf(text: string): number | undefined {
  const reference = attributeOf(startTagOf(text), 'r')
  return reference === undefined ? undefined : parseReference(reference)?.column
}

/**
 * The style index a cell element states.
 * @param text - the cell element.
 * @returns the index, or undefined when the element states none.
 */
function styleOf(text: string): string | undefined {
  return attributeOf(startTagOf(text), 's')
}

/**
 * The A1 reference for a column and row pair.
 * @param column - the 0-based column.
 * @param row - the 0-based row.
 * @returns the reference.
 */
function referenceOf(column: number, row: number): string {
  let remaining = column
  let letters = ''
  do {
    letters = String.fromCharCode(65 + (remaining % 26)) + letters
    remaining = Math.floor(remaining / 26) - 1
  } while (remaining >= 0)
  return `${letters}${row + 1}`
}

/**
 * Escape text for XML content.
 *
 * `&` is replaced first so an escape is never escaped twice; a control character
 * XML forbids is dropped rather than escaped, because a pasted one would make
 * the saved part unreadable while no spreadsheet stores one.
 * @param value - the text to escape.
 * @returns the escaped text.
 */
function escapeXml(value: string): string {
  return value.replaceAll(ILLEGAL_XML, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * The preservation attribute a text run needs.
 * @param value - the run's text.
 * @returns the attribute, or the empty string when the text needs none.
 */
function spaceAttr(value: string): string {
  return /(?:^\s|\s$|\n)/u.test(value) ? ' xml:space="preserve"' : ''
}

/**
 * Write one cell element.
 * @param reference - the cell's A1 reference.
 * @param entry - the entry the cell holds.
 * @param style - the style index to keep, when the cell already had one.
 * @returns the element text, or undefined when the entry clears the cell.
 */
function cellXml(reference: string, entry: XlsxEntry, style: string | undefined): string | undefined {
  if (entry.kind === 'empty') return undefined
  const attrs = style === undefined ? ` r="${reference}"` : ` r="${reference}" s="${style}"`
  if (entry.kind === 'text') {
    return `<c${attrs} t="inlineStr"><is><t${spaceAttr(entry.value)}>${escapeXml(entry.value)}</t></is></c>`
  }
  if (entry.kind === 'boolean') return `<c${attrs} t="b"><v>${entry.value ? '1' : '0'}</v></c>`
  // A formula carries no cached value: the workbook part asks for a full
  // recalculation, and until one runs the cell has no value to state.
  if (entry.kind === 'formula') return `<c${attrs}><f>${escapeXml(entry.formula)}</f></c>`
  return `<c${attrs}><v>${entry.value}</v></c>`
}

/**
 * Render one cell, treating a cleared cell as no text at all.
 * @param column - the 0-based column.
 * @param row - the 0-based row.
 * @param entry - the entry the cell holds.
 * @param style - the style index to keep, when the cell already had one.
 * @returns the element text, empty when the entry clears the cell.
 */
function renderedCell(column: number, row: number, entry: XlsxEntry, style: string | undefined): string {
  return cellXml(referenceOf(column, row), entry, style) ?? ''
}

/**
 * Rewrite a row's inner XML so it carries the edited cells.
 *
 * Only the cells an edit names are rebuilt: every other element keeps its exact
 * original text, and the separators between elements survive, so a pretty-printed
 * part stays pretty-printed. A cell the row never had is written in column order,
 * and a cleared one is removed from the row entirely.
 * @param inner - the row's inner XML.
 * @param row - the row's 0-based position.
 * @param edits - the entries in force, keyed by column.
 * @returns the rewritten inner XML.
 */
function patchRowInner(inner: string, row: number, edits: ReadonlyMap<number, XlsxEntry>): string {
  const pending = new Map(edits)
  const out: string[] = []
  let cursor = 0
  CELL.lastIndex = 0
  for (let match = CELL.exec(inner); match !== null; match = CELL.exec(inner)) {
    const column = columnOf(match[0])
    if (column === undefined) continue
    // A cell the row never had still belongs in column order, so every pending
    // entry that sorts before this cell is written first.
    for (const [editColumn, entry] of [...pending].sort((left, right) => left[0] - right[0])) {
      if (editColumn >= column) break
      out.push(renderedCell(editColumn, row, entry, undefined))
      pending.delete(editColumn)
    }
    out.push(inner.slice(cursor, match.index))
    cursor = match.index + match[0].length
    const entry = pending.get(column)
    if (entry === undefined) {
      out.push(match[0])
      continue
    }
    pending.delete(column)
    out.push(renderedCell(column, row, entry, styleOf(match[0])))
  }
  for (const [editColumn, entry] of pending) out.push(renderedCell(editColumn, row, entry, undefined))
  out.push(inner.slice(cursor))
  return out.join('')
}

/** One `<row>` element, split into the pieces a patch rewrites. */
interface RowSpan {
  /** The row's 0-based position. */
  readonly row: number
  /** The open tag, with a self-closing slash removed. */
  readonly openTag: string
  /** The row's children, empty when the element was self-closing. */
  readonly inner: string
}

/**
 * Split a row element into its parts.
 * @param text - the row element.
 * @returns the parts, or undefined when the element names no position.
 */
function rowSpanOf(text: string): RowSpan | undefined {
  const openTag = startTagOf(text)
  const position = attributeOf(openTag, 'r')
  if (position === undefined) return undefined
  const selfClosing = openTag.endsWith('/>')
  return {
    row: Number(position) - 1,
    openTag: selfClosing ? `${openTag.slice(0, -2)}>` : openTag,
    inner: selfClosing ? '' : text.slice(openTag.length, text.length - CLOSE_ROW.length),
  }
}

/**
 * Write one whole row element.
 * @param row - the row's 0-based position.
 * @param edits - the entries in force, keyed by column.
 * @returns the element text.
 */
function rowXml(row: number, edits: ReadonlyMap<number, XlsxEntry>): string {
  return `<row r="${row + 1}">${patchRowInner('', row, edits)}</row>`
}

/**
 * Rewrite the inside of a `<sheetData>` element so it carries the edited cells.
 * @param inner - the element's children as parsed.
 * @param edits - the entries in force, keyed by A1 reference.
 * @returns the rewritten children.
 */
function patchSheetData(inner: string, edits: XlsxEditMap): string {
  const ordered = [...groupEdits(edits)].sort((left, right) => left[0] - right[0])
  const out: string[] = []
  let cursor = 0
  let next = 0
  ROW.lastIndex = 0
  for (let match = ROW.exec(inner); match !== null; match = ROW.exec(inner)) {
    const span = rowSpanOf(match[0])
    if (span === undefined) continue
    // A row the sheet never had still belongs in row order, so every pending row
    // that sorts before this one is written first.
    while (next < ordered.length && ordered[next][0] < span.row) {
      out.push(rowXml(ordered[next][0], ordered[next][1]))
      next += 1
    }
    out.push(inner.slice(cursor, match.index))
    cursor = match.index + match[0].length
    if (next < ordered.length && ordered[next][0] === span.row) {
      out.push(`${span.openTag}${patchRowInner(span.inner, span.row, ordered[next][1])}${CLOSE_ROW}`)
      next += 1
    } else {
      out.push(match[0])
    }
  }
  while (next < ordered.length) {
    out.push(rowXml(ordered[next][0], ordered[next][1]))
    next += 1
  }
  out.push(inner.slice(cursor))
  return out.join('')
}

/** Where a sheet's `<sheetData>` sits, and what replaces it. */
interface SheetDataSpan {
  /** Offset the replacement starts at. */
  readonly start: number
  /** Offset the replacement ends at. */
  readonly end: number
  /** The open tag to emit, rewritten when the element was self-closing. */
  readonly openTag: string
  /** The children as parsed, empty when the element was self-closing. */
  readonly inner: string
}

/**
 * Locate a sheet's `<sheetData>` element.
 * @param xml - the worksheet part's text.
 * @returns the span, or undefined when the part declares no sheet data.
 */
function sheetDataSpanOf(xml: string): SheetDataSpan | undefined {
  const match = SHEET_DATA.exec(xml)
  if (match === null) return undefined
  const selfClosing = match[0].endsWith('/>')
  const openTag = startTagOf(match[0])
  return {
    start: match.index,
    end: match.index + match[0].length,
    openTag: selfClosing ? `${openTag.slice(0, -2)}>` : openTag,
    inner: selfClosing ? '' : match[0].slice(openTag.length, match[0].length - '</sheetData>'.length),
  }
}

/**
 * Rewrite a worksheet part so it carries the edited cells.
 *
 * A sheet with no `<sheetData>` cannot take a cell, so it is returned untouched
 * rather than given an element the schema would place wrongly.
 * @param xml - the worksheet part's text.
 * @param edits - the entries in force, keyed by A1 reference.
 * @returns the patched text, or the same text when no edit applies.
 */
export function patchSheetXml(xml: string, edits: XlsxEditMap): string {
  if (edits.size === 0) return xml
  const span = sheetDataSpanOf(xml)
  if (span === undefined) return xml
  const patched = patchSheetData(span.inner, edits)
  return `${xml.slice(0, span.start)}${span.openTag}${patched}</sheetData>${xml.slice(span.end)}`
}

/**
 * Ask a workbook to recalculate everything on open.
 *
 * A formula written without a cached value has nothing to display until one
 * runs, so the flag goes before the extension list the schema places it ahead
 * of, or at the end of the workbook element when there is none.
 * @param xml - the workbook part's text.
 * @returns the patched text.
 */
export function withFullRecalc(xml: string): string {
  if (CALC_PR.test(xml)) return xml.replace(CALC_PR, FULL_RECALC)
  const anchor = xml.includes('<extLst') ? '<extLst' : '</workbook>'
  return xml.replace(anchor, `${FULL_RECALC}${anchor}`)
}

/**
 * Build the edited workbook: the original package with only the touched
 * worksheet parts rewritten.
 * @param original - the complete source package.
 * @param workbook - the workbook as parsed, for each sheet's part name.
 * @param edits - the entries in force, keyed by 0-based sheet index.
 * @returns the edited package bytes, or undefined when no sheet carries an edit.
 * @throws {Error} when the source package carries a ZIP64 part, which the
 * container writer cannot re-lay.
 */
export async function buildEditedWorkbook(
  original: Uint8Array,
  workbook: XlsxWorkbook,
  edits: XlsxEditLog,
): Promise<Uint8Array | undefined> {
  const pkg = ZipPackage.open(original)
  const replacements = new Map<string, string>()
  let formulaWritten = false
  for (const sheet of workbook.sheets) {
    const sheetEdits = edits.get(sheet.index)
    if (sheetEdits === undefined || sheetEdits.size === 0) continue
    const xml = await pkg.readText(sheet.partName)
    if (xml === undefined) continue
    replacements.set(sheet.partName, patchSheetXml(xml, sheetEdits))
    for (const entry of sheetEdits.values()) {
      if (entry.kind === 'formula') formulaWritten = true
    }
  }
  if (replacements.size === 0) return undefined
  if (formulaWritten) {
    const workbookPart = await readWorkbookPart(pkg)
    const workbookXml = workbookPart === undefined ? undefined : await pkg.readText(workbookPart)
    if (workbookPart !== undefined && workbookXml !== undefined) {
      replacements.set(workbookPart, withFullRecalc(workbookXml))
    }
  }
  return rewriteZip(original, replacements)
}
