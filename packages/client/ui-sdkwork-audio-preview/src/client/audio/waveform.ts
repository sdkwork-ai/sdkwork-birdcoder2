/**
 * The waveform: the overview a reader actually navigates by.
 *
 * A slider is a duration with no shape. Sound has no picture, so the shape of the
 * sound is the only picture an audio file can offer, and it is what makes a seek
 * "jump to the chorus" rather than "jump to 1:42". The bytes are decoded once
 * through the Web Audio API and reduced to a fixed number of peak bins, which are
 * then bucketed to whatever the canvas is currently wide enough to draw.
 *
 * Every step degrades rather than fails. A platform with no decoder, a file the
 * decoder refuses, or a canvas that cannot be measured leaves the transport
 * working on duration alone — the waveform is an addition to the player, never a
 * precondition for it. And the one step whose cost grows with the file, reducing
 * every decoded sample to peaks, is sliced by a time budget so that opening an
 * hour of audio never blocks the panel it is drawn in.
 */

/** Peak bins a decode produces, independent of how wide the canvas is drawn. */
export const WAVEFORM_BINS = 1024

/** Narrowest bar the drawing gives a bin, in CSS pixels. */
const BAR_WIDTH = 2

/** Gap between drawn bars, in CSS pixels. */
const BAR_GAP = 1

/** Height of a silent bin, in CSS pixels, so a quiet passage is still visible. */
const SILENCE_HEIGHT = 1

/**
 * How long one slice of the reduction may run before it hands the event loop back.
 *
 * Below a frame: a slice shorter than the display's own interval leaves room for the
 * panel to repaint and for the transport to keep answering, which is all the slicing
 * is for.
 */
const REDUCE_BUDGET_MS = 8

/**
 * Hand the event loop back without waiting for a frame.
 *
 * A message to a channel of our own is a task, so the browser gets its chance to
 * paint between slices, and it costs a fraction of a millisecond rather than the
 * several a clamped timeout would, or the whole frame an animation callback would.
 * @returns a promise that settles once the loop has run again.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      channel.port2.close()
      resolve()
    }
    channel.port2.postMessage(undefined)
  })
}

/**
 * The peak magnitude of one bin.
 *
 * A peak, not an average: an average hides the transient that tells a reader where
 * the beat is, which is the one thing this drawing is for.
 * @param channels - decoded samples, one array per channel.
 * @param frames - samples per channel.
 * @param bins - how many bins the file is being reduced to.
 * @param bin - which bin to read.
 * @returns the peak magnitude in `0..1`.
 */
function peakForBin(channels: readonly Float32Array[], frames: number, bins: number, bin: number): number {
  const from = Math.floor((bin * frames) / bins)
  // An offset that lands on the same frame as the previous one still draws one
  // sample, so a file shorter than the bin count is not reported as silence.
  const to = Math.max(from + 1, Math.floor(((bin + 1) * frames) / bins))
  let peak = 0
  for (const channel of channels) {
    const end = Math.min(to, channel.length)
    for (let at = from; at < end; at += 1) {
      const value = Math.abs(channel[at] ?? 0)
      if (value > peak) peak = value
    }
  }
  return peak > 1 ? 1 : peak
}

/**
 * Reduce decoded channels to a fixed number of peak bins.
 *
 * The uninterrupted form, for a caller that has its own budget for the main thread.
 * {@link reducePeaks} is the same reduction with that budget applied, and both
 * compute every bin with the same function, so neither can disagree with the other.
 * @param channels - decoded samples, one array per channel.
 * @param bins - number of bins to produce.
 * @returns the peak magnitude of each bin, in `0..1`.
 */
export function downsamplePeaks(channels: readonly Float32Array[], bins: number): Float32Array {
  const peaks = new Float32Array(Math.max(0, Math.floor(bins)))
  const frames = channels[0]?.length ?? 0
  if (peaks.length === 0 || frames === 0) return peaks
  for (let bin = 0; bin < peaks.length; bin += 1) peaks[bin] = peakForBin(channels, frames, peaks.length, bin)
  return peaks
}

