/**
 * Turning image bytes into something an `<img>` can show.
 *
 * Whatever the format, the preview ends up with one Blob URL and the pixel
 * dimensions the browser will draw. A natively decodable format is wrapped
 * directly, which preserves animation for GIF, APNG, and animated WebP; a
 * gzip-wrapped SVG is inflated once and wrapped; a TIFF is decoded to pixels
 * and re-encoded once; a TIFF that carries a JPEG preview hands the browser
 * those bytes directly. One render path follows, and one URL has to be revoked.
 *
 * Dimensions are measured through `createImageBitmap(..., { imageOrientation:
 * 'from-image' })` wherever the platform offers it, because that is the only
 * measurement that agrees with what the browser draws: `naturalWidth` of a
 * phone photo reports the stored pixels, not the upright ones, and a stage box
 * built from the wrong pair puts the picture outside its own frame.
 *
 * Every inflate and every decode is bounded, because the byte counts come from
 * the file: an unbounded path here would let a small crafted file ask for
 * gigabytes.
 */
import { sniffImageFormat } from './formats.ts'
import type { ImageFormat } from './formats.ts'
import { decodeTiff, TiffDecodeError } from './tiff.ts'

/** Why an image could not be turned into a preview. */
export type ImageLoadFailure = 'unsupported' | 'not-image' | 'decode' | 'too-large'

/** A load failure the preview renders as a specific explanation. */
export class ImageLoadError extends Error {
  /**
   * @param failure - why the file could not be turned into a preview.
   * @param message - developer-facing detail, never shown to a reader.
   * @param format - the format the bytes turned out to be, when the bytes identified one.
   * @param size - the dimensions the file claimed, when the refusal was a budget.
   */
  constructor(
    readonly failure: ImageLoadFailure,
    message: string,
    readonly format?: ImageFormat,
    readonly size?: { readonly width: number; readonly height: number },
  ) {
    super(message)
    this.name = 'ImageLoadError'
  }
}

/** A previewable image and the resource release it requires. */
export interface LoadedImage {
  /** Blob URL the `<img>` shows. */
  readonly url: string
  readonly format: ImageFormat
  /** Pixel width as drawn, after any orientation the file states. */
  readonly width: number
  /** Pixel height as drawn, after any orientation the file states. */
  readonly height: number
  /** Resolution in dots per inch, when the file states one. */
  readonly dpi?: { readonly x: number; readonly y: number }
  /** The file's size in bytes. */
  readonly byteLength: number
}

/** Ceiling on the bytes a compressed payload may inflate to. */
const MAX_INFLATED_BYTES = 64 * 1024 * 1024

/**
 * Measure the image a blob draws.
 *
 * `createImageBitmap` is asked for the from-image orientation so the result
 * matches the `<img>` the reader sees; a browser that cannot decode this blob
 * to a bitmap — or reports no size for it, as an SVG without intrinsic
 * dimensions can — falls back to an element measurement, which is the other
 * answer to the same question.
 * @param blob - the image bytes.
 * @param url - a Blob URL for the same bytes, used by the fallback.
 * @returns the drawn pixel dimensions.
 */
async function measure(blob: Blob, url: string): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      if (size.width > 0 && size.height > 0) return size
    } catch {
      // Not every browser decodes every blob to a bitmap — an SVG with no
      // intrinsic size is the usual case — and the element still can.
    }
  }
  const element = new Image()
  element.src = url
  await element.decode()
  return { width: element.naturalWidth, height: element.naturalHeight }
}

/**
 * Re-encode decoded pixels as a PNG the browser can show.
 * @param rgba - the pixel buffer, four bytes per pixel.
 * @param width - pixel width.
 * @param height - pixel height.
 * @returns a Blob URL for the encoded image.
 */
async function encodePixels(rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Promise<string> {
  const pixels = new ImageData(rgba, width, height)
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (context === null) throw new ImageLoadError('decode', 'this browser exposes no 2D canvas context')
    context.putImageData(pixels, 0, 0)
    return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }))
  }
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const context = canvas.getContext('2d')
  if (context === null) throw new ImageLoadError('decode', 'this browser exposes no 2D canvas context')
  context.putImageData(pixels, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/png') })
  if (blob === null) throw new ImageLoadError('decode', 'the browser refused to encode decoded pixels')
  return URL.createObjectURL(blob)
}

/**
 * Inflate a gzip payload under a byte budget.
 * @param bytes - the compressed file.
 * @param signal - load lifetime.
 * @returns the inflated bytes.
 * @throws {ImageLoadError} when the platform cannot inflate, or the budget is passed.
 */
async function inflateGzip(bytes: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ImageLoadError('decode', 'this browser cannot inflate gzip')
  }
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip'))
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    signal.throwIfAborted()
    total += value.byteLength
    if (total > MAX_INFLATED_BYTES) {
      await reader.cancel()
      throw new ImageLoadError('decode', 'the gzip payload inflates past the byte budget')
    }
    chunks.push(value)
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

