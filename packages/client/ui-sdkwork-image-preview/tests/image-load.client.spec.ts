/**
 * The loader's own contracts: what it hands the browser, what it measures, and
 * every Blob URL it creates.
 *
 * The decode of a real TIFF is covered against encoder output in `tiff.spec`;
 * what is covered here is the layer above it, where the decisions are made —
 * gzip removal, oriented measurement, the byte budget, and the rule that a URL
 * created for a preview is revoked rather than left to the tab's lifetime.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatByteSize, ImageLoadError, loadImage } from '../src/client/image/load.ts'

/** Read one generated fixture. */
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fileURLToPath(new URL(`./samples/${name}`, import.meta.url))))
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2"/></svg>'

/** A bitmap stand-in for what the platform reports for a measured blob. */
function stubBitmap(width: number, height: number): void {
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: vi.fn(async () => ({ width, height, close: vi.fn() })),
  })
}

describe('loadImage', () => {
  const created: string[] = []
  const revoked: string[] = []
  let counter = 0

  beforeEach(() => {
    created.length = 0
    revoked.length = 0
    counter = 0
    stubBitmap(1200, 800)
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      counter += 1
      const url = `blob:probe-${counter}`
      created.push(url)
      return url
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => { revoked.push(url) })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'createImageBitmap')
  })

  it('measures a native image with the from-image orientation, so the frame agrees with the pixels', async () => {
    const bitmap = vi.fn(async () => ({ width: 1216, height: 912, close: vi.fn() }))
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: bitmap })
    const image = await loadImage(fixture('plain.png'), 'png', new AbortController().signal)
    expect(image.format.name).toBe('PNG')
    expect([image.width, image.height]).toEqual([1216, 912])
    expect(bitmap).toHaveBeenCalledWith(expect.any(Blob), { imageOrientation: 'from-image' })
  })

  it('falls back to an element measurement when the platform cannot make a bitmap', async () => {
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: vi.fn(async () => { throw new Error('cannot decode to a bitmap') }),
    })
    const decode = vi.fn(async () => {})
    const element = { naturalWidth: 640, naturalHeight: 480, decode, src: '' }
    const original = globalThis.Image
    /** A constructor, because the loader builds its probe with `new Image()`. */
    const StubImage = function StubImage(): unknown { return element }
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: StubImage })
    try {
      const image = await loadImage(fixture('plain.svg'), 'svg', new AbortController().signal)
      expect([image.width, image.height]).toEqual([640, 480])
      expect(decode).toHaveBeenCalled()
    } finally {
      Object.defineProperty(globalThis, 'Image', { configurable: true, value: original })
    }
  })

  it('inflates a gzipped SVG and hands the browser the markup it can decode', async () => {
    const gzipped = new Uint8Array(gzipSync(Buffer.from(SVG, 'utf-8')))
    const image = await loadImage(gzipped, 'svgz', new AbortController().signal)
    expect(image.format.delivery).toBe('gzip')
    expect(image.format.mime).toBe('image/svg+xml')
    // The caption states the file the reader opened, not the inflated payload.
    expect(image.byteLength).toBe(gzipped.byteLength)
    expect(created).toHaveLength(1)
  })

  it('reports a gzip stream that holds no image as undecodable', async () => {
    const gzipped = new Uint8Array(gzipSync(Buffer.from('not an image at all', 'utf-8')))
    await expect(loadImage(gzipped, 'svgz', new AbortController().signal))
      .rejects.toMatchObject({ failure: 'decode' })
  })

  it('names the format and the size when a TIFF is beyond the decode budget', async () => {
    // A real encoder's file with its width and length tags patched to 40 000,
    // which is what a crafted or truncated container looks like from here.
    const bytes = fixture('plain-none.tif')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const directory = view.getUint32(4, true)
    const count = view.getUint16(directory, true)
    for (let index = 0; index < count; index += 1) {
      const entry = directory + 2 + index * 12
      const tag = view.getUint16(entry, true)
      if (tag === 256 || tag === 257) view.setUint16(entry + 8, 40_000, true)
    }
    const failure = await loadImage(bytes, 'tif', new AbortController().signal).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ImageLoadError)
    expect(failure).toMatchObject({ failure: 'too-large', size: { width: 40_000, height: 40_000 } })
    expect((failure as ImageLoadError).format?.name).toBe('TIFF')
    // A refused load never leaves a URL behind.
    expect(revoked).toEqual(created)
  })

  it('does not name a format for bytes that are not an image', async () => {
    await expect(loadImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'bin', new AbortController().signal))
      .rejects.toMatchObject({ failure: 'not-image' })
  })

  it('carries no decoder for a recognized but undrawable format, and no URL', async () => {
    // Bytes with no signature of their own, under a suffix whose format this
    // preview knows by name: exactly what the claim exists for.
    const unknown = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88])
    const failure = await loadImage(unknown, 'heic', new AbortController().signal).catch((error: unknown) => error)
    expect(failure).toMatchObject({ failure: 'unsupported' })
    expect((failure as ImageLoadError).format?.reasonKey).toBe('reason.heif')
    expect(created).toEqual([])
  })

  it('honours an abort that arrives before the work starts', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(loadImage(fixture('plain.png'), 'png', controller.signal)).rejects.toThrow()
  })
})

describe('formatByteSize', () => {
  it('reads in the unit a file manager would choose', () => {
    expect(formatByteSize(0)).toBe('0 B')
    expect(formatByteSize(4096)).toBe('4.0 KB')
    expect(formatByteSize(1024 * 1024 * 3)).toBe('3.0 MB')
    expect(formatByteSize(1024 ** 3 * 2)).toBe('2.0 GB')
  })

  it('promotes a size that would round up into the next unit', () => {
    // 1 048 575 bytes is 1023.999… KiB, which must not read as 1024.0 KB.
    expect(formatByteSize(1024 * 1024 - 1)).toBe('1.0 MB')
    expect(formatByteSize(1024 - 1)).toBe('1023 B')
  })
})