/** How the sliced reduction is driven. */
export interface ReduceOptions {
  /** The tab record's lifetime; an aborted pass returns nothing. */
  readonly signal?: AbortSignal
  /**
   * How long one slice may run, in milliseconds.
   *
   * The default is what the player runs with. A budget of zero makes every bin a
   * slice of its own, which is how the spec pins the slicing itself rather than
   * leaving it to how fast the machine under it happens to be.
   */
  readonly budgetMs?: number
}

/**
 * Reduce decoded channels to peak bins without holding the main thread.
 *
 * The reduction visits every decoded sample — 158 million of them for an hour of
 * audio — and one uninterrupted pass over that is a third of a second during which
 * the panel cannot repaint or answer a key. It is therefore sliced by a time budget:
 * a short file is still a single uninterrupted pass and behaves exactly as it did,
 * and a long one yields between slices.
 * @param channels - decoded samples, one array per channel.
 * @param bins - number of bins to produce.
 * @param options - the tab's lifetime and the slice budget.
 * @returns the peak magnitude of each bin, or undefined when the pass was called off.
 */
export async function reducePeaks(
  channels: readonly Float32Array[],
  bins: number,
  options: ReduceOptions = {},
): Promise<Float32Array | undefined> {
  const { signal, budgetMs = REDUCE_BUDGET_MS } = options
  // A tab that is already gone is not worth the allocation, and the mid-pass check
  // below only runs where the pass yields, which a short file never reaches.
  if (isAborted(signal)) return undefined
  const peaks = new Float32Array(Math.max(0, Math.floor(bins)))
  const frames = channels[0]?.length ?? 0
  if (peaks.length === 0 || frames === 0) return peaks
  let sliceStarted = performance.now()
  for (let bin = 0; bin < peaks.length; bin += 1) {
    peaks[bin] = peakForBin(channels, frames, peaks.length, bin)
    if (performance.now() - sliceStarted < budgetMs) continue
    if (isAborted(signal)) return undefined
    await yieldToEventLoop()
    sliceStarted = performance.now()
  }
  return peaks
}

/**
 * Reduce peak bins to the bars that fit a drawing.
 * @param peaks - the decoded peak bins.
 * @param bars - number of bars to draw.
 * @returns one magnitude per bar, taking the loudest bin it covers.
 */
export function bucketPeaks(peaks: Float32Array, bars: number): Float32Array {
  const total = Math.max(0, Math.floor(bars))
  const bucketed = new Float32Array(total)
  if (total === 0 || peaks.length === 0) return bucketed
  for (let bar = 0; bar < total; bar += 1) {
    const from = Math.floor((bar * peaks.length) / total)
    const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / total))
    let peak = 0
    for (let at = from; at < Math.min(to, peaks.length); at += 1) {
      const value = peaks[at] ?? 0
      if (value > peak) peak = value
    }
    bucketed[bar] = peak
  }
  return bucketed
}

/** A context that can decode compressed audio and be closed again. */
interface DecodingContext {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>
  /** Only a live context can be closed; an offline one needs no release. */
  close?(): Promise<void>
}

/** Whether a decode has already been called off. */
function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true
}

/**
 * Open a context to decode with.
 *
 * An offline context is preferred: it needs no output device and is never
 * suspended waiting for a gesture, which is what lets the waveform appear
 * without the reader having touched anything.
 * @returns the context, or undefined on a platform with neither constructor.
 */
function decodingContext(): DecodingContext | undefined {
  if (typeof OfflineAudioContext === 'function') return new OfflineAudioContext(1, 1, 44100)
  if (typeof AudioContext === 'function') return new AudioContext()
  return undefined
}

