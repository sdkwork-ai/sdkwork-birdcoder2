// @vitest-environment jsdom
/** Image body: loading, metadata, zoom, rotation, keyboard, and failures. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ImageViewer } from '../src/client/ImageViewer.tsx'
import type { ImageViewerProps } from '../src/client/ImageViewer.tsx'
import { imageViewStore } from '../src/client/store.ts'
import type { ImageViewState } from '../src/client/store.ts'
import { formatForExtension } from '../src/client/image/formats.ts'
import { zh } from '../src/client/locales.ts'

vi.mock('../src/client/image/load.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/client/image/load.ts')>()
  return { ...original, loadImage: vi.fn() }
})

const loader = await import('../src/client/image/load.ts')

/** A live store instance, as the slot would create one per Session. */
type StoreInstance = {
  readonly getSnapshot: () => ImageViewState
  readonly subscribe: (listener: () => void) => () => void
  readonly actions: {
    readonly zoom: (tabId: never, zoom: number | 'fit') => void
    readonly rotation: (tabId: never, rotation: 0 | 90 | 180 | 270) => void
  }
}

/** Build the composed props the slot would hand the body. */
function propsFor(
  data: Uint8Array | undefined,
  store: StoreInstance,
  address = 'photo.png',
  /** Runs while the stage element is being attached, before the measuring effect reads it. */
  onStage?: (node: HTMLDivElement) => void,
  /** The tab record's own lifetime, when the test needs to close the tab. */
  controller = new AbortController(),
): ImageViewerProps {
  return {
    content: data === undefined
      ? { kind: 'text', text: 'not bytes', pages: [], eof: true }
      : { kind: 'bytes', data: data as Uint8Array<ArrayBuffer> },
    resourceAddress: `dsh-resource://file/session/s1/${address}`,
    wrap: false,
    scrollportRef: (node: HTMLElement | null) => {
      if (node !== null && onStage !== undefined) onStage(node as HTMLDivElement)
    },
    useTabInfo: () => ({
      tab: {
        id: 'tab-1',
        contentId: `dsh-resource://file/session/s1/${address}`,
        signal: controller.signal,
        navigation: { revision: 0 },
      },
    }),
    useStore: (selector: (state: ImageViewState) => unknown) => useSyncExternalStore(
      store.subscribe,
      () => selector(store.getSnapshot()),
    ),
    actions: store.actions,
    t: makeTranslate(zh),
  } as unknown as ImageViewerProps
}

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('ImageViewer', () => {
  beforeEach(() => {
    vi.mocked(loader.loadImage).mockReset()
    vi.mocked(loader.loadImage).mockResolvedValue({
      url: 'blob:image',
      format: formatForExtension('tiff')!,
      width: 1200,
      height: 800,
      dpi: { x: 300, y: 300 },
      byteLength: 4096,
    })
  })
  afterEach(cleanup)

  it('shows a progress line, then the image with its metadata', async () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    expect(screen.getByText('正在解析图片…')).toBeTruthy()

    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    // The accessible name is the file's, the way the document owner's own
    // reader words it, so the same file is announced the same way either way.
    expect(screen.getByRole('img').getAttribute('alt')).toBe('图片预览：photo.png')
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:image')
    // An image is not a drag source: dragging the stage pans it.
    expect(screen.getByRole('img').getAttribute('draggable')).toBe('false')
    expect(screen.getByRole('img').getAttribute('decoding')).toBe('async')
    expect(screen.getByRole('img').getAttribute('referrerpolicy')).toBe('no-referrer')
    // The caption and the metadata list both state the decoded size and format.
    expect(screen.getByText('1200 × 800 · TIFF · 4.0 KB')).toBeTruthy()
    const metadata = document.querySelector('[data-image-metadata]')?.textContent ?? ''
    expect(metadata).toContain('1200 × 800')
    expect(metadata).toContain('300 × 300 DPI')
    expect(metadata).toContain('TIFF')
    // TIFF is single-frame, so the animated row says no.
    expect(metadata).toContain('否')
  })

  it('keeps the facts strip outside the stage so a fitted image is not crowded by it', async () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    const stage = document.querySelector('[data-image-stage]') as HTMLElement
    const metadata = document.querySelector('[data-image-metadata]') as HTMLElement
    expect(stage.contains(metadata)).toBe(false)
    // The stage holds the picture and nothing else, which is what makes the
    // fitted scale the stage's own measurements.
    expect(stage.querySelector('[data-image-canvas]')).toBeTruthy()
    expect(stage.querySelectorAll('*').length).toBe(3)
  })

  it('offers no retry for a format that has no decoder, because retrying cannot change it', async () => {
    const heic = formatForExtension('heic')!
    vi.mocked(loader.loadImage).mockRejectedValue(
      new loader.ImageLoadError('unsupported', 'no decoder', heic),
    )
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store, 'photo.heic')} />)
    await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy() })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('HEIF')
    expect(alert.querySelector('[data-image-failure-format]')?.textContent).toBe('HEIF')
    expect(screen.queryByText('重试')).toBeNull()
  })

  it('reports an image beyond the decode budget by its dimensions, without a retry', async () => {
    vi.mocked(loader.loadImage).mockRejectedValue(
      new loader.ImageLoadError('too-large', 'the directory claims 40000 × 40000 pixels', formatForExtension('tif'), {
        width: 40000,
        height: 40000,
      }),
    )
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy() })
    expect(screen.getByRole('alert').textContent).toContain('40000 × 40000')
    expect(screen.queryByText('重试')).toBeNull()
  })

  it('zooms on a modified wheel and holds the point under the pointer', async () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    const stage = document.querySelector('[data-image-stage]') as HTMLElement
    // jsdom keeps a scroll position only within a scrollable extent, so the one
    // a zoomed image has is stated rather than laid out.
    Object.defineProperty(stage, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(stage, 'scrollWidth', { value: 2400, configurable: true })

    // A plain wheel is the stage's own scrolling and must not change the zoom.
    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }))
    expect(store.getSnapshot().byTab['tab-1' as never]).toBeUndefined()

    const modified = new WheelEvent('wheel', {
      deltaY: -120,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
    })
    stage.dispatchEvent(modified)
    expect(modified.defaultPrevented).toBe(true)
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    // The pointer's own point stays put: the offset it was over is carried into
    // the scroll rather than the picture walking away from it.
    await waitFor(() => { expect(stage.scrollLeft).toBe(5) })
  })

  it('toggles between the fitted scale and actual size on a double click', async () => {
    // jsdom lays nothing out and reports a zero-sized stage, so a measured one
    // is stated while the stage attaches: at zero the fitted scale is 1 and the
    // fitted and actual-size gestures would be indistinguishable.
    const store = defineStore(imageViewStore).create()
    const measured = (node: HTMLDivElement): void => {
      Object.defineProperty(node, 'clientWidth', { value: 600, configurable: true })
      Object.defineProperty(node, 'clientHeight', { value: 400, configurable: true })
    }
    render(<ImageViewer {...propsFor(BYTES, store, 'photo.png', measured)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    const stage = document.querySelector('[data-image-stage]') as HTMLElement
    // 600 × 400 less the stage padding over a 1200 × 800 image.
    await waitFor(() => {
      expect((document.querySelector('[data-image-scale]') as HTMLElement).style.transform).toBe('scale(0.46)')
      expect((document.querySelector('[data-image-canvas]') as HTMLElement).style.width).toBe('552px')
    })

    fireEvent.doubleClick(stage)
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(1)
    fireEvent.doubleClick(stage)
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')
  })

  it('pans a zoomed image by dragging the stage', async () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    const stage = document.querySelector('[data-image-stage]') as HTMLElement
    // jsdom lays nothing out, so the scroll extent the gesture needs is stated.
    Object.defineProperty(stage, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(stage, 'scrollWidth', { value: 2400, configurable: true })
    Object.defineProperty(stage, 'scrollHeight', { value: 1600, configurable: true })
    Object.defineProperty(stage, 'clientHeight', { value: 400, configurable: true })
    stage.setPointerCapture = vi.fn()
    stage.hasPointerCapture = vi.fn(() => true)
    const release = vi.fn()
    stage.releasePointerCapture = release

    fireEvent.pointerDown(stage, { button: 0, pointerId: 3, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(stage, { pointerId: 3, clientX: 40, clientY: 60 })
    expect(stage.scrollLeft).toBe(60)
    expect(stage.scrollTop).toBe(40)
    fireEvent.pointerUp(stage, { pointerId: 3 })
    expect(release).toHaveBeenCalled()
  })

  it('revokes the blob URL when the tab closes', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const store = defineStore(imageViewStore).create()
    const view = render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:image')
    revoke.mockRestore()
  })

  it('gives a closed tab\'s viewing state back to the store', async () => {
    const store = defineStore(imageViewStore).create()
    const controller = new AbortController()
    render(<ImageViewer {...propsFor(BYTES, store, 'photo.png', undefined, controller)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })
    fireEvent.click(screen.getByLabelText('放大'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)

    // The store lives as long as the workspace while a tab does not, so an entry
    // its own record can no longer reach is state nobody will ever read again.
    controller.abort()
    await waitFor(() => { expect(store.getSnapshot().byTab['tab-1' as never]).toBeUndefined() })
  })

  it('reads the suffix from the resource address rather than the content', async () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store, 'scan.HEIC')} />)
    await waitFor(() => { expect(loader.loadImage).toHaveBeenCalled() })
    expect(vi.mocked(loader.loadImage).mock.calls[0]?.[1]).toBe('HEIC')
  })

  it('scales the rendered image, not only its layout box', async () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })

    fireEvent.click(screen.getByLabelText('实际大小'))
    await waitFor(() => {
      const scaled = document.querySelector('[data-image-scale]') as HTMLElement
      expect(scaled.style.transform).toBe('scale(1)')
    })
    fireEvent.click(screen.getByLabelText('放大'))
    await waitFor(() => {
      const scaled = document.querySelector('[data-image-scale]') as HTMLElement
      expect(scaled.style.transform).toBe('scale(1.25)')
    })
  })

  it('applies zoom steps and returns to the fitted scale', async () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })

    fireEvent.click(screen.getByLabelText('放大'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.click(screen.getByLabelText('缩小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5)
    fireEvent.click(screen.getByLabelText('实际大小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(1)
    fireEvent.click(screen.getByLabelText('适应窗口'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')

    const stage = document.querySelector('[data-image-stage]') as HTMLElement
    fireEvent.keyDown(stage, { key: '+' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1.25, 5)
    fireEvent.keyDown(stage, { key: '-' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBeCloseTo(1, 5)
    fireEvent.keyDown(stage, { key: '0' })
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')
  })

  it('rotates in quarter turns and swaps the stage box for a quarter turn', async () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => { expect(screen.getByRole('img')).toBeTruthy() })

    expect(screen.getByLabelText<HTMLButtonElement>('恢复方向').disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('向右旋转'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.rotation).toBe(90)
    // A quarter turn swaps which dimension drives the stage box.
    await waitFor(() => {
      const canvas = document.querySelector('[data-image-canvas]') as HTMLElement
      expect(canvas.style.width).toBe('800px')
      expect(canvas.style.height).toBe('1200px')
    })
    expect(screen.getByLabelText<HTMLButtonElement>('恢复方向').disabled).toBe(false)
    fireEvent.click(screen.getByLabelText('向左旋转'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.rotation).toBe(0)
    fireEvent.click(screen.getByLabelText('恢复方向'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.rotation).toBe(0)
  })

  it('explains a format it recognizes but cannot draw, naming the format and the way out', async () => {
    const heif = formatForExtension('heic')!
    vi.mocked(loader.loadImage).mockRejectedValue(
      new loader.ImageLoadError('unsupported', 'no decoder', heif),
    )
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store, 'photo.heic')} />)
    await waitFor(() => {
      const text = screen.getByRole('alert').textContent ?? ''
      expect(text).toContain('HEIF')
      expect(text).toContain('另存为 JPEG 或 PNG')
    })
  })

  it('explains a damaged file and reopens on request', async () => {
    vi.mocked(loader.loadImage).mockRejectedValue(
      new loader.ImageLoadError('decode', 'bad strip', formatForExtension('tif')),
    )
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('TIFF 文件无法解码')
    })
    expect(loader.loadImage).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('重试'))
    await waitFor(() => { expect(loader.loadImage).toHaveBeenCalledTimes(2) })
  })

  it('explains a file that is not an image at all', async () => {
    vi.mocked(loader.loadImage).mockRejectedValue(new loader.ImageLoadError('not-image', 'no signature'))
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(BYTES, store)} />)
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的图片。')
    })
  })

  it('refuses content that is not complete bytes', () => {
    const store = defineStore(imageViewStore).create()
    render(<ImageViewer {...propsFor(undefined, store)} />)
    expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的图片。')
  })
})
