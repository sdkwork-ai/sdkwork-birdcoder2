/**
 * WordprocessingML property readers.
 *
 * A WordprocessingML property element states only what it overrides, and the
 * cascade decides everything else. Each reader here therefore returns a
 * partial format whose absent members mean "inherit", plus the merge that
 * applies one cascade level over the previous one. Values that need no
 * inheritance context — colours, fonts, lengths — are already resolved and in
 * CSS pixels, so the rest of the parser never sees a twip or a theme name.
 */
import {
  applyTintShade, child, children, eighthPtToPx, halfPtToPx, hexToRgb, rgbToCss, twipsToPx,
} from '@deepseek-ai/dsh-client-sdkwork-office'
import type { CssColor, Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { DocxBorders, DocxCellMargin } from './model.ts'
import { NS_W, wAttr, wNum, wOnOff } from './names.ts'

/** A format under construction: every member optional and assignable. */
type Draft<T> = { -readonly [K in keyof T]?: T[K] }

/** A run's inherited appearance, before defaults are filled in. */
export interface RunFormat {
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  /** The raw `w:u/@val`, kept so double, wavy, and dotted lines survive. */
  readonly underlineStyle?: string
  readonly strike?: boolean
  readonly caps?: boolean
  readonly smallCaps?: boolean
  readonly vanish?: boolean
  readonly color?: CssColor
  readonly sizePx?: number
  /** Ready-to-use CSS font-family list. */
  readonly fontFamily?: string
  readonly highlight?: CssColor
  readonly shading?: CssColor
  readonly verticalAlign?: 'super' | 'sub'
  readonly letterSpacingPx?: number
}

/** Line spacing as CSS `line-height`: either a multiple or an exact pixel height. */
export type LineSpacing = { readonly multiple: number } | { readonly px: number }

/** One custom tab stop a paragraph declares. */
export interface TabStopFormat {
  /** Distance from the text's left edge, in CSS pixels. */
  readonly posPx: number
  /** How the next text aligns at the stop. */
  readonly val: 'left' | 'center' | 'right'
}

/** A paragraph's inherited layout, before defaults are filled in. */
export interface ParaFormat {
  readonly align?: 'left' | 'center' | 'right' | 'justify'
  /** `w:bidi`: the paragraph flows right to left. */
  readonly bidi?: boolean
  readonly indentLeftPx?: number
  readonly indentRightPx?: number
  readonly firstLinePx?: number
  readonly hangingPx?: number
  // East Asian Word writes indents in hundredths of a character; the chars
  // variants override the twips values when present.
  readonly firstLineChars?: number
  readonly hangingChars?: number
  readonly leftChars?: number
  readonly rightChars?: number
  readonly spaceBeforePx?: number
  readonly spaceAfterPx?: number
  readonly lineSpacing?: LineSpacing
  readonly tabs?: readonly TabStopFormat[]
  readonly borders?: DocxBorders
  readonly shading?: CssColor
  readonly keepNext?: boolean
  readonly keepLines?: boolean
  readonly pageBreakBefore?: boolean
  readonly contextualSpacing?: boolean
  readonly numId?: number
  readonly numLevel?: number
}

/** A table's inherited layout. */
export interface TableFormat {
  readonly borders?: DocxBorders
  readonly cellMargin?: DocxCellMargin
  readonly align?: 'left' | 'center' | 'right'
  /** Declared table width in CSS pixels. */
  readonly widthPx?: number
  /** `w:tblInd`: the table's left offset from the text margin, in CSS pixels. */
  readonly indentPx?: number
  /** `w:bidiVisual`: the table's columns display right to left. */
  readonly bidiVisual?: boolean
}

/** Scheme entry names WordprocessingML's `w:themeColor` uses. */
const THEME_COLOR_ALIASES: Readonly<Record<string, string>> = {
  dark1: 'dk1',
  light1: 'lt1',
  dark2: 'dk2',
  light2: 'lt2',
  text1: 'dk1',
  background1: 'lt1',
  text2: 'dk2',
  background2: 'lt2',
  hyperlink: 'hlink',
  followedhyperlink: 'folHlink',
}

/** The standard highlight colours `w:highlight` names. */
const HIGHLIGHT_COLORS: Readonly<Record<string, string | undefined>> = {
  black: '000000',
  blue: '0000FF',
  cyan: '00FFFF',
  green: '00FF00',
  magenta: 'FF00FF',
  red: 'FF0000',
  yellow: 'FFFF00',
  white: 'FFFFFF',
  darkblue: '000080',
  darkcyan: '008080',
  darkgreen: '008000',
  darkmagenta: '800080',
  darkred: '800000',
  darkyellow: '808000',
  darkgray: '808080',
  lightgray: 'C0C0C0',
  none: undefined,
}

/** The four edge names a border container uses, mapped to the model's names. */
const EDGE_NAMES = ['top', 'right', 'bottom', 'left'] as const

/** Border styles that paint nothing. */
const NO_BORDER = new Set(['none', 'nil'])

/** CSS `border-style` for each WordprocessingML border value. */
const BORDER_STYLES: Readonly<Record<string, string>> = {
  single: 'solid',
  thick: 'solid',
  double: 'double',
  dotted: 'dotted',
  dashed: 'dashed',
  dotDash: 'dashed',
  dotDotDash: 'dashed',
  wave: 'solid',
  doubleWave: 'solid',
  dashSmallGap: 'dashed',
  threeDEmboss: 'solid',
  threeDEngrave: 'solid',
  inset: 'inset',
  outset: 'outset',
}

/**
 * A theme scheme entry name for a `w:themeColor` value.
 * @param name - the raw `w:themeColor` value.
 * @returns the scheme key to look up.
 */
function schemeKey(name: string): string {
  return THEME_COLOR_ALIASES[name.toLowerCase()] ?? name
}

/**
 * Resolve a scheme entry against the document theme.
 * @param name - the raw colour name.
 * @param theme - the document theme.
 * @returns the six-digit hex value, or undefined when the scheme has no entry.
 */
function schemeHex(name: string, theme: Theme): string | undefined {
  return theme.scheme[schemeKey(name)]
}

/**
 * Resolve a colour carried by an element's own attributes.
 *
 * WordprocessingML writes direct hex in one attribute and theme references in
 * `themeColor`, which `themeTint` and `themeShade` then modify. A colour
 * element spells its value `w:val`; a border edge spells it `w:color`.
 * @param element - the element holding the colour attributes.
 * @param theme - the document theme.
 * @param attribute - the attribute naming the direct hex value.
 * @returns a CSS colour, or undefined when nothing is stated or the value is `auto`.
 */
function colorValue(element: Element, theme: Theme, attribute: string): CssColor | undefined {
  const themeColor = wAttr(element, 'themeColor')
  if (themeColor !== undefined) {
    const hex = schemeHex(themeColor, theme)
    if (hex !== undefined) {
      return applyTintShade(hex, wAttr(element, 'themeTint'), wAttr(element, 'themeShade'))
    }
  }
  const value = wAttr(element, attribute)
  if (value === undefined || value === 'auto') return undefined
  return rgbToCss(hexToRgb(value))
}

/**
 * Resolve a `w:color` element's value.
 * @param element - the `w:color` element, or undefined.
 * @param theme - the document theme.
 * @returns a CSS colour, or undefined when nothing is stated.
 */
function colorOf(element: Element | undefined, theme: Theme): CssColor | undefined {
  return element === undefined ? undefined : colorValue(element, theme, 'val')
}

/**
 * Resolve a shading element's fill.
 * @param element - the `w:shd` element, or undefined.
 * @param theme - the document theme.
 * @returns a CSS colour, or undefined for an automatic or unstated fill.
 */
export function readShading(element: Element | undefined, theme: Theme): CssColor | undefined {
  if (element === undefined) return undefined
  const themeFill = wAttr(element, 'themeFill')
  if (themeFill !== undefined) {
    const hex = schemeHex(themeFill, theme)
    if (hex !== undefined) {
      return applyTintShade(hex, wAttr(element, 'themeTint'), wAttr(element, 'themeShade'))
    }
  }
  const fill = wAttr(element, 'fill')
  if (fill === undefined || fill === 'auto') return undefined
  return rgbToCss(hexToRgb(fill))
}

/**
 * Read the four edges of a border container.
 * @param container - a `w:pBdr`, `w:tblBorders`, or `w:tcBorders` element.
 * @param theme - the document theme.
 * @returns the drawn edges, or undefined when the container states none.
 */
export function readBorders(container: Element | undefined, theme: Theme): DocxBorders | undefined {
  if (container === undefined) return undefined
  const borders: Draft<DocxBorders> = {}
  let any = false
  for (const edge of EDGE_NAMES) {
    const element = child(container, NS_W, edge)
    if (element === undefined) continue
    const value = wAttr(element, 'val') ?? 'single'
    if (NO_BORDER.has(value)) continue
    const widthPx = eighthPtToPx(wNum(element, 'sz') ?? 4)
    const color = colorValue(element, theme, 'color')
    borders[edge] = { widthPx, style: BORDER_STYLES[value] ?? 'solid', ...(color === undefined ? {} : { color }) }
    any = true
  }
  return any ? borders : undefined
}

/**
 * Read a font reference, following a theme reference when the file states one.
 * @param theme - the document theme.
 * @param direct - the explicitly named typeface.
 * @param reference - the `w:*Theme` role name.
 * @param script - whether the role names a Latin or an East Asian face.
 * @returns the typeface name, or undefined when neither form is stated.
 */
function fontOf(
  theme: Theme,
  direct: string | undefined,
  reference: string | undefined,
  script: 'latin' | 'ea',
): string | undefined {
  if (reference !== undefined) {
    const major = reference.startsWith('major')
    const themed = script === 'ea'
      ? major ? theme.fonts.majorEa : theme.fonts.minorEa
      : major ? theme.fonts.majorLatin : theme.fonts.minorLatin
    if (themed !== '') return themed
    return script === 'ea' ? theme.fonts.minorLatin : undefined
  }
  return direct === undefined || direct === '' ? undefined : direct
}

/**
 * Build a CSS font-family list from a `w:rFonts` element.
 * @param element - the `w:rFonts` element, or undefined.
 * @param theme - the document theme.
 * @returns the family list, or undefined when nothing is stated.
 */
function fontFamilyOf(element: Element | undefined, theme: Theme): string | undefined {
  if (element === undefined) return undefined
  const names = [
    fontOf(theme, wAttr(element, 'ascii'), wAttr(element, 'asciiTheme'), 'latin'),
    fontOf(theme, wAttr(element, 'hAnsi'), wAttr(element, 'hAnsiTheme'), 'latin'),
    fontOf(theme, wAttr(element, 'eastAsia'), wAttr(element, 'eastAsiaTheme'), 'ea'),
  ].filter((name): name is string => name !== undefined)
  const unique = [...new Set(names)]
  if (unique.length === 0) return undefined
  return `${unique.map(name => `"${name}"`).join(', ')}, sans-serif`
}

/**
 * Read a run's property element.
 * @param element - the `w:rPr` element, or undefined.
 * @param theme - the document theme.
 * @returns the stated properties; absent members inherit.
 */
export function readRunFormat(element: Element | undefined, theme: Theme): RunFormat {
  if (element === undefined) return {}
  const format: Draft<RunFormat> = {}
  const bold = wOnOff(element, 'b')
  if (bold !== undefined) format.bold = bold
  const italic = wOnOff(element, 'i')
  if (italic !== undefined) format.italic = italic
  const underline = child(element, NS_W, 'u')
  if (underline !== undefined) {
    const value = wAttr(underline, 'val') ?? 'single'
    if (value !== 'none') {
      format.underline = true
      if (value !== 'single') format.underlineStyle = value
    }
  }
  const strike = wOnOff(element, 'strike') ?? wOnOff(element, 'dstrike')
  if (strike !== undefined) format.strike = strike
  const caps = wOnOff(element, 'caps')
  if (caps !== undefined) format.caps = caps
  const smallCaps = wOnOff(element, 'smallCaps')
  if (smallCaps !== undefined) format.smallCaps = smallCaps
  const vanish = wOnOff(element, 'vanish')
  if (vanish !== undefined) format.vanish = vanish
  const color = colorOf(child(element, NS_W, 'color'), theme)
  if (color !== undefined) format.color = color
  const size = wNum(child(element, NS_W, 'sz'), 'val')
  if (size !== undefined) format.sizePx = halfPtToPx(size)
  const family = fontFamilyOf(child(element, NS_W, 'rFonts'), theme)
  if (family !== undefined) format.fontFamily = family
  const highlight = HIGHLIGHT_COLORS[wAttr(child(element, NS_W, 'highlight'), 'val') ?? '']
  if (highlight !== undefined) format.highlight = rgbToCss(hexToRgb(highlight))
  const shading = readShading(child(element, NS_W, 'shd'), theme)
  if (shading !== undefined) format.shading = shading
  const vertical = wAttr(child(element, NS_W, 'vertAlign'), 'val')
  if (vertical === 'superscript') format.verticalAlign = 'super'
  else if (vertical === 'subscript') format.verticalAlign = 'sub'
  const spacing = wNum(child(element, NS_W, 'spacing'), 'val')
  if (spacing !== undefined) format.letterSpacingPx = twipsToPx(spacing)
  return format
}

/** The alignment each `w:jc` value names. */
const ALIGNMENTS: Readonly<Record<string, ParaFormat['align']>> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  justify: 'justify',
  both: 'justify',
  distribute: 'justify',
}

