/**
 * Template-install planning: turn a published template version into a checked
 * write plan a target directory can execute. The chain is download (the
 * version's artifact bytes, read back through the Drive content API the same
 * way the console reuses archives), unzip (fflate), and validate — every
 * entry is screened against path-escape (zip-slip), platform-reserved names,
 * and the total-size cap BEFORE anything is written, so a hostile or corrupt
 * archive fails the install instead of partially materializing it.
 *
 * Execution is ported: text entries go through the existing governed
 * text-write bridge; binary entries need the Host binary-write capability.
 * The plan reports the split so a host without the binary capability refuses
 * cleanly BEFORE the first write instead of half-materializing the project.
 */
import { unzipSync } from 'fflate'

/** Bytes requested per Drive content call; below the endpoint's response bound. */
const DRIVE_CONTENT_CHUNK_BYTES = 4 * 1024 * 1024

/** Inclusive cap on one expanded template (guards a zip-bomb-style archive). */
export const TEMPLATE_EXPANDED_BYTE_CAP = 512 * 1024 * 1024

/** Inclusive cap on one planned file count. */
export const TEMPLATE_FILE_COUNT_CAP = 20000

/** One planned file: its workspace-relative target path and content bytes. */
export interface PlannedTemplateFile {
  /** Posix-style relative path inside the target directory (no leading slash). */
  readonly path: string
  readonly bytes: Uint8Array
  /** Decodable as UTF-8 without loss — writable through the text bridge. */
  readonly isText: boolean
}

/** One validated install: the entries and the totals a writer needs. */
export interface TemplateInstallPlan {
  readonly files: readonly PlannedTemplateFile[]
  readonly textCount: number
  readonly binaryCount: number
  readonly totalBytes: number
}

/** The template version carries no artifact to install (an app-code template). */
export class TemplateArtifactMissingError extends Error {
  constructor() {
    super('template install: the version records no artifact')
    this.name = 'TemplateArtifactMissingError'
  }
}

/** The archive expanded to zero usable entries (corrupt or empty template). */
export class TemplateInstallEmptyError extends Error {
  constructor() {
    super('template install: the archive holds no files')
    this.name = 'TemplateInstallEmptyError'
  }
}

/**
 * Structural face of the Drive client the downloader consumes (the generated
 * `SdkworkDriveAppClient` satisfies it; declared locally so tests can pass a
 * plain reader without a live Drive origin).
 */
export interface DriveContentReader {
  drive: {
    nodes: {
      content: {
        retrieve(
          nodeId: string,
          params: { byteRangeStart: string; byteRangeLength: number; encoding: 'base64' },
        ): Promise<{ content: string; sizeBytes?: string | number; hasMore?: boolean }>
      }
    }
  }
}

/** An entry would escape (or is unusable under) the target directory. */
export class TemplateEntryUnsafeError extends Error {
  readonly path: string

  constructor(path: string, reason: string) {
    super(`template install: entry "${path}" is unsafe: ${reason}`)
    this.name = 'TemplateEntryUnsafeError'
    this.path = path
  }
}

/** The expanded archive exceeds a safety cap. */
export class TemplateTooLargeError extends Error {
  constructor(totalBytes: number, fileCount: number) {
    super(`template install: expanded size ${totalBytes} bytes / ${fileCount} entries exceed the caps`)
    this.name = 'TemplateTooLargeError'
  }
}

/**
 * Download one artifact's bytes through the Drive content API.
 * @param driveClient - the generated Drive client carrying the caller's token manager.
 * @param driveNodeId - the artifact's Drive node (`ArtifactResponse.driveNodeId`).
 * @param onProgress - optional percent callback (0–100) per chunk.
 * @returns the artifact's full bytes.
 * @throws when the Drive read ends short of the node's declared size.
 */
