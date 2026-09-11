/**
 * One slide drawn at its recorded size.
 *
 * The canvas is the coordinate system every parsed shape already speaks, so this
 * component only establishes the box and paints the slide background; scaling,
 * fitting, and scrolling belong to whoever places it.
 */
import type { ReactNode } from 'react'
import type { PptxDeck, PptxShape, PptxSlide } from '../pptx/model.ts'
import { fillStyle } from './paint.ts'
import { ShapeView } from './ShapeView.tsx'

/** Editing affordances the stage passes down to the shapes. */
export interface SlideCanvasProps {
  readonly slide: PptxSlide
  readonly deck: PptxDeck
  /** The shape currently open for text editing. */
  readonly editingShapeId?: string
  /** A shape was double-clicked for text editing. */
  readonly onShapeEdit?: (shape: PptxShape) => void
  /** Edited lines were committed for a shape. */
  readonly onTextCommit?: (shapeId: string, lines: readonly string[]) => void
}

/**
 * Render a slide at its native size.
 * @param props - the slide, the deck, and the editing affordances.
 * @returns the slide box with every shape placed inside it.
 */
export function SlideCanvas(props: SlideCanvasProps): ReactNode {
  const { slide, deck, editingShapeId, onShapeEdit, onTextCommit } = props
  return (
    <div
      style={{
        position: 'relative',
        width: `${deck.width}px`,
        height: `${deck.height}px`,
        background: '#ffffff',
        overflow: 'hidden',
        ...fillStyle(slide.background),
      }}
    >
      {slide.shapes.map((shape, index) => (
        <ShapeView
          key={shape.id === '' ? `shape-${index}` : `${shape.id}-${index}`}
          shape={shape}
          editing={editingShapeId !== undefined && editingShapeId === shape.id}
          onShapeEdit={onShapeEdit}
          onTextCommit={onTextCommit}
        />
      ))}
    </div>
  )
}
