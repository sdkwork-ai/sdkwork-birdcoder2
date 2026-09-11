/**
 * Shape-tree parsing.
 *
 * A slide's `p:spTree` is a tree of positioned objects whose appearance comes
 * from three places: the shape's own properties, the theme's style matrices
 * referenced by `p:style`, and the layout/master placeholder it inherits from.
 * This module folds all three into absolute-pixel shapes; group children are
 * flattened into slide coordinates because rendering then needs no transform
 * stack.
 */
import {
  attr, attrNs, boolAttr, child, children, colorChildOf, colorOf, emuToPx, fraction, NS_A, NS_P, NS_R,
  numberAttr, REL_IMAGE, resolveColorElement, roundPx, targetOf,
} from '@deepseek-ai/dsh-client-sdkwork-office'
import type { ColorContext, CssColor, Relationship, ThemeFonts } from '@deepseek-ai/dsh-client-sdkwork-office'
import { hexToRgb, rgbToCss } from '@deepseek-ai/dsh-client-sdkwork-office'
import {
  readShapeListStyle, readTextBody,
} from './text.ts'
import type { TextStyle, TextStyleSet } from './text.ts'
import { presetOutline, readAdjustments, readCustGeomPath } from './geometry.ts'
import type {
  PptxAutoShape, PptxFill, PptxGroup, PptxLine, PptxParagraph, PptxPicture, PptxPlaceholder,
  PptxShape, PptxTable, PptxTableCell, PptxTextBody,
} from './model.ts'

/** Deepest `p:grpSp` nesting readShapes descends into. */
const MAX_GROUP_DEPTH = 32

/** Markup-compatibility namespace, which wraps choices with renderable fallbacks. */
const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'

/** The two descriptions a shape tree renders in place of what it cannot draw. */
export interface ShapeLabels {
  /** Description for a chart, SmartArt, or media frame. */
  readonly unsupportedFrame: string
  /** Description for a picture whose media part is absent or undecodable. */
  readonly missingImage: string
}

/** Options one shape-tree read accepts. */
export interface ReadShapesOptions {
  /** Skip `p:sp` shapes that declare a placeholder, for master/layout decoration layers. */
  readonly skipPlaceholders?: boolean
  /**
   * Header/footer placeholder types that draw despite `skipPlaceholders`,
   * when `p:hf` enables them: `ftr`, `dt`, `sldNum`.
   */
  readonly hfPlaceholderTypes?: ReadonlySet<string>
  /** Header/footer types a closer part already covers, which suppress the inherited one. */
  readonly suppressedHfTypes?: ReadonlySet<string>
}

/** Bullet a body placeholder falls back to when no level states one. */
const BODY_BULLET = { kind: 'char', text: '•', startAt: 1, step: 1 } as const
/** Bullet for text that is not a body placeholder. */
const NO_BULLET = { kind: 'none', text: '', startAt: 1, step: 1 } as const

/** Group-child coordinate mapping, applied to every nested shape. */
export interface ChildTransform {
  readonly offsetX: number
  readonly offsetY: number
  readonly scaleX: number
  readonly scaleY: number
  readonly childOffsetX: number
  readonly childOffsetY: number
}

/** The identity transform used outside groups. */
export const IDENTITY_TRANSFORM: ChildTransform = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  childOffsetX: 0,
  childOffsetY: 0,
}

/** Everything shape parsing needs from the enclosing deck. */
export interface ShapeContext {
  readonly color: ColorContext
  readonly fonts: ThemeFonts
  /** Master title/body/other styles in force for this slide. */
  readonly masterStyles: Pick<TextStyleSet, 'title' | 'body' | 'other'>
  /** Presentation-wide default text style, used by non-placeholder text. */
  readonly defaultStyle: TextStyle
  /** Blob URL for a referenced media part, or undefined when it was not packaged. */
  readonly mediaUrl: (partName: string) => string | undefined
  /** The slide's relationships, for image targets. */
  readonly relationships: ReadonlyMap<string, Relationship>
  /** Placeholder geometry a slide shape may inherit, by placeholder key. */
  readonly placeholderGeometry: (key: string) => Element | undefined
  /** Placeholder list style a slide shape may inherit, by placeholder key. */
  readonly placeholderStyle: (key: string) => Element | undefined
  /**
   * Resolve a slide-number or date field to its live text, for decoration
   * placeholders folded per slide.
   */
  readonly fieldText?: (type: string | undefined, cached: string) => string | undefined
  /** Resolve a hyperlink relationship id to a renderable URL. */
  readonly linkTarget?: (id: string | undefined) => string | undefined
  /** The presentation's table style parts, keyed by `tableStyleId`. */
  readonly tableStyles?: ReadonlyMap<string, TableStyleElements>
}

/**
 * The `a:tblStyle` role parts of one table style, held as raw `a:tcPr`
 * elements so colour references resolve against the reading slide's context.
 */
export interface TableStyleElements {
  readonly firstRow?: Element
  readonly lastRow?: Element
  readonly firstCol?: Element
  readonly lastCol?: Element
  readonly band1H?: Element
  readonly band2H?: Element
  readonly band1V?: Element
  readonly band2V?: Element
  readonly wholeTbl?: Element
}

