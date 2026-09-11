// @vitest-environment jsdom
/** Numbering, formatting, and table details the main fixture does not reach. */
import { beforeAll, describe, expect, it } from 'vitest'
import { parseDocx } from '../src/client/docx/document.ts'
import type { ParsedDocx } from '../src/client/docx/document.ts'
import type { DocxParagraph, DocxTable } from '../src/client/docx/model.ts'
import { buildZip, rels, xml } from './zip-fixture.client.ts'
import type { ZipEntryInput } from './zip-fixture.client.ts'

const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** The labels every parse call needs. */
const LABELS = { unsupportedObject: () => 'unsupported' }

/** The package root's only relationship. */
const PACKAGE_RELS = rels(
  `<Relationship Id="rId1" Type="${REL_BASE}/officeDocument" Target="word/document.xml"/>`,
)

/** Document relationships; a part may be declared without being present. */
const DOCUMENT_RELS = rels([
  `<Relationship Id="rIdStyles" Type="${REL_BASE}/styles" Target="styles.xml"/>`,
  `<Relationship Id="rIdNumbering" Type="${REL_BASE}/numbering" Target="numbering.xml"/>`,
  `<Relationship Id="rIdTheme" Type="${REL_BASE}/theme" Target="theme/theme1.xml"/>`,
  `<Relationship Id="rIdImage" Type="${REL_BASE}/image" Target="media/image1.png"/>`,
].join(''))

beforeAll(() => {
  URL.createObjectURL = (): string => 'blob:docx/test'
  URL.revokeObjectURL = (): void => {}
})

/** A paragraph with optional properties. */
function paragraph(content: string, properties = ''): string {
  return `<w:p>${properties === '' ? '' : `<w:pPr>${properties}</w:pPr>`}${content}</w:p>`
}

/** A run holding text. */
function run(text: string, properties = ''): string {
  return `<w:r>${properties === '' ? '' : `<w:rPr>${properties}</w:rPr>`}<w:t>${text}</w:t></w:r>`
}

/**
 * Parse a body built for one spec.
 * @param body - the `w:body` content.
 * @param parts - the extra package parts the body references.
 * @returns the parsed document.
 */
async function parseStory(body: string, parts: readonly ZipEntryInput[] = []): Promise<ParsedDocx> {
  return await parseDocx(await buildZip([
    { name: 'word/document.xml', text: xml('w:document', `<w:body>${body}</w:body>`) },
    { name: 'word/_rels/document.xml.rels', text: DOCUMENT_RELS, stored: true },
    { name: '_rels/.rels', text: PACKAGE_RELS, stored: true },
    ...parts,
  ]), LABELS)
}

/** The numbering definitions these specs number against. */
const NUMBERING = xml('w:numbering', [
  '<w:abstractNum w:abstractNumId="0">',
  '<w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>',
  '<w:lvl w:ilvl="1"><w:numFmt w:val="decimalZero"/><w:lvlText w:val="%1.%2."/></w:lvl>',
  '<w:lvl w:ilvl="2"><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%3)"/></w:lvl>',
  '<w:lvl w:ilvl="3"><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%4)"/></w:lvl>',
  '<w:lvl w:ilvl="4"><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%5)"/></w:lvl>',
  '<w:lvl w:ilvl="5"><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%6)"/></w:lvl>',
  '<w:lvl w:ilvl="6"><w:numFmt w:val="none"/><w:lvlText w:val="%7"/></w:lvl>',
  '</w:abstractNum>',
  '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/>',
  '<w:lvlText w:val="★"/><w:suff w:val="nothing"/></w:lvl></w:abstractNum>',
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>',
  '<w:num w:numId="3"><w:abstractNumId w:val="0"/>',
  '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>',
].join(''))

/** A numbered paragraph at one level of one instance. */
function numbered(numId: number, level: number): string {
  return paragraph(run('项目'), `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`)
}

