/**
 * The PowerPoint preview body: a slide rail beside the selected slide.
 *
 * The document owner delivers complete package bytes; everything below the
 * toolbar is this renderer's own. Parsing happens once per byte identity, and
 * the parsed deck — including the Blob URLs its pictures use — is released with
 * the effect that created it, so switching files or closing the tab cannot leak
 * media. Thumbnails mount lazily through one shared IntersectionObserver, so a
 * hundred-slide deck keeps one slide's element tree alive at a time.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { parsePptx, PptxParseError } from './pptx/deck.ts'
import type { ParsedPptx } from './pptx/deck.ts'
import type { PptxDeck, PptxShape, PptxSlide } from './pptx/model.ts'
import { applyTextEdits, buildEditedPackage } from './editor.ts'
import { SlideCanvas } from './render/SlideCanvas.tsx'
import { DEFAULT_PAGED_VIEW, type PagedViewStore, type PagedZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { SdkworkPptxPreviewKey } from './locales.ts'
import css from './PptxBody.module.css'

/** Width of one rail thumbnail in CSS pixels. */
const THUMBNAIL_WIDTH = 140
/** Padding the stage keeps around the fitted slide, in CSS pixels. */
const STAGE_PADDING = 32
/** Zoom bounds and the step each press applies. */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
/** The step one Ctrl+wheel notch applies; finer than the buttons, like Office. */
const WHEEL_ZOOM_STEP = 1.1
/** Distance beyond the rail's viewport a lazy thumbnail starts mounting, in pixels. */
const THUMBNAIL_MARGIN = '600px 0px'

/** Per-thumbnail visibility requests, keyed by the observed frame element. */
const visibilityCallbacks = new WeakMap<Element, () => void>()

/**
 * Whether this browser can drive the lazy thumbnail mount. Read at call time,
 * so an environment that defines the constructor late still gets lazy mounts.
 * @returns true when IntersectionObserver exists.
 */
function observerSupported(): boolean {
  return typeof IntersectionObserver === 'function'
}

/** Standard document props plus the PowerPoint dictionary and viewing store. */
export type PptxBodyProps =
  & DocumentPreviewProps
  & PropsLocale<'sdkworkPptxPreview'>
  & PropsStore<PagedViewStore>

/** A parsed deck or the reason it could not be parsed. */
type LoadState =
  | { readonly kind: 'ready'; readonly data: Uint8Array<ArrayBuffer>; readonly parsed: ParsedPptx }
  | { readonly kind: 'failed'; readonly data: Uint8Array<ArrayBuffer>; readonly error: unknown }

/**
 * Turn a parse failure into the sentence the reader needs.
 * @param error - the thrown value.
 * @param t - the namespace translator.
 * @returns the localized explanation.
 */
function failureText(error: unknown, t: PptxBodyProps['t']): string {
  if (error instanceof PptxParseError) {
    if (error.code === 'not-a-package') return t('failure.notPackage')
    if (error.code === 'legacy-binary') return t('failure.legacy')
    // The remaining code is the only one left in the union.
    return t('failure.noPresentation')
  }
  return t('failure.generic', { message: error instanceof Error ? error.message : String(error) })
}

/** Clamp a zoom multiple into the supported range. */
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/** Props one rail thumbnail takes. */
interface RailItemProps {
  readonly slide: PptxSlide
  readonly deck: PptxDeck
  readonly width: number
  readonly height: number
  readonly selected: boolean
  /** Label appended for a slide the presentation marks hidden. */
  readonly hiddenLabel: string | undefined
  readonly select: (index: number) => void
  /** The shared lazy-mount observer, or null before the rail mounts. */
  readonly observer: IntersectionObserver | null
}

/**
 * One rail thumbnail.
 *
 * The slide canvas mounts on first approach: until the shared observer reports
 * the frame near the rail's viewport, the item paints an empty slide-sized
 * frame. Without IntersectionObserver support every canvas mounts, as before.
 * @param props - the slide, its frame geometry, selection state, and observer.
 * @returns the thumbnail button.
 */
