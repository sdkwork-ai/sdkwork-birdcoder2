/**
 * The image preview body: one image on a zoomable, rotatable stage.
 *
 * The document owner delivers complete file bytes; everything below the toolbar
 * is this renderer's own. One Blob URL is created per byte identity and revoked
 * with the effect that created it, so switching files or closing the tab cannot
 * leak the decoded image. Zoom and rotation live in the tab-scoped store, so
 * returning to a tab restores the view the reader left; a tab that closes gives
 * its entry back, so the store does not accumulate one per file ever opened.
 *
 * The layout follows the other document previews: a toolbar, the stage that
 * fills what is left, and the file's facts as a strip under it. The stage holds
 * only the picture, which is what makes "fit" mean what it says — the strip is
 * outside the measured area, so a fitted image is not pushed out of the frame
 * by the metadata below it. The picture is drawn at its intrinsic size inside a
 * box of the scaled size, which is the same construction the page previews use
 * and the reason a zoom level is visible rather than merely announced.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { PagedZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { DEFAULT_IMAGE_VIEW } from './store.ts'
import type { ImageViewStore } from './store.ts'
import { formatByteSize, ImageLoadError, loadImage } from './image/load.ts'
import type { LoadedImage } from './image/load.ts'
import css from './ImageViewer.module.css'

/** Padding the stage keeps around a fitted image, in CSS pixels. */
const STAGE_PADDING = 32
/** Zoom bounds and the step each press applies. */
const MIN_ZOOM = 0.05
const MAX_ZOOM = 16
const ZOOM_STEP = 1.25
/** How far one arrow-key press scrolls the stage. */
const PAN_STEP = 80

/** Standard document props plus the image dictionary and viewing store. */
export type ImageViewerProps =
  & DocumentPreviewProps
  & PropsLocale<'sdkworkImagePreview'>
  & PropsStore<ImageViewStore>

/** A loaded image or the reason it could not be loaded. */
type LoadState =
  | { readonly kind: 'ready'; readonly data: Uint8Array<ArrayBuffer>; readonly image: LoadedImage }
  | { readonly kind: 'failed'; readonly data: Uint8Array<ArrayBuffer>; readonly error: unknown }

/** What the reader is shown when the image cannot be drawn. */
interface FailureNotice {
  /** The format the bytes turned out to be, when one was identified. */
  readonly title?: string
  readonly body: string
  /** Whether another attempt could plausibly succeed. */
  readonly retry: boolean
}

/**
 * Turn a load failure into the notice the reader needs.
 *
 * A format this preview recognizes but has no decoder for, and an image too
 * large to decode within budget, are properties of the file itself: the notice
 * explains them and offers no retry, because a second attempt cannot change the
 * answer. A damaged or unreadable file may be transient, so that one does.
 * @param error - the thrown value.
 * @param t - the namespace translator.
 * @returns the notice to render.
 */
function failureNotice(error: unknown, t: ImageViewerProps['t']): FailureNotice {
  if (error instanceof ImageLoadError) {
    const format = error.format
    const name = format?.name ?? ''
    if (error.failure === 'unsupported') {
      const reasonKey = format?.reasonKey
      return {
        title: name,
        body: t('failure.unsupported', { format: name, reason: reasonKey === undefined ? '' : t(reasonKey) }),
        retry: false,
      }
    }
    if (error.failure === 'too-large') {
      return {
        title: name,
        body: t('failure.tooLarge', {
          width: String(error.size?.width ?? 0),
          height: String(error.size?.height ?? 0),
        }),
        retry: false,
      }
    }
    if (error.failure === 'not-image') return { body: t('failure.notImage'), retry: false }
    return { body: t('failure.decode', { format: name }), retry: true }
  }
  return {
    body: t('failure.generic', { message: error instanceof Error ? error.message : String(error) }),
    retry: true,
  }
}

/** Clamp a zoom multiple into the supported range. */
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/** Whether the stage has anything to pan over. */
function panPossible(node: HTMLElement): boolean {
  return node.clientWidth > 0 && (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)
}

/** The last path segment of a resource address, which names the file. */
function fileNameOf(address: string): string {
  const name = address.slice(address.lastIndexOf('/') + 1)
  return name === '' ? address : name
}

