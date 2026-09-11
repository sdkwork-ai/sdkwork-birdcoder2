/**
 * TIFF decoding against files a real encoder produced.
 *
 * Pillow writes the fixtures (see `make_samples.py`), so these specs decode what
 * an independent writer emitted rather than bytes this repository also authored.
 * The source image is an 8x8 grid whose pixel at (x, y) is (x*32, y*32, 128).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeTiff, inflateTiffLzw, inflateTiffPackBits, TiffDecodeError } from '../src/client/image/tiff.ts'

/** Read one generated fixture. */
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fileURLToPath(new URL(`./samples/${name}`, import.meta.url))))
}

/** The RGBA pixel at a coordinate of a decoded image. */
function pixelAt(image: { metadata: { width: number }; rgba: Uint8ClampedArray }, x: number, y: number): number[] {
  const offset = (y * image.metadata.width + x) * 4
  return [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2], image.rgba[offset + 3]] as number[]
}

describe('decodeTiff with real encoder output', () => {
  // Every compression Pillow writes for TIFF, which is the decoder's four paths.
  for (const [name, compression] of [
    ['plain-none.tif', 'uncompressed'],
    ['plain-lzw.tif', 'LZW'],
    ['plain-packbits.tif', 'PackBits'],
    ['plain-deflate.tif', 'Deflate'],
    ['plain-adobe-deflate.tif', 'Adobe Deflate'],
  ] as const) {
    it(`decodes an ${compression} image to the same pixels`, async () => {
      const image = await decodeTiff(fixture(name))
      expect(image.kind).toBe('pixels')
      if (image.kind !== 'pixels') return
      expect([image.metadata.width, image.metadata.height]).toEqual([8, 8])
      expect(pixelAt(image, 0, 0)).toEqual([0, 0, 128, 255])
      expect(pixelAt(image, 1, 2)).toEqual([32, 64, 128, 255])
      expect(pixelAt(image, 7, 7)).toEqual([224, 224, 128, 255])
      // Pillow omits a resolution tag unless asked for, so these files carry none.
      expect(image.metadata.dpi).toBeUndefined()
    })
  }

  it('reads a stated resolution in dots per inch', async () => {
    const image = await decodeTiff(fixture('plain-dpi.tif'))
    expect(image.kind).toBe('pixels')
    if (image.kind !== 'pixels') return
    expect(image.metadata.dpi?.x).toBeCloseTo(300, 0)
    expect(image.metadata.dpi?.y).toBeCloseTo(300, 0)
  })

  it('divides a resolution stated as a rational', async () => {
    const image = await decodeTiff(fixture('plain-dpi-rational.tif'))
    expect(image.kind).toBe('pixels')
    if (image.kind !== 'pixels') return
    // The tag holds 301/2, which rounds to 151 dpi. Reading its numerator alone
    // would say 301 — twice the real density — so 151 is the proof of division.
    expect(image.metadata.dpi?.x).toBe(151)
    expect(image.metadata.dpi?.y).toBe(151)
  })

  it('turns the pixels and the frame a stated orientation calls for', async () => {
    const image = await decodeTiff(fixture('sideways-orient6.tif'))
    expect(image.kind).toBe('pixels')
    if (image.kind !== 'pixels') return
    // Stored 4x8 with Orientation 6, which is a quarter turn clockwise.
    expect([image.metadata.width, image.metadata.height]).toEqual([8, 4])
    // A quarter turn clockwise sends the source (x, y) to (height - 1 - y, x).
    expect(pixelAt(image, 7, 0)).toEqual([0, 0, 128, 255])
    expect(pixelAt(image, 0, 3)).toEqual([192, 224, 128, 255])
    expect(pixelAt(image, 7, 3)).toEqual([192, 0, 128, 255])
  })

  it('reads a big-endian file', async () => {
    const image = await decodeTiff(fixture('plain-bigendian.tif'))
    expect(image.kind).toBe('pixels')
    if (image.kind !== 'pixels') return
    expect(pixelAt(image, 1, 2)).toEqual([32, 64, 128, 255])
  })

  it('reads a grayscale file through the luminance path', async () => {
    const image = await decodeTiff(fixture('plain-gray.tif'))
    expect(image.kind).toBe('pixels')
    if (image.kind !== 'pixels') return
    const [red, green, blue] = pixelAt(image, 1, 2)
    expect(red).toBe(green)
    expect(green).toBe(blue)
    // Pillow wrote the RGB grid converted to luminance, so the ramp is intact.
    expect(red).toBeGreaterThan(50)
    expect(red).toBeLessThan(80)
  })

  it('reads a palette file through its colour map', async () => {
    const image = await decodeTiff(fixture('plain-palette.tif'))
    expect(image.kind).toBe('pixels')
    if (image.kind !== 'pixels') return
    expect(pixelAt(image, 0, 0)).toEqual([0, 0, 128, 255])
    expect(pixelAt(image, 7, 7)).toEqual([224, 224, 128, 255])
  })

  it('reads a CMYK file through the subtractive path', async () => {
    const image = await decodeTiff(fixture('plain-cmyk.tif'))
    expect(image.kind).toBe('pixels')
    if (image.kind !== 'pixels') return
    expect(pixelAt(image, 0, 0)).toEqual([0, 0, 128, 255])
  })

  it('reads an image stored as tiles rather than strips', async () => {
    const image = await decodeTiff(fixture('tiled-lzw.tif'))
    expect(image.kind).toBe('pixels')
    if (image.kind !== 'pixels') return
    expect([image.metadata.width, image.metadata.height]).toEqual([32, 32])
    // The 32x32 grid is ((x*8) mod 256, (y*8) mod 256, 64); tiles are 16x16, so
    // these coordinates land in four different tiles.
    expect(pixelAt(image, 0, 0)).toEqual([0, 0, 64, 255])
    expect(pixelAt(image, 17, 0)).toEqual([136, 0, 64, 255])
    expect(pixelAt(image, 0, 17)).toEqual([0, 136, 64, 255])
    expect(pixelAt(image, 17, 17)).toEqual([136, 136, 64, 255])
    expect(pixelAt(image, 31, 31)).toEqual([248, 248, 64, 255])
  })

  it('refuses bytes that are not a TIFF', async () => {
    await expect(decodeTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])))
      .rejects.toMatchObject({ failure: 'not-tiff' })
  })

  it('refuses a TIFF whose first directory is past the end', async () => {
    const bytes = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff, 0xff, 0xff, 0x7f])
    await expect(decodeTiff(bytes)).rejects.toBeInstanceOf(TiffDecodeError)
  })
})

