/**
 * Text-frame parsing and the OOXML text-style cascade.
 *
 * A run's appearance is assembled from up to five places: the presentation's
 * default text style or the master's title/body/other style, the layout
 * placeholder's list style, the shape's list style, the paragraph properties,
 * and the run properties. This module reads each of those into the same
 * nine-level shape and folds them in order, so the renderer receives runs whose
 * every property is already decided.
 */
import {
  attr, attrNs, boolAttr, child, children, colorChildOf, descendant, emuToPx, fraction, hundredthPtToPx,
  NS_A, NS_R, numberAttr, ptToPx,
} from '@deepseek-ai/dsh-client-sdkwork-office'
import type { ColorContext, CssColor, ThemeFonts } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PptxBullet, PptxParagraph, PptxRun, PptxTextBody } from './model.ts'

/** How many outline levels OOXML defines. */
const LEVEL_COUNT = 9

/** DrawingML's default text size, in points, when nothing states one. */
const DEFAULT_SIZE_PT = 18

/** PowerPoint renders 100% line spacing at roughly 1.2 times the run size. */
const SINGLE_LINE_FACTOR = 1.2

/** Run properties a level or paragraph may state. */
interface RunStyle {
  sizePx?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  underlineStyle?: 'wavy' | 'double' | 'dashed' | 'dotted'
  strike?: boolean
  color?: CssColor
  fontFamily?: string
  baseline?: number
  letterSpacing?: number
  highlight?: CssColor
  shadow?: boolean
}

/** Paragraph properties a level may state. */
interface ParaStyle {
  align?: PptxParagraph['align']
  bullet?: PptxBullet
  marginLeft?: number
  indent?: number
  spaceBeforePx?: number
  spaceAfterPx?: number
  lineSpacing?: number
  lineSpacingExactPx?: number
}

/** One outline level's inherited paragraph and run properties. */
interface LevelStyle {
  readonly para: ParaStyle
  readonly run: RunStyle
}

/** A nine-level style set, as `a:lstStyle` and `p:txStyles` express one. */
export interface TextStyle {
  readonly levels: readonly LevelStyle[]
}

/** The three style roles a master defines, plus the presentation-wide default. */
export interface TextStyleSet {
  readonly title: TextStyle
  readonly body: TextStyle
  readonly other: TextStyle
  readonly default: TextStyle
}

/** An empty style set, used when a package states none. */
export const EMPTY_TEXT_STYLE: TextStyle = {
  levels: Array.from({ length: LEVEL_COUNT }, () => ({ para: {}, run: {} })),
}

/** The bullet an unbulleted paragraph carries. */
const NO_BULLET: PptxBullet = { kind: 'none', text: '', startAt: 1, step: 1 }

/** How a counted ordinal renders. */
type NumberFormat = 'arabic' | 'romanLc' | 'romanUc' | 'alphaLc' | 'alphaUc'

/** Auto-numbering formats the renderer can count, keyed by OOXML type. */
const NUMBER_FORMATS: Readonly<Record<string, NumberFormat>> = {
  arabicPeriod: 'arabic',
  arabicParenR: 'arabic',
  arabicParenBoth: 'arabic',
  arabicPlain: 'arabic',
  romanLcPeriod: 'romanLc',
  romanUcPeriod: 'romanUc',
  romanLcParenR: 'romanLc',
  romanUcParenR: 'romanUc',
  romanLcParenBoth: 'romanLc',
  romanUcParenBoth: 'romanUc',
  alphaLcPeriod: 'alphaLc',
  alphaUcPeriod: 'alphaUc',
  alphaLcParenR: 'alphaLc',
  alphaUcParenR: 'alphaUc',
  alphaLcParenBoth: 'alphaLc',
  alphaUcParenBoth: 'alphaUc',
}

/** Punctuation an auto-number format appends. */
const NUMBER_SUFFIXES: Readonly<Record<string, string>> = {
  arabicParenR: ')',
  romanLcParenR: ')',
  romanUcParenR: ')',
  romanLcParenBoth: ')',
  romanUcParenBoth: ')',
  alphaLcParenR: ')',
  alphaUcParenR: ')',
  alphaLcParenBoth: ')',
  alphaUcParenBoth: ')',
  arabicParenBoth: ')',
  arabicPlain: '',
}

/** Punctuation an auto-number format prepends. */
const NUMBER_PREFIXES: Readonly<Record<string, string>> = {
  arabicParenBoth: '(',
  romanLcParenBoth: '(',
  romanUcParenBoth: '(',
  alphaLcParenBoth: '(',
  alphaUcParenBoth: '(',
}

