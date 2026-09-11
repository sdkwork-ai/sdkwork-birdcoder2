/**
 * Format identification from real files and from crafted bytes.
 *
 * The fixtures are the Pillow output from `make_samples.py`, including one file
 * whose suffix lies about its contents.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatForExtension, IMAGE_EXTENSIONS, sniffImageFormat } from '../src/client/image/formats.ts'

/** Read one generated fixture. */
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fileURLToPath(new URL(`./samples/${name}`, import.meta.url))))
}

describe('sniffImageFormat on real files', () => {
  for (const [name, expected] of [
    ['plain.png', 'PNG'],
    ['plain.jpg', 'JPEG'],
    ['plain.gif', 'GIF'],
    ['plain.bmp', 'BMP'],
    ['plain.webp', 'WebP'],
    ['plain.svg', 'SVG'],
    ['plain-lzw.tif', 'TIFF'],
  ] as const) {
    it(`identifies ${name} as ${expected}`, () => {
      expect(sniffImageFormat(fixture(name), name.slice(name.lastIndexOf('.') + 1))?.name).toBe(expected)
    })
  }

  it('trusts the bytes over a lying suffix', () => {
    // The fixture is JPEG data carrying a .png name.
    const format = sniffImageFormat(fixture('mislabelled-png.png'), 'png')
    expect(format?.name).toBe('JPEG')
    expect(format?.delivery).toBe('native')
  })

  it('falls back to the suffix when no signature is recognized', () => {
    const unknown = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77])
    expect(sniffImageFormat(unknown, 'heic')?.name).toBe('HEIF')
    expect(sniffImageFormat(unknown, 'psd')?.name).toBe('Photoshop')
    expect(sniffImageFormat(unknown, 'dng')?.name).toBe('RAW')
    expect(sniffImageFormat(unknown, 'zzz')).toBeUndefined()
  })
})