/**
 * Build a little-endian TIFF whose one directory states the given tags.
 *
 * Every value is four bytes or fewer, so all of them sit inside their entry;
 * the strip the tags describe is never read, which is exactly the point of
 * these cases: a file that asks for gigabytes needs to contain almost nothing.
 */
function tiffWith(tags: readonly (readonly [number, number])[]): Uint8Array {
  const bytes = new Uint8Array(8 + 2 + tags.length * 12 + 4)
  const view = new DataView(bytes.buffer)
  bytes.set([0x49, 0x49, 0x2a, 0x00], 0)
  view.setUint32(4, 8, true)
  view.setUint16(8, tags.length, true)
  tags.forEach(([tag, value], index) => {
    const entry = 10 + index * 12
    view.setUint16(entry, tag, true)
    view.setUint16(entry + 2, 4, true)
    view.setUint32(entry + 4, 1, true)
    view.setUint32(entry + 8, value, true)
  })
  return bytes
}

describe('decodeTiff budgets', () => {
  it('refuses an image whose pixel count is beyond the budget, naming its size', async () => {
    const bytes = tiffWith([
      [256, 40_000], [257, 40_000], [258, 8], [259, 1],
      [262, 2], [273, 8], [277, 3], [279, 1], [278, 40_000],
    ])
    await expect(decodeTiff(bytes)).rejects.toMatchObject({
      failure: 'too-large',
      size: { width: 40_000, height: 40_000 },
    })
  })

  it('refuses a strip that would decompress past the byte budget', async () => {
    // 60 000 × 1 000 pixels is inside the pixel budget, but four 16-bit samples
    // each is 480 MB of strip — more than any single allocation here is allowed.
    const bytes = tiffWith([
      [256, 60_000], [257, 1_000], [258, 16], [262, 2],
      [273, 8], [277, 4], [279, 1], [278, 1_000],
    ])
    // The refusal still names the image the reader was denied.
    await expect(decodeTiff(bytes)).rejects.toMatchObject({
      failure: 'too-large',
      size: { width: 60_000, height: 1_000 },
    })
  })

  it('still decodes an image inside both budgets', async () => {
    const bytes = tiffWith([
      [256, 8], [257, 8], [258, 8], [259, 1],
      [262, 2], [273, 8], [277, 3], [278, 8], [279, 1],
    ])
    // The strip is a single byte where an 8x8x3 image needs 192, so the decode
    // reaches the sample loop and reports the shortfall rather than the budget.
    await expect(decodeTiff(bytes)).resolves.toMatchObject({ kind: 'pixels' })
  })
})

describe('inflateTiffLzw', () => {
  it('expands a literal-only stream and stops at the end code', () => {
    // Nine-bit codes 65, 66, 67 then END, packed most-significant-bit first.
    const bits = [65, 66, 67, 257].map(code => code.toString(2).padStart(9, '0')).join('')
    const bytes = new Uint8Array(Math.ceil(bits.length / 8))
    for (let index = 0; index < bits.length; index += 1) {
      if (bits[index] === '1') bytes[index >> 3] |= 1 << (7 - (index & 7))
    }
    expect([...inflateTiffLzw(bytes, 3)]).toEqual([65, 66, 67])
  })
})

describe('inflateTiffPackBits', () => {
  it('expands literal runs and repeats', () => {
    // Literal run of three bytes, then a repeat of four 0x7f bytes.
    const input = new Uint8Array([0x02, 1, 2, 3, 0xfd, 0x7f])
    expect([...inflateTiffPackBits(input, 7)]).toEqual([1, 2, 3, 0x7f, 0x7f, 0x7f, 0x7f])
  })

  it('skips the no-op header', () => {
    const input = new Uint8Array([0x80, 0x00, 9])
    expect([...inflateTiffPackBits(input, 1)]).toEqual([9])
  })
})
