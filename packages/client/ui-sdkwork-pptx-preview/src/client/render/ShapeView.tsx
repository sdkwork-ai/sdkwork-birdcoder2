/**
 * Shape presentation.
 *
 * Every shape paints on its own layer beneath its text frame, so a preset
 * outline clips the fill without clipping the paragraph that overflows it.
 * Groups are wrapped only to rotate them: their children already carry slide
 * coordinates from parsing.
 *
 * The selection chrome PowerPoint draws — a hairline with eight handles, and a
 * dashed frame while the text is being edited — paints over the shape at the
 * size the canvas zoom keeps constant on screen.
 */
import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { PptxParagraph, PptxPicture, PptxRun, PptxShape } from '../pptx/model.ts'
import { arcBandOutline, isLinePreset, presetOutline } from '../pptx/geometry.ts'
import {
  fillStyle, placementStyle, selectionBorderStyle, selectionHandleStyle, shadowStyle,
  strokeStyle, textEditBorderStyle,
} from './paint.ts'
import type { SelectionHandleSpot } from './paint.ts'
import { bulletText, runStyle } from './TextFrame.tsx'
import { TextFrame } from './TextFrame.tsx'
import { TableView } from './TableView.tsx'
import css from './ShapeView.module.css'

/** Fill the parent box exactly, without the `inset` shorthand jsdom cannot parse. */
const FILL_PARENT: CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }

/** The eight spots a selected shape carries a handle on. */
const HANDLE_SPOTS: readonly SelectionHandleSpot[] = [
  'top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right',
]

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

/** Editing and selecting affordances a shape accepts from its slide canvas. */
export interface ShapeViewProps {
  readonly shape: PptxShape
  /** The shape carries the selection frame. */
  readonly selected?: boolean
  /** The shape is open for in-place text editing. */
  readonly editing?: boolean
  /** The scale the slide canvas is drawn at, which the chrome divides by. */
  readonly zoom?: number
  /** The shape was pressed, which puts the selection on it. */
  readonly onShapeSelect?: (shape: PptxShape) => void
  /** A shape was double-clicked for text editing. */
  readonly onShapeEdit?: (shape: PptxShape) => void
  /** Edited lines were committed for a shape. */
  readonly onTextCommit?: (shapeId: string, lines: readonly string[]) => void
  /** The open text edit was abandoned, leaving the shape's text as it was. */
  readonly onTextCancel?: () => void
}

/**
 * Render one shape.
 * @param props - the parsed shape and its editing affordances.
 * @returns the positioned element for that shape.
 */
