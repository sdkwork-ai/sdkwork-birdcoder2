/**
 * The Word preview body: a page rail beside the selected page.
 *
 * The document owner delivers complete package bytes; everything below the
 * toolbar is this renderer's own. Parsing happens once per byte identity, and
 * the parsed document — including the Blob URLs its pictures use — is released
 * with the effect that created it, so switching files or closing the tab cannot
 * leak media.
 *
 * Word documents flow, so pagination runs in two rounds. The body first
 * renders the blocks into a hidden container of the exact content width,
 * measures where every block's lines and rows fall, and divides a block that
 * straddles a page boundary at a line or row edge — the way Word breaks a
 * paragraph mid-sentence and repeats a table's header row. Until a measurement
 * arrives — and in any environment that reports zero heights, such as jsdom —
 * the pages follow explicit breaks only, which is a complete, if coarse,
 * document rather than an empty one.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { DEFAULT_PAGED_VIEW } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewStore, PagedZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
import { paginateBlocks } from './docx/paginate.ts'
import type { BlockParts } from './docx/paginate.ts'
import { headerRowCount, rowSpanCrosses, splitParagraph, splitTable } from './docx/split.ts'
import { DocxParseError, parseDocx } from './docx/document.ts'
import type { ParsedDocx } from './docx/document.ts'
import type { DocxBlock, DocxSection } from './docx/model.ts'
import { analyzeParagraph, analyzeTable, naturalLineRatio } from './render/measure.ts'
import type { ParagraphLineMap, TableRowMap } from './render/measure.ts'
import { BlockView } from './render/BlockView.tsx'
import { PageCanvas } from './render/PageCanvas.tsx'
import type { DocxPage } from './render/PageCanvas.tsx'
import { LineRatioContext } from './render/metrics.tsx'
import type { PageContext } from './render/InlineView.tsx'
import type { SdkworkDocxPreviewKey } from './locales.ts'
import css from './DocxBody.module.css'

/** Width of one rail thumbnail in CSS pixels. */
const THUMBNAIL_WIDTH = 140
/** Padding the stage keeps around the fitted page, in CSS pixels. */
const STAGE_PADDING = 32
/** Zoom bounds and the step each press applies. */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
/** The step one Ctrl-wheel notch applies. */
const WHEEL_ZOOM_STEP = 1.1
/** The gap one keyboard scroll nudge travels, in CSS pixels. */
const KEY_SCROLL_PX = 96
/** Slack that keeps a rounding-tight line from counting as overflow. */
const FLOW_EPSILON_PX = 0.5
/** The page context the fallback pass uses; field values there are never drawn. */
const MEASURE_CONTEXT: PageContext = { pageNumber: 1, pageCount: 1 }

/** Standard document props plus the Word dictionary and viewing store. */
export type DocxBodyProps =
  & DocumentPreviewProps
  & PropsLocale<'sdkworkDocxPreview'>
  & PropsStore<PagedViewStore>

/** A parsed document or the reason it could not be parsed. */
type LoadState =
  | { readonly kind: 'ready'; readonly data: Uint8Array<ArrayBuffer>; readonly parsed: ParsedDocx }
  | { readonly kind: 'failed'; readonly data: Uint8Array<ArrayBuffer>; readonly error: unknown }

/**
 * The measurement one block exposes to the splitter: a paragraph's lines or a
 * table's rows, plus the element the measurement came from.
 */
type FlowEntry =
  | { readonly kind: 'paragraph'; readonly element: HTMLElement; readonly map: ParagraphLineMap }
  | { readonly kind: 'table'; readonly element: HTMLElement; readonly map: TableRowMap; readonly rowHeights: readonly number[] }

/**
 * Turn a parse failure into the sentence the reader needs.
 * @param error - the thrown value.
 * @param t - the namespace translator.
 * @returns the localized explanation.
 */
function failureText(error: unknown, t: DocxBodyProps['t']): string {
  if (error instanceof DocxParseError) {
    if (error.code === 'not-a-package') return t('failure.notPackage')
    if (error.code === 'legacy-binary') return t('failure.legacy')
    // The remaining code is the only one left in the union.
    return t('failure.noDocument')
  }
  return t('failure.generic', { message: error instanceof Error ? error.message : String(error) })
}

