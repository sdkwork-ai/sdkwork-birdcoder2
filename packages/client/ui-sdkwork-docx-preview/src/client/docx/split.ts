/**
 * Pure block splitting: the model half of flowing one block across a page.
 *
 * Pagination decides that a block must divide and where its measurement says
 * the divide falls; the functions here build the two models that decision
 * produces. A split paragraph keeps its format on both sides, hangs its list
 * marker only on the head, and moves its border box's closing edge to the
 * tail; a split table repeats its header rows and leaves a row that a span
 * still reaches uncut.
 */
import type { DocxBlock, DocxInline, DocxParagraph, DocxTable, DocxTableRow } from './model.ts'

/** Where a paragraph's content divides, in the coordinate its inline list uses. */
export interface ParagraphSplitPoint {
  /** Index of the inline the tail starts with. */
  readonly inlineIndex: number
  /** Character offset into that inline's text, or 0 when it opens the line. */
  readonly charOffset: number
}

/**
 * Divide a paragraph at an inline position.
 * @param paragraph - the paragraph to divide.
 * @param point - the first inline position the tail carries.
 * @returns the head and tail paragraphs, or undefined when the position opens or ends the paragraph.
 */
export function splitParagraph(
  paragraph: DocxParagraph,
  point: ParagraphSplitPoint,
): readonly [DocxParagraph, DocxParagraph] | undefined {
  const { inlineIndex, charOffset } = point
  if (inlineIndex >= paragraph.inlines.length || (inlineIndex === 0 && charOffset === 0)) return undefined
  const inline = paragraph.inlines[inlineIndex]
  if (inline.kind !== 'text' && charOffset !== 0) return undefined
  const head: DocxInline[] = []
  for (let index = 0; index < inlineIndex; index += 1) head.push(paragraph.inlines[index])
  if (inline.kind === 'text') {
    const text = inline.text.slice(0, charOffset)
    if (text === '') return undefined
    head.push({ ...inline, text })
  }
  const tail: DocxInline[] = []
  if (inline.kind === 'text') {
    const rest = inline.text.slice(charOffset)
    if (rest !== '') tail.push({ ...inline, text: rest })
  } else {
    tail.push(inline)
  }
  for (let index = inlineIndex + 1; index < paragraph.inlines.length; index += 1) tail.push(paragraph.inlines[index])
  if (head.length === 0 || tail.length === 0) return undefined

  // Continuation lines start at the paragraph's text edge: the tail keeps the
  // left indent the marker imposed and carries no marker of its own, while the
  // head holds the marker and glues itself to the tail.
  const tailIndent = paragraph.indentLeftPx + (paragraph.marker?.indentPx ?? 0)
  const headParagraph: DocxParagraph = {
    ...paragraph,
    inlines: head,
    keepNext: true,
    ...(paragraph.borders.bottom === undefined ? {} : { borders: { ...paragraph.borders, bottom: undefined } }),
  }
  const tailParagraph: DocxParagraph = {
    ...paragraph,
    indentLeftPx: tailIndent,
    textIndentPx: 0,
    inlines: tail,
    pageBreakBefore: false,
    ...(paragraph.borders.top === undefined ? {} : { borders: { ...paragraph.borders, top: undefined } }),
  }
  delete (tailParagraph as { marker?: unknown }).marker
  return [headParagraph, tailParagraph]
}

/**
 * How many leading rows of a table are `w:tblHeader` rows.
 * @param table - the table.
 * @returns the count of consecutive header rows at the top.
 */
export function headerRowCount(table: DocxTable): number {
  let count = 0
  while (count < table.rows.length && table.rows[count].header && table.rows.length > count + 1) count += 1
  return count
}

/**
 * Whether a cut between two rows would tear a vertical span.
 * @param table - the table.
 * @param cut - the row index the tail would start at.
 * @returns true when any cell above the cut reaches below it.
 */
export function rowSpanCrosses(table: DocxTable, cut: number): boolean {
  if (cut <= 0 || cut >= table.rows.length) return false
  for (let row = 0; row < cut; row += 1) {
    for (const cell of table.rows[row].cells) {
      if (row + cell.rowSpan > cut) return true
    }
  }
  return false
}

/**
 * Divide a table between two rows.
 *
 * The tail opens with the table's header rows again, so a page the table
 * spans still names its columns. A cut a vertical span reaches across is
 * refused; pagination then moves the whole table instead of corrupting it.
 * @param table - the table to divide.
 * @param cut - the row index the tail starts at.
 * @returns the head and tail tables, or undefined when the cut is out of range or tears a span.
 */
export function splitTable(table: DocxTable, cut: number): readonly [DocxTable, DocxTable] | undefined {
  if (cut <= 0 || cut >= table.rows.length) return undefined
  if (rowSpanCrosses(table, cut)) return undefined
  const headRows: DocxTableRow[] = table.rows.slice(0, cut)
  const tailRows: DocxTableRow[] = table.rows.slice(cut)
  const headers = headRows.filter(row => row.header)
  const withHeaders = headers.length > 0 ? [...headers, ...tailRows] : tailRows
  return [
    { ...table, rows: headRows },
    { ...table, rows: withHeaders },
  ]
}

/**
 * Whether pagination may divide a block at all.
 * @param block - the block in question.
 * @returns false for a table (only its rows divide) and a `keepLines` paragraph.
 */
export function splittable(block: DocxBlock): boolean {
  if (block.kind === 'table') return tableSplittable(block)
  return !block.keepLines
}

/**
 * Whether a table's rows may divide across pages.
 *
 * Word keeps a one-row table whole, and a table whose only rows are header
 * rows has nothing to divide.
 * @param table - the table.
 * @returns true when a row boundary exists to cut at.
 */
function tableSplittable(table: DocxTable): boolean {
  return table.rows.length > 1
}