/**
 * Decode a file's bytes into peak bins.
 *
 * The bytes are copied before they are handed over, because decoding detaches
 * the buffer it is given and these same bytes are still the document's content.
 * @param bytes - the complete file.
 * @param bins - number of peak bins to produce.
 * @param signal - the tab record's lifetime; an aborted decode returns nothing.
 * @returns the peaks, or undefined when the platform will not decode this file.
 */
export async function decodeAudioPeaks(
  bytes: Uint8Array,
  bins: number = WAVEFORM_BINS,
  signal?: AbortSignal,
): Promise<Float32Array | undefined> {
  if (bytes.byteLength === 0 || isAborted(signal)) return undefined
  const context = decodingContext()
  if (context === undefined) return undefined
  try {
    const buffer = await context.decodeAudioData(bytes.slice().buffer)
    if (isAborted(signal)) return undefined
    const channels: Float32Array[] = []
    for (let index = 0; index < buffer.numberOfChannels; index += 1) channels.push(buffer.getChannelData(index))
    return await reducePeaks(channels, bins, { signal })
  } catch {
    // A file the decoder refuses still plays through the element, or is reported
    // by the element; either way the waveform is simply absent.
    return undefined
  } finally {
    const closed = context.close?.()
    if (closed !== undefined) void closed.catch(() => {})
  }
}

/** How many bars fit a drawing of a given width. */
function barsFor(width: number): number {
  return Math.max(0, Math.floor(width / (BAR_WIDTH + BAR_GAP)))
}

/** Read a themed colour, falling back to a literal for an unstyled canvas. */
function themedColor(context: CanvasRenderingContext2D, property: string, fallback: string): string {
  const value = getComputedStyle(context.canvas).getPropertyValue(property).trim()
  return value === '' ? fallback : value
}

/**
 * Draw peaks and a playhead into a canvas.
 *
 * The drawing states where the playhead is by colour rather than by a separate
 * cursor, so the position survives a resize and needs no second element. A canvas
 * the platform gives no 2D context to — jsdom, or a browser with canvas disabled —
 * is left blank instead of being reported as a failure.
 * @param canvas - the element to draw into; its own box decides the resolution.
 * @param peaks - the decoded bins, or undefined while they are still being read.
 * @param progress - how far playback has reached, in `0..1`, or undefined for no playhead.
 */
export function paintWaveform(canvas: HTMLCanvasElement, peaks: Float32Array | undefined, progress: number | undefined): void {
  const context = canvas.getContext('2d')
  if (context === null) return
  const ratio = Math.max(1, window.devicePixelRatio || 1)
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width <= 0 || height <= 0) return
  // Assigning a canvas dimension resets the drawing surface, so the size is only
  // written when it really changed: the playhead is redrawn on every time update.
  const pixelWidth = Math.round(width * ratio)
  const pixelHeight = Math.round(height * ratio)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  const played = themedColor(context, '--dsw-alias-brand-primary', '#4d6bfe')
  const pending = themedColor(context, '--dsw-alias-label-tertiary', '#8b9bb4')
  const bars = barsFor(width)
  if (bars === 0) return
  const bucketed = peaks === undefined ? undefined : bucketPeaks(peaks, bars)
  const middle = height / 2
  // The playhead is a fraction of the drawing, so it needs no bin of its own.
  const boundary = progress === undefined ? -1 : progress * width
  for (let bar = 0; bar < bars; bar += 1) {
    const magnitude = bucketed === undefined ? 0 : bucketed[bar] ?? 0
    const barHeight = magnitude === 0
      ? SILENCE_HEIGHT
      : Math.max(SILENCE_HEIGHT, magnitude * (height - 2))
    const x = bar * (BAR_WIDTH + BAR_GAP)
    context.fillStyle = bucketed !== undefined && x + BAR_WIDTH <= boundary ? played : pending
    context.fillRect(x, middle - barHeight / 2, BAR_WIDTH, barHeight)
  }
  if (progress !== undefined) {
    context.fillStyle = played
    context.fillRect(Math.min(width - 1, Math.max(0, boundary)), 0, 1, height)
  }
}