describe('numbering', () => {
  it('renders every level format and restarts a deeper level', async () => {
    const parsed = await parseStory(
      [
        numbered(1, 0), numbered(1, 1), numbered(1, 2), numbered(1, 3),
        numbered(1, 4), numbered(1, 5), numbered(1, 6), numbered(1, 0),
        numbered(2, 0), numbered(3, 0), numbered(3, 0), numbered(99, 0),
        numbered(1, 8), numbered(1, 2),
      ].join(''),
      [{ name: 'word/numbering.xml', text: NUMBERING }],
    )
    try {
      const markers = parsed.document.sections[0].blocks.map(block => (
        (block as DocxParagraph).marker
      ))
      expect(markers.map(marker => marker?.text)).toEqual([
        '1.', '1.01.', 'a)', 'A)', 'i)', 'I)', '', '2.',
        '★', '5.', '6.', undefined, undefined, 'a)',
      ])
      // A bullet level that states `nothing` writes no separator.
      expect(markers[8]?.suffix).toBe('')
      // The last marker repeats the first, because the level-0 step reset it.
      expect(markers[13]?.text).toBe('a)')
    } finally {
      parsed.dispose()
    }
  })
})

describe('structured document tags', () => {
  it('reads blocks and runs wrapped in w:sdt as if bare', async () => {
    const sdtTable = '<w:tbl><w:tblPr><w:tblW w:w="2000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>'
      + '<w:tr><w:tc><w:p><w:r><w:t>表内文字</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    const textOf = (p: DocxParagraph): string => p.inlines.map(i => (i.kind === 'text' ? i.text : '')).join('')
    const body = '<w:p><w:r><w:t>before</w:t></w:r></w:p>'
      + '<w:sdt><w:sdtPr><w:alias w:val="目录"/></w:sdtPr><w:sdtContent>'
      + '<w:p><w:r><w:t>控件内段落</w:t></w:r></w:p>'
      + sdtTable
      + '</w:sdtContent></w:sdt>'
      + '<w:p><w:r><w:t>after</w:t></w:r>'
      + '<w:br/><w:sdt><w:sdtContent><w:r><w:t>行内控件</w:t></w:r></w:sdtContent></w:sdt></w:p>'
    const parsed = await parseDocx(await buildZip([
      { name: 'word/document.xml', text: xml('w:document', `<w:body>${body}</w:body>`) },
      { name: 'word/_rels/document.xml.rels', text: DOCUMENT_RELS, stored: true },
      { name: '_rels/.rels', text: PACKAGE_RELS, stored: true },
    ]), LABELS)
    try {
      const blocks = parsed.document.sections[0].blocks
      expect(blocks).toHaveLength(4)
      expect(textOf(blocks[1] as DocxParagraph)).toBe('控件内段落')
      expect((blocks[2] as DocxTable).kind).toBe('table')
      const last = blocks[3] as DocxParagraph
      expect(textOf(last)).toContain('行内控件')
    } finally {
      parsed.dispose()
    }
  })
})

describe('hostile hyperlinks', () => {
  it('keeps only navigable schemes as links and renders the rest as plain text', async () => {
    const documentRels = rels([
      `<Relationship Id="rIdStyles" Type="${REL_BASE}/styles" Target="styles.xml"/>`,
      '<Relationship Id="rIdJs" Type="' + REL_BASE + '/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>',
      '<Relationship Id="rIdData" Type="' + REL_BASE + '/hyperlink" Target="data:text/html,hi" TargetMode="External"/>',
      '<Relationship Id="rIdMail" Type="' + REL_BASE + '/hyperlink" Target="mailto:safe@example.com" TargetMode="External"/>',
      '<Relationship Id="rIdFile" Type="' + REL_BASE + '/hyperlink" Target="file:///C:/secrets.docx" TargetMode="External"/>',
    ].join(''))
    const hyperlink = (id: string, text: string) => `<w:hyperlink r:id="${id}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink>`
    const body = '<w:p>' + hyperlink('rIdJs', 'js') + hyperlink('rIdData', 'data') + hyperlink('rIdMail', 'mail') + hyperlink('rIdFile', 'file') + '</w:p>'
    const parsed = await parseDocx(await buildZip([
      { name: 'word/document.xml', text: xml('w:document', `<w:body>${body}</w:body>`) },
      { name: 'word/_rels/document.xml.rels', text: documentRels, stored: true },
      { name: '_rels/.rels', text: PACKAGE_RELS, stored: true },
    ]), LABELS)
    try {
      const paragraph = parsed.document.sections[0].blocks[0] as DocxParagraph
      const links = paragraph.inlines.map(inline => (inline.kind === 'text' ? inline.link : '<not-text>'))
      expect(links).toEqual([undefined, undefined, 'mailto:safe@example.com', undefined])
      expect(paragraph.inlines.every(inline => inline.kind === 'text')).toBe(true)
    } finally {
      parsed.dispose()
    }
  })
})

