/**
 * A minimal ZIP writer for test fixtures.
 *
 * The reader under test is the only consumer, so this writes exactly what the
 * OOXML producers write: stored and raw-DEFLATE entries with a central
 * directory. Building fixtures in code keeps the package free of binary test
 * data and makes every container variation (compression method, ZIP64 fields)
 * expressible as a test input.
 */

/** CRC-32 lookup table, built once. */
const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

/**
 * Compute the CRC-32 of a byte range.
 * @param data - the bytes to checksum.
 * @returns the unsigned checksum.
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}

/** One fixture entry. */
export interface ZipEntryInput {
  readonly name: string
  readonly text: string
  /** Store the entry uncompressed instead of deflating it. */
  readonly stored?: boolean
  /** Compression method to record, for containers the reader must refuse. */
  readonly method?: number
}

/** A growable byte sink. */
class ByteSink {
  private readonly chunks: number[] = []

  /** @param bytes - bytes to append. */
  push(bytes: readonly number[]): void {
    this.chunks.push(...bytes)
  }

  /** @param value - a 16-bit little-endian value to append. */
  u16(value: number): void {
    this.push([value & 0xff, (value >>> 8) & 0xff])
  }

  /** @param value - a 32-bit little-endian value to append. */
  u32(value: number): void {
    this.push([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff])
  }

  /** @returns the accumulated bytes. */
  bytes(): Uint8Array {
    return Uint8Array.from(this.chunks)
  }
}

/**
 * Deflate bytes with the raw DEFLATE stream ZIP uses.
 *
 * Reads the compression stream directly rather than through `Response`, because
 * a jsdom environment replaces `Blob` with a stub that has no `stream()`.
 * @param data - uncompressed bytes.
 * @returns the compressed bytes.
 */
async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  void writer.write(data.slice())
  void writer.close()
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * Build a ZIP container.
 * @param entries - parts to store, in the order they should appear.
 * @returns the complete container bytes.
 */
export async function buildZip(entries: readonly ZipEntryInput[]): Promise<Uint8Array> {
  const sink = new ByteSink()
  const encoder = new TextEncoder()
  const central: {
    readonly name: Uint8Array
    readonly crc: number
    readonly compressed: number
    readonly size: number
    readonly method: number
    readonly offset: number
  }[] = []
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const raw = encoder.encode(entry.text)
    const method = entry.method ?? (entry.stored === true ? 0 : 8)
    const payload = method === 0 ? raw : await deflateRaw(raw)
    const crc = crc32(raw)
    const offset = sink.bytes().byteLength
    sink.u32(0x04034b50)
    sink.u16(20)
    sink.u16(0)
    sink.u16(method)
    sink.u16(0)
    sink.u16(0)
    sink.u32(crc)
    sink.u32(payload.byteLength)
    sink.u32(raw.byteLength)
    sink.u16(name.byteLength)
    sink.u16(0)
    sink.push([...name])
    sink.push([...payload])
    central.push({ name, crc, compressed: payload.byteLength, size: raw.byteLength, method, offset })
  }
  const directoryOffset = sink.bytes().byteLength
  for (const entry of central) {
    const header = new ByteSink()
    header.u32(0x02014b50)
    header.u16(20)
    header.u16(20)
    header.u16(0)
    header.u16(entry.method)
    header.u16(0)
    header.u16(0)
    header.u32(entry.crc)
    header.u32(entry.compressed)
    header.u32(entry.size)
    header.u16(entry.name.byteLength)
    header.u16(0)
    header.u16(0)
    header.u16(0)
    header.u16(0)
    header.u32(0)
    header.u32(entry.offset)
    sink.push([...header.bytes()])
    sink.push([...entry.name])
  }
  const directorySize = sink.bytes().byteLength - directoryOffset
  sink.u32(0x06054b50)
  sink.u16(0)
  sink.u16(0)
  sink.u16(central.length)
  sink.u16(central.length)
  sink.u32(directorySize)
  sink.u32(directoryOffset)
  sink.u16(0)
  return sink.bytes()
}

/** The namespace declarations every OOXML fixture part needs. */
export const FIXTURE_NAMESPACES =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

/**
 * Declare the XML prolog and namespaces for a fixture part.
 * @param localName - the root element's local name.
 * @param body - the root element's content.
 * @param rootAttributes - extra attributes on the root element.
 * @returns the complete part text.
 */
export function xml(localName: string, body: string, rootAttributes = ''): string {
  const attributes = rootAttributes === '' ? '' : ` ${rootAttributes}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${localName} ${FIXTURE_NAMESPACES}${attributes}>${body}</${localName}>`
}