/**
 * Resolve a hyperlink relationship to a URL the preview may open.
 *
 * Only web and mail schemes survive: a container can name `javascript:` or a
 * file scheme, and such runs stay plain text. Internal slide jumps are not
 * external relationships, so they never resolve here either.
 * @param relationships - the part's relationships.
 * @param id - the `r:id` of `a:hlinkClick`.
 * @returns the URL, or undefined.
 */
export function externalHrefOf(
  relationships: ReadonlyMap<string, Relationship>,
  id: string | undefined,
): string | undefined {
  const relationship = id === undefined ? undefined : relationships.get(id)
  if (relationship === undefined || !relationship.external) return undefined
  const scheme = /^[a-z][a-z0-9+.-]*:/iu.exec(relationship.target)?.[0]?.toLowerCase()
  return scheme === 'http:' || scheme === 'https:' || scheme === 'mailto:' ? relationship.target : undefined
}

/** Read one position/size block, with the default sizes OOXML assigns. */
interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
  readonly flipH: boolean
  readonly flipV: boolean
}

/** Apply the enclosing group's coordinate mapping to a raw box. */
function mapBox(box: Box, transform: ChildTransform): Box {
  return {
    ...box,
    x: transform.offsetX + (box.x - transform.childOffsetX) * transform.scaleX,
    y: transform.offsetY + (box.y - transform.childOffsetY) * transform.scaleY,
    width: box.width * transform.scaleX,
    height: box.height * transform.scaleY,
  }
}

/** Read an `a:xfrm` block in slide pixels before any group mapping. */
function readTransform(element: Element | undefined): Box | undefined {
  const offset = child(element, NS_A, 'off')
  const extent = child(element, NS_A, 'ext')
  if (offset === undefined || extent === undefined) return undefined
  return {
    x: emuToPx(numberAttr(offset, 'x') ?? 0),
    y: emuToPx(numberAttr(offset, 'y') ?? 0),
    width: emuToPx(numberAttr(extent, 'cx') ?? 0),
    height: emuToPx(numberAttr(extent, 'cy') ?? 0),
    rotation: numberAttr(element, 'rot') === undefined ? 0 : (numberAttr(element, 'rot') ?? 0) / 60000,
    flipH: boolAttr(element, 'flipH') ?? false,
    flipV: boolAttr(element, 'flipV') ?? false,
  }
}

/** The zero box a shape without geometry falls back to. */
const EMPTY_BOX: Box = { x: 0, y: 0, width: 0, height: 0, rotation: 0, flipH: false, flipV: false }

/**
 * Read a fill element.
 * @param holder - the element owning `a:solidFill`-style children, usually `p:spPr`.
 * @param context - colour context in force.
 * @param mediaUrl - media resolver, for picture fills.
 * @param relationships - relationships of the part being parsed.
 * @returns the fill, or undefined when the holder paints nothing.
 */
function readFill(
  holder: Element | undefined,
  context: ColorContext,
  mediaUrl: (partName: string) => string | undefined,
  relationships: ReadonlyMap<string, Relationship>,
): PptxFill | undefined {
  if (holder === undefined) return undefined
  if (child(holder, NS_A, 'noFill') !== undefined) return undefined
  const solid = child(holder, NS_A, 'solidFill')
  if (solid !== undefined) {
    const color = colorOf(solid, context)
    return color === undefined ? undefined : { kind: 'solid', color }
  }
  const gradient = child(holder, NS_A, 'gradFill')
  if (gradient !== undefined) {
    const stops = children(child(gradient, NS_A, 'gsLst'), NS_A, 'gs').map(stop => ({
      offset: fraction(numberAttr(stop, 'pos') ?? 0),
      color: resolveColorElement(children(stop, NS_A)[0], context) ?? '#000000',
    }))
    if (stops.length === 0) return undefined
    const only = stops.at(0)
    if (stops.length === 1 && only !== undefined) return { kind: 'solid', color: only.color }
    const linear = child(gradient, NS_A, 'lin')
    const path = child(gradient, NS_A, 'path')
    return {
      kind: 'gradient',
      radial: path !== undefined,
      // DrawingML angles run clockwise from the positive x axis; CSS runs from "to top".
      angle: 90 + (numberAttr(linear, 'ang') ?? 0) / 60000,
      stops,
    }
  }
  const blip = child(holder, NS_A, 'blipFill')
  if (blip !== undefined) {
    const target = targetOf(relationships, attrNs(child(blip, NS_A, 'blip'), NS_R, 'embed'), REL_IMAGE)
    const url = target === undefined ? undefined : mediaUrl(target)
    if (url === undefined) return undefined
    return { kind: 'image', src: url, mode: child(blip, NS_A, 'tile') === undefined ? 'stretch' : 'tile' }
  }
  return undefined
}

/** Dash presets that render as a dotted rather than a dashed stroke. */
const DOT_PRESETS = new Set(['dot', 'sysDot', 'dashDot', 'lgDashDot', 'lgDashDotDot', 'sysDashDot', 'sysDashDotDot'])
/** Dash presets that render as a dashed stroke. */
const DASH_PRESETS = new Set(['dash', 'sysDash', 'lgDash', 'dashDot', 'lgDashDot', 'lgDashDotDot'])

/** Whether an `a:headEnd`/`a:tailEnd` element draws a visible marker. */
function drawsArrow(end: Element | undefined): boolean {
  const type = attr(end, 'type')
  return type !== undefined && type !== 'none'
}

