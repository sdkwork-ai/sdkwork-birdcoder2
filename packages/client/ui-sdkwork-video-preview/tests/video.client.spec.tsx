// @vitest-environment jsdom
/**
 * Video registration, the player's behavior, and the panel-local render fence.
 *
 * Identification against real muxer output lives in `containers.client.spec.ts`,
 * which runs in the Node environment so it can read the ffmpeg fixtures; the
 * geometry and the browser display APIs live in `presentation.client.spec.ts`.
 * What is left here is what the document body actually does with an identified
 * file.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore, type ReactNode } from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DocumentPreviewRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/document/registry.ts'
import { VIDEO_BODY_ID, VIDEO_EXTENSIONS } from '../src/client/definition.ts'
import { apply } from '../src/client/index.ts'
import { VideoBoundary } from '../src/client/VideoBoundary.tsx'
import { VideoPlayer, VideoPreviewBody } from '../src/client/VideoPlayer.tsx'
import type { VideoPlayerProps } from '../src/client/VideoPlayer.tsx'
import { DEFAULT_VIDEO_VIEW, videoViewStore } from '../src/client/store.ts'
import { apply as applyHost } from '../src/index.ts'
import type { VideoViewState } from '../src/client/store.ts'
import { en, zh } from '../src/client/locales.ts'

/**
 * Read one generated fixture.
 *
 * Under jsdom `import.meta.url` is not a file URL, so the path is resolved from
 * the runner's working directory instead.
 * @param name - the fixture's file name.
 * @returns the file's bytes.
 */
function fixture(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(join(process.cwd(), 'packages/client/ui-sdkwork-video-preview/tests/samples', name)))
}

/** ASCII bytes for a four-character code. */
function text(value: string): number[] {
  return Array.from(value, character => character.charCodeAt(0))
}

/** Big-endian 32-bit bytes. */
function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

/** Big-endian 16-bit bytes. */
function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff]
}

/** One ISO base media file format box. */
function box(type: string, payload: readonly number[]): number[] {
  return [...u32(8 + payload.length), ...text(type), ...payload]
}

/** A sample description table holding one entry in the given format. */
function sampleTable(format: string, size?: { readonly width: number; readonly height: number }): number[] {
  const entry = size === undefined
    ? box(format, new Array<number>(20).fill(0))
    : box(format, [...new Array<number>(24).fill(0), ...u16(size.width), ...u16(size.height)])
  return box('stsd', [0, 0, 0, 0, ...u32(1), ...entry])
}

/** One track of the given handler kind, carrying one codec. */
function track(handler: string, format: string, size?: { readonly width: number; readonly height: number }): number[] {
  return box('trak', box('mdia', [
    ...box('hdlr', [0, 0, 0, 0, 0, 0, 0, 0, ...text(handler), ...new Array<number>(12).fill(0)]),
    ...box('minf', box('stbl', sampleTable(format, size))),
  ]))
}

/** An MP4 built from the given tracks, with no movie header of its own. */
function movie(...tracks: readonly number[][]): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    ...box('ftyp', [...text('isom'), 0, 0, 0, 0, ...text('isom')]),
    ...box('moov', tracks.flat()),
  ])
}

/** The stage's measured content box, which jsdom has no layout to produce. */
const stageBox = { width: 0, height: 0 }

/** The original layout getters, restored after the suite. */
const originalClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
const originalClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
const originalResizeObserver = Reflect.get(globalThis, 'ResizeObserver') as unknown

/**
 * A ResizeObserver that reports its instances, so a test can drive a resize.
 * jsdom defines none, and without one the stage is measured only once.
 */
class StubResizeObserver {
  static readonly live = new Set<StubResizeObserver>()
  constructor(private readonly callback: () => void) { StubResizeObserver.live.add(this) }
  observe(): void { /* the callback is driven by the test instead */ }
  disconnect(): void { StubResizeObserver.live.delete(this) }
  /** Run the measurement the browser would run on a resize. */
  resize(): void { this.callback() }
}

beforeAll(() => {
  // Only the stage reports a client box; every other element keeps jsdom's zero.
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element): number { return this.hasAttribute('data-video-stage') ? stageBox.width : 0 },
  })
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get(this: Element): number { return this.hasAttribute('data-video-stage') ? stageBox.height : 0 },
  })
  Reflect.set(globalThis, 'ResizeObserver', StubResizeObserver)
})

afterAll(() => {
  if (originalClientWidth !== undefined) Object.defineProperty(Element.prototype, 'clientWidth', originalClientWidth)
  if (originalClientHeight !== undefined) Object.defineProperty(Element.prototype, 'clientHeight', originalClientHeight)
  Reflect.set(globalThis, 'ResizeObserver', originalResizeObserver)
})

