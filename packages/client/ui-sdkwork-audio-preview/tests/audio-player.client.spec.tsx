// @vitest-environment jsdom
/**
 * The audio body: what it shows, what its transport does, and how it fails.
 *
 * jsdom plays nothing and decodes nothing, so the element's own behaviour is
 * simulated where a test needs it — a duration is defined before metadata is
 * fired, and the media error is defined before the element is asked to report
 * one. Everything asserted here is this preview's own behaviour around those
 * browser facts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncExternalStore } from 'react'
import type { BakedActions } from '@deepseek-ai/dsh-client-store'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { AudioPlayer } from '../src/client/AudioPlayer.tsx'
import type { AudioPlayerProps } from '../src/client/AudioPlayer.tsx'
import { DEFAULT_AUDIO_VIEW, audioViewStore } from '../src/client/store.ts'
import type { AudioView, AudioViewActions, AudioViewState } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

/**
 * The fixture directory, resolved through the working directory.
 *
 * The container spec may use `import.meta.url` because it runs in the Node
 * environment; this one runs in jsdom, where that URL is the document's rather
 * than the file's, so the repository root is the only stable anchor.
 */
const SAMPLES = join(process.cwd(), 'packages', 'client', 'ui-sdkwork-audio-preview', 'tests', 'samples')

/** Read one generated fixture, as the document owner would hand it over. */
function fixture(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(join(SAMPLES, name)))
}

/**
 * A transport store that records what the player writes, as the engine would.
 *
 * The action seat a body receives is already baked: the engine fills the draft
 * parameter itself, so a component calls `update(tabId, patch)` and never sees
 * the state it is mutating. The mock therefore models the baked shape — not the
 * raw `defineStore` table, where the same call would land the patch in the
 * draft seat and silently write under the wrong key.
 */
interface StoreMock {
  readonly getSnapshot: () => AudioViewState
  readonly subscribe: (listener: () => void) => () => void
  readonly actions: BakedActions<AudioViewState, AudioViewActions>
  readonly forgetCalls: string[]
}

/** Build the live store instance the slot would create for one Session. */
function storeMock(): StoreMock {
  let byTab: Record<string, AudioView> = {}
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of listeners) listener() }
  const forgetCalls: string[] = []
  return {
    getSnapshot: () => ({ byTab }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    actions: {
      update: (tabId: string, patch: Partial<AudioView>) => {
        byTab = { ...byTab, [tabId]: { ...(byTab[tabId] ?? DEFAULT_AUDIO_VIEW), ...patch } }
        notify()
      },
      forget: (tabId: string) => {
        forgetCalls.push(tabId)
        byTab = Object.fromEntries(Object.entries(byTab).filter(([id]) => id !== tabId))
        notify()
      },
    },
    forgetCalls,
  }
}

/** Build the composed props the slot would hand the body. */
function propsFor(
  data: Uint8Array<ArrayBuffer> | undefined,
  store: StoreMock,
  address = 'plain-mp3.mp3',
  signal?: AbortSignal,
): AudioPlayerProps {
  const controller = new AbortController()
  return {
    content: data === undefined
      ? { kind: 'text', text: 'not bytes', pages: [], eof: true }
      : { kind: 'bytes', data },
    resourceAddress: `dsh-resource://file/session/s1/${address}`,
    wrap: false,
    scrollportRef: vi.fn(),
    useTabInfo: () => ({
      tab: {
        id: 'tab-1',
        contentId: `dsh-resource://file/session/s1/${address}`,
        signal: signal ?? controller.signal,
        navigation: { revision: 0 },
      },
    }),
    useStore: (selector: (state: AudioViewState) => unknown) => useSyncExternalStore(
      store.subscribe,
      () => selector(store.getSnapshot()),
    ),
    actions: store.actions,
    t: makeTranslate(zh),
  } as unknown as AudioPlayerProps
}

/** The media element the transport drives. */
function mediaElement(): HTMLMediaElement {
  return document.querySelector('[data-audio-element]') as HTMLMediaElement
}

