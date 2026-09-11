// @vitest-environment jsdom
/** The edit log, and the editor the workbook body drives through it. */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSheetEditing } from '../src/client/render/useSheetEditing.ts'
import { SAVED_COPY_NAME } from '../src/client/save.ts'
import type { XlsxWorkbook } from '../src/client/xlsx/model.ts'
import { parseXlsx } from '../src/client/xlsx/workbook.ts'
import { makeCell, makeSheet } from './sheet-fixture.client.ts'
import { xlsxFixture } from './xlsx-fixture.client.ts'

// The writer is replaceable so a spec can hold a save open, refuse it, or find
// nothing to write, none of which a real package can be made to do on demand.
// Left unset, the real writer runs and the spec reads the bytes it produced.
const writer = vi.hoisted(() => ({
  current: undefined as undefined | (() => Promise<Uint8Array | undefined>),
}))

vi.mock('../src/client/xlsx/serialize.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/xlsx/serialize.ts')>()
  return {
    ...actual,
    buildEditedWorkbook: (...args: Parameters<typeof actual.buildEditedWorkbook>): Promise<Uint8Array | undefined> => (
      writer.current === undefined ? actual.buildEditedWorkbook(...args) : writer.current()
    ),
  }
})

/** A two-sheet workbook over fixtures small enough to state in full. */
function workbookOf(date1904 = false): XlsxWorkbook {
  return {
    date1904,
    sheets: [
      makeSheet({ columns: 2, rows: 2, cells: [makeCell(0, 0, 'Region'), makeCell(1, 1, 'North')] }),
      { ...makeSheet({ cells: [makeCell(0, 0, 'Other')] }), index: 2, name: 'Data' },
    ],
  }
}

/** A one-sheet workbook carrying a merge region, for the anchoring specs. */
function mergedWorkbook(): XlsxWorkbook {
  return {
    date1904: false,
    sheets: [makeSheet({ columns: 2, rows: 2, merges: [{ top: 0, left: 0, bottom: 1, right: 1 }] })],
  }
}

/** The clipboard jsdom ships with, restored after every spec. */
const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

/** Replace `navigator.clipboard`, or remove it to stand in for a page without one. */
function stubClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

/** The download globals jsdom ships with, restored after every spec. */
const createObjectURL = URL.createObjectURL
const revokeObjectURL = URL.revokeObjectURL
const click = HTMLAnchorElement.prototype.click

/** What one save asked the browser to do. */
interface Downloads {
  readonly blobs: Blob[]
  readonly names: string[]
}

/**
 * Record the download a save performs, which jsdom cannot carry out.
 * @returns the recorded downloads.
 */
function recordDownloads(): Downloads {
  const record: Downloads = { blobs: [], names: [] }
  URL.createObjectURL = (blob: Blob): string => {
    record.blobs.push(blob)
    return `blob:saved/${record.blobs.length}`
  }
  URL.revokeObjectURL = (): void => {}
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement): void {
    record.names.push(this.download)
  }
  return record
}

/**
 * Mount the hook over a workbook.
 * @param options - the workbook, the sheet to show, and the package bytes.
 * @returns the mounted hook.
 */
function mount(options: {
  readonly workbook?: XlsxWorkbook
  readonly index?: number
  readonly data?: Uint8Array
} = {}): ReturnType<typeof renderHook<ReturnType<typeof useSheetEditing>, { index: number; data: Uint8Array | undefined }>> {
  const workbook = options.workbook ?? workbookOf()
  return renderHook(
    (props: { readonly index: number; readonly data: Uint8Array | undefined }) => (
      useSheetEditing(workbook, props.index, props.data)
    ),
    { initialProps: { index: options.index ?? 1, data: options.data } },
  )
}

/** Every cell one edited sheet still carries, in sheet order. */
function cellsOf(mounted: ReturnType<typeof mount>, index = 1): readonly string[] {
  const sheet = mounted.result.current.edited.sheets.find(entry => entry.index === index)
  return sheet === undefined ? [] : sheet.rows.flatMap(row => row.cells).map(cell => cell.text)
}