export async function downloadArtifactBytes(
  driveClient: DriveContentReader,
  driveNodeId: string,
  onProgress?: (percent: number) => void,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let offset = 0
  let totalBytes: number | undefined
  for (;;) {
    const content = await driveClient.drive.nodes.content.retrieve(driveNodeId, {
      byteRangeStart: String(offset),
      byteRangeLength: DRIVE_CONTENT_CHUNK_BYTES,
      encoding: 'base64',
    })
    const sizeBytes = Number(content.sizeBytes)
    if (Number.isFinite(sizeBytes)) totalBytes = sizeBytes
    const decoded = decodeDriveContentChunk(content.content)
    if (decoded.byteLength === 0) break
    chunks.push(decoded)
    offset += decoded.byteLength
    if (onProgress !== undefined && totalBytes !== undefined && totalBytes > 0) {
      onProgress(Math.min(100, Math.round((offset / totalBytes) * 100)))
    }
    if (content.hasMore !== true) break
  }
  if (totalBytes !== undefined && offset !== totalBytes) {
    throw new Error(`Drive returned ${offset} of ${totalBytes} bytes for node ${driveNodeId}`)
  }
  const merged = new Uint8Array(offset)
  let written = 0
  for (const chunk of chunks) {
    merged.set(chunk, written)
    written += chunk.byteLength
  }
  return merged
}

/**
 * Decode one base64 content chunk (the Drive content endpoint's requested
 * encoding). Kept exported for the decoding contract's unit tests.
 */
export function decodeDriveContentChunk(content: string): Uint8Array {
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * Validate an expanded archive and plan its writes.
 * @param archive - the template archive bytes.
 * @returns the write plan: every safe entry, its text/binary split, and totals.
 * @throws TemplateEntryUnsafeError on a path-escape or unusable entry,
 *   TemplateTooLargeError over the expansion caps.
 */
export function planTemplateInstall(archive: Uint8Array): TemplateInstallPlan {
  const expanded = unzipSync(archive)
  const files: PlannedTemplateFile[] = []
  let totalBytes = 0
  for (const [rawName, bytes] of Object.entries(expanded)) {
    // fflate hands directories back with a trailing slash; nothing to write.
    if (rawName.endsWith('/')) continue
    const path = safeEntryPath(rawName)
    totalBytes += bytes.length
    if (totalBytes > TEMPLATE_EXPANDED_BYTE_CAP || files.length + 1 > TEMPLATE_FILE_COUNT_CAP) {
      throw new TemplateTooLargeError(totalBytes, files.length + 1)
    }
    files.push({ path, bytes, isText: isUtf8Text(bytes) })
  }
  if (files.length === 0) {
    throw new TemplateInstallEmptyError()
  }
  return {
    files,
    textCount: files.filter(file => file.isText).length,
    binaryCount: files.filter(file => !file.isText).length,
    totalBytes,
  }
}

/**
 * Normalize one archive entry name to a safe target-relative path.
 * @throws TemplateEntryUnsafeError on absolute paths, `..` segments, or NUL —
 *   shapes no rename can make safe. Everything else (Windows separators,
 *   drive-prefix colons, control characters) is sanitized in place.
 */
function safeEntryPath(rawName: string): string {
  if (rawName.includes('\0')) throw new TemplateEntryUnsafeError(rawName, 'NUL byte')
  // Archive names are posix by convention but tolerate Windows separators.
  const segments = rawName.replaceAll('\\', '/').split('/')
  if (segments.some(segment => segment === '..')) {
    throw new TemplateEntryUnsafeError(rawName, 'parent traversal')
  }
  const stripped = segments
    .filter(segment => segment !== '' && segment !== '.')
    .map(segment => segment.replace(/[\u0000-\u001f<>:"|?*]/gu, '_'))
  if (stripped.length === 0) {
    throw new TemplateEntryUnsafeError(rawName, 'resolves to the target root')
  }
  if (rawName.startsWith('/')) {
    throw new TemplateEntryUnsafeError(rawName, 'absolute path')
  }
  return stripped.join('/')
}

/**
 * UTF-8 losslessness probe for the text/binary split: decode strictly and
 * re-encode; any difference (or a NUL) marks the entry binary. Source trees
 * are text; icons and fonts fall out automatically.
 */
function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false
  const fatal = new TextDecoder('utf-8', { fatal: true })
  try {
    const text = fatal.decode(bytes)
    return new TextEncoder().encode(text).every((byte, index) => byte === bytes[index])
  } catch {
    return false
  }
}