/** Auto-numbering formats stored on the bullet so the renderer can count up. */


/**
 * The counting format a numbered bullet uses.
 * @param bullet - the bullet produced by this module.
 * @returns the counting format, defaulting to arabic.
 */
export function bulletNumberFormat(bullet: PptxBullet): NumberFormat {
  return bullet.numberFormat ?? 'arabic'
}

/** The punctuation a numbered bullet places before its counter. */


/**
 * The punctuation a numbered bullet places before its counter.
 * @param bullet - the bullet produced by this module.
 * @returns the prefix text, empty for most formats.
 */
export function bulletNumberPrefix(bullet: PptxBullet): string {
  return bullet.numberPrefix ?? ''
}

/** The characters appended to a counted bullet by its OOXML format. */


/**
 * The punctuation a numbered bullet appends after its counter.
 * @param bullet - the bullet produced by this module.
 * @returns the suffix text.
 */
export function bulletNumberSuffix(bullet: PptxBullet): string {
  return bullet.numberSuffix ?? '.'
}

/**
 * Translate a `+mj-lt`-style theme reference into a concrete typeface.
 * @param typeface - the raw `typeface` attribute.
 * @param fonts - the theme's font roles.
 * @returns the concrete family name, or undefined when the reference is unknown.
 */
function resolveTypeface(typeface: string, fonts: ThemeFonts): string | undefined {
  switch (typeface) {
    case '+mj-lt':
    case '+mj-latn':
      return fonts.majorLatin
    case '+mn-lt':
    case '+mn-latn':
      return fonts.minorLatin
    case '+mj-ea':
      return fonts.majorEa || undefined
    case '+mn-ea':
      return fonts.minorEa || undefined
    default:
      return typeface === '' ? undefined : typeface
  }
}

/**
 * Build a CSS font stack from a Latin and an East Asian typeface.
 * @param typefaces - concrete family names, most specific first.
 * @returns a CSS `font-family` value, or undefined when nothing is named.
 */
function fontStack(typefaces: readonly (string | undefined)[]): string | undefined {
  const unique = [...new Set(typefaces.filter((name): name is string => name !== undefined && name !== ''))]
  if (unique.length === 0) return undefined
  return [...unique.map(name => `"${name.replaceAll('"', '')}"`), 'sans-serif'].join(', ')
}

/** The underline ornament each OOXML `u` value renders as, beyond a plain line. */
const UNDERLINE_STYLES: Readonly<Record<string, 'wavy' | 'double' | 'dashed' | 'dotted'>> = {
  wavy: 'wavy',
  wavyHeavy: 'wavy',
  wavyDbl: 'wavy',
  dbl: 'double',
  dash: 'dashed',
  sysDash: 'dashed',
  dashDot: 'dashed',
  sysDashDot: 'dashed',
  lgDash: 'dashed',
  lgDashDot: 'dashed',
  lgDashDotDot: 'dashed',
  dot: 'dotted',
  sysDot: 'dotted',
  dotDash: 'dotted',
  sysDotDash: 'dotted',
}

/**
 * Read the run properties an `a:rPr`-shaped element states.
 * @param properties - an `a:defRPr`, `a:rPr`, or `a:endParaRPr` element.
 * @param context - colour context in force.
 * @param fonts - theme font roles.
 * @returns the stated run properties, leaving unstated ones absent.
 */
function readRunStyle(properties: Element | undefined, context: ColorContext, fonts: ThemeFonts): RunStyle {
  if (properties === undefined) return {}
  const style: RunStyle = {}
  const size = numberAttr(properties, 'sz')
  if (size !== undefined) style.sizePx = hundredthPtToPx(size)
  const bold = boolAttr(properties, 'b')
  if (bold !== undefined) style.bold = bold
  const italic = boolAttr(properties, 'i')
  if (italic !== undefined) style.italic = italic
  const underline = attr(properties, 'u')
  if (underline !== undefined) {
    style.underline = underline !== 'none'
    style.underlineStyle = UNDERLINE_STYLES[underline]
  }
  const strike = attr(properties, 'strike')
  if (strike !== undefined) style.strike = strike !== 'noStrike'
  const baseline = numberAttr(properties, 'baseline')
  if (baseline !== undefined) style.baseline = baseline / 1000
  const spacing = numberAttr(properties, 'spc')
  if (spacing !== undefined) style.letterSpacing = hundredthPtToPx(spacing)
  const color = colorChildOf(child(properties, NS_A, 'solidFill'), context)
  if (color !== undefined) style.color = color
  const highlight = colorChildOf(child(properties, NS_A, 'highlight'), context)
  if (highlight !== undefined) style.highlight = highlight
  if (child(child(properties, NS_A, 'effectLst'), NS_A, 'outerShdw') !== undefined) style.shadow = true
  const latin = resolveTypeface(attr(child(properties, NS_A, 'latin'), 'typeface') ?? '', fonts)
  const ea = resolveTypeface(attr(child(properties, NS_A, 'ea'), 'typeface') ?? '', fonts)
  const stack = fontStack([latin, ea])
  if (stack !== undefined) style.fontFamily = stack
  return style
}

