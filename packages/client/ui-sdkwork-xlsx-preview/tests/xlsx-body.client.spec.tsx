// @vitest-environment jsdom
/** Excel body: window chrome, the sheet grid, selection, and failures. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewState } from '@deepseek-ai/dsh-client-sdkwork-office'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { XlsxBody } from '../src/client/XlsxBody.tsx'
import type { XlsxBodyProps } from '../src/client/XlsxBody.tsx'
import { xlsxFixture } from './xlsx-fixture.client.ts'
import type { XlsxFixtureOptions } from './xlsx-fixture.client.ts'
import { zh } from '../src/client/locales.ts'

/**
 * The save the body performs, recorded rather than handed to a browser.
 *
 * jsdom has no download of its own, so the one seam that reaches for it stands
 * in here; a spec can also make it refuse, which is how the alert the body
 * shows for a workbook the editor cannot rewrite is reached.
 */
const saving = vi.hoisted(() => ({
  copies: [] as Uint8Array[],
  /** The message a save fails with, when a spec wants it to fail. */
  refuse: undefined as string | undefined,
}))

vi.mock('../src/client/save.ts', () => ({
  SAVED_COPY_NAME: 'workbook.xlsx',
  WORKBOOK_MIME: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  saveCopy: (bytes: Uint8Array): void => {
    if (saving.refuse !== undefined) throw new Error(saving.refuse)
    saving.copies.push(bytes)
  },
}))

/** A live store instance, as the slot would create one per Session. */
type StoreInstance = {
  readonly getSnapshot: () => PagedViewState
  readonly subscribe: (listener: () => void) => () => void
  readonly actions: {
    readonly index: (tabId: never, index: number) => void
    readonly zoom: (tabId: never, zoom: number | 'fit') => void
  }
}

/** The zoom the store holds for the single tab these specs mount. */
function zoomOf(store: StoreInstance): number | 'fit' | undefined {
  return store.getSnapshot().byTab['tab-1' as never]?.zoom
}

/** The sheet index the store holds for the single tab these specs mount. */
function indexOf(store: StoreInstance): number | undefined {
  return store.getSnapshot().byTab['tab-1' as never]?.index
}

/** Build the composed props the slot would hand the body. */
function propsFor(data: Uint8Array | undefined, store: StoreInstance): XlsxBodyProps {
  const controller = new AbortController()
  return {
    content: data === undefined
      ? { kind: 'text', text: 'not bytes', pages: [], eof: true }
      : { kind: 'bytes', data: data as Uint8Array<ArrayBuffer> },
    resourceAddress: 'dsh-resource://file/session/s1/book.xlsx',
    wrap: false,
    scrollportRef: vi.fn(),
    useTabInfo: () => ({
      tab: {
        id: 'tab-1',
        contentId: 'dsh-resource://file/session/s1/book.xlsx',
        signal: controller.signal,
        navigation: { revision: 0 },
      },
    }),
    // The selector is the real one a tab store would receive.
    useStore: <T,>(select: (state: PagedViewState) => T): T => useSyncExternalStore(
      store.subscribe,
      () => select(store.getSnapshot()),
    ),
    actions: store.actions,
    t: makeTranslate(zh),
  } as unknown as XlsxBodyProps
}

/** Render the body over a fixture and wait for its grid. */
async function mount(options: XlsxFixtureOptions = {}): Promise<StoreInstance> {
  const data = await xlsxFixture(options)
  const store = defineStore(pagedViewStore).create()
  render(<XlsxBody {...propsFor(data, store)} />)
  await waitFor(() => { expect(document.querySelector('[data-xlsx-stage]')).toBeTruthy() })
  return store
}

/** The element carrying a data attribute these specs address a cell by. */
function cell(reference: string): HTMLElement {
  const node = document.querySelector(`[data-xlsx-cell="${reference}"]`)
  if (node === null) throw new Error(`cell ${reference} is not mounted`)
  return node as HTMLElement
}

/** The Name Box's current text. */
function nameBox(): string | undefined {
  return document.querySelector<HTMLInputElement>('[data-xlsx-name-box]')?.value
}

/** The formula bar's current text. */
function formulaValue(): string | undefined {
  return document.querySelector<HTMLInputElement>('[data-xlsx-formula-value]')?.value
}

/** The formula bar's field, for the specs that type into it. */
function formulaField(): HTMLInputElement {
  const bar = document.querySelector<HTMLInputElement>('[data-xlsx-formula-value]')
  if (bar === null) throw new Error('the formula bar is not mounted')
  return bar
}

