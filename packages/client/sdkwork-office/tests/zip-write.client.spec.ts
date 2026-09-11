/**
 * ZIP rewriting: the save path an edited office document goes through.
 *
 * The promise under test is not "a container comes back" but "only what was
 * replaced changed": an untouched part keeps its exact stored bytes and its
 * compression, so a saved copy differs from its source only where the editor
 * actually wrote.
 */
import { describe, expect, it } from 'vitest'
import { ZipPackage } from '../src/ooxml/zip.ts'
import { crc32, rewriteZip } from '../src/ooxml/zip-write.ts'
import { buildZip } from './zip-fixture.client.ts'

/** A ZIP64 extra field, which the writer must refuse rather than misdescribe. */
const ZIP64_EXTRA = [0x01, 0x00, 0x00, 0x00]

/** An extended-timestamp extra field, which the writer must simply walk past. */
const TIMESTAMP_EXTRA = [0x55, 0x54, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00]

describe('crc32', () => {
  it('matches the published check value and the empty-string value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('rewriteZip', () => {
  it('replaces a part and carries every other part over untouched', async () => {
    const original = await buildZip([
      { name: 'xl/worksheets/sheet1.xml', text: '<sheetData><row r="1"/></sheetData>' },
      { name: 'xl/styles.xml', text: '<styleSheet/>', stored: true },
    ])
    const before = ZipPackage.open(original)

    const saved = await rewriteZip(original, new Map([['xl/worksheets/sheet1.xml', '<sheetData/>']]))
    const after = ZipPackage.open(saved)

    expect(after.names()).toEqual(['xl/worksheets/sheet1.xml', 'xl/styles.xml'])
    expect(await after.readText('xl/worksheets/sheet1.xml')).toBe('<sheetData/>')
    expect(await after.readText('xl/styles.xml')).toBe('<styleSheet/>')

    // The replaced part is recompressed, so it is DEFLATE and its recorded CRC
    // is the checksum of the new text.
    const replaced = after.records().find(record => record.name === 'xl/worksheets/sheet1.xml')
    expect(replaced?.method).toBe(8)
    expect(replaced?.crc).toBe(crc32(new TextEncoder().encode('<sheetData/>')))

    // The part nobody touched is copied verbatim: same stored compression, and
    // the same compressed bytes, not a deflated round trip.
    const carriedBefore = before.storedPayload('xl/styles.xml')
    const carriedAfter = after.storedPayload('xl/styles.xml')
    expect(after.records().find(record => record.name === 'xl/styles.xml')?.method).toBe(0)
    expect(Array.from(carriedAfter ?? [])).toEqual(Array.from(carriedBefore ?? []))
    expect(await after.readText('xl/styles.xml')).toBe('<styleSheet/>')
  })

  it('appends a part the container never had, after the original entries', async () => {
    const original = await buildZip([{ name: 'a.xml', text: '<a/>' }])
    const saved = await rewriteZip(original, new Map([
      ['a.xml', '<a edited="1"/>'],
      ['xl/worksheets/sheet2.xml', '<sheetData/>'],
    ]))
    const after = ZipPackage.open(saved)
    expect(after.names()).toEqual(['a.xml', 'xl/worksheets/sheet2.xml'])
    expect(await after.readText('a.xml')).toBe('<a edited="1"/>')
    expect(await after.readText('xl/worksheets/sheet2.xml')).toBe('<sheetData/>')
    expect(after.records().find(record => record.name === 'xl/worksheets/sheet2.xml')?.method).toBe(8)
  })

  it('rewrites an empty replacement without losing the entry', async () => {
    const original = await buildZip([{ name: 'part.xml', text: '<gone/>' }])
    const saved = await rewriteZip(original, new Map([['part.xml', '']]))
    const after = ZipPackage.open(saved)
    expect(await after.readText('part.xml')).toBe('')
    expect(after.records().find(record => record.name === 'part.xml')?.uncompressedSize).toBe(0)
  })

  it('leaves the container alone when nothing is replaced', async () => {
    const original = await buildZip([
      { name: 'one.xml', text: '<one/>' },
      { name: 'two.xml', text: '<two/>', stored: true },
    ])
    const saved = await rewriteZip(original, new Map())
    const after = ZipPackage.open(saved)
    expect(await after.readText('one.xml')).toBe('<one/>')
    expect(await after.readText('two.xml')).toBe('<two/>')
  })

  it('walks past an extra field that is not ZIP64', async () => {
    const original = await buildZip([{ name: 'a.xml', text: '<a/>', extra: TIMESTAMP_EXTRA }])
    const saved = await rewriteZip(original, new Map([['a.xml', '<a/>']]))
    await expect(ZipPackage.open(saved).readText('a.xml')).resolves.toBe('<a/>')
  })

  it('refuses a container whose local header declares ZIP64', async () => {
    const original = await buildZip([{ name: 'a.xml', text: '<a/>', extra: ZIP64_EXTRA }])
    await expect(rewriteZip(original, new Map([['a.xml', '<a/>']]))).rejects.toThrow(/ZIP64/u)
  })

  it('round-trips a part larger than one compression chunk', async () => {
    const text = `<sheetData>${'<row r="1"/>'.repeat(4000)}</sheetData>`
    const original = await buildZip([{ name: 'big.xml', text: 'small' }])
    const saved = await rewriteZip(original, new Map([['big.xml', text]]))
    expect(await ZipPackage.open(saved).readText('big.xml')).toBe(text)
  })
})
