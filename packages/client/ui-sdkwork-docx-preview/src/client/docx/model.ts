/**
 * The render model a parsed WordprocessingML package becomes.
 *
 * A Word document flows rather than places: the model is a list of top-level
 * blocks per section, and every inherited value — the style cascade, numbering
 * counters, theme colours, section geometry — is flattened during parsing
 * because inheritance belongs to the document graph, not to the view.
 * Rendering is then a pure projection of this model.
 */
import type { CssColor } from '@deepseek-ai/dsh-client-sdkwork-office'

/** One drawn edge of a paragraph, table, or cell. */
export interface DocxBorder {
  /** Stroke width in CSS pixels. */
  readonly widthPx: number
  /** CSS `border-style` keyword. */
  readonly style: string
  /** Stroke colour; an undefined colour uses the page's own text colour. */
  readonly color?: CssColor
}

/** The four edges of one box; an absent edge paints nothing. */
export interface DocxBorders {
  readonly top?: DocxBorder
  readonly right?: DocxBorder
  readonly bottom?: DocxBorder
  readonly left?: DocxBorder
}

/** The resolved appearance of one text run. */
export interface DocxTextStyle {
  readonly bold: boolean
  readonly italic: boolean
  readonly underline: boolean
  /** The `w:u/@val` the run states, kept so double, wavy, and dotted lines survive. */
  readonly underlineStyle?: string
  readonly strike: boolean
  /** `w:caps`: the run renders as capitals. */
  readonly caps: boolean
  /** `w:smallCaps`: lowercase letters render as small capitals. */
  readonly smallCaps: boolean
  readonly sizePx: number
  /** Ready-to-use CSS font-family list. */
  readonly fontFamily: string
  readonly color?: CssColor
  readonly highlight?: CssColor
  readonly shading?: CssColor
  /** Baseline shift from `w:vertAlign`. */
  readonly verticalAlign?: 'super' | 'sub'
  /** Letter spacing in CSS pixels; zero leaves the font's own spacing. */
  readonly letterSpacingPx: number
}

