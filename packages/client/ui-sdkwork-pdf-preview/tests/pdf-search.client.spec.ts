/** Find-in-document: lazy text index, matching, and highlight geometry. */
import { describe, expect, it, vi } from 'vitest'
import { PdfTextIndex, matchRect } from '../src/client/pdf/search.ts'
import type { PdfTextItem } from '../src/client/pdf/search.ts'

/** A fake open document whose pages carry the given items; non-text items are filtered. */
function fakeDocument(pages: readonly (readonly unknown[])[]): {
  numPages: number
  getPage: ReturnType<typeof vi.fn>
} {
  const getPage = vi.fn(async (page: number) => ({
    getTextContent: async () => ({ items: pages[page - 1] ?? [] }),
  }))
  return { numPages: pages.length, getPage }
}

function run(str: string): PdfTextItem {
  return { str, transform: [10, 0, 0, 10, 0, 100], width: str.length * 10, height: 10 }
}

describe('PdfTextIndex', () => {
  it('finds matches across pages, case-insensitively, in reading order', async () => {
    const document = fakeDocument([[run('Alpha first')], [run('beta'), run('ALPHA second')]])
    const index = new PdfTextIndex(document as never)
    const matches = await index.find('alpha', new AbortController().signal)
    expect(matches).toEqual([
      { page: 1, item: 0, start: 0, end: 5 },
      { page: 2, item: 1, start: 0, end: 5 },
    ])
  })

  it('locates a match inside one item among many on the same page', async () => {
    const document = fakeDocument([[run('one'), run('two'), run('find me three')]])
    const index = new PdfTextIndex(document as never)
    const matches = await index.find('me', new AbortController().signal)
    expect(matches).toEqual([{ page: 1, item: 2, start: 5, end: 7 }])
  })

  it('locates a match in the first item while later items exist', async () => {
    const document = fakeDocument([[run('alpha'), run('beta'), run('gamma')]])
    const index = new PdfTextIndex(document as never)
    expect(await index.find('alpha', new AbortController().signal)).toEqual([
      { page: 1, item: 0, start: 0, end: 5 },
    ])
  })

  it('clamps a match that runs past its item to that item', async () => {
    // 'beta' spans the first item's tail and the second item's head.
    const document = fakeDocument([[run('alpha'), run('beta')]])
    const index = new PdfTextIndex(document as never)
    const matches = await index.find('abeta', new AbortController().signal)
    expect(matches).toEqual([{ page: 1, item: 0, start: 4, end: 5 }])
  })

  it('skips marked-content entries that carry no text', async () => {
    // After filtering, 'after' is the second surviving run.
    const document = fakeDocument([[run('before'), { type: 'beginMarkedContent' }, run('after')]])
    const index = new PdfTextIndex(document as never)
    expect(await index.find('after', new AbortController().signal)).toEqual([
      { page: 1, item: 1, start: 0, end: 5 },
    ])
  })

  it('finds nothing for an empty query or absent text', async () => {
    const document = fakeDocument([[run('words')]])
    const index = new PdfTextIndex(document as never)
    expect(await index.find('', new AbortController().signal)).toEqual([])
    expect(await index.find('missing', new AbortController().signal)).toEqual([])
  })

  it('rejects when the scan is aborted between pages', async () => {
    const document = fakeDocument([[run('a')], [run('b')], [run('c')]])
    const index = new PdfTextIndex(document as never)
    const controller = new AbortController()
    const pending = index.find('a', controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow()
  })

  it('caches each page read across scans', async () => {
    const document = fakeDocument([[run('one')], [run('two')]])
    const index = new PdfTextIndex(document as never)
    const signal = new AbortController().signal
    await index.find('one', signal)
    await index.find('two', signal)
    await index.items(1, signal)
    expect(document.getPage).toHaveBeenCalledTimes(2)
  })
})

describe('matchRect', () => {
  const item: PdfTextItem = { str: 'alpha', transform: [12, 0, 0, 12, 72, 700], width: 60, height: 12 }

  it('maps a fractional run through an identity viewport', () => {
    const rect = matchRect([1, 0, 0, 1, 0, 0], item, 0, 2)
    // Two fifths of a 60px run starting at x=72; the band rises one ascent above the baseline.
    expect(rect).toEqual({ left: 72, top: 688, width: 24, height: 12 })
  })

  it('maps through rotation and translation like a turned page', () => {
    // A 90°-turned viewport swaps the band's length and height around the
    // turned origin: corner (72,700) lands at (92,72), (132,688) at (104,132).
    const rect = matchRect([0, 1, -1, 0, 792, 0], item, 0, 5)
    expect(rect).toEqual({ left: 92, top: 72, width: 12, height: 60 })
  })

  it('yields a degenerate band for an empty run', () => {
    const empty: PdfTextItem = { str: '', transform: [12, 0, 0, 12, 0, 0], width: 0, height: 12 }
    expect(matchRect([1, 0, 0, 1, 0, 0], empty, 0, 5)).toEqual({ left: 0, top: -12, width: 0, height: 12 })
  })
})
