/**
 * Style-table parsing.
 *
 * `xl/styles.xml` is a set of parallel tables — number formats, fonts, fills,
 * borders — that a cell's `s` index addresses through `cellXfs`. Resolving a
 * cell therefore means reading every table once and composing the entry its
 * index names, so the grid never consults the style part again.
 */
import {
  attr, child, children, hexToRgb, NS_A, numberAttr, ptToPx, resolveColorElement,
  rgbToCss, eighthPtToPx,
} from '@deepseek-ai/dsh-client-sdkwork-office'
import type { ColorContext, CssColor, Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import type {
  XlsxBorderSide, XlsxCellFormat, XlsxFont, XlsxHorizontalAlign,
  XlsxVerticalAlign,
} from './model.ts'

/** WordprocessingML and SpreadsheetML share the `a:` namespace for themes but not for styles. */
const NS_X = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

/** Builtin number formats, by id, that a workbook may use without declaring them. */
const BUILTIN_FORMATS: Readonly<Record<number, string>> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'mm-dd-yy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'm/d/yy h:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mmss.0',
  48: '##0.0E+0',
  49: '@',
}

/** The legacy indexed palette, by index, for `indexed="…"` colours. */
const INDEXED_COLORS: readonly string[] = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
]

/**
 * Theme entry order SpreadsheetML indexes into.
 *
 * Excel numbers the scheme as light/dark background and text first, while the
 * theme part lists `dk1` before `lt1`, so the first two pairs swap.
 */
const THEME_ORDER: readonly string[] = [
  'lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
  'hlink', 'folHlink',
]

/** Border line weights, in eighths of a point, that OOXML names. */
const BORDER_WIDTHS: Readonly<Record<string, number>> = {
  hair: 1,
  thin: 1,
  medium: 2,
  thick: 4,
  double: 3,
  dotted: 1,
  dashed: 1,
  dashDot: 1,
  dashDotDot: 1,
  slantDashDot: 1,
  mediumDashed: 2,
  mediumDashDot: 2,
  mediumDashDotDot: 2,
}

/** Border styles drawn as a dashed line. */
const DASHED_BORDERS = new Set([
  'dashed', 'dashDot', 'dashDotDot', 'mediumDashed', 'mediumDashDot', 'mediumDashDotDot', 'slantDashDot',
])

/** Border styles drawn as a dotted line. */
const DOTTED_BORDERS = new Set(['dotted', 'hair'])

/**
 * Resolve one colour element from the style or theme part.
 * @param holder - an element holding an `rgb`, `theme`, or `indexed` attribute.
 * @param context - the workbook theme.
 * @returns the CSS colour, or undefined when the holder states none.
 */
export function readStyleColor(holder: Element | undefined, context: ColorContext): CssColor | undefined {
  if (holder === undefined) return undefined
  if (numberAttr(holder, 'auto') === 1) return '#000000'
  const rgb = attr(holder, 'rgb')
  if (rgb !== undefined) {
    const digits = rgb.length === 8 ? rgb.slice(2) : rgb
    return `#${digits.toUpperCase()}`
  }
  const themeIndex = numberAttr(holder, 'theme')
  if (themeIndex !== undefined) {
    const name = THEME_ORDER.at(themeIndex)
    const hex = name === undefined ? undefined : context.scheme[name]
    if (hex === undefined) return undefined
    const tint = numberAttr(holder, 'tint') ?? 0
    if (tint === 0) return `#${hex.toUpperCase()}`
    // SpreadsheetML writes tint as a signed fraction, and the shared helper
    // speaks WordprocessingML's hex bytes, so the arithmetic is done here.
    const base = hexToRgb(hex)
    const mix = Math.min(1, Math.abs(tint))
    const adjust = (channel: number): number => (
      tint > 0 ? channel + (255 - channel) * mix : channel * (1 - mix)
    )
    return rgbToCss({ r: adjust(base.r), g: adjust(base.g), b: adjust(base.b) })
  }
  const indexed = numberAttr(holder, 'indexed')
  if (indexed !== undefined) {
    const hex = INDEXED_COLORS.at(indexed)
    return hex === undefined ? undefined : `#${hex}`
  }
  return undefined
}

/**
 * Read a colour element that may state its colour either way.
 * @param holder - a `<color>` element, or undefined.
 * @param context - the workbook theme.
 * @returns the CSS colour, or undefined.
 */
function readColor(holder: Element | undefined, context: ColorContext): CssColor | undefined {
  if (holder === undefined) return undefined
  const themed = children(holder, NS_A).at(0)
  if (themed !== undefined) return resolveColorElement(themed, context)
  return readStyleColor(holder, context)
}

/**
 * Read one font table entry.
 * @param node - an `font` element.
 * @param context - the workbook theme.
 * @returns the resolved font.
 */
function readFont(node: Element, context: ColorContext): XlsxFont {
  const size = numberAttr(child(node, NS_X, 'sz'), 'val')
  const name = attr(child(node, NS_X, 'name'), 'val')
  const color = readColor(child(node, NS_X, 'color'), context)
  const underlineNode = child(node, NS_X, 'u')
  return {
    bold: child(node, NS_X, 'b') !== undefined,
    italic: child(node, NS_X, 'i') !== undefined,
    underline: underlineNode !== undefined && (attr(underlineNode, 'val') ?? 'single') !== 'none',
    strike: child(node, NS_X, 'strike') !== undefined,
    sizePx: ptToPx(size ?? 11),
    family: name ?? 'Calibri',
    ...(color === undefined ? {} : { color }),
  }
}

