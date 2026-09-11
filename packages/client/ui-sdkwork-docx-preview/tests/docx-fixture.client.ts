/**
 * A minimal but complete OOXML WordprocessingML package for parser specs.
 *
 * The fixture mirrors the real part graph (package root → main document →
 * styles, numbering, settings, theme, media, and per-section stories) so the
 * specs exercise the graph rather than a flattened stand-in, and each part is
 * small enough to read in the test.
 */
import { buildZip, rels, xml } from './zip-fixture.client.ts'
import type { ZipEntryInput } from './zip-fixture.client.ts'

const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** A paragraph with its properties and content. */
function paragraph(content: string, properties = ''): string {
  const head = properties === '' ? '' : `<w:pPr>${properties}</w:pPr>`
  return `<w:p>${head}${content}</w:p>`
}

/** A table cell with its properties and content. */
function cell(content: string, properties = ''): string {
  const head = properties === '' ? '' : `<w:tcPr>${properties}</w:tcPr>`
  return `<w:tc>${head}${content}</w:tc>`
}

/** A run whose text is the given string. */
function run(text: string, properties = ''): string {
  const head = properties === '' ? '' : `<w:rPr>${properties}</w:rPr>`
  return `<w:r>${head}<w:t>${text}</w:t></w:r>`
}

/** The two-column grid the fixture tables use. */
const GRID = '<w:tblGrid><w:gridCol w:w="2880"/><w:gridCol w:w="2880"/></w:tblGrid>'

/** A small nested table, used to prove tables inside cells are read. */
function nestedTable(): string {
  return [
    '<w:tbl><w:tblPr><w:tblW w:w="2880" w:type="dxa"/></w:tblPr>',
    GRID,
    `<w:tr>${cell(paragraph(run('内层'))) }</w:tr>`,
    '</w:tbl>',
  ].join('')
}

/** The fixture table: a header row, a horizontal span, and a vertical merge. */
function table(): string {
  return [
    '<w:tbl>',
    '<w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="5760" w:type="dxa"/><w:jc w:val="center"/>',
    '<w:tblBorders><w:top w:val="single" w:sz="8" w:color="000000"/>',
    '<w:insideH w:val="dashed" w:sz="4" w:color="808080"/></w:tblBorders>',
    '<w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar>',
    '</w:tblPr>',
    GRID,
    '<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="480"/></w:trPr>',
    cell(paragraph(run('项目')), '<w:gridSpan w:val="2"/><w:shd w:val="clear" w:fill="D9E2F3"/>'),
    '</w:tr>',
    `<w:tr>${cell(paragraph(run('合并')), '<w:vMerge w:val="restart"/>')}`,
    cell(nestedTable(), '<w:tcBorders><w:top w:val="double" w:sz="8" w:color="FF0000"/></w:tcBorders>'),
    '</w:tr>',
    `<w:tr>${cell('', '<w:vMerge w:val="continue"/>')}`,
    cell(paragraph(run('末尾')), '<w:vAlign w:val="bottom"/>'),
    '</w:tr>',
    '</w:tbl>',
  ].join('')
}

/** The section properties the first section ends with. */
const FIRST_SECTION = [
  '<w:pgSz w:w="12240" w:h="15840"/>',
  '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>',
  '<w:headerReference w:type="default" r:id="rIdHeader"/>',
  '<w:headerReference w:type="even" r:id="rIdHeaderEven"/>',
  '<w:footerReference w:type="default" r:id="rIdFooter"/>',
  '<w:titlePg/>',
].join('')

