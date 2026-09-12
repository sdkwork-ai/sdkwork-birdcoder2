/**
 * The reader's edits, and the editor they are made through.
 *
 * Everything a reader types lands in one place — a log of final cell states,
 * held per sheet — and the grid draws the workbook with that log folded over the
 * parsed model. Nothing is written back to the document: the preview contract is
 * read-only, so an edited workbook leaves through a downloaded copy, and the log
 * is what that copy is built from.
 *
 * The undo history is a stack of whole logs rather than a stack of inverse
 * operations, which is why an undo is exact and cannot drift from the edits it
 * reverses.
 *
 * A commit that changes nothing is dropped rather than recorded, so opening the
 * editor on a cell and confirming it leaves the workbook clean — the same thing
 * Excel does when `F2` is followed straight by `Enter`.
 */
import { useCallback, useMemo, useState } from 'react'
import { readClipboard, writeClipboard } from '../clipboard.ts'
import { saveCopy } from '../save.ts'
import { parseCellEntry } from '../xlsx/edits.ts'
import type { XlsxEditSession } from '../xlsx/edits.ts'
import { NO_EDITS, applyWorkbookEdits, commitEdits, hasEdits, redoEdits, undoEdits } from '../xlsx/edits.ts'
import type { XlsxSheet, XlsxWorkbook } from '../xlsx/model.ts'
import { buildEditedWorkbook } from '../xlsx/serialize.ts'
import { columnName } from '../xlsx/workbook.ts'
import { cellAt, buildMergeIndex } from './cells.ts'
import {
  cellEntryOf, cellText, clearedEntries, editSeed, fillDownEntries, fillEntries, fillRightEntries,
  mergeAnchor, occupiedReferences, pasteEntries, sameEntry, selectionEntries, selectionToTsv,
} from './editing.ts'
import type { EditEntry, OpenEditor } from './editing.ts'
import type { GridPoint, SelectionBounds } from './selection.ts'

/** Everything the workbook body needs to let a reader edit a sheet. */
export interface SheetEditor {
  /** The in-cell editor that is open, when one is. */
  readonly open: OpenEditor | undefined
  /** The workbook with every edit folded in, which is what the grid draws. */
  readonly edited: XlsxWorkbook
  /**
   * The rectangle the clipboard holds, when one does; the marching-ants outline
   * the grid draws tracks it.
   */
  readonly clipboard: SelectionBounds | undefined
  /** Whether the reader has work that is not in the document on disk. */
  readonly dirty: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** Whether a save is in flight. */
  readonly saving: boolean
  /** Why the last save failed, when it did. */
  readonly saveError: string | undefined
  /** Open the editor on a cell, seeded the way the key press asked. */
  begin: (point: GridPoint, entry: EditEntry, typed: string) => void
  /** Replace the open editor's draft. */
  draft: (text: string) => void
  /** Record the open editor's draft and close it. */
  commit: () => void
  /** Close the open editor, leaving the cell as it was. */
  cancel: () => void
  /** Record a draft typed somewhere other than the grid, as the formula bar is. */
  record: (point: GridPoint, text: string) => void
  /** Take the marching-ants outline down, as `Escape` does. */
  cancelClipboard: () => void
  /** Clear every populated cell a rectangle covers. */
  clear: (bounds: SelectionBounds) => void
  /** Put a rectangle on the clipboard as tab-separated text. */
  copy: (bounds: SelectionBounds) => void
  /** Copy a rectangle and then clear it, the way Excel's cut does. */
  cut: (bounds: SelectionBounds) => void
  /** Write the clipboard's text from a top-left position. */
  paste: (point: GridPoint) => void
  /** Extend a rectangle into the filled rectangle a drag chose. */
  fill: (source: SelectionBounds, target: SelectionBounds) => void
  /** Copy each selected column's top cell over the rows beneath it. */
  fillDown: (bounds: SelectionBounds) => void
  /** Copy each selected row's left cell across the columns beside it. */
  fillRight: (bounds: SelectionBounds) => void
  undo: () => void
  redo: () => void
  /** Download the edited workbook as a copy. */
  save: () => Promise<void>
}

/**
 * Bind the edit log and the in-cell editor to a workbook.
 *
 * The log is keyed by the sheet's own 1-based index, which is the key the model
 * and the serializer both use, so moving between sheets keeps each one's edits.
 * @param workbook - the workbook as parsed.
 * @param sheetIndex - the sheet the grid shows, as its own 1-based index.
 * @param data - the package bytes the workbook was parsed from, absent while a
 * read is still in flight.
 * @returns the edit state and the operations the surfaces perform on it.
 */