/**
 * Read a bullet definition from paragraph properties.
 * @param properties - an `a:pPr` element.
 * @param context - colour context in force.
 * @param fonts - theme font roles.
 * @returns the bullet, or undefined when the paragraph states none.
 */
function readBullet(properties: Element, context: ColorContext, fonts: ThemeFonts): PptxBullet | undefined {
  if (child(properties, NS_A, 'buNone') !== undefined) return NO_BULLET
  const auto = child(properties, NS_A, 'buAutoNum')
  if (auto !== undefined) {
    const format = attr(auto, 'type') ?? 'arabicPeriod'
    const bullet: PptxBullet = {
      kind: 'number',
      text: '',
      startAt: numberAttr(auto, 'startAt') ?? 1,
      step: 1,
      numberFormat: NUMBER_FORMATS[format] ?? 'arabic',
      numberSuffix: NUMBER_SUFFIXES[format] ?? '.',
      numberPrefix: NUMBER_PREFIXES[format] ?? '',
    }
    const color = colorChildOf(child(properties, NS_A, 'buClr'), context)
    return color === undefined ? bullet : { ...bullet, color }
  }
  const character = child(properties, NS_A, 'buChar')
  if (character !== undefined) {
    const font = resolveTypeface(attr(child(properties, NS_A, 'buFont'), 'typeface') ?? '', fonts)
    const color = colorChildOf(child(properties, NS_A, 'buClr'), context)
    const percent = numberAttr(child(properties, NS_A, 'buSzPct'), 'val')
    const points = numberAttr(child(properties, NS_A, 'buSzPts'), 'val')
    return {
      kind: 'char',
      text: attr(character, 'char') ?? '•',
      startAt: 1,
      step: 1,
      ...(color === undefined ? {} : { color }),
      ...(font === undefined ? {} : { fontFamily: `"${font}", sans-serif` }),
      // `buSzPct` sizes the bullet relative to its run, which only the text
      // body knows; the percentage travels and resolves once runs exist.
      ...(percent === undefined ? {} : { sizePercent: fraction(percent) }),
      ...(points === undefined ? {} : { sizePx: hundredthPtToPx(points) }),
    }
  }
  return undefined
}

/**
 * Read the spacing a paragraph states.
 * @param container - an `a:lnSpc`, `a:spcBef`, or `a:spcAft` element.
 * @returns the line-height multiple or pixel spacing, or undefined.
 */
function readSpacing(container: Element | undefined): number | undefined {
  const percentage = numberAttr(child(container, NS_A, 'spcPct'), 'val')
  if (percentage !== undefined) return percentage / 100000
  const points = numberAttr(child(container, NS_A, 'spcPts'), 'val')
  if (points !== undefined) return hundredthPtToPx(points)
  return undefined
}

/**
 * Read the line spacing a paragraph states.
 * @param container - the `a:lnSpc` element.
 * @returns a multiple (from `spcPct`), an exact pixel height (from `spcPts`),
 * or undefined.
 */
function readLineSpacing(container: Element | undefined): { readonly multiple?: number; readonly exactPx?: number } {
  const percentage = numberAttr(child(container, NS_A, 'spcPct'), 'val')
  if (percentage !== undefined) return { multiple: percentage / 100000 }
  const points = numberAttr(child(container, NS_A, 'spcPts'), 'val')
  if (points !== undefined) return { exactPx: hundredthPtToPx(points) }
  return {}
}

/**
 * Read the paragraph properties an `a:pPr`-shaped element states.
 * @param properties - an `a:pPr` or `a:lvl1pPr` element.
 * @param context - colour context in force.
 * @param fonts - theme font roles.
 * @returns the stated paragraph properties.
 */
