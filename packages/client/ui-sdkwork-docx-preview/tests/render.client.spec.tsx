// @vitest-environment jsdom
/** Page presentation: paragraphs, numbered markers, inline nodes, tables, and section stories. */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BlockView } from '../src/client/render/BlockView.tsx'
import { InlineView } from '../src/client/render/InlineView.tsx'
import { PageCanvas } from '../src/client/render/PageCanvas.tsx'
import { TableView } from '../src/client/render/TableView.tsx'
import type { PageContext } from '../src/client/render/InlineView.tsx'
import type {
  DocxBlock, DocxInline, DocxParagraph, DocxSection, DocxTable, DocxTextStyle,
} from '../src/client/docx/model.ts'

/** The page every component spec draws against. */
const PAGE_CONTEXT: PageContext = { pageNumber: 2, pageCount: 5 }

/**
 * A text style with every property stated.
 * @param overrides - the properties this spec changes.
 * @returns the complete style.
 */
function style(overrides: Partial<DocxTextStyle> = {}): DocxTextStyle {
  return {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    caps: false,
    smallCaps: false,
    sizePx: 16,
    fontFamily: '"Calibri", sans-serif',
    letterSpacingPx: 0,
    ...overrides,
  }
}

/**
 * A paragraph with every property stated.
 * @param overrides - the properties this spec changes.
 * @returns the complete paragraph.
 */
function paragraph(overrides: Partial<DocxParagraph> = {}): DocxParagraph {
  return {
    kind: 'paragraph',
    align: 'left',
    bidi: false,
    indentLeftPx: 0,
    indentRightPx: 0,
    textIndentPx: 0,
    spaceBeforePx: 0,
    spaceAfterPx: 0,
    borders: {},
    keepNext: false,
    keepLines: false,
    mark: style(),
    pageBreakBefore: false,
    inlines: [{ kind: 'text', text: '正文', style: style() }],
    ...overrides,
  }
}

/**
 * A table with every property stated.
 * @param overrides - the properties this spec changes.
 * @returns the complete table.
 */
function table(overrides: Partial<DocxTable> = {}): DocxTable {
  return {
    kind: 'table',
    pageBreakBefore: false,
    keepNext: false,
    indentPx: 0,
    fixedLayout: true,
    columns: [100, 100],
    rows: [{
      header: false,
      cantSplit: false,
      cells: [
        {
          colSpan: 1,
          rowSpan: 1,
          widthPx: 100,
          borders: {},
          verticalAlign: 'top',
          blocks: [paragraph()],
        },
        {
          colSpan: 1,
          rowSpan: 2,
          widthPx: 100,
          borders: { bottom: { widthPx: 2, style: 'dashed', color: '#FF0000' } },
          shading: '#D9E2F3',
          verticalAlign: 'bottom',
          blocks: [],
        },
      ],
    }],
    borders: { top: { widthPx: 1, style: 'solid', color: '#000000' } },
    cellMargin: { top: 1, left: 2, bottom: 3, right: 4 },
    align: 'center',
    ...overrides,
  }
}

/**
 * A section with every property stated.
 * @param overrides - the properties this spec changes.
 * @returns the complete section.
 */
function section(overrides: Partial<DocxSection> = {}): DocxSection {
  return {
    geometry: {
      widthPx: 816,
      heightPx: 1056,
      marginTopPx: 96,
      marginRightPx: 96,
      marginBottomPx: 96,
      marginLeftPx: 96,
      headerPx: 48,
      footerPx: 48,
      contentWidthPx: 624,
      contentHeightPx: 864,
    },
    titlePage: false,
    headers: {},
    footers: {},
    blocks: [],
    ...overrides,
  }
}

/** A text inline with the given content. */
function text(value: string, overrides: Partial<Extract<DocxInline, { kind: 'text' }>> = {}): DocxInline {
  return { kind: 'text', text: value, style: style(), ...overrides }
}

