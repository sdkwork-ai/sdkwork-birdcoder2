/**
 * Host-backed app packaging for the publish-as-template flow.
 *
 * A project's `apps/` root lives on the local filesystem; the renderer may
 * read it only through the Host template bridge. The bridge lists the
 * packaging-eligible regular files and returns bounded base64 batches; this
 * module turns those batches into the lazy file face the existing
 * `.gitignore`-aware {@link packDirectory} packer consumes. Nothing is
 * materialized eagerly: the packer reads `.gitignore` first and then only the
 * files it actually includes.
 *
 * Sensitive local files are excluded before the packer sees them, so a
 * scaffold template can never ship a developer's `.env`, registry token, or
 * private key even when the app's `.gitignore` forgot to list it.
 */
import { packDirectory, type DirectoryPack, type PackableFile } from './directoryArchive.ts'

/** The Host bridge face this module consumes. */
export interface TemplateArchivePort {
  listTemplateFiles(directory: string): Promise<{
    readonly files: readonly { readonly path: string; readonly size: number }[]
    readonly truncated: boolean
  } | undefined>
  readTemplateFiles(directory: string, paths: readonly string[]): Promise<readonly {
    readonly path: string
    readonly contentBase64: string
    readonly bytes: number
  }[] | undefined>
}

/** Progress through the host read phase. */
export interface TemplateArchiveReadProgress {
  /** Files read from the host so far. */
  readonly read: number
  /** Packaging-eligible files the listing reported. */
  readonly total: number
}

/** The app listing exceeded the host's file/depth bound. */
export class TemplateArchiveTruncatedError extends Error {
  constructor() {
    super('template package: the app has more files than the host packaging bound')
    this.name = 'TemplateArchiveTruncatedError'
  }
}

/** The Host bridge is absent or failed, so no archive can be built. */
export class TemplateArchiveUnavailableError extends Error {
  constructor(directory: string) {
    super(`template package: cannot read the app at "${directory}"`)
    this.name = 'TemplateArchiveUnavailableError'
  }
}

/** One packed app directory plus the packaging facts the UI reports. */
export interface TemplateAppArchive extends DirectoryPack {
  /** Files the host listing reported. */
  readonly listedFiles: number
  /** Sensitive local files deliberately kept out of the template. */
  readonly excludedSensitive: readonly string[]
}

/** Files read per host batch. */
const BATCH_FILES = 24

/** Raw bytes requested per host batch. */
const BATCH_BYTES = 16 * 1024 * 1024

/** Packaging options. */
export interface TemplatePackOptions {
  /** Progress through the host read phase. */
  readonly onReadProgress?: ((progress: TemplateArchiveReadProgress) => void) | undefined
}

/**
 * Pack one app root into a zip through the Host template bridge.
 * @param port - the host listing/read capabilities.
 * @param directory - absolute app root.
 * @param maxBytes - inclusive byte cap over the included files.
 * @param options - progress reporting.
 * @returns the archive, checksum, and packaging facts.
 * @throws TemplateArchiveUnavailableError when the host bridge is absent or
 *   the listing failed, TemplateArchiveTruncatedError when the listing was
 *   cut by a host bound, and the packer's own empty/over-cap errors.
 */
export async function packTemplateApp(
  port: TemplateArchivePort,
  directory: string,
  maxBytes: number,
  options: TemplatePackOptions = {},
): Promise<TemplateAppArchive> {
  const listing = await port.listTemplateFiles(directory)
  if (listing === undefined) throw new TemplateArchiveUnavailableError(directory)
  if (listing.truncated) throw new TemplateArchiveTruncatedError()
  const sensitive: string[] = []
  const packable: { readonly path: string; readonly size: number }[] = []
  for (const file of listing.files) {
    if (isSensitiveSourcePath(file.path)) {
      sensitive.push(file.path)
      continue
    }
    packable.push(file)
  }
  if (packable.length === 0) {
    throw new Error('template package: the app has no packaging-eligible files')
  }
  const cache = new Map<string, Uint8Array>()
  const indexOf = new Map(packable.map((file, index) => [file.path, index]))
  const report = (): void => {
    // A batch may pull a few files the packer later excludes; never report a
    // read count above the eligible total.
    options.onReadProgress?.({ read: Math.min(cache.size, packable.length), total: packable.length })
  }
  const load = async (path: string): Promise<Uint8Array> => {
    const cached = cache.get(path)
    if (cached !== undefined) return cached
    const start = indexOf.get(path)
    if (start === undefined) throw new TemplateArchiveUnavailableError(directory)
    const batch: string[] = []
    let bytes = 0
    for (let index = start; index < packable.length && batch.length < BATCH_FILES; index += 1) {
      const file = packable[index]
      if (cache.has(file.path)) continue
      if (batch.length > 0 && bytes + file.size > BATCH_BYTES) break
      batch.push(file.path)
      bytes += file.size
    }
    const read = await port.readTemplateFiles(directory, batch)
    if (read === undefined) throw new TemplateArchiveUnavailableError(directory)
    for (const file of read) {
      cache.set(file.path, decodeBase64(file.contentBase64))
    }
    const loaded = cache.get(path)
    if (loaded === undefined) throw new TemplateArchiveUnavailableError(directory)
    report()
    return loaded
  }
  const files: PackableFile[] = packable.map(file => ({
    path: file.path,
    name: file.path.split('/').at(-1) ?? file.path,
    size: file.size,
    arrayBuffer: async () => {
      const bytes = await load(file.path)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    },
  }))
  const pack = await packDirectory(files, maxBytes)
  return { ...pack, listedFiles: listing.files.length, excludedSensitive: sensitive }
}

/**
 * True for files that carry machine-local secrets a template must never
 * publish. Dotfiles are otherwise legitimate template content.
 * @param path - app-relative posix path.
 * @returns whether the file is a sensitive local carrier.
 */
export function isSensitiveSourcePath(path: string): boolean {
  const name = (path.split('/').at(-1) ?? path).toLowerCase()
  // `.env` and local overrides are machine-private. Checked-in per-profile
  // templates (`.env.<mode>.<environment>`) are source the scaffold needs;
  // the packer's `.gitignore` cascade already drops whatever the repository
  // ignores, including a locally kept `.env.production`.
  if (name === '.env' || name === '.env.local') return true
  if (name.endsWith('.local') || name.includes('.local.')) return true
  if (name === '.npmrc' || name === '.yarnrc' || name === '.pypirc' || name === '.netrc') return true
  if (name === '.git-credentials' || name === 'id_rsa' || name === 'id_ed25519' || name === 'id_ecdsa') return true
  return /\.(pem|key|p12|pfx|keystore|jks|secret)$/u.test(name)
}

/** Decode one base64 wire chunk into bytes. */
function decodeBase64(content: string): Uint8Array {
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
