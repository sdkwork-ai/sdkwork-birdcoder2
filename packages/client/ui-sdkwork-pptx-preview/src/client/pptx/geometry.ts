/**
 * Preset and custom geometry projection to CSS.
 *
 * DrawingML geometries are parametric outlines. The renderer draws the presets
 * that appear in ordinary business decks with `clip-path` polygons, per-corner
 * radii, and computed arc polygons; a shape authored as freeform vector art
 * (`a:custGeom`) is projected to a CSS `path()` clip. Everything else falls
 * back to a plain rectangle — a shape the reader still sees, at the right
 * place and size, rather than a hole.
 */
import { attr, child, children, NS_A, numberAttr } from '@deepseek-ai/dsh-client-sdkwork-office'

/** How a shape's outline clips and rounds its fill. */
export interface ShapeOutline {
  /** Uniform corner radius in pixels, for presets that round every corner. */
  readonly radius: number
  /** Per-corner `border-radius` value in pixels, when corners differ. */
  readonly radiusCss?: string
  /** `clip-path` value, or undefined for an unclipped rectangle. */
  readonly clipPath?: string
}

/** Polygon outlines for presets expressible as a fixed fraction set. */
const POLYGONS: Readonly<Record<string, string | undefined>> = {
  triangle: 'polygon(50% 0%, 100% 100%, 0% 100%)',
  rtTriangle: 'polygon(0% 0%, 0% 100%, 100% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  parallelogram: 'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)',
  trapezoid: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
  pentagon: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
  heptagon: 'polygon(50% 0%, 90% 20%, 100% 60%, 75% 100%, 25% 100%, 0% 60%, 10% 20%)',
  octagon: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
  chevron: 'polygon(0% 0%, 75% 0%, 100% 50%, 75% 100%, 0% 100%, 25% 50%)',
  homePlate: 'polygon(0% 0%, 75% 0%, 100% 50%, 75% 100%, 0% 100%)',
  rightArrow: 'polygon(0% 25%, 65% 25%, 65% 0%, 100% 50%, 65% 100%, 65% 75%, 0% 75%)',
  leftArrow: 'polygon(35% 0%, 35% 25%, 100% 25%, 100% 75%, 35% 75%, 35% 100%, 0% 50%)',
  upArrow: 'polygon(25% 100%, 25% 35%, 0% 35%, 50% 0%, 100% 35%, 75% 35%, 75% 100%)',
  downArrow: 'polygon(0% 0%, 25% 0%, 25% 65%, 50% 100%, 75% 65%, 75% 0%, 100% 0%, 100% 100%, 0% 100%)',
  leftRightArrow: 'polygon(0% 50%, 20% 25%, 20% 40%, 80% 40%, 80% 25%, 100% 50%, 80% 75%, 80% 60%, 20% 60%, 20% 75%)',
  star5: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  star4: 'polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%)',
  star6: 'polygon(50% 0%, 68% 25%, 98% 25%, 80% 50%, 98% 75%, 68% 75%, 50% 100%, 32% 75%, 2% 75%, 20% 50%, 2% 25%, 32% 25%)',
  star8: 'polygon(50% 0%, 61% 30%, 90% 20%, 70% 39%, 100% 50%, 70% 61%, 90% 80%, 61% 70%, 50% 100%, 39% 70%, 10% 80%, 30% 61%, 0% 50%, 30% 39%, 10% 20%, 39% 30%)',
  plus: 'polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)',
  mathPlus: 'polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)',
}

/** Presets that are a full ellipse rather than a corner-rounded rectangle. */
const ELLIPSES = new Set(['ellipse', 'circle', 'flowChartConnector'])

/** Presets drawn as a straight connector rather than a filled region. */
export const LINE_PRESETS = new Set([
  'line', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5',
  'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5',
])

/** Presets whose fill region is a pie slice or a chord of the bounding ellipse. */
const ARC_REGIONS = new Set(['pie', 'chord'])

/** Step between sampled arc points, in degrees. */
const ARC_SAMPLE_DEGREES = 10

