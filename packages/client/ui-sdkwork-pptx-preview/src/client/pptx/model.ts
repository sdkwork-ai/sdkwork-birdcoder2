/**
 * The render model a parsed presentation becomes.
 *
 * Geometry is absolute CSS pixels inside the slide box and every colour is
 * already resolved, so rendering is a pure projection of this model with no
 * theme lookups. Values that OOXML inherits are flattened during parsing
 * because inheritance is a property of the document graph, not of the view.
 */
import type { CssColor } from '@deepseek-ai/dsh-client-sdkwork-office'

/** A uniform fill. */
export interface SolidFill {
  readonly kind: 'solid'
  readonly color: CssColor
}

/** A linear or radial gradient fill with its stops already ordered. */
export interface GradientFill {
  readonly kind: 'gradient'
  readonly radial: boolean
  /** CSS gradient angle in degrees, clockwise from "to top". */
  readonly angle: number
  readonly stops: readonly { readonly offset: number; readonly color: CssColor }[]
}

/** A picture fill, resolved to a Blob URL. */
export interface ImageFill {
  readonly kind: 'image'
  readonly src: string
  readonly mode: 'stretch' | 'tile'
}

/** Any shape or text background. */
export type PptxFill = SolidFill | GradientFill | ImageFill

/** A shape outline. */
export interface PptxLine {
  readonly color?: CssColor
  /** Stroke width in CSS pixels; OOXML's default hairline is 0.75pt. */
  readonly width: number
  readonly dashed: boolean
  readonly dotted: boolean
  /** The line's start carries an arrowhead (`a:ln/a:headEnd`). */
  readonly headArrow?: boolean
  /** The line's end carries an arrowhead (`a:ln/a:tailEnd`). */
  readonly tailArrow?: boolean
}

/** One styled text run. */
export interface PptxRun {
  readonly text: string
  /** A hard line break, which carries no text of its own. */
  readonly lineBreak: boolean
  readonly sizePx: number
  readonly bold: boolean
  readonly italic: boolean
  readonly underline: boolean
  readonly strike: boolean
  readonly color: CssColor
  /** Ready-to-use CSS font-family list. */
  readonly fontFamily: string
  /** Baseline shift in percent of the run size; positive is superscript. */
  readonly baseline: number
  /** Letter spacing in CSS pixels. */
  readonly letterSpacing: number
  /** Run background, from `a:highlight`. */
  readonly highlight?: CssColor
  /** Underline ornament beyond a plain line: wavy, double, dashed, or dotted. */
  readonly underlineStyle?: 'wavy' | 'double' | 'dashed' | 'dotted'
  /** The run draws a text shadow (`a:rPr/a:effectLst/a:outerShdw`). */
  readonly shadow?: boolean
  /** External link target, scheme-whitelisted (`a:rPr/a:hlinkClick`). */
  readonly link?: string
}

/** The marker a paragraph starts with. */
export interface PptxBullet {
  readonly kind: 'none' | 'char' | 'number'
  readonly text: string
  readonly color?: CssColor
  readonly sizePx?: number
  readonly fontFamily?: string
  /** First ordinal for an automatic number. */
  readonly startAt: number
  /** Ordinal step between paragraphs at the same level. */
  readonly step: number
  /** Character-bullet size as a fraction of its run's size (`buSzPct`). */
  readonly sizePercent?: number
  /** How a numbered bullet renders its ordinal. */
  readonly numberFormat?: 'arabic' | 'romanLc' | 'romanUc' | 'alphaLc' | 'alphaUc'
  /** Punctuation a numbered bullet places before its ordinal. */
  readonly numberPrefix?: string
  /** Punctuation a numbered bullet appends after its ordinal. */
  readonly numberSuffix?: string
}

/** One paragraph of a text body. */
export interface PptxParagraph {
  readonly align: 'left' | 'center' | 'right' | 'justify'
  readonly level: number
  readonly bullet: PptxBullet
  /** Left margin in pixels. */
  readonly marginLeft: number
  /** First-line indent in pixels; negative values hang the bullet. */
  readonly indent: number
  readonly spaceBeforePx: number
  readonly spaceAfterPx: number
  /** Line-height multiple, already merged from percentage spacing. */
  readonly lineSpacing: number
  /** Exact line height in pixels, from `a:lnSpc/a:spcPts`; overrides the multiple. */
  readonly lineSpacingExactPx?: number
  readonly runs: readonly PptxRun[]
}

