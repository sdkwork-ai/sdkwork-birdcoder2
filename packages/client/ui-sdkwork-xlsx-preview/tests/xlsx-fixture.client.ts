/**
 * A minimal but complete SpreadsheetML workbook for parser specs.
 *
 * The fixture exercises the tables a real workbook composes — shared strings,
 * the style table, merges, a frozen pane, and a theme — so the specs cover the
 * graph rather than a flattened stand-in.
 */
import { buildZip, xml } from './zip-fixture.client.ts'
import type { ZipEntryInput } from './zip-fixture.client.ts'

/** SpreadsheetML namespace declarations. */
const SPREADSHEET_NAMESPACES =
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'

/**
 * Declare the XML prolog and namespaces for a fixture part.
 * @param localName - the root element's local name.
 * @param body - the root element's content.
 * @returns the complete part text.
 */
function sheetXml(localName: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${localName} ${SPREADSHEET_NAMESPACES}>${body}</${localName}>`
}

/** Package relationships naming the workbook part. */
const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

/** The workbook part: two sheets, 1900 date system. */
const WORKBOOK = sheetXml('workbook', [
  '<workbookPr date1904="0"/>',
  '<sheets>',
  '<sheet name="Summary" sheetId="1" r:id="rId1"/>',
  '<sheet name="Data" sheetId="2" r:id="rId2"/>',
  '</sheets>',
].join(''))

/** Workbook relationships: both sheets, the style table, the strings, the theme. */
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`

/** Shared strings, addressed by cell index. */
const SHARED_STRINGS = sheetXml('sst', [
  '<si><t>Region</t></si>',
  '<si><t>Revenue</t></si>',
  '<si><t>North</t></si>',
  '<si><t>South</t></si>',
].join(''))

/** Style table: a default format, a bold accented header, and a date format. */
const STYLES = sheetXml('styleSheet', [
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy&quot;年&quot;m&quot;月&quot;d&quot;日&quot;"/></numFmts>',
  '<fonts count="2">',
  '<font><sz val="11"/><name val="Calibri"/><color rgb="FF000000"/></font>',
  '<font><b/><sz val="14"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>',
  '</fonts>',
  '<fills count="3">',
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>',
  '</fills>',
  '<borders count="2">',
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right>',
  '<top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>',
  '</borders>',
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
  '<cellXfs count="4">',
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>',
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
  '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>',
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>',
  '</cellXfs>',
].join(''))

/** Theme with the colour scheme and the minor typeface. */
const THEME = xml('a:theme', [
  '<a:themeElements>',
  '<a:clrScheme name="Office">',
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>',
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>',
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2>',
  '<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>',
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1>',
  '<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>',
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>',
  '<a:accent4><a:srgbClr val="FFC000"/></a:accent4>',
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>',
  '<a:accent6><a:srgbClr val="70AD47"/></a:accent6>',
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink>',
  '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>',
  '</a:clrScheme>',
  '<a:fontScheme name="Office">',
  '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/></a:majorFont>',
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="宋体"/></a:minorFont>',
  '</a:fontScheme>',
  '<a:fmtScheme name="Office"/>',
  '</a:themeElements>',
].join(''))

/** The first sheet: a merged header, a frozen row, and every cell type. */
const SHEET_ONE = sheetXml('worksheet', [
  '<sheetFormatPr defaultRowHeight="15" defaultColWidth="8.43"/>',
  '<cols><col min="1" max="1" width="20" customWidth="1"/><col min="3" max="3" width="0" hidden="1"/></cols>',
  '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
  '<sheetData>',
  '<row r="1" ht="30" customHeight="1">',
  '<c r="A1" s="1" t="s"><v>0</v></c>',
  '<c r="B1" s="1" t="s"><v>1</v></c>',
  '</row>',
  '<row r="2">',
  '<c r="A2" t="s"><v>2</v></c>',
  '<c r="B2" s="2"><v>44197</v></c>',
  '<c r="C2"><v>1234.5678</v></c>',
  '<c r="D2" t="b"><v>1</v></c>',
  '<c r="E2" s="3"><v>44197</v></c>',
  '<c r="F2"><f>B2*2</f><v>88394</v></c>',
  '<c r="G2" t="str"><f>CONCATENATE(&quot;a&quot;,&quot;b&quot;)</f><v>ab</v></c>',
  '</row>',
  '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" s="2"><v>45000</v></c></row>',
  '</sheetData>',
  '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>',
  '<hyperlinks><hyperlink ref="A3" r:id="rIdLink"/></hyperlinks>',
].join(''))

/** The first sheet's relationships: one external hyperlink. */
const SHEET_ONE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/report" TargetMode="External"/>
</Relationships>`

/** The second sheet, which carries only a title cell. */
const SHEET_TWO = sheetXml('worksheet', [
  '<sheetFormatPr defaultRowHeight="15"/>',
  '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Notes</t></is></c></row></sheetData>',
].join(''))

/**
 * A worksheet with many populated rows, for the virtualisation spec.
 * @param count - how many data rows to write, beyond the header.
 * @returns the worksheet part.
 */
function tallSheet(count: number): string {
  const header = ['<row r="1">']
  for (let column = 0; column < 4; column += 1) {
    header.push(`<c r="${columnName(column)}1" t="inlineStr"><is><t>Column ${columnName(column)}</t></is></c>`)
  }
  header.push('</row>')
  const rows: string[] = [header.join('')]
  for (let row = 2; row <= count + 1; row += 1) {
    const cells = [`<c r="A${row}"><v>${row - 1}</v></c>`]
    for (let column = 1; column < 4; column += 1) {
      cells.push(`<c r="${columnName(column)}${row}" t="inlineStr"><is><t>${columnName(column)}${row - 1}</t></is></c>`)
    }
    rows.push(`<row r="${row}">${cells.join('')}</row>`)
  }
  return sheetXml('worksheet', [
    '<sheetFormatPr defaultRowHeight="15"/>',
    `<sheetData>${rows.join('')}</sheetData>`,
  ].join(''))
}

/**
 * The column letters for a 0-based column.
 * @param index - the 0-based column.
 * @returns the column name.
 */
function columnName(index: number): string {
  let remaining = index
  let name = ''
  do {
    name = String.fromCharCode(65 + (remaining % 26)) + name
    remaining = Math.floor(remaining / 26) - 1
  } while (remaining >= 0)
  return name
}

/**
 * Build one worksheet part with a chosen number of rows.
 * @param rows - how many data rows the sheet carries.
 * @returns the worksheet part.
 */
export function tallXlsxSheet(rows: number): string {
  return tallSheet(rows)
}

/** The parts a fixture build can add to the default workbook. */
export interface XlsxFixtureOptions {
  /** Replace the first sheet with one carrying this many data rows. */
  readonly rows?: number
}

/**
 * Every part of the fixture workbook.
 * @param options - optional part overrides.
 * @returns the ZIP entry list.
 */
export function xlsxFixtureEntries(options: XlsxFixtureOptions = {}): readonly ZipEntryInput[] {
  const first = options.rows === undefined ? SHEET_ONE : tallSheet(options.rows)
  return [
    { name: 'xl/workbook.xml', text: WORKBOOK },
    { name: 'xl/_rels/workbook.xml.rels', text: WORKBOOK_RELS },
    { name: 'xl/sharedStrings.xml', text: SHARED_STRINGS },
    { name: 'xl/styles.xml', text: STYLES },
    { name: 'xl/theme/theme1.xml', text: THEME },
    { name: 'xl/worksheets/sheet1.xml', text: first },
    { name: 'xl/worksheets/_rels/sheet1.xml.rels', text: SHEET_ONE_RELS },
    { name: 'xl/worksheets/sheet2.xml', text: SHEET_TWO },
    { name: '_rels/.rels', text: PACKAGE_RELS, stored: true },
  ]
}

/**
 * Build the fixture workbook; every part is stored uncompressed so the package
 * parses in environments without `DecompressionStream`.
 * @param options - optional part overrides.
 * @returns the container bytes.
 */
export async function xlsxFixture(options: XlsxFixtureOptions = {}): Promise<Uint8Array> {
  return await buildZip(xlsxFixtureEntries(options).map(entry => ({ ...entry, stored: true })))
}