describe('paragraph and run formatting', () => {
  it('drops the space between contextual neighbours of the same style', async () => {
    const styles = xml('w:styles', [
      '<w:docDefaults><w:pPrDefault><w:pPr><w:spacing w:after="160" w:before="40"/></w:pPr></w:pPrDefault></w:docDefaults>',
      '<w:style w:type="paragraph" w:styleId="Body"><w:name w:val="Body"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Other"><w:name w:val="Other"/></w:style>',
    ].join(''))
    const parsed = await parseStory(
      [
        paragraph(run('一'), '<w:pStyle w:val="Body"/>'),
        paragraph(run('二'), '<w:pStyle w:val="Body"/><w:contextualSpacing/>'),
        paragraph(run('三'), '<w:pStyle w:val="Other"/>'),
      ].join(''),
      [{ name: 'word/styles.xml', text: styles }],
    )
    try {
      const blocks = parsed.document.sections[0].blocks as readonly DocxParagraph[]
      expect(blocks[0].spaceAfterPx).toBe(0)
      expect(blocks[1].spaceBeforePx).toBe(0)
      expect(blocks[1].spaceAfterPx).toBeCloseTo(10.6667, 4)
      expect(blocks[2].spaceBeforePx).toBeCloseTo(2.6667, 4)
      expect(blocks[2].spaceAfterPx).toBeCloseTo(10.6667, 4)
    } finally {
      parsed.dispose()
    }
  })

  it('falls back to the defaults for a style the package does not define', async () => {
    const parsed = await parseStory(paragraph(run('正文'), '<w:pStyle w:val="Missing"/>'))
    try {
      const block = parsed.document.sections[0].blocks[0] as DocxParagraph
      const inline = block.inlines[0]
      if (inline.kind !== 'text') throw new Error('expected text')
      expect(inline.style.sizePx).toBeCloseTo(14.6667, 4)
      expect(block.indentLeftPx).toBe(0)
    } finally {
      parsed.dispose()
    }
  })

  it('resolves theme typefaces and tinted theme shading', async () => {
    const theme = xml('a:theme', [
      '<a:themeElements><a:clrScheme name="Office">',
      '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>',
      '<a:accent1><a:srgbClr val="4472C4"/></a:accent1>',
      '</a:clrScheme><a:fontScheme name="Office">',
      '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/></a:majorFont>',
      '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="宋体"/></a:minorFont>',
      '</a:fontScheme></a:themeElements>',
    ].join(''))
    const parsed = await parseStory(
      paragraph([
        run('甲', '<w:rFonts w:asciiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia"/>'),
        run('乙', '<w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia"/>'),
        run('丙', '<w:rFonts w:ascii=""/>'),
      ].join(''), '<w:shd w:fill="auto" w:themeFill="accent1" w:themeShade="80"/>'),
      [{ name: 'word/theme/theme1.xml', text: theme }],
    )
    try {
      const block = parsed.document.sections[0].blocks[0] as DocxParagraph
      // The major East Asian face is empty, so it falls back to the minor Latin one.
      expect(block.shading).toBe('#223962')
      const families = block.inlines.map(inline => (inline.kind === 'text' ? inline.style.fontFamily : ''))
      expect(families).toEqual([
        '"Calibri Light", "Calibri", sans-serif',
        '"Calibri", "宋体", sans-serif',
        '"Calibri", sans-serif',
      ])
    } finally {
      parsed.dispose()
    }
  })

  it('drops deleted runs, breaks lines, and skips a symbol with no code point', async () => {
    const parsed = await parseStory(paragraph([
      '<w:bookmarkStart w:id="0" w:name="mark"/>',
      '<w:del><w:r><w:delText>删除</w:delText></w:r></w:del>',
      '<w:r><w:cr/><w:t>换行</w:t></w:r>',
      '<w:r><w:br w:type="column"/><w:sym w:char="zz"/></w:r>',
      run('尾'),
    ].join('')))
    try {
      const block = parsed.document.sections[0].blocks[0] as DocxParagraph
      expect(block.inlines.map(inline => inline.kind)).toEqual(['break', 'text', 'break', 'text'])
      const text = block.inlines.flatMap(inline => (inline.kind === 'text' ? [inline.text] : []))
      expect(text).toEqual(['换行', '尾'])
    } finally {
      parsed.dispose()
    }
  })

  it('reads VML lengths in every unit the shape style uses', async () => {
    const shape = (style: string): string => `<w:r><w:pict><v:shape style="${style}">`
      + '<v:imagedata r:id="rIdImage"/></v:shape></w:pict></w:r>'
    const parsed = await parseStory(
      paragraph([
        shape('width:1in;height:25.4mm'),
        shape('width:2.54cm;height:10px'),
        shape('width:bad;height:10px'),
      ].join('')),
      [{ name: 'word/media/image1.png', bytes: Uint8Array.from([1, 2, 3]) }],
    )
    try {
      const block = parsed.document.sections[0].blocks[0] as DocxParagraph
      expect(block.inlines[0]).toMatchObject({ kind: 'image', image: { widthPx: 96, heightPx: 96 } })
      expect(block.inlines[1]).toMatchObject({ kind: 'image', image: { widthPx: 96, heightPx: 10 } })
      // A shape whose width is not a length names the object it could not draw.
      expect(block.inlines).toHaveLength(3)
      expect(block.inlines[2].kind).toBe('unsupported')
    } finally {
      parsed.dispose()
    }
  })
})

