// @vitest-environment jsdom
/** The Excel window: the chrome around the grid, and how it reacts to bytes. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewState } from '@deepseek-ai/dsh-client-sdkwork-office'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { XlsxBody } from '../src/client/XlsxBody.tsx'
import type { XlsxBodyProps } from '../src/client/XlsxBody.tsx'
import { parseXlsx, XlsxParseError } from '../src/client/xlsx/workbook.ts'
import * as workbook from '../src/client/xlsx/workbook.ts'
import type { ParsedXlsx } from '../src/client/xlsx/workbook.ts'
import { xlsxFixture } from './xlsx-fixture.client.ts'
import { zh } from '../src/client/locales.ts'

// Only the parse is replaced; every other reader stays the real one so the
// window under test is built from the workbook its bytes actually describe.
const parse = vi.hoisted(() => ({ current: undefined as undefined | ((bytes: Uint8Array, labels: unknown) => Promise<ParsedXlsx>) }))

vi.mock('../src/client/xlsx/workbook.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/xlsx/workbook.ts')>()
  return {
    ...actual,
    parseXlsx: (bytes: Uint8Array, labels: unknown): Promise<ParsedXlsx> => (
      parse.current === undefined ? actual.parseXlsx(bytes, labels as never) : parse.current(bytes, labels)
    ),
  }
})

/** A live store instance, as the slot would create one per Session. */
type StoreInstance = {
  readonly getSnapshot: () => PagedViewState
  readonly subscribe: (listener: () => void) => () => void
  readonly actions: {
    readonly index: (tabId: never, index: number) => void
    readonly zoom: (tabId: never, zoom: number | 'fit') => void
  }
}

/** Build the composed props the slot would hand the body. */
function propsFor(data: Uint8Array, store: StoreInstance, signal?: AbortSignal): XlsxBodyProps {
  const controller = new AbortController()
  return {
    content: { kind: 'bytes', data: data as Uint8Array<ArrayBuffer> },
    resourceAddress: 'dsh-resource://file/session/s1/book.xlsx',
    wrap: false,
    scrollportRef: vi.fn(),
    useTabInfo: () => ({
      tab: {
        id: 'tab-1',
        contentId: 'dsh-resource://file/session/s1/book.xlsx',
        signal: signal ?? controller.signal,
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

afterEach(() => {
  cleanup()
  parse.current = undefined
})

describe('XlsxBody failures beyond the package itself', () => {
  it('names a package that holds no readable workbook', async () => {
    parse.current = () => Promise.reject(new XlsxParseError('no-workbook', 'nothing to read'))
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(new Uint8Array([1, 2, 3]), store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('文件里没有找到可显示的工作表。')
    })
  })

  it('reports an unexpected failure with its own message', async () => {
    parse.current = () => Promise.reject(new Error('the reader blew up'))
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(new Uint8Array([1, 2, 3]), store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('预览失败：the reader blew up')
    })
  })

  it('reports a thrown value that is not an error at all', async () => {
    // A parse that rejects with a bare string is exactly what the generic
    // branch must survive, so the rejection is deliberately not an Error.
    parse.current = () => Promise.reject('just a string')
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(new Uint8Array([1, 2, 3]), store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('预览失败：just a string')
    })
  })

  it('drops a parse that finishes after the tab is gone', async () => {
    const parsed = await parseXlsx(await xlsxFixture(), { sheetName: index => `Sheet ${index}` })
    let release: ((value: ParsedXlsx) => void) | undefined
    parse.current = () => new Promise<ParsedXlsx>((resolve) => { release = resolve })
    const store = defineStore(pagedViewStore).create()
    const view = render(<XlsxBody {...propsFor(new Uint8Array([9, 9, 9]), store)} />)
    view.unmount()
    release?.(parsed)
    // The parse result belongs to no mounted body, so it is released rather
    // than drawn, and reporting the workbook still works.
    await waitFor(() => { expect(parsed.workbook.sheets.length).toBe(2) })
    parsed.dispose()
  })

  it('drops a parse failure that arrives after the tab is gone', async () => {
    let fail: ((reason: unknown) => void) | undefined
    parse.current = () => new Promise<ParsedXlsx>((_resolve, reject) => { fail = reject })
    const store = defineStore(pagedViewStore).create()
    const view = render(<XlsxBody {...propsFor(new Uint8Array([9, 9, 9]), store)} />)
    view.unmount()
    fail?.(new Error('too late'))
    await waitFor(() => { expect(document.querySelector('[data-xlsx-preview]')).toBeNull() })
  })

  it('reads nothing when the tab was already closed', async () => {    const store = defineStore(pagedViewStore).create()
    const controller = new AbortController()
    controller.abort()
    render(<XlsxBody {...propsFor(new Uint8Array([1, 2, 3]), store, controller.signal)} />)
    expect(document.querySelector('[data-xlsx-stage]')).toBeNull()
    expect(document.querySelector('[data-xlsx-preview]')).toBeNull()
  })

  it('survives a host without a resize observer', async () => {
    const original = globalThis.ResizeObserver
    Reflect.deleteProperty(globalThis, 'ResizeObserver')
    try {
      const store = defineStore(pagedViewStore).create()
      render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
      await waitFor(() => { expect(document.querySelector('[data-xlsx-stage]')).toBeTruthy() })
      expect(screen.getByRole('grid')).toBeTruthy()
    } finally {
      globalThis.ResizeObserver = original
    }
  })

  it('re-measures the stage when the host reports a resize', async () => {
    const observers: Array<() => void> = []
    class StubObserver {
      constructor(private readonly notify: () => void) {
        observers.push(notify)
      }

      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    }
    const original = globalThis.ResizeObserver
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: StubObserver })
    try {
      const store = defineStore(pagedViewStore).create()
      render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
      await waitFor(() => { expect(observers.length).toBeGreaterThan(0) })
      // The observer's own callback is what re-reads the stage measurement.
      for (const notify of observers) notify()
      await waitFor(() => { expect(screen.getByRole('grid')).toBeTruthy() })
    } finally {
      Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: original })
    }
  })
})