/**
 * Read a line element.
 * @param line - the `a:ln` element.
 * @param context - colour context in force.
 * @returns the outline, or undefined when the shape has no stroke.
 */
function readLineElement(line: Element | undefined, context: ColorContext): PptxLine | undefined {
  if (line === undefined) return undefined
  if (child(line, NS_A, 'noFill') !== undefined) return undefined
  const width = numberAttr(line, 'w')
  const preset = attr(child(line, NS_A, 'prstDash'), 'val') ?? 'solid'
  const color = colorOf(child(line, NS_A, 'solidFill'), context)
  const headArrow = drawsArrow(child(line, NS_A, 'headEnd'))
  const tailArrow = drawsArrow(child(line, NS_A, 'tailEnd'))
  if (color === undefined && width === undefined && !headArrow && !tailArrow) return undefined
  return {
    ...(color === undefined ? {} : { color }),
    // OOXML omits `w` for a hairline; PowerPoint draws those at about one pixel.
    width: width === undefined ? 1 : Math.max(0.75, emuToPx(width)),
    dashed: DASH_PRESETS.has(preset),
    dotted: DOT_PRESETS.has(preset),
    ...(headArrow ? { headArrow } : {}),
    ...(tailArrow ? { tailArrow } : {}),
  }
}

/** Read `p:style` colour references, the theme-matrix fallback for shape colours. */
interface StyleReference {
  readonly fill?: PptxFill
  readonly lineColor?: CssColor
  readonly fontColor?: CssColor
  readonly shadow: boolean
}

/** Theme accent a style-reference index points at on the default fill matrix. */
function accentForIndex(index: number, context: ColorContext): CssColor | undefined {
  if (index <= 0) return undefined
  const name = `accent${((index - 1) % 6) + 1}`
  const hex = context.scheme[context.colorMap?.[name] ?? name]
  return hex === undefined ? undefined : `#${hex}`
}

/**
 * Read a shape's theme style references.
 * @param style - the `p:style` element.
 * @param context - colour context in force.
 * @returns the referenced fill, stroke, font colour, and shadow flag.
 */
function readStyleReference(style: Element | undefined, context: ColorContext): StyleReference {
  if (style === undefined) return { shadow: false }
  const fillRef = child(style, NS_A, 'fillRef')
  const fillIndex = numberAttr(fillRef, 'idx') ?? 0
  const explicitFill = colorOf(fillRef, context)
  const fillColor = explicitFill ?? accentForIndex(fillIndex, context)
  const lineRef = child(style, NS_A, 'lnRef')
  const lineIndex = numberAttr(lineRef, 'idx') ?? 0
  const lineColor = colorOf(lineRef, context) ?? accentForIndex(lineIndex, context)
  const fontRef = child(style, NS_A, 'fontRef')
  const fontColor = colorOf(fontRef, context) ?? accentForIndex(numberAttr(fontRef, 'idx') ?? 0, context)
  const effectRef = child(style, NS_A, 'effectRef')
  return {
    ...(fillColor === undefined ? {} : { fill: { kind: 'solid', color: fillColor } }),
    ...(lineColor === undefined ? {} : { lineColor }),
    ...(fontColor === undefined ? {} : { fontColor }),
    shadow: (numberAttr(effectRef, 'idx') ?? 0) > 0,
  }
}

/**
 * Read a shape's first outer shadow into a `box-shadow` value.
 * @param spPr - the `p:spPr` or picture properties element.
 * @param context - colour context, for the shadow's colour and alpha.
 * @returns the CSS shadow, or undefined when no outer shadow is stated.
 */
function readShadow(spPr: Element | undefined, context: ColorContext): string | undefined {
  const shadow = child(child(spPr, NS_A, 'effectLst'), NS_A, 'outerShdw')
  if (shadow === undefined) return undefined
  const direction = (numberAttr(shadow, 'dir') ?? 2700000) / 60000 * Math.PI / 180
  const distance = emuToPx(numberAttr(shadow, 'dist') ?? 38100)
  const blur = emuToPx(numberAttr(shadow, 'blurRad') ?? 50800)
  const color = colorChildOf(shadow, context) ?? 'rgba(0, 0, 0, 0.4)'
  return `${Math.round(Math.cos(direction) * distance * 100) / 100}px `
    + `${Math.round(Math.sin(direction) * distance * 100) / 100}px `
    + `${Math.round(blur * 100) / 100}px ${color}`
}

/**
 * Read a shape's non-visual property id and name.
 * @param node - the shape element.
 * @param ns - namespace of its non-visual properties container.
 * @param local - local name of that container.
 * @returns the declared id and name, empty when absent.
 */
function shapeIdentity(node: Element, ns: string, local: string): { readonly id: string; readonly name: string } {
  const properties = child(child(node, ns, local), ns, 'cNvPr')
  return {
    id: attr(properties, 'id') ?? '',
    name: attr(properties, 'name') ?? '',
  }
}

/**
 * The placeholder key a slide shape inherits through.
 * @param node - a `p:sp` element.
 * @returns the key matching layout and master placeholders, or undefined.
 */