/**
 * Read a paragraph's property element.
 * @param element - the `w:pPr` element, or undefined.
 * @param theme - the document theme.
 * @returns the stated properties; absent members inherit.
 */
export function readParaFormat(element: Element | undefined, theme: Theme): ParaFormat {
  if (element === undefined) return {}
  const format: Draft<ParaFormat> = {}
  const align = ALIGNMENTS[wAttr(child(element, NS_W, 'jc'), 'val') ?? '']
  if (align !== undefined) format.align = align
  const indent = child(element, NS_W, 'ind')
  if (indent !== undefined) {
    const left = wNum(indent, 'left') ?? wNum(indent, 'start')
    if (left !== undefined) format.indentLeftPx = twipsToPx(left)
    const right = wNum(indent, 'right') ?? wNum(indent, 'end')
    if (right !== undefined) format.indentRightPx = twipsToPx(right)
    const firstLine = wNum(indent, 'firstLine')
    if (firstLine !== undefined) format.firstLinePx = twipsToPx(firstLine)
    const hanging = wNum(indent, 'hanging')
    if (hanging !== undefined) format.hangingPx = twipsToPx(hanging)
    const firstLineChars = wNum(indent, 'firstLineChars')
    if (firstLineChars !== undefined) format.firstLineChars = firstLineChars
    const hangingChars = wNum(indent, 'hangingChars')
    if (hangingChars !== undefined) format.hangingChars = hangingChars
    const leftChars = wNum(indent, 'leftChars')
    if (leftChars !== undefined) format.leftChars = leftChars
    const rightChars = wNum(indent, 'rightChars')
    if (rightChars !== undefined) format.rightChars = rightChars
  }
  const spacing = child(element, NS_W, 'spacing')
  if (spacing !== undefined) {
    const before = wNum(spacing, 'before')
    if (before !== undefined) format.spaceBeforePx = twipsToPx(before)
    const after = wNum(spacing, 'after')
    if (after !== undefined) format.spaceAfterPx = twipsToPx(after)
    const line = wNum(spacing, 'line')
    if (line !== undefined) {
      format.lineSpacing = (wAttr(spacing, 'lineRule') ?? 'auto') === 'auto'
        ? { multiple: line / 240 }
        : { px: twipsToPx(line) }
    }
  }
  const tabsContainer = child(element, NS_W, 'tabs')
  if (tabsContainer !== undefined) {
    const stops: TabStopFormat[] = []
    for (const tab of children(tabsContainer, NS_W, 'tab')) {
      const posPx = twipsToPx(wNum(tab, 'pos') ?? 0)
      const val = wAttr(tab, 'val') ?? 'left'
      if (posPx <= 0) continue
      // `clear` removes an inherited stop and `bar` draws a line; neither is
      // a text stop this renderer advances to.
      if (val === 'clear' || val === 'bar') continue
      stops.push({ posPx, val: val === 'center' ? 'center' : val === 'right' ? 'right' : 'left' })
    }
    if (stops.length > 0) format.tabs = stops
  }
  const borders = readBorders(child(element, NS_W, 'pBdr'), theme)
  if (borders !== undefined) format.borders = borders
  const shading = readShading(child(element, NS_W, 'shd'), theme)
  if (shading !== undefined) format.shading = shading
  const keepNext = wOnOff(element, 'keepNext')
  if (keepNext !== undefined) format.keepNext = keepNext
  const keepLines = wOnOff(element, 'keepLines')
  if (keepLines !== undefined) format.keepLines = keepLines
  const bidi = wOnOff(element, 'bidi')
  if (bidi !== undefined) format.bidi = bidi
  const pageBreakBefore = wOnOff(element, 'pageBreakBefore')
  if (pageBreakBefore !== undefined) format.pageBreakBefore = pageBreakBefore
  const contextualSpacing = wOnOff(element, 'contextualSpacing')
  if (contextualSpacing !== undefined) format.contextualSpacing = contextualSpacing
  const numPr = child(element, NS_W, 'numPr')
  if (numPr !== undefined) {
    const numId = wNum(child(numPr, NS_W, 'numId'), 'val')
    if (numId !== undefined) format.numId = numId
    const level = wNum(child(numPr, NS_W, 'ilvl'), 'val')
    if (level !== undefined) format.numLevel = level
  }
  return format
}