/** A source rectangle crop, as fractions of the intrinsic image. */
export interface DocxCrop {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** One placed picture, already resolved to a Blob URL. */
export interface DocxImage {
  readonly src: string
  /** The picture's description, for its accessible name. */
  readonly alt?: string
  readonly widthPx: number
  readonly heightPx: number
  /** Clockwise rotation in degrees; negative values rotate counter-clockwise. */
  readonly rotation: number
  readonly flipH: boolean
  readonly flipV: boolean
  readonly crop: DocxCrop
}

/** One piece of paragraph content. */
export type DocxInline =
  | { readonly kind: 'text'; readonly text: string; readonly style: DocxTextStyle; readonly link?: string; readonly anchor?: string }
  | { readonly kind: 'break' }
  | { readonly kind: 'tab'; readonly style: DocxTextStyle }
  | { readonly kind: 'field'; readonly field: 'page' | 'pageCount'; readonly style: DocxTextStyle }
  | { readonly kind: 'image'; readonly image: DocxImage }
  | { readonly kind: 'unsupported'; readonly text: string; readonly style: DocxTextStyle }

/** The bullet or number a paragraph starts with. */
export interface DocxListMarker {
  /** Marker text with its level placeholder already substituted. */
  readonly text: string
  /** The separator Word writes after the marker: a tab, a space, or nothing. */
  readonly suffix: string
  /** Distance from the paragraph's text edge back to the marker's start, in CSS pixels. */
  readonly indentPx: number
  readonly style: DocxTextStyle
}

/** One paragraph: the smallest block a Word document flows. */
export interface DocxParagraph {
  readonly kind: 'paragraph'
  readonly align: 'left' | 'center' | 'right' | 'justify'
  /** `w:bidi`: the paragraph flows right to left. */
  readonly bidi: boolean
  readonly indentLeftPx: number
  readonly indentRightPx: number
  /** First-line shift in CSS pixels; negative values outdent it. */
  readonly textIndentPx: number
  readonly spaceBeforePx: number
  readonly spaceAfterPx: number
  /** `w:spacing/@line` as a multiple of the font's natural line height. */
  readonly lineMultiple?: number
  /** Exact or at-least line height in CSS pixels, from a non-auto line rule. */
  readonly lineHeightPx?: number
  /** The stated height is a floor the font's own line may rise above. */
  readonly lineHeightAtLeast?: boolean
  /** Custom tab stops the paragraph declares, ascending by position. */
  readonly tabStops?: readonly {
    readonly posPx: number
    readonly val: 'left' | 'center' | 'right'
    readonly leader?: 'dot' | 'hyphen' | 'underscore'
  }[]
  readonly borders: DocxBorders
  readonly shading?: CssColor
  /** The paragraph style it resolved from, used by contextual spacing. */
  readonly styleId?: string
  /** `w:contextualSpacing`: same-style neighbours drop the space between them. */
  readonly contextual?: boolean
  /** `w:keepNext`: the paragraph stays on the page its successor starts on. */
  readonly keepNext: boolean
  /** `w:keepLines`: the paragraph never splits across pages. */
  readonly keepLines: boolean
  /** `w:pageBreakBefore` and `w:br w:type="page"` both set this. */
  readonly pageBreakBefore: boolean
  /** The paragraph mark's own resolved style; an empty paragraph is this tall. */
  readonly mark: DocxTextStyle
  /** `w:bookmarkStart` names this paragraph opens, for internal link targets. */
  readonly bookmarks?: readonly string[]
  readonly marker?: DocxListMarker
  readonly inlines: readonly DocxInline[]
}

/** One table cell with its resolved grid placement. */
export interface DocxTableCell {
  readonly colSpan: number
  readonly rowSpan: number
  /** Cell width in CSS pixels, from `w:tcW` or the grid columns it spans. */
  readonly widthPx: number
  readonly borders: DocxBorders
  readonly shading?: CssColor
  /** The cell's own `w:tcMar`, overriding the table's, in CSS pixels. */
  readonly cellMargin?: DocxCellMargin
  readonly verticalAlign: 'top' | 'center' | 'bottom'
  readonly blocks: readonly DocxBlock[]
}

/** One table row. */
export interface DocxTableRow {
  /** Fixed row height in CSS pixels, when `w:trHeight` states one. */
  readonly heightPx?: number
  /** How `w:trHeight/@hRule` constrains the height; Word's default is at-least. */
  readonly heightRule?: 'atLeast' | 'exact'
  /** `w:tblHeader`: the row repeats at the top of every page the table spans. */
  readonly header: boolean
  /** `w:cantSplit`: the row never breaks across pages. */
  readonly cantSplit: boolean
  readonly cells: readonly DocxTableCell[]
}

/** The cell padding a table applies to every cell. */
export interface DocxCellMargin {
  readonly top: number
  readonly left: number
  readonly bottom: number
  readonly right: number
}

/** One table. */
export interface DocxTable {
  readonly kind: 'table'
  readonly pageBreakBefore: boolean
  readonly keepNext: boolean
  /** `w:tblInd`: the table's left offset from the text margin, in CSS pixels. */
  readonly indentPx: number
  /** Column widths in CSS pixels, in grid order. */
  readonly columns: readonly number[]
  /** `w:tblW` as a fiftieths-of-a-percent denominator (5000 = full width). */
  readonly widthPct?: number
  /** `w:tblLayout w:type="fixed"`; Word's default lets content reshape columns. */
  readonly fixedLayout?: boolean
  /** `w:bidiVisual`: the columns display right to left. */
  readonly bidiVisual?: boolean
  /** `w:tblW w:type="auto"` (or zero width): columns hug their content. */
  readonly widthAuto?: boolean
  readonly rows: readonly DocxTableRow[]
  readonly borders: DocxBorders
  readonly cellMargin: DocxCellMargin
  readonly align: 'left' | 'center' | 'right'
}

/** A top-level body block; a Word section is a sequence of these. */
export type DocxBlock = DocxParagraph | DocxTable

/** A section's page geometry, in CSS pixels. */
export interface DocxPageGeometry {
  readonly widthPx: number
  readonly heightPx: number
  readonly marginTopPx: number
  readonly marginRightPx: number
  readonly marginBottomPx: number
  readonly marginLeftPx: number
  /** Distance from the page's top edge to the header's first line. */
  readonly headerPx: number
  /** Distance from the page's bottom edge to the footer's last line. */
  readonly footerPx: number
  /** Width of the area body blocks flow through. */
  readonly contentWidthPx: number
  /** Height of the area body blocks flow through. */
  readonly contentHeightPx: number
}

/** One section's header or footer, with its parsed blocks. */
export interface DocxHeaderFooter {
  readonly blocks: readonly DocxBlock[]
}

/** How a section selects its header and footer parts. */
export interface DocxHeaderFooterSet {
  readonly default?: DocxHeaderFooter
  readonly first?: DocxHeaderFooter
  readonly even?: DocxHeaderFooter
}

/** One section: a page geometry, its headers and footers, and its body blocks. */
export interface DocxSection {
  readonly geometry: DocxPageGeometry
  /** `w:titlePg`: the first page uses the `first` header and footer. */
  readonly titlePage: boolean
  /** `w:pgNumType/@start`: the number the section's first page carries. */
  readonly pageNumberStart?: number
  readonly headers: DocxHeaderFooterSet
  readonly footers: DocxHeaderFooterSet
  readonly blocks: readonly DocxBlock[]
}

/** A parsed document, ready to paginate and draw. */
export interface DocxDocument {
  readonly sections: readonly DocxSection[]
  /** `w:evenAndOddHeaders`: even pages use their own header and footer. */
  readonly evenAndOddHeaders: boolean
}
