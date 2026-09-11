/**
 * One lazily rendered page of the continuous strip.
 *
 * A page draws when it approaches the stage viewport and releases its raster
 * when it leaves, so a several-hundred-page document keeps only the nearby
 * rasters alive. One viewport drives the canvas, the selectable text layer,
 * and this page's highlight bands; the page reports its real geometry back to
 * the strip so frames lay out at the page's own size once known.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type ReactNode } from 'react'
import { CSS_UNITS_PER_POINT, renderPdfPage } from './pdf/page.ts'
import { matchRect } from './pdf/search.ts'
import type { PdfDocument } from './pdf/runtime.ts'
import type { PdfMatch, PdfRect, PdfTextIndex, PdfTextItem } from './pdf/search.ts'
import css from './PdfBody.module.css'

/** The geometry one rendered page reports back to the strip. */
export interface PageGeometry {
  readonly page: number
  readonly width: number
  readonly height: number
}

/** Props of one strip page; sizes are the page's own point size. */
export function PageView(props: {
  readonly document: PdfDocument
  readonly pageNumber: number
  readonly pointWidth: number
  readonly pointHeight: number
  readonly scale: number
  readonly rotation: number
  readonly textIndex: PdfTextIndex
  readonly matches: readonly PdfMatch[]
  readonly activeMatch: PdfMatch | undefined
  readonly pageLabel: string
  readonly onGeometry: (geometry: PageGeometry) => void
  readonly registerFrame: (page: number, node: HTMLDivElement | null) => void
}): ReactNode {
  const {
    document, pageNumber, pointWidth, pointHeight, scale, rotation,
    textIndex, matches, activeMatch, pageLabel, onGeometry, registerFrame,
  } = props
  const [visible, setVisible] = useState(false)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)
  const [items, setItems] = useState<readonly PdfTextItem[]>()
  const [transform, setTransform] = useState<readonly number[]>()
  const observerRef = useRef<IntersectionObserver | null>(null)

  // The frame callback owns the observer: attaching starts watching, a null
  // attach (unmount) stops it.
  const bindFrame = useCallback((node: HTMLDivElement | null): void => {
    observerRef.current?.disconnect()
    observerRef.current = null
    registerFrame(pageNumber, node)
    if (node === null) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) setVisible(entry.isIntersecting)
    }, { root: node.parentElement, rootMargin: '100% 0px' })
    observer.observe(node)
    observerRef.current = observer
  }, [pageNumber, registerFrame])

  useEffect(() => () => { observerRef.current?.disconnect() }, [])

  useEffect(() => {
    if (canvas === null) return undefined
    if (!visible) {
      // Leaving the stage releases the raster and the text runs; the frame
      // keeps its layout box so the strip does not move.
      canvas.removeAttribute('width')
      canvas.removeAttribute('height')
      layer?.replaceChildren()
      return undefined
    }
    const controller = new AbortController()
    void renderPdfPage(document, pageNumber, canvas, layer, scale, rotation, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setTransform(result.transform)
        onGeometry({ page: pageNumber, width: result.points.width, height: result.points.height })
      }, () => {
        // A page that cannot draw stays blank; re-entering the viewport redraws.
      })
    return () => { controller.abort() }
  }, [visible, canvas, layer, document, pageNumber, scale, rotation, onGeometry])

  useEffect(() => {
    if (!visible) return undefined
    const controller = new AbortController()
    void textIndex.items(pageNumber, controller.signal).then(
      (runs) => { if (!controller.signal.aborted) setItems(runs) },
      () => { if (!controller.signal.aborted) setItems([]) },
    )
    return () => { controller.abort() }
  }, [visible, textIndex, pageNumber])

  const bands = useMemo(() => {
    if (transform === undefined || items === undefined) return [] as readonly (PdfRect & { readonly active: boolean })[]
    return matches
      .filter(match => match.page === pageNumber)
      .map(match => ({ ...matchRect(transform, items[match.item], match.start, match.end), active: match === activeMatch }))
  }, [matches, activeMatch, pageNumber, transform, items])

  const onTextCopy = (event: ReactClipboardEvent<HTMLDivElement>): void => {
    event.clipboardData.setData('text/plain', event.clipboardData.getData('text/plain').replaceAll('\u0000', ''))
  }

  // Layout swaps with the rotation; the raster and text layer rotate inside.
  const swap = rotation % 180 !== 0
  const frameWidth = (swap ? pointHeight : pointWidth) * CSS_UNITS_PER_POINT * scale
  const frameHeight = (swap ? pointWidth : pointHeight) * CSS_UNITS_PER_POINT * scale
  return (
    <div
      ref={bindFrame}
      className={css.pageFrame}
      data-pdf-page-frame={pageNumber}
      style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
    >
      <canvas ref={setCanvas} className={css.pageCanvas} role="img" aria-label={pageLabel} />
      <div className={css.highlights} data-pdf-highlights aria-hidden="true">
        {bands.map((band, index) => (
          <span
            key={index}
            className={band.active ? css.highlightActive : css.highlight}
            style={{
              left: `${band.left}px`,
              top: `${band.top}px`,
              width: `${band.width}px`,
              height: `${band.height}px`,
            }}
          />
        ))}
      </div>
      <div
        ref={setLayer}
        className={css.textLayer}
        data-pdf-text-layer
        onCopy={onTextCopy}
        onMouseDown={(event) => { event.currentTarget.setAttribute('data-selecting', '') }}
      />
    </div>
  )
}
