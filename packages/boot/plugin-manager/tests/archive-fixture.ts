/** Archive builders shared by the plugin-manager specs: a real zip and a real tar.gz. */

import { deflateRawSync, gzipSync } from 'node:zlib'

/** One zip archive, deflating every entry. */
export function zip(files: Readonly<Record<string, string>>): Uint8Array {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text)
    const stored = deflateRawSync(data)
    const fileName = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(stored.byteLength, 18)
    local.writeUInt32LE(data.byteLength, 22)
    local.writeUInt16LE(fileName.byteLength, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(stored.byteLength, 20)
    central.writeUInt32LE(data.byteLength, 24)
    central.writeUInt16LE(fileName.byteLength, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, fileName, stored)
    centrals.push(central, fileName)
    offset += local.byteLength + fileName.byteLength + stored.byteLength
  }
  const directory = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(directory.byteLength, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, eocd])
}

/** One uncompressed tar block for a file. */
function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100, 8, 'latin1')
  header.write('0000000\0', 108, 8, 'latin1')
  header.write('0000000\0', 116, 8, 'latin1')
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'latin1')
  header.write('00000000000\0', 136, 12, 'latin1')
  header.write('        ', 148, 8, 'latin1')
  header.write('0', 156, 1, 'latin1')
  header.write('ustar\0', 257, 6, 'latin1')
  header.write('00', 263, 2, 'latin1')
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'latin1')
  return header
}

/** One gzipped tar archive. */
export function tarGz(files: Readonly<Record<string, string>>): Uint8Array {
  const blocks: Buffer[] = []
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text)
    blocks.push(tarHeader(name, data.byteLength), data, Buffer.alloc((512 - (data.byteLength % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}