/**
 * Read one border side.
 * @param side - a `left`, `right`, `top`, or `bottom` element.
 * @param context - the workbook theme.
 * @returns the side, or undefined when the border draws nothing.
 */
function readBorderSide(side: Element | undefined, context: ColorContext): XlsxBorderSide | undefined {
  const style = attr(side, 'style')
  if (side === undefined || style === undefined) return undefined
  const eighths = BORDER_WIDTHS[style] ?? 1
  return {
    color: readColor(child(side, NS_X, 'color'), context) ?? '#000000',
    widthPx: Math.max(1, Math.round(eighthPtToPx(eighths))),
    dashed: DASHED_BORDERS.has(style) || DOTTED_BORDERS.has(style),
  }
}

/**
 * The theme a style part resolves its theme colours against.
 * @param theme - the workbook theme, when it has one.
 * @returns the colour context for style parsing.
 */
export function styleColorContext(theme: Theme | undefined): ColorContext {
  return { scheme: theme?.scheme ?? {} }
}

/** The format a cell uses when its style index names no entry. */
export const DEFAULT_CELL_FORMAT: XlsxCellFormat = {
  font: { bold: false, italic: false, underline: false, strike: false, sizePx: ptToPx(11), family: 'Calibri', color: '#000000' },
  borders: {},
  alignment: { horizontal: 'general', vertical: 'bottom', wrapText: false, indent: 0, rotation: 0 },
  numberFormat: 'General',
}

/** The style tables a workbook declares, in cell-index order. */
export interface StyleTable {
  /** Cell formats by style index; index 0 is the default format. */
  readonly formats: readonly XlsxCellFormat[]
}

/**
 * Read `xl/styles.xml` into the flat format list a cell index addresses.
 * @param root - the `styleSheet` root element.
 * @param context - the workbook theme.
 * @returns the resolved style table.
 */
export function readStyleTable(root: Element | undefined, context: ColorContext): StyleTable {
  const numberFormats = new Map<number, string>(Object.entries(BUILTIN_FORMATS)
    .map(([id, code]) => [Number(id), code]))
  for (const entry of children(child(root, NS_X, 'numFmts'), NS_X, 'numFmt')) {
    const id = numberAttr(entry, 'numFmtId')
    const code = attr(entry, 'formatCode')
    if (id !== undefined && code !== undefined) numberFormats.set(id, code)
  }
  const fonts = children(child(root, NS_X, 'fonts'), NS_X, 'font').map(node => readFont(node, context))
  const fills = children(child(root, NS_X, 'fills'), NS_X, 'fill').map((node) => {
    const pattern = child(node, NS_X, 'patternFill')
    const kind = attr(pattern, 'patternType')
    if (pattern === undefined || kind === undefined || kind === 'none') return undefined
    if (kind === 'solid') return readColor(child(pattern, NS_X, 'fgColor'), context)
    // Every other pattern paints its foreground over its background; the grid
    // shows the foreground, which is what a reader recognizes.
    return readColor(child(pattern, NS_X, 'fgColor'), context)
      ?? readColor(child(pattern, NS_X, 'bgColor'), context)
  })
  const borders = children(child(root, NS_X, 'borders'), NS_X, 'border').map((node) => {
    const top = readBorderSide(child(node, NS_X, 'top'), context)
    const right = readBorderSide(child(node, NS_X, 'right'), context)
    const bottom = readBorderSide(child(node, NS_X, 'bottom'), context)
    const left = readBorderSide(child(node, NS_X, 'left'), context)
    return {
      ...(top === undefined ? {} : { top }),
      ...(right === undefined ? {} : { right }),
      ...(bottom === undefined ? {} : { bottom }),
      ...(left === undefined ? {} : { left }),
    }
  })


  const formats = children(child(root, NS_X, 'cellXfs'), NS_X, 'xf').map((node): XlsxCellFormat => {
    const alignmentNode = child(node, NS_X, 'alignment')
    const horizontal = attr(alignmentNode, 'horizontal') as XlsxHorizontalAlign | undefined
    const vertical = attr(alignmentNode, 'vertical') as XlsxVerticalAlign | undefined
    const numFmtId = numberAttr(node, 'numFmtId') ?? 0
    const fillColor = fills[numberAttr(node, 'fillId') ?? 0]
    return {
      font: fonts[numberAttr(node, 'fontId') ?? 0] ?? DEFAULT_CELL_FORMAT.font,
      ...(fills[numberAttr(node, 'fillId') ?? 0] === undefined
        ? {} : { fill: fillColor }),
      borders: borders[numberAttr(node, 'borderId') ?? 0] ?? {},
      alignment: {
        horizontal: horizontal ?? 'general',
        vertical: vertical ?? 'bottom',
        wrapText: attr(alignmentNode, 'wrapText') === '1',
        indent: numberAttr(alignmentNode, 'indent') ?? 0,
        rotation: numberAttr(alignmentNode, 'textRotation') ?? 0,
      },
      numberFormat: numberFormats.get(numFmtId) ?? 'General',
    }
  })

  return { formats: formats.length === 0 ? [DEFAULT_CELL_FORMAT] : formats }
}
