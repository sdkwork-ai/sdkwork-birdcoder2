/**
 * Shape presentation.
 *
 * Every shape paints on its own layer beneath its text frame, so a preset
 * outline clips the fill without clipping the paragraph that overflows it.
 * Groups are wrapped only to rotate them: their children already carry slide
 * coordinates from parsing.
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { PptxPicture, PptxShape } from '../pptx/model.ts'
import { arcBandOutline, isLinePreset, presetOutline } from '../pptx/geometry.ts'
import { fillStyle, placementStyle, shadowStyle, strokeStyle } from './paint.ts'
import { TextFrame } from './TextFrame.tsx'
import { TableView } from './TableView.tsx'

/** Fill the parent box exactly, without the `inset` shorthand jsdom cannot parse. */
const FILL_PARENT: CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }

/** The clipped paint layer a shape's fill and stroke share. */
function paintLayer(style: CSSProperties, clipPath: string | undefined): ReactNode {
  return <div style={{ ...FILL_PARENT, ...style, clipPath }} />
}

/** Render a picture with the source-rectangle crop applied to its frame. */
function PictureView({ picture }: { readonly picture: PptxPicture }): ReactNode {
  const { left, top, right, bottom } = picture.crop
  const visibleWidth = Math.max(0.01, 1 - left - right)
  const visibleHeight = Math.max(0.01, 1 - top - bottom)
  const outline = presetOutline(picture.preset, picture.width, picture.height, [])
  return (
    <div
      style={{
        ...FILL_PARENT,
        overflow: 'hidden',
        clipPath: outline.clipPath,
        borderRadius: outline.radius === 0 ? undefined : `${outline.radius}px`,
      }}
    >
      <img
        src={picture.src}
        alt=""
        draggable={false}
        decoding="async"
        style={{
          position: 'absolute',
          left: `${-left / visibleWidth * 100}%`,
          top: `${-top / visibleHeight * 100}%`,
          width: `${100 / visibleWidth}%`,
          height: `${100 / visibleHeight}%`,
        }}
      />
      {picture.line !== undefined && (
        <div style={{ ...FILL_PARENT, ...strokeStyle(picture.line) }} />
      )}
    </div>
  )
}

/** Render a connector as a straight stroke across its box, with arrowheads. */
function ConnectorView({ shape }: { readonly shape: Extract<PptxShape, { kind: 'shape' }> }): ReactNode {
  const color = shape.line?.color ?? (shape.fill?.kind === 'solid' ? shape.fill.color : undefined)
  const width = shape.line?.width ?? 1
  // A triangle built from borders, twice as long as wide, matches the
  // stealth arrowhead Office draws at the connector's ends.
  const arrow = (atStart: boolean): CSSProperties => ({
    position: 'absolute',
    ...(atStart ? { left: 0 } : { right: 0 }),
    top: `calc(50% - ${width * 2}px)`,
    width: 0,
    height: 0,
    borderTop: `${width * 2}px solid transparent`,
    borderBottom: `${width * 2}px solid transparent`,
    ...(atStart
      ? { borderRight: `${width * 3}px solid ${color ?? 'rgba(0, 0, 0, 0)'}` }
      : { borderLeft: `${width * 3}px solid ${color ?? 'rgba(0, 0, 0, 0)'}` }),
  })
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: `calc(50% - ${(shape.line?.width ?? 1) / 2}px)`,
        width: '100%',
        height: `${shape.line?.width ?? 1}px`,
        background: color,
      }}
    >
      {shape.line?.headArrow === true && <div style={arrow(true)} />}
      {shape.line?.tailArrow === true && <div style={arrow(false)} />}
    </div>
  )
}

/** Editing affordances a shape accepts from its slide canvas. */
export interface ShapeViewProps {
  readonly shape: PptxShape
  /** The shape is open for in-place text editing. */
  readonly editing?: boolean
  readonly onShapeEdit?: (shape: PptxShape) => void
  readonly onTextCommit?: (shapeId: string, lines: readonly string[]) => void
}

/**
 * Render one shape.
 * @param props - the parsed shape and its editing affordances.
 * @returns the positioned element for that shape.
 */
