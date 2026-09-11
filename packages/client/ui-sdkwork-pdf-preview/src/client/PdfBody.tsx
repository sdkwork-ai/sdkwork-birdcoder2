/**
 * The PDF preview body: a page rail beside a continuous, lazily rendered strip.
 *
 * The document owner delivers complete file bytes; everything below the
 * toolbar is this renderer's own. One worker and one document are owned per
 * byte identity and released with the effect that opened them, so switching
 * files or closing the tab cannot leave a worker or a Blob URL behind. The
 * strip lays every page out in reading order, draws the pages near the
 * viewport, and keeps the rail, the counter, and the find flow in step with
 * wherever the reader has scrolled.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type UIEvent as ReactUIEvent, type ReactNode } from 'react'
import { DEFAULT_PAGED_VIEW } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewStore, PagedZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { openPdf, PdfOpenError } from './pdf/runtime.ts'
import type { PdfDocument } from './pdf/runtime.ts'
import { CSS_UNITS_PER_POINT, renderPdfThumbnail } from './pdf/page.ts'
import { PdfTextIndex } from './pdf/search.ts'
import type { PdfMatch } from './pdf/search.ts'
import { PageView } from './PageView.tsx'
import type { PageGeometry } from './PageView.tsx'
import css from './PdfBody.module.css'

/** Padding the stage keeps around a fitted page, in CSS pixels. */
const STAGE_PADDING = 32
/** Zoom bounds and the step each press applies. */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 6
const ZOOM_STEP = 1.25
/** Wheel travel that equals one zoom step; a standard pixel-mode notch is 100. */
const WHEEL_STEP_DELTA = 100
/** The rail item's content width, which thumbnails are scaled to. */
const RAIL_WIDTH = 128
/** Point size assumed for a page whose own size has not been read yet. */
const DEFAULT_POINT_SIZE = { width: 612, height: 792 }
/** Gap between the strip's page frames and the stage edge, in CSS pixels. */
const FRAME_MARGIN = 8

/** Standard document props plus the PDF dictionary and viewing store. */
export type PdfBodyProps =
  & DocumentPreviewProps
  & PropsLocale<'sdkworkPdfPreview'>
  & PropsStore<PagedViewStore>

/** An opened document or the reason it could not be opened. */
type LoadState =
  | { readonly kind: 'ready'; readonly data: Uint8Array<ArrayBuffer>; readonly document: PdfDocument }
  | { readonly kind: 'failed'; readonly data: Uint8Array<ArrayBuffer>; readonly error: unknown }

/**
 * Turn an open failure into the sentence the reader needs.
 * @param error - the thrown value.
 * @param t - the namespace translator.
 * @returns the localized explanation.
 */
function failureText(error: unknown, t: PdfBodyProps['t']): string {
  if (error instanceof PdfOpenError) {
    switch (error.kind) {
      case 'worker': return t('failure.worker')
      case 'invalid': return t('failure.notPdf')
      case 'aborted': return t('failure.generic', { message: error.message })
      // The remaining kinds are the only ones left in the union; a password
      // failure never reaches a render — the open refuses the document first.
      default: return t('failure.unsupported')
    }
  }
  return t('failure.generic', { message: error instanceof Error ? error.message : String(error) })
}

/** Clamp a zoom multiple into the supported range. */
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/**
 * One rail thumbnail, drawn when it scrolls into view and released when it
 * leaves, so a long document never keeps every page's raster alive.
 * @param props - the document, page, and selection state.
 * @returns the thumbnail button.
 */
function PageThumb({ document, pageNumber, label, active, onSelect }: {
  readonly document: PdfDocument
  readonly pageNumber: number
  readonly label: string
  readonly active: boolean
  readonly onSelect: () => void
}): ReactNode {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (canvas === null) return undefined
    // Each draw owns a fresh controller: release aborts the render that is in
    // flight when the page leaves, and must never poison the next entry — a
    // reused signal stays aborted and would blank the thumbnail forever.
    let controller: AbortController | undefined
    const draw = (): void => {
      controller = new AbortController()
      void renderPdfThumbnail(document, pageNumber, canvas, RAIL_WIDTH, controller.signal)
        .catch(() => { canvas.removeAttribute('width') })
    }
    const release = (): void => {
      controller?.abort()
      canvas.removeAttribute('width')
      canvas.removeAttribute('height')
    }
    if (typeof IntersectionObserver === 'undefined') {
      draw()
      return () => { controller?.abort() }
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) draw()
        else release()
      }
    })
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      controller?.abort()
    }
  }, [canvas, document, pageNumber])
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      aria-current={active}
      aria-label={label}
      className={css.railItem}
      data-pdf-page-tab={pageNumber}
      onClick={onSelect}
    >
      <canvas ref={setCanvas} className={css.railCanvas} />
      <span className={css.railNumber}>{label}</span>
    </button>
  )
}