/**
 * Clamp a zoom multiple into the supported range.
 * @param value - the requested multiple.
 * @returns the multiple the viewer accepts.
 */
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/**
 * Measure the content height each top-level block occupies, margins excluded.
 *
 * The query uses the section wrapper as its anchor so a table nested inside a
 * cell — which carries the same marker — is never counted twice.
 * @param root - the hidden measurement container.
 * @returns one content height per top-level block, in document order, with the
 *   element each measurement came from.
 */
function measureBlocks(root: HTMLElement): { readonly heights: readonly number[]; readonly elements: readonly HTMLElement[] } {
  const heights: number[] = []
  const elements: HTMLElement[] = []
  for (const node of root.querySelectorAll<HTMLElement>('[data-docx-section] > [data-docx-block]')) {
    heights.push(node.getBoundingClientRect().height)
    elements.push(node)
  }
  return { heights, elements }
}

/**
 * Assign each page the number the reader sees, honouring a section's own
 * numbering start and continuing from the previous section otherwise.
 * @param sections - the document's sections in order.
 * @param sectionPages - one page list per section.
 * @returns the pages with their display numbers, in document order.
 */
function numberPages(
  sections: readonly DocxSection[],
  sectionPages: readonly (readonly (readonly DocxBlock[])[])[],
): readonly DocxPage[] {
  const pages: DocxPage[] = []
  let continueFrom = 1
  for (const [sectionIndex, section] of sections.entries()) {
    const start = section.pageNumberStart ?? continueFrom
    sectionPages[sectionIndex].forEach((blocks, pageIndex) => {
      pages.push({ section, blocks, displayNumber: start + pageIndex })
    })
    continueFrom = start + sectionPages[sectionIndex].length
  }
  return pages
}

/**
 * The Word type's body, registered under `sidebar.right.tab.document`.
 * @param props - package bytes and the framework-owned tab, store, and locale seats.
 * @returns the page rail with the selected page, or a progress or failure line.
 */