function readParaStyle(properties: Element | undefined, context: ColorContext, fonts: ThemeFonts): ParaStyle {
  if (properties === undefined) return {}
  const style: ParaStyle = {}
  const align = attr(properties, 'algn')
  if (align !== undefined) {
    style.align = align === 'ctr' ? 'center'
      : align === 'r' ? 'right'
        : align === 'just' || align === 'justLow' ? 'justify'
          : 'left'
  }
  const marginLeft = numberAttr(properties, 'marL')
  if (marginLeft !== undefined) style.marginLeft = emuToPx(marginLeft)
  const indent = numberAttr(properties, 'indent')
  if (indent !== undefined) style.indent = emuToPx(indent)
  const bullet = readBullet(properties, context, fonts)
  if (bullet !== undefined) style.bullet = bullet
  const lineSpacing = readLineSpacing(child(properties, NS_A, 'lnSpc'))
  if (lineSpacing.multiple !== undefined) style.lineSpacing = lineSpacing.multiple
  if (lineSpacing.exactPx !== undefined) style.lineSpacingExactPx = lineSpacing.exactPx
  const before = readSpacing(child(properties, NS_A, 'spcBef'))
  if (before !== undefined) style.spaceBeforePx = before
  const after = readSpacing(child(properties, NS_A, 'spcAft'))
  if (after !== undefined) style.spaceAfterPx = after
  return style
}

/**
 * Read a nine-level list style.
 * @param listStyle - an `a:lstStyle` or a `p:titleStyle`-shaped element.
 * @param context - colour context in force.
 * @param fonts - theme font roles.
 * @returns the levels the element states.
 */
function readLevels(listStyle: Element | undefined, context: ColorContext, fonts: ThemeFonts): readonly LevelStyle[] {
  const levels: LevelStyle[] = []
  for (let index = 1; index <= LEVEL_COUNT; index += 1) {
    const properties = child(listStyle, NS_A, `lvl${index}pPr`)
    levels.push({
      para: readParaStyle(properties, context, fonts),
      run: readRunStyle(child(properties, NS_A, 'defRPr'), context, fonts),
    })
  }
  return levels
}

/**
 * Read the presentation-wide default text style.
 * @param presentation - the `p:presentation` root element.
 * @param context - colour context in force.
 * @param fonts - theme font roles.
 * @returns the default style set.
 */
export function readDefaultTextStyle(
  presentation: Element | undefined,
  context: ColorContext,
  fonts: ThemeFonts,
): TextStyle {
  return { levels: readLevels(child(presentation, NS_A, 'defaultTextStyle'), context, fonts) }
}

/**
 * Read a master's title, body, and other text styles.
 * @param master - the `p:sldMaster` root element.
 * @param context - colour context in force.
 * @param fonts - theme font roles.
 * @returns the three style roles.
 */
export function readMasterTextStyles(
  master: Element | undefined,
  context: ColorContext,
  fonts: ThemeFonts,
): Pick<TextStyleSet, 'title' | 'body' | 'other'> {
  // `p:txStyles` and its three roles are PresentationML; only the level
  // properties inside them are DrawingML.
  const styles = child(master, NS_P_TXSTYLES, 'txStyles')
  return {
    title: { levels: readLevels(child(styles, NS_P_TXSTYLES, 'titleStyle'), context, fonts) },
    body: { levels: readLevels(child(styles, NS_P_TXSTYLES, 'bodyStyle'), context, fonts) },
    other: { levels: readLevels(child(styles, NS_P_TXSTYLES, 'otherStyle'), context, fonts) },
  }
}

/** PresentationML namespace, kept local to avoid a cyclic import in the type position. */
const NS_P_TXSTYLES = 'http://schemas.openxmlformats.org/presentationml/2006/main'

/**
 * Read a shape's own list style.
 * @param txBody - the shape's `p:txBody`.
 * @param context - colour context in force.
 * @param fonts - theme font roles.
 * @returns the shape's list style.
 */
export function readShapeListStyle(
  txBody: Element | undefined,
  context: ColorContext,
  fonts: ThemeFonts,
): TextStyle {
  return { levels: readLevels(child(txBody, NS_A, 'lstStyle'), context, fonts) }
}

/**
 * Fold style sets left to right, later definitions winning per property.
 * @param sources - ordered style sets, least specific first.
 * @returns the merged style set.
 */
