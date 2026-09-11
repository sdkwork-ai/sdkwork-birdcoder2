/** ZIP container reading: stored and deflated parts, indexing, and refusals. */
import { describe, expect, it } from 'vitest'
import { ZipFormatError, ZipPackage } from '../src/ooxml/zip.ts'
import { buildZip, crc32 } from './zip-fixture.client.ts'

describe('ZipPackage', () => {
  it('reads stored and deflated parts and indexes every name', async () => {
    const bytes = await buildZip([
      { name: 'a/stored.xml', text: '<a/>', stored: true },
      { name: 'a/deflated.xml', text: '<b>'.repeat(200) },
      { name: 'empty.txt', text: '' },
    ])
    const pkg = ZipPackage.open(bytes)
    expect(pkg.names()).toEqual(['a/stored.xml', 'a/deflated.xml', 'empty.txt'])
    expect(pkg.has('a/stored.xml')).toBe(true)
    expect(pkg.has('missing.xml')).toBe(false)
    expect(await pkg.readText('a/stored.xml')).toBe('<a/>')
    expect(await pkg.readText('a/deflated.xml')).toBe('<b>'.repeat(200))
    expect(await pkg.readText('empty.txt')).toBe('')
    expect(await pkg.read('missing.xml')).toBeUndefined()
    // A repeated read is served from the cache and returns identical bytes.
    expect(await pkg.readText('a/stored.xml')).toBe('<a/>')
  })

  it('refuses bytes that are not a ZIP container', () => {
    expect(() => ZipPackage.open(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(ZipFormatError)
  })

  it('refuses an entry whose compression method is not stored or deflate', async () => {
    const bytes = await buildZip([{ name: 'odd.bin', text: 'x', method: 12 }])
    const pkg = ZipPackage.open(bytes)
    await expect(pkg.read('odd.bin')).rejects.toBeInstanceOf(ZipFormatError)
  })

  it('refuses a central entry whose local header is absent', async () => {
    const bytes = await buildZip([{ name: 'part.bin', text: 'payload', stored: true }])
    const broken = bytes.slice()
    const centralStart = broken.indexOf(0x50, 0)
    for (let index = centralStart; index < broken.byteLength - 4; index += 1) {
      if (broken[index] === 0x50 && broken[index + 1] === 0x4b && broken[index + 2] === 0x01 && broken[index + 3] === 0x02) {
        // Point the central record at an offset with no local header.
        broken[index + 42] = 0xff
        broken[index + 43] = 0x00
        break
      }
    }
    const pkg = ZipPackage.open(broken)
    await expect(pkg.read('part.bin')).rejects.toBeInstanceOf(ZipFormatError)
  })

  it('refuses one part whose recorded inflation exceeds the entry limit', async () => {
    const bytes = await buildZip([{ name: 'bomb.bin', text: 'payload', stored: true }])
    patchUncompressedSize(bytes, 'bomb.bin', 300 * 1024 * 1024)
    const pkg = ZipPackage.open(bytes)
    await expect(pkg.read('bomb.bin')).rejects.toThrow(/entry limit/u)
  })

  it('refuses a part whose recorded inflation would push the package past the total limit', async () => {
    const bytes = await buildZip([{ name: 'bomb.bin', text: 'payload', stored: true }])
    patchUncompressedSize(bytes, 'bomb.bin', 600 * 1024 * 1024)
    const pkg = ZipPackage.open(bytes)
    await expect(pkg.read('bomb.bin')).rejects.toThrow(/total inflation limit/u)
  })
})

/**
 * Rewrite one central-directory record's uncompressed size, as a hostile
 * container would lie about it. Only the metadata changes, so the refusal is
 * exercised without allocating the claimed bytes.
 * @param bytes - the container to patch in place.
 * @param name - the entry whose record to patch.
 * @param size - the uncompressed size to claim.
 */
function patchUncompressedSize(bytes: Uint8Array, name: string, size: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  for (let offset = 0; offset + 46 <= view.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue
    const nameLength = view.getUint16(offset + 28, true)
    if (decoder.decode(new Uint8Array(bytes.buffer, bytes.byteOffset + offset + 46, nameLength)) !== name) continue
    view.setUint32(offset + 24, size, true)
    return
  }
  throw new Error(`no central record for ${name}`)
}

describe('crc32', () => {
  it('matches the reference checksum of the deflate test vector', () => {
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })
})
