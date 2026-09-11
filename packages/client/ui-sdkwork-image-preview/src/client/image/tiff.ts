/**
 * Baseline TIFF decoding.
 *
 * TIFF is the format scanners, faxes, and print workflows produce, and browsers
 * do not decode it. It is a small, well-specified container: an image file
 * directory of tags, then strips or tiles of samples compressed one of four
 * ways. This module reads that structure and returns pixels, so a scanned page
 * previews without a server.
 *
 * Two shapes come back. Most real TIFFs — including the RAW formats built on
 * TIFF, which embed a full-size JPEG preview — are handed back as JPEG bytes for
 * the browser's own decoder, which is both faster and better than re-implementing
 * JPEG. Genuinely uncompressed or LZW/PackBits/Deflate images are decoded here.
 */

/** Why a TIFF could not be decoded. */
export type TiffFailure =
  | 'truncated'
  | 'not-tiff'
  | 'unsupported-compression'
  | 'unsupported-layout'
  | 'unsupported-photometric'
  | 'missing-required-tag'
  | 'too-large'

/**
 * Bounds on what one file may make this decoder allocate.
 *
 * Every dimension and byte count here comes from the file, so without a budget
 * a few dozen crafted bytes — a directory claiming 40 000 × 40 000 pixels, or a
 * deflate stream that inflates without end — would ask the tab for gigabytes.
 * 64 megapixels fits any scanner or camera frame this preview is for and still
 * bounds the RGBA buffer at 256 MB.
 */
const MAX_PIXELS = 64_000_000
/** Largest single decompressed strip or tile, in bytes. */
const MAX_STRIP_BYTES = 256 * 1024 * 1024
/** Pixel count past which decoding yields to the event loop between strips. */
const COOPERATIVE_PIXELS = 8_000_000

/** A TIFF that could not be decoded into either shape. */
export class TiffDecodeError extends Error {
  /**
   * @param failure - why the file could not be decoded.
   * @param message - developer-facing detail, never shown to a reader.
   * @param size - the dimensions the file claimed, when the refusal was a budget.
   */
  constructor(
    readonly failure: TiffFailure,
    message: string,
    readonly size?: { readonly width: number; readonly height: number },
  ) {
    super(message)
    this.name = 'TiffDecodeError'
  }
}

/** Pixel dimensions and density read from a TIFF. */
export interface TiffMetadata {
  readonly width: number
  readonly height: number
  /** Resolution in dots per inch, when the file states one. */
  readonly dpi?: { readonly x: number; readonly y: number }
}

/** A decoded TIFF: either pixels, or bytes the browser decodes itself. */
export type TiffImage =
  | { readonly kind: 'pixels'; readonly metadata: TiffMetadata; readonly rgba: Uint8ClampedArray<ArrayBuffer> }
  | { readonly kind: 'jpeg'; readonly metadata: TiffMetadata; readonly bytes: Uint8Array }

/** TIFF field types, as the tag directory declares them. */
const FIELD_SIZES: Readonly<Record<number, number | undefined>> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8,
}

/** Compression schemes this decoder reads. */
const COMPRESSION_NONE = 1
const COMPRESSION_LZW = 5
const COMPRESSION_JPEG_OLD = 6
const COMPRESSION_JPEG = 7
const COMPRESSION_DEFLATE = 8
const COMPRESSION_PACKBITS = 32773

/** Photometric interpretations this decoder reads. */
const PHOTOMETRIC_WHITE_IS_ZERO = 0
const PHOTOMETRIC_BLACK_IS_ZERO = 1
const PHOTOMETRIC_RGB = 2
const PHOTOMETRIC_PALETTE = 3
const PHOTOMETRIC_CMYK = 5

