/**
 * A minimal ZIP writer for test fixtures.
 *
 * The reader under test is the only consumer, so this writes exactly what the
 * OOXML producers write: stored and raw-DEFLATE entries with a central
 * directory. Building fixtures in code keeps the package free of binary test
 * data and makes every container variation (compression method, ZIP64 fields)
 * expressible as a test input.
 *
 * The checksum is the shipped `crc32`, not a second copy of it: a fixture that
 * reimplements the algorithm could agree with a broken reader, so the shipped
 * one is pinned against a published test vector in the spec instead.
 */
import { crc32 } from '../src/ooxml/zip-write.ts'

/** One fixture entry. */
export interface ZipEntryInput {
  readonly name: string
  readonly text: string
  /** Store the entry uncompressed instead of deflating it. */
  readonly stored?: boolean
  /** Compression method to record, for containers the reader must refuse. */
  readonly method?: number
  /**
   * Raw extra-field bytes to place in both headers, as a producer would.
   *
   * The container still records real sizes in the fixed header fields, so the
   * reader's ZIP64 resolution is unaffected; this exists so a test can present
   * a header the *writer* must refuse, or one it must walk past.
   */
  readonly extra?: readonly number[]
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
    readonly extra: readonly number[]
    readonly crc: number
    readonly compressed: number
    readonly size: number
    readonly method: number
    readonly offset: number
  }[] = []
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const raw = encoder.encode(entry.text)
    const extra = entry.extra ?? []
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
    sink.u16(extra.length)
    sink.push([...name])
    sink.push([...extra])
    sink.push([...payload])
    central.push({ name, extra, crc, compressed: payload.byteLength, size: raw.byteLength, method, offset })
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
    header.u16(entry.extra.length)
    header.u16(0)
    header.u16(0)
    header.u16(0)
    header.u32(0)
    header.u32(entry.offset)
    sink.push([...header.bytes()])
    sink.push([...entry.name])
    sink.push([...entry.extra])
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
 * @returns the complete part text.
 */
export function xml(localName: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${localName} ${FIXTURE_NAMESPACES}>${body}</${localName}>`
}