describe('XlsxBody', () => {
  afterEach(cleanup)

  beforeEach(() => {
    saving.copies = []
    saving.refuse = undefined
  })

  it('shows a progress line, then the sheet tabs and the selected grid', async () => {
    const data = await xlsxFixture()
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(data, store)} />)
    expect(screen.getByText('正在解析工作簿…')).toBeTruthy()

    await waitFor(() => { expect(screen.getByRole('tablist')).toBeTruthy() })
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByRole('grid').getAttribute('aria-label')).toBe('Summary')
    expect(screen.getByText('1 / 2')).toBeTruthy()
    // The grid carries the fixture's merged header, and the hidden column C
    // never reaches the column band.
    expect(cell('A1').textContent).toBe('Region')
    expect(document.querySelector('[data-xlsx-column-header="C"]')).toBeNull()
    expect(document.querySelector('[data-xlsx-column-header="D"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '第 2 个工作表' }))
    await waitFor(() => { expect(indexOf(store)).toBe(2) })
    await waitFor(() => { expect(screen.getByRole('grid').getAttribute('aria-label')).toBe('Data') })
  })

  it('shows the selected cell and its raw value in the formula bar', async () => {
    await mount()

    expect(nameBox()).toBe('A1')
    expect(formulaValue()).toBe('Region')
    // A shared string reaches the formula bar, so the cell is addressed by its
    // reference rather than by its text.
    fireEvent.pointerDown(cell('A2'))
    await waitFor(() => { expect(nameBox()).toBe('A2') })
    expect(formulaValue()).toBe('North')
  })

  it('shows a formula rather than its cached value', async () => {
    await mount()

    fireEvent.pointerDown(cell('F2'))
    await waitFor(() => { expect(formulaValue()).toBe('=B2*2') })
    // The grid still prints the cached value the workbook stored.
    expect(cell('F2').textContent).toBe('88394')
  })

  it('reports the selection’s average, count, and sum in the status bar', async () => {
    await mount()

    // The initial selection is the text header, so the readout carries a count
    // and nothing to total.
    expect(screen.getByText('计数: 1')).toBeTruthy()
    expect(document.querySelector('[data-xlsx-summary-average]')).toBeNull()
    expect(document.querySelector('[data-xlsx-summary-sum]')).toBeNull()

    // F2's cached value is 88394 — a number, so both numeric facts appear.
    // Column C is hidden in this fixture, so the next visible numeric cell is F.
    fireEvent.pointerDown(cell('F2'))
    await waitFor(() => { expect(document.querySelector('[data-xlsx-summary-sum]')).toBeTruthy() })
    expect(screen.getByText('求和: 88,394')).toBeTruthy()
    expect(screen.getByText('平均值: 88,394')).toBeTruthy()

    // A cell the workbook never wrote carries nothing, so there is no readout
    // to show at all.
    fireEvent.pointerDown(cell('A4'))
    await waitFor(() => { expect(document.querySelector('[data-xlsx-summary]')).toBeNull() })
  })

  it('walks the grid with the arrow keys and extends with Shift', async () => {
    await mount()
    const stage = document.querySelector('[data-xlsx-stage]') as HTMLElement

    fireEvent.keyDown(stage, { key: 'ArrowDown' })
    await waitFor(() => { expect(nameBox()).toBe('A2') })
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    await waitFor(() => { expect(nameBox()).toBe('B2') })
    fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true })
    await waitFor(() => { expect(nameBox()).toBe('B2:C2') })
    fireEvent.keyDown(stage, { key: 'Escape' })
    expect(nameBox()).toBe('B2:C2')
  })

  it('selects a whole column and a whole row from the header bands', async () => {
    await mount({ rows: 2 })
    const headers = [...document.querySelectorAll<HTMLElement>('[data-xlsx-column-header]')]
    expect(headers.length).toBeGreaterThan(1)
    const column = headers[1].dataset.xlsxColumnHeader ?? ''

    fireEvent.pointerDown(headers[1])
    await waitFor(() => { expect(nameBox()).toBe(`${column}:${column}`) })
    const rows = [...document.querySelectorAll<HTMLElement>('[data-xlsx-row-header]')]
    fireEvent.pointerDown(rows[0])
    await waitFor(() => { expect(nameBox()).toBe(`${rows[0].dataset.xlsxRowHeader}:${rows[0].dataset.xlsxRowHeader}`) })
  })

  it('opens the editor on the cell a double click lands in', async () => {
    await mount()

    fireEvent.doubleClick(cell('A2'))
    // The field replaces the cell's own painting and holds what it held, so a
    // reader amends the value rather than typing it again.
    await waitFor(() => {
      const editor = document.querySelector<HTMLInputElement>('[data-xlsx-cell-editor]')
      expect(editor?.value).toBe('North')
    })
  })

  it('records an edit typed into the formula bar, and saves the copy', async () => {
    await mount()
    const bar = formulaField()

    // Leaving the bar before anything was typed records nothing at all.
    fireEvent.blur(bar)

    fireEvent.focus(bar)
    // The bar seeds its draft from the cell, so amending keeps what was there.
    expect(formulaValue()).toBe('Region')
    fireEvent.change(bar, { target: { value: 'Zone' } })
    fireEvent.keyDown(bar, { key: 'Enter' })

    await waitFor(() => { expect(cell('A1').textContent).toBe('Zone') })
    // Enter carries the selection on, exactly as it does inside the cell.
    await waitFor(() => { expect(nameBox()).toBe('A2') })
    // The workbook now differs from the file on disk, and the bar says so.
    expect(document.querySelector('[data-xlsx-dirty]')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('保存副本'))
    await waitFor(() => { expect(saving.copies).toHaveLength(1) })
  })

  it('records a draft the formula bar is holding when it loses focus', async () => {
    await mount()
    const bar = formulaField()

    fireEvent.focus(bar)
    fireEvent.change(bar, { target: { value: 'Zone' } })
    fireEvent.blur(bar)

    await waitFor(() => { expect(cell('A1').textContent).toBe('Zone') })
    // A blur confirms the value but does not move the selection on.
    expect(nameBox()).toBe('A1')
  })

  it('abandons the formula bar’s draft on Escape, and leaves other keys to it', async () => {
    await mount()
    const bar = formulaField()

    // A key the bar does not claim stays with the field, so nothing is edited.
    fireEvent.keyDown(bar, { key: 'a' })

    fireEvent.focus(bar)
    fireEvent.change(bar, { target: { value: 'Nope' } })
    fireEvent.keyDown(bar, { key: 'Escape' })

    expect(formulaValue()).toBe('Region')
    expect(cell('A1').textContent).toBe('Region')
    expect(document.querySelector('[data-xlsx-dirty]')).toBeNull()
  })

  it('explains a save the browser refused', async () => {
    await mount()
    const bar = formulaField()
    fireEvent.focus(bar)
    fireEvent.change(bar, { target: { value: 'Zone' } })
    fireEvent.keyDown(bar, { key: 'Enter' })
    await waitFor(() => { expect(document.querySelector('[data-xlsx-dirty]')).toBeTruthy() })

    // A workbook the editor cannot rewrite is the failure a reader can really
    // meet, and the alert quotes it rather than summarising it away.
    saving.refuse = 'part "xl/worksheets/sheet1.xml" uses ZIP64, which the editor cannot rewrite'
    fireEvent.click(screen.getByLabelText('保存副本'))

    await waitFor(() => {
      expect(document.querySelector('[data-xlsx-save-error]')?.textContent).toContain('ZIP64')
    })
  })

  it('mounts only the rows a virtual window covers', async () => {
    await mount({ rows: 400 })

    const mounted = document.querySelectorAll('[data-xlsx-cell]').length
    expect(mounted).toBeGreaterThan(0)
    // The tall sheet carries 400 populated rows; a full render would mount at
    // least that many cells.
    expect(mounted).toBeLessThan(200)
  })

  it('steps sheets with the buttons and the tab strip', async () => {
    const store = await mount()

    expect(screen.getByLabelText<HTMLButtonElement>('上一个工作表').disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('下一个工作表'))
    await waitFor(() => { expect(indexOf(store)).toBe(2) })
    expect(screen.getByLabelText<HTMLButtonElement>('下一个工作表').disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('上一个工作表'))
    await waitFor(() => { expect(indexOf(store)).toBe(1) })
  })

  it('applies zoom steps and returns to the fitted scale', async () => {
    const store = await mount()

    fireEvent.click(screen.getByLabelText('放大'))
    expect(zoomOf(store)).toBeCloseTo(1.25, 5)
    fireEvent.click(screen.getByLabelText('缩小'))
    expect(zoomOf(store)).toBeCloseTo(1, 5)
    fireEvent.click(screen.getByLabelText('实际大小'))
    expect(zoomOf(store)).toBe(1)
    fireEvent.click(screen.getByLabelText('适应窗口'))
    expect(zoomOf(store)).toBe('fit')
  })

  it('explains a legacy binary workbook and retries on request', async () => {
    const legacy = new Uint8Array(32)
    legacy.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(legacy, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('旧版 .xls 二进制格式暂不支持预览')
    })
    fireEvent.click(screen.getByText('重试'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('旧版 .xls 二进制格式暂不支持预览')
    })
  })

  it('explains a file that is not a package at all', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(new Uint8Array([1, 2, 3, 4]), store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的 .xlsx 工作簿。')
    })
  })

  it('refuses content that is not complete bytes', () => {
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(undefined, store)} />)
    expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的 .xlsx 工作簿。')
  })
})
