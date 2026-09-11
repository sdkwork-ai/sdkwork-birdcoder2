// @vitest-environment jsdom
/**
 * Saving an edited workbook.
 *
 * Two layers: the text patch that rewrites a worksheet part, driven on
 * hand-written XML so a failure names the patch rather than the fixture, and the
 * package build, driven on the real fixture workbook and verified by parsing the
 * saved bytes back — the only assertion that proves a reader would see the edit.
 */
import { describe, expect, it } from 'vitest'
import { ZipPackage } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { XlsxEditMap, XlsxEntry } from '../src/client/xlsx/edits.ts'
import type { XlsxWorkbook } from '../src/client/xlsx/model.ts'
import { parseXlsx } from '../src/client/xlsx/workbook.ts'
import { buildEditedWorkbook, patchSheetXml, withFullRecalc } from '../src/client/xlsx/serialize.ts'
import { makeSheet } from './sheet-fixture.client.ts'
import { xlsxFixture } from './xlsx-fixture.client.ts'
import { buildZip } from './zip-fixture.client.ts'

/** The labels every parse call needs. */
const LABELS = { sheetName: (index: number) => `Sheet ${index}` }

/**
 * A batch of entries, as one commit would carry them.
 * @param reference - the first reference.
 * @param entry - the first entry.
 * @param more - further reference and entry pairs.
 * @returns the batch.
 */
function batch(
  reference: string,
  entry: XlsxEntry,
  ...more: readonly (readonly [string, XlsxEntry])[]
): XlsxEditMap {
  return new Map([[reference, entry], ...more])
}

/** A root relationship naming a workbook part the container does not carry. */
const RELS_TO_MISSING_WORKBOOK = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
  + ' Target="xl/workbook.xml"/></Relationships>'

/** A worksheet part with the shape a real producer writes. */
const SHEET = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<sheetData><row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1"><v>2</v></c></row></sheetData>'
  + '</worksheet>'

/** The first row element out of a patched part, for a readable assertion. */
function rowOf(xml: string): string {
  return /<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/u.exec(xml)?.[0] ?? ''
}

