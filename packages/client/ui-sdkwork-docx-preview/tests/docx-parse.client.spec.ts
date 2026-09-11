// @vitest-environment jsdom
/** Document parsing: the part graph, the style cascade, content nodes, tables, and refusals. */
import { beforeAll, describe, expect, it } from 'vitest'
import { DocxParseError, parseDocx } from '../src/client/docx/document.ts'
import type { DocxInline, DocxParagraph, DocxTable } from '../src/client/docx/model.ts'
import type { ParsedDocx } from '../src/client/docx/document.ts'
import { fixtureEntries, storedFixturePackage } from './docx-fixture.client.ts'
import { buildZip, xml } from './zip-fixture.client.ts'

/** The labels every parse call needs. */
const LABELS = { unsupportedObject: () => 'unsupported' }

/** Blob URLs the parse created and the ones the caller released. */
const createdUrls: string[] = []
const revokedUrls: string[] = []

beforeAll(() => {
  URL.createObjectURL = (): string => {
    const url = `blob:docx/${createdUrls.length + 1}`
    createdUrls.push(url)
    return url
  }
  URL.revokeObjectURL = (url: string): void => { revokedUrls.push(url) }
})

/**
 * Parse the fixture and release it.
 * @param body - assertion body receiving the parsed document.
 */
async function withFixture(body: (parsed: ParsedDocx) => void): Promise<void> {
  const parsed = await parseDocx(await storedFixturePackage(), LABELS)
  try {
    body(parsed)
  } finally {
    parsed.dispose()
  }
}

/** The text an inline contributes, for paragraph assertions. */
function inlineText(inline: DocxInline): string {
  if (inline.kind === 'text') return inline.text
  if (inline.kind === 'unsupported') return inline.text
  if (inline.kind === 'break') return '\n'
  if (inline.kind === 'tab') return '\t'
  return ''
}

/** The concatenated text of a paragraph. */
function paragraphText(paragraph: DocxParagraph): string {
  return paragraph.inlines.map(inlineText).join('')
}

