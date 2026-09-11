// @vitest-environment jsdom
/** PDF body: loading, page rail, navigation, zoom, rotation, unlock, and failures. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewState } from '@deepseek-ai/dsh-client-sdkwork-office'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PdfBody } from '../src/client/PdfBody.tsx'
import type { PdfBodyProps } from '../src/client/PdfBody.tsx'
import { zh } from '../src/client/locales.ts'

vi.mock('../src/client/pdf/runtime.ts', () => {
  /** Stand-in for the real open error, so the body's `instanceof` check still holds. */
  class PdfOpenError extends Error {
    constructor(readonly kind: string, message: string) {
      super(message)
      this.name = 'PdfOpenError'
    }
  }
  return { PdfOpenError, openPdf: vi.fn() }
})

vi.mock('../src/client/pdf/page.ts', () => ({
  CSS_UNITS_PER_POINT: 96 / 72,
  renderPdfPage: vi.fn(async (_document: unknown, _page: number, canvas: HTMLCanvasElement) => {
    canvas.setAttribute('width', '600')
    canvas.setAttribute('height', '800')
    return { width: 600, height: 800, transform: [1, 0, 0, 1, 0, 0], points: { width: 450, height: 600 } }
  }),
  renderPdfThumbnail: vi.fn(async (
    _document: unknown,
    _page: number,
    canvas: HTMLCanvasElement,
    _railWidth: number,
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted()
    canvas.setAttribute('width', '10')
    canvas.setAttribute('height', '14')
    return 200
  }),
}))

const runtime = await import('../src/client/pdf/runtime.ts')
const page = await import('../src/client/pdf/page.ts')

// jsdom has no scrollIntoView; the rail follow only needs the call to land somewhere.
Element.prototype.scrollIntoView = function scrollIntoView(): void {}

/** A live store instance, as the slot would create one per Session. */
type StoreInstance = {
  readonly getSnapshot: () => PagedViewState
  readonly subscribe: (listener: () => void) => () => void
  readonly actions: {
    readonly index: (tabId: never, index: number) => void
    readonly zoom: (tabId: never, zoom: number | 'fit') => void
  }
}

/** A document stub with three pages and no real PDF.js behind it. */
function fakeDocument(): { numPages: number; getPage: () => Promise<never> } {
  return { numPages: 3, getPage: () => Promise.reject(new Error('not used')) }
}

/** One positioned text run for the searchable document stub. */
function textRun(str: string, left: number, width: number): Record<string, unknown> {
  return { str, transform: [12, 0, 0, 12, left, 700], width, height: 12 }
}

/** A document stub whose pages carry readable text runs for the search. */
function searchableDocument(): unknown {
  return {
    numPages: 2,
    getPage: async (page: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 450 * scale, height: 600 * scale }),
      getTextContent: async () => ({
        items: page === 1
          ? [textRun('alpha beta', 72, 60), textRun('ALPHA two', 72, 54)]
          : [textRun('other page', 72, 55)],
      }),
    }),
  }
}

/** Build the composed props the slot would hand the body. */
function propsFor(data: Uint8Array | undefined, store: StoreInstance): PdfBodyProps {
  const controller = new AbortController()
  return {
    content: data === undefined
      ? { kind: 'text', text: 'not bytes', pages: [], eof: true }
      : { kind: 'bytes', data: data as Uint8Array<ArrayBuffer> },
    resourceAddress: 'dsh-resource://file/session/s1/report.pdf',
    wrap: false,
    scrollportRef: vi.fn(),
    useTabInfo: () => ({
      tab: {
        id: 'tab-1',
        contentId: 'dsh-resource://file/session/s1/report.pdf',
        signal: controller.signal,
        navigation: { revision: 0 },
      },
    }),
    useStore: (selector: (state: PagedViewState) => unknown) => useSyncExternalStore(
      store.subscribe,
      () => selector(store.getSnapshot()),
    ),
    actions: store.actions,
    t: makeTranslate(zh),
  } as unknown as PdfBodyProps
}

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

