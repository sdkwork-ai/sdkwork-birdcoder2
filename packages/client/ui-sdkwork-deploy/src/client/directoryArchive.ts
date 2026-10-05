/**
 * Directory → zip packer for the publish-as-template source step. Mirrors
 * git's source-selection semantics: every `.gitignore` inside the picked
 * directory scopes to its own subtree with deeper files overriding shallower
 * ones, `.git/` is always dropped, and an ignored directory prunes its whole
 * subtree (so nothing inside it can be re-included). Output is a
 * deterministically-ordered store of the included files with its SHA-256, the
 * checksum the artifact registration requires.
 */
import { Zip, ZipDeflate } from 'fflate'
import { isIgnoredByChain, parseGitIgnore, type GitIgnoreRuleSet } from './gitignore.ts'

/** Minimal file face the packer consumes (a browser `File` satisfies it). */
export interface PackableFile {
  /** Posix path relative to the picked directory, no leading slash. */
  readonly path: string
  readonly name: string
  readonly size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

/** One packed directory: the archive plus the facts the artifact needs. */
export interface DirectoryPack {
  readonly archive: Blob
  readonly fileCount: number
  readonly totalBytes: number
  readonly checksumSha256: string
}

/** The selection carried no includable file. */
export class DirectoryPackEmptyError extends Error {
  constructor() {
    super('directory pack: no includable files')
    this.name = 'DirectoryPackEmptyError'
  }
}

/** The included files exceed the package type's byte cap. */
export class DirectoryPackTooLargeError extends Error {
  readonly totalBytes: number
  readonly maxBytes: number

  constructor(totalBytes: number, maxBytes: number) {
    super(`directory pack: ${totalBytes} bytes exceed the ${maxBytes} byte cap`)
    this.name = 'DirectoryPackTooLargeError'
    this.totalBytes = totalBytes
    this.maxBytes = maxBytes
  }
}

/**
 * Pack one picked directory into a zip blob, honoring its `.gitignore` files.
 * @param files - every file under the picked directory (paths relative to it).
 * @param maxBytes - inclusive size cap over the included files.
 * @returns the archive plus its file count, byte total, and SHA-256.
 * @throws DirectoryPackEmptyError without an includable file, DirectoryPackTooLargeError over the cap.
 */
export async function packDirectory(
  files: readonly PackableFile[],
  maxBytes: number,
): Promise<DirectoryPack> {
  const sorted = [...files].sort((left, right) => (left.path < right.path ? -1 : 1))
  const ruleSets = await collectRuleSets(sorted)
  const included = selectIncluded(sorted, ruleSets)
  if (included.length === 0) throw new DirectoryPackEmptyError()
  const totalBytes = included.reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > maxBytes) throw new DirectoryPackTooLargeError(totalBytes, maxBytes)

  const chunks: Uint8Array[] = []
  const zip = new Zip((error, data) => {
    if (error !== undefined && error !== null) throw error
    chunks.push(data)
  })
  for (const file of included) {
    const entry = new ZipDeflate(file.path, { level: 6 })
    zip.add(entry)
    entry.push(new Uint8Array(await file.arrayBuffer()), true)
  }
  zip.end()
  const bytes = concatChunks(chunks)
  const checksumSha256 = await sha256Hex(bytes)
  return {
    archive: new Blob(chunks as BlobPart[], { type: 'application/zip' }),
    fileCount: included.length,
    totalBytes,
    checksumSha256,
  }
}

/** Read and parse every `.gitignore` in the selection, scoped to its directory. */
async function collectRuleSets(sorted: readonly PackableFile[]): Promise<GitIgnoreRuleSet[]> {
  const sets: GitIgnoreRuleSet[] = []
  for (const file of sorted) {
    if (file.name !== '.gitignore') continue
    const base = directoryPrefixOf(file.path)
    const text = new TextDecoder().decode(await file.arrayBuffer())
    sets.push(parseGitIgnore(text, base))
  }
  return sets
}

/**
 * Apply the ignore cascade with git's pruning rule: a directory decided
 * "ignored" removes its whole subtree from consideration, and rule sets
 * living under a pruned directory are never consulted (git never reads them).
 */
function selectIncluded(
  sorted: readonly PackableFile[],
  ruleSets: readonly GitIgnoreRuleSet[],
): PackableFile[] {
  const prunedDirs = new Set<string>()
  const dirIsPruned = (dir: string): boolean => {
    if (dir === '') return false
    if (prunedDirs.has(dir)) return true
    return dirIsPruned(directoryPrefixOf(dir.slice(0, -1)))
  }
  const applicableChain = (path: string): GitIgnoreRuleSet[] =>
    ruleSets.filter(set =>
      path.startsWith(set.base)
      && !dirIsPruned(set.base === '' ? '' : set.base.slice(0, -1)))
  const included: PackableFile[] = []
  for (const file of sorted) {
    if (isUnderGitDir(file.path)) continue
    let excluded = false
    const segments = file.path.split('/')
    // Ancestors first (shallow → deep): an ignored directory prunes the file.
    for (let depth = 1; depth < segments.length; depth += 1) {
      const dir = `${segments.slice(0, depth).join('/')}/`
      if (prunedDirs.has(dir)) {
        excluded = true
        break
      }
      if (isIgnoredByChain(dir, true, applicableChain(dir))) prunedDirs.add(dir)
      if (prunedDirs.has(dir)) {
        excluded = true
        break
      }
    }
    if (!excluded && isIgnoredByChain(file.path, false, applicableChain(file.path))) excluded = true
    if (!excluded) included.push(file)
  }
  return included
}

/** True when any path segment is `.git` (version-control metadata never ships). */
function isUnderGitDir(path: string): boolean {
  return path.split('/').some(segment => segment === '.git')
}

/** `'a/b/c.txt'` → `'a/b/'`; `'a.txt'` → `''`. */
function directoryPrefixOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut + 1)
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) {
    // A non-secure context cannot digest; the artifact registration needs the
    // checksum, so fail the pack rather than shipping an unverified archive.
    throw new Error('directory pack: crypto.subtle is unavailable')
  }
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const digest = await subtle.digest('SHA-256', view)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