afterEach(() => {
  writer.current = undefined
  if (clipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard')
  else Object.defineProperty(navigator, 'clipboard', clipboard)
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  HTMLAnchorElement.prototype.click = click
})

describe('useSheetEditing: the editor', () => {
  it('records a typed entry and folds it into the workbook the grid draws', () => {
    const mounted = mount()
    expect(mounted.result.current.dirty).toBe(false)

    act(() => { mounted.result.current.begin({ column: 0, row: 1 }, 'replace', 'South') })
    expect(mounted.result.current.open).toEqual({ column: 0, row: 1, entry: 'replace', text: 'South' })

    act(() => { mounted.result.current.commit() })
    expect(mounted.result.current.open).toBeUndefined()
    expect(mounted.result.current.dirty).toBe(true)
    // Row by row, left to right: the new A2 lands ahead of the B2 beside it.
    expect(cellsOf(mounted)).toEqual(['Region', 'South', 'North'])
  })

  it('opens F2 on the value the cell already holds', () => {
    const mounted = mount()
    act(() => { mounted.result.current.begin({ column: 1, row: 1 }, 'append', '') })
    expect(mounted.result.current.open?.text).toBe('North')
  })

  it('opens on nothing at all for an empty cell', () => {
    const mounted = mount()
    act(() => { mounted.result.current.begin({ column: 0, row: 1 }, 'append', '') })
    expect(mounted.result.current.open?.text).toBe('')
  })

  it('replaces the draft a field reports', () => {
    const mounted = mount()
    act(() => { mounted.result.current.begin({ column: 0, row: 1 }, 'replace', 'S') })
    act(() => { mounted.result.current.draft('South') })
    expect(mounted.result.current.open?.text).toBe('South')
  })

  it('drops a draft that arrives after the editor closed', () => {
    const mounted = mount()
    act(() => { mounted.result.current.draft('South') })
    expect(mounted.result.current.open).toBeUndefined()
    expect(mounted.result.current.dirty).toBe(false)
  })

  it('leaves the workbook clean when a confirmed edit changed nothing', () => {
    const mounted = mount()
    act(() => { mounted.result.current.begin({ column: 0, row: 0 }, 'append', '') })
    act(() => { mounted.result.current.commit() })
    expect(mounted.result.current.dirty).toBe(false)
    expect(cellsOf(mounted)).toEqual(['Region', 'North'])
  })

  it('does nothing when a commit arrives with no editor open', () => {
    const mounted = mount()
    act(() => { mounted.result.current.commit() })
    expect(mounted.result.current.dirty).toBe(false)
  })

  it('abandons a draft on cancel', () => {
    const mounted = mount()
    act(() => { mounted.result.current.begin({ column: 0, row: 1 }, 'replace', 'South') })
    act(() => { mounted.result.current.cancel() })
    expect(mounted.result.current.open).toBeUndefined()
    expect(mounted.result.current.dirty).toBe(false)
  })

  it('edits the anchor of a merged region whatever position the reader picked', () => {
    const mounted = mount({ workbook: mergedWorkbook() })
    act(() => { mounted.result.current.begin({ column: 1, row: 1 }, 'replace', 'Title') })
    expect(mounted.result.current.open).toEqual({ column: 0, row: 0, entry: 'replace', text: 'Title' })
    act(() => { mounted.result.current.commit() })
    expect(cellsOf(mounted)).toEqual(['Title'])
  })
})

describe('useSheetEditing: the formula bar', () => {
  it('records a draft typed outside the grid', () => {
    const mounted = mount()
    act(() => { mounted.result.current.record({ column: 0, row: 1 }, '5') })
    expect(mounted.result.current.dirty).toBe(true)
    expect(cellsOf(mounted)).toEqual(['Region', '5', 'North'])
  })

  it('anchors a draft typed against a position inside a merged region', () => {
    const mounted = mount({ workbook: mergedWorkbook() })
    act(() => { mounted.result.current.record({ column: 1, row: 1 }, 'Title') })
    expect(cellsOf(mounted)).toEqual(['Title'])
  })
})

describe('useSheetEditing: clearing', () => {
  it('empties the populated cells a rectangle covers', () => {
    const mounted = mount()
    act(() => { mounted.result.current.clear({ top: 0, left: 0, bottom: 1, right: 1 }) })
    expect(mounted.result.current.dirty).toBe(true)
    expect(cellsOf(mounted)).toEqual([])
  })

  it('records nothing when a clear covers no populated cell', () => {
    const mounted = mount()
    act(() => { mounted.result.current.clear({ top: 0, left: 1, bottom: 0, right: 1 }) })
    expect(mounted.result.current.dirty).toBe(false)
  })
})

describe('useSheetEditing: the clipboard', () => {
  const rectangle = { top: 0, left: 0, bottom: 1, right: 1 }

  it('puts a rectangle on the clipboard as tab-separated text', async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    stubClipboard({ writeText })
    const mounted = mount()
    act(() => { mounted.result.current.copy(rectangle) })
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith('Region\t\n\tNorth') })
    expect(mounted.result.current.dirty).toBe(false)
  })

  it('clears a rectangle after copying it, the way cut does', async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    stubClipboard({ writeText })
    const mounted = mount()
    act(() => { mounted.result.current.cut(rectangle) })
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith('Region\t\n\tNorth') })
    expect(cellsOf(mounted)).toEqual([])
  })

  it('copies without clearing when a cut covers no populated cell', async () => {
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    stubClipboard({ writeText })
    const mounted = mount()
    act(() => { mounted.result.current.cut({ top: 0, left: 1, bottom: 0, right: 1 }) })
    await waitFor(() => { expect(writeText).toHaveBeenCalled() })
    expect(mounted.result.current.dirty).toBe(false)
  })

  it('writes the clipboard’s rectangle from the position a paste lands on', async () => {
    stubClipboard({ readText: vi.fn<() => Promise<string>>().mockResolvedValue('1\t2\n3\t4') })
    const mounted = mount()
    act(() => { mounted.result.current.paste({ column: 1, row: 1 }) })
    await waitFor(() => { expect(mounted.result.current.dirty).toBe(true) })
    const rows = mounted.result.current.edited.sheets[0].rows
    expect(rows.find(row => row.index === 1)?.cells.map(cell => cell.text)).toEqual(['1', '2'])
    expect(rows.find(row => row.index === 2)?.cells.map(cell => cell.text)).toEqual(['3', '4'])
  })

  it('interprets a pasted entry the way a typed one is interpreted', async () => {
    stubClipboard({ readText: vi.fn<() => Promise<string>>().mockResolvedValue('=B2*2') })
    const mounted = mount()
    act(() => { mounted.result.current.paste({ column: 0, row: 1 }) })
    await waitFor(() => { expect(mounted.result.current.dirty).toBe(true) })
    const cell = mounted.result.current.edited.sheets[0].rows
      .find(row => row.index === 1)?.cells.find(entry => entry.column === 0)
    expect(cell?.formula).toBe('B2*2')
  })

  it('ignores a paste whose clipboard is empty', async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue('')
    stubClipboard({ readText })
    const mounted = mount()
    act(() => { mounted.result.current.paste({ column: 0, row: 0 }) })
    await waitFor(() => { expect(readText).toHaveBeenCalled() })
    expect(mounted.result.current.dirty).toBe(false)
  })

  it('ignores a paste whose clipboard cannot be read', async () => {
    const readText = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('denied'))
    stubClipboard({ readText })
    const mounted = mount()
    act(() => { mounted.result.current.paste({ column: 0, row: 0 }) })
    await waitFor(() => { expect(readText).toHaveBeenCalled() })
    expect(mounted.result.current.dirty).toBe(false)
  })
})