export function mergeTextStyles(...sources: readonly TextStyle[]): TextStyle {
  const levels: LevelStyle[] = []
  for (let index = 0; index < LEVEL_COUNT; index += 1) {
    const para: ParaStyle = {}
    const run: RunStyle = {}
    for (const source of sources) Object.assign(para, source.levels[index]?.para)
    for (const source of sources) Object.assign(run, source.levels[index]?.run)
    levels.push({ para, run })
  }
  return { levels }
}

/** Everything a text frame needs to know while its paragraphs are read. */
export interface TextReadContext {
  readonly color: ColorContext
  readonly fonts: ThemeFonts
  /** Ordered style sets, least specific first. */
  readonly sources: readonly TextStyle[]
  /** Bullet a paragraph without any stated bullet inherits. */
  readonly fallbackBullet: PptxBullet
  /**
   * Resolve a slide-number or date field to its live text.
   * @param type - the `a:fld` type (`slidenum`, `datetime1`, …).
   * @param cached - the text the producer cached inside the field.
   * @returns the live text, or undefined to keep the cached text.
   */
  readonly fieldText?: (type: string | undefined, cached: string) => string | undefined
  /**
   * Resolve a hyperlink relationship id to a renderable URL.
   * @param id - the `r:id` of `a:hlinkClick`.
   * @returns the URL, or undefined when the target is not linkable.
   */
  readonly linkTarget?: (id: string | undefined) => string | undefined
  /** Whether the frame inherits the shape's own rotation. */
  readonly vertical?: PptxTextBody['vertical']
}

/** Resolve a paragraph style from the cascade. */
function paragraphStyle(context: TextReadContext, properties: Element | undefined, level: number): ParaStyle {
  const merged: ParaStyle = {}
  for (const source of context.sources) Object.assign(merged, source.levels[level]?.para)
  Object.assign(merged, readParaStyle(properties, context.color, context.fonts))
  return merged
}

/** Resolve a run style from the cascade. */
function runStyle(
  context: TextReadContext,
  properties: Element | undefined,
  paragraphProperties: Element | undefined,
  level: number,
): RunStyle {
  const merged: RunStyle = {}
  for (const source of context.sources) Object.assign(merged, source.levels[level]?.run)
  Object.assign(merged, readRunStyle(child(paragraphProperties, NS_A, 'defRPr'), context.color, context.fonts))
  Object.assign(merged, readRunStyle(properties, context.color, context.fonts))
  return merged
}

/** Build a concrete run from resolved styles and text. */
function buildRun(
  text: string,
  style: RunStyle,
  context: TextReadContext,
  scale: number,
  lineBreak = false,
  link?: string,
  hyperlinkDefaults = false,
): PptxRun {
  const themeText = context.color.scheme[context.color.colorMap?.tx1 ?? 'dk1']
  const hlinkHex = context.color.scheme[context.color.colorMap?.hlink ?? 'hlink']
  // Office paints an unstyled hyperlink in the theme's hlink colour, underlined.
  const color = style.color
    ?? (hyperlinkDefaults && hlinkHex !== undefined ? `#${hlinkHex}` : undefined)
    ?? (themeText === undefined ? '#000000' : `#${themeText}`)
  return {
    text,
    lineBreak,
    sizePx: (style.sizePx ?? ptToPx(DEFAULT_SIZE_PT)) * scale,
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    underline: hyperlinkDefaults ? true : style.underline ?? false,
    ...(style.underlineStyle === undefined ? {} : { underlineStyle: style.underlineStyle }),
    strike: style.strike ?? false,
    color,
    fontFamily: style.fontFamily
      ?? fontStack([context.fonts.minorLatin, context.fonts.minorEa]) ?? 'sans-serif',
    baseline: style.baseline ?? 0,
    letterSpacing: style.letterSpacing ?? 0,
    ...(style.highlight === undefined ? {} : { highlight: style.highlight }),
    ...(style.shadow === undefined ? {} : { shadow: style.shadow }),
    ...(link === undefined ? {} : { link }),
  }
}

/**
 * Read a shape's or cell's text frame.
 * @param txBody - the `p:txBody` or `a:txBody` element.
 * @param context - colour context, font roles, ordered styles, and fallback bullet.
 * @returns the text body, or undefined when the frame has no paragraphs.
 */
