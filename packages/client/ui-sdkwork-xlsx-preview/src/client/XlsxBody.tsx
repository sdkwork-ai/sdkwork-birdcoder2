/**
 * The Excel preview body.
 *
 * The layout is Excel's own, top to bottom: the Name Box and formula bar, the
 * worksheet surface, the sheet-tab strip, and the status bar whose right end
 * carries the zoom controls. The document owner delivers complete package
 * bytes; everything below the toolbar is this renderer's. Parsing happens once
 * per byte identity, and the parsed workbook — including the Blob URLs its
 * pictures use — is released with the effect that created it, so switching
 * files or closing the tab cannot leak media.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PagedViewStore, PagedView } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { columnName, parseXlsx, XlsxParseError } from './xlsx/workbook.ts'
import type { ParsedXlsx } from './xlsx/workbook.ts'
import type { XlsxSheet, XlsxWorkbook } from './xlsx/model.ts'
import { rowAt } from './xlsx/model.ts'
import { HEADER_SIZE } from './xlsx/excel.ts'
import { SheetGrid } from './render/SheetGrid.tsx'
import { fitScale, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './render/geometry.ts'
import { selectionName } from './render/selection.ts'
import type { GridPoint } from './render/selection.ts'
import { formatSummary, selectionSummary } from './render/summary.ts'
import { pageSize, useGridSelection } from './render/useGridSelection.ts'
import css from './XlsxBody.module.css'

/** Standard document props plus the Excel dictionary and viewing store. */
export type XlsxBodyProps =
  & DocumentPreviewProps
  & PropsLocale<'sdkworkXlsxPreview'>
  & PropsStore<PagedViewStore>

/** A parsed workbook or the reason it could not be parsed. */
type LoadState =
  | { readonly kind: 'ready'; readonly data: Uint8Array<ArrayBuffer>; readonly parsed: ParsedXlsx }
  | { readonly kind: 'failed'; readonly data: Uint8Array<ArrayBuffer>; readonly error: unknown }

/**
 * Turn a parse failure into the sentence the reader needs.
 * @param error - the thrown value.
 * @param t - the namespace translator.
 * @returns the localized explanation.
 */
function failureText(error: unknown, t: XlsxBodyProps['t']): string {
  if (error instanceof XlsxParseError) {
    if (error.code === 'not-a-package') return t('failure.notPackage')
    if (error.code === 'legacy-binary') return t('failure.legacy')
    // The remaining code is the only one left in the union.
    return t('failure.noWorkbook')
  }
  return t('failure.generic', { message: error instanceof Error ? error.message : String(error) })
}

/**
 * Clamp a zoom multiple into the supported range.
 * @param value - the requested multiple.
 * @returns the permitted multiple.
 */
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/**
 * The sheet-name fallback a parse uses for a workbook that names no sheets.
 * @param index - the sheet's 1-based position.
 * @param t - the namespace translator.
 * @returns the visible name.
 */
function sheetName(index: number, t: XlsxBodyProps['t']): string {
  return t('sheet', { index })
}

/**
 * The Excel type's body, registered under `sidebar.right.tab.document`.
 * @param props - package bytes and the framework-owned tab, store, and locale seats.
 * @returns the workbook window, or a progress or failure line.
 */