function placeholderKey(node: Element): string | undefined {
  const placeholder = child(child(node, NS_P, 'nvSpPr'), NS_P, 'nvPr') === undefined
    ? undefined
    : child(child(child(node, NS_P, 'nvSpPr'), NS_P, 'nvPr'), NS_P, 'ph')
  if (placeholder === undefined) return undefined
  const index = attr(placeholder, 'idx')
  if (index !== undefined) return `idx:${index}`
  const type = attr(placeholder, 'type') ?? 'body'
  return `type:${type}`
}

/**
 * The placeholder type name a slide shape declares.
 *
 * `p:ph` without a `type` attribute is a body placeholder, which is what makes
 * a content placeholder inherit the body style's bullets.
 * @param node - a `p:sp` element.
 * @returns the placeholder type, or undefined when the shape is not a placeholder.
 */
function placeholderType(node: Element): string | undefined {
  const nvPr = child(child(node, NS_P, 'nvSpPr'), NS_P, 'nvPr')
  const placeholder = child(nvPr, NS_P, 'ph')
  if (placeholder === undefined) return undefined
  return attr(placeholder, 'type') ?? 'body'
}

/** Which master text style a placeholder's text cascades from. */
type StyleRole = 'title' | 'body' | 'other'

/**
 * Choose the inherited style role for a shape's text.
 * @param type - the placeholder type, or undefined for a bare shape.
 * @returns the master style role and the bullet the role falls back to.
 */
function styleRoleFor(
  type: string | undefined,
): { readonly role: StyleRole; readonly bullet: typeof BODY_BULLET | typeof NO_BULLET } {
  switch (type) {
    case 'title':
    case 'ctrTitle':
    case 'subTitle':
      return { role: 'title', bullet: NO_BULLET }
    case 'body':
    case 'obj':
    case 'tbl':
    case 'chart':
    case 'clipArt':
    case 'dgm':
    case 'media':
    case 'pic':
      return { role: 'body', bullet: BODY_BULLET }
    default:
      return { role: 'other', bullet: NO_BULLET }
  }
}

/**
 * Read an autoshape.
 * @param node - the `p:sp` element.
 * @param context - deck-wide parsing inputs.
 * @param transform - enclosing group mapping.
 * @param geometry - the geometry element the shape inherits when it states none.
 * @returns the parsed shape.
 */
function readAutoShape(
  node: Element,
  context: ShapeContext,
  transform: ChildTransform,
  geometry: Element | undefined,
): PptxAutoShape {
  const spPr = child(node, NS_P, 'spPr')
  const xfrm = child(spPr, NS_A, 'xfrm') ?? child(geometry, NS_A, 'xfrm')
  const box = mapBox(readTransform(xfrm) ?? EMPTY_BOX, transform)
  const prstGeom = child(spPr, NS_A, 'prstGeom') ?? child(geometry, NS_A, 'prstGeom')
  const preset = attr(prstGeom, 'prst') ?? 'rect'
  const adjustments = readAdjustments(prstGeom)
  // Freeform vector art carries its own path in the shape's pixel box; it
  // outranks any inherited preset.
  const custGeom = child(spPr, NS_A, 'custGeom') ?? child(geometry, NS_A, 'custGeom')
  const custGeomPath = custGeom === undefined
    ? undefined
    : readCustGeomPath(custGeom, roundPx(box.width), roundPx(box.height))
  const outline = custGeomPath === undefined
    ? presetOutline(preset, box.width, box.height, adjustments)
    : { radius: 0 }
  const style = readStyleReference(child(node, NS_P, 'style'), context.color)
  const shadow = readShadow(spPr, context.color)
    ?? (style.shadow ? '0 1.5px 3px rgba(0, 0, 0, 0.3)' : undefined)
  const explicitFill = readFill(spPr, context.color, context.mediaUrl, context.relationships)
  const explicitLine = child(spPr, NS_A, 'ln')
  const line = explicitLine === undefined
    ? (style.lineColor === undefined ? undefined : {
      color: style.lineColor, width: 1, dashed: false, dotted: false,
    })
    : readLineElement(explicitLine, context.color)
  const key = placeholderKey(node)
  const type = placeholderType(node)
  const placeholderStyle = key === undefined ? undefined : context.placeholderStyle(key)
  const localStyle = readShapeListStyle(child(node, NS_P, 'txBody'), context.color, context.fonts)
  const role = styleRoleFor(type)
  const masterStyle = type === undefined ? context.defaultStyle : context.masterStyles[role.role]
  const inheritedListStyle = readShapeListStyle(placeholderStyle, context.color, context.fonts)
  const text = readTextBody(child(node, NS_P, 'txBody'), {
    color: context.color,
    fonts: context.fonts,
    sources: type === undefined
      ? [context.defaultStyle, localStyle]
      : [masterStyle, inheritedListStyle, localStyle],
    fallbackBullet: role.bullet,
    fieldText: context.fieldText,
    linkTarget: context.linkTarget,
  })
  const identity = shapeIdentity(node, NS_P, 'nvSpPr')
  const fill = explicitFill ?? style.fill
  const recoloured = applyFontColor(text, style.fontColor)
  return {
    kind: 'shape',
    id: identity.id,
    name: identity.name,
    x: roundPx(box.x),
    y: roundPx(box.y),
    width: roundPx(box.width),
    height: roundPx(box.height),
    rotation: box.rotation,
    flipH: box.flipH,
    flipV: box.flipV,
    opacity: 1,
    preset,
    ...(custGeomPath === undefined ? {} : { custGeomPath }),
    cornerRadius: roundPx(outline.radius),
    adjustments,
    ...(fill === undefined ? {} : { fill }),
    ...(line === undefined ? {} : { line }),
    ...(recoloured === undefined ? {} : { text: recoloured }),
    ...(shadow === undefined ? {} : { shadow }),
  }
}

