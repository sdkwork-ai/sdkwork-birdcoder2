/**
 * ZIP container reader for OOXML packages.
 *
 * A .pptx is an OPC package: a ZIP whose parts are named by the relationship
 * graph rather than by position. Reading it needs only the central directory,
 * the local headers it points at, and the two compression methods OOXML
 * producers actually emit, so this module implements that subset instead of
 * taking a general-purpose ZIP dependency. Entries decompress on first read, so
 * media a slide never references is never inflated.
 *
 * `DecompressionStream('deflate-raw')` is the only platform assumption; it is
 * available in every browser the Web client supports and in Node 18+.
 */

/** End of central directory signature. */
const EOCD_SIGNATURE = 0x06054b50
/** ZIP64 end of central directory locator signature. */
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
/** ZIP64 end of central directory record signature. */
const ZIP64_EOCD_SIGNATURE = 0x06064b50
/** Central directory file header signature. */
const CENTRAL_SIGNATURE = 0x02014b50
/** Local file header signature. */
const LOCAL_SIGNATURE = 0x04034b50
/** Extra-field id carrying 64-bit sizes and offsets. */
const ZIP64_EXTRA_ID = 0x0001
/** Largest possible end-of-central-directory comment, plus the record itself. */
const EOCD_SEARCH_LIMIT = 0xffff + 22

/** Largest one part may inflate to; a document part never approaches this. */
const MAX_ENTRY_BYTES = 256 * 1024 * 1024
/** Largest combined inflation one package may reach across its parts. */
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024

/** One stored part, as a writer needs it to copy or replace it. */
export interface ZipEntryRecord {
  readonly name: string
  /** Compression method: 0 stored, 8 raw DEFLATE. */
  readonly method: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly crc: number
  readonly localOffset: number
}

/** One central-directory record, resolved to absolute container offsets. */
interface CentralEntry {
  readonly name: string
  readonly method: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly crc: number
  readonly localOffset: number
}

/** Raised when the container is not a readable ZIP or uses an unsupported entry. */
export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipFormatError'
  }
}

/** Read a little-endian unsigned 16-bit value. */
function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

/** Read a little-endian unsigned 32-bit value. */
function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

/**
 * Locate the end-of-central-directory record, tolerating a trailing comment.
 * @param view - whole-container view.
 * @returns the record's byte offset.
 * @throws {ZipFormatError} when no record signature is present.
 */
function findEndOfCentralDirectory(view: DataView): number {
  const start = Math.max(0, view.byteLength - EOCD_SEARCH_LIMIT)
  for (let offset = view.byteLength - 22; offset >= start; offset -= 1) {
    if (u32(view, offset) === EOCD_SIGNATURE) return offset
  }
  throw new ZipFormatError('not a ZIP container: no end-of-central-directory record')
}

/**
 * Read the ZIP64 central-directory location when the 32-bit fields are saturated.
 * @param view - whole-container view.
 * @param eocd - offset of the classic end-of-central-directory record.
 * @returns the ZIP64 central-directory offset, or undefined for a classic archive.
 */
function zip64DirectoryOffset(view: DataView, eocd: number): number | undefined {
  const locator = eocd - 20
  if (locator < 0 || u32(view, locator) !== ZIP64_LOCATOR_SIGNATURE) return undefined
  const record = Number(view.getBigUint64(locator + 8, true))
  if (record + 56 > view.byteLength || u32(view, record) !== ZIP64_EOCD_SIGNATURE) return undefined
  return Number(view.getBigUint64(record + 48, true))
}

/**
 * Resolve the 64-bit size and offset fields a ZIP64 extra field may carry.
 * The record only holds the fields whose 32-bit slots were saturated, in a
 * fixed order, so each present slot is consumed in sequence.
 * @param extra - the central entry's extra-field bytes.
 * @param compressedSize - saturated 32-bit compressed size.
 * @param uncompressedSize - saturated 32-bit uncompressed size.
 * @param localOffset - saturated 32-bit local-header offset.
 * @returns the resolved triple.
 */