/** The tags this decoder reads. */
const TAG = {
  imageWidth: 256,
  imageLength: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  stripOffsets: 273,
  orientation: 274,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  planarConfig: 284,
  xResolution: 282,
  yResolution: 283,
  resolutionUnit: 296,
  predictor: 317,
  colorMap: 320,
  tileWidth: 322,
  tileLength: 323,
  tileOffsets: 324,
  tileByteCounts: 325,
  extraSamples: 338,
  sampleFormat: 339,
  subIfds: 330,
  jpegOffset: 513,
  jpegLength: 514,
} as const

/** One image file directory: tag to values plus the next directory's offset. */
interface Directory {
  readonly entries: ReadonlyMap<number, readonly number[]>
  readonly nextOffset: number
  readonly offset: number
}

/** A reader over the TIFF's bytes, bound to the file's byte order. */
interface Reader {
  readonly bytes: Uint8Array
  readonly littleEndian: boolean
  /** @param offset - byte offset. @returns the unsigned 16-bit value. */
  uint16(offset: number): number
  /** @param offset - byte offset. @returns the unsigned 32-bit value. */
  uint32(offset: number): number
}

/**
 * Build a byte-order-aware reader over a TIFF.
 * @param bytes - the complete file.
 * @param littleEndian - true for `II`, false for `MM`.
 * @returns the reader.
 */
function makeReader(bytes: Uint8Array, littleEndian: boolean): Reader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    bytes,
    littleEndian,
    uint16: offset => view.getUint16(offset, littleEndian),
    uint32: offset => view.getUint32(offset, littleEndian),
  }
}

/**
 * Read one image file directory.
 * @param reader - the byte-order-aware reader.
 * @param offset - the directory's offset.
 * @returns the directory.
 */
function readDirectory(reader: Reader, offset: number): Directory {
  if (offset + 2 > reader.bytes.byteLength) throw new TiffDecodeError('truncated', 'directory header past end of file')
  const count = reader.uint16(offset)
  const entries = new Map<number, number[]>()
  for (let index = 0; index < count; index += 1) {
    const entry = offset + 2 + index * 12
    if (entry + 12 > reader.bytes.byteLength) throw new TiffDecodeError('truncated', 'directory entry past end of file')
    const tag = reader.uint16(entry)
    const type = reader.uint16(entry + 2)
    const length = reader.uint32(entry + 4)
    const size = FIELD_SIZES[type]
    if (size === undefined || size === 0) continue
    const values: number[] = []
    const total = size * length
    // A value of four bytes or fewer is stored inside the entry itself.
    const base = total <= 4 ? entry + 8 : reader.uint32(entry + 8)
    if (base + total > reader.bytes.byteLength) continue
    for (let item = 0; item < length; item += 1) {
      const at = base + item * size
      if (size === 1) values.push(reader.bytes[at] ?? 0)
      else if (size === 2) values.push(reader.uint16(at))
      else if (size === 4) values.push(reader.uint32(at))
      // A rational is two 32-bit halves, and both are kept so that a resolution
      // stated as 300/2 reads as 150 rather than as its numerator.
      else values.push(reader.uint32(at), reader.uint32(at + 4))
    }
    entries.set(tag, values)
  }
  return { entries, nextOffset: reader.uint32(offset + 2 + count * 12), offset }
}

/** Read a single value, or the given fallback. */
function value(directory: Directory, tag: number, fallback?: number): number | undefined {
  return directory.entries.get(tag)?.[0] ?? fallback
}

/**
 * Read a rational tag as its quotient.
 * @param directory - the directory to read.
 * @param tag - the rational tag.
 * @returns the quotient, or undefined when the tag is absent or unusable.
 */
function rational(directory: Directory, tag: number): number | undefined {
  const pair = directory.entries.get(tag)
  const numerator = pair?.[0]
  const denominator = pair?.[1]
  if (numerator === undefined) return undefined
  if (denominator === undefined || denominator === 0) return numerator
  return numerator / denominator
}