describe('patchSheetXml', () => {
  it('returns the part itself when nothing was edited', () => {
    expect(patchSheetXml(SHEET, new Map())).toBe(SHEET)
  })

  it('replaces a number in place and keeps the style the cell carried', () => {
    const patched = patchSheetXml(SHEET, batch('A1', { kind: 'number', value: 42 }))
    expect(patched).toContain('<c r="A1" s="1"><v>42</v></c>')
    expect(patched).toContain('<c r="B1"><v>2</v></c>')
  })

  it('writes text as an inline string, so the string table never changes', () => {
    const patched = patchSheetXml(SHEET, batch('B1', { kind: 'text', value: 'north' }))
    expect(patched).toContain('<c r="B1" t="inlineStr"><is><t>north</t></is></c>')
  })

  it('preserves the whitespace a text run needs', () => {
    const padded = patchSheetXml(SHEET, batch('B1', { kind: 'text', value: '  north' }))
    expect(padded).toContain('<t xml:space="preserve">  north</t>')
    // Any newline a reader pasted needs it too.
    const wrapped = patchSheetXml(SHEET, batch('B1', { kind: 'text', value: 'a\nb' }))
    expect(wrapped).toContain('<t xml:space="preserve">a\nb</t>')
  })

  it('escapes the characters that would break the part', () => {
    const patched = patchSheetXml(SHEET, batch('B1', { kind: 'text', value: 'a<b&c>d' }))
    expect(patched).toContain('<t>a&lt;b&amp;c&gt;d</t>')
  })

  it('drops a control character XML forbids rather than escaping it', () => {
    const patched = patchSheetXml(SHEET, batch('B1', { kind: 'text', value: 'a\u0000b\u0007c' }))
    expect(patched).toContain('<t>abc</t>')
  })

  it('escapes a formula body that carries markup characters', () => {
    const patched = patchSheetXml(SHEET, batch('B1', { kind: 'formula', formula: 'A1<2&"x"' }))
    expect(patched).toContain('<c r="B1"><f>A1&lt;2&amp;"x"</f></c>')
  })

  it('writes a boolean with the OOXML spelling', () => {
    expect(patchSheetXml(SHEET, batch('B1', { kind: 'boolean', value: true })))
      .toContain('<c r="B1" t="b"><v>1</v></c>')
    expect(patchSheetXml(SHEET, batch('B1', { kind: 'boolean', value: false })))
      .toContain('<c r="B1" t="b"><v>0</v></c>')
  })

  it('removes a cleared cell from its row', () => {
    const patched = patchSheetXml(SHEET, batch('A1', { kind: 'empty' }))
    expect(patched).not.toContain('<c r="A1"')
    expect(patched).toContain('<c r="B1"><v>2</v></c>')
  })

  it('inserts a new cell in column order', () => {
    const patched = patchSheetXml(SHEET, batch('A1', { kind: 'text', value: 'x' }, ['C1', { kind: 'text', value: 'z' }]))
    expect(rowOf(patched)).toBe('<row r="1"><c r="A1" s="1" t="inlineStr"><is><t>x</t></is></c>'
      + '<c r="B1"><v>2</v></c><c r="C1" t="inlineStr"><is><t>z</t></is></c></row>')
  })

  it('inserts a cell before the first existing one', () => {
    // Column A is outside the row's own cells, so the insert lands at the front.
    const withoutA = '<worksheet><sheetData><row r="1"><c r="B1"><v>2</v></c></row></sheetData></worksheet>'
    expect(rowOf(patchSheetXml(withoutA, batch('A1', { kind: 'number', value: 1 }))))
      .toBe('<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c></row>')
  })

  it('appends a cell past the row’s last one', () => {
    expect(rowOf(patchSheetXml(SHEET, batch('D1', { kind: 'number', value: 4 }))))
      .toBe('<row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1"><v>2</v></c><c r="D1"><v>4</v></c></row>')
  })

  it('writes a whole row the sheet never had, in row order', () => {
    const patched = patchSheetXml(SHEET, batch('A3', { kind: 'number', value: 3 }, ['A2', { kind: 'number', value: 2 }]))
    expect(patched).toContain('<row r="2"><c r="A2"><v>2</v></c></row><row r="3"><c r="A3"><v>3</v></c></row>')
    // The new rows arrive after the row the sheet did have.
    expect(patched.indexOf('<row r="1"')).toBeLessThan(patched.indexOf('<row r="2"'))
  })

  it('writes a new row ahead of the row that follows it', () => {
    const spread = '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row>'
      + '<row r="3"><c r="A3"><v>3</v></c></row></sheetData></worksheet>'
    expect(patchSheetXml(spread, batch('A2', { kind: 'number', value: 2 })))
      .toContain('<row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row>'
        + '<row r="3"><c r="A3"><v>3</v></c></row>')
  })

  it('writes a row that follows a self-closing one', () => {
    const selfClosing = '<worksheet><sheetData><row r="1"/></sheetData></worksheet>'
    const patched = patchSheetXml(selfClosing, batch('A2', { kind: 'number', value: 2 }, ['A1', { kind: 'number', value: 1 }]))
    expect(patched).toContain('<row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row>')
  })

  it('expands a self-closing sheetData, which a brand-new sheet has', () => {
    const empty = '<worksheet><sheetData/></worksheet>'
    expect(patchSheetXml(empty, batch('A1', { kind: 'number', value: 1 })))
      .toBe('<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>')
  })

  it('leaves a pretty-printed row’s own whitespace alone', () => {
    const pretty = '<worksheet><sheetData>\n  <row r="1">\n    <c r="A1"><v>1</v></c>\n  </row>\n</sheetData></worksheet>'
    const patched = patchSheetXml(pretty, batch('A1', { kind: 'number', value: 9 }))
    expect(patched).toBe(pretty.replace('<v>1</v>', '<v>9</v>'))
  })

  it('leaves an element it cannot place alone', () => {
    const odd = '<worksheet><sheetData><row><c><v>1</v></c></row>'
      + '<row r="2"><c><v>2</v></c></row><row r="3"><c r="A3"><v>3</v></c></row></sheetData></worksheet>'
    const patched = patchSheetXml(odd, batch('B2', { kind: 'number', value: 22 }))
    // A row with no position and a cell with no reference are both left exactly
    // as they were, and the edit still lands in the row it names.
    expect(patched).toContain('<row><c><v>1</v></c></row>')
    expect(patched).toContain('<row r="3"><c r="A3"><v>3</v></c></row>')
    const row = /<row r="2">[\s\S]*?<\/row>/u.exec(patched)?.[0] ?? ''
    expect(row).toContain('<c r="B2"><v>22</v></c>')
    expect(row).toContain('<c><v>2</v></c>')
  })

  it('leaves a part that declares no sheet data alone', () => {
    const bare = '<worksheet><sheetViews/></worksheet>'
    expect(patchSheetXml(bare, batch('A1', { kind: 'number', value: 1 }))).toBe(bare)
  })

  it('drops an edit naming a reference outside the worksheet', () => {
    const patched = patchSheetXml(SHEET, batch('A1', { kind: 'number', value: 7 }, ['XFE1', { kind: 'number', value: 8 }]))
    expect(patched).toContain('<c r="A1" s="1"><v>7</v></c>')
    expect(patched).not.toContain('XFE')
  })
})