/**
 * Recolour text that inherited no colour of its own from the shape's style reference.
 * @param text - the parsed text body.
 * @param color - the style reference's font colour.
 * @returns the text body with the colour applied to runs that resolve to the theme default.
 */
function applyFontColor(text: PptxTextBody | undefined, color: CssColor | undefined): PptxTextBody | undefined {
  if (text === undefined || color === undefined) return text
  return {
    ...text,
    paragraphs: text.paragraphs.map((paragraph: PptxParagraph): PptxParagraph => ({
      ...paragraph,
      runs: paragraph.runs.map(run => ({ ...run, color })),
    })),
  }
}

/**
 * Read a placed picture.
 * @param node - the `p:pic` element.
 * @param context - deck-wide parsing inputs.
 * @param transform - enclosing group mapping.
 * @param labels - descriptions for what the renderer cannot draw.
 * @returns the parsed picture, or a placeholder when its media part is absent
 * or in a format the browser cannot decode (EMF, WMF).
 */
function readPicture(
  node: Element,
  context: ShapeContext,
  transform: ChildTransform,
  labels: ShapeLabels,
): PptxPicture | PptxPlaceholder {
  const spPr = child(node, NS_P, 'spPr')
  const box = mapBox(readTransform(child(spPr, NS_A, 'xfrm')) ?? EMPTY_BOX, transform)
  const identity = shapeIdentity(node, NS_P, 'nvPicPr')
  const base = {
    id: identity.id,
    name: identity.name,
    x: roundPx(box.x),
    y: roundPx(box.y),
    width: roundPx(box.width),
    height: roundPx(box.height),
    rotation: box.rotation,
    flipH: box.flipH,
    flipV: box.flipV,
    opacity: 1,
  }
  const blip = child(child(node, NS_P, 'blipFill'), NS_A, 'blip')
  const target = targetOf(context.relationships, attrNs(blip, NS_R, 'embed'), REL_IMAGE)
  const url = target === undefined ? undefined : context.mediaUrl(target)
  if (url === undefined) {
    return { kind: 'placeholder', ...base, label: labels.missingImage }
  }
  const source = child(child(node, NS_P, 'blipFill'), NS_A, 'srcRect')
  const readFraction = (name: string): number => fraction(numberAttr(source, name) ?? 0)
  const prstGeom = child(spPr, NS_A, 'prstGeom')
  const line = readLineElement(child(spPr, NS_A, 'ln'), context.color)
  const shadow = readShadow(spPr, context.color)
  return {
    kind: 'picture',
    ...base,
    src: url,
    crop: {
      left: readFraction('l'),
      top: readFraction('t'),
      right: readFraction('r'),
      bottom: readFraction('b'),
    },
    preset: attr(prstGeom, 'prst') ?? 'rect',
    ...(line === undefined ? {} : { line }),
    ...(shadow === undefined ? {} : { shadow }),
  }
}

/**
 * Read one table cell.
 * @param node - the `a:tc` element.
 * @param context - deck-wide parsing inputs.
 * @returns the parsed cell.
 */
function readTableCell(node: Element, context: ShapeContext): PptxTableCell {
  const properties = child(node, NS_A, 'tcPr')
  const fill = readFill(properties, context.color, context.mediaUrl, context.relationships)
  const borders = {
    ...(readLineElement(child(properties, NS_A, 'lnT'), context.color) === undefined
      ? {} : { top: readLineElement(child(properties, NS_A, 'lnT'), context.color) }),
    ...(readLineElement(child(properties, NS_A, 'lnL'), context.color) === undefined
      ? {} : { left: readLineElement(child(properties, NS_A, 'lnL'), context.color) }),
    ...(readLineElement(child(properties, NS_A, 'lnB'), context.color) === undefined
      ? {} : { bottom: readLineElement(child(properties, NS_A, 'lnB'), context.color) }),
    ...(readLineElement(child(properties, NS_A, 'lnR'), context.color) === undefined
      ? {} : { right: readLineElement(child(properties, NS_A, 'lnR'), context.color) }),
  }
  const localStyle = readShapeListStyle(child(node, NS_A, 'txBody'), context.color, context.fonts)
  const text = readTextBody(child(node, NS_A, 'txBody'), {
    color: context.color,
    fonts: context.fonts,
    sources: [context.defaultStyle, context.masterStyles.other, localStyle],
    fallbackBullet: NO_BULLET,
    fieldText: context.fieldText,
    linkTarget: context.linkTarget,
  })
  return {
    ...(fill === undefined ? {} : { fill }),
    ...(text === undefined ? {} : { text }),
    gridSpan: Math.max(1, numberAttr(properties, 'gridSpan') ?? 1),
    rowSpan: Math.max(1, numberAttr(properties, 'rowSpan') ?? 1),
    merged: boolAttr(properties, 'hMerge') === true || boolAttr(properties, 'vMerge') === true,
    borders,
  }
}

