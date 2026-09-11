/**
 * Pure block pagination.
 *
 * A Word document flows, so a page break is a decision made after the blocks
 * are measured. This module owns that decision and nothing else: it takes the
 * measured content height of each block, the flow margin each block paints
 * above itself, and the height the page's body area offers, and returns the
 * blocks each page holds. Dividing an oversized block is delegated to the
 * caller's splitter, which owns the measurement a divide needs; this module
 * only decides when to ask and how the parts flow. Every rule here is
 * unit-testable with injected heights.
 */

/** The pagination facts one block contributes. */
export interface PaginationBlock {
  /** The block opens a new page. */
  readonly pageBreakBefore: boolean
  /** The block stays on the page its successor starts on. */
  readonly keepNext: boolean
}

/** One page: the blocks that flow on it, in order. */
type Page<B> = readonly B[]

/** The two halves an oversized block divides into, with their content heights. */
export interface BlockParts<B> {
  /** The half that closes the current page. */
  readonly head: B
  /** The half that opens the next page. */
  readonly tail: B
  readonly headHeight: number
  readonly tailHeight: number
}

/**
 * Split a section's blocks into pages.
 *
 * Explicit breaks always start a page. A block that would overflow divides
 * when the caller's splitter can divide it; otherwise it moves to the next
 * page, taking every preceding block that asked to stay with its successor, so
 * a `w:keepNext` chain is never torn. When the blocks carry no measured height
 * — before layout, or under any environment without real measurement — the
 * result is one page per explicit break, never an empty or unbounded page
 * list.
 * @param blocks - the section's blocks in flow order.
 * @param heights - each block's measured content height, or undefined when unmeasured.
 * @param margins - each block's combined flow top margin; one entry per block.
 * @param contentHeight - the height the blocks flow through; a non-positive value disables filling.
 * @param split - divides an oversized block, or undefined to always move whole.
 * @returns one array of blocks per page, in page order.
 */
export function paginateBlocks<B extends PaginationBlock>(
  blocks: readonly B[],
  heights: readonly (number | undefined)[],
  margins: readonly number[],
  contentHeight: number,
  split?: (block: B, available: number) => BlockParts<B> | undefined,
): readonly Page<B>[] {
  const limit = Number.isFinite(contentHeight) && contentHeight > 0 ? contentHeight : Number.POSITIVE_INFINITY
  const heightOf = (index: number): number => {
    const value = heights[index]
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0
  }
  const marginOf = (index: number): number => {
    const value = margins[index]
    return Number.isFinite(value) ? Math.max(0, value) : 0
  }
  const pages: Page<B>[] = []
  let current: { readonly block: B; readonly height: number }[] = []
  let used = 0

  const closePage = (page: readonly { readonly block: B }[]): void => {
    pages.push(page.map(entry => entry.block))
  }
  // Move whole blocks to the next page, honouring the keepNext chain, and
  // place at least one block even when it fills no better than overflowing.
  const startFresh = (): void => {
    if (current.length === 0) return
    let cut = current.length
    while (cut > 0 && current[cut - 1].block.keepNext) cut -= 1
    // A whole page that must stay together still breaks: an empty page would
    // be worse than the torn chain the document asked to avoid.
    if (cut === 0) cut = current.length
    closePage(current.slice(0, cut))
    current = current.slice(cut)
    used = current.reduce((total, entry) => total + entry.height, 0)
  }

  for (const [index, original] of blocks.entries()) {
    let block = original
    let height = heightOf(index)
    let margin = marginOf(index)
    if (block.pageBreakBefore && current.length > 0) {
      closePage(current)
      current = []
      used = 0
    }
    for (;;) {
      // Fits alongside the current content: place it.
      if (used + margin + height <= limit) {
        current.push({ block, height: margin + height })
        used += margin + height
        break
      }
      // Overflow: a divide closes this page and lets the tail compete on the
      // fresh one, so a block spanning several pages keeps dividing.
      const available = limit - used
      if (split !== undefined && available - margin > 0) {
        const parts = split(block, available - margin)
        if (parts !== undefined) {
          current.push({ block: parts.head, height: margin + parts.headHeight })
          closePage(current)
          current = []
          used = 0
          block = parts.tail
          height = parts.tailHeight
          margin = 0
          continue
        }
      }
      // A keep-next promise outranks a clean page edge: the chain moves once,
      // and a page it cannot hold still breaks rather than looping.
      startFresh()
      current.push({ block, height: margin + height })
      used += margin + height
      break
    }
  }
  if (current.length > 0 || pages.length === 0) closePage(current)
  return pages
}
