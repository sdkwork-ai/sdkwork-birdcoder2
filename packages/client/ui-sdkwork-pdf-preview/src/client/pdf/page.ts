/**
 * Page rasterisation and its selectable text layer.
 *
 * One page render owns one canvas and one text container for its whole life, so
 * a cancelled render can never write into a page that has moved on. The canvas
 * is sized in device pixels while its CSS box stays in the page's own
 * dimensions, which keeps the page crisp under zoom without changing its layout
 * size; the text layer is positioned from the same viewport, so selection lands
 * on the glyphs the reader sees.
 */
import { TextLayer } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PdfDocument } from './runtime.ts'

/** The display scale PDF.js uses for a page's natural size at 96 DPI. */
export const CSS_UNITS_PER_POINT = 96 / 72

/** The largest raster this preview allocates for one page, in device pixels. */
const MAX_RASTER_PIXELS = 16_777_216

/** Page geometry in CSS pixels plus the viewport's user-space transform. */
export interface PdfPageSize {
  readonly width: number
  readonly height: number
  /** The user-to-viewport matrix highlight geometry maps match bands through. */
  readonly transform: readonly number[]
  /** The page's own size in points, independent of zoom and rotation. */
  readonly points: { readonly width: number; readonly height: number }
}

/** A viewport as PDF.js returns it, narrowed to what this module reads. */
type PageViewport = ReturnType<PDFPageProxy['getViewport']>

/**
 * Draw a viewport into a canvas, cancellably.
 *
 * The raster ratio is the display ratio bounded by a pixel budget, so a very
 * large page at a high zoom cannot ask for an allocation the browser refuses.
 * @param page - the page to draw.
 * @param canvas - the canvas this render owns.
 * @param viewport - the viewport to draw.
 * @param ratioCap - the largest raster ratio this caller allows.
 * @param signal - render lifetime.
 */
async function rasterize(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  ratioCap: number,
  signal: AbortSignal,
): Promise<void> {
  const ratio = Math.min(
    ratioCap,
    Math.sqrt(MAX_RASTER_PIXELS / Math.max(1, viewport.width * viewport.height)),
  )
  // Render off-screen: assigning a canvas its width clears it, so painting
  // into the visible canvas would flash the page blank through every zoom and
  // rotation and leave a torn page behind an aborted render. The finished
  // raster swaps in atomically instead.
  const offscreen = document.createElement('canvas')
  offscreen.width = Math.max(1, Math.floor(viewport.width * ratio))
  offscreen.height = Math.max(1, Math.floor(viewport.height * ratio))
  const task = page.render({
    canvas: offscreen,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
  })
  const cancel = (): void => { task.cancel() }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    await task.promise
    signal.throwIfAborted()
    canvas.width = offscreen.width
    canvas.height = offscreen.height
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    canvas.getContext('2d')?.drawImage(offscreen, 0, 0)
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

/**
 * Render one page into a canvas and build its text layer.
 * @param document - the open document.
 * @param pageNumber - 1-based page to draw.
 * @param canvas - canvas owned by this render.
 * @param textContainer - container the selectable text is written into; null skips it.
 * @param scale - zoom multiple applied on top of the page's natural size.
 * @param rotation - clockwise rotation in degrees, a multiple of 90.
 * @param signal - render lifetime.
 * @returns the page's CSS size after rotation.
 */
export async function renderPdfPage(
  document: PdfDocument,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  textContainer: HTMLElement | null | undefined,
  scale: number,
  rotation: number,
  signal: AbortSignal,
): Promise<PdfPageSize> {
  signal.throwIfAborted()
  const page: PDFPageProxy = await document.getPage(pageNumber)
  try {
    signal.throwIfAborted()
    const viewport = page.getViewport({ scale: scale * CSS_UNITS_PER_POINT, rotation })
    await rasterize(page, canvas, viewport, globalThis.devicePixelRatio || 1, signal)
    if (textContainer instanceof HTMLElement) {
      textContainer.replaceChildren()
      // PDF.js sizes the layer and its glyph runs from this variable; the
      // layer's own stylesheet contract is in `PdfBody.module.css`.
      textContainer.style.setProperty('--total-scale-factor', `${viewport.scale}`)
      const layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textContainer,
        viewport,
      })
      await layer.render()
      signal.throwIfAborted()
    }
    return {
      width: viewport.width,
      height: viewport.height,
      transform: viewport.transform,
      points: { width: viewport.width / viewport.scale, height: viewport.height / viewport.scale },
    }
  } finally {
    page.cleanup()
  }
}

/**
 * Render one page as a rail thumbnail at a fixed rail width.
 *
 * The rail has a fixed width but pages vary in size, so the scale is derived
 * from the page's own point size — a viewport at scale 1 is that size — and
 * the raster ratio is capped because a thumbnail is never worth a
 * high-density allocation.
 * @param document - the open document.
 * @param pageNumber - 1-based page to draw.
 * @param canvas - canvas owned by this render.
 * @param railWidth - the rail's content width in CSS pixels.
 * @param signal - render lifetime.
 * @returns the thumbnail's CSS height.
 */
export async function renderPdfThumbnail(
  document: PdfDocument,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  railWidth: number,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted()
  const page: PDFPageProxy = await document.getPage(pageNumber)
  try {
    signal.throwIfAborted()
    const natural = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: railWidth / Math.max(1, natural.width) })
    await rasterize(page, canvas, viewport, 2, signal)
    return viewport.height
  } finally {
    page.cleanup()
  }
}