describe('useSheetEditing: filling', () => {
  /** A sheet carrying the start of a run of numbers. */
  const numbered = (): XlsxWorkbook => ({
    date1904: false,
    sheets: [makeSheet({
      columns: 1,
      rows: 3,
      cells: [
        makeCell(0, 0, '1', undefined, { raw: '1', kind: 'number' }),
        makeCell(0, 1, '2', undefined, { raw: '2', kind: 'number' }),
      ],
    })],
  })

  it('continues a run of numbers into the rectangle a drag reached', () => {
    const mounted = mount({ workbook: numbered() })
    act(() => {
      mounted.result.current.fill({ top: 0, left: 0, bottom: 1, right: 0 }, { top: 0, left: 0, bottom: 2, right: 0 })
    })
    expect(mounted.result.current.edited.sheets[0].rows.map(row => row.cells[0].text)).toEqual(['1', '2', '3'])
  })

  it('repeats a block that is not a run', () => {
    const mounted = mount()
    act(() => {
      mounted.result.current.fill({ top: 0, left: 0, bottom: 0, right: 0 }, { top: 0, left: 0, bottom: 1, right: 0 })
    })
    expect(cellsOf(mounted)).toEqual(['Region', 'Region', 'North'])
  })
})

describe('useSheetEditing: the history', () => {
  /** Record one typed entry, so the history has something to step. */
  function typed(mounted: ReturnType<typeof mount>): void {
    act(() => { mounted.result.current.begin({ column: 0, row: 1 }, 'replace', 'South') })
    act(() => { mounted.result.current.commit() })
  }

  it('steps the history back and forward', () => {
    const mounted = mount()
    typed(mounted)
    expect(mounted.result.current.canUndo).toBe(true)
    expect(mounted.result.current.canRedo).toBe(false)

    act(() => { mounted.result.current.undo() })
    expect(mounted.result.current.dirty).toBe(false)
    expect(mounted.result.current.canUndo).toBe(false)
    expect(mounted.result.current.canRedo).toBe(true)

    act(() => { mounted.result.current.redo() })
    expect(mounted.result.current.dirty).toBe(true)
    expect(mounted.result.current.canRedo).toBe(false)
  })

  it('holds nothing to step before the first edit', () => {
    const mounted = mount()
    act(() => { mounted.result.current.undo() })
    act(() => { mounted.result.current.redo() })
    expect(mounted.result.current.canUndo).toBe(false)
    expect(mounted.result.current.canRedo).toBe(false)
    expect(mounted.result.current.dirty).toBe(false)
  })

  it('keeps each sheet’s edits apart', () => {
    const mounted = mount()
    typed(mounted)
    expect(cellsOf(mounted)).toEqual(['Region', 'South', 'North'])

    // The second sheet carries none of the first sheet's work.
    act(() => { mounted.rerender({ index: 2, data: undefined }) })
    expect(cellsOf(mounted, 2)).toEqual(['Other'])

    act(() => { mounted.result.current.begin({ column: 0, row: 1 }, 'replace', 'East') })
    act(() => { mounted.result.current.commit() })
    expect(cellsOf(mounted, 2)).toEqual(['Other', 'East'])
    expect(mounted.result.current.dirty).toBe(true)

    act(() => { mounted.rerender({ index: 1, data: undefined }) })
    expect(cellsOf(mounted)).toEqual(['Region', 'South', 'North'])
  })
})