/** The alignment each `w:jc` value names for a table, which has no justified form. */
const TABLE_ALIGNMENTS: Readonly<Record<string, TableFormat['align']>> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
}

/**
 * Read a table's property element.
 * @param element - the `w:tblPr` element, or undefined.
 * @param theme - the document theme.
 * @returns the stated properties; absent members inherit.
 */
export function readTableFormat(element: Element | undefined, theme: Theme): TableFormat {
  if (element === undefined) return {}
  const format: Draft<TableFormat> = {}
  const borders = readBorders(child(element, NS_W, 'tblBorders'), theme)
  if (borders !== undefined) format.borders = borders
  const align = TABLE_ALIGNMENTS[wAttr(child(element, NS_W, 'jc'), 'val') ?? '']
  if (align !== undefined) format.align = align
  const width = child(element, NS_W, 'tblW')
  if (width !== undefined) {
    const value = wNum(width, 'w')
    if (value !== undefined && (wAttr(width, 'type') ?? 'dxa') === 'dxa') format.widthPx = twipsToPx(value)
  }
  const indent = wNum(child(element, NS_W, 'tblInd'), 'w')
  if (indent !== undefined) format.indentPx = twipsToPx(indent)
  if (wOnOff(element, 'bidiVisual') === true) format.bidiVisual = true
  const margin = child(element, NS_W, 'tblCellMar')
  if (margin !== undefined) {
    format.cellMargin = {
      top: twipsToPx(wNum(child(margin, NS_W, 'top'), 'w') ?? 0),
      left: twipsToPx(wNum(child(margin, NS_W, 'left'), 'w') ?? 108),
      bottom: twipsToPx(wNum(child(margin, NS_W, 'bottom'), 'w') ?? 0),
      right: twipsToPx(wNum(child(margin, NS_W, 'right'), 'w') ?? 108),
    }
  }
  return format
}

/**
 * Merge one cascade level over the previously resolved one.
 *
 * A member the later level does not state keeps the earlier value, which is
 * what OOXML inheritance means at every level of the styles cascade.
 * @param base - values resolved so far.
 * @param over - values this level states.
 * @returns the merged run format.
 */
export function mergeRun(base: RunFormat, over: RunFormat): RunFormat {
  return { ...base, ...over }
}

/**
 * Merge one paragraph cascade level over the previously resolved one.
 * @param base - values resolved so far.
 * @param over - values this level states.
 * @returns the merged paragraph format.
 */
export function mergePara(base: ParaFormat, over: ParaFormat): ParaFormat {
  return { ...base, ...over }
}