describe('video registration', () => {
  it('claims the video suffixes and removes every contribution on dispose', async () => {
    const ctx = new Context()
    const previews = new DocumentPreviewRegistry()
    const dictionaries = new Map<string, unknown>()
    const entries: Array<{
      name: string
      key: string
      locale: string
      store: { create: () => StoreInstance }
    }> = []
    const register = vi.fn((options: typeof entries[number], component: unknown) => {
      expect(component).toBe(VideoPreviewBody)
      entries.push(options)
      return () => { entries.splice(entries.indexOf(options), 1) }
    })
    ctx.provide('documentPreviews', previews)
    ctx.provide('locale', {
      register: (name: string, value: unknown) => {
        dictionaries.set(name, value)
        return () => { dictionaries.delete(name) }
      },
      bind: () => makeTranslate(en),
    } as never)
    ctx.provide('slots', {
      inject: (_name: string, callback: () => () => void) => callback(),
      register,
    } as never)
    const fiber = ctx.plugin({ apply })
    try {
      await fiber.await()
      // Nothing claimed video before this package, so the suffix is unopposed.
      expect(previews.candidates('clip.mp4').map(candidate => candidate.id)).toEqual([VIDEO_BODY_ID])
      expect(previews.candidates('clip.mkv').map(candidate => candidate.id)).toEqual([VIDEO_BODY_ID])
      expect(previews.candidates('clip.wmv').map(candidate => candidate.id)).toEqual([VIDEO_BODY_ID])
      expect(previews.candidates('clip.mp4')[0]).toMatchObject({
        id: VIDEO_BODY_ID,
        extensions: [...VIDEO_EXTENSIONS],
        loading: 'bytes-complete',
        wrap: false,
      })
      expect(previews.candidates('clip.mp4')[0]?.title()).toBe('Video')
      expect(dictionaries.get('sdkworkVideoPreview')).toEqual({ zh, en })
      expect(entries[0]).toMatchObject({ name: 'sidebar.right.tab.document', key: VIDEO_BODY_ID, locale: 'sdkworkVideoPreview' })
      // The seat's store is what the tab lifecycle drives: the document owner
      // calls `forget` when a tab closes, so both mutations are exercised here
      // rather than reached only through a rendered element.
      const instance = entries[0].store.create()
      expect(instance.getSnapshot().byTab).toEqual({})
      instance.actions.update('tab-1' as never, { rate: 1.5, volume: 0.4 })
      expect(instance.getSnapshot().byTab).toEqual({ 'tab-1': { ...DEFAULT_VIDEO_VIEW, rate: 1.5, volume: 0.4 } })
      instance.actions.update('tab-2' as never, { loop: true })
      instance.actions.forget('tab-1' as never)
      expect(instance.getSnapshot().byTab).toEqual({ 'tab-2': { ...DEFAULT_VIDEO_VIEW, loop: true } })
      await fiber.dispose()
      expect(entries).toEqual([])
      expect(dictionaries.size).toBe(0)
      expect(previews.getSnapshot()).toEqual([])
    } finally {
      await fiber.dispose()
    }
  })

  it('never takes a file away from the renderer that can actually show it', async () => {
    // This registration leaves `priority` unset, which puts it in the extension
    // band — ahead of the built-in code preview. That is exactly why `.ts`,
    // `.mts` and `.tsv` are not claimed: with them, opening a TypeScript source
    // or a tab-separated export would route it to a video player that can only
    // answer "this file is not a readable video".
    const ctx = new Context()
    const previews = new DocumentPreviewRegistry()
    ctx.provide('documentPreviews', previews)
    ctx.provide('locale', { register: () => () => { }, bind: () => makeTranslate(en) } as never)
    ctx.provide('slots', { inject: (_name: string, callback: () => () => void) => callback(), register: () => () => { } } as never)
    const fiber = ctx.plugin({ apply })
    try {
      await fiber.await()
      previews.register({
        id: 'code',
        extensions: ['ts', 'tsx', 'mts', 'cts'],
        priority: 'builtin',
        title: () => 'TypeScript',
        loading: 'text-pages',
        wrap: true,
      })
      expect(previews.candidates('source.ts').map(candidate => candidate.id)).toEqual(['code'])
      expect(previews.candidates('module.mts').map(candidate => candidate.id)).toEqual(['code'])
      expect(previews.candidates('export.tsv')).toEqual([])
      expect(previews.candidates('clip.m2ts').map(candidate => candidate.id)).toEqual([VIDEO_BODY_ID])
    } finally {
      await fiber.dispose()
    }
  })
})

/** A live store instance, as the slot would create one per Session. */
type StoreInstance = {
  readonly getSnapshot: () => VideoViewState
  readonly subscribe: (listener: () => void) => () => void
  readonly actions: {
    readonly update: (tabId: never, patch: Partial<VideoViewState['byTab'][never]>) => void
    readonly forget: (tabId: never) => void
  }
}

/** Build the composed props the slot would hand the body. */
function propsFor(data: Uint8Array | undefined, store: StoreInstance, address = 'clip.mp4'): VideoPlayerProps {
  const controller = new AbortController()
  return {
    content: data === undefined
      ? { kind: 'text', text: 'not bytes', pages: [], eof: true }
      : { kind: 'bytes', data: data as Uint8Array<ArrayBuffer> },
    resourceAddress: `dsh-resource://file/session/s1/${address}`,
    wrap: false,
    scrollportRef: vi.fn(),
    useTabInfo: () => ({
      tab: {
        id: 'tab-1',
        contentId: `dsh-resource://file/session/s1/${address}`,
        signal: controller.signal,
        navigation: { revision: 0 },
      },
    }),
    useStore: (selector: (state: VideoViewState) => unknown) => useSyncExternalStore(
      store.subscribe,
      () => selector(store.getSnapshot()),
    ),
    actions: store.actions,
    t: makeTranslate(zh),
  } as unknown as VideoPlayerProps
}

/** Render the player and wait for its element or its explanation. */
async function mount(data: Uint8Array | undefined, address = 'clip.mp4', store = defineStore(videoViewStore).create()): Promise<{
  readonly store: StoreInstance
  readonly stage: HTMLElement
  readonly media: HTMLVideoElement
}> {
  render(<VideoPlayer {...propsFor(data, store as unknown as StoreInstance, address)} />)
  const stage = await waitFor(() => {
    const found = document.querySelector<HTMLElement>('[data-video-stage]')
    expect(found).toBeTruthy()
    return found as HTMLElement
  })
  const media = await waitFor(() => {
    const found = document.querySelector<HTMLVideoElement>('[data-video-element]')
    expect(found).toBeTruthy()
    return found as HTMLVideoElement
  })
  return { store: store as unknown as StoreInstance, stage, media }
}

/**
 * Replace a member jsdom does not implement usefully.
 *
 * The targets are the element, the stage and the document, which is why this
 * takes any object rather than the element alone.
 * @param target - the element, stage or document to shadow a member on.
 * @param member - the member name.
 * @param value - what the platform would have provided.
 */
function patch(target: object, member: string, value: unknown): void {
  Object.defineProperty(target, member, { configurable: true, value })
}

/**
 * Give the element a finite duration and a play/pause pair.
 * @param media - the element under test.
 * @param duration - the duration a real decoder would have reported.
 * @returns the playback spies.
 */
