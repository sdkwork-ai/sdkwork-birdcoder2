/**
 * Fill, stroke, and outline projection to CSS.
 *
 * A shape paints on its own layer so geometry clipping never reaches the text
 * frame above it, and so a solid, gradient, or picture fill all reduce to one
 * `CSSProperties` object.
 */
import type { CSSProperties } from 'react'
import type { PptxFill, PptxLine } from '../pptx/model.ts'

/** The blue PowerPoint frames a selected shape with, and draws its handles in. */
export const SELECTION_COLOR = '#2E9BD6'

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

/**
 * The frame PowerPoint draws around a selected shape: a hairline in the
 * selection blue.
 *
 * The canvas the shape sits on is CSS-scaled by the viewer's zoom, so the frame
 * width is divided by it — a selection reads as the same hairline at every zoom
 * the way PowerPoint's does.
 * @param zoom - the scale the slide canvas is drawn at.
 * @returns the border and sizing properties.
 */
export function selectionBorderStyle(zoom: number): CSSProperties {
  const scale = zoom > 0 ? zoom : 1
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    border: `${1 / scale}px solid ${SELECTION_COLOR}`,
    boxSizing: 'border-box',
  }
}

/**
 * The frame PowerPoint draws around a shape whose text is being edited: the
 * selection hairline turns dashed and the handles go away.
 * @param zoom - the scale the slide canvas is drawn at.
 * @returns the border and sizing properties.
 */
export function textEditBorderStyle(zoom: number): CSSProperties {
  const scale = zoom > 0 ? zoom : 1
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    border: `${1 / scale}px dashed ${SELECTION_COLOR}`,
    boxSizing: 'border-box',
  }
}

/** One of the eight handles a selected shape carries on its frame. */
export type SelectionHandleSpot =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right'

/**
 * Paint properties for one selection handle: a white square edged in the
 * selection blue, pinned to its spot on the frame.
 *
 * The handle keeps one size on screen, so its side and offset are laid out
 * divided by the canvas zoom.
 * @param spot - the corner or edge midpoint the handle sits on.
 * @param zoom - the scale the slide canvas is drawn at.
 * @returns the positioned square.
 */
export function selectionHandleStyle(spot: SelectionHandleSpot, zoom: number): CSSProperties {
  const scale = zoom > 0 ? zoom : 1
  const side = 8 / scale
  const offset = -side / 2
  const alongX = spot.endsWith('left') ? offset : spot.endsWith('right') ? 'auto' : '50%'
  const alongY = spot.startsWith('top') ? offset : spot.startsWith('bottom') ? 'auto' : '50%'
  return {
    position: 'absolute',
    left: alongX,
    right: spot.endsWith('right') ? offset : undefined,
    top: alongY,
    bottom: spot.startsWith('bottom') ? offset : undefined,
    width: `${side}px`,
    height: `${side}px`,
    boxSizing: 'border-box',
    background: '#ffffff',
    border: `${1 / scale}px solid ${SELECTION_COLOR}`,
    pointerEvents: 'none',
  }
}