export function DocxBody(props: DocxBodyProps): ReactNode {
  const { tab } = props.useTabInfo()
  const view = props.useStore(state => state.byTab[tab.id] ?? DEFAULT_PAGED_VIEW)
  const data = props.content.kind === 'bytes' ? props.content.data : undefined
  const [load, setLoad] = useState<LoadState>()
  const [attempt, setAttempt] = useState(0)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [pages, setPages] = useState<readonly DocxPage[]>([])
  const [measuring, setMeasuring] = useState(false)
  const [ratios, setRatios] = useState<ReadonlyMap<string, number>>(new Map())
  const [visibleThumbs, setVisibleThumbs] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [pageDraft, setPageDraft] = useState<string>()
  const [fitWidth, setFitWidth] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const { actions, t, scrollportRef } = props
  const labels = useMemo(
    () => ({ unsupportedObject: () => t('unsupportedObject') }),
    [t],
  )

  useEffect(() => {
    if (data === undefined || tab.signal.aborted) return undefined
    let disposed = false
    let parsed: ParsedDocx | undefined
    // Same-value sets bail; empty-array identities would loop a rerun.
    setLoad(undefined)
    setPages(previous => previous.length === 0 ? previous : [])
    setMeasuring(true)
    void parseDocx(data, labels).then(
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

  const story = load?.kind === 'ready' ? load.parsed.document : undefined

  // Settled webfonts change line wraps; one more round after they land keeps
  // the division points honest.
  useEffect(() => {
    const fonts = (typeof document === 'undefined' ? undefined : document.fonts) as { ready?: Promise<unknown> } | undefined
    if (story === undefined || fonts?.ready === undefined) return undefined
    let cancelled = false
    void fonts.ready.then(() => {
      if (!cancelled) setMeasuring(true)
    })
    return () => { cancelled = true }
  }, [story])

  // The measurement container exists exactly while a round is running, so the
  // round reads live geometry and then lets the container go.
  useEffect(() => {
    if (!measuring || story === undefined) return
    const root = measureRef.current
    if (root === null) return
    // A font the map has no ratio for short-circuits the round, so the
    // container re-renders with calibrated line heights before heights are read.
    const fonts = new Set<string>()
    for (const section of story.sections) {
      for (const block of section.blocks) {
        if (block.kind === 'paragraph') fonts.add(block.mark.fontFamily)
      }
    }
    if ([...fonts].some(font => !ratios.has(font))) {
      const next = new Map(ratios)
      for (const font of fonts) if (!next.has(font)) next.set(font, naturalLineRatio(font))
      setRatios(next)
      return
    }
    const flow = new Map<DocxBlock, FlowEntry>()
    const wrappers = [...root.querySelectorAll<HTMLElement>('[data-docx-section]')]
    story.sections.forEach((section, sectionIndex) => {
      const round = measureBlocks(wrappers[sectionIndex] ?? root)
      section.blocks.forEach((block, blockIndex) => {
        const element = round.elements[blockIndex]
        const entry = createFlowEntry(block, element)
        if (entry !== undefined) flow.set(block, entry)
      })
    })

    const entryOf = (block: DocxBlock): FlowEntry | undefined => {
      const known = flow.get(block)
      if (known !== undefined) return known
      // A continuation block produced by an earlier divide already carries the
      // measurement its parent was divided with.
      return undefined
    }

    const divide = (block: DocxBlock, available: number): BlockParts<DocxBlock> | undefined => {
      const entry = entryOf(block)
      if (entry === undefined || available <= FLOW_EPSILON_PX) return undefined
      if (entry.kind === 'paragraph') {
        if (block.kind !== 'paragraph') return undefined
        const { lineBottoms, lineStarts } = entry.map
        if (lineBottoms.length < 2) return undefined
        let cut = lineBottoms.findIndex(bottom => bottom > available + FLOW_EPSILON_PX)
        // Orphan and widow control: a divide leaves at least two lines on
        // each side, which is Word's own default.
        const lastFit = lineBottoms.length
        if (cut < 0 || cut >= lastFit) return undefined
        if (cut < 2) return undefined
        if (lastFit - cut < 2) cut = lastFit - 2
        if (cut < 2) return undefined
        const point = lineStarts.at(cut)
        if (point === undefined) return undefined
        const parts = splitParagraph(block, point)
        if (parts === undefined) return undefined
        const headHeight = lineBottoms[cut - 1]
        const tailHeight = entry.map.contentHeight - headHeight
        const tailMap: ParagraphLineMap = {
          lineBottoms: lineBottoms.slice(cut).map(bottom => bottom - headHeight),
          lineStarts: lineStarts.slice(cut),
          contentHeight: tailHeight,
        }
        flow.set(parts[1], { kind: 'paragraph', element: entry.element, map: tailMap })
        return { head: parts[0], tail: parts[1], headHeight, tailHeight }
      }
      if (block.kind !== 'table') return undefined
      const heights = entry.rowHeights
      if (heights.length < 2) return undefined
      const headers = headerRowCount(block)
      const total = heights.reduce((sum, height) => sum + height, 0)
      let used = 0
      let cut = 0
      for (let row = 0; row < heights.length - 1; row += 1) {
        if (used + heights[row] > available - FLOW_EPSILON_PX) break
        used += heights[row]
        cut = row + 1
      }
      while (cut > 0 && (cut <= headers || rowSpanCrosses(block, cut))) cut -= 1
      if (cut <= 0 || cut >= heights.length) return undefined
      const parts = splitTable(block, cut)
      if (parts === undefined) return undefined
      const repeat = heights.slice(0, headers).reduce((sum, height) => sum + height, 0)
      const headHeight = heights.slice(0, cut).reduce((sum, height) => sum + height, 0)
      const tailHeight = total - headHeight + repeat
      const tailRows = [...heights.slice(0, headers), ...heights.slice(cut)]
      const tailMap: TableRowMap = {
        rowTops: tailRows.reduce<number[]>((tops, height) => [...tops, (tops.at(-1) ?? 0) + height], []),
        contentHeight: tailHeight,
      }
      flow.set(parts[1], {
        kind: 'table', element: entry.element, map: tailMap,
        rowHeights: tailRows,
      })
      return { head: parts[0], tail: parts[1], headHeight, tailHeight }
    }

    const marginsFor = (blocks: readonly DocxBlock[]): readonly number[] => {
      let previousAfter = 0
      return blocks.map((block) => {
        const before = block.kind === 'paragraph' ? block.spaceBeforePx : 0
        const margin = before + previousAfter
        previousAfter = block.kind === 'paragraph' ? block.spaceAfterPx : 0
        return margin
      })
    }

    const sectionPages = story.sections.map((section, sectionIndex) => {
      const round = measureBlocks(wrappers[sectionIndex] ?? root)
      return paginateBlocks(section.blocks, round.heights, marginsFor(section.blocks), section.geometry.contentHeightPx, divide)
    })
    setPages(numberPages(story.sections, sectionPages))
    setMeasuring(false)
  }, [measuring, story, ratios])

  const lineRatioOf = useCallback((font: string): number => ratios.get(font) ?? 1, [ratios])

  // Before the first measurement round lands, the pages follow explicit
  // breaks only; after it, the refined list replaces them.
  const fallbackPages = useMemo(() => {
    if (story === undefined) return []
    const sectionPages = story.sections.map(section =>
      paginateBlocks(section.blocks, [], [], section.geometry.contentHeightPx))
    return numberPages(story.sections, sectionPages)
  }, [story])
  const shown = pages.length > 0 ? pages : fallbackPages

  const selected = Math.min(Math.max(1, view.index), Math.max(1, shown.length))
  const current = shown.at(selected - 1)
  const geometry = current?.section.geometry
  const fitScale = useMemo(() => {
    if (geometry === undefined || stageSize.width === 0 || stageSize.height === 0) return 1
    return Math.min(
      (stageSize.width - STAGE_PADDING) / geometry.widthPx,
      (stageSize.height - STAGE_PADDING) / geometry.heightPx,
    )
  }, [geometry, stageSize])
  // Fit width ignores the page height: wide tables and landscape pages stay
  // readable in a narrow pane.
  const fitWidthScale = geometry === undefined ? 1
    : (stageSize.width - STAGE_PADDING) / geometry.widthPx
  const scale = geometry === undefined ? 1
    : fitWidth ? fitWidthScale
      : view.zoom === 'fit' ? fitScale : view.zoom

  // The rail paints a page's sheet only around the viewport, so a long
  // document keeps a few dozen live canvases instead of hundreds.
  useEffect(() => {
    const rail = railRef.current
    if (rail === null || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver((entries) => {
      setVisibleThumbs((previous) => {
        const next = new Set(previous)
        let changed = false
        for (const entry of entries) {
          const item = entry.target.closest<HTMLElement>('[data-docx-thumbnail-index]')
          const index = item === null ? Number.NaN : Number(item.dataset.docxThumbnailIndex)
          if (Number.isNaN(index)) continue
          if (entry.isIntersecting && !next.has(index)) {
            next.add(index)
            changed = true
          } else if (!entry.isIntersecting && next.has(index)) {
            next.delete(index)
            changed = true
          }
        }
        return changed ? next : previous
      })
    }, { root: rail, rootMargin: '200px' })
    for (const item of rail.querySelectorAll('[data-docx-thumbnail-index]')) observer.observe(item)
    return () => { observer.disconnect() }
  }, [shown.length])

  // Flipping pages lands at the top of the new page, like every paged viewer.
  useEffect(() => {
    // jsdom grows no layout, so the scroll method itself may be absent.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    stageRef.current?.scrollTo?.({ top: 0 })
  }, [selected])

  // The rail follows the selection so stepping pages keeps the thumbnail seen.
  useEffect(() => {
    const rail = railRef.current
    const item = rail?.querySelector<HTMLElement>(`[data-docx-thumbnail="${selected}"]`)
    // jsdom grows no layout, so the scroll method itself may be absent.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    item?.scrollIntoView?.({ block: 'nearest' })
  }, [selected, shown.length])

  const followAnchor = useCallback((name: string): void => {
    const stage = stageRef.current
    if (stage === null) return
    const target = stage.querySelector<HTMLElement>(`[data-docx-bookmark~="${CSS.escape(name)}"]`)
    // jsdom grows no layout, so the scroll method itself may be absent.
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    target?.scrollIntoView?.({ block: 'start' })
  }, [])

  // React delegates wheel events passively, so a Ctrl-wheel zoom that must not
  // scroll the stage needs its own non-passive listener.
  useEffect(() => {
    const node = stageRef.current
    if (node === null) return undefined
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const currentScale = view.zoom === 'fit' ? fitScale : view.zoom
      const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP
      actions.zoom(tab.id, clampZoom(currentScale * factor))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => { node.removeEventListener('wheel', onWheel) }
  }, [actions, fitScale, tab.id, view.zoom])

  if (data === undefined) {
    return <p className={css.status} role="alert"><span className={css.statusLine}>{t('failure.notPackage')}</span></p>
  }
  if (load === undefined || load.data !== data) {
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

  const parsedDocument = load.parsed.document
  const setPage = (next: number): void => {
    actions.index(tab.id, Math.min(Math.max(1, next), Math.max(1, shown.length)))
  }
  const setZoom = (zoom: PagedZoom): void => { actions.zoom(tab.id, zoom) }

  return (
    <div className={css.preview} data-docx-preview>
      <div className={css.rail} role="listbox" aria-label={t('pageList')} data-docx-rail ref={railRef}>
        {shown.map((page, pageIndex) => {
          const number = pageIndex + 1
          const thumbnailScale = THUMBNAIL_WIDTH / page.section.geometry.widthPx
          const painted = visibleThumbs.has(pageIndex) || number === selected
          return (
            <button
              key={number}
              type="button"
              role="option"
              aria-selected={number === selected}
              aria-current={number === selected}
              aria-label={t('page', { index: number })}
              className={css.railItem}
              data-docx-thumbnail={number}
              data-docx-thumbnail-index={pageIndex}
              onClick={() => { setPage(number) }}
            >
              <span
                className={css.railFrame}
                style={{ width: `${THUMBNAIL_WIDTH}px`, height: `${page.section.geometry.heightPx * thumbnailScale}px` }}
              >
                <span
                  className={css.railCanvas}
                  style={{
                    width: `${page.section.geometry.widthPx}px`,
                    height: `${page.section.geometry.heightPx}px`,
                    transform: `scale(${thumbnailScale})`,
                  }}
                >
                  {painted && (
                    <PageCanvas
                      page={page}
                      pageNumber={number}
                      pageCount={shown.length}
                      evenAndOdd={parsedDocument.evenAndOddHeaders}
                      onFollowAnchor={followAnchor}
                      lineRatioOf={lineRatioOf}
                    />
                  )}
                </span>
              </span>
              <span className={css.railCaption}>{number}</span>
            </button>
          )
        })}
      </div>
      <div className={css.main}>
        <div className={css.bar}>
          <label className={css.counter} data-docx-counter>
            <input
              className={css.pageInput}
              data-docx-page-input
              type="text"
              inputMode="numeric"
              aria-label={t('pageInput')}
              value={pageDraft ?? String(selected)}
              onChange={(event) => { setPageDraft(event.target.value.replace(/\D/g, '')) }}
              onBlur={() => { setPageDraft(undefined) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(Number.parseInt(pageDraft ?? '', 10) || selected)
                  setPageDraft(undefined)
                  event.currentTarget.blur()
                } else if (event.key === 'Escape') {
                  setPageDraft(undefined)
                  event.currentTarget.blur()
                }
              }}
            />
            <span>{` / ${shown.length}`}</span>
          </label>
          <button
            type="button"
            className={css.tool}
            aria-label={t('previous')}
            disabled={selected <= 1}
            data-docx-previous
            onClick={() => { setPage(selected - 1) }}
          >
            ‹
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('next')}
            disabled={selected >= shown.length}
            data-docx-next
            onClick={() => { setPage(selected + 1) }}
          >
            ›
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomOut')}
            data-docx-zoom-out
            onClick={() => { setFitWidth(false); setZoom(clampZoom(scale / ZOOM_STEP)) }}
          >
            −
          </button>
          <button
            type="button"
            className={css.tool}
            aria-pressed={fitWidth}
            aria-label={t('zoomFitWidth')}
            data-docx-zoom-fit-width
            onClick={() => { setFitWidth(value => !value) }}
          >
            {t('zoomFitWidth')}
          </button>
          <button
            type="button"
            className={css.tool}
            aria-pressed={view.zoom === 'fit' && !fitWidth}
            aria-label={t('zoomFit')}
            data-docx-zoom-fit
            onClick={() => { setFitWidth(false); setZoom('fit') }}
          >
            {t('zoomLevel', { percent: Math.round(fitScale * 100) })}
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomActual')}
            data-docx-zoom-actual
            onClick={() => { setZoom(1) }}
          >
            {'1:1'}
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomIn')}
            data-docx-zoom-in
            onClick={() => { setFitWidth(false); setZoom(clampZoom(scale * ZOOM_STEP)) }}
          >
            ＋
          </button>
        </div>
        <div
          ref={bindStage}
          className={css.stage}
          tabIndex={0}
          data-docx-stage
          onKeyDown={(event) => {
            const stage = stageRef.current
            const atBottom = stage !== null && stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 1
            const atTop = stage !== null && stage.scrollTop <= 0
            if (event.key === 'PageDown' || (event.key === 'ArrowDown' && atBottom) || (event.key === 'ArrowRight' && atBottom)) {
              event.preventDefault()
              setPage(selected + 1)
            } else if (event.key === 'PageUp' || (event.key === 'ArrowUp' && atTop) || (event.key === 'ArrowLeft' && atTop)) {
              event.preventDefault()
              setPage(selected - 1)
            } else if (event.key === 'Home') {
              event.preventDefault()
              setPage(1)
            } else if (event.key === 'End') {
              event.preventDefault()
              setPage(shown.length)
            } else if (!event.ctrlKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              // jsdom grows no layout, so the scroll method itself may be absent.
              // oxlint-disable-next-line typescript/no-unnecessary-condition
              stage?.scrollBy?.({ top: event.key === 'ArrowDown' ? KEY_SCROLL_PX : -KEY_SCROLL_PX })
            }
          }}
          onWheel={(event) => {
            if (!event.ctrlKey) return
            event.preventDefault()
            setZoom(clampZoom(event.deltaY < 0 ? scale * WHEEL_ZOOM_STEP : scale / WHEEL_ZOOM_STEP))
          }}
        >
          {current !== undefined && geometry !== undefined && (
            <div
              className={css.canvas}
              style={{ width: `${geometry.widthPx * scale}px`, height: `${geometry.heightPx * scale}px` }}
              role="img"
              aria-label={t('pageCanvas', { index: selected })}
              data-docx-canvas
            >
              <div
                style={{
                  width: `${geometry.widthPx}px`,
                  height: `${geometry.heightPx}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <PageCanvas
                  page={current}
                  pageNumber={selected}
                  pageCount={shown.length}
                  evenAndOdd={parsedDocument.evenAndOddHeaders}
                  onFollowAnchor={followAnchor}
                  lineRatioOf={lineRatioOf}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {measuring && (
        <LineRatioContext.Provider value={lineRatioOf}>
          <div ref={measureRef} className={css.measure} aria-hidden="true" data-docx-measure>
            {parsedDocument.sections.map((section, sectionIndex) => (
              <div key={sectionIndex} data-docx-section style={{ width: `${section.geometry.contentWidthPx}px` }}>
                {section.blocks.map((block, blockIndex) => (
                  <BlockView key={blockIndex} block={block} topMargin={0} pageContext={MEASURE_CONTEXT} />
                ))}
              </div>
            ))}
          </div>
        </LineRatioContext.Provider>
      )}
    </div>
  )
}

/**
 * Measure one block's flow structure from its laid-out element.
 * @param block - the parsed block.
 * @param element - the element the block rendered into.
 * @returns the flow entry the splitter reads, or undefined for a block that paints nothing.
 */
function createFlowEntry(block: DocxBlock, element: HTMLElement): FlowEntry | undefined {
  if (block.kind === 'table') {
    const map = analyzeTable(element)
    if (map === undefined) return undefined
    const rows = [...element.querySelectorAll(':scope > tbody > tr, :scope > tr')]
    const rowHeights = rows.map(row => row.getBoundingClientRect().height)
    return { kind: 'table', element, map, rowHeights }
  }
  const map = analyzeParagraph(element)
  if (map === undefined) return undefined
  return { kind: 'paragraph', element, map }
}

/** Re-exported so a consumer naming this renderer's keys can reach them. */
export type { SdkworkDocxPreviewKey }