export function readTextBody(txBody: Element | undefined, context: TextReadContext): PptxTextBody | undefined {
  if (txBody === undefined) return undefined
  const bodyProperties = child(txBody, NS_A, 'bodyPr')
  const normalAutofit = descendant(bodyProperties, NS_A, 'normAutofit')
  const fontScale = numberAttr(normalAutofit, 'fontScale')
  const scale = fontScale === undefined ? 1 : fontScale / 100000
  const paragraphs: PptxParagraph[] = []
  const numberCounters = new Map<number, number>()
  for (const paragraph of children(txBody, NS_A, 'p')) {
    const properties = child(paragraph, NS_A, 'pPr')
    const level = Math.min(LEVEL_COUNT - 1, Math.max(0, numberAttr(properties, 'lvl') ?? 0))
    const style = paragraphStyle(context, properties, level)
    const runs: PptxRun[] = []
    for (const node of children(paragraph, NS_A)) {
      // A run and a field both carry their text in `a:t`; only the hard break differs.
      if (node.localName === 'br') {
        runs.push(buildRun('', runStyle(context, child(node, NS_A, 'rPr'), properties, level), context, scale, true))
        continue
      }
      if (node.localName !== 'r' && node.localName !== 'fld') continue
      const runProperties = child(node, NS_A, 'rPr')
      let link: string | undefined
      let hyperlinkDefaults = false
      if (node.localName === 'r') {
        const hlink = child(runProperties, NS_A, 'hlinkClick') ?? child(runProperties, NS_A, 'hlinkHover')
        link = context.linkTarget?.(attrNs(hlink, NS_R, 'id'))
        hyperlinkDefaults = link !== undefined
          && child(runProperties, NS_A, 'solidFill') === undefined
          && attr(runProperties, 'u') === undefined
      }
      const cached = child(node, NS_A, 't')?.textContent ?? ''
      const fldType = node.localName === 'fld' ? attr(node, 'type') : undefined
      const text = fldType === undefined ? cached : context.fieldText?.(fldType, cached) ?? cached
      runs.push(buildRun(text, runStyle(context, runProperties, properties, level), context, scale, false, link, hyperlinkDefaults))
    }
    let bullet = style.bullet ?? context.fallbackBullet
    if (bullet.kind === 'number') {
      const count = (numberCounters.get(level) ?? bullet.startAt - 1) + 1
      numberCounters.set(level, count)
      bullet = { ...bullet, text: String(count) }
    } else if (bullet.kind === 'char') {
      // A percentage sizes the bullet against its run, whose size already
      // carries the autofit scale; an absolute point size scales directly.
      let sizePx = bullet.sizePx
      if (sizePx === undefined && bullet.sizePercent !== undefined) {
        const runSize = runs.find(run => !run.lineBreak)?.sizePx ?? ptToPx(DEFAULT_SIZE_PT)
        sizePx = bullet.sizePercent * runSize
      } else if (sizePx !== undefined) {
        sizePx = sizePx * scale
      }
      bullet = { ...bullet, ...(sizePx === undefined ? {} : { sizePx }) }
    }
    paragraphs.push({
      align: style.align ?? 'left',
      level,
      bullet,
      marginLeft: style.marginLeft ?? 0,
      indent: style.indent ?? 0,
      spaceBeforePx: style.spaceBeforePx ?? 0,
      spaceAfterPx: style.spaceAfterPx ?? 0,
      lineSpacing: (style.lineSpacing ?? 1) * SINGLE_LINE_FACTOR,
      ...(style.lineSpacingExactPx === undefined ? {} : { lineSpacingExactPx: style.lineSpacingExactPx * scale }),
      runs,
    })
  }
  if (paragraphs.length === 0) return undefined
  const anchorValue = attr(bodyProperties, 'anchor')
  const vert = attr(bodyProperties, 'vert')
  const numberCol = numberAttr(bodyProperties, 'numCol') ?? 1
  const vertical = vert === undefined || vert === 'horz'
    ? context.vertical ?? 'horizontal'
    // `vert270` is vertical writing flipped a half turn; the remaining
    // East-Asian and WordArt verticals all read top-to-bottom.
    : vert === 'vert270' ? 'vert270' : 'vert'
  return {
    paragraphs,
    anchor: anchorValue === 'ctr' ? 'middle' : anchorValue === 'b' ? 'bottom' : 'top',
    insetLeft: emuToPx(numberAttr(bodyProperties, 'lIns') ?? 91440),
    insetTop: emuToPx(numberAttr(bodyProperties, 'tIns') ?? 45720),
    insetRight: emuToPx(numberAttr(bodyProperties, 'rIns') ?? 91440),
    insetBottom: emuToPx(numberAttr(bodyProperties, 'bIns') ?? 45720),
    wrap: attr(bodyProperties, 'wrap') !== 'none',
    vertical,
    ...(numberCol > 1 ? { columns: numberCol } : {}),
  }
}