const RailItem = memo(function RailItem(props: RailItemProps): ReactNode {
  const { slide, deck, width, height, selected, hiddenLabel, select, observer } = props
  const supported = observerSupported()
  const [visible, setVisible] = useState(!supported)
  const frameRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const node = frameRef.current
    if (node === null || observer === null) return undefined
    visibilityCallbacks.set(node, () => { setVisible(true) })
    observer.observe(node)
    return () => {
      observer.unobserve(node)
      visibilityCallbacks.delete(node)
    }
  }, [observer])
  const label = hiddenLabel === undefined ? slide.name : `${slide.name} · ${hiddenLabel}`
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-current={selected}
      aria-label={label}
      className={css.railItem}
      data-pptx-thumbnail={slide.index}
      onClick={() => { select(slide.index) }}
    >
      <span
        ref={frameRef}
        className={css.railFrame}
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        {visible && (
          <span
            className={css.railCanvas}
            data-pptx-thumbnail-canvas={slide.index}
            style={{
              width: `${deck.width}px`,
              height: `${deck.height}px`,
              transform: `scale(${width / deck.width})`,
            }}
          >
            <MemoSlideCanvas slide={slide} deck={deck} />
          </span>
        )}
      </span>
      <span className={css.railCaption}>{slide.index}</span>
      {hiddenLabel !== undefined && <span className={css.hiddenMark}>{hiddenLabel}</span>}
    </button>
  )
})

/** The selected slide's canvas, re-rendered only when its slide or deck changes. */
const MemoSlideCanvas = memo(SlideCanvas)

/**
 * The PowerPoint type's body, registered under `sidebar.right.tab.document`.
 * @param props - package bytes and the framework-owned tab, store, and locale seats.
 * @returns the slide rail with the selected slide, or a progress or failure line.
 */