function readZip64Extra(
  extra: DataView,
  compressedSize: number,
  uncompressedSize: number,
  localOffset: number,
): { readonly compressedSize: number; readonly uncompressedSize: number; readonly localOffset: number } {
  let resolved = { compressedSize, uncompressedSize, localOffset }
  let offset = 0
  while (offset + 4 <= extra.byteLength) {
    const id = u16(extra, offset)
    const size = u16(extra, offset + 2)
    const body = offset + 4
    if (id === ZIP64_EXTRA_ID) {
      let cursor = body
      if (resolved.uncompressedSize === 0xffffffff && cursor + 8 <= body + size) {
        resolved = { ...resolved, uncompressedSize: Number(extra.getBigUint64(cursor, true)) }
        cursor += 8
      }
      if (resolved.compressedSize === 0xffffffff && cursor + 8 <= body + size) {
        resolved = { ...resolved, compressedSize: Number(extra.getBigUint64(cursor, true)) }
        cursor += 8
      }
      if (resolved.localOffset === 0xffffffff && cursor + 8 <= body + size) {
        resolved = { ...resolved, localOffset: Number(extra.getBigUint64(cursor, true)) }
      }
      return resolved
    }
    offset = body + size
  }
  return resolved
}

/**
 * Walk every central-directory record in the container.
 * @param view - whole-container view.
 * @returns one resolved entry per stored part, directories excluded.
 */
function readCentralDirectory(view: DataView): readonly CentralEntry[] {
  const eocd = findEndOfCentralDirectory(view)
  const total = u16(view, eocd + 10)
  let offset = u32(view, eocd + 16)
  if (offset === 0xffffffff) offset = zip64DirectoryOffset(view, eocd) ?? offset
  const entries: CentralEntry[] = []
  const decoder = new TextDecoder('utf-8')
  for (let index = 0; index < total; index += 1) {
    if (offset + 46 > view.byteLength || u32(view, offset) !== CENTRAL_SIGNATURE) break
    const nameLength = u16(view, offset + 28)
    const extraLength = u16(view, offset + 30)
    const commentLength = u16(view, offset + 32)
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 46, nameLength))
    const extraStart = offset + 46 + nameLength
    const resolved = readZip64Extra(
      new DataView(view.buffer, view.byteOffset + extraStart, extraLength),
      u32(view, offset + 20),
      u32(view, offset + 24),
      u32(view, offset + 42),
    )
    const crc = u32(view, offset + 16)
    if (!name.endsWith('/')) {
      entries.push({
        name,
        method: u16(view, offset + 10),
        compressedSize: resolved.compressedSize,
        uncompressedSize: resolved.uncompressedSize,
        crc,
        localOffset: resolved.localOffset,
      })
    }
    offset = extraStart + extraLength + commentLength
  }
  return entries
}

/**
 * Drain a readable byte stream.
 * @param stream - the stream to read to completion.
 * @returns the concatenated bytes.
 */
async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
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

/**
 * Inflate one raw DEFLATE stream.
 * @param data - compressed bytes, without the ZIP framing.
 * @returns the decompressed bytes.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  void writer.write(data.slice())
  void writer.close()
  return await drain(stream.readable)
}

/**
 * Read the part bytes a central entry points at.
 * @param bytes - whole container.
 * @param view - whole-container view.
 * @param entry - the central record to materialize.
 * @returns the part's decompressed bytes.
 * @throws {ZipFormatError} when the local header is missing or the method unsupported.
 */
async function readEntry(
  bytes: Uint8Array,
  view: DataView,
  entry: CentralEntry,
): Promise<Uint8Array> {
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new ZipFormatError(
      `part "${entry.name}" inflates beyond the per-entry limit of ${MAX_ENTRY_BYTES} bytes`,
    )
  }
  if (entry.localOffset + 30 > view.byteLength || u32(view, entry.localOffset) !== LOCAL_SIGNATURE) {
    throw new ZipFormatError(`part "${entry.name}" has no local file header`)
  }
  const start = entry.localOffset + 30 + u16(view, entry.localOffset + 26) + u16(view, entry.localOffset + 28)
  const end = start + entry.compressedSize
  if (end > bytes.byteLength) throw new ZipFormatError(`part "${entry.name}" runs past the container`)
  const stored = bytes.subarray(start, end)
  if (entry.method === 0) return stored.slice()
  if (entry.method !== 8) {
    throw new ZipFormatError(`part "${entry.name}" uses unsupported compression method ${entry.method}`)
  }
  return await inflateRaw(stored)
}

