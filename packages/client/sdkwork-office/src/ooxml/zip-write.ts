/**
 * ZIP rewriting for edited OOXML documents.
 *
 * Saving an edit must not rebuild a document from scratch: every part the
 * editor did not touch keeps its exact stored bytes, so untouched XML, media,
 * and theme parts survive byte-identical and a diff of the saved file shows only
 * what the reader actually changed. The writer recompresses only the replaced
 * parts (raw DEFLATE, the method text parts use) and re-lays the local headers,
 * the central directory, and the end-of-directory record.
 *
 * This is the shared half of "an office preview can save a copy": it carries no
 * document semantics, so a presentation and a workbook both rewrite through it.
 */
import { ZipPackage, type StoredPart } from './zip.ts'

/** The raw-DEFLATE compression method a rewritten text part is stored with. */
const DEFLATE_METHOD = 8

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
 * Compute the CRC-32 (IEEE 802.3) of a byte range.
 * @param data - the bytes to checksum.
 * @returns the unsigned checksum every ZIP entry records.
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}

/** One local file header the writer emitted, for the central directory. */
interface WrittenEntry {
  readonly name: Uint8Array
  readonly crc: number
  readonly compressed: number
  readonly size: number
  readonly method: number
  readonly offset: number
}

/**
 * Rebuild a container with some parts replaced.
 *
 * Replaced parts are given as decoded text and recompressed; every other part is
 * copied byte-identically from the original container, including its stored
 * compression, so it does not inflate and re-deflate. A replacement whose name
 * the original container never had is appended as a new part.
 *
 * A text-only contract is deliberate: the parts an editor rewrites are XML, and
 * keeping binary media on the copy path means a save cannot corrupt it.
 * @param original - the complete source container.
 * @param replacements - part name to replacement text.
 * @returns the rebuilt container bytes.
 * @throws {Error} when the source container carries a ZIP64 extra field, which
 * this writer does not re-lay and would silently misdescribe.
 */
export async function rewriteZip(
  original: Uint8Array,
  replacements: ReadonlyMap<string, string>,
): Promise<Uint8Array> {
  const pkg = ZipPackage.open(original)
  const out = new ByteSink()
  const encoder = new TextEncoder()
  const records: WrittenEntry[] = []
  for (const entry of pkg.storedParts()) {
    if (hasZip64Extra(original, entry.localOffset)) {
      throw new Error(`part "${entry.name}" uses ZIP64, which the editor cannot rewrite`)
    }
    const replacement = replacements.get(entry.name)
    const written = replacement === undefined
      ? copyEntry(entry)
      : await writeText(encoder.encode(replacement))
    const nameBytes = encoder.encode(entry.name)
    const offset = out.length
    writeLocalHeader(out, nameBytes, written)
    out.push(nameBytes)
    out.push(written.payload)
    records.push({
      name: nameBytes,
      crc: written.crc,
      compressed: written.payload.byteLength,
      size: written.size,
      method: written.method,
      offset,
    })
  }
  // Parts the original container never had — a part an edit had to create —
  // append after every original entry.
  for (const [name, text] of replacements) {
    if (pkg.has(name)) continue
    const written = await writeText(encoder.encode(text))
    const nameBytes = encoder.encode(name)
    const offset = out.length
    writeLocalHeader(out, nameBytes, written)
    out.push(nameBytes)
    out.push(written.payload)
    records.push({
      name: nameBytes,
      crc: written.crc,
      compressed: written.payload.byteLength,
      size: written.size,
      method: written.method,
      offset,
    })
  }
  writeCentralDirectory(out, records)
  return out.bytes()
}

/** A part's payload plus the metadata its header has to record. */
interface WrittenPayload {
  readonly payload: Uint8Array
  readonly crc: number
  readonly size: number
  readonly method: number
}

/**
 * Copy a part that the edit did not replace, byte for byte.
 *
 * The payload keeps the entry's own compression, and the metadata is what the
 * original already recorded, so an untouched part is bit-identical in the saved
 * container rather than round-tripped through inflation and deflation.
 * @param entry - the stored part to copy.
 * @returns the payload and the metadata to record for it.
 */
