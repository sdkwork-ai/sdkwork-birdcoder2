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
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PagedViewStore, PagedView } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { columnName, parseXlsx, XlsxParseError } from './xlsx/workbook.ts'
import type { ParsedXlsx } from './xlsx/workbook.ts'
import type { XlsxSheet, XlsxWorkbook } from './xlsx/model.ts'
import { rowAt } from './xlsx/model.ts'
import { HEADER_SIZE } from './xlsx/excel.ts'
import { SheetGrid } from './render/SheetGrid.tsx'
import { cellText, editActionFor } from './render/editing.ts'
import { fitScale, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from './render/geometry.ts'
import { selectionName } from './render/selection.ts'
import type { GridPoint } from './render/selection.ts'
import { formatSummary, selectionSummary } from './render/summary.ts'
import { movePoint, pageSize, pointReference, useGridSelection } from './render/useGridSelection.ts'
import { useSheetEditing } from './render/useSheetEditing.ts'
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

  return <WorkbookView {...props} workbook={load.parsed.workbook} view={view} data={load.data} />
}

/**
 * The toolbar's own marks.
 *
 * They are drawn rather than set in a glyph, because the symbols for undo,
 * redo, and save are absent from several of the fonts a reader's page may fall
 * back to; a path in `currentColor` always renders and always answers the theme.
 */