function makePlayable(media: HTMLVideoElement, duration = 12): {
  readonly play: ReturnType<typeof vi.fn>
  readonly pause: ReturnType<typeof vi.fn>
} {
  const play = vi.fn(() => Promise.resolve())
  const pause = vi.fn()
  patch(media, 'duration', duration)
  patch(media, 'play', play)
  patch(media, 'pause', pause)
  return { play, pause }
}

/**
 * The `document` members the presentation tests shadow.
 *
 * jsdom puts both of these on the prototype as getters returning null, so
 * shadowing one installs an own property that outlives the test. A
 * `fullscreenElement` left pointing at a stage that has since been torn down
 * makes the *next* test's "enter fullscreen" press take the exit branch, which
 * is a test leaking into a test rather than a defect in the player.
 */
const PATCHED_DOCUMENT_MEMBERS = ['fullscreenElement', 'pictureInPictureElement', 'exitFullscreen', 'exitPictureInPicture'] as const

describe('VideoPlayer', () => {
  afterEach(() => {
    cleanup()
    // The prototype getters stay installed for the whole suite; only the box a
    // test asked the stage to report is reset.
    stageBox.width = 0
    stageBox.height = 0
    for (const member of PATCHED_DOCUMENT_MEMBERS) Reflect.deleteProperty(document, member)
  })

  it('paints a loading line rather than an empty stage while the bytes are read', () => {
    // The library's own `render` runs inside `act`, which settles the
    // identification effect — so it can observe the player, never the paint
    // before it. A root driven by `flushSync` commits that paint and only
    // *schedules* the passive effects, which is the state a reader actually
    // sees while a file is being read.
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    flushSync(() => {
      root.render(<VideoPlayer {...propsFor(fixture('plain-h264.mp4'), defineStore(videoViewStore).create())} />)
    })
    expect(container.querySelector('[data-video-loading]')).toBeTruthy()
    expect(container.querySelector('[data-video-element]')).toBeNull()
    act(() => { root.unmount() })
    container.remove()
  })

  it('plays a decodable container and reports what it is', async () => {
    const { media } = await mount(fixture('plain-h264.mp4'))
    expect(media.getAttribute('src')).toMatch(/^blob:/u)
    expect(media.getAttribute('preload')).toBe('metadata')
    const metadata = document.querySelector('[data-video-metadata]')?.textContent ?? ''
    expect(metadata).toContain('MP4')
    expect(metadata).toContain('H.264')
    expect(metadata).toContain('64 × 48')
    expect(metadata).toContain('0:01')
    expect(document.querySelector('[data-video-elapsed]')?.textContent).toBe('0:00 / 0:00')
  })

  it('reports a container and a codec it could not read as unknown rather than as zero', async () => {
    await mount(movie(track('soun', 'mp4a')))
    const metadata = document.querySelector('[data-video-metadata]')?.textContent ?? ''
    expect(metadata).toContain('未知')
    // An audio-only file has no picture, so the size is unknown — not "0 × 0".
    expect(metadata).not.toContain('0 × 0')
  })

  it('inflects the audio-track summary and omits the clause when there is none', async () => {
    const single = await mount(movie(track('vide', 'avc1', { width: 64, height: 48 }), track('soun', 'mp4a')))
    expect(document.querySelector('[data-video-metadata]')?.textContent).toContain('1 条音轨')
    cleanup()
    const pair = await mount(movie(track('vide', 'avc1', { width: 64, height: 48 }), track('soun', 'mp4a'), track('soun', 'mp4a')))
    expect(document.querySelector('[data-video-metadata]')?.textContent).toContain('2 条音轨')
    cleanup()
    await mount(fixture('plain-h264.mp4'))
    expect(document.querySelector('[data-video-metadata]')?.textContent).not.toContain('条音轨')
    expect(single.media).toBeTruthy()
    expect(pair.media).toBeTruthy()
  })

  it('explains a container no browser plays, in the reader’s own language', async () => {
    render(<VideoPlayer {...propsFor(fixture('plain-wmv2.wmv'), defineStore(videoViewStore).create() as unknown as StoreInstance, 'clip.wmv')} />)
    await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy() })
    expect(document.querySelector('[data-video-element]')).toBeNull()
    const panel = document.querySelector('[data-video-explanation]')
    expect(panel?.textContent).toContain('ASF')
    expect(panel?.textContent).toContain('Windows Media Video 8')
    // The sentence comes from the dictionary, not from the byte reader: an
    // English surface and a Chinese one must not disagree about the advice.
    expect(panel?.textContent).toContain(zh['reason.asf'])
    // A blocked file has nothing to retry: identification is deterministic.
    expect(document.querySelector('[data-video-explain-retry]')).toBeNull()
    // There is no element to transport, so there is no transport. A bar full of
    // controls that look pressable and do nothing is a worse answer than no bar
    // at all — which is what the office previews do with their failure states.
    expect(document.querySelector('[data-video-play]')).toBeNull()
    expect(document.querySelector('[data-video-seek]')).toBeNull()
    expect(document.querySelector('[data-video-zoom-in]')).toBeNull()
    // The stage is not a keyboard transport either: a focusable region whose
    // keys do nothing is the same dead affordance in a different shape.
    expect(document.querySelector('[data-video-stage]')?.getAttribute('tabindex')).toBeNull()
    // The facts stay, because they are the one part of this panel that is not an
    // affordance — and for a file the platform refuses they are what a reader
    // deciding on a conversion needs. This is the difference from the image
    // preview, whose failure state has no facts to give: nothing about a video
    // can be learned by rendering it, and everything here was read from bytes.
    const facts = document.querySelector('[data-video-metadata]')?.textContent
    expect(facts).toContain('ASF')
    expect(facts).toContain('Windows Media Video 8')
    expect(facts).toContain('64 × 48')
    expect(facts).toContain('0:01')
  })

  it('drops the transport bar when the platform refuses a playable container', async () => {
    // A decode failure is the same situation from the reader's side: the file
    // cannot be played, so the controls cannot be honored. It keeps the retry,
    // which is the one control that can still change the outcome.
    render(<VideoPlayer {...propsFor(fixture('plain-h264.mp4'), defineStore(videoViewStore).create() as unknown as StoreInstance)} />)
    const element = await waitFor(() => {
      const found = document.querySelector<HTMLVideoElement>('[data-video-element]')
      expect(found).toBeTruthy()
      return found as HTMLVideoElement
    })
    patch(element, 'error', { code: 3 })
    fireEvent.error(element)
    await waitFor(() => { expect(document.querySelector('[data-video-explanation]')).toBeTruthy() })
    expect(document.querySelector('[data-video-play]')).toBeNull()
    expect(document.querySelector('[data-video-fullscreen]')).toBeNull()
    expect(document.querySelector('[data-video-explain-retry]')).toBeTruthy()
    expect(document.querySelector('[data-video-metadata]')?.textContent).toContain('H.264')
  })

  it('explains a playable container holding a codec no browser decodes', async () => {
    render(<VideoPlayer {...propsFor(fixture('plain-prores.mov'), defineStore(videoViewStore).create() as unknown as StoreInstance, 'clip.mov')} />)
    await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy() })
    const panel = document.querySelector('[data-video-explanation]')
    expect(panel?.textContent).toContain('Apple ProRes 422 Proxy')
    expect(panel?.textContent).toContain(zh['reason.prores'])
  })

  it('reports a platform decode failure with the container and codec it read', async () => {
    const store = defineStore(videoViewStore).create()
    render(<VideoPlayer {...propsFor(fixture('plain-h264.mp4'), store as unknown as StoreInstance)} />)
    const element = await waitFor(() => {
      const found = document.querySelector<HTMLVideoElement>('[data-video-element]')
      expect(found).toBeTruthy()
      return found as HTMLVideoElement
    })
    // The platform refuses the file even though the container looked playable.
    patch(element, 'error', { code: 4 })
    fireEvent.error(element)
    const panel = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-video-explanation]')
      expect(found).toBeTruthy()
      return found as HTMLElement
    })
    expect(panel.textContent).toContain('MP4')
    expect(panel.textContent).toContain('H.264')
    expect(panel.textContent).toContain('无法解码')
    expect(panel.textContent).toContain(zh.mediaUnsupported)
    // A decode failure is worth retrying, which is what the button does.
    fireEvent.click(document.querySelector('[data-video-explain-retry]') as HTMLElement)
    await waitFor(() => { expect(document.querySelector('[data-video-element]')).toBeTruthy() })
  })

  it('maps every media error code it can, and falls back for the ones it cannot', async () => {
    for (const [code, expected] of [[1, zh.mediaAborted], [2, zh.mediaNetwork], [3, zh.mediaDecode], [5, zh.mediaDecode]] as const) {
      cleanup()
      render(<VideoPlayer {...propsFor(fixture('plain-h264.mp4'), defineStore(videoViewStore).create() as unknown as StoreInstance)} />)
      const element = await waitFor(() => {
        const found = document.querySelector<HTMLVideoElement>('[data-video-element]')
        expect(found).toBeTruthy()
        return found as HTMLVideoElement
      })
      patch(element, 'error', { code })
      fireEvent.error(element)
      await waitFor(() => { expect(document.querySelector('[data-video-explanation]')?.textContent).toContain(expected) })
    }
  })

  it('treats a refusal with no error object as an unsupported format', async () => {
    render(<VideoPlayer {...propsFor(fixture('plain-h264.mp4'), defineStore(videoViewStore).create() as unknown as StoreInstance)} />)
    const element = await waitFor(() => {
      const found = document.querySelector<HTMLVideoElement>('[data-video-element]')
      expect(found).toBeTruthy()
      return found as HTMLVideoElement
    })
    fireEvent.error(element)
    await waitFor(() => { expect(document.querySelector('[data-video-explanation]')?.textContent).toContain(zh.mediaUnsupported) })
  })

  it('offers a retry when nothing identified the bytes', async () => {
    render(<VideoPlayer {...propsFor(new Uint8Array(64), defineStore(videoViewStore).create(), 'clip.zzz')} />)
    const retry = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-video-retry]')
      expect(found).toBeTruthy()
      return found as HTMLElement
    })
    expect(document.querySelector('[data-video-unreadable]')?.textContent).toContain('这个文件不是可读取的视频。')
    fireEvent.click(retry)
    // Re-identification of the same bytes is deterministic, so the answer stands.
    await waitFor(() => { expect(document.querySelector('[data-video-retry]')).toBeTruthy() })
  })

  it('refuses content that is not complete bytes', () => {
    const store = defineStore(videoViewStore).create()
    render(<VideoPlayer {...propsFor(undefined, store as unknown as StoreInstance)} />)
    expect(screen.getByRole('alert').textContent).toContain('这个文件不是可读取的视频。')
  })

  it('forgets the previous file entirely when the tab shows another one', async () => {
    const store = defineStore(videoViewStore).create()
    const mounted = render(<VideoPlayer {...propsFor(fixture('plain-h264.mp4'), store as unknown as StoreInstance)} />)
    const element = await waitFor(() => {
      const found = document.querySelector<HTMLVideoElement>('[data-video-element]')
      expect(found).toBeTruthy()
      return found as HTMLVideoElement
    })
    patch(element, 'error', { code: 4 })
    fireEvent.error(element)
    await waitFor(() => { expect(document.querySelector('[data-video-explanation]')).toBeTruthy() })

    mounted.rerender(<VideoPlayer {...propsFor(fixture('plain-h264.m2ts'), store, 'other.m2ts')} />)
    // The failure belonged to the file that was replaced, so it cannot survive
    // into the next one.
    await waitFor(() => { expect(document.querySelector('[data-video-element]')).toBeTruthy() })
    expect(document.querySelector('[data-video-explanation]')).toBeNull()
    expect(document.querySelector('[data-video-metadata]')?.textContent).toContain('MPEG transport stream')
  })

  it('holds transport state in the tab store and applies it to the element', async () => {
    const { store, media } = await mount(fixture('plain-h264.mp4'))
    const view = (): VideoViewState['byTab'][never] | undefined => store.getSnapshot().byTab['tab-1' as never]

    fireEvent.click(screen.getByLabelText('静音'))
    expect(view()?.muted).toBe(true)
    expect(document.querySelector('[data-video-mute] svg')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('取消静音'))
    expect(view()?.muted).toBe(false)
    fireEvent.click(screen.getByLabelText('循环播放'))
    expect(view()?.loop).toBe(true)
    expect(screen.getByLabelText('循环播放').getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByLabelText('音量'), { target: { value: '40' } })
    expect(view()?.volume).toBeCloseTo(0.4, 5)
    // Changing the volume unmutes, which is what a reader expects.
    expect(view()?.muted).toBe(false)
    // The rate is chosen directly rather than stepped through.
    fireEvent.change(screen.getByLabelText('播放速度'), { target: { value: '1.5' } })
    expect(view()?.rate).toBe(1.5)
    expect(media.playbackRate).toBe(1.5)
    expect(media.muted).toBe(false)
    expect(media.loop).toBe(true)
    expect(media.volume).toBeCloseTo(0.4, 5)
  })

  it('puts a tab’s own transport state back on a freshly mounted element', async () => {
    const store = defineStore(videoViewStore).create()
    store.actions.update('tab-1' as never, { volume: 0.35, muted: true, loop: true, rate: 1.5 })
    const { media } = await mount(fixture('plain-h264.mp4'), 'clip.mp4', store)
    // Nothing has been clicked here: the element starts at the browser's
    // defaults, so only the store can have produced these.
    expect(media.volume).toBeCloseTo(0.35, 5)
    expect(media.muted).toBe(true)
    expect(media.loop).toBe(true)
    expect(media.playbackRate).toBe(1.5)
  })

  it('mutes itself when the volume is dragged to silence', async () => {
    const { store } = await mount(fixture('plain-h264.mp4'))
    fireEvent.change(screen.getByLabelText('音量'), { target: { value: '0' } })
    expect(store.getSnapshot().byTab['tab-1' as never]?.volume).toBe(0)
    // A silenced file shows the muted icon even though the mute flag is clear.
    expect(document.querySelector('[data-video-mute] svg')).toBeTruthy()
    expect(screen.getByLabelText('静音')).toBeTruthy()
  })

  it('plays, pauses, and reports what the element did', async () => {
    const { store, media } = await mount(fixture('plain-h264.mp4'))
    const { play, pause } = makePlayable(media)
    patch(media, 'paused', true)
    fireEvent.click(screen.getByLabelText('播放'))
    expect(play).toHaveBeenCalledTimes(1)
    fireEvent.play(media)
    expect(screen.getByLabelText('暂停')).toBeTruthy()

    patch(media, 'paused', false)
    patch(media, 'currentTime', 4)
    fireEvent.click(screen.getByLabelText('暂停'))
    expect(pause).toHaveBeenCalledTimes(1)
    fireEvent.pause(media)
    expect(screen.getByLabelText('播放')).toBeTruthy()
    // Leaving the tab keeps the playhead the element reported.
    expect(store.getSnapshot().byTab['tab-1' as never]?.position).toBe(4)
    fireEvent.ended(media)
    expect(screen.getByLabelText('播放')).toBeTruthy()
  })

  it('survives an element that refuses to start', async () => {
    const { media } = await mount(fixture('plain-h264.mp4'))
    patch(media, 'paused', true)
    patch(media, 'play', vi.fn(() => Promise.reject(new Error('no decoder'))))
    fireEvent.click(screen.getByLabelText('播放'))
    expect(screen.getByLabelText('播放')).toBeTruthy()
  })

  it('restores the playhead a tab was left at, and ignores one past the end', async () => {
    const store = defineStore(videoViewStore).create()
    store.actions.update('tab-1' as never, { position: 3 })
    const { media } = await mount(fixture('plain-h264.mp4'), 'clip.mp4', store)
    makePlayable(media, 12)
    fireEvent.loadedMetadata(media)
    expect(media.currentTime).toBe(3)
    cleanup()

    const past = defineStore(videoViewStore).create()
    past.actions.update('tab-1' as never, { position: 30 })
    const beyond = await mount(fixture('plain-h264.mp4'), 'clip.mp4', past)
    makePlayable(beyond.media, 12)
    fireEvent.loadedMetadata(beyond.media)
    // The file shrank since the tab was left; the stored playhead is not applied.
    expect(beyond.media.currentTime).toBe(0)
  })

  it('seeks, and keeps the slider out of the way while it is dragged', async () => {
    const { media } = await mount(fixture('plain-h264.mp4'))
    makePlayable(media, 12)
    fireEvent.loadedMetadata(media)
    const seek = screen.getByLabelText('播放进度')
    fireEvent.change(seek, { target: { value: '500' } })
    expect(media.currentTime).toBe(6)
    expect(document.querySelector('[data-video-elapsed]')?.textContent).toBe('0:06 / 0:12')
    // The slider is the truth while it is held: a time update must not fight it.
    fireEvent.pointerDown(seek)
    patch(media, 'currentTime', 2)
    fireEvent.timeUpdate(media)
    expect(document.querySelector('[data-video-elapsed]')?.textContent).toBe('0:06 / 0:12')
    fireEvent.pointerUp(seek)
    fireEvent.timeUpdate(media)
    expect(document.querySelector('[data-video-elapsed]')?.textContent).toBe('0:02 / 0:12')
    // A drag the platform takes away arrives as a cancel and as no release at
    // all — a touch the browser reads as a scroll, a pointer released outside
    // the window. The flag must come down anyway, or the clock and the thumb
    // stay frozen for the rest of the session.
    fireEvent.pointerDown(seek)
    fireEvent.pointerCancel(seek)
    patch(media, 'currentTime', 4)
    fireEvent.timeUpdate(media)
    expect(document.querySelector('[data-video-elapsed]')?.textContent).toBe('0:04 / 0:12')
  })

  it('drives the transport from the keyboard once the stage has focus', async () => {
    const { store, stage, media } = await mount(fixture('plain-h264.mp4'))
    const { play, pause } = makePlayable(media, 12)
    fireEvent.loadedMetadata(media)
    const view = (): VideoViewState['byTab'][never] | undefined => store.getSnapshot().byTab['tab-1' as never]

    patch(media, 'paused', true)
    fireEvent.keyDown(stage, { key: ' ' })
    expect(play).toHaveBeenCalledTimes(1)
    // The element is the authority on whether it is playing, so the second
    // toggle pauses only once the element has actually left the paused state —
    // which is what a real element does when `play()` settles.
    patch(media, 'paused', false)
    fireEvent.keyDown(stage, { key: 'k' })
    expect(pause).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(media.currentTime).toBe(5)
    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    expect(media.currentTime).toBe(0)

    fireEvent.keyDown(stage, { key: 'ArrowUp' })
    expect(view()?.volume).toBeCloseTo(1, 5)
    fireEvent.change(screen.getByLabelText('音量'), { target: { value: '10' } })
    fireEvent.keyDown(stage, { key: 'ArrowDown' })
    expect(view()?.volume).toBeCloseTo(0.05, 5)

    fireEvent.keyDown(stage, { key: 'm' })
    expect(view()?.muted).toBe(true)
    fireEvent.keyDown(stage, { key: 'M' })
    expect(view()?.muted).toBe(false)
    fireEvent.keyDown(stage, { key: 'l' })
    expect(view()?.loop).toBe(true)
    fireEvent.keyDown(stage, { key: 'L' })
    expect(view()?.loop).toBe(false)
  })

  it('leaves a key pressed on a control to that control', async () => {
    const { media } = await mount(fixture('plain-h264.mp4'))
    const { play } = makePlayable(media, 12)
    patch(media, 'paused', true)
    // Space on the focused play button is the button's own activation; the stage
    // handler must not toggle a second time as the event bubbles past it.
    fireEvent.keyDown(screen.getByLabelText('播放'), { key: ' ' })
    expect(play).not.toHaveBeenCalled()
  })

  it('zooms the picture without losing it off the edge of the stage', async () => {
    stageBox.width = 300
    stageBox.height = 200
    const { store, media } = await mount(fixture('plain-h264.mp4'))
    // 300x200 minus the stage padding, fitted to a 64x48 picture. The stage is
    // measured only once it has mounted, so this settles a tick after the
    // element appears rather than on the same paint.
    await waitFor(() => { expect(document.querySelector('[data-video-zoom-level]')?.textContent).toBe('缩放 350%') })
    // The fitted multiple reaches the element. Sizing a fitted picture from the
    // stylesheet instead left it at its own 64x48 while the label claimed 350%,
    // which is the mismatch this asserts against: 64 * 3.5 and 48 * 3.5.
    expect(media.style.width).toBe('224px')
    expect(media.style.height).toBe('168px')

    fireEvent.click(screen.getByLabelText('放大'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(4)
    expect(document.querySelector('[data-video-zoom-level]')?.textContent).toBe('缩放 400%')
    expect(media.style.width).toBe('256px')
    expect(media.style.height).toBe('192px')

    fireEvent.click(screen.getByLabelText('缩小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(3.2)
    fireEvent.click(screen.getByLabelText('实际大小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(1)
    fireEvent.click(screen.getByLabelText('适应窗口'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe('fit')
    expect(screen.getByLabelText('适应窗口').getAttribute('aria-pressed')).toBe('true')
    // Back to the fitted multiple, and back on the element.
    expect(media.style.width).toBe('224px')

    // Zooming out past the floor stops at it rather than shrinking to a pixel.
    fireEvent.click(screen.getByLabelText('实际大小'))
    for (let press = 0; press < 12; press += 1) fireEvent.click(screen.getByLabelText('缩小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(0.1)
  })

  it('re-fits the picture when the stage is resized', async () => {
    stageBox.width = 200
    stageBox.height = 200
    await mount(fixture('plain-h264.mp4'))
    const observer = [...StubResizeObserver.live][0]
    expect(observer).toBeTruthy()
    stageBox.width = 300
    stageBox.height = 300
    fireEvent.click(screen.getByLabelText('实际大小'))
    observer?.resize()
    expect(document.querySelector('[data-video-zoom-level]')?.textContent).toBe('缩放 100%')
    fireEvent.click(screen.getByLabelText('适应窗口'))
    // 300x300 minus padding, fitted to 64x48. The fitted multiple is what the
    // stage measures, so the zoom ceiling does not cap it: 268 / 64 = 4.1875.
    expect(document.querySelector('[data-video-zoom-level]')?.textContent).toBe('缩放 419%')
  })

  it('measures a picture its container never declared, so a zoom can scale it', async () => {
    // An MPEG transport stream keeps its dimensions inside the elementary stream
    // rather than in a table this preview parses, so identification declares
    // none. With no size at all, a zoom had nothing to apply a multiple to: the
    // percentage in the bar moved while the picture stayed at exactly the size
    // the stylesheet gave it. A loaded element is the one place such a file can
    // be measured, so that is where the fallback comes from.
    stageBox.width = 500
    stageBox.height = 400
    const { store, media } = await mount(fixture('plain-h264.m2ts'), 'clip.m2ts')
    // jsdom reports no intrinsic size, so the element is given the one a real
    // decoder would have reported.
    patch(media, 'videoWidth', 64)
    patch(media, 'videoHeight', 48)
    makePlayable(media, 12)
    fireEvent.loadedMetadata(media)
    // 500x400 minus the stage padding, fitted to 64x48 — the same geometry as a
    // container that declared the size itself.
    await waitFor(() => { expect(document.querySelector('[data-video-zoom-level]')?.textContent).toBe('缩放 731%') })
    expect(media.style.width).toBe('468px')
    expect(document.querySelector('[data-video-metadata]')?.textContent).toContain('64 × 48')
    // And a zoom now has a picture to scale, in the direction it names.
    fireEvent.click(screen.getByLabelText('实际大小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(1)
    expect(media.style.width).toBe('64px')
  })

  it('never lets a zoom button move the picture against the direction it names', async () => {
    // A stage this size fits the 64x48 picture at 731%, which is past the 400%
    // zoom ceiling. Clamping a step into that ceiling would have made zoom-in
    // *shrink* the picture, and zoom-out shrink it to the ceiling as well.
    stageBox.width = 500
    stageBox.height = 400
    const { store, media } = await mount(fixture('plain-h264.mp4'))
    await waitFor(() => { expect(document.querySelector('[data-video-zoom-level]')?.textContent).toBe('缩放 731%') })
    expect(media.style.width).toBe('468px')

    // Zoom-in has nowhere to go above the ceiling, so it leaves both the picture
    // and the fitted state alone rather than shrinking the picture to 400%.
    fireEvent.click(screen.getByLabelText('放大'))
    expect(media.style.width).toBe('468px')
    expect(document.querySelector('[data-video-zoom-level]')?.textContent).toBe('缩放 731%')
    expect(screen.getByLabelText('适应窗口').getAttribute('aria-pressed')).toBe('true')

    // Zoom-out has somewhere to go, and it goes down rather than sideways.
    fireEvent.click(screen.getByLabelText('缩小'))
    expect(store.getSnapshot().byTab['tab-1' as never]?.zoom).toBe(4)
    expect(media.style.width).toBe('256px')
  })

  it('asks the browser for fullscreen and for picture in picture, and shows what it granted', async () => {
    const { media } = await mount(fixture('plain-h264.mp4'))
    const requestFullscreen = vi.fn()
    const exitFullscreen = vi.fn()
    const requestPictureInPicture = vi.fn()
    const exitPictureInPicture = vi.fn()
    patch(document, 'exitFullscreen', exitFullscreen)
    patch(document, 'exitPictureInPicture', exitPictureInPicture)
    patch(media, 'requestPictureInPicture', requestPictureInPicture)
    const stage = document.querySelector<HTMLElement>('[data-video-stage]') as HTMLElement
    patch(stage, 'requestFullscreen', requestFullscreen)

    fireEvent.click(screen.getByLabelText('全屏'))
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('全屏').getAttribute('aria-pressed')).toBe('false')
    patch(document, 'fullscreenElement', stage)
    fireEvent(document, new Event('fullscreenchange'))
    expect(screen.getByLabelText('全屏').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByLabelText('全屏'))
    expect(exitFullscreen).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('画中画'))
    expect(requestPictureInPicture).toHaveBeenCalledTimes(1)
    patch(document, 'pictureInPictureElement', media)
    fireEvent(media, new Event('enterpictureinpicture'))
    expect(screen.getByLabelText('画中画').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByLabelText('画中画'))
    expect(exitPictureInPicture).toHaveBeenCalledTimes(1)
    patch(document, 'pictureInPictureElement', null)
    fireEvent(media, new Event('leavepictureinpicture'))
    expect(screen.getByLabelText('画中画').getAttribute('aria-pressed')).toBe('false')
  })

  it('offers the keyboard a way to leave fullscreen too', async () => {
    const { stage } = await mount(fixture('plain-h264.mp4'))
    const requestFullscreen = vi.fn()
    patch(stage, 'requestFullscreen', requestFullscreen)
    fireEvent.keyDown(stage, { key: 'f' })
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(stage, { key: 'F' })
    expect(requestFullscreen).toHaveBeenCalledTimes(2)
  })

  it('leaves a key it does not use to the rest of the page', async () => {
    const { stage } = await mount(fixture('plain-h264.mp4'))
    fireEvent.keyDown(stage, { key: 'Tab' })
    expect(document.querySelector('[data-video-element]')).toBeTruthy()
  })

  it('leaves a key that arrives from inside the stage to the element', async () => {
    const { stage, media } = await mount(fixture('plain-h264.mp4'))
    const { play } = makePlayable(media, 12)
    patch(media, 'paused', true)
    // The stage's listener also sees events bubbling out of its own descendant,
    // which are not the stage's own key press.
    fireEvent.keyDown(media, { key: ' ' })
    expect(play).not.toHaveBeenCalled()
    fireEvent.keyDown(stage, { key: ' ' })
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('leaves the transport alone when there is no element to drive', async () => {
    // A live but elementless stage is a real state rather than a hypothetical
    // one: the bar is painted with the rest of the panel, and the Blob URL a
    // playable file is fed through is created by an effect one paint later.
    // Making the host hand back no URL at all holds the panel in that state, so
    // the state itself can be pinned rather than raced for.
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValue(undefined as unknown as string)
    try {
      const store = defineStore(videoViewStore).create()
      render(<VideoPlayer {...propsFor(fixture('plain-h264.mp4'), store as unknown as StoreInstance)} />)
      const stage = await waitFor(() => {
        const found = document.querySelector<HTMLElement>('[data-video-stage]')
        expect(found).toBeTruthy()
        return found as HTMLElement
      })
      // Identification is done — the file is a readable MP4 — and there is still
      // nothing to show or to drive.
      expect(document.querySelector('[data-video-element]')).toBeNull()
      expect(document.querySelector('[data-video-metadata]')?.textContent).toContain('MP4')
      // Every shortcut that needs the element has to survive its absence: not
      // one of them may throw, and not one may reach the store. (The volume and
      // mute keys are deliberately not pressed here — they are the shortcuts
      // that work without an element, and they write to the store by design.)
      for (const key of [' ', 'k', 'ArrowRight', 'ArrowLeft', 'f']) {
        fireEvent.keyDown(stage, { key })
      }
      expect(document.querySelector('[data-video-element]')).toBeNull()
      expect(store.getSnapshot().byTab['tab-1' as never]).toBeUndefined()
    } finally {
      createObjectURL.mockRestore()
    }
  })

  it('ignores a seek the file cannot support yet', async () => {
    const { store, stage, media } = await mount(fixture('plain-h264.mp4'))
    // An element reports NaN duration until it has metadata, which is also what
    // jsdom reports for the whole of a test it has not given one in.
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(media.currentTime).toBe(0)
    fireEvent.change(screen.getByLabelText('播放进度'), { target: { value: '500' } })
    expect(media.currentTime).toBe(0)
    expect(store.getSnapshot().byTab['tab-1' as never]).toBeUndefined()
  })

  it('keeps the seek bar usable when the file never declares a duration', async () => {
    const { media } = await mount(fixture('plain-h264.mp4'))
    patch(media, 'duration', Number.NaN)
    fireEvent.loadedMetadata(media)
    // A stream reports NaN, sometimes forever. `duration === 0` would let that
    // through and the slider would carry NaN as its value.
    expect(document.querySelector('[data-video-elapsed]')?.textContent).toBe('0:00 / 0:00')
    const seek = screen.getByLabelText<HTMLInputElement>('播放进度')
    expect(seek.disabled).toBe(true)
    expect(seek.value).toBe('0')
    // The container read the real duration off the movie header, so the metadata
    // list still knows it even though the element does not.
    expect(document.querySelector('[data-video-metadata]')?.textContent).toContain('0:01')
  })

  it('reports a file longer than an hour as h:mm:ss', async () => {
    const { media } = await mount(fixture('plain-h264.mp4'))
    makePlayable(media, 3725)
    fireEvent.loadedMetadata(media)
    expect(document.querySelector('[data-video-elapsed]')?.textContent).toBe('0:00 / 1:02:05')
  })

  it('identifies a file whose tab address carries no suffix', async () => {
    await mount(fixture('plain-h264.mp4'), 'clip')
    // The bytes are the only hint left — and they are the one that matters.
    expect(document.querySelector('[data-video-metadata]')?.textContent).toContain('MP4')
  })

  it('measures the stage once where the platform reports no resize observer', async () => {
    const observer = Reflect.get(globalThis, 'ResizeObserver')
    Reflect.deleteProperty(globalThis, 'ResizeObserver')
    try {
      stageBox.width = 300
      stageBox.height = 200
      await mount(fixture('plain-h264.mp4'))
      // 300x200 minus the stage padding, fitted to 64x48, with no observer to
      // re-measure it later.
      await waitFor(() => { expect(document.querySelector('[data-video-zoom-level]')?.textContent).toBe('缩放 350%') })
    } finally {
      Reflect.set(globalThis, 'ResizeObserver', observer)
    }
  })

  it('names only the container when the bytes declare no video codec', async () => {
    // An MPEG program stream keeps its streams in the pack headers rather than
    // in a table, so no codec is read and the title names the container alone.
    render(<VideoPlayer {...propsFor(fixture('plain-mpeg2.mpg'), defineStore(videoViewStore).create(), 'clip.mpg')} />)
    const panel = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-video-explanation]')
      expect(found).toBeTruthy()
      return found as HTMLElement
    })
    // No codec was read, so the title names the container and stops there rather
    // than appending the word for "unknown".
    expect(panel.firstElementChild?.textContent).toBe('MPEG program stream')
    expect(panel.textContent).toContain(zh['reason.mpegPs'])
  })

  it('reads a real AVI stream header, whose sizes are little-endian', async () => {
    // The handler codec of a real AVI used to be unreadable: RIFF is
    // little-endian, and a chunk size read big-endian reaches past the end of the
    // file, so the walk stepped over the stream headers inside it. ffmpeg wrote
    // this fixture, so what is pinned here is the format rather than a
    // hand-built agreement with the parser.
    render(<VideoPlayer {...propsFor(fixture('plain-mpeg4.avi'), defineStore(videoViewStore).create(), 'clip.avi')} />)
    const panel = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-video-explanation]')
      expect(found).toBeTruthy()
      return found as HTMLElement
    })
    expect(panel.firstElementChild?.textContent).toBe('AVI · MPEG-4 Visual')
    expect(panel.textContent).toContain(zh['reason.avi'])
    // The picture size and the length come from the same file read: `strf` is
    // the video stream's bitmap header and `avih` states the frame interval and
    // count. For a container no browser plays, the facts are the whole answer a
    // reader gets, so they are worth pinning on real muxer output.
    const facts = document.querySelector('[data-video-metadata]')?.textContent
    expect(facts).toContain('64 × 48')
    expect(facts).toContain('0:01')
  })
})

describe('the host half', () => {
  it('contributes nothing to the host tree', () => {
    // The whole viewer is in the browser export, so the host entry is empty on
    // purpose. Pinning that keeps it from quietly growing a second surface that
    // no profile registers.
    expect(applyHost).not.toThrow()
  })
})

describe('VideoBoundary', () => {
  afterEach(cleanup)

  /** A child that throws when asked, which is the only thing a fence must catch. */
  function Exploding({ explode }: { readonly explode: boolean }): ReactNode {
    if (explode) throw new Error('identification broke')
    return <p data-boundary-child>intact</p>
  }

  it('shows one panel-local line instead of taking the Sidebar down', () => {
    // React logs a caught render error; the assertion is about what renders, so
    // the console is silenced for the length of the test.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { })
    render(
      <VideoBoundary message={zh['failure.crash']} retry={zh.retry}>
        <Exploding explode />
      </VideoBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain(zh['failure.crash'])
    expect(document.querySelector('[data-boundary-child]')).toBeNull()
    consoleError.mockRestore()
  })

  it('remounts the preview when the reader retries', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { })
    render(
      <VideoBoundary message={zh['failure.crash']} retry={zh.retry}>
        <Exploding explode />
      </VideoBoundary>,
    )
    // The child threw, so the retry has to bring it back with a clean tree.
    const retry = document.querySelector<HTMLElement>('[data-video-crash-retry]') as HTMLElement
    expect(retry.textContent).toBe('重试')
    fireEvent.click(retry)
    expect(screen.getByRole('alert').textContent).toContain(zh['failure.crash'])
    consoleError.mockRestore()
  })
})

describe('VideoPreviewBody', () => {
  afterEach(cleanup)

  it('renders the player behind the fence', async () => {
    render(<VideoPreviewBody {...propsFor(fixture('plain-h264.mp4'), defineStore(videoViewStore).create() as unknown as StoreInstance)} />)
    await waitFor(() => { expect(document.querySelector('[data-video-preview]')).toBeTruthy() })
    expect(document.querySelector('[data-video-crash]')).toBeNull()
  })
})