describe('useSheetEditing: saving', () => {
  it('downloads a copy under the workbook’s own name', async () => {
    const record = recordDownloads()
    writer.current = () => Promise.resolve(new Uint8Array([1, 2, 3]))
    const mounted = mount({ data: new Uint8Array([9]) })
    await act(async () => { await mounted.result.current.save() })
    expect(record.names).toEqual([SAVED_COPY_NAME])
    expect(record.blobs[0].size).toBe(3)
    expect(mounted.result.current.saveError).toBeUndefined()
    expect(mounted.result.current.saving).toBe(false)
  })

  it('downloads nothing when the writer finds nothing to write', async () => {
    const record = recordDownloads()
    writer.current = () => Promise.resolve(undefined)
    const mounted = mount({ data: new Uint8Array([9]) })
    await act(async () => { await mounted.result.current.save() })
    expect(record.names).toEqual([])
    expect(mounted.result.current.saveError).toBeUndefined()
  })

  it('saves nothing when the package bytes are not in hand', async () => {
    const record = recordDownloads()
    const mounted = mount()
    await act(async () => { await mounted.result.current.save() })
    expect(record.names).toEqual([])
    expect(mounted.result.current.saveError).toBeUndefined()
  })

  it('reports a save the writer refused rather than throwing it at the reader', async () => {
    const record = recordDownloads()
    writer.current = () => Promise.reject(new Error('the package carries a ZIP64 part'))
    const mounted = mount({ data: new Uint8Array([9]) })
    await act(async () => { await mounted.result.current.save() })
    expect(record.names).toEqual([])
    expect(mounted.result.current.saveError).toBe('the package carries a ZIP64 part')
    expect(mounted.result.current.saving).toBe(false)
  })

  it('reports a writer that refused with something other than an error', async () => {
    // The non-Error refusal is the case under test.
    writer.current = () => Promise.reject('nope')
    const mounted = mount({ data: new Uint8Array([9]) })
    await act(async () => { await mounted.result.current.save() })
    expect(mounted.result.current.saveError).toBe('nope')
  })

  it('refuses a second save while the first is still in flight', async () => {
    const record = recordDownloads()
    let release: ((bytes: Uint8Array) => void) | undefined
    writer.current = () => new Promise<Uint8Array>((resolve) => { release = resolve })
    const mounted = mount({ data: new Uint8Array([9]) })

    await act(async () => { void mounted.result.current.save() })
    expect(mounted.result.current.saving).toBe(true)

    await act(async () => { await mounted.result.current.save() })
    await act(async () => { release?.(new Uint8Array([7])) })
    expect(record.names).toEqual([SAVED_COPY_NAME])
    expect(mounted.result.current.saving).toBe(false)
  })

  it('writes the reader’s edit into a package that reads back', async () => {
    const data = await xlsxFixture()
    const record = recordDownloads()
    const mounted = mount({ data })
    act(() => { mounted.result.current.begin({ column: 0, row: 1 }, 'replace', 'South') })
    act(() => { mounted.result.current.commit() })
    await act(async () => { await mounted.result.current.save() })
    expect(record.names).toEqual([SAVED_COPY_NAME])
    expect(mounted.result.current.saveError).toBeUndefined()

    const saved = new Uint8Array(await record.blobs[0].arrayBuffer())
    const reparsed = await parseXlsx(saved, { sheetName: (index: number) => `Sheet ${index}` })
    try {
      const cell = reparsed.workbook.sheets[0].rows
        .flatMap(row => row.cells)
        .find(entry => entry.reference === 'A2')
      expect(cell?.text).toBe('South')
    } finally {
      reparsed.dispose()
    }
  })
})