export function useSheetEditing(
  workbook: XlsxWorkbook,
  sheetIndex: number,
  data: Uint8Array | undefined,
): SheetEditor {
  const [session, setSession] = useState<XlsxEditSession>(NO_EDITS)
  const [open, setOpen] = useState<OpenEditor>()
  // The rectangle the clipboard holds, which the grid outlines with marching
  // ants until a paste spends it or `Escape` puts it away.
  const [clipboard, setClipboard] = useState<SelectionBounds>()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  // A parsed workbook always carries at least one sheet, so clamping the index
  // into the list always names one.
  const sheet: XlsxSheet = workbook.sheets[Math.min(Math.max(0, sheetIndex - 1), workbook.sheets.length - 1)]
  const date1904 = workbook.date1904
  const merges = useMemo(
    () => buildMergeIndex(sheet, (column, row) => `${columnName(column)}${row + 1}`),
    [sheet],
  )
  const edited = useMemo(() => applyWorkbookEdits(workbook, session.present), [session.present, workbook])

  const record = useCallback((point: GridPoint, text: string): void => {
    const anchor = mergeAnchor(merges, point)
    const entry = parseCellEntry(text, date1904)
    if (sameEntry(cellEntryOf(cellAt(sheet, anchor.column, anchor.row)), entry)) return
    setSession(live => commitEdits(
      live,
      sheet.index,
      new Map([[`${columnName(anchor.column)}${anchor.row + 1}`, entry]]),
    ))
  }, [date1904, merges, sheet])

  const begin = useCallback((point: GridPoint, entry: EditEntry, typed: string): void => {
    const anchor = mergeAnchor(merges, point)
    setOpen({
      column: anchor.column,
      row: anchor.row,
      entry,
      text: editSeed(entry, cellText(cellAt(sheet, anchor.column, anchor.row)), typed),
    })
  }, [merges, sheet])

  const draft = useCallback((text: string): void => {
    // A key press can arrive between the commit that closed an editor and the
    // render that removes it, so a draft with nothing open is simply dropped.
    setOpen(current => (current === undefined ? current : { ...current, text }))
  }, [])

  const commit = useCallback((): void => {
    if (open === undefined) return
    record({ column: open.column, row: open.row }, open.text)
    setOpen(undefined)
  }, [open, record])

  const cancel = useCallback((): void => { setOpen(undefined) }, [])

  const cancelClipboard = useCallback((): void => { setClipboard(undefined) }, [])

  const clear = useCallback((bounds: SelectionBounds): void => {
    const references = occupiedReferences(sheet, bounds)
    if (references.length === 0) return
    setSession(live => commitEdits(live, sheet.index, clearedEntries(references)))
  }, [sheet])

  const copy = useCallback((bounds: SelectionBounds): void => {
    void writeClipboard(selectionToTsv(sheet, bounds))
    setClipboard(bounds)
  }, [sheet])

  const cut = useCallback((bounds: SelectionBounds): void => {
    void writeClipboard(selectionToTsv(sheet, bounds))
    setClipboard(bounds)
    const references = occupiedReferences(sheet, bounds)
    if (references.length === 0) return
    setSession(live => commitEdits(live, sheet.index, clearedEntries(references)))
  }, [sheet])

  const paste = useCallback((point: GridPoint): void => {
    void readClipboard().then((text) => {
      if (text === undefined || text === '') return
      // A paste spends the clipboard, which is what takes Excel's ants down.
      setClipboard(undefined)
      setSession(live => commitEdits(live, sheet.index, pasteEntries(text, point, date1904)))
    })
  }, [date1904, sheet])

  const fill = useCallback((source: SelectionBounds, target: SelectionBounds): void => {
    setSession(live => commitEdits(live, sheet.index, fillEntries(selectionEntries(sheet, source), target)))
  }, [sheet])

  const fillDown = useCallback((bounds: SelectionBounds): void => {
    setSession(live => commitEdits(live, sheet.index, fillDownEntries(sheet, bounds)))
  }, [sheet])

  const fillRight = useCallback((bounds: SelectionBounds): void => {
    setSession(live => commitEdits(live, sheet.index, fillRightEntries(sheet, bounds)))
  }, [sheet])

  const undo = useCallback((): void => { setSession(live => undoEdits(live)) }, [])

  const redo = useCallback((): void => { setSession(live => redoEdits(live)) }, [])

  const save = useCallback(async (): Promise<void> => {
    if (data === undefined || saving) return
    setSaving(true)
    setSaveError(undefined)
    try {
      const bytes = await buildEditedWorkbook(data, workbook, session.present)
      if (bytes !== undefined) saveCopy(bytes)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [data, saving, session.present, workbook])

  return {
    open,
    edited,
    clipboard,
    dirty: hasEdits(session),
    canUndo: session.past.length > 0,
    canRedo: session.future.length > 0,
    saving,
    saveError,
    begin,
    draft,
    commit,
    cancel,
    record,
    cancelClipboard,
    clear,
    copy,
    cut,
    paste,
    fill,
    fillDown,
    fillRight,
    undo,
    redo,
    save,
  }
}