/**
 * Wrap bytes the browser decodes itself and measure what it draws.
 * @param bytes - the payload to wrap.
 * @param format - the identified format, whose media type labels the blob.
 * @param byteLength - the original file's size, which is what the caption states.
 * @param signal - load lifetime.
 * @returns the previewable image.
 * @throws {ImageLoadError} when the browser cannot decode what it was handed.
 */
async function deliverNative(
  bytes: Uint8Array,
  format: ImageFormat,
  byteLength: number,
  signal: AbortSignal,
): Promise<LoadedImage> {
  const blob = new Blob([bytes.slice()], { type: format.mime })
  const url = URL.createObjectURL(blob)
  try {
    const size = await measure(blob, url)
    signal.throwIfAborted()
    return { url, format, ...size, byteLength }
  } catch (error) {
    URL.revokeObjectURL(url)
    if (error instanceof ImageLoadError) throw error
    throw new ImageLoadError('decode', error instanceof Error ? error.message : String(error), format)
  }
}

/**
 * Prepare a file for display.
 * @param bytes - the complete file.
 * @param extension - the suffix the file arrived under, used only as a hint.
 * @param signal - load lifetime.
 * @returns the previewable image, or a failure carrying the format that was found.
 * @throws {ImageLoadError} when the file cannot be turned into a preview.
 */
export async function loadImage(
  bytes: Uint8Array,
  extension: string,
  signal: AbortSignal,
): Promise<LoadedImage> {
  signal.throwIfAborted()
  const format = sniffImageFormat(bytes, extension)
  if (format === undefined) throw new ImageLoadError('not-image', 'no image format matches these bytes')
  if (format.delivery === 'unsupported') {
    throw new ImageLoadError('unsupported', `no decoder for ${format.name}`, format)
  }
  if (format.delivery === 'native') {
    return await deliverNative(bytes, format, bytes.byteLength, signal)
  }
  if (format.delivery === 'gzip') {
    // SVGZ: removing the gzip layer is the whole point of the suffix, so the
    // payload is re-identified — with no suffix to fall back on, so that a
    // payload which is not an image is not taken for one. A gzip stream that
    // holds something else is reported as undecodable rather than shown as a
    // broken picture.
    const inflated = await inflateGzip(bytes, signal)
    const inner = sniffImageFormat(inflated, '')
    if (inner === undefined || inner.name !== 'SVG') {
      throw new ImageLoadError('decode', 'the gzip payload is not an SVG', format)
    }
    const delivered = await deliverNative(inflated, { ...inner, mime: format.mime }, bytes.byteLength, signal)
    // The reader opened the compressed file, so that is the format reported.
    return { ...delivered, format }
  }
  let decoded
  try {
    decoded = await decodeTiff(bytes)
  } catch (error) {
    if (error instanceof TiffDecodeError) {
      throw error.failure === 'too-large'
        ? new ImageLoadError('too-large', error.message, format, error.size)
        : new ImageLoadError('decode', error.message, format)
    }
    throw new ImageLoadError('decode', String(error), format)
  }
  signal.throwIfAborted()
  if (decoded.kind === 'jpeg') {
    // The embedded JPEG's own orientation is the browser's to apply, so its
    // measurement is authoritative; the directory's dimensions are the
    // fallback for a browser that declines to measure the blob.
    const preview = await deliverNative(decoded.bytes, { ...format, mime: 'image/jpeg' }, bytes.byteLength, signal)
    return {
      ...preview,
      width: preview.width || decoded.metadata.width,
      height: preview.height || decoded.metadata.height,
      ...(decoded.metadata.dpi === undefined ? {} : { dpi: decoded.metadata.dpi }),
    }
  }
  const url = await encodePixels(decoded.rgba, decoded.metadata.width, decoded.metadata.height)
  return {
    url,
    format,
    width: decoded.metadata.width,
    height: decoded.metadata.height,
    ...(decoded.metadata.dpi === undefined ? {} : { dpi: decoded.metadata.dpi }),
    byteLength: bytes.byteLength,
  }
}

/** Byte units, smallest first, so a size reads in the unit a file manager would pick. */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Format a byte count the way a file manager would.
 * @param byteLength - the size in bytes.
 * @returns the human-readable size.
 */
export function formatByteSize(byteLength: number): string {
  let unit = 0
  let value = byteLength
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  // 1048575 bytes is 1023.999… KiB, which must read as 1.0 MB rather than as
  // the rounded-up 1024.0 KB of the unit it is about to leave.
  if (Number(value.toFixed(1)) >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const suffix = BYTE_UNITS[unit] ?? 'B'
  return unit === 0 ? `${Math.round(value)} ${suffix}` : `${value.toFixed(1)} ${suffix}`
}