/**
 * The JPEG preview bytes a directory points at, when it holds one.
 * @param reader - the byte-order-aware reader.
 * @param directory - the directory to inspect.
 * @returns the JPEG bytes, or undefined.
 */
function embeddedJpeg(reader: Reader, directory: Directory): Uint8Array | undefined {
  const compression = value(directory, TAG.compression, COMPRESSION_NONE)
  const jpegOffset = value(directory, TAG.jpegOffset)
  const jpegLength = value(directory, TAG.jpegLength)
  if (jpegOffset !== undefined && jpegLength !== undefined) {
    const slice = reader.bytes.subarray(jpegOffset, jpegOffset + jpegLength)
    if (slice[0] === 0xff && slice[1] === 0xd8) return slice
  }
  if (compression !== COMPRESSION_JPEG && compression !== COMPRESSION_JPEG_OLD) return undefined
  const offsets = directory.entries.get(TAG.stripOffsets) ?? directory.entries.get(TAG.tileOffsets)
  const lengths = directory.entries.get(TAG.stripByteCounts) ?? directory.entries.get(TAG.tileByteCounts)
  if (offsets === undefined || lengths === undefined || offsets.length === 0) return undefined
  const start = offsets[0] ?? 0
  const length = lengths[0] ?? 0
  const slice = reader.bytes.subarray(start, start + length)
  return slice[0] === 0xff && slice[1] === 0xd8 ? slice : undefined
}

/** Bits read most-significant-first, as TIFF's LZW and PackBits packing requires. */
class BitReader {
  private bitOffset = 0
  constructor(private readonly bytes: Uint8Array) {}

  /** @param width - number of bits to read. @returns the value, or -1 at end of input. */
  read(width: number): number {
    if (this.bitOffset + width > this.bytes.byteLength * 8) return -1
    let result = 0
    for (let index = 0; index < width; index += 1) {
      const at = this.bitOffset + index
      const byte = this.bytes[at >> 3] ?? 0
      result = (result << 1) | ((byte >> (7 - (at & 7))) & 1)
    }
    this.bitOffset += width
    return result
  }
}

/**
 * Inflate a TIFF LZW strip.
 *
 * TIFF's LZW is the classic algorithm with two deviations this implements: codes
 * are packed most-significant-bit first, and the code width grows one code early
 * ("early change"), which is what the format's writers rely on.
 * @param input - the compressed strip.
 * @param expectedLength - the strip's uncompressed byte count.
 * @returns the decompressed bytes.
 */
export function inflateTiffLzw(input: Uint8Array, expectedLength: number): Uint8Array {
  const CLEAR = 256
  const END = 257
  const output = new Uint8Array(expectedLength)
  let written = 0
  const reader = new BitReader(input)
  let width = 9
  let next = 258
  let previous: number[] | undefined
  const table: (number[] | undefined)[] = []
  const reset = (): void => {
    table.length = 0
    width = 9
    next = 258
    previous = undefined
  }
  while (true) {
    const code = reader.read(width)
    if (code < 0 || code === END) break
    if (code === CLEAR) {
      reset()
      continue
    }
    let entry: number[]
    const known = table.at(code)
    if (code < next && known !== undefined) entry = known
    else if (code === next && previous !== undefined) entry = [...previous, previous[0] ?? 0]
    else if (code < 256) entry = [code]
    else break
    for (const byte of entry) {
      if (written >= output.length) break
      output[written] = byte
      written += 1
    }
    if (previous !== undefined && next < 4096) {
      table[next] = [...previous, entry[0] ?? 0]
      next += 1
      // Early change: widen one code before the table actually needs it.
      if (next === 511) width = 10
      else if (next === 1023) width = 11
      else if (next === 2047) width = 12
    }
    previous = entry
  }
  return output.subarray(0, written)
}

/**
 * Expand a PackBits-compressed strip.
 * @param input - the compressed strip.
 * @param expectedLength - the strip's uncompressed byte count.
 * @returns the decompressed bytes.
 */
