/**
 * WordprocessingML body content: paragraphs, their content nodes, and the
 * block list a section or a table cell holds.
 *
 * A paragraph is read as a cascade — document defaults, its paragraph style,
 * the numbering level it uses, and the properties written on the paragraph —
 * and each of its runs is then resolved against the paragraph mark, its
 * character style, and its own properties. Fields, drawings, and tables are
 * inlined here because all three are content nodes of the same paragraph, not
 * separate structures.
 */
import { attrNs, child, children, halfPtToPx, NS_R, roundPx, twipsToPx } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import { readDrawing, readPict } from './drawing.ts'
import type { DrawingContext } from './drawing.ts'
import type { ParaFormat, RunFormat } from './format.ts'
import { mergePara, mergeRun, readParaFormat, readRunFormat } from './format.ts'
import type { DocxBlock, DocxInline, DocxListMarker, DocxParagraph, DocxTextStyle } from './model.ts'
import type { NumberingMarker, NumberingResolver } from './numbering.ts'
import { NS_W, wAttr, wNum } from './names.ts'
import type { StyleResolver } from './styles.ts'
import { readTable } from './table.ts'

/** Word's default run size in half-points, used when no default states one. */
const DEFAULT_SIZE_HALF_POINTS = 22

/** Hanging distance a numbered paragraph uses when its level states no indent. */
const DEFAULT_MARKER_INDENT_PX = twipsToPx(360)

/** Localized strings parsing needs before any component renders. */
export interface DocxLabels {
  /**
   * Description shown in place of a drawing the renderer cannot draw.
   * @returns the visible name.
   */
  readonly unsupportedObject: () => string
}

/** Everything a body read needs: the document's resolved context and its parts. */
export interface DocxReadContext extends DrawingContext {
  /** The document theme, for run, paragraph, and numbering property resolution. */
  readonly theme: Theme
  /** The resolved styles cascade. */
  readonly styles: StyleResolver
  /** The numbering definitions and their running counters. */
  readonly numbering: NumberingResolver
  readonly labels: DocxLabels
  /**
   * Run properties a table style's conditional band lays under every run of a
   * cell, below the paragraph style cascade. Undefined outside a styled cell.
   */
  readonly runUnderlay?: RunFormat
  /**
   * Read the blocks of a nested story such as a table cell.
   * @param container - the element holding the blocks.
   * @param context - the context the blocks resolve against.
   * @returns the blocks in document order.
   */
  readonly readBlocks: (container: Element, context: DocxReadContext) => readonly DocxBlock[]
}

/** Field state tracked across the runs of one paragraph. */
interface FieldState {
  instruction: string
  inResult: boolean
  field?: 'page' | 'pageCount'
}

/**
 * Read a container's top-level blocks.
 * @param container - a `w:body`, `w:hdr`, `w:ftr`, or `w:tc` element.
 * @param context - the resolved document context.
 * @returns the paragraphs and tables in document order.
 */
export function readBlocks(container: Element | undefined, context: DocxReadContext): readonly DocxBlock[] {
  const blocks: DocxBlock[] = []
  for (const node of children(container, NS_W)) {
    if (node.localName === 'p') blocks.push(...readParagraphBlocks(node, context))
    else if (node.localName === 'tbl') blocks.push(readTable(node, context))
    else if (node.localName === 'sdt') blocks.push(...readSdtBlocks(node, context))
  }
  return applyContextualSpacing(blocks)
}

/**
 * Read the blocks a structured document tag wraps.
 *
 * Word templates park whole paragraphs, tables, and TOCs inside `w:sdt`
 * content controls; the tag is metadata and the content reads as if bare.
 * @param element - the `w:sdt` element.
 * @param context - the resolved document context.
 * @returns the wrapped blocks, or nothing when the tag wraps no content.
 */
function readSdtBlocks(element: Element, context: DocxReadContext): readonly DocxBlock[] {
  const content = child(element, NS_W, 'sdtContent')
  return content === undefined ? [] : context.readBlocks(content, context)
}

/**
 * Copy adjacent same-style paragraphs that suppress spacing between them.
 *
 * `w:contextualSpacing` is the one paragraph property whose effect depends on
 * a neighbour, so it is applied to a container's finished block list rather
 * than while one paragraph is read.
 * @param blocks - the blocks read from one container.
 * @returns the blocks with contextual spacing applied.
 */
export function applyContextualSpacing(blocks: readonly DocxBlock[]): readonly DocxBlock[] {
  const result = [...blocks]
  for (let index = 1; index < result.length; index += 1) {
    const current = result[index]
    const previous = result[index - 1]
    if (current.kind !== 'paragraph' || previous.kind !== 'paragraph') continue
    if (current.styleId === undefined || current.styleId !== previous.styleId) continue
    if (current.contextual !== true) continue
    result[index] = { ...current, spaceBeforePx: 0 }
    result[index - 1] = { ...previous, spaceAfterPx: 0 }
  }
  return result
}

