// @vitest-environment jsdom
/**
 * The waveform's arithmetic and its two platform edges.
 *
 * The peak maths is pure and pins what the drawing means: a bin is the loudest
 * sample in its range, not an average, and a file shorter than the bin count is
 * not reported as silence. The decoding and painting paths are exercised with a
 * stub, because jsdom implements neither the Web Audio API nor a canvas.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WAVEFORM_BINS, bucketPeaks, decodeAudioPeaks, downsamplePeaks, paintWaveform, reducePeaks } from '../src/client/audio/waveform.ts'

/**
 * Compare peaks, whose storage rounds the decimals they were given.
 * @param actual - the peaks under test.
 * @param expected - the magnitudes to compare against.
 */
function closeTo(actual: Float32Array, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length)
  expected.forEach((value, index) => { expect(actual[index], `bin ${index}`).toBeCloseTo(value, 5) })
}

describe('peak bins', () => {
  it('takes the loudest sample in each bin, not its average', () => {
    // Two bins over one channel: a transient in the first, silence in the second.
    closeTo(downsamplePeaks([Float32Array.from([0, 0.25, -0.9, 0.1, 0, 0, 0, 0])], 2), [0.9, 0])
  })

  it('takes the loudest channel, so a peak in either one is visible', () => {
    closeTo(downsamplePeaks([
      Float32Array.from([0.1, 0.1]),
      Float32Array.from([0.2, 0.8]),
    ], 2), [0.2, 0.8])
  })

  it('clamps a sample outside the unit range', () => {
    // Decoded audio is `-1..1`, but a caller handing over anything else must not
    // be able to draw outside the canvas.
    expect([...downsamplePeaks([Float32Array.from([2, -3])], 1)]).toEqual([1])
  })

  it('draws a short file across every bin rather than as silence', () => {
    const peaks = downsamplePeaks([Float32Array.from([0.5])], 8)
    expect(peaks.length).toBe(8)
    expect([...peaks].every(value => value > 0)).toBe(true)
  })

  it('returns silence for an empty file and no bins for no output', () => {
    expect(downsamplePeaks([], 4).length).toBe(4)
    expect([...downsamplePeaks([], 4)]).toEqual([0, 0, 0, 0])
    expect(downsamplePeaks([Float32Array.from([1])], 0).length).toBe(0)
  })
})

describe('drawing bars', () => {
  it('keeps the loudest bin a bar covers', () => {
    closeTo(bucketPeaks(Float32Array.from([0.1, 0.7, 0.2, 0.3]), 2), [0.7, 0.3])
  })

  it('repeats bins when there are more bars than bins', () => {
    const bucketed = bucketPeaks(Float32Array.from([1, 0]), 4)
    expect([...bucketed]).toEqual([1, 1, 0, 0])
  })

  it('has nothing to draw for an empty drawing', () => {
    expect(bucketPeaks(new Float32Array(0), 8).length).toBe(8)
    expect(bucketPeaks(Float32Array.from([1]), 0).length).toBe(0)
  })
})

describe('reducing without holding the main thread', () => {
  // A second of audio at 44.1 kHz, which is the smallest input where the slicing
  // below has anything to slice.
  const samples = (length: number): Float32Array =>
    Float32Array.from({ length }, (_, index) => ((index * 37) % 101) / 101)

  it('produces exactly the peaks the single uninterrupted pass produces', async () => {
    for (const bins of [1, 2, 7, 153, WAVEFORM_BINS]) {
      const channels = [samples(1_000), samples(1_000)]
      const sliced = await reducePeaks(channels, bins)
      expect(sliced === undefined ? [] : [...sliced], `bins ${bins}`).toEqual([...downsamplePeaks(channels, bins)])
    }
  })

  it('answers with nothing when the tab is already gone', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await reducePeaks([samples(100)], 8, { signal: controller.signal })).toBeUndefined()
  })

  it('cannot finish inside one task when a slice may not block', async () => {
    // A budget of zero makes every bin its own slice, so the pass is guaranteed to
    // be unfinished after a microtask — which is the property being pinned: the
    // work is handed back to the event loop, not run to completion in one go.
    let finished = false
    const running = reducePeaks([samples(1_000)], 8, { budgetMs: 0 }).then(() => { finished = true })
    await Promise.resolve()
    expect(finished).toBe(false)
    await running
    expect(finished).toBe(true)
  })

  it('runs to completion inside one task when the budget allows it', async () => {
    // The same pass with no budget at all is uninterruptible, which is what keeps
    // the common short file exactly as cheap as it was before the slicing existed.
    let finished = false
    const running = reducePeaks([samples(1_000)], 8, { budgetMs: Number.POSITIVE_INFINITY }).then(() => { finished = true })
    await Promise.resolve()
    expect(finished).toBe(true)
    await running
  })
})