/** One OOXML package's parts, decompressed on demand. */
export class ZipPackage {
  private readonly cache = new Map<string, Uint8Array>()
  private inflatedTotal = 0

  private constructor(
    private readonly bytes: Uint8Array,
    private readonly view: DataView,
    private readonly entries: ReadonlyMap<string, CentralEntry>,
  ) {}

  /**
   * Open a ZIP container and index its central directory.
   * @param bytes - the complete container.
   * @returns the indexed package.
   */
  static open(bytes: Uint8Array): ZipPackage {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const entries = new Map<string, CentralEntry>()
    for (const entry of readCentralDirectory(view)) entries.set(entry.name, entry)
    return new ZipPackage(bytes, view, entries)
  }

  /**
   * Whether a part exists in the container.
   * @param name - package-absolute part name, without a leading slash.
   * @returns true when the part is present.
   */
  has(name: string): boolean {
    return this.entries.has(name)
  }

  /**
   * Read one part, decompressing at most once.
   * @param name - package-absolute part name, without a leading slash.
   * @param options - read switches. `evict` drops the part from the cache
   * after this read, for media whose bytes the caller converts to another
   * form (a Blob URL) and never reads again; it halves the memory a
   * media-heavy package holds.
   * @returns the part bytes, or undefined when the part is absent.
   * @throws {ZipFormatError} when reading the part would exceed the inflation
   * limits, which bounds what a hostile container can make the reader allocate.
   */
  async read(
    name: string,
    options?: { readonly evict?: boolean },
  ): Promise<Uint8Array | undefined> {
    const cached = this.cache.get(name)
    if (cached !== undefined) {
      if (options?.evict === true) this.cache.delete(name)
      return cached
    }
    const entry = this.entries.get(name)
    if (entry === undefined) return undefined
    if (this.inflatedTotal + entry.uncompressedSize > MAX_PACKAGE_BYTES) {
      throw new ZipFormatError(
        `reading "${name}" would push the package past the total inflation limit of ${MAX_PACKAGE_BYTES} bytes`,
      )
    }
    const data = await readEntry(this.bytes, this.view, entry)
    this.inflatedTotal += data.byteLength
    if (options?.evict === true) return data
    this.cache.set(name, data)
    return data
  }

  /**
   * Read one part as UTF-8 text.
   * @param name - package-absolute part name, without a leading slash.
   * @returns the decoded text, or undefined when the part is absent.
   */
  async readText(name: string): Promise<string | undefined> {
    const data = await this.read(name)
    return data === undefined ? undefined : new TextDecoder('utf-8').decode(data)
  }

  /**
   * The part's compressed payload exactly as stored, without inflating.
   * @param name - package-absolute part name.
   * @returns the stored bytes, or undefined when the part is absent.
   */
  storedPayload(name: string): Uint8Array | undefined {
    const entry = this.entries.get(name)
    if (entry === undefined) return undefined
    const start = entry.localOffset + 30 + u16(this.view, entry.localOffset + 26) + u16(this.view, entry.localOffset + 28)
    return this.bytes.subarray(start, start + entry.compressedSize)
  }

  /**
   * Every stored part as a writer needs it: offsets, sizes, method, and CRC.
   * @returns the records, in central-directory order.
   */
  records(): readonly ZipEntryRecord[] {
    return [...this.entries.values()]
  }

  /**
   * List every stored part name.
   * @returns the part names, in central-directory order.
   */
  names(): readonly string[] {
    return [...this.entries.keys()]
  }
}