/**
 * Turn a resolved run format into the appearance a component paints.
 * @param format - the run format after the cascade.
 * @param theme - the document theme, for the default typeface.
 * @returns the complete text style.
 */
function textStyleOf(format: RunFormat, theme: Theme): DocxTextStyle {
  return {
    bold: format.bold ?? false,
    italic: format.italic ?? false,
    underline: format.underline ?? false,
    ...(format.underlineStyle === undefined ? {} : { underlineStyle: format.underlineStyle }),
    strike: format.strike ?? false,
    caps: format.caps ?? false,
    smallCaps: format.smallCaps ?? false,
    sizePx: format.sizePx ?? halfPtToPx(DEFAULT_SIZE_HALF_POINTS),
    fontFamily: format.fontFamily ?? `"${theme.fonts.minorLatin}", sans-serif`,
    color: format.color,
    highlight: format.highlight,
    shading: format.shading,
    verticalAlign: format.verticalAlign,
    letterSpacingPx: format.letterSpacingPx ?? 0,
  }
}



/**
 * The field a Word instruction asks for, when this renderer computes it.
 * @param instruction - the raw `w:instr` or `w:instrText` value.
 * @returns the field, or undefined when the cached result should be drawn instead.
 */
function fieldOf(instruction: string): 'page' | 'pageCount' | undefined {
  if (/\bNUMPAGES\b/u.test(instruction)) return 'pageCount'
  if (/\bPAGE\b/u.test(instruction)) return 'page'
  return undefined
}

/**
 * Read one paragraph into the blocks it becomes.
 *
 * A `w:br w:type="page"` inside the paragraph ends the current block, so the
 * text after it starts a block that opens a new page; the same paragraph
 * properties apply to every part.
 * @param element - the `w:p` element.
 * @param context - the resolved document context.
 * @returns one or more paragraph blocks.
 */
export function readParagraphBlocks(element: Element, context: DocxReadContext): readonly DocxParagraph[] {
  const properties = child(element, NS_W, 'pPr')
  const styleId = wAttr(child(properties, NS_W, 'pStyle'), 'val')
  const style = context.styles.paragraph(styleId)
  const own = readParaFormat(properties, context.theme)
  const marker = own.numId === undefined ? undefined : context.numbering.marker(own.numId, own.numLevel ?? 0)
  const paragraph = mergePara(mergePara(style.para, marker?.para ?? {}), own)
  // The table band's run properties sit below the paragraph style cascade and
  // above the document defaults, which the paragraph style already carries.
  const mark = mergeRun(
    mergeRun(context.runUnderlay ?? {}, style.run),
    readRunFormat(child(properties, NS_W, 'rPr'), context.theme),
  )
  const segments = readInlines(element, mark, context)

  // East Asian indents written in character units resolve against the
  // paragraph mark's size and override the twips values.
  const charWidth = mark.sizePx ?? halfPtToPx(22)
  const indentLeftPx = roundPx(paragraph.leftChars !== undefined
    ? paragraph.leftChars / 100 * charWidth
    : paragraph.indentLeftPx ?? 0)
  const indentRightPx = roundPx(paragraph.rightChars !== undefined
    ? paragraph.rightChars / 100 * charWidth
    : paragraph.indentRightPx ?? 0)
  const firstLinePx = paragraph.firstLineChars !== undefined
    ? paragraph.firstLineChars / 100 * charWidth
    : paragraph.firstLinePx ?? 0
  const hangingPx = paragraph.hangingChars !== undefined
    ? paragraph.hangingChars / 100 * charWidth
    : paragraph.hangingPx ?? 0
  const shared = {
    kind: 'paragraph' as const,
    align: paragraph.align ?? 'left',
    bidi: paragraph.bidi ?? false,
    indentLeftPx,
    indentRightPx,
    textIndentPx: roundPx(firstLinePx - hangingPx),
    spaceBeforePx: roundPx(paragraph.spaceBeforePx ?? 0),
    spaceAfterPx: roundPx(paragraph.spaceAfterPx ?? 0),
    borders: paragraph.borders ?? {},
    contextual: paragraph.contextualSpacing === true,
    keepNext: paragraph.keepNext ?? false,
    keepLines: paragraph.keepLines ?? false,
    mark: textStyleOf(mark, context.theme),
    ...(readBookmarkNames(element).length === 0 ? {} : { bookmarks: readBookmarkNames(element) }),
    ...(paragraph.lineSpacing === undefined ? {}
      : 'multiple' in paragraph.lineSpacing
        ? { lineMultiple: paragraph.lineSpacing.multiple }
        : {
          lineHeightPx: roundPx(paragraph.lineSpacing.px),
          ...(paragraph.lineSpacing.atLeast === true ? { lineHeightAtLeast: true } : {}),
        }),
    ...(paragraph.tabs === undefined ? {} : { tabStops: paragraph.tabs }),
    ...(paragraph.shading === undefined ? {} : { shading: paragraph.shading }),
    ...(styleId === undefined ? {} : { styleId }),
  }
  return segments.map((inlines, index) => ({
    ...shared,
    pageBreakBefore: index > 0 || (paragraph.pageBreakBefore ?? false),
    ...(index === 0 && marker !== undefined
      ? { marker: markerOf(marker, mark, paragraph, context.theme) }
      : {}),
    inlines,
  }))
}

