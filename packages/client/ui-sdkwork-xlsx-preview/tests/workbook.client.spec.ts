// @vitest-environment jsdom
/** Workbook parsing: sheets, styles, values, merges, freeze, and refusals. */
import { describe, expect, it } from 'vitest'
import { columnName, parseReference, parseXlsx, XlsxParseError } from '../src/client/xlsx/workbook.ts'
import { xlsxFixture, xlsxFixtureEntries } from './xlsx-fixture.client.ts'
import { buildZip } from './zip-fixture.client.ts'

/** The labels every parse call needs. */
const LABELS = { sheetName: (index: number) => `Sheet ${index}` }

describe('reference helpers', () => {
  it('converts between column indexes and A1 names', () => {
    expect(columnName(0)).toBe('A')
    expect(columnName(25)).toBe('Z')
    expect(columnName(26)).toBe('AA')
    expect(columnName(701)).toBe('ZZ')
    expect(parseReference('B3')).toEqual({ column: 1, row: 2 })
    expect(parseReference('AA10')).toEqual({ column: 26, row: 9 })
    expect(parseReference('nope')).toBeUndefined()
  })
})

describe('parseXlsx', () => {
  it('builds the sheet model through the styles, strings, and theme tables', async () => {
    const parsed = await parseXlsx(await xlsxFixture(), LABELS)
    try {
      expect(parsed.workbook.date1904).toBe(false)
      expect(parsed.workbook.sheets.map(sheet => sheet.name)).toEqual(['Summary', 'Data'])

      const sheet = parsed.workbook.sheets[0]
      expect(sheet.index).toBe(1)
      // Column A is 20 characters wide and column C is hidden.
      expect(sheet.columnWidths.get(0)).toBe(145)
      expect(sheet.columnWidths.get(2)).toBe(0)
      expect(sheet.defaultColumnWidth).toBe(64)
      // The first row states a 30pt height.
      expect(sheet.rowHeights.get(0)).toBe(40)
      expect(sheet.defaultRowHeight).toBe(20)
      expect(sheet.freeze).toEqual({ rows: 1, columns: 0 })
      expect(sheet.merges).toEqual([{ top: 0, left: 0, bottom: 0, right: 1 }])
      expect(sheet.extent).toEqual({ columns: 6, rows: 2 })
      // The laid-out grid carries an empty tail past the content, because a
      // spreadsheet surface fills its window whatever the workbook holds; the
      // used range above is what `Ctrl+End` and `Ctrl+A` stay on. Column C is
      // hidden, so the tail's 1024 columns lay out as 1023 positions.
      expect(sheet.index2d.columns.length).toBe(1023)
      expect(sheet.index2d.rows.length).toBe(4096)
      expect(sheet.index2d.columns.slice(-1)[0]).toBe(1023)
      expect(sheet.index2d.rows.slice(-1)[0]).toBe(4095)
      // The tail never revives the hidden column.
      expect(sheet.index2d.columnPosition.get(2)).toBeUndefined()
      expect(sheet.index2d.columnPosition.get(1023)).toBe(1022)

      const header = sheet.rows[0].cells[0]
      expect(header.text).toBe('Region')
      expect(header.reference).toBe('A1')
      expect(header.format.font.bold).toBe(true)
      expect(header.format.font.color).toBe('#FFFFFF')
      expect(header.format.font.sizePx).toBeCloseTo(18.667, 2)
      expect(header.format.fill).toBe('#4472C4')
      expect(header.format.borders.bottom).toMatchObject({ color: '#000000', widthPx: 1, dashed: false })
      expect(header.format.alignment).toMatchObject({ horizontal: 'center', vertical: 'center', wrapText: true })

      const second = sheet.rows[1].cells
      // A shared string, a builtin date format, a plain number, a boolean, a
      // custom date format, a numeric formula, and a string formula.
      expect(second.map(cell => cell.text)).toEqual([
        'North', '01-01-21', '1234.5678', 'TRUE', '2021年1月1日', '88394', 'ab',
      ])
      expect(second.map(cell => cell.kind)).toEqual([
        'string', 'date', 'number', 'boolean', 'date', 'number', 'string',
      ])
      // The date keeps its serial as the raw value the formula bar shows.
      expect(second[1].raw).toBe('44197')
      expect(second[5].formula).toBe('B2*2')
      expect(sheet.rows[2].cells[0].hyperlink).toBe('https://example.com/report')
      expect(sheet.rows[2].cells[1].text).toBe('03-15-23')
    } finally {
      parsed.dispose()
    }
  })

  it('reads an inline string sheet and falls back to default geometry', async () => {
    const parsed = await parseXlsx(await xlsxFixture(), LABELS)
    try {
      const sheet = parsed.workbook.sheets[1]
      expect(sheet.name).toBe('Data')
      expect(sheet.freeze).toEqual({ rows: 0, columns: 0 })
      expect(sheet.rows[0].cells[0].text).toBe('Notes')
      expect(sheet.defaultColumnWidth).toBe(64)
    } finally {
      parsed.dispose()
    }
  })

  it('refuses a legacy binary workbook', async () => {
    const bytes = new Uint8Array(32)
    bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    await expect(parseXlsx(bytes, LABELS)).rejects.toMatchObject({ code: 'legacy-binary' })
  })

  it('refuses bytes that are not a package', async () => {
    await expect(parseXlsx(new Uint8Array([1, 2, 3, 4]), LABELS)).rejects.toMatchObject({ code: 'not-a-package' })
  })

  it('refuses a package with no workbook relationship', async () => {
    const bytes = await buildZip([{ name: 'README.txt', text: 'nothing here' }])
    await expect(parseXlsx(bytes, LABELS)).rejects.toMatchObject({ code: 'no-workbook' })
  })

  it('refuses a workbook that lists no sheets', async () => {
    const entries = xlsxFixtureEntries().map(entry => (
      entry.name === 'xl/workbook.xml'
        ? { ...entry, text: entry.text.replace(/<sheets>.*<\/sheets>/u, '<sheets/>') }
        : entry
    ))
    const failure = await parseXlsx(await buildZip(entries), LABELS).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(XlsxParseError)
    expect(failure).toMatchObject({ code: 'no-workbook' })
  })

  it('falls back to generated sheet names and tolerates a missing theme', async () => {
    const entries = xlsxFixtureEntries()
      .filter(entry => entry.name !== 'xl/theme/theme1.xml')
      .map(entry => (entry.name === 'xl/workbook.xml'
        ? { ...entry, text: entry.text.replace(/ name="(?:Summary|Data)"/gu, '') }
        : entry))
    const parsed = await parseXlsx(await buildZip(entries), LABELS)
    try {
      expect(parsed.workbook.sheets.map(sheet => sheet.name)).toEqual(['Sheet 1', 'Sheet 2'])
      // Without a theme the header fill still resolves, because it states rgb.
      expect(parsed.workbook.sheets[0].rows[0].cells[0].format.fill).toBe('#4472C4')
    } finally {
      parsed.dispose()
    }
  })
})