/** A shape's or table cell's text frame. */
export interface PptxTextBody {
  readonly paragraphs: readonly PptxParagraph[]
  readonly anchor: 'top' | 'middle' | 'bottom'
  readonly insetLeft: number
  readonly insetTop: number
  readonly insetRight: number
  readonly insetBottom: number
  readonly wrap: boolean
  /** Text rotated inside its box: East Asian vertical text and stacked Latin. */
  readonly vertical: 'horizontal' | 'vert' | 'vert270'
  /** Text flows in this many columns inside the frame (`bodyPr@numCol`). */
  readonly columns?: number
}

/** Properties shared by every rendered shape. */
export interface PptxShapeBase {
  readonly id: string
  readonly name: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Clockwise rotation in degrees. */
  readonly rotation: number
  readonly flipH: boolean
  readonly flipV: boolean
  /** Element opacity in 0–1. */
  readonly opacity: number
}

/** An autoshape with an optional text frame. */
export interface PptxAutoShape extends PptxShapeBase {
  readonly kind: 'shape'
  /** DrawingML preset geometry name; `rect` when the shape states none. */
  readonly preset: string
  /** Freeform clip path in shape pixels, from `a:custGeom`; overrides the preset. */
  readonly custGeomPath?: string
  /** Corner-radius fraction for `roundRect`. */
  readonly cornerRadius: number
  /** Wedge fraction for `pie` and `arc`. */
  readonly adjustments: readonly number[]
  readonly fill?: PptxFill
  readonly line?: PptxLine
  readonly text?: PptxTextBody
  /** Ready-to-use `box-shadow`, from the shape's first outer shadow. */
  readonly shadow?: string
}

/** A placed picture. */
export interface PptxPicture extends PptxShapeBase {
  readonly kind: 'picture'
  readonly src: string
  /** Source-rectangle crop as fractions of the intrinsic image. */
  readonly crop: {
    readonly left: number
    readonly top: number
    readonly right: number
    readonly bottom: number
  }
  readonly preset: string
  readonly line?: PptxLine
  /** Ready-to-use `box-shadow`, from the picture's first outer shadow. */
  readonly shadow?: string
}

/** One table cell. */
export interface PptxTableCell {
  readonly fill?: PptxFill
  readonly text?: PptxTextBody
  /** Columns this cell spans; 1 for an ordinary cell. */
  readonly gridSpan: number
  /** Rows this cell spans; 1 for an ordinary cell. */
  readonly rowSpan: number
  /** True when a merged region continues here and the cell paints nothing. */
  readonly merged: boolean
  readonly borders: {
    readonly top?: PptxLine
    readonly left?: PptxLine
    readonly bottom?: PptxLine
    readonly right?: PptxLine
  }
}

/** A graphic frame holding a table. */
export interface PptxTable extends PptxShapeBase {
  readonly kind: 'table'
  readonly columnWidths: readonly number[]
  readonly rows: readonly {
    readonly height: number
    readonly cells: readonly PptxTableCell[]
  }[]
  readonly banded: boolean
}

/** A group of shapes, with child geometry already flattened into slide pixels. */
export interface PptxGroup extends PptxShapeBase {
  readonly kind: 'group'
  readonly children: readonly PptxShape[]
}

/** A graphic frame the renderer recognizes but does not draw (charts, SmartArt, media). */
export interface PptxPlaceholder extends PptxShapeBase {
  readonly kind: 'placeholder'
  /** Localized description of what the frame holds. */
  readonly label: string
}

/** Anything a slide can contain. */
export type PptxShape = PptxAutoShape | PptxPicture | PptxTable | PptxGroup | PptxPlaceholder

/** One rendered slide. */
export interface PptxSlide {
  /** 1-based position in presentation order. */
  readonly index: number
  /** Localized display name, taken from the slide part's `p:cSld/@name` when present. */
  readonly name: string
  /** The slide's package part name, which edits are keyed and saved against. */
  readonly partName?: string
  /** The slide is marked hidden in the presentation (`p:sld/@show="0"`). */
  readonly hidden?: boolean
  readonly background?: PptxFill
  readonly shapes: readonly PptxShape[]
  /** Speaker notes as plain text, one entry per paragraph. */
  readonly notes: readonly string[]
}

/** A parsed presentation, ready to render. */
export interface PptxDeck {
  readonly width: number
  readonly height: number
  readonly slides: readonly PptxSlide[]
}