/**
 * One tab's transport record.
 *
 * `TabId` is branded, so a test writing a literal id states the widening once
 * here instead of casting at every assertion.
 */
function tabView(state: AudioViewState, id: string): AudioView | undefined {
  return (state.byTab as Record<string, AudioView>)[id]
}

/** Hand the element a duration, as a browser does once metadata arrives. */
function withMetadata(media: HTMLMediaElement, duration: number, currentTime = 0): void {
  Object.defineProperty(media, 'duration', { value: duration, configurable: true })
  Object.defineProperty(media, 'currentTime', { value: currentTime, writable: true, configurable: true })
  fireEvent.loadedMetadata(media)
}

/**
 * Replace the element's own transport with spies.
 *
 * jsdom implements neither method, and patching the element the preview drives
 * keeps every assertion bound to it rather than to a prototype reference that
 * would be stepped over by an element of its own.
 */
function patchTransport(media: HTMLMediaElement): { readonly play: ReturnType<typeof vi.fn>; readonly pause: ReturnType<typeof vi.fn> } {
  const play = vi.fn(() => Promise.resolve())
  const pause = vi.fn()
  media.play = play
  media.pause = pause
  return { play, pause }
}

describe('AudioPlayer', () => {
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:audio'), revokeObjectURL: vi.fn() })
    // jsdom has no media implementation at all: the prototype is silenced so an
    // element a case does not inspect still answers instead of throwing, and a
    // case that does inspect one patches that element with its own spies.
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    // jsdom has no canvas: returning null is what it would do anyway, only
    // without the "not implemented" line it prints on every draw.
    vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the tags the file carries, its facts, and a waveform', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)

    expect(screen.getByText('Test Tone')).toBeTruthy()
    expect(screen.getByText('Preview Spec · Fixtures · 2024')).toBeTruthy()
    // With no cover art the container names itself in the stage, and the facts
    // list below repeats it — so the stage is queried rather than the text.
    expect(document.querySelector('[data-audio-cover-fallback]')?.textContent).toBe('MP3')
    // The facts list repeats the container plus everything cheaply read.
    expect(screen.getByText('编码').nextSibling?.textContent).toBe('MP3')
    expect(document.querySelector('[data-audio-waveform]')).toBeTruthy()
    expect(document.querySelector('[data-audio-cover-fallback]')).toBeTruthy()
    expect(mediaElement().getAttribute('src')).toBe('blob:audio')
  })

  it('shows the cover art a producer attached', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-cover.mp3'), store, 'plain-cover.mp3')} />)
    const cover = document.querySelector('[data-audio-cover]')
    expect(cover?.getAttribute('src')).toBe('blob:audio')
    expect(document.querySelector('[data-audio-cover-fallback]')).toBeNull()
  })

  it('explains a container no browser decodes, and offers nothing to press', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-wma.wma'), store, 'plain-wma.wma')} />)
    const explanation = document.querySelector('[data-audio-explanation]')
    expect(explanation?.textContent).toContain('ASF')
    expect(explanation?.textContent).toContain('转换为 MP3、AAC 或 Opus')
    // No element is mounted for a file the platform is not asked to play, and
    // the stage holds the explanation alone: a picture, a title and a waveform
    // of a file nothing can play would be decoration around a refusal.
    expect(document.querySelector('[data-audio-element]')).toBeNull()
    expect(document.querySelector('[data-audio-cover-fallback]')).toBeNull()
    expect(document.querySelector('[data-audio-title]')).toBeNull()
    expect(document.querySelector('[data-audio-waveform]')).toBeNull()
    // The transport stays mounted but offers nothing to press.
    expect(screen.getByLabelText<HTMLButtonElement>('播放').disabled).toBe(true)
  })

  it('names a file that carries no tags by its own name', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-untagged.mp3'), store, 'plain-untagged.mp3')} />)
    // Nothing to fall back from, so the file's own name is what a reader sees —
    // the same name the tab chip carries, not a placeholder.
    expect(document.querySelector('[data-audio-title]')?.textContent).toBe('plain-untagged.mp3')
    expect(document.querySelector('[data-audio-byline]')?.textContent).toBe('')
    // No tags, but the stream's own frame header still says what it is: the
    // summary carries the codec and the geometry, not a repeat of the badge.
    expect(document.querySelector('[data-audio-summary]')?.textContent).toBe('MP3 · 44.1 kHz · 单声道')
  })

  it('gives the stage the keyboard transport the video preview has', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)
    const media = mediaElement()
    const transport = patchTransport(media)
    withMetadata(media, 60, 5)
    const stage = document.querySelector('[data-audio-stage]') as HTMLElement
    // A labelled group, so the keys below are announced with what they act on.
    expect(stage.getAttribute('role')).toBe('group')
    expect(stage.getAttribute('aria-label')).toBe('MP3 播放器')

    fireEvent.keyDown(stage, { key: ' ' })
    expect(transport.play).toHaveBeenCalled()
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(media.currentTime).toBe(15)
    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    expect(media.currentTime).toBe(5)
    fireEvent.keyDown(stage, { key: 'm' })
    expect(tabView(store.getSnapshot(), 'tab-1')?.muted).toBe(true)
    fireEvent.keyDown(stage, { key: 'l' })
    expect(tabView(store.getSnapshot(), 'tab-1')?.loop).toBe(true)
    fireEvent.keyDown(stage, { key: 'ArrowDown' })
    expect(tabView(store.getSnapshot(), 'tab-1')?.volume).toBeCloseTo(0.9)
    fireEvent.keyDown(stage, { key: 'ArrowUp' })
    expect(tabView(store.getSnapshot(), 'tab-1')?.volume).toBeCloseTo(1)
  })

  it('keeps the stage keys out of a control that already owns them', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)
    const media = mediaElement()
    withMetadata(media, 60, 5)
    // A key that reaches the seek slider belongs to the slider, which steps by
    // its own amount; the stage must not apply it a second time.
    fireEvent.keyDown(screen.getByLabelText('播放进度'), { key: 'ArrowRight' })
    expect(media.currentTime).toBe(5)
  })

  it('reports a file that is not audio at all', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(undefined, store)} />)
    expect(screen.getByText('这个文件不是可读取的音频。')).toBeTruthy()
  })

  it('plays and pauses the element the transport drives', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)
    const media = mediaElement()
    const transport = patchTransport(media)
    withMetadata(media, 60)
    fireEvent.click(screen.getByLabelText('播放'))
    expect(transport.play).toHaveBeenCalled()
    fireEvent.play(media)
    expect(screen.getByLabelText('暂停')).toBeTruthy()
    // A playing element reports itself as such, which is what the button reads.
    Object.defineProperty(media, 'paused', { value: false, configurable: true })
    fireEvent.click(screen.getByLabelText('暂停'))
    expect(transport.pause).toHaveBeenCalled()
  })

  it('seeks where the waveform is clicked', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)
    const media = mediaElement()
    withMetadata(media, 60)
    fireEvent.change(screen.getByLabelText('播放进度'), { target: { value: '30' } })
    expect(media.currentTime).toBe(30)
    expect(tabView(store.getSnapshot(), 'tab-1')?.position).toBe(30)
  })

  it('jumps ten seconds at a time, clamped to the file', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)
    const media = mediaElement()
    withMetadata(media, 60, 5)
    fireEvent.click(screen.getByLabelText('前进 10 秒'))
    expect(media.currentTime).toBe(15)
    fireEvent.click(screen.getByLabelText('后退 10 秒'))
    expect(media.currentTime).toBe(5)
    // Backwards past the start stops at the start rather than seeking negative.
    fireEvent.change(screen.getByLabelText('播放进度'), { target: { value: '2' } })
    fireEvent.click(screen.getByLabelText('后退 10 秒'))
    expect(media.currentTime).toBe(0)
  })

  it('keeps the transport settings in the tab store', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)
    fireEvent.click(screen.getByLabelText('播放速度'))
    expect(tabView(store.getSnapshot(), 'tab-1')?.rate).toBe(1.25)
    expect(screen.getByText('1.25×')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('静音'))
    expect(tabView(store.getSnapshot(), 'tab-1')?.muted).toBe(true)
    expect(screen.getByLabelText('取消静音')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('循环播放'))
    expect(tabView(store.getSnapshot(), 'tab-1')?.loop).toBe(true)
    expect(screen.getByLabelText('循环播放').getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(screen.getByLabelText('音量'), { target: { value: '40' } })
    expect(tabView(store.getSnapshot(), 'tab-1')?.volume).toBeCloseTo(0.4)
  })

  it('replaces a refused element with what the bytes said', () => {
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)
    const media = mediaElement()
    withMetadata(media, 60)
    // Code 3 is a decode failure, which is a different line from a network one.
    Object.defineProperty(media, 'error', { value: { code: 3 }, configurable: true })
    fireEvent.error(media)
    const explanation = document.querySelector('[data-audio-explanation]')
    expect(explanation?.textContent).toContain('MP3')
    expect(explanation?.textContent).toContain('无法解码')
    expect(explanation?.textContent).toContain('文件无法解码，可能已损坏')
    expect(screen.getByLabelText<HTMLButtonElement>('播放').disabled).toBe(true)
  })

  it('drops the transport state of a tab whose record has gone', () => {
    const store = storeMock()
    const controller = new AbortController()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store, 'plain-mp3.mp3', controller.signal)} />)
    fireEvent.click(screen.getByLabelText('循环播放'))
    expect(tabView(store.getSnapshot(), 'tab-1')?.loop).toBe(true)
    controller.abort()
    expect(store.forgetCalls).toEqual(['tab-1'])
    expect(tabView(store.getSnapshot(), 'tab-1')).toBeUndefined()
  })

  it('offers the file to the system media controls', () => {
    // jsdom has neither seat: the platform's controls and the metadata they
    // carry are supplied here so the preview's own hand-off can be observed.
    class StubMetadata {
      readonly title: string
      readonly artist: string
      constructor(init: MediaMetadataInit = {}) {
        this.title = init.title ?? ''
        this.artist = init.artist ?? ''
      }
    }
    vi.stubGlobal('MediaMetadata', StubMetadata)
    const setActionHandler = vi.fn()
    const metadata: StubMetadata[] = []
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: {
        setActionHandler,
        set metadata(value: StubMetadata | null) { if (value !== null) metadata.push(value) },
        get metadata() { return null },
      },
    })
    const store = storeMock()
    render(<AudioPlayer {...propsFor(fixture('plain-mp3.mp3'), store)} />)
    expect(metadata.at(-1)?.title).toBe('Test Tone')
    expect(metadata.at(-1)?.artist).toBe('Preview Spec')
    // The media keys drive the same transport the bar does.
    expect(setActionHandler).toHaveBeenCalledWith('seekforward', expect.any(Function))
    const forward = setActionHandler.mock.calls.find(([action]) => action === 'seekforward')?.[1] as () => void
    const media = mediaElement()
    withMetadata(media, 60, 10)
    forward()
    expect(media.currentTime).toBe(20)
    cleanup()
    expect(setActionHandler).toHaveBeenCalledWith('seekforward', null)
    Reflect.deleteProperty(navigator, 'mediaSession')
  })
})

describe('audio view store', () => {
  it('defaults a tab and forgets only the tab it is given', () => {
    const instance = { state: audioViewStore.init(), ...audioViewStore.actions }
    expect(instance.state.byTab).toEqual({})
    instance.update(instance.state, 'a' as never, { rate: 1.5 })
    instance.update(instance.state, 'b' as never, { loop: true })
    expect(instance.state.byTab['a' as never]?.rate).toBe(1.5)
    expect(instance.state.byTab['b' as never]?.loop).toBe(true)
    instance.forget(instance.state, 'a' as never)
    expect(instance.state.byTab['a' as never]).toBeUndefined()
    expect(instance.state.byTab['b' as never]?.loop).toBe(true)
  })
})
