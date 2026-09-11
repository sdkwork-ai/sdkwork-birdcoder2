/**
 * Build-owned, same-version PDF.js resources.
 *
 * PDF.js asks for character maps, standard font programs, and its image
 * decoder through a factory it calls at parse time. A preview that must work
 * offline answers those requests from the table this package's build inlined,
 * so no request can leave the browser and no asset can drift from the
 * worker's version. A CJK document requests the same cMap many times, so each
 * factory instance decodes a resource once and hands out copies.
 */

/** Resource kinds this build inlines. */
export type PdfAssetKind = 'cMapUrl' | 'standardFontDataUrl' | 'wasmUrl'

/** Original filenames mapped to base64, in the same PDF.js version as the worker. */
export type PdfAssetMap = Readonly<Record<PdfAssetKind, Readonly<Record<string, string | undefined>>>>

declare global {
  /** Inline artifact data supplied by the package-local build configuration. */
  const __SDKWORK_PDFJS_ASSETS__: PdfAssetMap
}

/** The single method PDF.js calls on the factory it is handed. */
export interface PdfAssetFactory {
  /**
   * @param request - the resource kind and its exact filename.
   * @returns the resource bytes, copied out of the decoded cache.
   */
  fetch(request: { readonly kind: PdfAssetKind; readonly filename: string }): Promise<Uint8Array>
}

/**
 * Decode the inlined base64 table into a factory PDF.js can call.
 * @param assets - this build's assets; the injected table by default.
 * @returns a constructor PDF.js instantiates once per document.
 */
export function createPdfAssetFactory(assets: PdfAssetMap = __SDKWORK_PDFJS_ASSETS__): new () => PdfAssetFactory {
  return class BundledPdfAssets implements PdfAssetFactory {
    /** Decoded resources by `kind/filename`; PDF.js may keep what it receives. */
    readonly #decoded = new Map<string, Uint8Array>()

    fetch(request: { readonly kind: PdfAssetKind; readonly filename: string }): Promise<Uint8Array> {
      const key = `${request.kind}/${request.filename}`
      return Promise.resolve().then(() => {
        let decoded = this.#decoded.get(key)
        if (decoded === undefined) {
          const data = assets[request.kind][request.filename]
          if (data === undefined) throw new Error(`PDF.js asset is not bundled: ${key}`)
          decoded = Uint8Array.from(atob(data), character => character.charCodeAt(0))
          this.#decoded.set(key, decoded)
        }
        // PDF.js may retain or transfer what it receives; a copy keeps the
        // cached bytes reusable for the next request.
        return decoded.slice()
      })
    }
  }
}