describe('tables', () => {
  it('reads percentage and automatic cell widths against the grid', async () => {
    const cell = (content: string, properties: string): string =>
      `<w:tc><w:tcPr>${properties}</w:tcPr>${content}</w:tc>`
    const parsed = await parseStory([
      '<w:tbl><w:tblGrid><w:gridCol w:w="1440"/><w:gridCol w:w="1440"/></w:tblGrid>',
      `<w:tr>${cell(paragraph(run('半')), '<w:tcW w:w="2500" w:type="pct"/>')}`,
      `${cell(paragraph(run('自动')), '<w:tcW w:w="100" w:type="auto"/>')}</w:tr>`,
      '</w:tbl>',
    ].join(''))
    try {
      const table = parsed.document.sections[0].blocks[0] as DocxTable
      expect(table.columns).toEqual([96, 96])
      // A percentage is taken against the whole grid, an automatic width against the span.
      expect(table.rows[0].cells[0].widthPx).toBeCloseTo(96, 4)
      expect(table.rows[0].cells[1].widthPx).toBe(96)
    } finally {
      parsed.dispose()
    }
  })

  it('keeps a document that states no section properties readable', async () => {
    const parsed = await parseStory(paragraph(run('无节属性')))
    try {
      expect(parsed.document.sections).toHaveLength(1)
      expect(parsed.document.sections[0].geometry.widthPx).toBe(816)
      expect(parsed.document.evenAndOddHeaders).toBe(false)
      expect(parsed.document.sections[0].headers.default).toBeUndefined()
    } finally {
      parsed.dispose()
    }
  })
})
