/**
 * Block presentation.
 *
 * A paragraph is the only block that flows: its margins, indents, borders, and
 * shading are painted on one element, and a numbered paragraph hangs its marker
 * in a flex row so wrapped lines align under the first one. Word adds the
 * space after one paragraph to the space before the next rather than taking
 * the larger, so the flow margins are precomputed for a block list instead of
 * read off each block alone. The `data-docx-block` attribute marks each
 * top-level block for the measurement pass that runs before pagination.
 */
import { roundPx } from '@deepseek-ai/dsh-client-sdkwork-office'
import { useContext, type CSSProperties, type ReactNode } from 'react'
import type { DocxBlock, DocxInline, DocxParagraph } from '../docx/model.ts'
import { InlineView } from './InlineView.tsx'
import type { PageContext } from './InlineView.tsx'
import { MARKER_TAB_PADDING_PX, borderStyle, shadingStyle, textStyle } from './paint.ts'
import { TableView } from './TableView.tsx'
import { LineRatioContext } from './metrics.tsx'

/**
 * The vertical margins a block list paints with.
 *
 * Word sums the space after one paragraph into the space before its successor;
 * CSS margins collapse instead, so each block carries one combined top margin
 * and paints no bottom margin. The first block of a page drops its spacing
 * entirely, which is Word's own suppression of space before a page top.
 * @param blocks - the blocks in flow order.
 * @param pageTop - whether the first block opens a page.
 * @returns one top margin per block, in CSS pixels.
 */
export function flowTopMargins(blocks: readonly DocxBlock[], pageTop: boolean): readonly number[] {
  let previousAfter = 0
  return blocks.map((block, index) => {
    const before = block.kind === 'paragraph' ? block.spaceBeforePx : 0
    const top = index === 0 && pageTop ? 0 : roundPx(before + previousAfter)
    previousAfter = block.kind === 'paragraph' ? block.spaceAfterPx : 0
    return top
  })
}

/**
 * Which stated borders Word suppresses between adjacent paragraphs.
 *
 * Consecutive paragraphs with identical borders and indents draw one shared
 * box: the internal top and bottom edges disappear, leaving a single rule
 * under the group. A changed border, indent, or an intervening table starts a
 * new box.
 * @param blocks - the blocks in flow order.
 * @returns one cull per block: the edges it must not paint.
 */
export function borderCulls(blocks: readonly DocxBlock[]): readonly { readonly top: boolean; readonly bottom: boolean }[] {
  const keyOf = (paragraph: DocxParagraph): string =>
    JSON.stringify({ borders: paragraph.borders, left: paragraph.indentLeftPx, right: paragraph.indentRightPx })
  return blocks.map((block, index) => {
    if (block.kind !== 'paragraph') return { top: false, bottom: false }
    const key = keyOf(block)
    const previous = index > 0 ? blocks[index - 1] : undefined
    const next = index + 1 < blocks.length ? blocks[index + 1] : undefined
    return {
      top: previous !== undefined && previous.kind === 'paragraph' && keyOf(previous) === key,
      bottom: next !== undefined && next.kind === 'paragraph' && keyOf(next) === key,
    }
  })
}

/**
 * Split a paragraph's inlines at its tab characters.
 * @param inlines - the paragraph's inline list.
 * @returns the segments the tabs separate, in order.
 */
function tabSegments(inlines: readonly DocxInline[]): readonly (readonly DocxInline[])[] {
  const segments: DocxInline[][] = [[]]
  for (const inline of inlines) {
    if (inline.kind === 'tab') segments.push([])
    else segments[segments.length - 1].push(inline)
  }
  while (segments.length > 1 && segments[segments.length - 1].length === 0) segments.pop()
  return segments
}

/**
 * Render a paragraph's content as segments laid out against its tab stops.
 *
 * Word advances a tab to the next declared stop; as flex items the segments
 * reproduce the dominant patterns - a right stop pins the following segment
 * to the trailing edge (the classic left...right header or TOC entry) and a
 * center stop balances it (the left/center/right footer). A left stop falls
 * back to a spacer at the stop's position.
 * @param inlines - the paragraph's inline list.
 * @param stops - the paragraph's declared stops, ascending by position.
 * @param pageContext - the page the segments are drawn on.
 * @returns one flex child per segment.
 */
function renderWithStops(
  inlines: readonly DocxInline[],
  stops: readonly { readonly posPx: number; readonly val: 'left' | 'center' | 'right' }[],
  pageContext: PageContext,
): ReactNode {
  const segments = tabSegments(inlines)
  if (segments.length <= 1) {
    return inlines.map((inline, index) => <InlineView key={index} inline={inline} pageContext={pageContext} />)
  }
  return segments.map((segment, index) => {
    if (index === 0) {
      return (
        <span key={index} style={{ display: 'inline-block' }}>
          {segment.map((inline, inlineIndex) => <InlineView key={inlineIndex} inline={inline} pageContext={pageContext} />)}
        </span>
      )
    }
    const stop = stops[Math.min(index - 1, stops.length - 1)]
    const stopStyle: CSSProperties = stop.val === 'right'
      ? { marginLeft: 'auto' }
      : stop.val === 'center'
        ? { margin: '0 auto' }
        : { marginLeft: `${Math.round(stop.posPx)}px` }
    return (
      <span key={index} style={{ display: 'inline-block', ...stopStyle }}>
        {segment.map((inline, inlineIndex) => <InlineView key={inlineIndex} inline={inline} pageContext={pageContext} />)}
      </span>
    )
  })
}