/** One painted rectangle: the fill colour it was drawn with, then its geometry. */
type Fill = readonly [string, number, number, number, number]

/** A canvas standing in for one jsdom will not measure or paint. */
function stubCanvas(width: number, height: number): { canvas: HTMLCanvasElement; fills: Fill[] } {
  const fills: Fill[] = []
  const context = {
    canvas: undefined as unknown as HTMLCanvasElement,
    fillStyle: '',
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push([this.fillStyle, x, y, w, h])
    },
  }
  const canvas = document.createElement('canvas')
  context.canvas = canvas
  Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true })
  canvas.getContext = (() => context) as unknown as HTMLCanvasElement['getContext']
  return { canvas, fills }
}

describe('decoding', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('decodes through the platform decoder and reduces it to bins', async () => {
    const close = vi.fn(() => Promise.resolve())
    class FakeOfflineAudioContext {
      decodeAudioData = vi.fn(() => Promise.resolve({
        numberOfChannels: 2,
        getChannelData: (index: number) => (index === 0
          ? Float32Array.from([0, 1, 0, 0])
          : Float32Array.from([0, 0, 0, 0.5])),
      }))

      close = close
    }
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext)
    const bytes = Uint8Array.from([1, 2, 3, 4])
    const peaks = await decodeAudioPeaks(bytes, 2)
    expect(peaks === undefined ? [] : [...peaks]).toEqual([1, 0.5])
    // A decode detaches the buffer it is handed, so the file's own bytes must
    // still be here afterwards.
    expect([...bytes]).toEqual([1, 2, 3, 4])
    expect(close).toHaveBeenCalled()
  })

  it('answers with nothing on a platform that cannot decode', async () => {
    // jsdom has neither constructor, which is exactly the case of a browser with
    // the Web Audio API unavailable.
    expect(await decodeAudioPeaks(Uint8Array.from([1, 2, 3]), 4)).toBeUndefined()
  })

  it('answers with nothing when the decoder refuses the file', async () => {
    class Rejecting {
      decodeAudioData = vi.fn(() => Promise.reject(new Error('unsupported')))
    }
    vi.stubGlobal('OfflineAudioContext', Rejecting)
    expect(await decodeAudioPeaks(Uint8Array.from([1, 2, 3]), 4)).toBeUndefined()
  })

  it('does not decode a file whose tab is already gone', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await decodeAudioPeaks(Uint8Array.from([1, 2, 3]), 4, controller.signal)).toBeUndefined()
    expect(await decodeAudioPeaks(new Uint8Array(0), 4)).toBeUndefined()
  })
})

describe('painting', () => {
  it('draws one bar per slot and colours the played side', () => {
    const { canvas, fills } = stubCanvas(100, 40)
    // 100 px at three pixels per slot is 33 bars.
    paintWaveform(canvas, downsamplePeaks([Float32Array.from({ length: 400 }, (_, index) => (index % 10) / 10)], WAVEFORM_BINS), 0.5)
    const bars = fills.filter(([, , , width]) => width === 2)
    expect(bars.length).toBe(33)
    // The playhead is the last rect: a one-pixel line at half the width.
    const playhead = fills.at(-1)
    expect(playhead?.[3]).toBe(1)
    expect(playhead?.[1]).toBe(50)
  })

  it('draws a flat line while the peaks are still being read', () => {
    const { canvas, fills } = stubCanvas(60, 30)
    paintWaveform(canvas, undefined, undefined)
    // Silence is a one-pixel line per slot rather than nothing at all.
    expect(fills.length).toBeGreaterThan(0)
    expect(fills.every(([, , , width, height]) => width === 2 && height === 1)).toBe(true)
  })

  it('leaves a canvas with no 2D context blank rather than failing', () => {
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { value: 80, configurable: true })
    Object.defineProperty(canvas, 'clientHeight', { value: 40, configurable: true })
    canvas.getContext = () => null
    expect(() => { paintWaveform(canvas, undefined, 0.25) }).not.toThrow()
  })

  it('draws nothing into a box with no size', () => {
    const { canvas, fills } = stubCanvas(0, 0)
    paintWaveform(canvas, downsamplePeaks([Float32Array.from([1])], 8), 0.5)
    expect(fills).toEqual([])
  })
})