describe('parseDocx', () => {
  it('reads the document graph into sections of blocks', async () => {
    await withFixture(({ document }) => {
      expect(document.evenAndOddHeaders).toBe(true)
      expect(document.sections).toHaveLength(2)
      const [first, second] = document.sections
      // US Letter with one-inch margins.
      expect(first.geometry.widthPx).toBe(816)
      expect(first.geometry.heightPx).toBe(1056)
      expect(first.geometry.marginTopPx).toBe(96)
      expect(first.geometry.headerPx).toBe(48)
      expect(first.geometry.contentWidthPx).toBe(624)
      expect(first.geometry.contentHeightPx).toBe(864)
      // The trailing body-level section states A4 with narrower margins.
      expect(second.geometry.widthPx).toBeCloseTo(793.7333, 4)
      expect(second.geometry.contentWidthPx).toBeCloseTo(642.5333, 4)
      // Eleven blocks: the page break splits one paragraph into two.
      expect(first.blocks).toHaveLength(11)
      // The EA-indent paragraph closes the last section.
      expect(second.blocks).toHaveLength(2)
      expect(first.titlePage).toBe(true)
      expect(first.headers.default?.blocks).toHaveLength(1)
      expect(first.headers.even?.blocks).toHaveLength(1)
      expect(first.headers.first).toBeUndefined()
      expect(first.footers.default?.blocks).toHaveLength(1)
    })
  })

  it('resolves the document defaults, the style chain, and the paragraph properties', async () => {
    await withFixture(({ document }) => {
      const heading = document.sections[0].blocks[0] as DocxParagraph
      expect(heading.kind).toBe('paragraph')
      expect(heading.align).toBe('center')
      // `keepNext` and `spacing` come from Heading1; the after-space from docDefaults.
      expect(heading.keepNext).toBe(true)
      expect(heading.spaceBeforePx).toBe(16)
      expect(heading.spaceAfterPx).toBeCloseTo(10.6667, 4)
      const title = heading.inlines[0]
      expect(title.kind).toBe('text')
      if (title.kind !== 'text') throw new Error('expected text')
      expect(title.text).toBe('桃花源记')
      expect(title.style.bold).toBe(true)
      expect(title.style.sizePx).toBeCloseTo(21.3333, 4)
      expect(title.style.color).toBe('#2F5496')
      expect(title.style.fontFamily).toBe('"Calibri", "宋体", sans-serif')
    })
  })

  it('advances the numbering counters and hangs the marker', async () => {
    await withFixture(({ document }) => {
      const [first, second, bullet] = document.sections[0].blocks.slice(1, 4) as DocxParagraph[]
      expect(first.marker).toMatchObject({ text: '1.', suffix: ' ', indentPx: 24 })
      expect(first.marker?.style.bold).toBe(true)
      expect(first.indentLeftPx).toBe(48)
      expect(first.textIndentPx).toBe(-24)
      expect(second.marker?.text).toBe('2.')
      expect(bullet.marker).toMatchObject({ text: '•', suffix: 'tab' })
    })
  })

  it('renders decorated runs and drops vanished text', async () => {
    await withFixture(({ document }) => {
      const paragraph = document.sections[0].blocks[4] as DocxParagraph
      expect(paragraph.shading).toBe('#FFF2CC')
      expect(paragraph.borders.bottom).toMatchObject({ style: 'solid', color: '#FF0000' })
      expect(paragraph.borders.bottom?.widthPx).toBeCloseTo(1.3333, 4)
      expect(paragraph.lineMultiple).toBe(1.5)
      const [bold, emphasis, capital, symbol] = paragraph.inlines
      if (bold.kind !== 'text' || emphasis.kind !== 'text' || capital.kind !== 'text') {
        throw new Error('expected text runs')
      }
      expect(bold.style.bold).toBe(true)
      expect(bold.style.underline).toBe(true)
      expect(emphasis.style.italic).toBe(true)
      // The character style's theme colour is tinted before it reaches the model.
      expect(emphasis.style.color).toBe('#A2B9E2')
      expect(capital.style.caps).toBe(true)
      expect(capital.style.highlight).toBe('#FFFF00')
      expect(capital.style.verticalAlign).toBe('super')
      expect(paragraphText(paragraph)).not.toContain('其中往来种作')
      expect(symbol.kind).toBe('tab')
      expect(paragraph.inlines[4]).toMatchObject({ kind: 'text', text: '\u2011' })
      expect(paragraph.inlines[5]).toMatchObject({ kind: 'text', text: String.fromCharCode(0xf0e0) })
    })
  })

  it('resolves East Asian character-unit indents against the mark size', async () => {
    await withFixture(({ document }) => {
      // The stored fixture paragraph 首行缩进2字符 (firstLineChars=200 at 14.67px mark).
      const paragraphs = document.sections.at(-1)!.blocks as DocxParagraph[]
      const indented = paragraphs.find(
        (block): block is DocxParagraph =>
          block.kind === 'paragraph'
          && block.inlines.some(i => i.kind === 'text' && i.text.includes('字符单位缩进')),
      )
      expect(indented).toBeDefined()
      if (indented === undefined) return
      // 200 hundredths of a character = two marks wide at the mark's size.
      expect(indented.textIndentPx).toBeCloseTo(2 * indented.mark.sizePx, 1)
    })
  })

  it('resolves hyperlink targets and computes page fields', async () => {
    await withFixture(({ document }) => {
      const links = document.sections[0].blocks[5] as DocxParagraph
      expect(links.inlines[0]).toMatchObject({ kind: 'text', link: 'https://example.com/a' })
      expect(links.inlines[1]).toMatchObject({ kind: 'text', anchor: 'top' })

      const [fields, rest] = document.sections[0].blocks.slice(6, 8) as DocxParagraph[]
      expect(fields.inlines[0]).toMatchObject({ kind: 'field', field: 'page' })
      expect(fields.inlines[1]).toMatchObject({ kind: 'text', text: ' / ' })
      expect(fields.inlines[2]).toMatchObject({ kind: 'field', field: 'pageCount' })
      // The page break split the paragraph, and the continuation opens a page.
      expect(fields.pageBreakBefore).toBe(false)
      expect(rest.pageBreakBefore).toBe(true)
      expect(paragraphText(rest)).toBe('第二页文字\n换行后')
    })
  })

  it('places DrawingML and VML pictures and reports what it cannot draw', async () => {
    await withFixture(({ document }) => {
      const paragraph = document.sections[0].blocks[8] as DocxParagraph
      const drawing = paragraph.inlines[0]
      if (drawing.kind !== 'image') throw new Error('expected an image')
      expect(drawing.image.src).toMatch(/^blob:docx\/\d+$/u)
      expect(drawing.image).toMatchObject({
        widthPx: 96,
        heightPx: 48,
        rotation: 90,
        flipH: true,
        flipV: false,
        crop: { left: 0.1, top: 0, right: 0, bottom: 0.2 },
      })
      // A VML shape states its size in points.
      expect(paragraph.inlines[1]).toMatchObject({ kind: 'image', image: { widthPx: 48, heightPx: 24 } })
      expect(paragraph.inlines[2]).toMatchObject({ kind: 'unsupported', text: 'unsupported' })
      expect(paragraph.inlines[3]).toMatchObject({ kind: 'unsupported', text: 'unsupported' })
    })
  })

  it('lays table cells out on the grid with their spans and borders', async () => {
    await withFixture(({ document }) => {
      const table = document.sections[0].blocks[9] as DocxTable
      expect(table.kind).toBe('table')
      expect(table.columns).toEqual([192, 192])
      expect(table.align).toBe('center')
      // The table style contributes its left border, the table its own top border.
      expect(table.borders.left).toMatchObject({ color: '#4472C4' })
      expect(table.borders.top).toMatchObject({ color: '#000000' })
      expect(table.cellMargin.left).toBeCloseTo(7.2, 4)

      const [header, middle, last] = table.rows
      expect(header.header).toBe(true)
      expect(header.heightPx).toBe(32)
      expect(header.cells).toHaveLength(1)
      expect(header.cells[0]).toMatchObject({ colSpan: 2, rowSpan: 1, widthPx: 384, shading: '#D9E2F3' })
      // The nested table is read inside its cell.
      expect(middle.cells).toHaveLength(2)
      expect(middle.cells[0]).toMatchObject({ colSpan: 1, rowSpan: 2 })
      expect(middle.cells[1].blocks[0]).toMatchObject({ kind: 'table' })
      expect(middle.cells[1].borders.top).toMatchObject({ style: 'double', color: '#FF0000' })
      // The merged continuation is consumed, so only the next column is placed.
      expect(last.cells).toHaveLength(1)
      expect(last.cells[0].verticalAlign).toBe('bottom')
      expect(paragraphText(last.cells[0].blocks[0] as DocxParagraph)).toBe('末尾')
    })
  })

  it('releases the media it created', async () => {
    createdUrls.length = 0
    revokedUrls.length = 0
    const parsed = await parseDocx(await storedFixturePackage(), LABELS)
    expect(createdUrls).toEqual(['blob:docx/1'])
    parsed.dispose()
    expect(revokedUrls).toEqual(['blob:docx/1'])
  })

  it('falls back to the built-in theme and empty styles when parts are absent', async () => {
    const entries = fixtureEntries().filter(entry => (
      !entry.name.startsWith('word/styles.xml')
      && !entry.name.startsWith('word/numbering.xml')
      && !entry.name.startsWith('word/theme/')
    ))
    const parsed = await parseDocx(await buildZip(entries), LABELS)
    try {
      const heading = parsed.document.sections[0].blocks[0] as DocxParagraph
      const title = heading.inlines[0]
      if (title.kind !== 'text') throw new Error('expected text')
      // No style part means no bold, and the default size is Word's 11pt.
      expect(title.style.bold).toBe(false)
      expect(title.style.sizePx).toBeCloseTo(14.6667, 4)
      expect(title.style.fontFamily).toBe('"Calibri", sans-serif')
      expect((parsed.document.sections[0].blocks[1] as DocxParagraph).marker).toBeUndefined()
    } finally {
      parsed.dispose()
    }
  })

  it('refuses a legacy binary document', async () => {
    const bytes = new Uint8Array(64)
    bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    await expect(parseDocx(bytes, LABELS)).rejects.toMatchObject({ code: 'legacy-binary' })
  })

  it('refuses bytes that are not a package', async () => {
    await expect(parseDocx(new Uint8Array([1, 2, 3, 4]), LABELS)).rejects.toMatchObject({ code: 'not-a-package' })
  })

  it('refuses a package with no main document part', async () => {
    const bytes = await buildZip([{ name: 'README.txt', text: 'nothing here' }])
    await expect(parseDocx(bytes, LABELS)).rejects.toMatchObject({ code: 'no-document' })
  })

  it('refuses a package whose document part has no body', async () => {
    const entries = fixtureEntries().map(entry => (
      entry.name === 'word/document.xml' ? { ...entry, text: xml('w:document', '') } : entry
    ))
    const failure = await parseDocx(await buildZip(entries), LABELS).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(DocxParseError)
    expect(failure).toMatchObject({ code: 'no-document' })
  })

  it('survives a style chain that refers to itself', async () => {
    const entries = fixtureEntries().map(entry => (
      entry.name === 'word/styles.xml'
        ? {
          ...entry,
          text: xml('w:styles', '<w:style w:type="paragraph" w:styleId="Heading1">'
            + '<w:basedOn w:val="Heading1"/><w:rPr><w:b/></w:rPr></w:style>'),
        }
        : entry
    ))
    const parsed = await parseDocx(await buildZip(entries), LABELS)
    try {
      const heading = parsed.document.sections[0].blocks[0] as DocxParagraph
      const title = heading.inlines[0]
      if (title.kind !== 'text') throw new Error('expected text')
      // The cycle stops at the repeated style, whose own properties still apply.
      expect(title.style.bold).toBe(true)
    } finally {
      parsed.dispose()
    }
  })
})