/**
 * The layout properties a paragraph mark contributes to its block element.
 *
 * An empty paragraph is exactly its mark's line tall, so the mark's typeface
 * and size live on the block element; runs paint their own styles over it.
 * @param paragraph - the paragraph whose mark is applied.
 * @returns the CSS properties that shape the paragraph's own line.
 */
function markStyle(paragraph: DocxParagraph): CSSProperties {
  const mark = paragraph.mark
  return {
    fontSize: `${roundPx(mark.sizePx)}px`,
    fontFamily: mark.fontFamily,
    fontWeight: mark.bold ? 700 : undefined,
    fontStyle: mark.italic ? 'italic' : undefined,
    letterSpacing: mark.letterSpacingPx === 0 ? undefined : `${roundPx(mark.letterSpacingPx)}px`,
  }
}

/**
 * The CSS `line-height` a paragraph paints with.
 *
 * A multiple counts natural lines of the typeface, the way Word lays a line
 * out, so the ratio the body probed turns it into an absolute height; an
 * exact or at-least rule already states its pixels.
 * @param paragraph - the paragraph in question.
 * @returns the CSS value, or undefined for the document's own default.
 */
function useLineHeight(paragraph: DocxParagraph): string | undefined {
  const ratioOf = useContext(LineRatioContext)
  if (paragraph.lineMultiple === undefined) {
    return paragraph.lineHeightPx === undefined ? undefined : `${paragraph.lineHeightPx}px`
  }
  const pitch = paragraph.lineMultiple * ratioOf(paragraph.mark.fontFamily) * paragraph.mark.sizePx
  return `${roundPx(pitch)}px`
}

/**
 * Draw one paragraph.
 * @param props - the paragraph, its top margin, and the page it is drawn on.
 * @returns the paragraph element.
 */
function ParagraphView({ paragraph, topMargin, borderCull, pageContext }: {
  readonly paragraph: DocxParagraph
  readonly topMargin: number
  readonly borderCull: { readonly top: boolean; readonly bottom: boolean }
  readonly pageContext: PageContext
}): ReactNode {
  const { marker } = paragraph
  const lineHeight = useLineHeight(paragraph)
  // In a right-to-left paragraph Word reads `left` and `right` justification
  // against the opposite edge, so the CSS values swap with the direction.
  const align = paragraph.bidi
    ? paragraph.align === 'left' ? 'right' : paragraph.align === 'right' ? 'left' : paragraph.align
    : paragraph.align
  const stops = paragraph.tabStops
  const usesStops = stops !== undefined && stops.length > 0
    && paragraph.inlines.some(inline => inline.kind === 'tab')
  const content = paragraph.inlines.length === 0
    ? '\u200b'
    : usesStops
      ? renderWithStops(paragraph.inlines, stops, pageContext)
      : paragraph.inlines.map((inline, inlineIndex) => (
        <InlineView key={inlineIndex} inline={inline} pageContext={pageContext} />
      ))
  return (
    <div
      data-docx-block
      {...(paragraph.bookmarks === undefined ? {} : { 'data-docx-bookmark': paragraph.bookmarks.join(' ') })}
      style={{
        marginLeft: `${paragraph.indentLeftPx - (marker?.indentPx ?? 0)}px`,
        marginRight: `${paragraph.indentRightPx}px`,
        marginTop: `${topMargin}px`,
        marginBottom: '0px',
        textAlign: align,
        direction: paragraph.bidi ? 'rtl' : undefined,
        textIndent: marker === undefined && paragraph.textIndentPx !== 0 ? `${paragraph.textIndentPx}px` : undefined,
        lineHeight,
        ...markStyle(paragraph),
        ...borderStyle({
          ...paragraph.borders,
          ...(borderCull.top ? { top: undefined } : {}),
          ...(borderCull.bottom ? { bottom: undefined } : {}),
        }),
        ...shadingStyle(paragraph.shading),
      }}
    >
      {marker === undefined
        ? (usesStops
          ? <span data-docx-content style={{ display: 'flex', flexWrap: 'wrap', width: '100%' }}>{content}</span>
          : content)
        : marker.indentPx <= 0 ? (
          <span data-docx-content>
            <span style={textStyle(marker.style)}>{`${marker.text}${marker.suffix === ' ' ? ' ' : ''}`}</span>
            {content}
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'baseline' }}>
            <span
              style={{
                flex: '0 0 auto',
                width: `${marker.indentPx}px`,
                textAlign: 'right',
                paddingRight: marker.suffix === 'tab' ? `${MARKER_TAB_PADDING_PX}px` : undefined,
                ...textStyle(marker.style),
              }}
            >
              {`${marker.text}${marker.suffix === ' ' ? ' ' : ''}`}
            </span>
            <span data-docx-content style={{ flex: '1 1 auto', minWidth: 0 }}>{content}</span>
          </span>
        )}
    </div>
  )
}

/**
 * Draw one body block.
 * @param props - the block, its top margin, and the page it is drawn on.
 * @returns the block's element.
 */
export function BlockView({ block, topMargin, pageContext, borderCull = { top: false, bottom: false } }: {
  readonly block: DocxBlock
  readonly topMargin: number
  readonly pageContext: PageContext
  readonly borderCull?: { readonly top: boolean; readonly bottom: boolean }
}): ReactNode {
  if (block.kind === 'table') return <TableView table={block} pageContext={pageContext} />
  return <ParagraphView paragraph={block} topMargin={topMargin} borderCull={borderCull} pageContext={pageContext} />
}