/** The suffix a resource address ends with, which is only ever a hint. */
function extensionOf(address: string): string {
  const name = address.slice(address.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1)
}

/**
 * The image type's body, registered under `sidebar.right.tab.document`.
 * @param props - file bytes and the framework-owned tab, store, and locale seats.
 * @returns the image on its stage, or a progress or failure notice.
 */
export function ImageViewer(props: ImageViewerProps): ReactNode {
  const { tab } = props.useTabInfo()
  const view = props.useStore(state => state.byTab[tab.id] ?? DEFAULT_IMAGE_VIEW)
  const data = props.content.kind === 'bytes' ? props.content.data : undefined
  const [load, setLoad] = useState<LoadState>()
  const [attempt, setAttempt] = useState(0)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  /** A scroll position to restore once the zoom it was computed for is committed. */
  const pendingScroll = useRef<{ left: number; top: number } | undefined>(undefined)
  /** The pointer's grab point and the scroll it started from. */
  const pan = useRef<{ x: number; y: number; left: number; top: number } | undefined>(undefined)
  const { actions, t, scrollportRef, resourceAddress } = props
  const extension = useMemo(() => extensionOf(resourceAddress), [resourceAddress])
  const fileName = useMemo(() => fileNameOf(resourceAddress), [resourceAddress])

  useEffect(() => {
    if (data === undefined || tab.signal.aborted) return undefined
    let disposed = false
    let loaded: LoadedImage | undefined
    setLoad(undefined)
    void loadImage(data, extension, tab.signal).then(
      (image) => {
        if (disposed) {
          URL.revokeObjectURL(image.url)
          return
        }
        loaded = image
        setLoad({ kind: 'ready', data, image })
      },
      (error: unknown) => {
        if (!disposed) setLoad({ kind: 'failed', data, error })
      },
    )
    return () => {
      disposed = true
      if (loaded !== undefined) URL.revokeObjectURL(loaded.url)
    }
  }, [data, extension, tab.signal, attempt])

  // The store outlives any one tab, so a tab whose record has gone gives its
  // entry back. Nobody can reach that zoom and rotation again, and without this
  // every tab ever opened keeps carrying its own. The framework arms the tab
  // signal for exactly this lifetime and uses the same abort for its own reads.
  useEffect(() => {
    const { signal } = tab
    const drop = (): void => { actions.forget(tab.id) }
    if (signal.aborted) {
      drop()
      return
    }
    signal.addEventListener('abort', drop, { once: true })
    return () => { signal.removeEventListener('abort', drop) }
  }, [actions, tab.id, tab.signal])

  const bindStage = useCallback((node: HTMLDivElement | null): void => {
    stageRef.current = node
    scrollportRef(node)
  }, [scrollportRef])

  useEffect(() => {
    const node = stageRef.current
    if (node === null) return undefined
    const measure = (): void => { setStageSize({ width: node.clientWidth, height: node.clientHeight }) }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [load])

  const image = load?.kind === 'ready' ? load.image : undefined
  const rotated = view.rotation === 90 || view.rotation === 270
  const displayWidth = image === undefined ? 0 : (rotated ? image.height : image.width)
  const displayHeight = image === undefined ? 0 : (rotated ? image.width : image.height)
  const fitScale = useMemo(() => {
    if (displayWidth === 0 || displayHeight === 0 || stageSize.width === 0) return 1
    return Math.min(
      (stageSize.width - STAGE_PADDING) / displayWidth,
      (stageSize.height - STAGE_PADDING) / displayHeight,
      1,
    )
  }, [displayWidth, displayHeight, stageSize])
  const scale = view.zoom === 'fit' ? fitScale : view.zoom

  const setZoom = useCallback((zoom: PagedZoom): void => { actions.zoom(tab.id, zoom) }, [actions, tab.id])

  /**
   * Zoom while holding the point under the pointer where it is.
   *
   * Without the anchor a wheel zoom walks the picture away from wherever the
   * reader was looking, which is the difference between a viewer and a preview.
   * @param next - the requested multiple, clamped before use.
   * @param anchor - viewport coordinates to hold steady, when the reader pointed at one.
   */
  const zoomTo = useCallback((next: number, anchor?: { x: number; y: number }): void => {
    const clamped = clampZoom(next)
    const node = stageRef.current
    if (node !== null && anchor !== undefined && scale > 0) {
      const bounds = node.getBoundingClientRect()
      const ratio = clamped / scale
      const offsetX = anchor.x - bounds.left
      const offsetY = anchor.y - bounds.top
      pendingScroll.current = {
        left: (node.scrollLeft + offsetX) * ratio - offsetX,
        top: (node.scrollTop + offsetY) * ratio - offsetY,
      }
    }
    setZoom(clamped)
  }, [scale, setZoom])

  // The live scale and zoom entry point, read by the native wheel listener,
  // which React cannot attach as non-passive through a prop.
  const liveZoom = useRef({ scale, zoomTo })
  liveZoom.current = { scale, zoomTo }

  useEffect(() => {
    const node = stageRef.current
    if (node === null || image === undefined) return undefined
    const onWheel = (event: WheelEvent): void => {
      // A plain wheel belongs to the stage's scrolling; the modifier is what
      // asks for zoom, so a reader scrolling a tall image still scrolls it.
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const live = liveZoom.current
      live.zoomTo(event.deltaY < 0 ? live.scale * ZOOM_STEP : live.scale / ZOOM_STEP, { x: event.clientX, y: event.clientY })
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => { node.removeEventListener('wheel', onWheel) }
  }, [image])

  // A zoom computed from a pointer position is only correct once the DOM has
  // the new size, so the scroll lands in the commit that follows it.
  useEffect(() => {
    const node = stageRef.current
    const pending = pendingScroll.current
    if (node === null || pending === undefined) return
    pendingScroll.current = undefined
    node.scrollLeft = pending.left
    node.scrollTop = pending.top
  })

  /** Pointer handling for both gestures: dragging pans, releasing ends it. */
  const pointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const node = stageRef.current
    if (node === null) return
    if (event.type === 'pointerdown') {
      if (event.button !== 0 || !panPossible(node)) return
      pan.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop }
      node.setPointerCapture(event.pointerId)
      setDragging(true)
      return
    }
    if (event.type === 'pointermove') {
      const started = pan.current
      if (started === undefined) return
      node.scrollLeft = started.left - (event.clientX - started.x)
      node.scrollTop = started.top - (event.clientY - started.y)
      return
    }
    if (pan.current === undefined) return
    pan.current = undefined
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
    setDragging(false)
  }

  if (data === undefined) {
    return <div className={css.status} role="alert"><span>{t('failure.notImage')}</span></div>
  }
  if (load?.data !== data) {
    return (
      <div className={css.status} role="status">
        <span className={css.spinner} aria-hidden="true" />
        <span>{t('loading')}</span>
      </div>
    )
  }
  if (load.kind === 'failed') {
    const notice = failureNotice(load.error, t)
    return (
      <div className={css.status} role="alert" data-image-failure>
        <div className={css.explain}>
          {notice.title === undefined
            ? null
            : <p className={css.explainTitle} data-image-failure-format>{notice.title}</p>}
          <p className={css.explainBody}>{notice.body}</p>
        </div>
        {notice.retry && (
          <button type="button" className={css.retry} onClick={() => { setAttempt(value => value + 1) }}>
            {t('retry')}
          </button>
        )}
      </div>
    )
  }

  const shown = load.image
  const rotateTo = (rotation: 0 | 90 | 180 | 270): void => { actions.rotation(tab.id, rotation) }
  return (
    <div className={css.preview} data-image-preview>
      <div className={css.bar}>
        <span className={css.caption} data-image-caption>
          {`${shown.width} × ${shown.height} · ${shown.format.name} · ${formatByteSize(shown.byteLength)}`}
        </span>
        <button type="button" className={css.tool} aria-label={t('rotateLeft')} data-image-rotate-left onClick={() => { rotateTo(((view.rotation + 270) % 360) as 0 | 90 | 180 | 270) }}>⟲</button>
        <button type="button" className={css.tool} aria-label={t('rotateRight')} data-image-rotate-right onClick={() => { rotateTo(((view.rotation + 90) % 360) as 0 | 90 | 180 | 270) }}>⟳</button>
        <button type="button" className={css.tool} aria-label={t('rotateReset')} disabled={view.rotation === 0} data-image-rotate-reset onClick={() => { rotateTo(0) }}>{'0°'}</button>
        <button type="button" className={css.tool} aria-label={t('zoomOut')} data-image-zoom-out onClick={() => { zoomTo(scale / ZOOM_STEP) }}>−</button>
        <button type="button" className={css.tool} aria-pressed={view.zoom === 'fit'} aria-label={t('zoomFit')} data-image-zoom-fit onClick={() => { setZoom('fit') }}>
          {t('zoomLevel', { percent: Math.round(scale * 100) })}
        </button>
        <button type="button" className={css.tool} aria-label={t('zoomActual')} data-image-zoom-actual onClick={() => { zoomTo(1) }}>{'1:1'}</button>
        <button type="button" className={css.tool} aria-label={t('zoomIn')} data-image-zoom-in onClick={() => { zoomTo(scale * ZOOM_STEP) }}>＋</button>
      </div>
      <div
        ref={bindStage}
        className={dragging ? `${css.stage} ${css.panning}` : css.stage}
        tabIndex={0}
        role="group"
        aria-label={t('stageLabel')}
        data-image-stage
        onPointerDown={pointer}
        onPointerMove={pointer}
        onPointerUp={pointer}
        onPointerCancel={pointer}
        onDoubleClick={(event) => {
          // The pointer's own double-click gesture: fitted shows actual size,
          // anything else returns to fitted.
          const fitted = Math.abs(scale - fitScale) < 0.001
          if (fitted) zoomTo(1, { x: event.clientX, y: event.clientY })
          else setZoom('fit')
        }}
        onKeyDown={(event) => {
          const node = stageRef.current
          if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            zoomTo(scale * ZOOM_STEP)
          } else if (event.key === '-') {
            event.preventDefault()
            zoomTo(scale / ZOOM_STEP)
          } else if (event.key === '0') {
            event.preventDefault()
            setZoom('fit')
          } else if (node !== null && event.key.startsWith('Arrow')) {
            // Arrow keys pan a picture that is larger than the stage; a fitted
            // one has nothing to pan, so the key stays with the browser.
            const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
            const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            if (!panPossible(node)) return
            if (horizontal && node.scrollWidth <= node.clientWidth) return
            if (!horizontal && node.scrollHeight <= node.clientHeight) return
            event.preventDefault()
            const delta = back ? -PAN_STEP : PAN_STEP
            if (horizontal) node.scrollLeft += delta
            else node.scrollTop += delta
          }
        }}
      >
        <div
          className={css.canvas}
          data-image-canvas
          style={{
            width: `${displayWidth * scale}px`,
            height: `${displayHeight * scale}px`,
          }}
        >
          <div
            className={css.scaled}
            data-image-scale
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <img
              src={shown.url}
              alt={t('stage', { name: fileName })}
              className={css.image}
              data-image-element
              draggable={false}
              decoding="async"
              referrerPolicy="no-referrer"
              style={{
                width: `${shown.width}px`,
                height: `${shown.height}px`,
                transform: `rotate(${view.rotation}deg)`,
                transformOrigin: 'top left',
                // Phone photos carry their orientation as EXIF rather than in
                // the pixels, so the browser is told to honour it, and the
                // dimensions above are the upright pair for the same reason.
                imageOrientation: 'from-image',
                ...(view.rotation === 90 ? { marginLeft: `${shown.height}px` } : {}),
                ...(view.rotation === 180 ? { marginLeft: `${shown.width}px`, marginTop: `${shown.height}px` } : {}),
                ...(view.rotation === 270 ? { marginTop: `${shown.width}px` } : {}),
              }}
            />
          </div>
        </div>
      </div>
      <dl className={css.metadata} aria-label={t('metadata')} data-image-metadata>
        <div><dt>{t('dimension')}</dt><dd>{`${shown.width} × ${shown.height}`}</dd></div>
        <div><dt>{t('format')}</dt><dd>{shown.format.name}</dd></div>
        <div><dt>{t('fileSize')}</dt><dd>{formatByteSize(shown.byteLength)}</dd></div>
        {shown.dpi === undefined ? null : (
          <div><dt>{t('resolution')}</dt><dd>{t('resolutionValue', { x: Math.round(shown.dpi.x), y: Math.round(shown.dpi.y) })}</dd></div>
        )}
        <div><dt>{t('animated')}</dt><dd>{shown.format.animatable ? t('yes') : t('no')}</dd></div>
      </dl>
    </div>
  )
}
