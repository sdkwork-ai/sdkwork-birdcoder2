/**
 * Text-frame presentation.
 *
 * A paragraph is a flex row: the hanging area holds the bullet, the content
 * area holds the runs. That mapping keeps wrapped lines aligned under the first
 * line, which is what a hanging indent means, without measuring anything.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { PptxParagraph, PptxRun, PptxTextBody } from '../pptx/model.ts'
import { bulletNumberFormat, bulletNumberPrefix, bulletNumberSuffix } from '../pptx/text.ts'

/** Justification for the body's vertical anchor. */
const ANCHORS: Readonly<Record<PptxTextBody['anchor'], CSSProperties['justifyContent']>> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
}

/** Transform a run's baseline shift into a CSS vertical alignment. */
function verticalAlign(run: PptxRun): CSSProperties['verticalAlign'] {
  if (run.baseline > 0) return 'super'
  if (run.baseline < 0) return 'sub'
  return undefined
}

/** CSS for one run. */
export function runStyle(run: PptxRun): CSSProperties {
  return {
    fontSize: `${run.sizePx}px`,
    fontWeight: run.bold ? 700 : 400,
    fontStyle: run.italic ? 'italic' : 'normal',
    color: run.color,
    fontFamily: run.fontFamily,
    textDecoration: [
      run.underline ? 'underline' : '',
      run.strike ? 'line-through' : '',
    ].filter(part => part !== '').join(' ') || undefined,
    textDecorationStyle: run.underline && run.underlineStyle !== undefined
      ? run.underlineStyle
      : undefined,
    textShadow: run.shadow === true ? '1px 1px 2px rgba(0, 0, 0, 0.35)' : undefined,
    letterSpacing: run.letterSpacing === 0 ? undefined : `${run.letterSpacing}px`,
    verticalAlign: verticalAlign(run),
    backgroundColor: run.highlight,
  }
}

/** Convert a Roman numeral, upper- or lowercase. */
function roman(value: number, lowercase = false): string {
  const table: readonly (readonly [number, string])[] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let remaining = Math.max(1, Math.round(value))
  let text = ''
  for (const [amount, glyph] of table) {
    while (remaining >= amount) {
      text += glyph
      remaining -= amount
    }
  }
  return lowercase ? text.toLowerCase() : text
}

/** Convert a letters-based ordinal, upper- or lowercase. */
function alpha(value: number, uppercase = false): string {
  let remaining = Math.max(1, Math.round(value))
  let text = ''
  while (remaining > 0) {
    const offset = (remaining - 1) % 26
    text = String.fromCharCode((uppercase ? 65 : 97) + offset) + text
    remaining = Math.floor((remaining - 1) / 26)
  }
  return text
}

/**
 * The marker text a numbered paragraph shows.
 * @param paragraph - the paragraph carrying the numbered bullet.
 * @returns the counter with its punctuation.
 */
export function bulletText(paragraph: PptxParagraph): string {
  const bullet = paragraph.bullet
  if (bullet.kind === 'char') return bullet.text
  if (bullet.kind !== 'number') return ''
  const value = Number.parseInt(bullet.text, 10)
  const ordinal = Number.isFinite(value) ? value : bullet.startAt
  const format = bulletNumberFormat(bullet)
  const body = format === 'romanUc' ? roman(ordinal)
    : format === 'romanLc' ? roman(ordinal, true)
      : format === 'alphaUc' ? alpha(ordinal, true)
        : format === 'alphaLc' ? alpha(ordinal)
          : String(ordinal)
  return `${bulletNumberPrefix(bullet)}${body}${bulletNumberSuffix(bullet)}`
}