export function inflateTiffPackBits(input: Uint8Array, expectedLength: number): Uint8Array {
  const output = new Uint8Array(expectedLength)
  let source = 0
  let written = 0
  while (source < input.byteLength && written < output.length) {
    const header = (input[source] ?? 0) << 24 >> 24
    source += 1
    if (header >= 0) {
      for (let index = 0; index <= header && written < output.length; index += 1) {
        output[written] = input[source] ?? 0
        written += 1
        source += 1
      }
    } else if (header !== -128) {
      const byte = input[source] ?? 0
      source += 1
      for (let index = 0; index < 1 - header && written < output.length; index += 1) {
        output[written] = byte
        written += 1
      }
    }
  }
  return output
}

/**
 * Reverse TIFF's horizontal differencing predictor in place.
 * @param samples - the decompressed samples.
 * @param width - the strip's pixel width.
 * @param rows - the strip's row count.
 * @param samplesPerPixel - samples per pixel.
 * @param bits - bits per sample, which decides the accumulator width.
 */
function undoHorizontalPredictor(
  samples: Uint8Array,
  width: number,
  rows: number,
  samplesPerPixel: number,
  bits: number,
): void {
  const bytesPerSample = bits === 16 ? 2 : 1
  const stride = width * samplesPerPixel * bytesPerSample
  for (let row = 0; row < rows; row += 1) {
    const start = row * stride
    if (bytesPerSample === 2) {
      for (let index = samplesPerPixel * 2; index < stride; index += 2) {
        const at = start + index
        const previous = ((samples[at - 2] ?? 0) << 8) | (samples[at - 1] ?? 0)
        const current = ((samples[at] ?? 0) << 8) | (samples[at + 1] ?? 0)
        const sum = (previous + current) & 0xffff
        samples[at] = sum >> 8
        samples[at + 1] = sum & 0xff
      }
      continue
    }
    for (let index = samplesPerPixel; index < stride; index += 1) {
      const at = start + index
      samples[at] = ((samples[at] ?? 0) + (samples[at - samplesPerPixel] ?? 0)) & 0xff
    }
  }
}

/** Expand one row of sub-byte samples (1- or 4-bit) into one byte per sample. */
function expandPackedBits(row: Uint8Array, width: number, bits: number): Uint8Array {
  const perByte = 8 / bits
  const mask = (1 << bits) - 1
  const output = new Uint8Array(width)
  for (let index = 0; index < width; index += 1) {
    const byte = row[Math.floor(index / perByte)] ?? 0
    const shift = 8 - bits * ((index % perByte) + 1)
    output[index] = (byte >> shift) & mask
  }
  return output
}

/** The decoded layout facts the pixel path needs. */
interface Layout {
  readonly width: number
  readonly height: number
  readonly bits: readonly number[]
  readonly samplesPerPixel: number
  readonly photometric: number
  readonly predictor: number
  readonly compression: number
}

/**
 * Decompress one strip or tile.
 * @param reader - the byte-order-aware reader.
 * @param slice - the compressed bytes.
 * @param expectedLength - the uncompressed byte count.
 * @param compression - the strip's compression scheme.
 * @returns the decompressed bytes.
 */
