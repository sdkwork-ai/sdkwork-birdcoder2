/**
 * Projection of the render model to CSS.
 *
 * The document paints its own colours, so every value here comes from the
 * model; only the page chrome uses theme tokens. Keeping the projection in one
 * module leaves the components a pure description of the structure.
 */
import { roundPx } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { CssColor } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { CSSProperties } from 'react'
import type { DocxBorder, DocxBorders, DocxTextStyle } from '../docx/model.ts'

/** The advance a `w:tab` content node inserts, Word's default tab stop. */
export const TAB_WIDTH_PX = 48

/** Padding a tab-suffixed list marker keeps before the paragraph text. */
export const MARKER_TAB_PADDING_PX = 4

/**
 * One edge's CSS border value.
 * @param border - the resolved edge, or undefined when it is not drawn.
 * @returns the CSS border value, or undefined.
 */
function edgeOf(border: DocxBorder | undefined): string | undefined {
  if (border === undefined) return undefined
  return `${roundPx(border.widthPx)}px ${border.style} ${border.color ?? 'currentColor'}`
}

/**
 * Border properties for a paragraph, table, or cell.
 * @param borders - the resolved edges.
 * @returns one CSS property per edge; an undrawn edge states nothing.
 */
export function borderStyle(borders: DocxBorders): CSSProperties {
  return {
    borderTop: edgeOf(borders.top),
    borderRight: edgeOf(borders.right),
    borderBottom: edgeOf(borders.bottom),
    borderLeft: edgeOf(borders.left),
  }
}

/**
 * Background properties for a shading colour.
 * @param color - the resolved fill, or undefined.
 * @returns the CSS background property, empty when nothing is painted.
 */
export function shadingStyle(color: CssColor | undefined): CSSProperties {
  return color === undefined ? {} : { background: color }
}

/** CSS `text-decoration-style` for each WordprocessingML underline value. */
const UNDERLINE_STYLES: Readonly<Record<string, NonNullable<CSSProperties['textDecorationStyle']>>> = {
  single: 'solid',
  double: 'double',
  thick: 'solid',
  dotted: 'dotted',
  dottedHeavy: 'dotted',
  dash: 'dashed',
  dashedHeavy: 'dashed',
  dashLong: 'dashed',
  dashLongHeavy: 'dashed',
  dashDotHeavy: 'dashed',
  dashDotDotHeavy: 'dashed',
  dotDash: 'dashed',
  dashDot: 'dashed',
  dotDotDash: 'dashed',
  wave: 'wavy',
  wavyHeavy: 'wavy',
  wavyDouble: 'wavy',
}

/**
 * Underline properties for one run style.
 * @param style - the resolved text style.
 * @returns the decoration line and style, or undefined when no underline is drawn.
 */
function underlineStyleOf(style: DocxTextStyle): CSSProperties | undefined {
  if (!style.underline) return undefined
  const keyword = UNDERLINE_STYLES[style.underlineStyle ?? 'single'] ?? 'solid'
  return keyword === 'solid' ? undefined : { textDecorationStyle: keyword }
}

/**
 * Text properties for one run style.
 *
 * The run states no `line-height`: the paragraph owns the line rhythm, so
 * Word's `w:spacing/@line` applies to every line the paragraph breaks into.
 * @param style - the resolved text style.
 * @returns the CSS properties a run or marker paints with.
 */
export function textStyle(style: DocxTextStyle): CSSProperties {
  const decoration = [
    style.underline ? 'underline' : '',
    style.strike ? 'line-through' : '',
  ].filter(part => part !== '').join(' ')
  return {
    fontSize: `${roundPx(style.sizePx)}px`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontFamily: style.fontFamily,
    color: style.color,
    textDecoration: decoration === '' ? undefined : decoration,
    ...underlineStyleOf(style),
    backgroundColor: style.highlight ?? style.shading,
    verticalAlign: style.verticalAlign,
    textTransform: style.caps ? 'uppercase' : undefined,
    fontVariant: style.smallCaps ? 'small-caps' : undefined,
    letterSpacing: style.letterSpacingPx === 0 ? undefined : `${roundPx(style.letterSpacingPx)}px`,
  }
}

/**
 * Placement properties for a table's own alignment.
 * @param align - the table's horizontal alignment.
 * @returns the CSS margin properties that place it.
 */
export function tableAlignStyle(align: 'left' | 'center' | 'right'): CSSProperties {
  if (align === 'center') return { marginLeft: 'auto', marginRight: 'auto' }
  if (align === 'right') return { marginLeft: 'auto', marginRight: 0 }
  return { marginLeft: 0, marginRight: 'auto' }
}