/**
 * Mix a theme colour toward white by a fraction, the tint Office's banded-row
 * fills use.
 * @param color - a `#rrggbb` colour.
 * @param towardWhite - how much white to mix in, 0–1.
 * @returns the mixed CSS colour.
 */
function tint(color: CssColor, towardWhite: number): CssColor {
  const { r, g, b } = hexToRgb(color.replace('#', ''))
  return rgbToCss({
    r: r * (1 - towardWhite) + 255 * towardWhite,
    g: g * (1 - towardWhite) + 255 * towardWhite,
    b: b * (1 - towardWhite) + 255 * towardWhite,
  })
}

/** The text colour a run resolves to when nothing states one, for this context. */
function defaultTextColor(context: ShapeContext): CssColor {
  const themeText = context.color.scheme[context.color.colorMap?.tx1 ?? 'dk1']
  return themeText === undefined ? '#000000' : `#${themeText}`
}

/**
 * Restyle a header cell's text the way Office's default table style does:
 * bold, and white unless the run states a colour of its own.
 * @param text - the cell's parsed text body.
 * @param context - deck-wide parsing inputs.
 * @returns the restyled text body, or the original when there is nothing to change.
 */
function headerText(text: PptxTextBody | undefined, context: ShapeContext): PptxTextBody | undefined {
  if (text === undefined) return undefined
  const inherited = defaultTextColor(context)
  return {
    ...text,
    paragraphs: text.paragraphs.map(paragraph => ({
      ...paragraph,
      runs: paragraph.runs.map(run => run.color.toUpperCase() === inherited.toUpperCase()
        ? { ...run, color: '#FFFFFF', bold: true }
        : { ...run, bold: true }),
    })),
  }
}

/** Whether a resolved colour reads as dark, so header text should turn white. */
function isDark(color: CssColor): boolean {
  const hex = color.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/u.test(hex)) return true
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55
}

/** The fill a style role part states, resolved against the slide. */
function partFill(part: Element | undefined, context: ShapeContext): PptxFill | undefined {
  if (part === undefined) return undefined
  return readFill(child(part, NS_A, 'tcPr'), context.color, context.mediaUrl, context.relationships)
}

/** One border side from a style role part, resolved against the slide. */
function partBorder(
  part: Element | undefined,
  side: 'lnT' | 'lnL' | 'lnB' | 'lnR',
  context: ShapeContext,
): PptxLine | undefined {
  if (part === undefined) return undefined
  return readLineElement(child(child(part, NS_A, 'tcPr'), NS_A, side), context.color)
}

/**
 * Apply a table's style to cells that state nothing of their own.
 *
 * A resolved `tableStyles.xml` style provides per-role fills and borders
 * (first/last row and column, horizontal and vertical bands, whole-table);
 * colours inside it resolve against the reading slide's context, so a table
 * keeps its exact style colours. Tables without a style part fall back to the
 * accent header and tinted banding Office's built-in default looks like.
 * @param table - the `a:tbl` element.
 * @param rows - the parsed rows.
 * @param context - deck-wide parsing inputs.
 * @returns the rows with style fills, borders, and header text applied.
 */
function applyTableStyle(
  table: Element,
  rows: readonly { readonly height: number; readonly cells: readonly PptxTableCell[] }[],
  context: ShapeContext,
): readonly { readonly height: number; readonly cells: readonly PptxTableCell[] }[] {
  const properties = child(table, NS_A, 'tblPr')
  if (properties === undefined) return rows
  const firstRow = boolAttr(properties, 'firstRow') ?? false
  const lastRow = boolAttr(properties, 'lastRow') ?? false
  const firstCol = boolAttr(properties, 'firstCol') ?? false
  const lastCol = boolAttr(properties, 'lastCol') ?? false
  const bandRow = boolAttr(properties, 'bandRow') ?? false
  const bandCol = boolAttr(properties, 'bandCol') ?? false
  const styleId = (child(table, NS_A, 'tableStyleId')?.textContent ?? '').trim()
  const style = styleId === '' ? undefined : context.tableStyles?.get(styleId)
  if (style === undefined && !firstRow && !bandRow) return rows
  const accent = accentForIndex(1, context.color)
  if (style === undefined && accent === undefined) return rows

  return rows.map((row, rowIndex) => ({
    height: row.height,
    cells: row.cells.map((cell, cellIndex) => {
      if (cell.merged) return cell
      const dataRowIndex = rowIndex - (firstRow ? 1 : 0)
      const dataColIndex = cellIndex - (firstCol ? 1 : 0)
      const roleTcPr = (firstRow && rowIndex === 0 ? style?.firstRow : undefined)
        ?? (lastRow && rowIndex === rows.length - 1 ? style?.lastRow : undefined)
        ?? (firstCol && cellIndex === 0 ? style?.firstCol : undefined)
        ?? (lastCol && cellIndex === row.cells.length - 1 ? style?.lastCol : undefined)
      const bandTcPr = (bandRow && dataRowIndex >= 0
        ? (dataRowIndex % 2 === 1 ? style?.band2H : style?.band1H)
        : undefined)
        ?? (bandCol && dataColIndex >= 0
          ? (dataColIndex % 2 === 1 ? style?.band2V : style?.band1V)
          : undefined)
      let fill = cell.fill
        ?? partFill(roleTcPr, context)
        ?? partFill(bandTcPr, context)
        ?? partFill(style?.wholeTbl, context)
      let borders = cell.borders as PptxTableCell['borders'] | undefined
      if (style !== undefined) {
        const source: Element | undefined = roleTcPr ?? bandTcPr ?? style.wholeTbl
        borders = {
          top: cell.borders.top ?? partBorder(source, 'lnT', context),
          left: cell.borders.left ?? partBorder(source, 'lnL', context),
          bottom: cell.borders.bottom ?? partBorder(source, 'lnB', context),
          right: cell.borders.right ?? partBorder(source, 'lnR', context),
        }
      }
      // Without a style part, fall back to the built-in look: accent header,
      // tinted banding starting at the second data row.
      const header = firstRow && rowIndex === 0
      if (style === undefined && accent !== undefined) {
        const bandedData = bandRow && dataRowIndex >= 1 && dataRowIndex % 2 === 1
        if (header) fill = { kind: 'solid', color: accent }
        else if (bandedData) fill = { kind: 'solid', color: tint(accent, 0.8) }
      }
      const whiteHeader = header && (fill !== undefined && fill.kind === 'solid' && isDark(fill.color))
      return {
        ...cell,
        ...(fill === undefined ? {} : { fill }),
        ...(borders === undefined ? {} : { borders }),
        ...(whiteHeader ? { text: headerText(cell.text, context) ?? cell.text } : {}),
      }
    }),
  }))
}

