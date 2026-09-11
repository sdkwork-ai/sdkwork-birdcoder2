/**
 * Paragraph content presentation.
 *
 * Every inline node is projected independently: a run is a span, a break is a
 * `<br>`, a page field is the number the page it sits on actually has, and a
 * picture is a cropped frame. Nothing here measures or decides layout; the
 * block that holds these nodes owns that.
 */
import { roundPx } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { CSSProperties, ReactNode } from 'react'
import type { DocxImage, DocxInline } from '../docx/model.ts'
import { TAB_WIDTH_PX, textStyle } from './paint.ts'

/** The context a field or a nested block needs from the page it is drawn on. */
export interface PageContext {
  /** 1-based number the page carries, honouring the section's numbering start. */
  readonly pageNumber: number
  /** How many pages the document paginated into. */
  readonly pageCount: number
  /**
   * Scroll the stage to a bookmark, following an internal link.
   * @param name - the `w:bookmarkStart` name the link names.
   */
  readonly onFollowAnchor?: (name: string) => void
}

/**
 * One picture drawn at its placed size, cropped and rotated as the file states.
 *
 * The frame clips, and the image inside is scaled up by the inverse of its
 * visible fraction so the cropped region fills the frame exactly.
 * @param props - the placed picture.
 * @returns the clipped picture frame.
 */
function ImageView({ image }: { readonly image: DocxImage }): ReactNode {
  const visibleWidth = 1 - image.crop.left - image.crop.right
  const visibleHeight = 1 - image.crop.top - image.crop.bottom
  const scaleX = visibleWidth > 0 ? 1 / visibleWidth : 1
  const scaleY = visibleHeight > 0 ? 1 / visibleHeight : 1
  const transforms: string[] = []
  if (image.rotation !== 0) transforms.push(`rotate(${image.rotation}deg)`)
  if (image.flipH) transforms.push('scaleX(-1)')
  if (image.flipV) transforms.push('scaleY(-1)')
  return (
    <span
      style={{
        display: 'inline-block',
        position: 'relative',
        overflow: 'hidden',
        width: `${image.widthPx}px`,
        height: `${image.heightPx}px`,
        verticalAlign: 'bottom',
        transform: transforms.length === 0 ? undefined : transforms.join(' '),
      }}
    >
      <img
        src={image.src}
        alt={image.alt ?? ''}
        loading="lazy"
        style={{
          position: 'absolute',
          width: `${roundPx(image.widthPx * scaleX)}px`,
          height: `${roundPx(image.heightPx * scaleY)}px`,
          left: `${roundPx(-image.crop.left * image.widthPx * scaleX)}px`,
          top: `${roundPx(-image.crop.top * image.heightPx * scaleY)}px`,
        }}
      />
    </span>
  )
}

/**
 * The pointer styles an internal link paints over its run style.
 * @returns the span properties.
 */
function anchorStyle(): CSSProperties {
  return { cursor: 'pointer' }
}

/**
 * Draw one paragraph content node.
 * @param props - the node and the page it is drawn on.
 * @returns the node's element, or null for a node that paints nothing.
 */
export function InlineView({ inline, pageContext }: {
  readonly inline: DocxInline
  readonly pageContext: PageContext
}): ReactNode {
  switch (inline.kind) {
    case 'text': {
      if (inline.link !== undefined) {
        return (
          <a href={inline.link} target="_blank" rel="noreferrer noopener" style={textStyle(inline.style)}>
            {inline.text}
          </a>
        )
      }
      if (inline.anchor !== undefined) {
        const { anchor } = inline
        return (
          <span
            role="link"
            tabIndex={0}
            title={anchor}
            style={{ ...textStyle(inline.style), ...anchorStyle() }}
            onClick={() => { pageContext.onFollowAnchor?.(anchor) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') pageContext.onFollowAnchor?.(anchor)
            }}
          >
            {inline.text}
          </span>
        )
      }
      return <span style={textStyle(inline.style)}>{inline.text}</span>
    }
    case 'break':
      return <br />
    case 'tab':
      return <span style={{ display: 'inline-block', width: `${TAB_WIDTH_PX}px` }} />
    case 'field':
      return (
        <span style={textStyle(inline.style)}>
          {inline.field === 'page' ? pageContext.pageNumber : pageContext.pageCount}
        </span>
      )
    case 'image':
      return <ImageView image={inline.image} />
    case 'unsupported':
      return (
        <span
          style={{
            ...textStyle(inline.style),
            border: '1px dashed currentColor',
            padding: '0 4px',
          }}
        >
          {inline.text}
        </span>
      )
  }
}