async function decompress(
  slice: Uint8Array,
  expectedLength: number,
  compression: number,
): Promise<Uint8Array> {
  if (expectedLength > MAX_STRIP_BYTES) {
    throw new TiffDecodeError('too-large', `a strip claims ${expectedLength} decompressed bytes`)
  }
  if (compression === COMPRESSION_NONE) return slice
  if (compression === COMPRESSION_PACKBITS) return inflateTiffPackBits(slice, expectedLength)
  if (compression === COMPRESSION_LZW) return inflateTiffLzw(slice, expectedLength)
  if (compression === COMPRESSION_DEFLATE) {
    if (typeof DecompressionStream === 'undefined') {
      throw new TiffDecodeError('unsupported-compression', 'deflate needs DecompressionStream')
    }
    const stream = new Blob([slice.slice()]).stream().pipeThrough(new DecompressionStream('deflate'))
    // Read the stream through a budget rather than buffering it whole: a
    // deflate stream may inflate far past the strip's stated length, and
    // `arrayBuffer()` would happily materialise every byte of it.
    const chunks: Uint8Array[] = []
    let total = 0
    const reader = stream.getReader()
    for (;;) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      total += chunk.byteLength
      if (total > MAX_STRIP_BYTES) {
        await reader.cancel()
        throw new TiffDecodeError('too-large', 'a deflate strip inflates past the byte budget')
      }
      chunks.push(chunk)
    }
    const output = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.byteLength
    }
    return output
  }
  throw new TiffDecodeError('unsupported-compression', `compression ${compression}`)
}

/**
 * Convert decompressed samples into RGBA pixels.
 * @param samples - the strip's samples.
 * @param layout - the image's layout.
 * @param colorMap - the palette, for palette images.
 * @param rows - the number of rows in this strip.
 * @param rgba - the destination, written at the strip's row offset.
 * @param rowOffset - the destination's first row.
 */
function toRgba(
  samples: Uint8Array,
  layout: Layout,
  colorMap: readonly number[] | undefined,
  rows: number,
  rgba: Uint8ClampedArray<ArrayBuffer>,
  rowOffset: number,
): void {
  const { width, bits, samplesPerPixel, photometric } = layout
  const maxValue = (1 << (bits[0] ?? 8)) - 1
  const channels = samplesPerPixel
  for (let row = 0; row < rows; row += 1) {
    const rowStart = row * width * channels * ((bits[0] ?? 8) === 16 ? 2 : 1)
    const packed = (bits[0] ?? 8) < 8 && photometric !== PHOTOMETRIC_PALETTE
      ? expandPackedBits(samples.subarray(rowStart, rowStart + Math.ceil(width * (bits[0] ?? 8) / 8)), width, bits[0] ?? 8)
      : undefined
    for (let column = 0; column < width; column += 1) {
      const destination = ((rowOffset + row) * width + column) * 4
      /** Read sample `index` of this pixel. */
      const sample = (index: number): number => {
        if (packed !== undefined) return packed[column] ?? 0
        const at = rowStart + (column * channels + index) * ((bits[0] ?? 8) === 16 ? 2 : 1)
        return samples.at(at) ?? 0
      }
      if (photometric === PHOTOMETRIC_PALETTE && colorMap !== undefined) {
        const entry = sample(0)
        const size = colorMap.length / 3
        const red = colorMap[entry] ?? 0
        const green = colorMap[size + entry] ?? 0
        const blue = colorMap[size * 2 + entry] ?? 0
        rgba[destination] = (red >> 8) & 0xff
        rgba[destination + 1] = (green >> 8) & 0xff
        rgba[destination + 2] = (blue >> 8) & 0xff
        rgba[destination + 3] = 255
        continue
      }
      if (photometric === PHOTOMETRIC_CMYK) {
        // TIFF's CMYK is inverted relative to the subtractive ink values.
        const c = 255 - sample(0)
        const m = 255 - sample(1)
        const y = 255 - sample(2)
        const k = channels > 3 ? 255 - sample(3) : 0
        rgba[destination] = (c * k) / 255
        rgba[destination + 1] = (m * k) / 255
        rgba[destination + 2] = (y * k) / 255
        rgba[destination + 3] = 255
        continue
      }
      if (photometric === PHOTOMETRIC_RGB) {
        rgba[destination] = sample(0) * 255 / maxValue
        rgba[destination + 1] = sample(1) * 255 / maxValue
        rgba[destination + 2] = sample(2) * 255 / maxValue
        rgba[destination + 3] = channels > 3 ? (sample(3) * 255) / maxValue : 255
        continue
      }
      const gray = (sample(0) * 255) / maxValue
      const level = photometric === PHOTOMETRIC_WHITE_IS_ZERO ? 255 - gray : gray
      rgba[destination] = level
      rgba[destination + 1] = level
      rgba[destination + 2] = level
      rgba[destination + 3] = channels > 1 ? (sample(1) * 255) / maxValue : 255
      void maxValue
    }
  }
}