/**
 * Collect the bookmark names a paragraph opens.
 * @param element - the `w:p` element.
 * @returns the names in document order.
 */
function readBookmarkNames(element: Element): readonly string[] {
  const names = [...children(element, NS_W, 'bookmarkStart')]
    .map(bookmark => wAttr(bookmark, 'name'))
    .filter((name): name is string => name !== undefined && name !== '')
  return [...new Set(names)]
}

/**
 * Build the marker a numbered paragraph shows.
 * @param marker - the numbering level's marker.
 * @param mark - the paragraph mark's run format.
 * @param paragraph - the resolved paragraph format, for the hanging distance.
 * @param theme - the document theme.
 * @returns the marker with its style and indent.
 */
function markerOf(
  marker: NumberingMarker,
  mark: RunFormat,
  paragraph: ParaFormat,
  theme: Theme,
): DocxListMarker {
  const indentPx = paragraph.hangingPx ?? DEFAULT_MARKER_INDENT_PX
  const suffix = marker.suffix === 'tab' ? 'tab' : marker.suffix === 'space' ? ' ' : ''
  return {
    text: marker.text,
    suffix,
    indentPx: roundPx(indentPx),
    style: textStyleOf(mergeRun(mark, marker.run), theme),
  }
}

/**
 * Read a run's resolved format.
 * @param run - the `w:r` element.
 * @param base - the paragraph's resolved run format.
 * @param context - the resolved document context.
 * @returns the merged run format.
 */
function runFormatOf(run: Element, base: RunFormat, context: DocxReadContext): RunFormat {
  const properties = child(run, NS_W, 'rPr')
  const character = context.styles.character(wAttr(child(properties, NS_W, 'rStyle'), 'val'))
  return mergeRun(mergeRun(base, character), readRunFormat(properties, context.theme))
}

/**
 * Read a paragraph's content nodes into one inline list per page.
 *
 * The returned outer list holds one entry per page break the paragraph
 * contains; a paragraph without one returns a single list.
 * @param parent - the `w:p`, `w:hyperlink`, `w:ins`, or `w:fldSimple` element.
 * @param base - the run format the content nodes inherit.
 * @param context - the resolved document context.
 * @param link - the external hyperlink target the content sits in, when any.
 * @param anchor - the in-document bookmark the content sits in, when any.
 * @returns the inline lists, split at every page break.
 */
function readInlines(
  parent: Element,
  base: RunFormat,
  context: DocxReadContext,
  link?: string,
  anchor?: string,
): readonly (readonly DocxInline[])[] {
  const segments: DocxInline[][] = [[]]
  const fields: FieldState[] = []
  const push = (inline: DocxInline): void => {
    segments.at(-1)?.push(inline)
  }
  const suppressed = (): boolean => fields.some(field => field.field !== undefined)
  const rendersText = (): boolean => {
    const open = fields.at(-1)
    return (open === undefined || open.inResult) && !suppressed()
  }
  const append = (nested: readonly (readonly DocxInline[])[]): void => {
    for (const segment of nested) for (const inline of segment) push(inline)
  }

  for (const node of children(parent, NS_W)) {
    switch (node.localName) {
      case 'r': {
        const format = runFormatOf(node, base, context)
        const control = child(node, NS_W, 'fldChar')
        if (control !== undefined) {
          const kind = wAttr(control, 'fldCharType')
          if (kind === 'begin') fields.push({ instruction: '', inResult: false })
          else if (kind === 'separate') {
            const open = fields.at(-1)
            if (open !== undefined) {
              open.inResult = true
              const field = fieldOf(open.instruction)
              if (field !== undefined) {
                open.field = field
                push({ kind: 'field', field, style: textStyleOf(format, context.theme) })
              }
            }
          } else if (kind === 'end') fields.pop()
          break
        }
        const instruction = child(node, NS_W, 'instrText')
        if (instruction !== undefined) {
          const open = fields.at(-1)
          if (open !== undefined) open.instruction += instruction.textContent
          break
        }
        if (rendersText()) readRunContent(node, format, context, link, anchor, segments)
        break
      }
      case 'hyperlink':
        append(readInlines(node, base, context, hyperlinkTarget(node, context) ?? link, hyperlinkAnchor(node) ?? anchor))
        break
      case 'ins':
        append(readInlines(node, base, context, link, anchor))
        break
      case 'sdt': {
        const content = child(node, NS_W, 'sdtContent')
        if (content !== undefined) append(readInlines(content, base, context, link, anchor))
        break
      }
      case 'fldSimple': {
        const field = fieldOf(wAttr(node, 'instr') ?? '')
        if (field === undefined) append(readInlines(node, base, context, link, anchor))
        else push({ kind: 'field', field, style: textStyleOf(base, context.theme) })
        break
      }
      case 'del':
        break
      default:
        break
    }
  }
  return segments
}