/** The body of the main document part. */
function documentBody(): string {
  return [
    paragraph(run('桃花源记'), '<w:pStyle w:val="Heading1"/><w:jc w:val="center"/>'),
    paragraph(run('晋太元中'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    paragraph(run('武陵人'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'),
    paragraph(run('芳草鲜美'), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
    paragraph([
      run('落英缤纷', '<w:b/><w:u w:val="single"/><w:sz w:val="28"/>'),
      run('阡陌交通', '<w:rStyle w:val="Emphasis"/>'),
      run('鸡犬相闻', '<w:caps/><w:highlight w:val="yellow"/><w:vertAlign w:val="superscript"/>'),
      run('其中往来种作', '<w:vanish/>'),
      '<w:r><w:tab/><w:noBreakHyphen/><w:sym w:char="F0E0"/></w:r>',
    ].join(''), '<w:shd w:val="clear" w:fill="FFF2CC"/>'
      + '<w:pBdr><w:bottom w:val="single" w:sz="8" w:color="FF0000"/></w:pBdr>'
      + '<w:spacing w:before="240" w:line="360" w:lineRule="auto"/>'),
    paragraph([
      `<w:hyperlink r:id="rIdLink">${run('外部链接')}</w:hyperlink>`,
      '<w:hyperlink w:anchor="top">',
      run('书签'),
      '</w:hyperlink>',
    ].join('')),
    paragraph([
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
      '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>',
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>',
      run('1'),
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
      run(' / '),
      `<w:fldSimple w:instr=" NUMPAGES ">${run('3')}</w:fldSimple>`,
      '<w:r><w:br w:type="page"/></w:r>',
      run('第二页文字'),
      '<w:r><w:br/></w:r>',
      run('换行后'),
    ].join('')),
    paragraph([
      '<w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="457200"/><a:graphic>',
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
      '<pic:pic><pic:blipFill><a:blip r:embed="rIdImage"/>',
      '<a:srcRect l="10000" t="0" r="0" b="20000"/></pic:blipFill>',
      '<pic:spPr><a:xfrm rot="5400000" flipH="1"/></pic:spPr></pic:pic>',
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
      '<w:r><w:pict><v:shape style="width:36pt;height:18pt">',
      '<v:imagedata r:id="rIdImage"/></v:shape></w:pict></w:r>',
      '<w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="457200"/><a:graphic>',
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/>',
      '</a:graphic></wp:inline></w:drawing></w:r>',
      '<w:r><w:object><v:shape style="width:10pt;height:10pt"/></w:object></w:r>',
    ].join('')),
    table(),
    paragraph(run('第一节结束'), `<w:sectPr>${FIRST_SECTION}</w:sectPr>`),
    paragraph(run('第二节')),
    paragraph(run('字符单位缩进：首行缩进两个字符。'), '<w:ind w:leftChars="0" w:firstLineChars="200" w:firstLine="480"/>'),
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
      + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/>'
      + '</w:sectPr>',
  ].join('')
}

/** The styles part: document defaults, a based-on chain, and a table style. */
const STYLES = xml('w:styles', [
  '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/>',
  '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体"/></w:rPr></w:rPrDefault>',
  '<w:pPrDefault><w:pPr><w:spacing w:after="160"/></w:pPr></w:pPrDefault></w:docDefaults>',
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>',
  '<w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240"/></w:pPr>',
  '<w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="2F5496"/></w:rPr></w:style>',
  '<w:style w:type="character" w:styleId="Emphasis"><w:name w:val="Emphasis"/>',
  '<w:rPr><w:i/><w:color w:themeColor="accent1" w:themeTint="80"/></w:rPr></w:style>',
  '<w:style w:type="table" w:styleId="Grid"><w:name w:val="Table Grid"/>',
  '<w:tblPr><w:tblBorders><w:left w:val="single" w:sz="8" w:color="4472C4"/></w:tblBorders>',
  '<w:tblCellMar><w:top w:w="144" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>',
].join(''))

/** The numbering part: a decimal level with an indent, and a bullet level. */
const NUMBERING = xml('w:numbering', [
  '<w:abstractNum w:abstractNumId="0">',
  '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>',
  '<w:suff w:val="space"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>',
  '<w:rPr><w:b/></w:rPr></w:lvl>',
  '<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/>',
  '<w:lvlText w:val="%2)"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>',
  '</w:abstractNum>',
  '<w:abstractNum w:abstractNumId="1">',
  '<w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>',
  '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>',
  '</w:abstractNum>',
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>',
  '<w:num w:numId="3"><w:abstractNumId w:val="0"/>',
  '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>',
].join(''))

/** The settings part, which turns on the even-page stories. */
const SETTINGS = xml('w:settings', '<w:evenAndOddHeaders/>')

/** The theme part: the Office colour scheme and one typeface pair. */
const THEME = xml('a:theme', [
  '<a:themeElements>',
  '<a:clrScheme name="Office">',
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>',
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>',
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1>',
  '</a:clrScheme>',
  '<a:fontScheme name="Office">',
  '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/></a:majorFont>',
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="宋体"/></a:minorFont>',
  '</a:fontScheme>',
  '<a:fmtScheme name="Office"/>',
  '</a:themeElements>',
].join(''))

/** The default header story. */
const HEADER = xml('w:hdr', paragraph(run('页眉', '<w:sz w:val="18"/>')))

/** The even-page header story. */
const HEADER_EVEN = xml('w:hdr', paragraph(run('偶数页眉')))

/** The default footer story. */
const FOOTER = xml('w:ftr', paragraph(run('页脚')))

/** The main document part's relationships. */
const DOCUMENT_RELS = rels([
  `<Relationship Id="rIdStyles" Type="${REL_BASE}/styles" Target="styles.xml"/>`,
  `<Relationship Id="rIdNumbering" Type="${REL_BASE}/numbering" Target="numbering.xml"/>`,
  `<Relationship Id="rIdSettings" Type="${REL_BASE}/settings" Target="settings.xml"/>`,
  `<Relationship Id="rIdTheme" Type="${REL_BASE}/theme" Target="theme/theme1.xml"/>`,
  `<Relationship Id="rIdHeader" Type="${REL_BASE}/header" Target="header1.xml"/>`,
  `<Relationship Id="rIdHeaderEven" Type="${REL_BASE}/header" Target="header2.xml"/>`,
  `<Relationship Id="rIdFooter" Type="${REL_BASE}/footer" Target="footer1.xml"/>`,
  `<Relationship Id="rIdImage" Type="${REL_BASE}/image" Target="media/image1.png"/>`,
  `<Relationship Id="rIdLink" Type="${REL_BASE}/hyperlink" Target="https://example.com/a" TargetMode="External"/>`,
].join(''))

/** Package relationships naming the main document part. */
const PACKAGE_RELS = rels(
  `<Relationship Id="rId1" Type="${REL_BASE}/officeDocument" Target="word/document.xml"/>`,
)

/** Bytes that stand in for a PNG; the reader only needs a decodable suffix. */
export const IMAGE_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])

/**
 * Every part of the fixture package.
 * @returns the ZIP entry list.
 */
export function fixtureEntries(): readonly ZipEntryInput[] {
  return [
    { name: 'word/document.xml', text: xml('w:document', `<w:body>${documentBody()}</w:body>`) },
    { name: 'word/_rels/document.xml.rels', text: DOCUMENT_RELS, stored: true },
    { name: 'word/styles.xml', text: STYLES },
    { name: 'word/numbering.xml', text: NUMBERING },
    { name: 'word/settings.xml', text: SETTINGS },
    { name: 'word/theme/theme1.xml', text: THEME },
    { name: 'word/header1.xml', text: HEADER },
    { name: 'word/header2.xml', text: HEADER_EVEN },
    { name: 'word/footer1.xml', text: FOOTER },
    { name: 'word/media/image1.png', bytes: IMAGE_BYTES },
    { name: '_rels/.rels', text: PACKAGE_RELS, stored: true },
  ]
}

/**
 * Build the fixture package with every part stored uncompressed.
 *
 * Environments that provide `DOMParser` without `DecompressionStream` still
 * need a parseable package; storing the parts exercises the same graph without
 * the inflate step.
 * @returns the container bytes.
 */
export async function storedFixturePackage(): Promise<Uint8Array> {
  return await buildZip(fixtureEntries().map(entry => ({ ...entry, stored: true })))
}