describe('BlockView', () => {
  afterEach(cleanup)

  it('paints a paragraph indents, spacing, borders, and shading', () => {
    const { container } = render(
      <BlockView
        block={paragraph({
          align: 'justify',
          indentLeftPx: 24,
          indentRightPx: 12,
          textIndentPx: -8,
          spaceBeforePx: 6,
          spaceAfterPx: 4,
          lineMultiple: 1.5,
          shading: '#FFF2CC',
          borders: { bottom: { widthPx: 1, style: 'solid', color: '#FF0000' } },
        })}
        topMargin={6}
        pageContext={PAGE_CONTEXT}
      />,
    )
    const element = container.firstElementChild as HTMLElement
    expect(element.hasAttribute('data-docx-block')).toBe(true)
    expect(element.style.marginLeft).toBe('24px')
    expect(element.style.marginRight).toBe('12px')
    // The flow margin arrives precomputed, so the element paints no bottom
    // margin and the next block's top margin carries the gap.
    expect(element.style.marginTop).toBe('6px')
    expect(element.style.marginBottom).toBe('0px')
    expect(element.style.textAlign).toBe('justify')
    expect(element.style.textIndent).toBe('-8px')
    expect(element.style.lineHeight).toBe(`${1.5 * 16}px`)
    expect(element.style.borderBottom).toBe('1px solid rgb(255, 0, 0)')
    expect(element.style.background).toBe('rgb(255, 242, 204)')
    expect(element.textContent).toBe('正文')
  })

  it('hangs a marker in the space the indent gives it', () => {
    const { container } = render(
      <BlockView
        block={paragraph({
          indentLeftPx: 48,
          textIndentPx: -24,
          marker: {
            text: '1.',
            suffix: ' ',
            indentPx: 24,
            style: style({ bold: true }),
          },
        })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    const element = container.firstElementChild as HTMLElement
    // The text edge stays at the indent; the marker sits in the hanging area.
    expect(element.style.marginLeft).toBe('24px')
    expect(element.style.textIndent).toBe('')
    const marker = element.querySelector('span > span') as HTMLElement
    expect(marker.style.width).toBe('24px')
    expect(marker.style.textAlign).toBe('right')
    expect(marker.textContent).toBe('1. ')
  })

  it('pads a tab-suffixed marker and keeps an empty paragraph on its own line', () => {
    const tabbed = render(
      <BlockView
        block={paragraph({
          marker: { text: '•', suffix: 'tab', indentPx: 24, style: style() },
        })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    const marker = tabbed.container.querySelector('span > span') as HTMLElement
    expect(marker.style.paddingRight).toBe('4px')
    tabbed.unmount()

    const empty = render(<BlockView block={paragraph({ inlines: [] })} topMargin={0} pageContext={PAGE_CONTEXT} />)
    expect(empty.container.textContent).toBe('\u200b')
  })
})

describe('InlineView', () => {
  afterEach(cleanup)

  it('draws text, links, breaks, tabs, and unsupported objects', () => {
    const { container } = render(
      <div>
        <InlineView inline={text('plain')} pageContext={PAGE_CONTEXT} />
        <InlineView inline={text('link', { link: 'https://example.com/a' })} pageContext={PAGE_CONTEXT} />
        <InlineView inline={{ kind: 'break' }} pageContext={PAGE_CONTEXT} />
        <InlineView inline={{ kind: 'tab', style: style() }} pageContext={PAGE_CONTEXT} />
        <InlineView inline={{ kind: 'unsupported', text: 'object', style: style() }} pageContext={PAGE_CONTEXT} />
      </div>,
    )
    const anchor = container.querySelector('a') as HTMLAnchorElement
    expect(anchor.getAttribute('href')).toBe('https://example.com/a')
    expect(container.querySelectorAll('br')).toHaveLength(1)
    // Children of the row, in order: the plain run, the anchor, the break, the tab, the object.
    const row = container.firstElementChild as HTMLElement
    const tab = row.children[3] as HTMLElement
    expect(tab.style.width).toBe('48px')
    const unsupported = row.children[4] as HTMLElement
    expect(unsupported.style.border).toContain('dashed')
    expect(unsupported.textContent).toBe('object')
  })

  it('substitutes the page fields from the page being drawn', () => {
    const { container } = render(
      <div>
        <InlineView inline={{ kind: 'field', field: 'page', style: style() }} pageContext={PAGE_CONTEXT} />
        <InlineView inline={{ kind: 'field', field: 'pageCount', style: style() }} pageContext={PAGE_CONTEXT} />
      </div>,
    )
    const fields = Array.from(container.querySelectorAll('span')) as HTMLElement[]
    expect(fields.map(field => field.textContent)).toEqual(['2', '5'])
  })

  it('scales a cropped picture so the visible region fills its frame', () => {
    const { container } = render(
      <InlineView
        inline={{
          kind: 'image',
          image: {
            src: 'blob:docx/1',
            widthPx: 200,
            heightPx: 100,
            rotation: 90,
            flipH: true,
            flipV: false,
            crop: { left: 0.1, top: 0.2, right: 0.1, bottom: 0.2 },
          },
        }}
        pageContext={PAGE_CONTEXT}
      />,
    )
    const frame = container.firstElementChild as HTMLElement
    expect(frame.style.width).toBe('200px')
    expect(frame.style.overflow).toBe('hidden')
    expect(frame.style.transform).toBe('rotate(90deg) scaleX(-1)')
    const image = frame.querySelector('img') as HTMLImageElement
    expect(image.getAttribute('src')).toBe('blob:docx/1')
    expect(image.style.width).toBe('250px')
    expect(image.style.height).toBe('166.6667px')
    expect(image.style.left).toBe('-25px')
    expect(image.style.top).toBe('-33.3333px')
  })
})

describe('TableView', () => {
  afterEach(cleanup)

  it('fixes the grid, keeps the spans, and pads the cells', () => {
    const { container } = render(
      <TableView table={table()} pageContext={PAGE_CONTEXT} />,
    )
    const element = container.querySelector('table') as HTMLTableElement
    expect(element.hasAttribute('data-docx-block')).toBe(true)
    expect(element.style.tableLayout).toBe('fixed')
    expect(element.style.width).toBe('200px')
    expect(element.style.marginLeft).toBe('auto')
    const columns = Array.from(element.querySelectorAll('col')) as HTMLElement[]
    expect(columns.map(column => column.style.width)).toEqual(['100px', '100px'])
    const cells = Array.from(element.querySelectorAll('td'))
    expect(cells).toHaveLength(2)
    expect(cells[0].getAttribute('colspan')).toBe('1')
    expect(cells[1].getAttribute('rowspan')).toBe('2')
    expect(cells[0].style.padding).toBe('1px 4px 3px 2px')
    expect(cells[1].style.verticalAlign).toBe('bottom')
    expect(cells[1].style.background).toBe('rgb(217, 226, 243)')
    expect(cells[1].style.borderBottom).toBe('2px dashed rgb(255, 0, 0)')
  })

  it('lets the browser lay out a table that states no grid', () => {
    const { container } = render(
      <TableView table={table({ columns: [], align: 'left' })} pageContext={PAGE_CONTEXT} />,
    )
    const element = container.querySelector('table') as HTMLTableElement
    expect(element.style.tableLayout).toBe('auto')
    expect(element.style.width).toBe('')
    expect(element.querySelectorAll('col')).toHaveLength(0)
  })

  it('draws a nested block inside its cell', () => {
    const nested = table({ columns: [50], align: 'left' })
    const outer = table({
      rows: [{
        header: false,
        cantSplit: false,
        cells: [{
          colSpan: 1,
          rowSpan: 1,
          widthPx: 100,
          borders: {},
          verticalAlign: 'top',
          blocks: [nested],
        }],
      }],
    })
    const { container } = render(<TableView table={outer} pageContext={PAGE_CONTEXT} />)
    expect(container.querySelectorAll('table')).toHaveLength(2)
  })
})

describe('PageCanvas', () => {
  afterEach(cleanup)

  it('places the header and footer inside the margins the section states', () => {
    const story = { blocks: [paragraph({ inlines: [{ kind: 'text', text: '页眉', style: style() }] })] }
    const page = {
      section: section({ headers: { default: story }, footers: { default: { blocks: [] } } }),
      blocks: [paragraph()] as readonly DocxBlock[],
      displayNumber: 3,
    }
    const { container } = render(
      <PageCanvas page={page} pageNumber={3} pageCount={9} evenAndOdd={false} />,
    )
    const sheet = container.firstElementChild as HTMLElement
    expect(sheet.style.width).toBe('816px')
    expect(sheet.style.height).toBe('1056px')
    expect(sheet.style.paddingTop).toBe('96px')
    expect(sheet.style.paddingBottom).toBe('96px')
    expect(sheet.style.paddingLeft).toBe('96px')
    expect(sheet.style.overflow).toBe('hidden')
    const regions = Array.from(sheet.children) as HTMLElement[]
    expect(regions[0].style.top).toBe('48px')
    expect(regions[0].textContent).toBe('页眉')
    expect(regions[2].style.bottom).toBe('48px')
  })

  it('selects the first-page and even-page stories when the section asks for them', () => {
    const story = (value: string) => ({ blocks: [paragraph({ inlines: [{ kind: 'text', text: value, style: style() }] })] })
    const page = {
      section: section({
        titlePage: true,
        headers: { default: story('默认'), first: story('首页'), even: story('偶数') },
      }),
      blocks: [] as readonly DocxBlock[],
      displayNumber: 1,
    }
    const first = render(<PageCanvas page={page} pageNumber={1} pageCount={4} evenAndOdd />)
    expect(first.container.textContent).toBe('首页')
    first.unmount()

    const even = render(<PageCanvas page={page} pageNumber={2} pageCount={4} evenAndOdd />)
    expect(even.container.textContent).toBe('偶数')
    even.unmount()

    const odd = render(<PageCanvas page={page} pageNumber={3} pageCount={4} evenAndOdd />)
    expect(odd.container.textContent).toBe('默认')
  })

  it('draws no region when the section declares no stories', () => {
    const page = { section: section(), blocks: [paragraph()] as readonly DocxBlock[], displayNumber: 1 }
    const { container } = render(<PageCanvas page={page} pageNumber={1} pageCount={1} evenAndOdd={false} />)
    expect((container.firstElementChild as HTMLElement).children).toHaveLength(1)
  })
})

describe('tab stops', () => {
  afterEach(cleanup)

  it('lays segments against declared stops and keeps the fixed advance otherwise', () => {
    const withStops = render(
      <BlockView
        block={paragraph({
          inlines: [
            text('左'),
            { kind: 'tab', style: style() },
            text('中'),
            { kind: 'tab', style: style() },
            text('右'),
          ],
          tabStops: [
            { posPx: 100, val: 'center' },
            { posPx: 200, val: 'right' },
          ],
        })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    const element = withStops.container.firstElementChild as HTMLElement
    expect(element.querySelector('[data-docx-content]')?.getAttribute('style')).toContain('flex')
    // The right stop pins the last segment to the trailing edge.
    const segments = [...element.querySelector('[data-docx-content]')!.children] as HTMLElement[]
    expect(segments).toHaveLength(3)
    expect(segments[2].style.marginLeft).toBe('auto')
    withStops.unmount()

    // Without stops a tab keeps its fixed advance.
    const plain = render(
      <BlockView
        block={paragraph({
          inlines: [text('a'), { kind: 'tab', style: style() }, text('b')],
        })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    expect(plain.container.querySelectorAll('[data-docx-content] span')).toHaveLength(0)
    plain.unmount()
  })

  it('fills the run-up to a stop that declares a leader', () => {
    const { container } = render(
      <BlockView
        block={paragraph({
          inlines: [
            text('第一章'),
            { kind: 'tab', style: style() },
            text('3'),
          ],
          tabStops: [{ posPx: 300, val: 'right', leader: 'dot' }],
        })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    // The dotted run is its own flex item that grows over the free width, so
    // the page number rides the trailing edge without an auto margin.
    const leader = container.querySelector('[data-docx-tab-leader="dot"]') as HTMLElement
    expect(leader).not.toBeNull()
    expect(leader.style.flexGrow).toBe('1')
    expect(leader.style.backgroundImage).toContain('radial-gradient')
    const content = container.querySelector('[data-docx-content]') as HTMLElement
    const segments = [...content.children] as HTMLElement[]
    expect(segments).toHaveLength(3)
    expect(segments[2].style.marginLeft).toBe('')
  })

  it('underscores the run-up when the stop declares that leader', () => {
    const { container } = render(
      <BlockView
        block={paragraph({
          inlines: [text('签名'), { kind: 'tab', style: style() }, text('____')],
          tabStops: [{ posPx: 400, val: 'right', leader: 'underscore' }],
        })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    const leader = container.querySelector('[data-docx-tab-leader="underscore"]') as HTMLElement
    expect(leader).not.toBeNull()
    expect(leader.style.backgroundImage).toContain('linear-gradient')
  })
})

describe('line rules', () => {
  afterEach(cleanup)

  it('lets an at-least rule rise to the typeface’s own pitch, and keeps an exact one capped', () => {
    // The ratio context defaults to one, so the natural pitch here is the
    // mark's own size: 30px of type outgrows a 20px at-least rule.
    const grown = render(
      <BlockView
        block={paragraph({ lineHeightPx: 20, lineHeightAtLeast: true, mark: style({ sizePx: 30 }) })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    expect((grown.container.firstElementChild as HTMLElement).style.lineHeight).toBe('30px')
    grown.unmount()

    // 16px of type fits inside the 20px floor, which stands as stated.
    const floored = render(
      <BlockView
        block={paragraph({ lineHeightPx: 20, lineHeightAtLeast: true })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    expect((floored.container.firstElementChild as HTMLElement).style.lineHeight).toBe('20px')
    floored.unmount()

    const exact = render(
      <BlockView
        block={paragraph({ lineHeightPx: 20, mark: style({ sizePx: 30 }) })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    expect((exact.container.firstElementChild as HTMLElement).style.lineHeight).toBe('20px')
    exact.unmount()
  })
})

describe('bidi paragraphs', () => {
  afterEach(cleanup)

  it('sets the direction and swaps edge alignment for a right-to-left paragraph', () => {
    const { container } = render(
      <BlockView
        block={paragraph({ bidi: true })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    const element = container.firstElementChild as HTMLElement
    expect(element.style.direction).toBe('rtl')
    // Word reads a bidi paragraph's `left` as the trailing edge: the default
    // left alignment paints on the right.
    expect(element.style.textAlign).toBe('right')
    cleanup()
    const left = render(
      <BlockView
        block={paragraph({ bidi: true, align: 'left' })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    expect((left.container.firstElementChild as HTMLElement).style.textAlign).toBe('right')
    left.unmount()
    const right = render(
      <BlockView
        block={paragraph({ bidi: true, align: 'right' })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    expect((right.container.firstElementChild as HTMLElement).style.textAlign).toBe('left')
    right.unmount()
  })
})

describe('run decoration', () => {
  afterEach(cleanup)

  it('paints case, spacing, decoration, and a border with no stated colour', () => {
    const { container } = render(
      <InlineView
        inline={{
          kind: 'text',
          text: 'small',
          style: style({
            underline: true,
            strike: true,
            caps: true,
            smallCaps: true,
            letterSpacingPx: 2,
            verticalAlign: 'sub',
          }),
        }}
        pageContext={PAGE_CONTEXT}
      />,
    )
    const span = container.firstElementChild as HTMLElement
    expect(span.style.textDecoration).toBe('underline line-through')
    expect(span.style.textTransform).toBe('uppercase')
    expect(span.style.fontVariant).toBe('small-caps')
    expect(span.style.letterSpacing).toBe('2px')
    expect(span.style.verticalAlign).toBe('sub')
    expect(span.style.fontSize).toBe('16px')
  })

  it('falls back to the inherited colour for a border that states none', () => {
    const { container } = render(
      <BlockView
        block={paragraph({ borders: { left: { widthPx: 1, style: 'solid' } } })}
        topMargin={0}
        pageContext={PAGE_CONTEXT}
      />,
    )
    expect((container.firstElementChild as HTMLElement).style.borderLeft).toContain('1px solid')
  })

  it('right-aligns a table that asks for it', () => {
    const { container } = render(
      <TableView table={table({ align: 'right' })} pageContext={PAGE_CONTEXT} />,
    )
    const element = container.querySelector('table') as HTMLTableElement
    expect(element.style.marginLeft).toBe('auto')
    expect(element.style.marginRight).toBe('0px')
  })
})
