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
 * The background a tab leader paints with, in the paragraph's own ink.
 *
 * Dots and hyphens repeat as small marks riding the baseline, an underscore is
 * a solid rule; `background-repeat: repeat-x` tiles whichever one along the
 * line's free width, which is the run-up Word fills on the way to the stop.
 * @param leader - the leader the stop declares.
 * @returns the background properties.
 */
function leaderBackground(leader: 'dot' | 'hyphen' | 'underscore'): CSSProperties {
  const dot = 'radial-gradient(circle, currentColor 1px, transparent 1.2px)'
  const hyphen = 'linear-gradient(currentColor, currentColor)'
  if (leader === 'dot') {
    return { backgroundImage: dot, backgroundSize: '5px 2px', backgroundPosition: 'left 60%', backgroundRepeat: 'repeat-x' }
  }
  if (leader === 'hyphen') {
    return { backgroundImage: hyphen, backgroundSize: '6px 1px', backgroundPosition: 'left 70%', backgroundRepeat: 'repeat-x' }
  }
  return { backgroundImage: hyphen, backgroundSize: '100% 1px', backgroundPosition: 'left 75%', backgroundRepeat: 'repeat-x' }
}

/** The kind of tab stop a paragraph declares, with its optional leader. */
type TabStop = { readonly posPx: number; readonly val: 'left' | 'center' | 'right'; readonly leader?: 'dot' | 'hyphen' | 'underscore' }

/**
 * Render a paragraph's content as segments laid out against its tab stops.
 *
 * Word advances a tab to the next declared stop; as flex items the segments
 * reproduce the dominant patterns - a right stop pins the following segment
 * to the trailing edge (the classic left...right header or TOC entry) and a
 * center stop balances it (the left/center/right footer). A left stop falls
 * back to a spacer at the stop's position. A stop that declares a leader fills
 * the free space before its segment with the repeating mark, which is how Word
 * draws a TOC's dotted run from the entry to the page number.
 * @param inlines - the paragraph's inline list.
 * @param stops - the paragraph's declared stops, ascending by position.
 * @param pageContext - the page the segments are drawn on.
 * @returns one flex child per segment, with a leader between the ones a
 * leading stop separates.
 */
function renderWithStops(
  inlines: readonly DocxInline[],
  stops: readonly TabStop[],
  pageContext: PageContext,
): ReactNode {
  const segments = tabSegments(inlines)
  if (segments.length <= 1) {
    return inlines.map((inline, index) => <InlineView key={index} inline={inline} pageContext={pageContext} />)
  }
  const renderSegment = (segment: readonly DocxInline[], key: string): ReactNode => (
    <span key={key} style={{ display: 'inline-block' }}>
      {segment.map((inline, inlineIndex) => <InlineView key={inlineIndex} inline={inline} pageContext={pageContext} />)}
    </span>
  )
  const items: ReactNode[] = [renderSegment(segments[0], '0')]
  segments.slice(1).forEach((segment, segmentIndex) => {
    const stop = stops[Math.min(segmentIndex, stops.length - 1)]
    const leader = stop.leader
    if (leader !== undefined && stop.val !== 'left') {
      // The leader is its own flex item, so the free width before the stop
      // becomes the dotted run; the segment then needs no auto margin of its
      // own — the leader's growth carries it to the edge. A centered stop
      // balances the text with an unseen spacer, so the dots stop at the text
      // the way Word's run-up does.
      items.push(
        <span
          key={`leader-${segmentIndex}`}
          data-docx-tab-leader={leader}
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            alignSelf: 'flex-end',
            minWidth: '8px',
            overflow: 'hidden',
            height: '0.9em',
            marginBottom: '0.1em',
            ...leaderBackground(leader),
          }}
        />,
      )
      items.push(renderSegment(segment, `${segmentIndex + 1}`))
      if (stop.val === 'center') items.push(<span key={`spacer-${segmentIndex}`} style={{ flex: '1 1 0' }} />)
      return
    }
    const stopStyle: CSSProperties = stop.val === 'right'
      ? { marginLeft: 'auto' }
      : stop.val === 'center'
        ? { margin: '0 auto' }
        : { marginLeft: `${Math.round(stop.posPx)}px` }
    items.push(
      <span key={`${segmentIndex + 1}`} style={{ display: 'inline-block', ...stopStyle }}>
        {segment.map((inline, inlineIndex) => <InlineView key={inlineIndex} inline={inline} pageContext={pageContext} />)}
      </span>,
    )
  })
  return items
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
 * out, so the ratio the body probed turns it into an absolute height. An exact
 * rule states its pixels as they stand; an at-least rule is a floor, so the
 * larger of the stated height and the typeface's own pitch wins, which is the
 * growth Word's `atLeast` allows.
 * @param paragraph - the paragraph in question.
 * @returns the CSS value, or undefined for the document's own default.
 */
function useLineHeight(paragraph: DocxParagraph): string | undefined {
  const ratioOf = useContext(LineRatioContext)
  if (paragraph.lineMultiple === undefined) {
    if (paragraph.lineHeightPx === undefined) return undefined
    if (paragraph.lineHeightAtLeast !== true) return `${paragraph.lineHeightPx}px`
    const natural = ratioOf(paragraph.mark.fontFamily) * paragraph.mark.sizePx
    return `${roundPx(Math.max(paragraph.lineHeightPx, natural))}px`
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
