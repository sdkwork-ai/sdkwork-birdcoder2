/**
 * ZIP rewriting for edited presentations.
 *
 * Saving an edit must not rebuild a presentation from scratch: every part the
 * editor did not touch keeps its exact stored bytes, so untouched XML, media,
 * and theme parts survive byte-identical. The writer recompresses only the
 * replaced parts (raw DEFLATE, the method text parts use) and re-lays local
 * headers, the central directory, and the end record.
 */
import { crc32 } from './crc.ts'

/** The raw-DEFLATE compression method a rewritten text part uses. */
const DEFLATE_METHOD = 8

/**
 * Rebuild the container with some parts replaced.
 *
 * Replaced parts are given as decoded text and recompressed; every other
 * part is copied byte-identically from the original container, including its
 * stored compression. The original container must not use ZIP64.
 * @param original - the complete source container.
 * @param replacements - part name to replacement text.
 * @returns the rebuilt container bytes.
 * @throws {Error} when the source container carries a ZIP64 extra field.
 */
export async function rewriteZip(
  original: Uint8Array,
  replacements: ReadonlyMap<string, string>,
): Promise<Uint8Array> {
  const { ZipPackage } = await import('@deepseek-ai/dsh-client-sdkwork-office')
  const pkg = ZipPackage.open(original)
  const out = new ByteSink()
  const records: { name: Uint8Array; crc: number; compressed: number; size: number; method: number; offset: number }[] = []
  const encoder = new TextEncoder()
  for (const entry of pkg.records()) {
    if (hasZip64Extra(original, entry.localOffset)) {
      throw new Error(`part "${entry.name}" uses ZIP64, which the editor cannot rewrite`)
    }
    const replacement = replacements.get(entry.name)
    let payload: Uint8Array
    let crc: number
    let size: number
    let method = entry.method
    if (replacement === undefined) {
      payload = pkg.storedPayload(entry.name) ?? new Uint8Array()
      crc = entry.crc
      size = entry.uncompressedSize
    } else {
      const raw = encoder.encode(replacement)
      payload = await deflateRaw(raw)
      crc = crc32(raw)
      size = raw.byteLength
      method = DEFLATE_METHOD
    }
    const nameBytes = encoder.encode(entry.name)
    const offset = out.length
    u32(out, 0x04034b50)
    u16(out, 20)
    u16(out, 0)
    u16(out, method)
    u16(out, 0)
    u16(out, 0)
    u32(out, crc)
    u32(out, payload.byteLength)
    u32(out, size)
    u16(out, nameBytes.byteLength)
    u16(out, 0)
    out.push(nameBytes)
    out.push(payload)
    records.push({ name: nameBytes, crc, compressed: payload.byteLength, size, method, offset })
  }
  // Parts the original container never had (a created notes slide, its
  // relationships) append after every original entry.
  const encoder2 = encoder
  for (const [name, text] of replacements) {
    if (pkg.has(name)) continue
    const raw = encoder2.encode(text)
    const payload = await deflateRaw(raw)
    const nameBytes = encoder2.encode(name)
    const offset = out.length
    u32(out, 0x04034b50)
    u16(out, 20)
    u16(out, 0)
    u16(out, DEFLATE_METHOD)
    u16(out, 0)
    u16(out, 0)
    u32(out, crc32(raw))
    u32(out, payload.byteLength)
    u32(out, raw.byteLength)
    u16(out, nameBytes.byteLength)
    u16(out, 0)
    out.push(nameBytes)
    out.push(payload)
    records.push({ name: nameBytes, crc: crc32(raw), compressed: payload.byteLength, size: raw.byteLength, method: DEFLATE_METHOD, offset })
  }
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
  return out.bytes()
}

/** Append a little-endian unsigned 32-bit value. */
function u32(out: ByteSink, value: number): void {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  out.push(bytes)
}

/** Append a little-endian unsigned 16-bit value. */
function u16(out: ByteSink, value: number): void {
  const bytes = new Uint8Array(2)
  new DataView(bytes.buffer).setUint16(0, value, true)
  out.push(bytes)
}

/** Whether a local header carries a ZIP64 extra field. */
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

/** Deflate bytes with the raw DEFLATE stream ZIP uses. */
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