/**
 * Read a graphic frame holding a table.
 * @param node - the `p:graphicFrame` element.
 * @param context - deck-wide parsing inputs.
 * @param transform - enclosing group mapping.
 * @returns the parsed table, or undefined when the frame holds something else.
 */
function readTable(node: Element, context: ShapeContext, transform: ChildTransform): PptxTable | undefined {
  const graphic = child(node, NS_A, 'graphic')
  const tableElement = child(child(graphic, NS_A, 'graphicData'), NS_A, 'tbl')
  if (tableElement === undefined) return undefined
  const box = mapBox(readTransform(child(node, NS_P, 'xfrm')) ?? EMPTY_BOX, transform)
  const columnWidths = children(child(tableElement, NS_A, 'tblGrid'), NS_A, 'gridCol')
    .map(column => emuToPx(numberAttr(column, 'w') ?? 0))
  const rows = applyTableStyle(tableElement, children(tableElement, NS_A, 'tr').map(row => ({
    height: emuToPx(numberAttr(row, 'h') ?? 0),
    cells: children(row, NS_A, 'tc').map(cell => readTableCell(cell, context)),
  })), context)
  const properties = child(tableElement, NS_A, 'tblPr')
  const identity = shapeIdentity(node, NS_P, 'nvGraphicFramePr')
  return {
    kind: 'table',
    id: identity.id,
    name: identity.name,
    x: roundPx(box.x),
    y: roundPx(box.y),
    width: roundPx(box.width),
    height: roundPx(box.height),
    rotation: box.rotation,
    flipH: box.flipH,
    flipV: box.flipV,
    opacity: 1,
    columnWidths: columnWidths.length === 0 ? [box.width] : columnWidths,
    rows,
    banded: boolAttr(properties, 'bandRow') ?? false,
  }
}

/**
 * Read a graphic frame the renderer does not draw.
 * @param node - the `p:graphicFrame` element.
 * @param transform - enclosing group mapping.
 * @param label - localized description of the frame's content.
 * @returns the placeholder shape.
 */
function readGraphicPlaceholder(node: Element, transform: ChildTransform, label: string): PptxPlaceholder {
  const box = mapBox(readTransform(child(node, NS_P, 'xfrm')) ?? EMPTY_BOX, transform)
  const identity = shapeIdentity(node, NS_P, 'nvGraphicFramePr')
  return {
    kind: 'placeholder',
    id: identity.id,
    name: identity.name,
    x: roundPx(box.x),
    y: roundPx(box.y),
    width: roundPx(box.width),
    height: roundPx(box.height),
    rotation: box.rotation,
    flipH: box.flipH,
    flipV: box.flipV,
    opacity: 1,
    label,
  }
}

/**
 * Derive the child mapping a group applies to its members.
 * @param groupProperties - the `p:grpSpPr` element.
 * @param parent - the mapping inherited from the enclosing group.
 * @returns the mapping from child coordinates to slide pixels.
 */
function readGroupTransform(groupProperties: Element | undefined, parent: ChildTransform): ChildTransform {
  const xfrm = child(groupProperties, NS_A, 'xfrm')
  const offset = child(xfrm, NS_A, 'off')
  const extent = child(xfrm, NS_A, 'ext')
  const childOffset = child(xfrm, NS_A, 'chOff')
  const childExtent = child(xfrm, NS_A, 'chExt')
  const childWidth = numberAttr(childExtent, 'cx') ?? 0
  const childHeight = numberAttr(childExtent, 'cy') ?? 0
  const width = numberAttr(extent, 'cx') ?? 0
  const height = numberAttr(extent, 'cy') ?? 0
  const scaleX = childWidth === 0 ? 1 : width / childWidth
  const scaleY = childHeight === 0 ? 1 : height / childHeight
  const outer = mapBox({
    x: emuToPx(numberAttr(offset, 'x') ?? 0),
    y: emuToPx(numberAttr(offset, 'y') ?? 0),
    width: emuToPx(width),
    height: emuToPx(height),
    rotation: 0,
    flipH: false,
    flipV: false,
  }, parent)
  return {
    offsetX: outer.x,
    offsetY: outer.y,
    scaleX: outer.width === 0 ? scaleX : outer.width / emuToPx(childWidth === 0 ? width : childWidth),
    scaleY: outer.height === 0 ? scaleY : outer.height / emuToPx(childHeight === 0 ? height : childHeight),
    childOffsetX: emuToPx(numberAttr(childOffset, 'x') ?? 0),
    childOffsetY: emuToPx(numberAttr(childOffset, 'y') ?? 0),
  }
}

