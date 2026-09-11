/**
 * Drawing and picture reading.
 *
 * Word writes a picture two ways: the DrawingML frame a modern file uses, and
 * the VML shape older files still carry. Both reduce to the same placed image,
 * and both reach their bytes through a relationship the part declares.
 */
import { attr, attrNs, child, descendant, emuToPx, NS_A, NS_R, ptToPx, roundPx } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { Relationship } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { DocxImage } from './model.ts'
import { NS_PIC, NS_V, NS_WP } from './names.ts'

/** The package resources a drawing resolves its picture through. */
export interface DrawingContext {
  /** The declaring part's relationships, keyed by id. */
  readonly relationships: ReadonlyMap<string, Relationship>
  /**
   * Blob URL for a media part.
   * @param partName - package-absolute media part name.
   * @returns the URL, or undefined when the part is absent or not drawable.
   */
  readonly mediaUrl: (partName: string) => string | undefined
}

/** DrawingML's fraction denominator for source-rectangle crops and VML lengths. */
const PERCENT = 100000

/** Pixels per inch, the basis for every absolute CSS length. */
const PX_PER_INCH = 96

/**
 * Convert a VML absolute length to CSS pixels.
 * @param value - a length such as `12pt`, `1in`, or a bare number of pixels.
 * @returns the pixel value, or undefined when the value is not a length.
 */
function lengthToPx(value: string): number | undefined {
  const match = /^(-?[\d.]+)(pt|px|in|cm|mm)?$/u.exec(value.trim())
  if (match === null) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return undefined
  switch (match[2]) {
    case 'pt':
      return ptToPx(amount)
    case 'in':
      return amount * PX_PER_INCH
    case 'cm':
      return amount * PX_PER_INCH / 2.54
    case 'mm':
      return amount * PX_PER_INCH / 25.4
    default:
      return amount
  }
}

/**
 * Read one declaration out of a VML style attribute.
 * @param style - the shape's raw `style` attribute.
 * @param property - the CSS property name to read.
 * @returns the pixel value, or undefined when the property is absent.
 */
function styleLength(style: string | undefined, property: string): number | undefined {
  if (style === undefined) return undefined
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator < 0) continue
    if (declaration.slice(0, separator).trim() !== property) continue
    return lengthToPx(declaration.slice(separator + 1))
  }
  return undefined
}

/**
 * The Blob URL a relationship id names.
 * @param id - the `r:embed` or `r:id` value.
 * @param context - the declaring part's relationships and media resolver.
 * @returns the URL, or undefined when the relationship is absent, external, or undrawable.
 */
function imageSource(id: string | undefined, context: DrawingContext): string | undefined {
  if (id === undefined) return undefined
  const relationship = context.relationships.get(id)
  if (relationship === undefined || relationship.external) return undefined
  return context.mediaUrl(relationship.target)
}

/**
 * Read the DrawingML frame of a `w:drawing` element.
 * @param drawing - the `w:drawing` element.
 * @param context - the declaring part's relationships and media resolver.
 * @returns the placed picture, or undefined when the drawing holds no drawable picture.
 */
export function readDrawing(drawing: Element, context: DrawingContext): DocxImage | undefined {
  const placement = child(drawing, NS_WP, 'inline') ?? child(drawing, NS_WP, 'anchor')
  if (placement === undefined) return undefined
  const extent = child(placement, NS_WP, 'extent')
  const widthPx = emuToPx(Number(attr(extent, 'cx') ?? 0))
  const heightPx = emuToPx(Number(attr(extent, 'cy') ?? 0))
  if (!(widthPx > 0) || !(heightPx > 0)) return undefined
  const frame = descendant(placement, NS_PIC, 'pic')
  const src = imageSource(attrNs(descendant(frame ?? placement, NS_A, 'blip'), NS_R, 'embed'), context)
  if (src === undefined) return undefined
  const alt = attr(child(placement, NS_WP, 'docPr'), 'descr')
  const source = descendant(frame, NS_A, 'srcRect')
  const fractionOf = (name: string): number => {
    const value = Number(attr(source, name) ?? 0)
    return Number.isFinite(value) ? value / PERCENT : 0
  }
  const transform = descendant(frame, NS_A, 'xfrm')
  return {
    src,
    widthPx: roundPx(widthPx),
    heightPx: roundPx(heightPx),
    rotation: roundPx(Number(attr(transform, 'rot') ?? 0) / 60000),
    flipH: attr(transform, 'flipH') === '1' || attr(transform, 'flipH') === 'true',
    flipV: attr(transform, 'flipV') === '1' || attr(transform, 'flipV') === 'true',
    crop: {
      left: fractionOf('l'),
      top: fractionOf('t'),
      right: fractionOf('r'),
      bottom: fractionOf('b'),
    },
    ...(alt === undefined || alt === '' ? {} : { alt }),
  }
}

/**
 * Read the VML shape of a legacy `w:pict` element.
 * @param pict - the `w:pict` element.
 * @param context - the declaring part's relationships and media resolver.
 * @returns the placed picture, or undefined when the shape holds no drawable image.
 */
export function readPict(pict: Element, context: DrawingContext): DocxImage | undefined {
  const src = imageSource(attrNs(descendant(pict, NS_V, 'imagedata'), NS_R, 'id'), context)
  if (src === undefined) return undefined
  const style = attr(child(pict, NS_V, 'shape'), 'style')
  const widthPx = styleLength(style, 'width') ?? 0
  const heightPx = styleLength(style, 'height') ?? 0
  if (!(widthPx > 0) || !(heightPx > 0)) return undefined
  return {
    src,
    widthPx: roundPx(widthPx),
    heightPx: roundPx(heightPx),
    rotation: 0,
    flipH: false,
    flipV: false,
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
  }
}