/** Format one ellipse sample as polygon percentages, at a radius fraction. */
function arcPoint(degrees: number, fraction = 1): string {
  const radians = degrees * Math.PI / 180
  const x = 50 + 50 * fraction * Math.cos(radians)
  const y = 50 + 50 * fraction * Math.sin(radians)
  return `${Math.round(x * 100) / 100}% ${Math.round(y * 100) / 100}%`
}

/**
 * Project a full ring: the outer ellipse sampled forward, the inner ellipse
 * sampled back, closing through a zero-width bridge.
 * @param innerFraction - inner radius as a fraction of the outer radius.
 * @returns the ring clip polygon.
 */
function ringPolygon(innerFraction: number): string {
  const points: string[] = []
  for (let degrees = 0; degrees < 360; degrees += ARC_SAMPLE_DEGREES) points.push(arcPoint(degrees))
  for (let degrees = 360; degrees > 0; degrees -= ARC_SAMPLE_DEGREES) points.push(arcPoint(degrees, innerFraction))
  return `polygon(${points.join(', ')})`
}

/**
 * Project a partial ring (a bent band between two angles and two radii):
 * outer arc forward, inner arc back.
 * @param startDegrees - band start angle in degrees.
 * @param sweepDegrees - band sweep in degrees, 0–360.
 * @param innerFraction - inner radius as a fraction of the outer radius.
 * @returns the band clip polygon.
 */
function bandPolygon(startDegrees: number, sweepDegrees: number, innerFraction: number): string {
  const points: string[] = []
  for (let degrees = startDegrees; degrees < startDegrees + sweepDegrees; degrees += ARC_SAMPLE_DEGREES) {
    points.push(arcPoint(degrees))
  }
  points.push(arcPoint(startDegrees + sweepDegrees))
  for (let degrees = startDegrees + sweepDegrees; degrees > startDegrees; degrees -= ARC_SAMPLE_DEGREES) {
    points.push(arcPoint(degrees, innerFraction))
  }
  points.push(arcPoint(startDegrees, innerFraction))
  return `polygon(${points.join(', ')})`
}

/**
 * Project a pie or chord region to a polygon: the sampled arc between the two
 * adjustment angles, closed directly (chord) or through the centre (pie).
 * @param preset - `pie` or `chord`.
 * @param adjustments - raw adjustment fractions of a full circle, as
 * {@link readAdjustments} reports them.
 * @returns the clip polygon, or a full ellipse when the sweep is complete.
 */
function arcRegionOutline(preset: string, adjustments: readonly number[]): ShapeOutline {
  // Adjustment values are angles in 60000ths of a degree, which
  // `readAdjustments` has already divided by 100000; multiplying by 5/3
  // converts them to degrees.
  const start = (adjustments[0] ?? 0) * 5 / 3
  let sweep = (adjustments[1] ?? 270) * 5 / 3 - start
  while (sweep < 0) sweep += 360
  if (sweep >= 359.99) return { radius: 0, clipPath: 'ellipse(50% 50% at 50% 50%)' }
  const points: string[] = preset === 'pie' ? ['50% 50%'] : []
  for (let degrees = start; degrees < start + sweep; degrees += ARC_SAMPLE_DEGREES) {
    points.push(arcPoint(degrees))
  }
  points.push(arcPoint(start + sweep))
  return { radius: 0, clipPath: `polygon(${points.join(', ')})` }
}

/**
 * Read a preset geometry's adjustment values.
 * @param prstGeom - the `a:prstGeom` element.
 * @returns adjustment values as fractions, in declaration order.
 */
export function readAdjustments(prstGeom: Element | undefined): readonly number[] {
  const list = children(prstGeom, NS_A, 'avLst').at(0)
  if (list === undefined) return []
  const values: number[] = []
  for (const guide of children(list, NS_A, 'gd')) {
    const formula = attr(guide, 'fmla') ?? ''
    const match = /^val\s+(-?\d+)$/u.exec(formula.trim())
    if (match !== null) values.push(Number(match[1]) / 100000)
  }
  return values
}

