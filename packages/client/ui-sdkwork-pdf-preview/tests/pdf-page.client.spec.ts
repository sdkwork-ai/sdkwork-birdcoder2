// @vitest-environment jsdom
/** Page rasterisation: canvas sizing, text-layer wiring, thumbnails, and cancellation. */
import { describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist', () => {
  return {
    TextLayer: vi.fn(function fakeTextLayer({ container, viewport }: {
      container: HTMLElement
      viewport: { width: number; height: number }
    }): unknown {
      return {
        render: async (): Promise<void> => { container.style.width = `${viewport.width}px` },
      }
    }),
  }
})

const { renderPdfPage, renderPdfThumbnail } = await import('../src/client/pdf/page.ts')
const { TextLayer } = await import('pdfjs-dist')

/** The render call PDF.js receives, narrowed to what these tests assert. */
interface FakeRenderOptions {
  readonly canvas: HTMLCanvasElement
  readonly transform?: readonly number[]
}

/** A PDF.js page proxy double with the given point dimensions. */
function fakePage(width: number, height: number, renderTask?: { promise: Promise<void>; cancel: () => void }): {
  readonly page: never
  readonly render: ReturnType<typeof vi.fn<(options: FakeRenderOptions) => { promise: Promise<void>; cancel: () => void }>>
  readonly getViewport: ReturnType<typeof vi.fn>
  readonly cleanup: ReturnType<typeof vi.fn>
} {
  const cleanup = vi.fn()
  const render = vi.fn((_options: FakeRenderOptions): { promise: Promise<void>; cancel: () => void } =>
    renderTask ?? { promise: Promise.resolve(), cancel: vi.fn() })
  const getViewport = vi.fn(({ scale, rotation }: { scale: number; rotation?: number }) => ({
    scale,
    rotation: rotation ?? 0,
    width: width * scale,
    height: height * scale,
  }))
  return {
    page: { getViewport, render, cleanup, streamTextContent: vi.fn(() => 'text-content') } as never,
    render,
    getViewport,
    cleanup,
  }
}

function fakeDocument(page: never): { numPages: number; getPage: () => Promise<never>; getMetadata: () => Promise<never> } {
  return { numPages: 1, getPage: () => Promise.resolve(page), getMetadata: () => Promise.reject(new Error('not used')) }
}

describe('renderPdfPage', () => {
  it('draws at natural density and wires the text layer to the viewport', async () => {
    // Environments without a display report no device pixel ratio at all.
    vi.stubGlobal('devicePixelRatio', undefined)
    const { page, render, getViewport, cleanup } = fakePage(600, 800)
    const canvas = document.createElement('canvas')
    const text = document.createElement('div')
    text.append(document.createTextNode('stale'))
    const size = await renderPdfPage(fakeDocument(page), 1, canvas, text, 1, 0, new AbortController().signal)

    expect(getViewport).toHaveBeenCalledWith({ scale: 96 / 72, rotation: 0 })
    expect(size.width).toBe(800)
    expect(size.height).toBeCloseTo(800 * 96 / 72, 5)
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(1066)
    expect(canvas.style.width).toBe('800px')
    // The render transform disappears at density 1 and the text layer is
    // rebuilt with the viewport scale PDF.js lays glyphs out from.
    expect(render.mock.calls[0]?.[0].transform).toBeUndefined()
    expect(text.style.getPropertyValue('--total-scale-factor')).toBe(`${96 / 72}`)
    expect(text.textContent).toBe('')
    expect(vi.mocked(TextLayer)).toHaveBeenCalledWith(expect.objectContaining({ container: text }))
    expect(cleanup).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('draws high-density pages with a scaled transform', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      { drawImage } as unknown as CanvasRenderingContext2D,
    )
    const { page, render } = fakePage(600, 800)
    const canvas = document.createElement('canvas')
    // A null container skips the text layer, as does an absent one.
    await renderPdfPage(fakeDocument(page), 1, canvas, null, 1, 0, new AbortController().signal)
    expect(canvas.width).toBe(1600)
    expect(render.mock.calls[0]?.[0].transform).toEqual([2, 0, 0, 2, 0, 0])
    // The page painted off-screen and swapped in atomically.
    const offscreen = render.mock.calls[0]?.[0].canvas
    expect(offscreen).not.toBe(canvas)
    expect(drawImage).toHaveBeenCalledWith(offscreen, 0, 0)
    await renderPdfPage(fakeDocument(page), 1, canvas, undefined, 1, 0, new AbortController().signal)
    expect(vi.mocked(TextLayer)).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('refuses an already aborted render', async () => {
    const controller = new AbortController()
    controller.abort()
    const { page, cleanup } = fakePage(600, 800)
    await expect(renderPdfPage(
      fakeDocument(page), 1, document.createElement('canvas'), undefined, 1, 0, controller.signal,
    )).rejects.toThrow()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('cancels the running task when the render is aborted', async () => {
    let cancelTask!: () => void
    const task = {
      promise: new Promise<void>((_resolve, reject) => { cancelTask = () => { reject(new Error('render cancelled')) } }),
      cancel: (): void => { cancelTask() },
    }
    const { page, render, cleanup } = fakePage(600, 800, task)
    const controller = new AbortController()
    const canvas = document.createElement('canvas')
    const pending = renderPdfPage(fakeDocument(page), 1, canvas, undefined, 1, 0, controller.signal)
    // Abort only once the rasteriser is waiting on the running task.
    await vi.waitFor(() => { expect(render).toHaveBeenCalledTimes(1) })
    controller.abort()
    await expect(pending).rejects.toThrow('render cancelled')
    expect(cleanup).toHaveBeenCalledTimes(1)
    // The visible canvas keeps whatever it showed; the aborted raster dies off-screen.
    expect(canvas.style.width).toBe('')
  })

  it('abandons a finished render whose signal aborted before delivery', async () => {
    let resolveTask!: () => void
    const task = {
      promise: new Promise<void>((resolve) => { resolveTask = resolve }),
      cancel: vi.fn(),
    }
    const { page } = fakePage(600, 800, task)
    const controller = new AbortController()
    const pending = renderPdfPage(fakeDocument(page), 1, document.createElement('canvas'), undefined, 1, 0, controller.signal)
    resolveTask()
    controller.abort()
    await expect(pending).rejects.toThrow()
  })

  it('propagates a failed text layer and still releases the page', async () => {
    vi.mocked(TextLayer).mockImplementationOnce(function failingLayer(): unknown {
      return { render: () => Promise.reject(new Error('no text')) }
    })
    const { page, cleanup } = fakePage(600, 800)
    await expect(renderPdfPage(
      fakeDocument(page), 1, document.createElement('canvas'), document.createElement('div'), 1, 0,
      new AbortController().signal,
    )).rejects.toThrow('no text')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})

describe('renderPdfThumbnail', () => {
  it('scales the page to the rail width from its point size', async () => {
    const { page, render, getViewport } = fakePage(595, 842)
    const canvas = document.createElement('canvas')
    const height = await renderPdfThumbnail(fakeDocument(page), 1, canvas, 140, new AbortController().signal)

    expect(getViewport).toHaveBeenNthCalledWith(1, { scale: 1 })
    expect(getViewport).toHaveBeenNthCalledWith(2, { scale: 140 / 595 })
    // 140 CSS px wide, density capped at 2 for the rail, height follows the page.
    expect(canvas.style.width).toBe('140px')
    expect(canvas.width).toBe(280)
    expect(height).toBeCloseTo(842 * (140 / 595), 5)
    expect(render.mock.calls[0]?.[0].transform).toEqual([2, 0, 0, 2, 0, 0])
  })
})