/**
 * Apply TIFF's `Orientation` tag to decoded pixels.
 *
 * The tag describes how the stored pixels must be transformed to be seen
 * upright — a scanner writes sideways strips and a rotation byte rather than
 * rotating the samples — so it is applied here, once, and the returned
 * dimensions swap for the four values that turn the image a quarter.
 * @param rgba - the decoded pixels, four bytes per pixel.
 * @param width - the stored pixel width.
 * @param height - the stored pixel height.
 * @param orientation - the tag's value, 1 through 8.
 * @returns the pixels and dimensions as they should be displayed.
 */
function applyOrientation(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  orientation: number,
): { readonly rgba: Uint8ClampedArray<ArrayBuffer>; readonly width: number; readonly height: number } {
  if (orientation <= 1 || orientation > 8) return { rgba, width, height }
  const swaps = orientation >= 5
  const outputWidth = swaps ? height : width
  const outputHeight = swaps ? width : height
  const output: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Where this source pixel lands, per the tag's definition.
      let toX: number
      let toY: number
      switch (orientation) {
        case 2: toX = width - 1 - x; toY = y; break
        case 3: toX = width - 1 - x; toY = height - 1 - y; break
        case 4: toX = x; toY = height - 1 - y; break
        case 5: toX = y; toY = x; break
        case 6: toX = height - 1 - y; toY = x; break
        case 7: toX = height - 1 - y; toY = width - 1 - x; break
        default: toX = y; toY = width - 1 - x; break
      }
      const from = (y * width + x) * 4
      const to = (toY * outputWidth + toX) * 4
      output[to] = rgba[from] ?? 0
      output[to + 1] = rgba[from + 1] ?? 0
      output[to + 2] = rgba[from + 2] ?? 0
      output[to + 3] = rgba[from + 3] ?? 0
    }
  }
  return { rgba: output, width: outputWidth, height: outputHeight }
}

/**
 * Decode the pixels of a directory this decoder can read directly.
 * @param reader - the byte-order-aware reader.
 * @param directory - the image file directory.
 * @returns the metadata and RGBA pixels.
 */