describe('withFullRecalc', () => {
  it('adds the flag at the end of a workbook that declares none', () => {
    expect(withFullRecalc('<workbook><sheets/></workbook>'))
      .toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/></workbook>')
  })

  it('adds the flag ahead of the extension list the schema places it before', () => {
    expect(withFullRecalc('<workbook><sheets/><extLst><ext/></extLst></workbook>'))
      .toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/><extLst><ext/></extLst></workbook>')
  })

  it('replaces the settings a workbook already states', () => {
    expect(withFullRecalc('<workbook><calcPr calcId="191029"/></workbook>'))
      .toBe('<workbook><calcPr fullCalcOnLoad="1"/></workbook>')
  })

  it('replaces paired settings too, rather than leaving two', () => {
    expect(withFullRecalc('<workbook><calcPr></calcPr></workbook>'))
      .toBe('<workbook><calcPr fullCalcOnLoad="1"/></workbook>')
  })
})

describe('buildEditedWorkbook', () => {
  it('returns nothing when no sheet carries an edit', async () => {
    const parsed = await parseXlsx(await xlsxFixture(), LABELS)
    try {
      expect(await buildEditedWorkbook(await xlsxFixture(), parsed.workbook, new Map())).toBeUndefined()
      expect(await buildEditedWorkbook(await xlsxFixture(), parsed.workbook, new Map([[1, new Map()]]))).toBeUndefined()
      // A sheet index the workbook does not have matches nothing either.
      expect(await buildEditedWorkbook(await xlsxFixture(), parsed.workbook, new Map([[9, batch('A1', { kind: 'number', value: 1 })]])))
        .toBeUndefined()
    } finally {
      parsed.dispose()
    }
  })

  it('saves a text edit a further parse reads back', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const bytes = await buildEditedWorkbook(original, parsed.workbook, new Map([
      [1, batch('A2', { kind: 'text', value: 'North & South' })],
    ]))
    parsed.dispose()
    expect(bytes).toBeDefined()
    const reopened = await parseXlsx(bytes ?? new Uint8Array(), LABELS)
    try {
      const cell = reopened.workbook.sheets[0].rows[1].cells[0]
      expect(cell).toMatchObject({ reference: 'A2', text: 'North & South', kind: 'string' })
    } finally {
      reopened.dispose()
    }
  })

  it('saves a number, a boolean, and a cleared cell together', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const bytes = await buildEditedWorkbook(original, parsed.workbook, new Map([[
      1,
      batch(
        'C2',
        { kind: 'number', value: 0.25 },
        ['D2', { kind: 'boolean', value: false }],
        ['E2', { kind: 'empty' }],
      ),
    ]]))
    parsed.dispose()
    const reopened = await parseXlsx(bytes ?? new Uint8Array(), LABELS)
    try {
      const row = reopened.workbook.sheets[0].rows[1]
      expect(row.cells.find(cell => cell.reference === 'C2')?.text).toBe('0.25')
      expect(row.cells.find(cell => cell.reference === 'D2')).toMatchObject({ text: 'FALSE', kind: 'boolean' })
      expect(row.cells.some(cell => cell.reference === 'E2')).toBe(false)
    } finally {
      reopened.dispose()
    }
  })

  it('leaves every part it did not touch byte-identical', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const bytes = await buildEditedWorkbook(original, parsed.workbook, new Map([
      [1, batch('A2', { kind: 'text', value: 'changed' })],
    ]))
    parsed.dispose()
    const before = ZipPackage.open(original)
    const after = ZipPackage.open(bytes ?? new Uint8Array())
    // The untouched sheet, the string table, the styles, and the theme survive
    // exactly; only the edited worksheet differs.
    for (const name of ['xl/worksheets/sheet2.xml', 'xl/sharedStrings.xml', 'xl/styles.xml', 'xl/theme/theme1.xml']) {
      expect(await after.read(name)).toEqual(await before.read(name))
    }
    expect(await after.read('xl/worksheets/sheet1.xml')).not.toEqual(await before.read('xl/worksheets/sheet1.xml'))
  })

  it('writes a new row a further parse lays out', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const bytes = await buildEditedWorkbook(original, parsed.workbook, new Map([
      [1, batch('A5', { kind: 'number', value: 5 })],
    ]))
    parsed.dispose()
    const reopened = await parseXlsx(bytes ?? new Uint8Array(), LABELS)
    try {
      const sheet = reopened.workbook.sheets[0]
      expect(sheet.rows.map(row => row.index)).toEqual([0, 1, 2, 4])
      expect(sheet.rows[3].cells[0]).toMatchObject({ reference: 'A5', text: '5' })
      expect(sheet.extent.rows).toBe(4)
    } finally {
      reopened.dispose()
    }
  })

  it('asks for a recalculation when a formula is written', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const bytes = await buildEditedWorkbook(original, parsed.workbook, new Map([
      [1, batch('B3', { kind: 'formula', formula: 'SUM(B2:B2)' })],
    ]))
    parsed.dispose()
    const after = ZipPackage.open(bytes ?? new Uint8Array())
    expect(await after.readText('xl/workbook.xml')).toContain('<calcPr fullCalcOnLoad="1"/>')
    expect(await after.readText('xl/worksheets/sheet1.xml')).toContain('<c r="B3" s="2"><f>SUM(B2:B2)</f></c>')
  })

  it('leaves the workbook part alone when no formula is written', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const bytes = await buildEditedWorkbook(original, parsed.workbook, new Map([
      [1, batch('A1', { kind: 'number', value: 1 })],
    ]))
    parsed.dispose()
    const before = ZipPackage.open(original)
    const after = ZipPackage.open(bytes ?? new Uint8Array())
    expect(await after.read('xl/workbook.xml')).toEqual(await before.read('xl/workbook.xml'))
  })

  it('keeps the shared string table when a shared-string cell is overwritten', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const bytes = await buildEditedWorkbook(original, parsed.workbook, new Map([
      [1, batch('A2', { kind: 'text', value: 'inlined' })],
    ]))
    parsed.dispose()
    const before = ZipPackage.open(original)
    const after = ZipPackage.open(bytes ?? new Uint8Array())
    // The cell no longer indexes the table, but the table itself is untouched,
    // so every other cell that does index it still resolves.
    expect(await after.readText('xl/sharedStrings.xml')).toBe(await before.readText('xl/sharedStrings.xml'))
    const reopened = await parseXlsx(bytes ?? new Uint8Array(), LABELS)
    try {
      const sheet = reopened.workbook.sheets[0]
      expect(sheet.rows[1].cells[0].text).toBe('inlined')
      // The cell the edit replaced was one of two indexing the table; the other
      // still resolves, which is what proves the table survived.
      expect(sheet.rows[2].cells[0].text).toBe('South')
    } finally {
      reopened.dispose()
    }
  })

  it('keeps a date cell’s own format when its value is rewritten', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const bytes = await buildEditedWorkbook(original, parsed.workbook, new Map([
      [1, batch('E2', { kind: 'number', value: 45000 })],
    ]))
    parsed.dispose()
    const reopened = await parseXlsx(bytes ?? new Uint8Array(), LABELS)
    try {
      // `s="3"` is the fixture's `yyyy年m月d日` format, and the serial is read
      // back as a date rather than as a bare number.
      expect(reopened.workbook.sheets[0].rows[1].cells[4]).toMatchObject({ kind: 'date' })
    } finally {
      reopened.dispose()
    }
  })

  it('skips a sheet whose part the package does not carry', async () => {
    const original = await xlsxFixture()
    const parsed = await parseXlsx(original, LABELS)
    const missing: XlsxWorkbook = {
      ...parsed.workbook,
      sheets: [{ ...parsed.workbook.sheets[0], partName: 'xl/worksheets/gone.xml' }],
    }
    parsed.dispose()
    // A part name the container never had leaves the save with nothing to
    // write, rather than failing the whole workbook.
    expect(await buildEditedWorkbook(original, missing, new Map([[1, batch('A1', { kind: 'number', value: 1 })]])))
      .toBeUndefined()
  })

  it('saves a formula even when the recalculation request has nowhere to go', async () => {
    const sheetPart = { name: 'xl/worksheets/sheet1.xml', text: SHEET, stored: true }
    const workbook: XlsxWorkbook = { sheets: [makeSheet({ partName: 'xl/worksheets/sheet1.xml' })], date1904: false }
    const edits = new Map([[1, batch('B1', { kind: 'formula', formula: '1+1' })]])
    // A package with no root relationship names no workbook part at all.
    expect(await buildEditedWorkbook(await buildZip([sheetPart]), workbook, edits)).toBeDefined()
    // A root relationship naming a part the container lacks is the other half:
    // the name resolves, and there is then nothing to read.
    const absent = await buildZip([sheetPart, { name: '_rels/.rels', text: RELS_TO_MISSING_WORKBOOK, stored: true }])
    const bytes = await buildEditedWorkbook(absent, workbook, edits)
    const after = ZipPackage.open(bytes ?? new Uint8Array())
    expect(await after.readText('xl/worksheets/sheet1.xml')).toContain('<f>1+1</f>')
    // The guard is what keeps the writer from appending a workbook part the
    // source never had.
    expect(await after.readText('xl/workbook.xml')).toBeUndefined()
  })
})
