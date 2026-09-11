/**
 * Find-in-document: lazy per-page text indexing, query matching, and the
 * highlight geometry for the page canvas.
 *
 * The index reads each page's text content once and caches it, so repeated
 * queries pay one worker round-trip per unseen page. Matches are located in
 * the concatenated item text; a match that spans items highlights the item
 * that contains its first character. Highlight rectangles map a match's
 * fractional run through the page's viewport transform, which stays exact for
 * the 90° rotations this viewer supports.
 */
import type { PdfDocument } from './runtime.ts'

/** One text run as the search and highlight layers consume it. */
export interface PdfTextItem {
  readonly str: string
  readonly transform: readonly number[]
  readonly width: number
  readonly height: number
}

/** One located match: page, item index, and character range inside the item. */
export interface PdfMatch {
  readonly page: number
  readonly item: number
  readonly start: number
  readonly end: number
}

/** One highlight band in viewport CSS pixels. */
export interface PdfRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/**
 * Map a matched character range to a highlight band.
 * @param viewportTransform - the render viewport's user-to-viewport matrix.
 * @param item - the matched text run.
 * @param start - first matched character inside the item.
 * @param end - one past the last matched character.
 * @returns the band in viewport CSS pixels.
 */
export function matchRect(
  viewportTransform: readonly number[],
  item: PdfTextItem,
  start: number,
  end: number,
): PdfRect {
  const [, , , , e, f] = item.transform
  const total = item.str.length || 1
  const x0 = e + (start / total) * item.width
  const x1 = e + (end / total) * item.width
  // Text is horizontal in user space; the band's corners are the run's
  // baseline ends and the ascent line above them.
  const corner = (x: number, y: number): [number, number] => [
    viewportTransform[0] * x + viewportTransform[2] * y + viewportTransform[4],
    viewportTransform[1] * x + viewportTransform[3] * y + viewportTransform[5],
  ]
  const [ax, ay] = corner(x0, f)
  const [bx, by] = corner(x1, f - item.height)
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  }
}

/** Lazily indexed text content for one open document. */
export class PdfTextIndex {
  /** The open document this index reads from. */
  readonly #document: PdfDocument
  /** Text runs by page, filled on demand; one worker round-trip per page. */
  readonly #cache = new Map<number, readonly PdfTextItem[]>()

  constructor(document: PdfDocument) {
    this.#document = document
  }

  /**
   * Read a page's text runs, through the cache.
   * @param page - 1-based page number.
   * @param signal - scan lifetime.
   * @returns the page's text runs; read failures propagate.
   */
  async items(page: number, signal: AbortSignal): Promise<readonly PdfTextItem[]> {
    const cached = this.#cache.get(page)
    if (cached !== undefined) return cached
    signal.throwIfAborted()
    const content = await this.#document.getPage(page).then(loaded => loaded.getTextContent())
    const items: PdfTextItem[] = []
    for (const item of content.items) {
      if ('str' in item) {
        items.push({ str: item.str, transform: item.transform, width: item.width, height: item.height })
      }
    }
    this.#cache.set(page, items)
    return items
  }

  /**
   * Scan every page for the query, case-insensitively.
   * @param query - the text to find; empty finds nothing.
   * @param signal - scan lifetime; an aborted scan rejects.
   * @returns matches in reading order across pages.
   */
  async find(query: string, signal: AbortSignal): Promise<readonly PdfMatch[]> {
    const needle = query.toLowerCase()
    if (needle === '') return []
    const matches: PdfMatch[] = []
    for (let page = 1; page <= this.#document.numPages; page++) {
      signal.throwIfAborted()
      const items = await this.items(page, signal)
      const starts: number[] = []
      let text = ''
      for (const item of items) {
        starts.push(text.length)
        text += item.str.toLowerCase()
      }
      let from = 0
      for (;;) {
        const hit = text.indexOf(needle, from)
        if (hit === -1) break
        from = hit + 1
        let owner = 0
        for (let index = starts.length - 1; index >= 0; index--) {
          if (starts[index] <= hit) {
            owner = index
            break
          }
        }
        matches.push({
          page,
          item: owner,
          start: hit - starts[owner],
          end: Math.min(hit - starts[owner] + needle.length, items[owner].str.length),
        })
      }
    }
    return matches
  }
}