async function decodePixels(reader: Reader, directory: Directory): Promise<TiffImage> {
  const width = value(directory, TAG.imageWidth)
  const height = value(directory, TAG.imageLength)
  if (width === undefined || height === undefined || width === 0 || height === 0) {
    throw new TiffDecodeError('missing-required-tag', 'image dimensions are absent')
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width * height > MAX_PIXELS) {
    throw new TiffDecodeError('too-large', `the directory claims ${width} × ${height} pixels`, {
      width,
      height,
    })
  }
  const samplesPerPixel = value(directory, TAG.samplesPerPixel, 1) ?? 1
  const bits = directory.entries.get(TAG.bitsPerSample) ?? [8]
  const photometric = value(directory, TAG.photometric, PHOTOMETRIC_BLACK_IS_ZERO) ?? PHOTOMETRIC_BLACK_IS_ZERO
  const compression = value(directory, TAG.compression, COMPRESSION_NONE) ?? COMPRESSION_NONE
  const predictor = value(directory, TAG.predictor, 1) ?? 1
  const planar = value(directory, TAG.planarConfig, 1) ?? 1
  if (planar !== 1) throw new TiffDecodeError('unsupported-layout', 'planar sample layout')
  if (![PHOTOMETRIC_WHITE_IS_ZERO, PHOTOMETRIC_BLACK_IS_ZERO, PHOTOMETRIC_RGB, PHOTOMETRIC_PALETTE, PHOTOMETRIC_CMYK]
    .includes(photometric)) {
    throw new TiffDecodeError('unsupported-photometric', `photometric ${photometric}`)
  }
  const bitsPerSample = bits[0] ?? 8
  if (![1, 2, 4, 8, 16].includes(bitsPerSample)) {
    throw new TiffDecodeError('unsupported-layout', `${bitsPerSample}-bit samples`)
  }
  const layout: Layout = { width, height, bits, samplesPerPixel, photometric, predictor, compression }
  const rgba: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(width * height * 4)
  const colorMap = directory.entries.get(TAG.colorMap)

  const tileWidth = value(directory, TAG.tileWidth)
  const tileHeight = value(directory, TAG.tileLength)
  const offsets = directory.entries.get(tileWidth === undefined ? TAG.stripOffsets : TAG.tileOffsets)
  const lengths = directory.entries.get(tileWidth === undefined ? TAG.stripByteCounts : TAG.tileByteCounts)
  if (offsets === undefined || lengths === undefined || offsets.length === 0) {
    throw new TiffDecodeError('missing-required-tag', 'no strip or tile offsets')
  }
  const tile = tileWidth !== undefined && tileHeight !== undefined
  const rowsPerChunk = tile ? tileHeight : (value(directory, TAG.rowsPerStrip, height) ?? height)
  // A large frame decodes over many strips; yielding between them keeps the
  // tab answering the reader instead of freezing for the whole decode.
  const cooperative = width * height > COOPERATIVE_PIXELS
  for (const [index, offset] of offsets.entries()) {
    if (cooperative && index > 0 && index % 8 === 0) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
    }
    const length = lengths[index] ?? 0
    const slice = reader.bytes.subarray(offset, offset + length)
    const chunkWidth = tile ? tileWidth : width
    const chunkHeight = tile ? tileHeight : Math.min(rowsPerChunk, height - index * rowsPerChunk)
    if (chunkHeight <= 0) break
    const expected = Math.ceil(chunkWidth * chunkHeight * samplesPerPixel * bitsPerSample / 8)
    let samples: Uint8Array
    try {
      samples = await decompress(slice, expected, compression)
    } catch (error) {
      // A strip that exceeds the budget is still this image's property, so the
      // refusal carries the dimensions the reader is being denied.
      throw error instanceof TiffDecodeError && error.failure === 'too-large' && error.size === undefined
        ? new TiffDecodeError('too-large', error.message, { width, height })
        : error
    }
    if (predictor === 2) undoHorizontalPredictor(samples, chunkWidth, chunkHeight, samplesPerPixel, bitsPerSample)
    if (tile) {
      // A tile is a rectangle inside the image rather than a band across it.
      const columns = Math.ceil(width / chunkWidth)
      const tileX = (index % columns) * chunkWidth
      const tileY = Math.floor(index / columns) * chunkHeight
      const tileRgba = new Uint8ClampedArray(chunkWidth * chunkHeight * 4)
      toRgba(samples, { ...layout, width: chunkWidth }, colorMap, chunkHeight, tileRgba, 0)
      for (let row = 0; row < chunkHeight && tileY + row < height; row += 1) {
        for (let column = 0; column < chunkWidth && tileX + column < width; column += 1) {
          const from = (row * chunkWidth + column) * 4
          const to = ((tileY + row) * width + tileX + column) * 4
          rgba.set(tileRgba.subarray(from, from + 4), to)
        }
      }
      continue
    }
    toRgba(samples, layout, colorMap, chunkHeight, rgba, index * rowsPerChunk)
  }

  const xResolution = rational(directory, TAG.xResolution)
  const yResolution = rational(directory, TAG.yResolution)
  const unit = value(directory, TAG.resolutionUnit, 2) ?? 2
  const scale = unit === 1 ? 25.4 : 1
  const dpi = xResolution === undefined || yResolution === undefined
    ? undefined
    : { x: roundDpi(xResolution * scale), y: roundDpi(yResolution * scale) }
  const orientation = value(directory, TAG.orientation, 1) ?? 1
  const oriented = applyOrientation(rgba, width, height, orientation)
  return {
    kind: 'pixels',
    metadata: {
      width: oriented.width,
      height: oriented.height,
      ...(dpi === undefined ? {} : { dpi }),
    },
    rgba: oriented.rgba,
  }
}

