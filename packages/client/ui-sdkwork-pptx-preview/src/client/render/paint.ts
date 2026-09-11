/**
 * Fill, stroke, and outline projection to CSS.
 *
 * A shape paints on its own layer so geometry clipping never reaches the text
 * frame above it, and so a solid, gradient, or picture fill all reduce to one
 * `CSSProperties` object.
 */
import type { CSSProperties } from 'react'
import type { PptxFill, PptxLine } from '../pptx/model.ts'

/**
 * Paint properties for a fill.
 * @param fill - the fill, or undefined when the shape paints nothing.
 * @returns the background properties, empty when nothing is painted.
 */
export function fillStyle(fill: PptxFill | undefined): CSSProperties {
  if (fill === undefined) return {}
  switch (fill.kind) {
    case 'solid':
      return { background: fill.color }
    case 'gradient': {
      const stops = fill.stops
        .map(stop => `${stop.color} ${Math.round(stop.offset * 10000) / 100}%`)
        .join(', ')
      // A path fill radiates from the shape's centre; a linear fill converts
      // DrawingML's clockwise-from-x angle to CSS's clockwise-from-top.
      return fill.radial
        ? { backgroundImage: `radial-gradient(circle at 50% 50%, ${stops})` }
        : { backgroundImage: `linear-gradient(${fill.angle}deg, ${stops})` }
    }
    case 'image':
      return {
        backgroundImage: `url("${fill.src}")`,
        // Office stretches a blip fill to the frame's exact box, distorting
        // the aspect; only `a:tile` repeats at natural size.
        backgroundSize: fill.mode === 'tile' ? 'auto' : '100% 100%',
        backgroundRepeat: fill.mode === 'tile' ? 'repeat' : 'no-repeat',
        backgroundPosition: 'center',
      }
    default:
      return {}
  }
}

/**
 * Stroke properties for one edge of a shape or cell.
 * @param line - the edge's outline, or undefined when it has none.
 * @returns a CSS border value, or undefined for an edge that is not drawn.
 */
export function borderStyle(line: PptxLine | undefined): string | undefined {
  if (line === undefined) return undefined
  const style = line.dotted ? 'dotted' : line.dashed ? 'dashed' : 'solid'
  return `${line.width}px ${style} ${line.color ?? 'transparent'}`
}

/**
 * Paint properties for a stroke drawn on all four edges.
 * @param line - the shape's outline.
 * @returns the border properties, empty when there is no stroke.
 */
export function strokeStyle(line: PptxLine | undefined): CSSProperties {
  const border = borderStyle(line)
  return border === undefined ? {} : { border, boxSizing: 'border-box' }
}

/**
 * Shadow properties for a shape that carries an outer shadow.
 * @param shadow - the ready-to-use `box-shadow` value.
 * @returns the box-shadow property, empty when there is none.
 */
export function shadowStyle(shadow: string | undefined): CSSProperties {
  return shadow === undefined ? {} : { boxShadow: shadow }
}

/**
 * The transform placing a shape in its parent's coordinate space.
 * @param shape - position, size, rotation, and flips.
 * @returns the CSS transform and layout properties.
 */
export function placementStyle(shape: {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
  readonly flipH: boolean
  readonly flipV: boolean
  readonly opacity: number
}): CSSProperties {
  const transforms: string[] = []
  if (shape.rotation !== 0) transforms.push(`rotate(${shape.rotation}deg)`)
  if (shape.flipH) transforms.push('scaleX(-1)')
  if (shape.flipV) transforms.push('scaleY(-1)')
  return {
    position: 'absolute',
    left: `${shape.x}px`,
    top: `${shape.y}px`,
    width: `${shape.width}px`,
    height: `${shape.height}px`,
    transform: transforms.length === 0 ? undefined : transforms.join(' '),
    opacity: shape.opacity === 1 ? undefined : shape.opacity,
  }
}