/** One open session result for the mocked runtime. */
function openResult(document: Promise<unknown>): unknown {
  return { document, dispose: vi.fn(async () => {}) }
}

/** A minimal IntersectionObserver stub whose entries are triggered by hand. */
class FakeIntersectionObserver {
  static readonly instances: FakeIntersectionObserver[] = []
  readonly disconnect = vi.fn()
  readonly callback: IntersectionObserverCallback
  target: Element | undefined

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.target = target
  }

  trigger(isIntersecting: boolean): void {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

/** The observer stubs watching the strip page with the given number. */
function frameObserver(page: number): FakeIntersectionObserver | undefined {
  return FakeIntersectionObserver.instances.find(instance =>
    instance.target?.closest(`[data-pdf-page-frame="${page}"]`) !== null)
}

/** The observer stub watching the page-1 rail thumbnail. */
function thumbObserver(page: number): FakeIntersectionObserver | undefined {
  const canvas = document.querySelector(`[data-pdf-page-tab="${page}"] canvas`)
  return FakeIntersectionObserver.instances.find(instance => instance.target === canvas)
}

describe('PdfBody', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances.length = 0
    vi.mocked(runtime.openPdf).mockReset()
    vi.mocked(runtime.openPdf).mockReturnValue(openResult(Promise.resolve(fakeDocument())) as never)
    vi.mocked(page.renderPdfPage).mockClear()
    vi.mocked(page.renderPdfThumbnail).mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('shows a progress line, then the page rail and the selected page', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    expect(screen.getByText('正在解析 PDF…')).toBeTruthy()

    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(document.querySelector('[data-pdf-page-frame="1"] canvas')?.getAttribute('aria-label')).toBe('第 1 页')
    // The page is drawn with a selectable text layer over it.
    await waitFor(() => {
      expect(page.renderPdfPage).toHaveBeenCalledWith(
        expect.anything(), 1, expect.anything(), expect.anything(), expect.any(Number), 0, expect.anything(),
      )
    })
    expect(document.querySelector('[data-pdf-text-layer]')).toBeTruthy()
  })

  it('steps pages with the buttons and the arrow keys', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    expect(screen.getByLabelText<HTMLButtonElement>('上一页').disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('下一页'))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })
    const stage = document.querySelector('[data-pdf-stage]') as HTMLElement
    fireEvent.keyDown(stage, { key: 'ArrowDown' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
    expect(screen.getByLabelText<HTMLButtonElement>('下一页').disabled).toBe(true)
    fireEvent.keyDown(stage, { key: 'ArrowUp' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })
    fireEvent.click(screen.getByLabelText('上一页'))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1) })
    fireEvent.click(screen.getByRole('option', { name: '第 1 页' }))
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1) })
  })

  it('jumps through the page entry and rejects malformed input', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const input = screen.getByLabelText('页码')

    // Focus and blur without typing keeps the current page.
    fireEvent.focus(input)
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })

    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.blur(input)
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
    // Keys that are not Enter or Escape leave the entry alone.
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3)

    fireEvent.change(input, { target: { value: 'not a page' } })
    fireEvent.blur(input)
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3)
    expect((input as HTMLInputElement).value).toBe('3')
  })

  it('walks to the ends with Home and End and keeps zoom chords off paging', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const stage = document.querySelector('[data-pdf-stage]') as HTMLElement

    fireEvent.keyDown(stage, { key: 'End' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
    fireEvent.keyDown(stage, { key: 'Home' })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1) })

    fireEvent.keyDown(stage, { key: 'ArrowDown', ctrlKey: true })
    expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1)
    fireEvent.keyDown(stage, { key: 'ArrowDown', metaKey: true })
    expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1)
    fireEvent.keyDown(stage, { key: '=', ctrlKey: true })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.keyDown(stage, { key: '-', ctrlKey: true })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5)
    fireEvent.keyDown(stage, { key: '0', ctrlKey: true })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')
  })

  it('zooms with plain plus, minus, underscore, and zero like the office family', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const stage = document.querySelector('[data-pdf-stage]') as HTMLElement

    fireEvent.keyDown(stage, { key: '+' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.keyDown(stage, { key: '_' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5)
    fireEvent.keyDown(stage, { key: '0' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')
    // A key no handler claims falls through untouched.
    fireEvent.keyDown(stage, { key: 'x' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')
    expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(1)
  })

  it('applies zoom steps and rotates the page', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    fireEvent.click(screen.getByLabelText('放大'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.click(screen.getByLabelText('缩小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5)
    fireEvent.click(screen.getByLabelText('实际大小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(1)
    fireEvent.click(screen.getByLabelText('适应窗口'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')

    vi.mocked(page.renderPdfPage).mockClear()
    fireEvent.click(screen.getByLabelText('向右旋转'))
    // Rotation reaches the renderer as a viewport argument, not a CSS spin.
    await waitFor(() => {
      expect(vi.mocked(page.renderPdfPage).mock.calls.at(-1)?.[5]).toBe(90)
    })
    fireEvent.click(screen.getByLabelText('向左旋转'))
    await waitFor(() => {
      expect(vi.mocked(page.renderPdfPage).mock.calls.at(-1)?.[5]).toBe(0)
    })
  })

  it('fits a small page above full size like the office previews', async () => {
    const width = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    const height = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(1000)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => {
      // A 600x800 page in a 1000x1000 stage fits at 121%, not at the old 100% cap.
      expect(vi.mocked(page.renderPdfPage).mock.calls.at(-1)?.[4]).toBeCloseTo(968 / 800, 5)
    })
    width.mockRestore()
    height.mockRestore()
  })

  it('zooms around the pointer with ctrl plus wheel and scrolls plain wheels', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const stage = document.querySelector('[data-pdf-stage]') as HTMLElement

    fireEvent.wheel(stage, { deltaY: -120, ctrlKey: true, cancelable: true })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    // The scroll anchor restored the strip position across the relayout.
    await waitFor(() => {
      expect((document.querySelector('[data-pdf-page-frame="1"]') as HTMLElement).style.width).toBe('750px')
    })
    fireEvent.wheel(stage, { deltaY: 120, ctrlKey: true, cancelable: true })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5)
    fireEvent.wheel(stage, { deltaY: -50 })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5)
  })

  it('lands on the page top after a page change', async () => {
    // jsdom has no layout: frames report a page-number-borne offset and the
    // stage's scrollTop is a plain store, so the landing is observable.
    const scrollTops = new Map<Element, number>()
    const scrollTopGet = vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get')
      .mockImplementation(function scrolledTo(this: HTMLElement) { return scrollTops.get(this) ?? 0 })
    const scrollTopSet = vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set')
      .mockImplementation(function scrollToItem(this: HTMLElement, value: number) { scrollTops.set(this, value) })
    const offsetTopGet = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function offsetOf(this: HTMLElement) {
        const frame = this.getAttribute('data-pdf-page-frame')
        return (frame === null ? 0 : Number(frame)) * 100
      })
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const stage = document.querySelector('[data-pdf-stage]') as HTMLElement
    stage.scrollTop = 100

    fireEvent.click(screen.getByLabelText('下一页'))
    // Page 2's frame sits at offset 200; the strip lands 8px above its top.
    await waitFor(() => { expect(stage.scrollTop).toBe(192) })
    scrollTopGet.mockRestore()
    scrollTopSet.mockRestore()
    offsetTopGet.mockRestore()
  })

  it('keeps the viewer open when a page cannot draw', async () => {
    let rejected = false
    vi.mocked(page.renderPdfPage).mockImplementation(async (_document, pageNumber, canvas) => {
      if (pageNumber === 2 && !rejected) {
        rejected = true
        throw new Error('raster boom')
      }
      canvas.setAttribute('width', '600')
      canvas.setAttribute('height', '800')
      return { width: 600, height: 800, transform: [1, 0, 0, 1, 0, 0], points: { width: 450, height: 600 } }
    })
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getAllByRole('option')).toHaveLength(3) })
    // The failed page's frame stays blank; the strip and the other pages live on.
    await waitFor(() => {
      const pageTwoCalls = vi.mocked(page.renderPdfPage).mock.calls.filter(call => call[1] === 2)
      expect(pageTwoCalls.length).toBeGreaterThanOrEqual(1)
    })
    expect(document.querySelector('[data-pdf-page-frame="2"] canvas')?.getAttribute('width')).toBeNull()
    expect(document.querySelector('[data-pdf-page-frame="1"] canvas')?.getAttribute('width')).toBe('600')
  })

  it('ignores a page failure that lands after the viewer moved on', async () => {
    let rejectPage!: (error: unknown) => void
    vi.mocked(page.renderPdfPage).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectPage = reject }),
    )
    const store = defineStore(pagedViewStore).create()
    const { unmount } = render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    unmount()
    rejectPage(new Error('late boom'))
    await expect(Promise.resolve()).resolves.toBeUndefined()
    vi.mocked(page.renderPdfPage).mockImplementation(async (_document: unknown, _page: number, canvas: HTMLCanvasElement) => {
      canvas.setAttribute('width', '600')
      canvas.setAttribute('height', '800')
      return { width: 600, height: 800, transform: [1, 0, 0, 1, 0, 0], points: { width: 450, height: 600 } }
    })
  })

  it('draws thumbnails on entry and releases their rasters on exit', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(FakeIntersectionObserver.instances).toHaveLength(6) })

    const first = thumbObserver(1)
    const canvas = document.querySelector('[data-pdf-page-tab="1"] canvas') as HTMLCanvasElement
    first?.trigger(true)
    await waitFor(() => {
      expect(page.renderPdfThumbnail).toHaveBeenCalledWith(expect.anything(), 1, canvas, 128, expect.anything())
    })
    expect(canvas.hasAttribute('width')).toBe(true)

    first?.trigger(false)
    expect(canvas.hasAttribute('width')).toBe(false)
    // Re-entering after a release must draw again — a poisoned abort signal
    // would leave the thumbnail blank forever.
    first?.trigger(true)
    await waitFor(() => { expect(page.renderPdfThumbnail).toHaveBeenCalledTimes(2) })
    expect(canvas.hasAttribute('width')).toBe(true)
  })

  it('draws strip pages on entry and releases their rasters on exit', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(FakeIntersectionObserver.instances).toHaveLength(6) })
    const observer = frameObserver(1)

    observer?.trigger(true)
    await waitFor(() => {
      expect(page.renderPdfPage).toHaveBeenCalledWith(
        expect.anything(), 1, expect.anything(), expect.anything(), expect.any(Number), 0, expect.anything(),
      )
    })
    const canvas = document.querySelector('[data-pdf-page-frame="1"] canvas') as HTMLCanvasElement
    expect(canvas.hasAttribute('width')).toBe(true)
    expect(document.querySelector('[data-pdf-page-frame="1"] [data-pdf-text-layer]')).toBeTruthy()

    observer?.trigger(false)
    await waitFor(() => { expect(canvas.hasAttribute('width')).toBe(false) })
    observer?.trigger(true)
    await waitFor(() => { expect(canvas.hasAttribute('width')).toBe(true) })
  })

  it('copies the text layer without NUL padding', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const layer = document.querySelector('[data-pdf-text-layer]') as HTMLElement
    const setData = vi.fn()
    fireEvent.copy(layer, { clipboardData: { getData: () => 'a\u0000b', setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', 'ab')
  })

  it('unlocks an encrypted document in place', async () => {
    // The placeholder catch keeps the rejection quiet until the body, which
    // renders the unlock form from it, attaches its own handler.
    const passwordError = (): Promise<never> => {
      const rejected: Promise<never> = Promise.reject(new runtime.PdfOpenError('password', 'no'))
      rejected.catch(() => {})
      return rejected
    }
    vi.mocked(runtime.openPdf)
      .mockReturnValueOnce(openResult(passwordError()) as never)
      .mockReturnValueOnce(openResult(passwordError()) as never)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('该 PDF 已加密，输入密码即可预览。')
    })
    expect(document.querySelector('[data-pdf-unlock-cancel]')).toBeNull()

    fireEvent.change(document.querySelector('[data-pdf-password]') as HTMLInputElement, { target: { value: 'secret' } })
    fireEvent.submit(document.querySelector('[data-pdf-unlock]') as HTMLFormElement)
    await waitFor(() => {
      expect(runtime.openPdf).toHaveBeenCalledTimes(2)
      expect(vi.mocked(runtime.openPdf).mock.calls[1]?.[3]).toEqual({ password: 'secret' })
    })
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('密码不正确，请重试。')
    })
    expect(document.querySelector('[data-pdf-unlock-cancel]')).toBeTruthy()

    fireEvent.click(screen.getByText('取消'))
    await waitFor(() => {
      expect(runtime.openPdf).toHaveBeenCalledTimes(3)
      expect(vi.mocked(runtime.openPdf).mock.calls[2]?.[3]).toEqual({ password: undefined })
    })
  })

  it('explains an encrypted document before any attempt offers no cancel', async () => {
    vi.mocked(runtime.openPdf).mockReturnValue(
      openResult(Promise.reject(new runtime.PdfOpenError('password', 'no'))) as never,
    )
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('该 PDF 已加密，输入密码即可预览。')
    })
    expect(screen.queryByText('重试')).toBeNull()
  })

  it('explains a file that is not a PDF and reopens on request', async () => {
    vi.mocked(runtime.openPdf).mockReturnValue(
      openResult(Promise.reject(new runtime.PdfOpenError('invalid', 'bad header'))) as never,
    )
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的 PDF。')
    })
    expect(runtime.openPdf).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('重试'))
    await waitFor(() => { expect(runtime.openPdf).toHaveBeenCalledTimes(2) })
  })

  it('reports a stopped renderer through a fatal worker failure', async () => {
    let report: ((error: unknown) => void) | undefined
    vi.mocked(runtime.openPdf).mockImplementation((_data, _signal, onFatal) => {
      report = onFatal as (error: unknown) => void
      return openResult(Promise.resolve(fakeDocument())) as never
    })
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    report?.(new runtime.PdfOpenError('worker', 'the PDF worker stopped'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('PDF 渲染进程已停止，请重试。')
    })
  })

  it('keeps the rail alive when a thumbnail fails to draw and recovers', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    vi.mocked(page.renderPdfThumbnail).mockRejectedValueOnce(new Error('draw boom'))
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(FakeIntersectionObserver.instances).toHaveLength(6) })
    const first = thumbObserver(1)
    const canvas = document.querySelector('[data-pdf-page-tab="1"] canvas') as HTMLCanvasElement

    first?.trigger(true)
    await waitFor(() => { expect(page.renderPdfThumbnail).toHaveBeenCalledTimes(1) })
    expect(canvas.hasAttribute('width')).toBe(false)

    first?.trigger(true)
    await waitFor(() => { expect(canvas.hasAttribute('width')).toBe(true) })
  })

  it('measures the stage again when a ResizeObserver reports a resize', async () => {
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      readonly observe = vi.fn()
      readonly disconnect = disconnect
      constructor(readonly callback: () => void) {}
    })
    const store = defineStore(pagedViewStore).create()
    const { unmount } = render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('steps one zoom out per line-mode ctrl wheel notch', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const stage = document.querySelector('[data-pdf-stage]') as HTMLElement

    fireEvent.wheel(stage, { deltaY: 3, deltaMode: 1, ctrlKey: true, cancelable: true })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(0.8, 5)
  })

  it('marks the text layer as selecting during a press and releases it globally', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const layer = document.querySelector('[data-pdf-text-layer]') as HTMLElement

    fireEvent.mouseDown(layer)
    expect(layer.hasAttribute('data-selecting')).toBe(true)
    fireEvent.mouseUp(document.body)
    expect(layer.hasAttribute('data-selecting')).toBe(false)
  })

  it('selects the whole page entry on focus', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const input = screen.getByLabelText('页码') as HTMLInputElement
    fireEvent.focus(input)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it.each([
    ['worker', 'PDF 渲染进程已停止，请重试。'],
    ['aborted', '预览失败：stopped early'],
    ['unsupported', '该 PDF 使用了暂不支持的格式特性，无法预览。'],
  ])('explains an open failure of kind %s', async (kind, message) => {
    vi.mocked(runtime.openPdf).mockReturnValue(
      openResult(Promise.reject(new runtime.PdfOpenError(kind as 'worker', 'stopped early'))) as never,
    )
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain(message) })
  })

  it('ignores open outcomes that land after the viewer unmounted', async () => {
    for (const settleWith of ['resolve', 'reject'] as const) {
      const deferred = Promise.withResolvers<unknown>()
      let fatal!: (error: unknown) => void
      vi.mocked(runtime.openPdf).mockImplementationOnce((_data, _signal, onFatal) => {
        fatal = onFatal as (error: unknown) => void
        return { document: deferred.promise, dispose: vi.fn(async () => {}) } as never
      })
      const store = defineStore(pagedViewStore).create()
      const { unmount } = render(<PdfBody {...propsFor(BYTES, store)} />)
      unmount()
      fatal(new runtime.PdfOpenError('worker', 'late'))
      if (settleWith === 'resolve') {
        deferred.resolve(fakeDocument())
      } else {
        deferred.reject(new runtime.PdfOpenError('worker', 'late'))
        deferred.promise.catch(() => {})
      }
      await expect(Promise.resolve()).resolves.toBeUndefined()
    }
  })

  it('finds matches, highlights the page, and walks them across pages', async () => {
    vi.mocked(runtime.openPdf).mockReturnValue(openResult(Promise.resolve(searchableDocument())) as never)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const input = screen.getByLabelText('查找')

    fireEvent.change(input, { target: { value: 'alpha' } })
    await waitFor(() => { expect(document.querySelector('[data-pdf-match-summary]')?.textContent).toBe('1 / 2') })
    // Both matches sit on page 1; the active band is styled apart from the other.
    const bands = document.querySelectorAll('[data-pdf-highlights] span')
    expect(bands).toHaveLength(2)
    const first = bands[0] as HTMLElement
    const second = bands[1] as HTMLElement
    expect(first.className).not.toBe(second.className)
    // 'alpha' covers half of 'alpha beta' at 60px wide, starting at x=72.
    expect(first.style.width).toBe('30px')
    expect(first.style.left).toBe('72px')
    expect(second.style.width).toBe('30px')

    // Enter walks forward, Shift+Enter walks back.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(document.querySelector('[data-pdf-match-summary]')?.textContent).toBe('2 / 2')
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(document.querySelector('[data-pdf-match-summary]')?.textContent).toBe('1 / 2')
    fireEvent.click(screen.getByLabelText('下一个匹配'))
    expect(document.querySelector('[data-pdf-match-summary]')?.textContent).toBe('2 / 2')
    fireEvent.click(screen.getByLabelText('下一个匹配'))
    expect(document.querySelector('[data-pdf-match-summary]')?.textContent).toBe('1 / 2')

    // A match on another page opens that page.
    fireEvent.change(input, { target: { value: 'other' } })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })
    await waitFor(() => { expect(document.querySelector('[data-pdf-match-summary]')?.textContent).toBe('1 / 1') })
    fireEvent.click(screen.getByLabelText('上一个匹配'))
    expect(document.querySelector('[data-pdf-match-summary]')?.textContent).toBe('1 / 1')
  })

  it('reports no matches and clears the query with Escape', async () => {
    vi.mocked(runtime.openPdf).mockReturnValue(openResult(Promise.resolve(searchableDocument())) as never)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const input = screen.getByLabelText('查找')

    fireEvent.change(input, { target: { value: 'zzz' } })
    await waitFor(() => { expect(document.querySelector('[data-pdf-no-matches]')?.textContent).toBe('没有匹配') })
    expect(document.querySelector('[data-pdf-match-summary]')).toBeNull()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect((input as HTMLInputElement).value).toBe('')
    await waitFor(() => { expect(document.querySelector('[data-pdf-no-matches]')).toBeNull() })
    // Keys that are neither Enter nor Escape leave the query alone.
    fireEvent.change(input, { target: { value: 'alpha' } })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    await waitFor(() => { expect(document.querySelector('[data-pdf-match-summary]')?.textContent).toBe('1 / 2') })
  })

  it('stays quiet when a document cannot be searched', async () => {
    // The default stub rejects every page read; search finds nothing and says so.
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const input = screen.getByLabelText('查找')

    fireEvent.change(input, { target: { value: 'anything' } })
    await waitFor(() => { expect(document.querySelector('[data-pdf-no-matches]')?.textContent).toBe('没有匹配') })
    // Shift-Enter walks back over an empty match set without complaint.
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(document.querySelector('[data-pdf-no-matches]')?.textContent).toBe('没有匹配')
  })

  it('keeps the newest scan when queries change mid-scan', async () => {
    vi.mocked(runtime.openPdf).mockReturnValue(openResult(Promise.resolve(searchableDocument())) as never)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const input = screen.getByLabelText('查找')

    fireEvent.change(input, { target: { value: 'alpha' } })
    fireEvent.change(input, { target: { value: 'alphaz' } })
    await waitFor(() => { expect(document.querySelector('[data-pdf-no-matches]')?.textContent).toBe('没有匹配') })
    // The superseded scan never published over the newest one.
    expect(document.querySelector('[data-pdf-match-summary]')).toBeNull()
  })

  it('ignores page text that lands after the page moved on', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const pending: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> = []
    vi.mocked(runtime.openPdf).mockReturnValue(openResult(Promise.resolve({
      numPages: 2,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 450 * scale, height: 600 * scale }),
        getTextContent: () => new Promise((resolve, reject) => { pending.push({ resolve, reject }) }),
      }),
    })) as never)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(FakeIntersectionObserver.instances).toHaveLength(4) })
    const first = frameObserver(1)
    const second = frameObserver(2)

    // Page 1's read is in flight when the reader leaves; the result is cached
    // but never published to the departed view.
    first?.trigger(true)
    await waitFor(() => { expect(pending).toHaveLength(1) })
    first?.trigger(false)
    await waitFor(() => {
      expect((document.querySelector('[data-pdf-page-frame="1"] canvas') as HTMLCanvasElement).hasAttribute('width')).toBe(false)
    })
    pending[0]?.resolve({ items: [textRun('slow page', 72, 48)] })
    await expect(Promise.resolve()).resolves.toBeUndefined()

    // Returning to page 1 reads the cached runs without a new request.
    first?.trigger(true)
    await expect(Promise.resolve()).resolves.toBeUndefined()
    expect(pending).toHaveLength(1)

    // Page 2's late rejection after the reader left is discarded too.
    second?.trigger(true)
    await waitFor(() => { expect(pending).toHaveLength(2) })
    second?.trigger(false)
    await waitFor(() => {
      expect((document.querySelector('[data-pdf-page-frame="2"] canvas') as HTMLCanvasElement).hasAttribute('width')).toBe(false)
    })
    pending[1]?.reject(new Error('late page'))
    await expect(Promise.resolve()).resolves.toBeUndefined()
  })

  it('follows the page under the viewport centre as the strip scrolls', async () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const stage = document.querySelector('[data-pdf-stage]') as HTMLElement

    // The centre-most frame owns the counter; jsdom frames all sit at offset 0,
    // so the centre lands on the last registered page.
    fireEvent.scroll(stage)
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(3) })
    fireEvent.scroll(stage)
    await waitFor(() => {
      expect((document.querySelector('[data-pdf-page-input]') as HTMLInputElement).value).toBe('3')
    })
  })

  it('discards the default-size read that lands after the viewer moved on', async () => {
    const deferred = Promise.withResolvers<never>()
    vi.mocked(runtime.openPdf).mockReturnValue(openResult(Promise.resolve({
      numPages: 1,
      getPage: (_page: number) => deferred.promise.then(() => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 450 * scale, height: 600 * scale }),
        getTextContent: async () => ({ items: [textRun('late size', 72, 48)] }),
      })),
    })) as never)
    const store = defineStore(pagedViewStore).create()
    const { unmount } = render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    unmount()
    deferred.resolve(undefined as never)
    await expect(Promise.resolve()).resolves.toBeUndefined()
  })

  it('navigating into a dead renderer scrolls nowhere', async () => {
    let report: ((error: unknown) => void) | undefined
    vi.mocked(runtime.openPdf).mockImplementation((_data, _signal, onFatal) => {
      report = onFatal as (error: unknown) => void
      return openResult(Promise.resolve(fakeDocument())) as never
    })
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })

    // The command marks a programmatic navigation, then the worker dies; the
    // dead strip has no frames to scroll to and the failure line takes over.
    fireEvent.click(screen.getByLabelText('下一页'))
    report?.(new runtime.PdfOpenError('worker', 'the PDF worker stopped'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('PDF 渲染进程已停止，请重试。')
    })
  })

  it('explains an open failure that carries no error object', async () => {
    // The generic sentence must survive a rejection that is not an Error.
    vi.mocked(runtime.openPdf).mockReturnValue(
      openResult(Promise.reject('plain string')) as never, // oxlint-disable-line typescript/prefer-promise-reject-errors
    )
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('预览失败：plain string')
    })
  })

  it('explains an open failure that is a plain Error', async () => {
    vi.mocked(runtime.openPdf).mockReturnValue(
      openResult(Promise.reject(new Error('plain error'))) as never,
    )
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('预览失败：plain error')
    })
  })

  it('navigates nowhere on a document without pages', async () => {
    vi.mocked(runtime.openPdf).mockReturnValue(openResult(Promise.resolve({
      numPages: 0,
      getPage: async () => {
        throw new Error('no pages')
      },
    })) as never)
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const stage = document.querySelector('[data-pdf-stage]') as HTMLElement

    fireEvent.keyDown(stage, { key: 'End' })
    await expect(Promise.resolve()).resolves.toBeUndefined()
  })

  it('drops a stale match navigation when the viewer dies first', async () => {
    let report: ((error: unknown) => void) | undefined
    vi.mocked(runtime.openPdf).mockImplementation((_data, _signal, onFatal) => {
      report = onFatal as (error: unknown) => void
      return openResult(Promise.resolve(searchableDocument())) as never
    })
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('listbox')).toBeTruthy() })
    const input = screen.getByLabelText('查找')

    // The active match lives on page 2 and the strip followed it there.
    fireEvent.change(input, { target: { value: 'other' } })
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]?.index).toBe(2) })

    // The worker dies while that match is still active; the failed commit
    // re-runs the follow against a viewer that no longer has a strip.
    report?.(new runtime.PdfOpenError('worker', 'the PDF worker stopped'))
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('PDF 渲染进程已停止，请重试。')
    })
  })

  it('refuses content that is not complete bytes', () => {
    const store = defineStore(pagedViewStore).create()
    render(<PdfBody {...propsFor(undefined, store)} />)
    expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的 PDF。')
  })
})