export function ShapeView(props: ShapeViewProps): ReactNode {
  const { shape, selected = false, editing = false, zoom = 1, onShapeSelect, onShapeEdit, onTextCommit, onTextCancel } = props
  const placement = placementStyle(shape)
  // A press on the shape puts the selection on it and keeps the canvas's own
  // background press from taking it back off.
  const selectOnPress = onShapeSelect === undefined ? undefined : (event: ReactPointerEvent): void => {
    event.stopPropagation()
    onShapeSelect(shape)
  }
  switch (shape.kind) {
    case 'picture':
      return (
        <div style={placement} onPointerDown={selectOnPress} data-pptx-shape={shape.id}>
          <PictureView picture={shape} />
          {selected && <SelectionChrome zoom={zoom} dashed={false} />}
        </div>
      )
    case 'table':
      return (
        <div style={placement} onPointerDown={selectOnPress} data-pptx-shape={shape.id}>
          <TableView table={shape} />
          {selected && <SelectionChrome zoom={zoom} dashed={false} />}
        </div>
      )
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
          <div
            style={placement}
            onPointerDown={selectOnPress}
            onDoubleClick={onShapeEdit === undefined ? undefined : () => { onShapeEdit(shape) }}
            data-pptx-shape={shape.id}
          >
            {paintLayer({
              ...fillStyle({ kind: 'solid', color: shape.line.color ?? 'rgba(0, 0, 0, 0)' }),
              clipPath: band.clipPath,
            }, band.clipPath)}
            {selected && <SelectionChrome zoom={zoom} dashed={false} />}
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
      let paint: ReactNode
      if (outline.clipPath !== undefined && shape.line !== undefined && shape.fill !== undefined) {
        const { width: lineWidth } = shape.line
        const scaleTo = (size: number): number => Math.max(0, size - 2 * lineWidth) / size
        paint = (
          <>
            {paintLayer({ ...fillStyle({ kind: 'solid', color: shape.line.color ?? 'rgba(0, 0, 0, 0)' }), ...shadowStyle(shape.shadow) }, outline.clipPath)}
            <div style={{ ...FILL_PARENT, ...fillStyle(shape.fill), clipPath: outline.clipPath, transform: `scale(${scaleTo(shape.width)}, ${scaleTo(shape.height)})` }} />
          </>
        )
      } else {
        paint = paintLayer({
          ...fillStyle(shape.fill),
          ...strokeStyle(shape.line),
          ...shadowStyle(shape.shadow),
          borderRadius: radius,
        }, outline.clipPath)
      }
      return (
        <div
          style={placement}
          onPointerDown={selectOnPress}
          onDoubleClick={onShapeEdit === undefined ? undefined : () => { onShapeEdit(shape) }}
          data-pptx-shape={shape.id}
        >
          {paint}
          {shape.text !== undefined && (
            editing
              ? <ShapeTextEditor shape={shape} onCommit={onTextCommit} onCancel={onTextCancel} />
              : <div style={FILL_PARENT}><TextFrame body={shape.text} /></div>
          )}
          {selected && <SelectionChrome zoom={zoom} dashed={editing} />}
        </div>
      )
    }
    default:
      return null
  }
}

/**
 * The frame and handles PowerPoint draws around a shape.
 * @param props - the canvas zoom, and whether the frame is the dashed one an
 * open text edit carries.
 * @returns the chrome overlay.
 */
function SelectionChrome({ zoom, dashed }: {
  readonly zoom: number
  readonly dashed: boolean
}): ReactNode {
  return (
    <>
      <div
        style={dashed ? textEditBorderStyle(zoom) : selectionBorderStyle(zoom)}
        data-pptx-selection-frame
        data-pptx-selection-dashed={dashed || undefined}
      />
      {!dashed && HANDLE_SPOTS.map(spot => (
        <div key={spot} style={selectionHandleStyle(spot, zoom)} data-pptx-selection-handle={spot} />
      ))}
    </>
  )
}

/** The paragraph and first-run styles one edited line carries. */
function editLineStyle(paragraph: PptxParagraph): CSSProperties {
  const hanging = paragraph.indent < 0
  const run = paragraph.runs.find(candidate => !candidate.lineBreak)
  const bullet = paragraph.bullet
  const marker = bullet.kind === 'none' ? '' : bulletText(paragraph)
  const markerWidth = hanging ? -paragraph.indent : 0
  return {
    textAlign: paragraph.align === 'justify' ? 'justify' : paragraph.align,
    marginLeft: `${paragraph.marginLeft + (hanging ? paragraph.indent : 0)}px`,
    textIndent: hanging ? undefined : `${paragraph.indent}px`,
    marginTop: paragraph.spaceBeforePx === 0 ? undefined : `${paragraph.spaceBeforePx}px`,
    marginBottom: paragraph.spaceAfterPx === 0 ? undefined : `${paragraph.spaceAfterPx}px`,
    lineHeight: paragraph.lineSpacingExactPx === undefined
      ? paragraph.lineSpacing
      : `${paragraph.lineSpacingExactPx}px`,
    ...(run === undefined ? {} : runStyle(run)),
    ...(marker === '' || markerWidth === 0 ? {} : {
      '--pptx-marker-content': `"${marker}"`,
      '--pptx-marker-width': `${markerWidth}px`,
      '--pptx-marker-color': bullet.color ?? run?.color ?? 'currentColor',
      '--pptx-marker-family': bullet.fontFamily ?? run?.fontFamily ?? 'sans-serif',
      ...(bullet.sizePx === undefined ? {} : { '--pptx-marker-size': `${bullet.sizePx}px` }),
    }),
  }
}