/** The URL schemes a preview may open; Wordpreview never fetches remote media itself. */
const LINK_SCHEMES = new Set(['http', 'https', 'mailto'])

/**
 * The target a hyperlink points at.
 *
 * A relationship whose target names no navigable scheme — `javascript:`,
 * `file:`, anything a document could use to run code in the viewer — is not a
 * link; the run renders as styled text.
 * @param element - the `w:hyperlink` element.
 * @param context - the resolved document context.
 * @returns the external URL, or undefined when it names no safe external part.
 */
function hyperlinkTarget(element: Element, context: DocxReadContext): string | undefined {
  const id = attrNs(element, NS_R, 'id')
  const relationship = id === undefined ? undefined : context.relationships.get(id)
  if (relationship?.external !== true) return undefined
  const target = relationship.target
  const scheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/u.exec(target)?.[0].slice(0, -1).toLowerCase()
  return scheme !== undefined && LINK_SCHEMES.has(scheme) ? target : undefined
}

/**
 * The in-document bookmark a hyperlink jumps to.
 * @param element - the `w:hyperlink` element.
 * @returns the bookmark name, or undefined when none is stated.
 */
function hyperlinkAnchor(element: Element): string | undefined {
  const anchor = wAttr(element, 'anchor')
  return anchor === undefined || anchor === '' ? undefined : anchor
}

/**
 * Read one run's content nodes.
 * @param run - the `w:r` element.
 * @param format - the run's resolved format.
 * @param context - the resolved document context.
 * @param link - the external hyperlink target the run sits in, when any.
 * @param anchor - the in-document bookmark the run sits in, when any.
 * @param segments - the inline lists of the enclosing paragraph, one per page.
 */
function readRunContent(
  run: Element,
  format: RunFormat,
  context: DocxReadContext,
  link: string | undefined,
  anchor: string | undefined,
  segments: DocxInline[][],
): void {
  if (format.vanish === true) return
  const style = textStyleOf(format, context.theme)
  const push = (inline: DocxInline): void => {
    segments.at(-1)?.push(inline)
  }
  const text = (value: string): void => {
    push({
      kind: 'text', text: value, style,
      ...(link === undefined ? {} : { link }),
      ...(anchor === undefined ? {} : { anchor }),
    })
  }
  for (const node of children(run, NS_W)) {
    switch (node.localName) {
      case 't':
        text(node.textContent)
        break
      case 'br':
        if (wAttr(node, 'type') === 'page') segments.push([])
        else push({ kind: 'break' })
        break
      case 'cr':
        push({ kind: 'break' })
        break
      case 'tab':
        push({ kind: 'tab', style })
        break
      case 'noBreakHyphen':
        text('\u2011')
        break
      case 'footnoteReference':
      case 'endnoteReference': {
        // The note text itself is not rendered; the reference mark is, so
        // a reader still sees where a note anchors. Word numbers references
        // by document order, which the reference id mirrors for common files.
        const id = wNum(node, 'id')
        if (id !== undefined) {
          push({
            kind: 'text',
            text: String(id),
            style: { ...style, verticalAlign: 'super' },
            ...(anchor === undefined ? {} : { anchor }),
          })
        }
        break
      }
      case 'sym': {
        // `w:char` is a hexadecimal code point in the run's symbol font.
        const code = wAttr(node, 'char')
        const point = code === undefined ? Number.NaN : Number.parseInt(code, 16)
        if (Number.isFinite(point)) text(String.fromCharCode(point))
        break
      }
      case 'drawing': {
        const image = readDrawing(node, context)
        if (image === undefined) push({ kind: 'unsupported', text: context.labels.unsupportedObject(), style })
        else push({ kind: 'image', image })
        break
      }
      case 'pict': {
        const image = readPict(node, context)
        if (image === undefined) push({ kind: 'unsupported', text: context.labels.unsupportedObject(), style })
        else push({ kind: 'image', image })
        break
      }
      case 'object':
        push({ kind: 'unsupported', text: context.labels.unsupportedObject(), style })
        break
      default:
        break
    }
  }
}