export function XlsxBody(props: XlsxBodyProps): ReactNode {
  const { tab } = props.useTabInfo()
  // The office store is copy-on-write, so a tab that has never been zoomed or
  // paged has no entry at all — the workbook's own view then decides, which is
  // how Excel opens a sheet at the zoom it was saved with.
  const view = props.useStore(state => (state.byTab as Record<string, PagedView | undefined>)[tab.id])
  const data = props.content.kind === 'bytes' ? props.content.data : undefined
  const [load, setLoad] = useState<LoadState>()
  const [attempt, setAttempt] = useState(0)
  const { t } = props
  const labels = useMemo(
    () => ({ sheetName: (index: number): string => sheetName(index, t) }),
    [t],
  )

  useEffect(() => {
    if (data === undefined || tab.signal.aborted) return undefined
    let disposed = false
    let parsed: ParsedXlsx | undefined
    setLoad(undefined)
    void parseXlsx(data, labels).then(
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

  return <WorkbookView {...props} workbook={load.parsed.workbook} view={view} />
}

/** The window once a workbook has parsed. */
interface WorkbookViewProps extends XlsxBodyProps {
  readonly workbook: XlsxWorkbook
  /** The tab's stored view, absent until the reader pages or zooms the sheet. */
  readonly view: PagedView | undefined
}

/**
 * The workbook window: chrome above and below the worksheet surface.
 * @param props - the parsed workbook, the tab's view state, and the document seats.
 * @returns the Excel window.
 */
function WorkbookView({ workbook, view, ...props }: WorkbookViewProps): ReactNode {
  const { tab } = props.useTabInfo()
  const { actions, t, scrollportRef } = props
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [point, setPoint] = useState<GridPoint>()
  const sheetCount = workbook.sheets.length
  const selected = Math.min(Math.max(1, view?.index ?? 1), sheetCount)
  // A parsed workbook always carries at least one sheet, so the clamped index
  // always names one.
  const sheet: XlsxSheet = workbook.sheets[selected - 1]

  // The grid's stage is the renderer's scrollport, and its measurement sizes
  // the status bar's zoom readout and the shape of a page step.
  const observer = useRef<ResizeObserver | undefined>(undefined)
  const bindStage = useCallback((node: HTMLDivElement | null): void => {
    scrollportRef(node)
    observer.current?.disconnect()
    observer.current = undefined
    if (node === null) {
      setStageSize({ width: 0, height: 0 })
      return
    }
    setStageSize({ width: node.clientWidth, height: node.clientHeight })
    if (typeof ResizeObserver !== 'undefined') {
      const next = new ResizeObserver(() => {
        setStageSize({ width: node.clientWidth, height: node.clientHeight })
      })
      next.observe(node)
      observer.current = next
    }
  }, [scrollportRef])
  useEffect(() => () => { observer.current?.disconnect() }, [])

  const requested = view?.zoom ?? sheet.zoomScale
  const scale = requested === 'fit' ? fitScale(sheet, stageSize) : requested
  // The header band is chrome rather than sheet, so a page step crosses the
  // rows and columns a reader can actually see.
  const bodyHeight = Math.max(0, stageSize.height - HEADER_SIZE * scale) / scale
  const bodyWidth = Math.max(0, stageSize.width - HEADER_SIZE * scale) / scale
  const page = pageSize(bodyHeight, bodyWidth, sheet.defaultRowHeight, sheet.defaultColumnWidth)
  const controller = useGridSelection(sheet, page.rows, page.columns, setPoint)
  const active = point ?? controller.active
  const activeCell = useMemo(() => (
    rowAt(sheet, active.row)?.cells.find(cell => cell.column === active.column)
  ), [active.column, active.row, sheet])
  const summary = useMemo(() => selectionSummary(sheet, controller.selection), [controller.selection, sheet])

  const setSheet = (next: number): void => {
    actions.index(tab.id, Math.min(Math.max(1, next), Math.max(1, sheetCount)))
    setPoint(undefined)
  }
  const setZoom = (zoom: number | 'fit'): void => { actions.zoom(tab.id, zoom) }
  const percent = Math.round(scale * 100)
  const nameBox = selectionName(
    controller.selection,
    (column, row) => `${columnName(column)}${row + 1}`,
    columnName,
  )
  const formulaText = activeCell === undefined
    ? ''
    : activeCell.formula === undefined ? activeCell.raw : `=${activeCell.formula}`

  return (
    <div className={css.preview} data-xlsx-preview>
      <div className={css.formulaBar} data-xlsx-formula-bar>
        <input
          className={css.nameBox}
          value={nameBox}
          aria-label={t('nameBox')}
          data-xlsx-name-box
          readOnly
        />
        <span className={css.fx} aria-hidden="true">fx</span>
        <span className={css.formulaValue} data-xlsx-formula-value>
          {formulaText === '' ? t('emptyCell') : formulaText}
        </span>
      </div>
      <div className={css.viewport}>
        <SheetGrid
          sheet={sheet}
          scale={scale}
          resizeObserver={bindStage}
          controller={controller}
          selectAllLabel={t('selectAll')}
        />
      </div>
      <div className={css.bottomBar}>
        <div className={css.tabStrip} role="tablist" aria-label={t('sheetList')}>
          {workbook.sheets.map((entry: XlsxSheet) => (
            <button
              key={entry.index}
              type="button"
              role="tab"
              aria-selected={entry.index === selected}
              aria-current={entry.index === selected}
              aria-label={t('sheet', { index: entry.index })}
              className={css.tab}
              data-xlsx-sheet-tab={entry.index}
              onClick={() => { setSheet(entry.index) }}
            >
              {entry.name}
            </button>
          ))}
        </div>
        <div className={css.statusBar}>
          {summary.count > 0 && (
            <span className={css.summary} data-xlsx-summary>
              {summary.numericCount > 0 && (
                <span data-xlsx-summary-average>
                  {t('summaryAverage', { value: formatSummary(summary.average ?? 0) })}
                </span>
              )}
              <span data-xlsx-summary-count>
                {t('summaryCount', { value: formatSummary(summary.count) })}
              </span>
              {summary.numericCount > 0 && (
                <span data-xlsx-summary-sum>
                  {t('summarySum', { value: formatSummary(summary.sum ?? 0) })}
                </span>
              )}
            </span>
          )}
          <span className={css.counter} data-xlsx-counter>{`${selected} / ${sheetCount}`}</span>
          <button
            type="button"
            className={css.tool}
            aria-label={t('previous')}
            disabled={selected <= 1}
            data-xlsx-previous
            onClick={() => { setSheet(selected - 1) }}
          >
            ‹
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('next')}
            disabled={selected >= sheetCount}
            data-xlsx-next
            onClick={() => { setSheet(selected + 1) }}
          >
            ›
          </button>
          <span className={css.divider} aria-hidden="true" />
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomOut')}
            data-xlsx-zoom-out
            onClick={() => { setZoom(clampZoom(scale / ZOOM_STEP)) }}
          >
            −
          </button>
          <button
            type="button"
            className={css.zoomReadout}
            aria-pressed={requested === 'fit'}
            aria-label={t('zoomFit')}
            data-xlsx-zoom-fit
            onClick={() => { setZoom('fit') }}
          >
            {t('zoomLevel', { percent })}
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomIn')}
            data-xlsx-zoom-in
            onClick={() => { setZoom(clampZoom(scale * ZOOM_STEP)) }}
          >
            ＋
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('zoomActual')}
            data-xlsx-zoom-actual
            onClick={() => { setZoom(1) }}
          >
            {'1:1'}
          </button>
        </div>
      </div>
    </div>
  )
}