/** The arc and arrow Excel's undo carries. */
function UndoIcon(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M2.5 6.5H9a3.25 3.25 0 0 1 0 6.5H7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 3.5 2.5 6.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The same arc, mirrored, for redo. */
function RedoIcon(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M13.5 6.5H7a3.25 3.25 0 0 0 0 6.5H9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.5 3.5l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The arrow-into-a-tray mark a download carries. */
function SaveIcon(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M8 2.5v7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.25 6.75 8 9.5l2.75-2.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** The window once a workbook has parsed. */
interface WorkbookViewProps extends XlsxBodyProps {
  readonly workbook: XlsxWorkbook
  /** The tab's stored view, absent until the reader pages or zooms the sheet. */
  readonly view: PagedView | undefined
  /** The package bytes the workbook was parsed from, which a save rewrites. */
  readonly data: Uint8Array
}

/**
 * The workbook window: chrome above and below the worksheet surface.
 * @param props - the parsed workbook, the tab's view state, and the document seats.
 * @returns the Excel window.
 */
function WorkbookView({ workbook, view, data, ...props }: WorkbookViewProps): ReactNode {
  const { tab } = props.useTabInfo()
  const { actions, t, scrollportRef } = props
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [point, setPoint] = useState<GridPoint>()
  // The formula bar is a real field, so this is the draft it holds while the
  // reader is in it; outside an edit the field shows the active cell's value.
  const [barDraft, setBarDraft] = useState<string>()
  const sheetCount = workbook.sheets.length
  const selected = Math.min(Math.max(1, view?.index ?? 1), sheetCount)
  // A parsed workbook always carries at least one sheet, so the clamped index
  // always names one.
  const parsedSheet: XlsxSheet = workbook.sheets[selected - 1]
  const editing = useSheetEditing(workbook, selected, data)
  // The grid draws the sheet with the reader's edits folded in. The selection
  // stays bound to the sheet as parsed, so landing an edit widens the used
  // range without resetting where the reader is.
  const sheet: XlsxSheet = editing.edited.sheets[selected - 1]

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

  const requested = view?.zoom ?? parsedSheet.zoomScale
  const scale = requested === 'fit' ? fitScale(parsedSheet, stageSize) : requested
  // The header band is chrome rather than sheet, so a page step crosses the
  // rows and columns a reader can actually see.
  const bodyHeight = Math.max(0, stageSize.height - HEADER_SIZE * scale) / scale
  const bodyWidth = Math.max(0, stageSize.width - HEADER_SIZE * scale) / scale
  const page = pageSize(bodyHeight, bodyWidth, parsedSheet.defaultRowHeight, parsedSheet.defaultColumnWidth)
  const controller = useGridSelection(parsedSheet, page.rows, page.columns, setPoint)
  const active = point ?? controller.active
  const activeCell = useMemo(() => (
    rowAt(sheet, active.row)?.cells.find(cell => cell.column === active.column)
  ), [active.column, active.row, sheet])
  const summary = useMemo(() => selectionSummary(sheet, controller.selection), [controller.selection, sheet])

  const setSheet = (next: number): void => {
    actions.index(tab.id, Math.min(Math.max(1, next), Math.max(1, sheetCount)))
    setPoint(undefined)
    setBarDraft(undefined)
  }
  const setZoom = (zoom: number | 'fit'): void => { actions.zoom(tab.id, zoom) }
  const percent = Math.round(scale * 100)
  const nameBox = selectionName(
    controller.selection,
    (column, row) => `${columnName(column)}${row + 1}`,
    columnName,
  )
  const formulaText = cellText(activeCell)

  // `Enter` and `Tab` in the formula bar carry the selection onward, exactly as
  // they do inside the cell the bar is editing.
  const moveActive = useCallback((columnStep: number, rowStep: number): void => {
    controller.goTo(pointReference(movePoint(active, columnStep, rowStep, sheet.extent)))
  }, [active, controller, sheet.extent])

  const recordBar = useCallback((): void => {
    if (barDraft === undefined) return
    editing.record(active, barDraft)
    setBarDraft(undefined)
  }, [active, barDraft, editing])

  const handleBarKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const action = editActionFor(event.key, event.shiftKey)
    if (action === undefined) return
    event.preventDefault()
    if (action.kind === 'cancel') setBarDraft(undefined)
    else {
      recordBar()
      moveActive(action.columnStep, action.rowStep)
    }
  }

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
        <input
          className={css.formulaValue}
          value={barDraft ?? formulaText}
          placeholder={t('emptyCell')}
          aria-label={t('formulaBar')}
          data-xlsx-formula-value
          spellCheck={false}
          autoComplete="off"
          onFocus={() => { setBarDraft(formulaText) }}
          onChange={(event) => { setBarDraft(event.target.value) }}
          onKeyDown={handleBarKeyDown}
          // Leaving the bar confirms what it holds, as Excel's does.
          onBlur={recordBar}
        />
        <div className={css.barActions}>
          <button
            type="button"
            className={css.tool}
            aria-label={t('undo')}
            data-xlsx-undo
            disabled={!editing.canUndo}
            onClick={editing.undo}
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className={css.tool}
            aria-label={t('redo')}
            data-xlsx-redo
            disabled={!editing.canRedo}
            onClick={editing.redo}
          >
            <RedoIcon />
          </button>
          {editing.dirty && <span className={css.dirty} title={t('unsaved')} data-xlsx-dirty />}
          <button
            type="button"
            className={css.tool}
            aria-label={t('save')}
            data-xlsx-save
            disabled={!editing.dirty || editing.saving}
            onClick={() => { void editing.save() }}
          >
            <SaveIcon />
          </button>
        </div>
      </div>
      {editing.saveError !== undefined && (
        <p className={css.saveError} role="alert" data-xlsx-save-error>
          {t('failure.generic', { message: editing.saveError })}
        </p>
      )}
      <div className={css.viewport}>
        <SheetGrid
          sheet={sheet}
          scale={scale}
          resizeObserver={bindStage}
          controller={controller}
          selectAllLabel={t('selectAll')}
          editing={{
            ...editing,
            editLabel: t('editCell'),
            editHint: t('editing'),
          }}
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
              {summary.totals !== undefined && (
                <span data-xlsx-summary-average>
                  {t('summaryAverage', { value: formatSummary(summary.totals.average) })}
                </span>
              )}
              <span data-xlsx-summary-count>
                {t('summaryCount', { value: formatSummary(summary.count) })}
              </span>
              {summary.totals !== undefined && (
                <span data-xlsx-summary-sum>
                  {t('summarySum', { value: formatSummary(summary.totals.sum) })}
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