/**
 * Project an `a:custGeom` freeform path to a CSS `path()` string.
 *
 * The path's own coordinate space (`a:path/@w`/`@h`) scales onto the shape's
 * pixel box. Straight segments, cubic curves, and closes map directly;
 * elliptical arc segments degrade to a line toward their end point, which
 * keeps the outline closed at the right vertex rather than dropping it.
 * @param custGeom - the `a:custGeom` element.
 * @param width - shape width in pixels.
 * @param height - shape height in pixels.
 * @returns the CSS path data, or undefined when the geometry states no points.
 */
export function readCustGeomPath(
  custGeom: Element | undefined,
  width: number,
  height: number,
): string | undefined {
  // `a:pathLst` holds one or more `a:path` coordinate spaces; render the first.
  const path = children(children(custGeom, NS_A, 'pathLst').at(0), NS_A, 'path').at(0)
  const segments = path === undefined ? undefined : children(path, NS_A)
  if (path === undefined || segments === undefined || segments.length === 0) return undefined
  const pathWidth = Math.max(1, numberAttr(path, 'w') ?? width)
  const pathHeight = Math.max(1, numberAttr(path, 'h') ?? height)
  const scaleX = width / pathWidth
  const scaleY = height / pathHeight
  const round = (value: number): number => Math.round(value * 100) / 100
  const commands: string[] = []
  let current: [number, number] = [0, 0]
  for (const segment of segments) {
    switch (segment.localName) {
      case 'moveTo': {
        current = pointAt(child(segment, NS_A, 'pt'), scaleX, scaleY)
        commands.push(`M ${round(current[0])} ${round(current[1])}`)
        break
      }
      case 'lnTo': {
        current = pointAt(child(segment, NS_A, 'pt'), scaleX, scaleY)
        commands.push(`L ${round(current[0])} ${round(current[1])}`)
        break
      }
      case 'cubicBezTo': {
        const controls = children(segment, NS_A, 'pt')
        const c1 = pointAt(controls[0], scaleX, scaleY)
        const c2 = pointAt(controls[1], scaleX, scaleY)
        current = pointAt(controls[2], scaleX, scaleY)
        commands.push(
          `C ${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(current[0])} ${round(current[1])}`,
        )
        break
      }
      case 'arcTo': {
        // The ellipse sits so the current point lies at the start angle; the
        // segment ends at the start-plus-sweep point, which the line reaches.
        const radiusX = (numberAttr(segment, 'wR') ?? 0) * scaleX
        const radiusY = (numberAttr(segment, 'hR') ?? 0) * scaleY
        const startAngle = (numberAttr(segment, 'stAng') ?? 0) / 60000 * Math.PI / 180
        const sweepAngle = (numberAttr(segment, 'swAng') ?? 0) / 60000 * Math.PI / 180
        current = [
          round(current[0] - radiusX * Math.cos(startAngle) + radiusX * Math.cos(startAngle + sweepAngle)),
          round(current[1] - radiusY * Math.sin(startAngle) + radiusY * Math.sin(startAngle + sweepAngle)),
        ]
        commands.push(`L ${current[0]} ${current[1]}`)
        break
      }
      case 'close':
        commands.push('Z')
        break
      default:
        break
    }
  }
  return commands.length === 0 ? undefined : commands.join(' ')
}

/** Scale one `a:pt` into pixel coordinates. */
function pointAt(vertex: Element | undefined, scaleX: number, scaleY: number): [number, number] {
  return [
    (numberAttr(vertex, 'x') ?? 0) * scaleX,
    (numberAttr(vertex, 'y') ?? 0) * scaleY,
  ]
}

/**
 * Project a preset geometry onto a clipping outline.
 * @param preset - the DrawingML preset name.
 * @param width - shape width in pixels.
 * @param height - shape height in pixels.
 * @param adjustments - adjustment fractions from {@link readAdjustments}.
 * @returns the outline the renderer clips with.
 */
