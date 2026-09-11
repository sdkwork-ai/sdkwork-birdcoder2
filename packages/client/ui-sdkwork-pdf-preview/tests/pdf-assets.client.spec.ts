/** Bundled PDF.js resources: base64 decoding, cache copies, and loud misses. */
import { describe, expect, it, vi } from 'vitest'
import { createPdfAssetFactory } from '../src/client/pdf/assets.ts'
import type { PdfAssetMap } from '../src/client/pdf/assets.ts'

const TABLE: PdfAssetMap = {
  cMapUrl: { 'UniGB-UCS2-H': 'aGVsbG8=' },
  standardFontDataUrl: {},
  wasmUrl: {},
}

describe('createPdfAssetFactory', () => {
  it('decodes an inlined resource into bytes', async () => {
    const factory = createPdfAssetFactory(TABLE)
    const fetched = await new factory().fetch({ kind: 'cMapUrl', filename: 'UniGB-UCS2-H' })
    expect(Array.from(fetched)).toEqual([104, 101, 108, 108, 111])
  })

  it('reads the build-injected table by default', async () => {
    vi.stubGlobal('__SDKWORK_PDFJS_ASSETS__', TABLE)
    const factory = createPdfAssetFactory()
    const fetched = await new factory().fetch({ kind: 'cMapUrl', filename: 'UniGB-UCS2-H' })
    expect(fetched[0]).toBe(104)
    vi.unstubAllGlobals()
  })

  it('decodes once per resource and hands out copies', async () => {
    const assets = { cMapUrl: { 'x.fst': 'aGVsbG8=' }, standardFontDataUrl: {}, wasmUrl: {} }
    const decode = vi.spyOn(globalThis, 'atob')
    const factory = createPdfAssetFactory(assets)
    const instance = new factory()
    const first = await instance.fetch({ kind: 'cMapUrl', filename: 'x.fst' })
    const second = await instance.fetch({ kind: 'cMapUrl', filename: 'x.fst' })
    expect(decode).toHaveBeenCalledTimes(1)
    expect(second).not.toBe(first)
    first.fill(0)
    expect(second[0]).toBe(104)
    decode.mockRestore()
  })

  it('fails loud for a resource the build did not inline', async () => {
    const factory = createPdfAssetFactory(TABLE)
    await expect(new factory().fetch({ kind: 'wasmUrl', filename: 'missing.wasm' }))
      .rejects.toThrow('PDF.js asset is not bundled: wasmUrl/missing.wasm')
  })
})