/** The lines a committed edit holds, one per paragraph the field shows. */
function linesOf(node: HTMLElement): readonly string[] {
  const lines = node.querySelectorAll('[data-pptx-edit-line]')
  if (lines.length > 0) {
    return [...lines].map(line => line.textContent)
  }
  // A paragraph the browser's own Enter key inserted is a plain block child,
  // which carries its text and no marker, because the marker is a pseudo
  // element the text content never sees.
  const blocks = [...node.children]
  if (blocks.length === 0) return [node.textContent]
  return blocks.map(block => block.textContent)
}

/**
 * The in-place text editor a double-click opens over a shape.
 *
 * The shape's own paint stays visible beneath — only the text frame is swapped
 * for the field — and every line carries its paragraph's alignment, spacing,
 * and first-run type, so the text reads continuously while it is being edited,
 * the way PowerPoint's in-place edit does. A commit reports one line per
 * paragraph; the bullet markers ride on pseudo elements, so they stay out of
 * the text the commit reads back.
 * @param props - the edited shape and its two endings: a commit or a cancel.
 * @returns the overlay editor.
 */
function ShapeTextEditor({ shape, onCommit, onCancel }: {
  readonly shape: Extract<PptxShape, { kind: 'shape' }>
  readonly onCommit?: (shapeId: string, lines: readonly string[]) => void
  readonly onCancel?: () => void
}): ReactNode {
  const body = shape.text
  const frameRef = useRef<HTMLDivElement | null>(null)
  const commit = (): void => {
    const node = frameRef.current
    if (node === null || onCommit === undefined) return
    onCommit(shape.id, linesOf(node))
  }
  // A press anywhere the field does not contain confirms the draft, which is
  // what a click away does in PowerPoint — and a removal from the document
  // fires no blur, so the field cannot rely on its own blur event alone.
  useEffect(() => {
    const onPressAway = (event: PointerEvent): void => {
      const node = frameRef.current
      if (node === null || !(event.target instanceof Node) || node.contains(event.target)) return
      commit()
    }
    window.addEventListener('pointerdown', onPressAway, true)
    return () => { window.removeEventListener('pointerdown', onPressAway, true) }
  })
  if (body === undefined) return null
  return (
    <div
      ref={frameRef}
      className={css.editSurface}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      data-pptx-text-editor={shape.id}
      style={{
        padding: `${body.insetTop}px ${body.insetRight}px ${body.insetBottom}px ${body.insetLeft}px`,
        justifyContent: body.anchor === 'top' ? 'flex-start' : body.anchor === 'bottom' ? 'flex-end' : 'center',
        whiteSpace: body.wrap ? 'pre-wrap' : 'nowrap',
        overflowWrap: body.wrap ? 'break-word' : 'normal',
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        // The field owns the keyboard while it is open — the arrows belong to
        // the caret, and the stage's slide-stepping keys must not read them.
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel?.()
        }
      }}
    >
      {body.paragraphs.map((paragraph, index) => (
        <div
          key={index}
          className={css.editLine}
          style={editLineStyle(paragraph)}
          data-pptx-edit-line
        >
          {paragraph.runs.length === 0
            ? '\u200b'
            : paragraph.runs.map((run: PptxRun, runIndex) => (
              run.lineBreak ? <br key={runIndex} /> : <span key={runIndex} style={runStyle(run)}>{run.text}</span>
            ))}
        </div>
      ))}
    </div>
  )
}