export function PptxBody(props: PptxBodyProps): ReactNode {
  const { tab } = props.useTabInfo()
  const view = props.useStore(state => state.byTab[tab.id] ?? DEFAULT_PAGED_VIEW)
  const data = props.content.kind === 'bytes' ? props.content.data : undefined
  const [load, setLoad] = useState<LoadState>()
  const [attempt, setAttempt] = useState(0)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [observer, setObserver] = useState<IntersectionObserver | null>(null)
  const [textEdits, setTextEdits] = useState<ReadonlyMap<string, readonly string[]>>(new Map())
  const [notesEdits, setNotesEdits] = useState<ReadonlyMap<string, string>>(new Map())
  const [selectedShapeId, setSelectedShapeId] = useState<string | undefined>(undefined)
  const [editingShapeId, setEditingShapeId] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  type Snapshot = { texts: ReadonlyMap<string, readonly string[]>; notes: ReadonlyMap<string, string> }
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const pushHistory = useCallback((snapshot: Snapshot): void => {
    undoStack.current.push(snapshot)
    redoStack.current = []
  }, [])
  const stageRef = useRef<HTMLDivElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const scaleRef = useRef(1)
  const zoomAnchor = useRef<{ scale: number; x: number; y: number } | undefined>(undefined)
  const { actions, t, scrollportRef } = props
  const labels = useMemo(
    () => ({
      slideName: (index: number) => t('slide', { index }),
      unsupportedFrame: () => t('unsupportedFrame'),
      missingImage: () => t('missingImage'),
    }),
    [t],
  )

  useEffect(() => {
    if (data === undefined || tab.signal.aborted) return undefined
    let disposed = false
    let parsed: ParsedPptx | undefined
    setLoad(undefined)
    void parsePptx(data, labels).then(
      (result) => {
        if (disposed) {
          result.dispose()
          return
        }
        parsed = result
        setLoad({ kind: 'ready', data, parsed: result })
      },
      (error: unknown) => {
        if (!disposed) setLoad({ kind: 'failed', data, error })
      },
    )
    return () => {
      disposed = true
      parsed?.dispose()
    }
  }, [data, tab.signal, labels, attempt])

  // The stage is the scrollport the document owner restores between mounts, so
  // it is measured and bound through one callback rather than two refs.
  const bindStage = useCallback((node: HTMLDivElement | null): void => {
    stageRef.current = node
    scrollportRef(node)
  }, [scrollportRef])

  // The rail owns the shared observer: rootless observers cannot see which
  // thumbnails the rail's own scrolling has clipped away.
  const observerCleanup = useRef<() => void>(() => { })
  const bindRail = useCallback((node: HTMLDivElement | null): void => {
    railRef.current = node
    observerCleanup.current()
    observerCleanup.current = () => { }
    if (node === null || !observerSupported()) {
      setObserver(null)
      return
    }
    const shared = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        visibilityCallbacks.get(entry.target)?.()
        shared.unobserve(entry.target)
      }
    }, { root: node, rootMargin: THUMBNAIL_MARGIN })
    observerCleanup.current = (): void => { shared.disconnect() }
    setObserver(shared)
  }, [])

  useEffect(() => {
    const node = stageRef.current
    if (node === null) return undefined
    const measure = (): void => {
      setStageSize({ width: node.clientWidth, height: node.clientHeight })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [load])

  const deck = load?.kind === 'ready' ? load.parsed.deck : undefined
  const fitScale = useMemo(() => {
    if (deck === undefined || stageSize.width === 0 || stageSize.height === 0) return 1
    return clampZoom(Math.min(
      (stageSize.width - STAGE_PADDING) / deck.width,
      (stageSize.height - STAGE_PADDING) / deck.height,
    ))
  }, [deck, stageSize])
  const scale = deck === undefined ? 1 : view.zoom === 'fit' ? fitScale : view.zoom
  scaleRef.current = scale
  const slideCount = deck?.slides.length ?? 0
  const selected = Math.min(Math.max(1, view.index), Math.max(1, slideCount))
  const current: PptxSlide | undefined = deck?.slides[selected - 1]
  // Stable identity so memoized rail items skip re-renders while stepping.
  const setSlide = useCallback((next: number): void => {
    actions.index(tab.id, Math.min(Math.max(1, next), Math.max(1, slideCount)))
    // A slide the reader has left holds neither the selection nor an edit.
    setSelectedShapeId(undefined)
    setEditingShapeId(undefined)
  }, [actions, tab.id, slideCount])
  const setZoom = (zoom: PagedZoom): void => { actions.zoom(tab.id, zoom) }
  const edited = useCallback(
    (slide: PptxSlide): PptxSlide => applyTextEdits(slide, textEdits),
    [textEdits],
  )
  const commitText = useCallback((shapeId: string, lines: readonly string[]): void => {
    pushHistory({ texts: textEdits, notes: notesEdits })
    const slide = deck?.slides[selected - 1]
    if (slide?.partName === undefined) return
    const next = new Map(textEdits)
    next.set(`${slide.partName}#${shapeId}`, lines)
    setTextEdits(next)
    setEditingShapeId(undefined)
  }, [deck, selected, textEdits, notesEdits, pushHistory])
  const cancelText = useCallback((): void => { setEditingShapeId(undefined) }, [])
  const selectShape = useCallback((shape: PptxShape): void => {
    setSelectedShapeId(shape.id)
  }, [])
  const beginText = useCallback((shape: PptxShape): void => {
    if (shape.kind === 'shape' && shape.text !== undefined) {
      setSelectedShapeId(shape.id)
      setEditingShapeId(shape.id)
    }
  }, [])
  const saveCopy = useCallback(async (): Promise<void> => {
    if (data === undefined || saving) return
    setSaving(true)
    try {
      const bytes = await buildEditedPackage(data, { texts: textEdits, notes: notesEdits })
      const url = URL.createObjectURL(new Blob([bytes.slice()], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'presentation.pptx'
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setSaving(false)
    }
  }, [data, notesEdits, saving, textEdits])
  const applySnapshot = useCallback((snapshot: Snapshot | undefined): void => {
    if (snapshot === undefined) return
    setTextEdits(snapshot.texts)
    setNotesEdits(snapshot.notes)
  }, [])
  const undo = useCallback((): void => {
    const previous = undoStack.current.pop()
    if (previous === undefined) return
    redoStack.current.push({ texts: textEdits, notes: notesEdits })
    applySnapshot(previous)
  }, [textEdits, notesEdits, applySnapshot])
  const redo = useCallback((): void => {
    const next = redoStack.current.pop()
    if (next === undefined) return
    undoStack.current.push({ texts: textEdits, notes: notesEdits })
    applySnapshot(next)
  }, [textEdits, notesEdits, applySnapshot])

  // Ctrl+wheel zooms around the viewport centre. The listener is native and
  // non-passive because React registers wheel handlers passively, where
  // preventDefault cannot stop the browser's own page zoom.
  useEffect(() => {
    const node = stageRef.current
    if (node === null) return undefined
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const scale = scaleRef.current
      zoomAnchor.current = {
        scale,
        x: node.scrollLeft + node.clientWidth / 2,
        y: node.scrollTop + node.clientHeight / 2,
      }
      const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP
      setZoom(clampZoom(scale * factor))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => { node.removeEventListener('wheel', onWheel) }
  }, [load])

  // Keep the viewport centre anchored across a wheel zoom: after the canvas
  // resizes, restore the point that sat at the centre before the step.
  useEffect(() => {
    const anchor = zoomAnchor.current
    const node = stageRef.current
    if (anchor === undefined || node === null || scale === anchor.scale) return
    zoomAnchor.current = undefined
    const ratio = scale / anchor.scale
    node.scrollLeft = anchor.x * ratio - node.clientWidth / 2
    node.scrollTop = anchor.y * ratio - node.clientHeight / 2
  }, [scale])

  // Stepping from the toolbar or keyboard keeps the selected thumbnail in view.
  useEffect(() => {
    const item = railRef.current?.querySelector(`[data-pptx-thumbnail="${selected}"]`)
    if (item !== null && typeof item?.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [selected])

  if (data === undefined) {
    return <p className={css.status} role="alert"><span className={css.statusLine}>{t('failure.notPackage')}</span></p>
  }
  if (load?.data !== data) {
    return (
      <div className={css.status}>
        <span className={css.spinner} aria-hidden="true" />
        <span className={css.statusLine}>{t('loading')}</span>
      </div>
    )
  }
  if (load.kind === 'failed') {
    return (
      <div className={css.status} role="alert">
        <span className={css.statusLine}>{failureText(load.error, t)}</span>
        <button type="button" className={css.retry} onClick={() => { setAttempt(value => value + 1) }}>
          {t('retry')}
        </button>
      </div>
    )
  }

  const { deck: parsed } = load.parsed
  const thumbnailScale = THUMBNAIL_WIDTH / parsed.width
  const thumbnailHeight = parsed.height * thumbnailScale
  const hiddenLabel = t('hiddenSlide')
  return (
    <div className={css.preview} data-pptx-preview>
      <div className={css.rail} role="listbox" aria-label={t('slideList')} data-pptx-rail ref={bindRail}>
        {parsed.slides.map((source: PptxSlide) => {
          const slide = edited(source)
          return (
            <RailItem
              key={slide.index}
              slide={slide}
              deck={parsed}
              width={THUMBNAIL_WIDTH}
              height={thumbnailHeight}
              selected={slide.index === selected}
              hiddenLabel={slide.hidden === true ? hiddenLabel : undefined}
              select={setSlide}
              observer={observer}
            />
          )
        })}
      </div>
      <div className={css.main}>
        <div className={css.bar}>
          <button
            type="button"
            className={`${css.tool} ${css.saveTool}`}
            aria-label={t('save')}
            title={t('save')}
            data-pptx-save
            disabled={saving}
            onClick={() => { void saveCopy() }}
          >
            ⬇
          </button>
          <span className={css.counter} data-pptx-counter>{`${selected} / ${slideCount}`}</span>
          <button
            type="button"
            className={css.tool}
            aria-label={t('previous')}
            title={t('previous')}
            disabled={selected <= 1}
            data-pptx-previous
            onClick={() => { setSlide(selected - 1) }}
          >
            ‹
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('next')}
            title={t('next')}
            disabled={selected >= slideCount}
            data-pptx-next
            onClick={() => { setSlide(selected + 1) }}
          >
            ›
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomOut')}
            title={t('zoomOut')}
            data-pptx-zoom-out
            onClick={() => { setZoom(clampZoom(scale / ZOOM_STEP)) }}
          >
            −
          </button>
          <span className={css.zoomLevel} data-pptx-zoom-level>
            {t('zoomLevel', { percent: Math.round(scale * 100) })}
          </span>
          <button
            type="button"
            className={css.tool}
            aria-pressed={view.zoom === 'fit'}
            aria-label={t('zoomFit')}
            title={t('zoomFit')}
            data-pptx-zoom-fit
            onClick={() => { setZoom('fit') }}
          >
            ⤢
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomActual')}
            title={t('zoomActual')}
            data-pptx-zoom-actual
            onClick={() => { setZoom(1) }}
          >
            {'1:1'}
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomIn')}
            title={t('zoomIn')}
            data-pptx-zoom-in
            onClick={() => { setZoom(clampZoom(scale * ZOOM_STEP)) }}
          >
            ＋
          </button>
        </div>
        <div
          ref={bindStage}
          className={css.stage}
          tabIndex={0}
          data-pptx-stage
          onClick={(event) => {
            // An internal slide jump navigates this preview instead of the href.
            const target = event.target as HTMLElement
            const anchor = target.closest('a[data-pptx-slide-jump]')
            if (anchor !== null) {
              event.preventDefault()
              const index = Number(anchor.getAttribute('data-pptx-slide-jump'))
              if (Number.isInteger(index) && index >= 1) setSlide(index)
              return
            }
            // A press on the slide's own paper takes the selection off, the way
            // PowerPoint's canvas does; a press on a shape keeps its own.
            if (target.closest('[data-pptx-shape]') === null) setSelectedShapeId(undefined)
          }}
          onKeyDown={(event) => {
            // `Escape` ends the open text edit first, then takes the selection
            // off — the two steps PowerPoint's own canvas walks through.
            if (event.key === 'Escape') {
              if (editingShapeId !== undefined) setEditingShapeId(undefined)
              else if (selectedShapeId !== undefined) setSelectedShapeId(undefined)
              return
            }
            if (editingShapeId !== undefined) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
              event.preventDefault()
              setSlide(selected + 1)
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
              event.preventDefault()
              setSlide(selected - 1)
            } else if (event.key === 'Home') {
              event.preventDefault()
              setSlide(1)
            } else if (event.key === 'End') {
              event.preventDefault()
              setSlide(slideCount)
            } else if (event.key === '+' || event.key === '=') {
              event.preventDefault()
              setZoom(clampZoom(scale * ZOOM_STEP))
            } else if (event.key === '-' || event.key === '_') {
              event.preventDefault()
              setZoom(clampZoom(scale / ZOOM_STEP))
            } else if (event.key === '0') {
              event.preventDefault()
              setZoom(1)
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
              event.preventDefault()
              undo()
            } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
              event.preventDefault()
              redo()
            }
          }}
        >
          {current !== undefined && (
            <div
              className={css.canvas}
              style={{ width: `${parsed.width * scale}px`, height: `${parsed.height * scale}px` }}
              role="img"
              aria-label={t('slideCanvas', { index: selected })}
              data-pptx-canvas
            >
              <div
                style={{
                  width: `${parsed.width}px`,
                  height: `${parsed.height}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <MemoSlideCanvas
                  slide={edited(current)}
                  deck={parsed}
                  zoom={scale}
                  selectedShapeId={selectedShapeId}
                  editingShapeId={editingShapeId}
                  onShapeSelect={selectShape}
                  onShapeEdit={beginText}
                  onTextCommit={commitText}
                  onTextCancel={cancelText}
                />
              </div>
            </div>
          )}
        </div>
        {current !== undefined && (
          <div className={css.notes} data-pptx-notes>
            <span className={css.notesTitle}>{t('notes')}</span>
            <textarea
              className={css.notesInput}
              data-pptx-notes-input
              value={notesEdits.get(current.partName ?? '') ?? current.notes.join('\n')}
              placeholder={t('notesPlaceholder')}
              onChange={(event) => {
                pushHistory({ texts: textEdits, notes: notesEdits })
                const next = new Map(notesEdits)
                next.set(current.partName ?? '', event.target.value)
                setNotesEdits(next)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** Re-exported so a consumer naming this renderer's keys can reach them. */
export type { SdkworkPptxPreviewKey }