export function presetOutline(
  preset: string,
  width: number,
  height: number,
  adjustments: readonly number[],
): ShapeOutline {
  if (ELLIPSES.has(preset)) return { radius: 0, clipPath: 'ellipse(50% 50% at 50% 50%)' }
  if (ARC_REGIONS.has(preset)) return arcRegionOutline(preset, adjustments)
  if (preset === 'donut') {
    // The adjustment is the band thickness as a fraction of the outer radius;
    // the hole spans the middle of the ellipse.
    const thickness = Math.min(0.5, Math.max(0, adjustments[0] ?? 0.25))
    return { radius: 0, clipPath: ringPolygon(1 - 2 * thickness) }
  }
  if (preset === 'blockArc') {
    const start = (adjustments[0] ?? 108) * 5 / 3
    let sweep = (adjustments[1] ?? 0) * 5 / 3 - start
    while (sweep <= 0) sweep += 360
    sweep = Math.min(359.99, sweep)
    const thickness = Math.min(0.5, Math.max(0, adjustments[2] ?? 0.25))
    return { radius: 0, clipPath: bandPolygon(start, sweep, 1 - 2 * thickness) }
  }
  if (preset === 'roundRect') {
    const adjustment = adjustments[0] ?? 0.16667
    return { radius: Math.max(0, Math.min(width, height) * adjustment) }
  }
  // The two-corner variants round or snip a declared pair while the other
  // corners stay square; CSS keeps per-corner radii, snips need polygons.
  const corner = Math.max(0, Math.min(width, height) * (adjustments[0] ?? 0.16667))
  if (preset === 'round2SameRect') {
    const bottom = Math.max(0, Math.min(width, height) * (adjustments[1] ?? 0))
    return { radius: 0, radiusCss: `${corner}px ${corner}px ${bottom}px ${bottom}px` }
  }
  if (preset === 'round2DiagRect') {
    return { radius: 0, radiusCss: `${corner}px 0px ${corner}px 0px` }
  }
  if (preset === 'snip2SameRect') {
    const percent = snipPercent(corner, width, height)
    return {
      radius: 0,
      clipPath: `polygon(${percent}% 0%, ${100 - percent}% 0%, 100% ${percent}%, 100% 100%, 0% 100%, 0% ${percent}%)`,
    }
  }
  if (preset === 'snip2DiagRect') {
    const percent = snipPercent(corner, width, height)
    return {
      radius: 0,
      clipPath: `polygon(${percent}% 0%, 100% 0%, 100% ${100 - percent}%, ${100 - percent}% 100%, 0% 100%, 0% ${percent}%)`,
    }
  }
  if (preset === 'snip1Rect' || preset === 'snipRoundRect') {
    const percent = snipPercent(corner, width, height)
    return { radius: 0, clipPath: `polygon(${percent}% 0%, 100% 0%, 100% 100%, 0% 100%, 0% ${percent}%)` }
  }
  const polygon = POLYGONS[preset]
  if (polygon === undefined) return { radius: 0 }
  return { radius: 0, clipPath: polygon }
}

/** The snip size of a corner, clamped to the half-width the polygon allows. */
function snipPercent(cornerPx: number, width: number, height: number): number {
  const span = Math.max(1, Math.min(width, height))
  return Math.min(50, cornerPx / span * 100)
}

/**
 * Whether a preset is drawn as a straight stroke rather than a filled region.
 * @param preset - the DrawingML preset name.
 * @returns true for connector presets.
 */
export function isLinePreset(preset: string): boolean {
  return LINE_PRESETS.has(preset)
}

/**
 * Project the open `arc` preset: a band along the sampled ellipse between the
 * two adjustment angles, as thick as the shape's stroke.
 * @param adjustments - start and end angles, as {@link readAdjustments} reports.
 * @param lineWidth - the arc's stroke width in pixels.
 * @param width - shape width in pixels.
 * @param height - shape height in pixels.
 * @returns the band clip outline.
 */
export function arcBandOutline(
  adjustments: readonly number[],
  lineWidth: number,
  width: number,
  height: number,
): ShapeOutline {
  const start = (adjustments[0] ?? 16200000 / 100000) * 5 / 3
  let sweep = (adjustments[1] ?? 0) * 5 / 3 - start
  while (sweep <= 0) sweep += 360
  sweep = Math.min(359.99, sweep)
  const thickness = Math.max(lineWidth, Math.min(width, height) * 0.01)
  const inner = Math.max(0, 1 - 2 * thickness / Math.min(width, height))
  return { radius: 0, clipPath: bandPolygon(start, sweep, inner) }
}