function copyEntry(entry: StoredPart): WrittenPayload {
  return { payload: entry.payload, crc: entry.crc, size: entry.uncompressedSize, method: entry.method }
}

/**
 * Compress replacement text the way text parts are stored.
 * @param raw - the encoded replacement text.
 * @returns the deflated payload and its metadata.
 */
async function writeText(raw: Uint8Array): Promise<WrittenPayload> {
  return {
    payload: await deflateRaw(raw),
    crc: crc32(raw),
    size: raw.byteLength,
    method: DEFLATE_METHOD,
  }
}

/**
 * Append one local file header.
 * @param out - the sink to append to.
 * @param name - the encoded part name.
 * @param written - the payload and its metadata.
 */
function writeLocalHeader(out: ByteSink, name: Uint8Array, written: WrittenPayload): void {
  u32(out, 0x04034b50)
  u16(out, 20)
  u16(out, 0)
  u16(out, written.method)
  u16(out, 0)
  u16(out, 0)
  u32(out, written.crc)
  u32(out, written.payload.byteLength)
  u32(out, written.size)
  u16(out, name.byteLength)
  u16(out, 0)
}

/**
 * Append the central directory and the end record.
 * @param out - the sink to append to.
 * @param records - the entries the writer emitted, in file order.
 */
function writeCentralDirectory(out: ByteSink, records: readonly WrittenEntry[]): void {
  const directoryOffset = out.length
  for (const record of records) {
    u32(out, 0x02014b50)
    u16(out, 20)
    u16(out, 20)
    u16(out, 0)
    u16(out, record.method)
    u16(out, 0)
    u16(out, 0)
    u32(out, record.crc)
    u32(out, record.compressed)
    u32(out, record.size)
    u16(out, record.name.byteLength)
    u16(out, 0)
    u16(out, 0)
    u16(out, 0)
    u16(out, 0)
    u32(out, 0)
    u32(out, record.offset)
    out.push(record.name)
  }
  u32(out, 0x06054b50)
  u16(out, 0)
  u16(out, 0)
  u16(out, records.length)
  u16(out, records.length)
  u32(out, out.length - directoryOffset)
  u32(out, directoryOffset)
  u16(out, 0)
}

/**
 * Append a little-endian unsigned 32-bit value.
 * @param out - the sink to append to.
 * @param value - the value to write.
 */
function u32(out: ByteSink, value: number): void {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  out.push(bytes)
}

/**
 * Append a little-endian unsigned 16-bit value.
 * @param out - the sink to append to.
 * @param value - the value to write.
 */
function u16(out: ByteSink, value: number): void {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  out.push(bytes)
}

/**
 * Whether a local header carries a ZIP64 extra field.
 * @param bytes - the complete container.
 * @param localOffset - the entry's local header offset.
 * @returns true when the header's extra field names ZIP64.
 */
function hasZip64Extra(bytes: Uint8Array, localOffset: number): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const extraLength = view.getUint16(localOffset + 28, true)
  let offset = localOffset + 30 + view.getUint16(localOffset + 26, true)
  const end = offset + extraLength
  while (offset + 4 <= end) {
    if (view.getUint16(offset, true) === 0x0001) return true
    offset += 4 + view.getUint16(offset + 2, true)
  }
  return false
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
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** A growable byte sink. */
class ByteSink {
  private readonly chunks: Uint8Array[] = []
  length = 0

  /** @param bytes - bytes to append. */
  push(bytes: Uint8Array): void {
    this.chunks.push(bytes)
    this.length += bytes.byteLength
  }

  /** @returns the accumulated bytes. */
  bytes(): Uint8Array {
    const out = new Uint8Array(this.length)
    let offset = 0
    for (const chunk of this.chunks) {
      out.set(chunk, offset)
      offset += chunk.byteLength
    }
    return out
  }
}
