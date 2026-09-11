/** Block pagination: explicit breaks, measured overflow, keep-next chains, divides, and degenerate heights. */
import { describe, expect, it } from 'vitest'
import { paginateBlocks } from '../src/client/docx/paginate.ts'
import type { BlockParts } from '../src/client/docx/paginate.ts'
import type { PaginationBlock } from '../src/client/docx/paginate.ts'

/**
 * Build the pagination facts for a block list.
 * @param breaks - the index of each block that opens a page.
 * @param keeps - the index of each block that must stay with its successor.
 * @param count - how many blocks to build.
 * @returns one entry per block.
 */
function blocks(count: number, breaks: readonly number[] = [], keeps: readonly number[] = []): PaginationBlock[] {
  return Array.from({ length: count }, (_unused, index) => ({
    pageBreakBefore: breaks.includes(index),
    keepNext: keeps.includes(index),
  }))
}

/**
 * Run pagination and read the pages back as index lists.
 * @param pages - the pages paginateBlocks returned.
 * @param order - the block list they came from.
 * @returns one index list per page.
 */
function indices(pages: readonly (readonly PaginationBlock[])[], order: readonly PaginationBlock[]): readonly number[][] {
  return pages.map(page => page.map(block => order.indexOf(block)))
}

describe('paginateBlocks', () => {
  it('returns one page per explicit break when nothing is measured', () => {
    const order = blocks(5, [2])
    expect(indices(paginateBlocks(order, [], [], 800), order)).toEqual([[0, 1], [2, 3, 4]])
    const leading = blocks(5, [0, 3])
    expect(indices(paginateBlocks(leading, [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], 800), leading)).toEqual([[0, 1, 2], [3, 4]])
    const plain = blocks(3)
    expect(indices(paginateBlocks(plain, [0, 0, 0], [0, 0, 0], 800), plain)).toEqual([[0, 1, 2]])
  })

  it('never returns an empty page list', () => {
    expect(paginateBlocks([], [], [], 800)).toEqual([[]])
    expect(paginateBlocks([], [], [], 0)).toEqual([[]])
  })

  it('fills pages from the measured heights', () => {
    const order = blocks(5)
    const heights = [400, 400, 400, 400, 400]
    expect(indices(paginateBlocks(order, heights, [0, 0, 0, 0, 0], 900), order)).toEqual([[0, 1], [2, 3], [4]])
    // A block taller than the page still gets a page of its own.
    const tall = blocks(2)
    expect(indices(paginateBlocks(tall, [2000, 10], [0, 0], 900), tall)).toEqual([[0], [1]])
  })

  it('charges the flow margin above each block against the page', () => {
    const order = blocks(3)
    // 400 + (100 margin + 400) fits 900 exactly; one pixel less breaks.
    expect(indices(paginateBlocks(order, [400, 400, 400], [0, 100, 0], 900), order)).toEqual([[0, 1], [2]])
    expect(indices(paginateBlocks(order, [400, 400, 400], [0, 100, 0], 899), order)).toEqual([[0], [1], [2]])
  })

  it('treats an unmeasured block as zero height', () => {
    const order = blocks(3)
    expect(indices(paginateBlocks(order, [800, undefined, 800], [0, 0, 0], 900), order)).toEqual([[0, 1], [2]])
  })

  it('keeps a keep-next chain with its successor', () => {
    const chained = blocks(4, [], [1])
    expect(indices(paginateBlocks(chained, [100, 400, 400, 100], [0, 0, 0, 0], 550), chained)).toEqual([[0], [1, 2], [3]])
    // A chain the page cannot hold moves as far as it can before breaking.
    const tight = blocks(3, [], [1])
    expect(indices(paginateBlocks(tight, [100, 400, 400], [0, 0, 0], 600), tight)).toEqual([[0], [1, 2]])
  })

  it('breaks a wholly keep-next page rather than emitting an empty one', () => {
    const order = blocks(2, [], [0, 1])
    expect(indices(paginateBlocks(order, [400, 400], [0, 0], 500), order)).toEqual([[0], [1]])
  })

  it('keeps dividing a tail that still overflows its fresh page', () => {
    // A 2200px block on 900px pages: two divides, then the remainder fits.
    let remaining = 2200
    const split = (_block: PaginationBlock, available: number) => {
      const headHeight = Math.min(available, remaining - 300)
      if (headHeight <= 0 || remaining - headHeight <= 0) return undefined
      const tail = { pageBreakBefore: false, keepNext: false }
      remaining -= headHeight
      return { head: { pageBreakBefore: false, keepNext: false }, tail, headHeight, tailHeight: remaining }
    }
    const pages = paginateBlocks([{
      pageBreakBefore: false,
      keepNext: false,
    }], [2200], [0], 900, split)
    expect(pages).toHaveLength(3)
    // Every placed piece is a distinct head or the final remainder: nothing
    // lost, nothing duplicated.
    const placed = pages.flat().length
    expect(placed).toBe(3)
  })

  it('divides an oversized block when the splitter can', () => {
    const order = blocks(2)
    const heights = [600, 600]
    const split = (block: PaginationBlock, available: number): BlockParts<PaginationBlock> | undefined => {
      if (available < 300) return undefined
      return { head: { ...block, keepNext: true }, tail: block, headHeight: available, tailHeight: 600 - available }
    }
    const pages = paginateBlocks(order, heights, [0, 0], 900, split)
    expect(pages).toHaveLength(2)
    // The head closes the first page beside the whole first block.
    expect(pages[0][0]).toBe(order[0])
    expect(pages[0][1]).not.toBe(order[1])
    expect(pages[0][1].keepNext).toBe(true)
    // The tail opens the next page.
    expect(pages[1]).toEqual([order[1]])
  })

  it('ignores filling when the content height is not positive', () => {
    const order = blocks(3)
    expect(indices(paginateBlocks(order, [400, 400, 400], [0, 0, 0], 0), order)).toEqual([[0, 1, 2]])
    expect(indices(paginateBlocks(order, [400, 400, 400], [0, 0, 0], Number.NaN), order)).toEqual([[0, 1, 2]])
  })

  it('ignores a leading page break and trailing heights', () => {
    const leading = blocks(2, [0])
    expect(indices(paginateBlocks(leading, [400, 400], [0, 0], 900), leading)).toEqual([[0, 1]])
    const heights = blocks(2)
    expect(indices(paginateBlocks(heights, [Number.NaN, -5], [Number.NaN, Number.NaN], 900), heights)).toEqual([[0, 1]])
  })
})
