/**
 * One page drawn at the section's own size.
 *
 * The page paints the document's own colours rather than the viewer's, so it
 * keeps a white sheet and black text regardless of the surrounding theme; only
 * the shadow and the frame around it come from the viewer. Headers and footers
 * sit inside the margins the section states; a story taller than its margin
 * pushes the body area down the way Word's layout does. The first page of a
 * section carries the section's own numbering start.
 */
import { memo, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { DocxBlock, DocxHeaderFooter, DocxHeaderFooterSet, DocxSection } from '../docx/model.ts'
import { BlockView, borderCulls, flowTopMargins } from './BlockView.tsx'
import type { PageContext } from './InlineView.tsx'
import { LineRatioContext } from './metrics.tsx'
import type { LineRatioOf } from './metrics.tsx'

/**
 * One paginated page: the section it belongs to, the blocks it holds, and the
 * number the page carries.
 */
export interface DocxPage {
  readonly section: DocxSection
  readonly blocks: readonly DocxBlock[]
  readonly displayNumber: number
}

/**
 * The header or footer a page kind uses.
 *
 * A missing story draws nothing: with `titlePg` Word leaves the first page
 * blank unless a first-page part exists, and with even/odd headers an even
 * page shows only the even part.
 * @param set - the section's headers or footers.
 * @param titlePage - whether the section gives its first page a separate story.
 * @param evenAndOdd - whether the document gives even pages a separate story.
 * @param pageNumber - the page's 1-based number in the document.
 * @returns the story this page draws, or undefined when none applies.
 */
function storyOf(
  set: DocxHeaderFooterSet,
  titlePage: boolean,
  evenAndOdd: boolean,
  pageNumber: number,
): DocxHeaderFooter | undefined {
  if (pageNumber === 1 && titlePage) return set.first
  if (evenAndOdd && pageNumber % 2 === 0) return set.even
  return set.default
}

/** How far a story must clear before the body area starts, in CSS pixels. */
const STORY_CLEARANCE_PX = 0

/**
 * One header or footer block with its story's own flow margins.
 * @param props - the block, its story's blocks, its position, and the page context.
 * @returns the block element.
 */
function HeaderFooterBlock({ block, blocks, index, pageContext }: {
  readonly block: DocxBlock
  readonly blocks: readonly DocxBlock[]
  readonly index: number
  readonly pageContext: PageContext
}): ReactNode {
  const margins = flowTopMargins(blocks, true)
  const culls = borderCulls(blocks)
  return <BlockView block={block} topMargin={margins[index] ?? 0} borderCull={culls[index]} pageContext={pageContext} />
}

/**
 * Draw one page.
 * @param props - the page, its number, the document's page count, the even/odd
 *   header setting, and the anchor follower.
 * @returns the page sheet with its header, body, and footer.
 */
function PageCanvasImpl({ page, pageNumber, pageCount, evenAndOdd, onFollowAnchor, lineRatioOf }: {
  readonly page: DocxPage
  readonly pageNumber: number
  readonly pageCount: number
  readonly evenAndOdd: boolean
  readonly onFollowAnchor?: (name: string) => void
  readonly lineRatioOf?: LineRatioOf
}): ReactNode {
  const { geometry, titlePage } = page.section
  const header = storyOf(page.section.headers, titlePage, evenAndOdd, pageNumber)
  const footer = storyOf(page.section.footers, titlePage, evenAndOdd, pageNumber)
  const pageContext: PageContext = { pageNumber: page.displayNumber, pageCount, onFollowAnchor }
  const margins = flowTopMargins(page.blocks, true)
  const bodyCulls = borderCulls(page.blocks)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const footerRef = useRef<HTMLDivElement | null>(null)
  const [growth, setGrowth] = useState({ top: 0, bottom: 0 })

  // Word grows the body area around a story taller than its margin, so the
  // body starts below the header and ends above the footer. The measurement
  // observes both stories, so font settling re-runs it.
  useLayoutEffect(() => {
    if (header === undefined && footer === undefined) return undefined
    const measure = (): void => {
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0
      const footerHeight = footerRef.current?.getBoundingClientRect().height ?? 0
      const top = Math.max(0, headerHeight === 0 ? 0 : geometry.headerPx + headerHeight + STORY_CLEARANCE_PX - geometry.marginTopPx)
      const bottom = Math.max(0, footerHeight === 0 ? 0 : geometry.footerPx + footerHeight + STORY_CLEARANCE_PX - geometry.marginBottomPx)
      setGrowth(previous => previous.top === top && previous.bottom === bottom ? previous : { top, bottom })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    if (headerRef.current !== null) observer.observe(headerRef.current)
    if (footerRef.current !== null) observer.observe(footerRef.current)
    return () => { observer.disconnect() }
  }, [header, footer, geometry])

  const observeHeader = useCallback((node: HTMLDivElement | null): void => { headerRef.current = node }, [])
  const observeFooter = useCallback((node: HTMLDivElement | null): void => { footerRef.current = node }, [])
  const margin = {
    left: `${geometry.marginLeftPx}px`,
    right: `${geometry.marginRightPx}px`,
  }
  return (
    <LineRatioContext.Provider value={lineRatioOf ?? DEFAULT_RATIO}>
      <div
        style={{
          position: 'relative',
          boxSizing: 'border-box',
          width: `${geometry.widthPx}px`,
          height: `${geometry.heightPx}px`,
          padding: `${geometry.marginTopPx + growth.top}px ${geometry.marginRightPx}px ${geometry.marginBottomPx + growth.bottom}px ${geometry.marginLeftPx}px`,
          overflow: 'hidden',
          color: '#000000',
          background: '#ffffff',
        }}
      >
        {header !== undefined && (
          <div ref={observeHeader} style={{ position: 'absolute', top: `${geometry.headerPx}px`, ...margin }}>
            {header.blocks.map((block, blockIndex) => (
              <HeaderFooterBlock key={blockIndex} block={block} blocks={header.blocks} index={blockIndex} pageContext={pageContext} />
            ))}
          </div>
        )}
        {page.blocks.map((block, blockIndex) => (
          <BlockView
            key={blockIndex}
            block={block}
            topMargin={margins[blockIndex] ?? 0}
            borderCull={bodyCulls[blockIndex]}
            pageContext={pageContext}
          />
        ))}
        {footer !== undefined && (
          <div ref={observeFooter} style={{ position: 'absolute', bottom: `${geometry.footerPx}px`, ...margin }}>
            {footer.blocks.map((block, blockIndex) => (
              <HeaderFooterBlock key={blockIndex} block={block} blocks={footer.blocks} index={blockIndex} pageContext={pageContext} />
            ))}
          </div>
        )}
      </div>
    </LineRatioContext.Provider>
  )
}

/** The reader a page falls back to when the body probed nothing. */
const DEFAULT_RATIO: LineRatioOf = () => 1

/** Memoized: a page's content never changes, so the parent's churn re-renders nothing. */
export const PageCanvas = memo(PageCanvasImpl)