describe('sniffImageFormat on signatures', () => {
  /** Build bytes whose first entries are the given values. */
  function bytes(values: number[], length = 16): Uint8Array {
    const out = new Uint8Array(length)
    out.set(values)
    return out
  }

  it('recognizes the ISO base media brands', () => {
    const box = (brand: string): Uint8Array => {
      const out = bytes([0, 0, 0, 0x18])
      for (let index = 0; index < 4; index += 1) out[4 + index] = 'ftyp'.charCodeAt(index)
      for (let index = 0; index < brand.length; index += 1) out[8 + index] = brand.charCodeAt(index)
      return out
    }
    expect(sniffImageFormat(box('avif'), 'bin')?.name).toBe('AVIF')
    expect(sniffImageFormat(box('avis'), 'bin')?.delivery).toBe('native')
    expect(sniffImageFormat(box('heic'), 'bin')?.name).toBe('HEIF')
    expect(sniffImageFormat(box('heic'), 'bin')?.delivery).toBe('unsupported')
    expect(sniffImageFormat(box('mif1'), 'bin')?.name).toBe('HEIF')
  })

  it('recognizes the formats a reader may open but this preview cannot draw', () => {
    for (const [values, name] of [
      [[0x38, 0x42, 0x50, 0x53], 'Photoshop'],
      [[0x44, 0x44, 0x53, 0x20], 'DDS'],
      [[0x76, 0x2f, 0x31, 0x01], 'OpenEXR'],
      [[0x25, 0x21, 0x50, 0x53], 'EPS'],
      [[0xff, 0x4f, 0xff, 0x51], 'JPEG 2000'],
      [[0xff, 0x0a], 'JPEG XL'],
    ] as const) {
      const format = sniffImageFormat(bytes([...values]), 'bin')
      expect(format?.name).toBe(name)
      expect(format?.delivery).toBe('unsupported')
      // The reason is a dictionary key: the sentence a reader sees is written
      // in their language, never baked into the format table.
      expect(format?.reasonKey).toBeTruthy()
      expect(format?.reasonKey).toMatch(/^reason\./)
    }
  })

  it('reports an ICNS icon set as ICNS rather than as an ICO', () => {
    const icns = new TextEncoder().encode('icns\x00\x00\x01\x00ic07')
    const format = sniffImageFormat(icns, 'icns')
    expect(format?.name).toBe('ICNS')
    expect(format?.delivery).toBe('unsupported')
    expect(format?.reasonKey).toBe('reason.icns')
  })

  it('identifies a gzip payload as the compressed form of an SVG', () => {
    const gzipped = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(sniffImageFormat(gzipped, 'svgz')).toMatchObject({
      name: 'SVG',
      mime: 'image/svg+xml',
      delivery: 'gzip',
    })
    // The gzip signature is decisive even when the suffix says something else.
    expect(sniffImageFormat(gzipped, 'bin')?.delivery).toBe('gzip')
  })

  it('recognizes a TIFF-based RAW container as RAW rather than plain TIFF', () => {
    const cr2 = bytes([0x49, 0x49, 0x2a, 0x00, 0x10, 0x00, 0x00, 0x00])
    for (let index = 0; index < 2; index += 1) cr2[8 + index] = 'CR'.charCodeAt(index)
    expect(sniffImageFormat(cr2, 'cr2')?.name).toBe('RAW')
    expect(sniffImageFormat(bytes([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]), 'tif')?.name).toBe('TIFF')
    expect(sniffImageFormat(bytes([0x4d, 0x4d, 0x00, 0x2a]), 'tif')?.name).toBe('TIFF')
  })

  it('finds an SVG root behind an XML declaration and a leading comment', () => {
    const withProlog = new TextEncoder().encode('<?xml version="1.0"?>\n<!-- note -->\n<svg width="1"/>')
    expect(sniffImageFormat(withProlog, 'bin')?.name).toBe('SVG')
  })

  it('recognizes an ICO and a Netpbm family member', () => {
    expect(sniffImageFormat(bytes([0, 0, 1, 0]), 'ico')?.name).toBe('ICO')
    expect(sniffImageFormat(bytes([0x50, 0x36, 0x0a]), 'ppm')?.name).toBe('Netpbm')
  })

  it('names QOI, XPM, and XBM as themselves rather than as formats they are not', () => {
    // `qoif` is QOI's marker, not a JPEG XL one: a reader told the wrong format
    // is told to convert the wrong thing.
    expect(sniffImageFormat(bytes([0x71, 0x6f, 0x69, 0x66]), 'qoi')).toMatchObject({
      name: 'QOI',
      delivery: 'unsupported',
      reasonKey: 'reason.qoi',
    })
    const xpm = new TextEncoder().encode('/* XPM */\nstatic char *a[] = {')
    expect(sniffImageFormat(xpm, 'bin')?.name).toBe('XPM/XBM')
    const xbm = new TextEncoder().encode('#define logo_width 32\n')
    expect(sniffImageFormat(xbm, 'bin')?.name).toBe('XPM/XBM')
    expect(sniffImageFormat(xpm, 'bin')?.name).not.toBe('Netpbm')
  })
})

describe('suffix table', () => {
  it('claims every sibling suffix of the formats it knows', () => {
    for (const extension of ['jpg', 'jpeg', 'jpe', 'jfif', 'tif', 'tiff', 'heic', 'heif', 'apng', 'svgz', 'icns', 'dng']) {
      expect(IMAGE_EXTENSIONS).toContain(extension)
    }
    expect(IMAGE_EXTENSIONS.length).toBeGreaterThan(40)
  })

  it('maps suffixes case-insensitively', () => {
    expect(formatForExtension('PNG')?.name).toBe('PNG')
    expect(formatForExtension('Tiff')?.name).toBe('TIFF')
    expect(formatForExtension('nope')).toBeUndefined()
  })
})