/** One rendered run, including hard line breaks and links. */
function RunView({ run }: { readonly run: PptxRun }): ReactNode {
  if (run.lineBreak) return <br />
  if (run.link !== undefined) {
    // `#slide/N` targets another slide of this preview; the body's delegated
    // click handler navigates, so the anchor carries no href of its own.
    if (run.link.startsWith('#slide/')) {
      return (
        <a
          data-pptx-slide-jump={run.link.slice('#slide/'.length)}
          href="#"
          style={runStyle(run)}
          onClick={(event) => { event.preventDefault() }}
        >
          {run.text}
        </a>
      )
    }
    return (
      <a href={run.link} target="_blank" rel="noopener noreferrer" style={runStyle(run)}>
        {run.text}
      </a>
    )
  }
  return <span style={runStyle(run)}>{run.text}</span>
}

/** One rendered paragraph. */
function ParagraphView({ paragraph }: { readonly paragraph: PptxParagraph }): ReactNode {
  const hanging = paragraph.indent < 0
  const bulletWidth = hanging ? -paragraph.indent : 0
  const marker = bulletText(paragraph)
  // A character bullet without its own colour takes the first run's colour,
  // which is how Office colours bullets in a styled body.
  const markerColor = paragraph.bullet.color
    ?? paragraph.runs.find(run => !run.lineBreak)?.color
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    marginLeft: `${paragraph.marginLeft + (hanging ? paragraph.indent : 0)}px`,
    marginTop: paragraph.spaceBeforePx === 0 ? undefined : `${paragraph.spaceBeforePx}px`,
    marginBottom: paragraph.spaceAfterPx === 0 ? undefined : `${paragraph.spaceAfterPx}px`,
    lineHeight: paragraph.lineSpacingExactPx === undefined
      ? paragraph.lineSpacing
      : `${paragraph.lineSpacingExactPx}px`,
  }
  const content: CSSProperties = {
    flex: '1 1 auto',
    minWidth: 0,
    textAlign: paragraph.align === 'justify' ? 'justify' : paragraph.align,
  }
  return (
    <div style={style}>
      {marker !== '' && (
        <span
          style={{
            flex: '0 0 auto',
            width: `${bulletWidth}px`,
            display: 'flex',
            justifyContent: paragraph.bullet.kind === 'number' ? 'flex-end' : 'flex-start',
            paddingRight: paragraph.bullet.kind === 'number' ? '0.35em' : undefined,
            color: markerColor,
            fontFamily: paragraph.bullet.fontFamily,
            fontSize: paragraph.bullet.sizePx === undefined ? undefined : `${paragraph.bullet.sizePx}px`,
          }}
        >
          {marker}
        </span>
      )}
      {marker === '' && paragraph.indent > 0 && <span style={{ flex: '0 0 auto', width: `${paragraph.indent}px` }} />}
      <span style={content}>
        {paragraph.runs.length === 0
          ? '\u200b'
          : paragraph.runs.map((run, index) => <RunView key={index} run={run} />)}
      </span>
    </div>
  )
}

/**
 * Render a shape's or cell's text frame.
 * @param props - the parsed text body.
 * @returns the positioned text block.
 */
export function TextFrame({ body }: { readonly body: PptxTextBody }): ReactNode {
  return (
    <div
      style={{
        ...(body.columns === undefined
          ? { display: 'flex', flexDirection: 'column', justifyContent: ANCHORS[body.anchor] }
          // CSS multi-column layout needs block flow; the vertical anchor
          // then applies to the columns as a whole rather than per paragraph.
          : { display: 'block', columnCount: body.columns, columnGap: '0.5em' }),
        width: '100%',
        height: '100%',
        padding: `${body.insetTop}px ${body.insetRight}px ${body.insetBottom}px ${body.insetLeft}px`,
        boxSizing: 'border-box',
        whiteSpace: body.wrap ? 'pre-wrap' : 'nowrap',
        overflowWrap: body.wrap ? 'break-word' : 'normal',
        writingMode: body.vertical === 'horizontal' ? undefined : 'vertical-rl',
        transform: body.vertical === 'vert270' ? 'rotate(180deg)' : undefined,
      }}
    >
      {body.paragraphs.map((paragraph, index) => <ParagraphView key={index} paragraph={paragraph} />)}
    </div>
  )
}
