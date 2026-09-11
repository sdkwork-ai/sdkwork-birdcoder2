/**
 * DOM measurement for flowing pagination.
 *
 * Pagination needs to know where a block's lines or rows fall to divide it at
 * a page boundary; only the laid-out DOM knows. The analyzers here map one
 * block element to line boxes or row heights, and the splitter callbacks in
 * the body turn those maps into the two models a divide produces. Positions
 * are relative to the block's own content top so a map survives being re-based
 * onto a continuation.
 */
import type { ParagraphSplitPoint } from '../docx/split.ts'

/** The line structure of one laid-out paragraph. */
export interface ParagraphLineMap {
  /** Bottom of each line box, in CSS pixels below the paragraph's content top. */
  readonly lineBottoms: readonly number[]
  /** The inline position each line starts at; one entry per line. */
  readonly lineStarts: readonly ParagraphSplitPoint[]
  /** The paragraph's full content height, margins excluded. */
  readonly contentHeight: number
}

/** The row structure of one laid-out table. */
export interface TableRowMap {
  /** Top of each row, in CSS pixels below the table's content top. */
  readonly rowTops: readonly number[]
  /** The table's full content height, margins excluded. */
  readonly contentHeight: number
}

/** Tolerance that keeps sub-pixel line positions in one group. */
const LINE_EPSILON_PX = 2

/**
 * The element a paragraph's inlines render into.
 * @param element - the block element.
 * @returns the content container.
 */
function contentRootOf(element: Element): Element {
  return element.querySelector(':scope > [data-docx-content]') ?? element
}

/**
 * The boxes one inline element paints, per line it touches.
 *
 * A text run's range yields one box per line; an empty inline such as a tab
 * or a break yields none from its contents, so the element's own box is used.
 * @param child - the inline element.
 * @returns the client rects, top first.
 */
function boxesOf(child: Element): readonly DOMRect[] {
  const range = document.createRange()
  // Environments without layout, such as jsdom, grow no boxes at all; a block
  // then analyses to nothing and pagination moves it whole.
  if (typeof range.getClientRects !== 'function') return []
  range.selectNodeContents(child)
  const rects = [...range.getClientRects()]
  if (rects.length > 0) return rects
  range.selectNode(child)
  return [...range.getClientRects()]
}

/**
 * The first character of a text element that sits on a line.
 * @param element - the inline element holding one text node.
 * @param top - the line's y position to match.
 * @returns the character offset, or 0 when no character matches.
 */
function firstCharOnLine(element: Element, top: number): number {
  const node = element.firstChild
  if (node === null || node.nodeType !== Node.TEXT_NODE) return 0
  const text = node.textContent ?? ''
  const range = document.createRange()
  if (typeof range.getClientRects !== 'function') return 0
  for (let offset = 0; offset < text.length; offset += 1) {
    range.setStart(node, offset)
    range.setEnd(node, offset + 1)
    const rect = range.getClientRects().item(0)
    if (rect !== null && Math.abs(rect.top - top) < LINE_EPSILON_PX) return offset
  }
  return 0
}

/**
 * Map one laid-out paragraph to its line boxes and where each line starts.
 * @param element - the block element the paragraph rendered into.
 * @returns the line map, or undefined when the paragraph paints no line.
 */
export function analyzeParagraph(element: Element): ParagraphLineMap | undefined {
  const root = contentRootOf(element)
  const children = [...root.children]
  if (children.length === 0) return undefined
  const rootTop = root.getBoundingClientRect().top
  const tops: number[] = []
  const bottoms: number[] = []
  const starts: ParagraphSplitPoint[] = []
  for (const [index, child] of children.entries()) {
    for (const rect of boxesOf(child)) {
      const top = rect.top - rootTop
      const line = tops.findIndex(existing => Math.abs(existing - top) < LINE_EPSILON_PX)
      if (line === -1) {
        tops.push(top)
        bottoms.push(rect.bottom - rootTop)
        starts.push({ inlineIndex: index, charOffset: firstCharOnLine(child, rect.top) })
      } else {
        bottoms[line] = Math.max(bottoms[line], rect.bottom - rootTop)
      }
    }
  }
  if (tops.length === 0) return undefined
  return {
    lineBottoms: bottoms,
    lineStarts: starts,
    contentHeight: bottoms.length === 0 ? 0 : Math.max(...bottoms),
  }
}

/**
 * Map one laid-out table to its row positions.
 * @param element - the table element.
 * @returns the row map, or undefined when the table draws no row.
 */
export function analyzeTable(element: Element): TableRowMap | undefined {
  const rows = [...element.querySelectorAll(':scope > tbody > tr, :scope > tr')]
  if (rows.length === 0) return undefined
  const tableTop = element.getBoundingClientRect().top
  const rowTops = rows.map(row => row.getBoundingClientRect().top - tableTop)
  return {
    rowTops,
    contentHeight: element.getBoundingClientRect().height,
  }
}

/** Natural line-height ratios already probed, keyed by CSS font-family list. */
const ratioCache = new Map<string, number>()

/** Probe font size the ratio is measured at, in CSS pixels. */
const RATIO_PROBE_PX = 100

/**
 * A font's natural line-height ratio: the height one line occupies with
 * `line-height: normal`, per em.
 *
 * Word's multiple line spacing multiplies this natural height, not the font
 * size, so a paragraph that asks for 1.15 lines renders 1.15 of whatever the
 * typeface needs. The probe runs once per font and reuses the answer; an
 * environment without layout reports 1, which keeps unitless CSS behaviour.
 * @param fontFamily - the CSS font-family list to probe.
 * @returns the ratio, or 1 when it cannot be measured.
 */
export function naturalLineRatio(fontFamily: string): number {
  const cached = ratioCache.get(fontFamily)
  if (cached !== undefined) return cached
  if (typeof document === 'undefined') return 1
  const probe = document.createElement('span')
  probe.textContent = '测试Test 0'
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.fontFamily = fontFamily
  probe.style.fontSize = `${RATIO_PROBE_PX}px`
  probe.style.lineHeight = 'normal'
  probe.style.whiteSpace = 'nowrap'
  document.body.append(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  const ratio = height > 0 ? height / RATIO_PROBE_PX : 1
  ratioCache.set(fontFamily, ratio)
  return ratio
}