/** Round a resolution to a stable integer, dropping its fractional part. */
function roundDpi(value: number): number {
  return Math.round(value)
}

/**
 * Decode a TIFF into pixels or an embedded JPEG.
 * @param bytes - the complete file.
 * @returns the decoded image.
 * @throws {TiffDecodeError} when the file is not a TIFF this decoder can read.
 */
export async function decodeTiff(bytes: Uint8Array): Promise<TiffImage> {
  if (bytes.byteLength < 8) throw new TiffDecodeError('not-tiff', 'file is shorter than a TIFF header')
  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49
  const bigEndian = bytes[0] === 0x4d && bytes[1] === 0x4d
  if (!littleEndian && !bigEndian) throw new TiffDecodeError('not-tiff', 'no TIFF byte-order mark')
  const reader = makeReader(bytes, littleEndian)
  if (reader.uint16(2) !== 42) throw new TiffDecodeError('not-tiff', 'TIFF magic number is absent')
  const first = reader.uint32(4)
  if (first === 0 || first >= bytes.byteLength) throw new TiffDecodeError('truncated', 'first directory offset is out of range')

  const directories: Directory[] = []
  let offset = first
  // Walk the directory chain: RAW containers keep their preview in a later
  // directory, and this decoder prefers whatever it can actually read.
  while (offset !== 0 && directories.length < 8 && offset + 2 <= bytes.byteLength) {
    const directory = readDirectory(reader, offset)
    directories.push(directory)
    const sub = directory.entries.get(TAG.subIfds)
    const firstSub = sub?.at(0)
    if (firstSub !== undefined && firstSub !== 0 && firstSub + 2 <= bytes.byteLength) {
      const nested = readDirectory(reader, firstSub)
      directories.push(nested)
    }
    offset = directory.nextOffset
  }

  let firstFailure: TiffDecodeError | undefined
  for (const directory of directories) {
    const jpeg = embeddedJpeg(reader, directory)
    if (jpeg !== undefined) {
      const width = value(directory, TAG.imageWidth, 0) ?? 0
      const height = value(directory, TAG.imageLength, 0) ?? 0
      const unit = value(directory, TAG.resolutionUnit, 2) ?? 2
      const scale = unit === 1 ? 25.4 : 1
      const xResolution = rational(directory, TAG.xResolution)
      const yResolution = rational(directory, TAG.yResolution)
      const dpi = xResolution === undefined || yResolution === undefined
        ? undefined
        : { x: roundDpi(xResolution * scale), y: roundDpi(yResolution * scale) }
      // A RAW or print TIFF keeps its preview as a JPEG. Whose EXIF states the
      // orientation is not knowable from here, so the dimensions are left as
      // the directory states them and the loader measures the decoded blob.
      return {
        kind: 'jpeg',
        metadata: { width, height, ...(dpi === undefined ? {} : { dpi }) },
        bytes: jpeg,
      }
    }
    try {
      return await decodePixels(reader, directory)
    } catch (error) {
      const failure = error instanceof TiffDecodeError
        ? error
        : new TiffDecodeError('unsupported-layout', String(error))
      firstFailure ??= failure
      // A budget refusal is the file's property, not the directory's: another
      // directory of the same container cannot decode it any more than this one.
      if (failure.failure === 'too-large') throw failure
    }
  }
  throw firstFailure ?? new TiffDecodeError('unsupported-layout', 'no readable image directory')
}