export function ShapeView(props: ShapeViewProps): ReactNode {
  const { shape, editing = false, onShapeEdit, onTextCommit } = props
  const placement = placementStyle(shape)
  switch (shape.kind) {
    case 'picture':
      return <div style={placement}><PictureView picture={shape} /></div>
    case 'table':
      return <div style={placement}><TableView table={shape} /></div>
    case 'group':
      return (
        <div style={placement}>
          {shape.children.map(child => (
            <ShapeView
              key={child.id}
              shape={{ ...child, x: child.x - shape.x, y: child.y - shape.y }}
            />
          ))}
        </div>
      )
    case 'placeholder':
      return (
        <div
          style={{
            ...placement,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed rgba(120, 120, 120, 0.6)',
            color: 'rgba(90, 90, 90, 1)',
            fontSize: '14px',
            boxSizing: 'border-box',
          }}
        >
          {shape.label}
        </div>
      )
    case 'shape': {
      if (isLinePreset(shape.preset)) {
        return <div style={placement}><ConnectorView shape={shape} /></div>
      }
      if (shape.preset === 'arc') {
        // An open arc is a stroked curve, not a filled region: paint a band
        // along the sampled ellipse as thick as the stroke.
        if (shape.line === undefined || shape.line.width <= 0) return <div style={placement} />
        const band = arcBandOutline(shape.adjustments, shape.line.width, shape.width, shape.height)
        return (
          <div style={placement}>
            {paintLayer({
              ...fillStyle({ kind: 'solid', color: shape.line.color ?? 'rgba(0, 0, 0, 0)' }),
              clipPath: band.clipPath,
            }, band.clipPath)}
          </div>
        )
      }
      const outline = shape.custGeomPath === undefined
        ? presetOutline(shape.preset, shape.width, shape.height, shape.adjustments)
        : { radius: 0, clipPath: `path('${shape.custGeomPath}')` }
      // The parser resolves the corner radius from the preset's adjustments; a
      // model that states one keeps it.
      const radius = shape.cornerRadius > 0
        ? `${shape.cornerRadius}px`
        : outline.radiusCss ?? (outline.radius === 0 ? undefined : `${outline.radius}px`)
      // A box border would clip into fragments along a polygon or path; two
      // stacked clipped layers — stroke colour beneath, fill scaled in by the
      // stroke width — draw the outline along the geometry itself.
      if (outline.clipPath !== undefined && shape.line !== undefined && shape.fill !== undefined) {
        const { width: lineWidth } = shape.line
        const scaleTo = (size: number): number => Math.max(0, size - 2 * lineWidth) / size
        return (
          <div style={placement}>
            {paintLayer({ ...fillStyle({ kind: 'solid', color: shape.line.color ?? 'rgba(0, 0, 0, 0)' }), ...shadowStyle(shape.shadow) }, outline.clipPath)}
            <div style={{ ...FILL_PARENT, ...fillStyle(shape.fill), clipPath: outline.clipPath, transform: `scale(${scaleTo(shape.width)}, ${scaleTo(shape.height)})` }} />
            {shape.text !== undefined && (
              <div style={FILL_PARENT}>
                <TextFrame body={shape.text} />
              </div>
            )}
          </div>
        )
      }
      const paint: CSSProperties = {
        ...fillStyle(shape.fill),
        ...strokeStyle(shape.line),
        ...shadowStyle(shape.shadow),
        borderRadius: radius,
      }
      return (
        <div style={placement} onDoubleClick={() => { onShapeEdit?.(shape) }}>
          {paintLayer(paint, outline.clipPath)}
          {shape.text !== undefined && (
            <div style={FILL_PARENT}>
              <TextFrame body={shape.text} />
            </div>
          )}
          {editing && shape.text !== undefined && (
            <ShapeTextEditor
              shape={shape}
              onCommit={(lines) => { onTextCommit?.(shape.id, lines) }}
            />
          )}
        </div>
      )
    }
    default:
      return null
  }
}

/**
 * The in-place text editor a double-click opens over a shape: plain text,
 * one line per paragraph, committed on blur.
 * @param props - the edited shape and its commit callback.
 * @returns the overlay editor.
 */
function ShapeTextEditor({ shape, onCommit }: {
  readonly shape: Extract<PptxShape, { kind: 'shape' }>
  readonly onCommit: (lines: readonly string[]) => void
}): ReactNode {
  const [text, setText] = useState(
    (shape.text?.paragraphs ?? []).map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n'),
  )
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={{
        ...FILL_PARENT,
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1.5px solid #4472C4',
        boxSizing: 'border-box',
        padding: '4px',
        font: '13px/1.4 sans-serif',
        color: '#1F1C18',
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        zIndex: 2,
      }}
      onInput={(event) => { setText((event.target as HTMLElement).textContent) }}
      onBlur={() => { onCommit(text.split('\n')) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCommit([])
          onCommit((shape.text?.paragraphs ?? []).map(paragraph => paragraph.runs.map(run => run.text).join('')))
        }
      }}
    >
      {text}
    </div>
  )
}