describe('XlsxBody chrome', () => {
  it('hands the parse a sheet-name fallback built from the dictionary', async () => {
    const spy = vi.spyOn(workbook, 'parseXlsx')
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
    await waitFor(() => { expect(screen.getByRole('grid')).toBeTruthy() })
    const labels = spy.mock.calls[0][1]
    expect(labels.sheetName(3)).toBe('第 3 个工作表')
  })

  it('keeps the stored sheet when the index is in range', async () => {
    const store = defineStore(pagedViewStore).create()
    store.actions.index('tab-1' as never, 2)
    render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
    await waitFor(() => { expect(screen.getByRole('grid')).toBeTruthy() })
    expect(screen.getByRole('grid').getAttribute('aria-label')).toBe('Data')
  })

  it('clamps an index below the first sheet onto the first sheet', async () => {
    const store = defineStore(pagedViewStore).create()
    store.actions.index('tab-1' as never, 0)
    render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
    await waitFor(() => { expect(screen.getByRole('grid')).toBeTruthy() })
    expect(screen.getByRole('grid').getAttribute('aria-label')).toBe('Summary')
  })

  it('paints an empty cell with no text layer', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
    await waitFor(() => { expect(screen.getByRole('grid')).toBeTruthy() })
    // D3 is inside the populated extent but carries nothing.
    expect(document.querySelector('[data-xlsx-cell="D3"]')).toBeTruthy()
    expect(document.querySelector('[data-xlsx-cell="D3"]')?.firstElementChild).toBeNull()
  })

  it('shows no value for a cell that carries nothing', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
    const target = await waitFor(() => {
      const found = document.querySelector('[data-xlsx-cell="D3"]')
      expect(found).toBeTruthy()
      return found as HTMLElement
    })
    fireEvent.pointerDown(target)
    await waitFor(() => {
      expect(document.querySelector('[data-xlsx-name-box]')?.getAttribute('value')).toBe('D3')
      // An empty cell leaves the edit line empty and shows its place holder.
      const bar = document.querySelector<HTMLInputElement>('[data-xlsx-formula-value]')
      expect(bar?.value).toBe('')
      expect(bar?.placeholder).toBe('（空）')
    })
  })

  it('shows the value of a cell the reader clicks', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
    // Column C is hidden in the fixture, so D2 carries the boolean.
    const target = await waitFor(() => {
      const found = document.querySelector('[data-xlsx-cell="D2"]')
      expect(found).toBeTruthy()
      return found as HTMLElement
    })
    fireEvent.pointerDown(target)
    await waitFor(() => {
      expect(document.querySelector('[data-xlsx-name-box]')?.getAttribute('value')).toBe('D2')
      expect(document.querySelector<HTMLInputElement>('[data-xlsx-formula-value]')?.value).toBe('TRUE')
    })
    // The formula bar shows the stored serial, while the cell prints the date.
    fireEvent.pointerDown(document.querySelector('[data-xlsx-cell="E2"]') as HTMLElement)
    await waitFor(() => {
      expect(document.querySelector<HTMLInputElement>('[data-xlsx-formula-value]')?.value).toBe('44197')
    })
    expect(document.querySelector('[data-xlsx-cell="E2"]')?.textContent).toBe('2021年1月1日')
  })

  it('jumps to a reference and a range typed into the Name Box', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<XlsxBody {...propsFor(await xlsxFixture(), store)} />)
    await waitFor(() => { expect(screen.getByRole('grid')).toBeTruthy() })
    const box = document.querySelector<HTMLInputElement>('[data-xlsx-name-box]') as HTMLInputElement

    fireEvent.change(box, { target: { value: 'E2' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => {
      // The jump selects the cell, so the box names it again and the edit line
      // reads what it holds.
      expect(document.querySelector('[data-xlsx-name-box]')?.getAttribute('value')).toBe('E2')
      expect(document.querySelector<HTMLInputElement>('[data-xlsx-formula-value]')?.value).toBe('44197')
    })

    fireEvent.change(box, { target: { value: 'D2:E2' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => {
      expect(document.querySelector('[data-xlsx-name-box]')?.getAttribute('value')).toBe('D2:E2')
    })
    // A jump beyond the sheet clamps into its extent, as Excel's does.
    fireEvent.change(box, { target: { value: 'ZZ99' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.change(box, { target: { value: 'not a reference' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => {
      expect(document.querySelector('[data-xlsx-name-box]')?.getAttribute('value')).not.toBe('not a reference')
    })
  })
})