/**
 * Read a group shape and flatten its children into slide coordinates.
 * @param node - the `p:grpSp` element.
 * @param context - deck-wide parsing inputs.
 * @param transform - enclosing group mapping.
 * @param labels - descriptions for unsupported descendants.
 * @param depth - nesting level of this group within its shape tree.
 * @returns the parsed group.
 */
function readGroup(
  node: Element,
  context: ShapeContext,
  transform: ChildTransform,
  labels: ShapeLabels,
  depth: number,
): PptxGroup {
  const groupProperties = child(node, NS_P, 'grpSpPr')
  const childTransform = readGroupTransform(groupProperties, transform)
  const box = mapBox(readTransform(child(groupProperties, NS_A, 'xfrm')) ?? EMPTY_BOX, transform)
  const identity = shapeIdentity(node, NS_P, 'nvGrpSpPr')
  return {
    kind: 'group',
    id: identity.id,
    name: identity.name,
    x: roundPx(box.x),
    y: roundPx(box.y),
    width: roundPx(box.width),
    height: roundPx(box.height),
    rotation: box.rotation,
    flipH: box.flipH,
    flipV: box.flipV,
    opacity: 1,
    children: depth >= MAX_GROUP_DEPTH
      ? []
      : readShapes(node, context, childTransform, labels, {}, depth + 1),
  }
}

/**
 * Read every shape in a shape-tree element.
 * @param tree - a `p:spTree`, `p:grpSp`, or equivalent container.
 * @param context - deck-wide parsing inputs.
 * @param transform - enclosing group mapping.
 * @param labels - descriptions for what the renderer does not draw.
 * @param options - per-call switches, such as skipping placeholders.
 * @param depth - nesting level, used only by group recursion.
 * @returns the parsed shapes in document order.
 */
export function readShapes(
  tree: Element | undefined,
  context: ShapeContext,
  transform: ChildTransform,
  labels: ShapeLabels,
  options: ReadShapesOptions = {},
  depth = 0,
): readonly PptxShape[] {
  const shapes: PptxShape[] = []
  for (const node of Array.from(tree?.children ?? [])) {
    // Office wraps charts, SmartArt, and equations in a Choice (renderable
    // only by the editor's own model) whose Fallback exports the cached
    // picture or shape every viewer shows; read that Fallback in place.
    if (node.namespaceURI === NS_MC && node.localName === 'AlternateContent') {
      const fallback = child(node, NS_MC, 'Fallback') ?? child(node, NS_MC, 'Choice')
      if (fallback !== undefined) {
        shapes.push(...readShapes(fallback, context, transform, labels, options, depth))
      }
      continue
    }
    if (node.namespaceURI !== NS_P) continue
    switch (node.localName) {
      case 'sp': {
        const key = placeholderKey(node)
        if (options.skipPlaceholders === true && key !== undefined) {
          const type = placeholderType(node)
          const hfDrawn = type !== undefined && options.hfPlaceholderTypes?.has(type) === true
          const suppressed = type !== undefined && options.suppressedHfTypes?.has(type) === true
          if (!hfDrawn || suppressed) break
        }
        const geometry = key === undefined ? undefined : context.placeholderGeometry(key)
        shapes.push(readAutoShape(node, context, transform, geometry))
        break
      }
      case 'pic': {
        shapes.push(readPicture(node, context, transform, labels))
        break
      }
      case 'graphicFrame': {
        const table = readTable(node, context, transform)
        shapes.push(table ?? readGraphicPlaceholder(node, transform, labels.unsupportedFrame))
        break
      }
      case 'grpSp':
        shapes.push(readGroup(node, context, transform, labels, depth))
        break
      case 'cxnSp':
        shapes.push(readAutoShape(node, context, transform, undefined))
        break
      default:
        break
    }
  }
  return shapes
}

/**
 * Read a slide's, layout's, or master's background.
 * @param container - the `p:cSld` element.
 * @param context - colour context in force.
 * @param mediaUrl - media resolver, for picture backgrounds.
 * @param relationships - relationships of the part being parsed.
 * @returns the background fill, or undefined when the part states none.
 */
export function readBackground(
  container: Element | undefined,
  context: ColorContext,
  mediaUrl: (partName: string) => string | undefined,
  relationships: ReadonlyMap<string, Relationship>,
): PptxFill | undefined {
  const background = child(container, NS_P, 'bg')
  if (background === undefined) return undefined
  const properties = child(background, NS_P, 'bgPr')
  if (properties !== undefined) return readFill(properties, context, mediaUrl, relationships)
  const reference = child(background, NS_P, 'bgRef')
  if (reference !== undefined) {
    const color = colorOf(reference, context)
    if (color !== undefined) return { kind: 'solid', color }
  }
  return undefined
}