/** The point size assumed for frames until a page reports its own. */
type PointSize = { readonly width: number; readonly height: number }

/**
 * The PDF type's body, registered under `sidebar.right.tab.document`.
 * @param props - file bytes and the framework-owned tab, store, and locale seats.
 * @returns the page rail beside the continuous strip, or a progress or failure line.
 */
export function PdfBody(props: PdfBodyProps): ReactNode {
  const { tab } = props.useTabInfo()
  const view = props.useStore(state => state.byTab[tab.id] ?? DEFAULT_PAGED_VIEW)
  const data = props.content.kind === 'bytes' ? props.content.data : undefined
  const [load, setLoad] = useState<LoadState>()
  const [attempt, setAttempt] = useState(0)
  const [unlock, setUnlock] = useState<string>()
  const [unlockDraft, setUnlockDraft] = useState('')
  const [rotation, setRotation] = useState(0)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [textIndex, setTextIndex] = useState<PdfTextIndex>()
  const [searchQuery, setSearchQuery] = useState('')
  const [matches, setMatches] = useState<readonly PdfMatch[]>([])
  const [activeMatch, setActiveMatch] = useState(0)
  const [pageDraft, setPageDraft] = useState<string>()
  const [layoutSize, setLayoutSize] = useState<PointSize>()
  const [sizes, setSizes] = useState<Readonly<Partial<Record<number, PointSize>>>>({})
  const stageRef = useRef<HTMLDivElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const pageFrames = useRef(new Map<number, HTMLDivElement>())
  const scrollAnchor = useRef<number | undefined>(undefined)
  const [scrollTarget, setScrollTarget] = useState<number>()
  const { actions, t, scrollportRef } = props

  // A new file starts unlocked; the unlock state belongs to one byte identity.
  useEffect(() => {
    setUnlock(undefined)
    setUnlockDraft('')
  }, [data])

  useEffect(() => {
    if (data === undefined || tab.signal.aborted) return undefined
    let disposed = false
    const session = openPdf(data, tab.signal, (error) => {
      if (!disposed) setLoad({ kind: 'failed', data, error })
    }, { password: unlock })
    setLoad(undefined)
    void session.document.then(
      (document) => { if (!disposed) setLoad({ kind: 'ready', data, document }) },
      (error: unknown) => { if (!disposed) setLoad({ kind: 'failed', data, error }) },
    )
    return () => {
      disposed = true
      void session.dispose()
    }
  }, [data, tab.signal, attempt, unlock])

  const document = load?.kind === 'ready' ? load.document : undefined
  const pageCount = document?.numPages ?? 0
  const selected = Math.min(Math.max(1, view.index), Math.max(1, pageCount))
  const active = matches[activeMatch]

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

  const fitScale = useMemo(() => {
    const base = sizes[1] ?? layoutSize ?? DEFAULT_POINT_SIZE
    if (stageSize.width === 0 || stageSize.height === 0) return 1
    return Math.min(
      (stageSize.width - STAGE_PADDING) / (base.width * CSS_UNITS_PER_POINT),
      (stageSize.height - STAGE_PADDING) / (base.height * CSS_UNITS_PER_POINT),
    )
  }, [sizes, layoutSize, stageSize])
  const scale = view.zoom === 'fit' ? fitScale : view.zoom

  // Page 1's point size is the default frame geometry; every page reports its
  // own once drawn, so mixed-size documents correct themselves as they load.
  useEffect(() => {
    if (document === undefined) {
      setLayoutSize(undefined)
      setSizes({})
      return undefined
    }
    const controller = new AbortController()
    void document.getPage(1)
      .then((page) => {
        if (controller.signal.aborted) return
        const viewport = page.getViewport({ scale: 1 })
        setLayoutSize({ width: viewport.width, height: viewport.height })
      })
      .catch(() => {
        // The default point size applies when page 1 cannot be read.
      })
    return () => { controller.abort() }
  }, [document])

  // One text index per open document; a new document clears the search.
  useEffect(() => {
    setTextIndex(document === undefined ? undefined : new PdfTextIndex(document))
    setMatches([])
    setActiveMatch(0)
  }, [document])

  // Scan for the query across every page; the index caches what it has read,
  // so refining a query only re-reads pages the previous scan never reached.
  useEffect(() => {
    if (textIndex === undefined) {
      setMatches([])
      return undefined
    }
    if (searchQuery === '') {
      setMatches([])
      setActiveMatch(0)
      return undefined
    }
    const controller = new AbortController()
    void textIndex.find(searchQuery, controller.signal).then(
      (found) => {
        setMatches(found)
        setActiveMatch(0)
      },
      () => {
        // An aborted scan is the newer query's business; an unreadable page
        // makes the document quietly unsearchable rather than throwing.
        if (!controller.signal.aborted) setMatches([])
      },
    )
    return () => { controller.abort() }
  }, [searchQuery, textIndex])

  const setPage = (next: number): void => {
    scrollAnchor.current = undefined
    const page = Math.min(Math.max(1, next), Math.max(1, pageCount))
    setScrollTarget(page)
    actions.index(tab.id, page)
  }

  // A command-selected page scrolls to the strip's top once the strip exists;
  // scroll-derived page changes never set a target, and a target outliving a
  // dead strip is simply dropped on the next commit.
  useLayoutEffect(() => {
    if (scrollTarget === undefined) return
    const stage = stageRef.current
    if (stage === null) return
    const frame = pageFrames.current.get(scrollTarget)
    if (frame === undefined) {
      return
    }
    stage.scrollTop = Math.max(0, frame.offsetTop - FRAME_MARGIN)
    setScrollTarget(undefined)
  }, [scrollTarget, load, selected])

  // Runs after a zoom or rotation commit: the anchor's scroll ratio over the
  // strip maps onto the relaid-out height, so the reader stays in place.
  useLayoutEffect(() => {
    const anchor = scrollAnchor.current
    scrollAnchor.current = undefined
    const stage = stageRef.current
    if (anchor !== undefined && stage !== null) stage.scrollTop = anchor * stage.scrollHeight
  }, [scale, rotation, layoutSize])

  // The counter, the rail, and the find flow follow the page under the
  // viewport centre as the reader scrolls; the strip's scroll ratio is kept
  // current so zoom commands can anchor the viewport without re-reading it.
  const scrollRatio = useRef(0)
  const onStageScroll = (event: ReactUIEvent<HTMLDivElement>): void => {
    const stage = event.currentTarget
    scrollRatio.current = stage.scrollTop / Math.max(1, stage.scrollHeight)
    const center = stage.scrollTop + stage.clientHeight / 2
    let current = 1
    for (const [page, frame] of pageFrames.current) {
      if (frame.offsetTop <= center && page > current) current = page
    }
    if (selected !== current) actions.index(tab.id, current)
  }

  const setZoom = (zoom: PagedZoom): void => {
    scrollAnchor.current = scrollRatio.current
    actions.zoom(tab.id, zoom)
  }
  const zoomBy = (factor: number): void => { setZoom(clampZoom(scale * factor)) }

  useEffect(() => {
    const node = stageRef.current
    if (node === null) return undefined
    let accumulated = 0
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const travel = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY
      accumulated += travel
      while (Math.abs(accumulated) >= WHEEL_STEP_DELTA) {
        const direction = Math.sign(accumulated)
        accumulated -= direction * WHEEL_STEP_DELTA
        scrollRatio.current = node.scrollTop / Math.max(1, node.scrollHeight)
        scrollAnchor.current = scrollRatio.current
        // A negative delta is a wheel-up, which zooms in.
        actions.zoom(tab.id, clampZoom(scale * (direction < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)))
      }
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => { node.removeEventListener('wheel', onWheel) }
  }, [load, scale, actions, tab.id])

  // The selection helper ends when the press ends anywhere in the document;
  // the listener binds to the global document, not the opened PDF document.
  useEffect(() => {
    const release = (): void => {
      for (const node of globalThis.document.querySelectorAll('[data-selecting]')) {
        node.removeAttribute('data-selecting')
      }
    }
    globalThis.document.addEventListener('mouseup', release)
    return () => { globalThis.document.removeEventListener('mouseup', release) }
  }, [])

  const onStageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // Zoom keys work plain, matching the office family, and under Ctrl/Cmd,
    // matching desktop readers; arrows under a modifier stay with the browser.
    if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_' || event.key === '0') {
      event.preventDefault()
      if (event.key === '0') setZoom('fit')
      else if (event.key === '-' || event.key === '_') zoomBy(1 / ZOOM_STEP)
      else zoomBy(ZOOM_STEP)
      return
    }
    if (event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault()
      setPage(selected + 1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      setPage(selected - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setPage(1)
    } else if (event.key === 'End') {
      event.preventDefault()
      setPage(pageCount)
    }
  }

  const commitPageDraft = (): void => {
    if (pageDraft === undefined) return
    const parsed = Number.parseInt(pageDraft, 10)
    setPageDraft(undefined)
    if (Number.isNaN(parsed)) return
    setPage(parsed)
  }

  // Following the active match: a match on another page opens that page.
  useEffect(() => {
    if (activeMatch >= matches.length) return
    const match = matches[activeMatch]
    if (match.page === selected) return
    setPage(match.page)
  }, [matches, activeMatch, selected, pageCount, setPage])

  const registerFrame = useCallback((page: number, node: HTMLDivElement | null): void => {
    if (node === null) pageFrames.current.delete(page)
    else pageFrames.current.set(page, node)
  }, [])

  const onGeometry = useCallback((geometry: PageGeometry): void => {
    setSizes(previous => ({ ...previous, [geometry.page]: { width: geometry.width, height: geometry.height } }))
  }, [])

  const passwordLocked = load?.kind === 'failed' && load.error instanceof PdfOpenError && load.error.kind === 'password'
  const submitUnlock = (): void => {
    setUnlock(unlockDraft)
    setAttempt(value => value + 1)
  }

  if (data === undefined) {
    return <div className={css.status} role="alert"><span>{t('failure.notPdf')}</span></div>
  }
  if (load?.data !== data) {
    return (
      <div className={css.status}>
        <span className={css.spinner} aria-hidden="true" />
        <span>{t('loading')}</span>
      </div>
    )
  }
  if (load.kind === 'failed') {
    return (
      <div className={css.status} role="alert">
        <span>
          {passwordLocked
            ? unlock === undefined ? t('failure.password') : t('failure.passwordIncorrect')
            : failureText(load.error, t)}
        </span>
        {passwordLocked && (
          <form
            className={css.unlockForm}
            data-pdf-unlock
            onSubmit={(event) => { event.preventDefault(); submitUnlock() }}
          >
            <input
              type="password"
              className={css.unlockInput}
              aria-label={t('passwordLabel')}
              placeholder={t('passwordLabel')}
              autoComplete="off"
              value={unlockDraft}
              onChange={(event) => { setUnlockDraft(event.currentTarget.value) }}
              data-pdf-password
            />
            <span>
              <button type="submit" className={css.retry} data-pdf-unlock-submit>{t('unlock')}</button>
              {unlock !== undefined && (
                <button
                  type="button"
                  className={css.retry}
                  data-pdf-unlock-cancel
                  onClick={() => { setUnlock(undefined); setUnlockDraft('') }}
                >
                  {t('cancel')}
                </button>
              )}
            </span>
          </form>
        )}
        {!passwordLocked && (
          <button type="button" className={css.retry} onClick={() => { setAttempt(value => value + 1) }}>
            {t('retry')}
          </button>
        )}
      </div>
    )
  }

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1)
  return (
    <div className={css.preview} data-pdf-preview>
      <div className={css.rail} role="listbox" aria-label={t('pageList')} data-pdf-rail ref={railRef}>
        {pages.map(page => (
          <PageThumb
            key={page}
            document={load.document}
            pageNumber={page}
            label={t('page', { index: page })}
            active={page === selected}
            onSelect={() => { setPage(page) }}
          />
        ))}
      </div>
      <div className={css.main}>
        <div className={css.bar}>
          <span className={css.counter} data-pdf-counter>
            <input
              className={css.pageInput}
              inputMode="numeric"
              aria-label={t('pageJump')}
              value={pageDraft ?? `${selected}`}
              onChange={(event) => { setPageDraft(event.currentTarget.value) }}
              onFocus={(event) => { event.currentTarget.select() }}
              onBlur={commitPageDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitPageDraft()
                else if (event.key === 'Escape') setPageDraft(undefined)
              }}
              data-pdf-page-input
            />
            <span className={css.pageTotal}>{t('pageTotal', { total: pageCount })}</span>
            {/* Page changes are announced even though the entry is an input. */}
            <span aria-live="polite" className={css.visuallyHidden}>
              {t('counter', { index: selected, total: pageCount })}
            </span>
          </span>
          <button type="button" className={css.tool} aria-label={t('previous')} disabled={selected <= 1} data-pdf-previous onClick={() => { setPage(selected - 1) }}>‹</button>
          <button type="button" className={css.tool} aria-label={t('next')} disabled={selected >= pageCount} data-pdf-next onClick={() => { setPage(selected + 1) }}>›</button>
          <button type="button" className={css.tool} aria-label={t('rotateLeft')} data-pdf-rotate-left onClick={() => { setRotation(value => (value + 270) % 360) }}>⟲</button>
          <button type="button" className={css.tool} aria-label={t('rotateRight')} data-pdf-rotate-right onClick={() => { setRotation(value => (value + 90) % 360) }}>⟳</button>
          <button type="button" className={css.tool} aria-label={t('zoomOut')} data-pdf-zoom-out onClick={() => { zoomBy(1 / ZOOM_STEP) }}>−</button>
          <button type="button" className={css.tool} aria-pressed={view.zoom === 'fit'} aria-label={t('zoomFit')} data-pdf-zoom-fit onClick={() => { setZoom('fit') }}>
            {t('zoomLevel', { percent: Math.round(scale * 100) })}
          </button>
          <button type="button" className={css.tool} aria-label={t('zoomActual')} data-pdf-zoom-actual onClick={() => { setZoom(1) }}>{'1:1'}</button>
          <button type="button" className={css.tool} aria-label={t('zoomIn')} data-pdf-zoom-in onClick={() => { zoomBy(ZOOM_STEP) }}>＋</button>
          <input
            className={css.search}
            type="text"
            aria-label={t('search')}
            placeholder={t('search')}
            autoComplete="off"
            value={searchQuery}
            onChange={(event) => { setSearchQuery(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                const delta = event.shiftKey ? -1 : 1
                if (matches.length > 0) setActiveMatch((activeMatch + delta + matches.length) % matches.length)
              } else if (event.key === 'Escape') {
                setSearchQuery('')
              }
            }}
            data-pdf-search
          />
          {searchQuery !== '' && (
            matches.length > 0
              ? <span className={css.matchSummary} data-pdf-match-summary>{t('matchSummary', { index: activeMatch + 1, total: matches.length })}</span>
              : <span className={css.matchSummary} data-pdf-no-matches role="status">{t('noMatches')}</span>
          )}
          <button type="button" className={css.tool} aria-label={t('previousMatch')} disabled={matches.length === 0} data-pdf-match-previous onClick={() => { setActiveMatch((activeMatch - 1 + matches.length) % matches.length) }}>↑</button>
          <button type="button" className={css.tool} aria-label={t('nextMatch')} disabled={matches.length === 0} data-pdf-match-next onClick={() => { setActiveMatch((activeMatch + 1) % matches.length) }}>↓</button>
        </div>
        <div
          ref={bindStage}
          className={css.stage}
          tabIndex={0}
          data-pdf-stage
          onKeyDown={onStageKeyDown}
          onScroll={onStageScroll}
        >
          {textIndex !== undefined && pages.map((page) => {
            const size = sizes[page] ?? layoutSize ?? DEFAULT_POINT_SIZE
            return (
              <PageView
                key={page}
                document={load.document}
                pageNumber={page}
                pointWidth={size.width}
                pointHeight={size.height}
                scale={scale}
                rotation={rotation}
                textIndex={textIndex}
                matches={matches}
                activeMatch={active}
                pageLabel={t('page', { index: page })}
                onGeometry={onGeometry}
                registerFrame={registerFrame}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
