/**
 * SDKWork template capabilities: bounded, confinement-checked reads and writes
 * for the app-scaffold template flow.
 *
 * Two directions meet here:
 *
 * - **Install (write).** The browser plans a template install (download,
 *   unzip, screening — `ui-sdkwork-deploy`'s `templateInstall.ts`) and drives
 *   the writes one small file at a time through {@link SdkworkTemplateInstallInstaller.writeFile}.
 * - **Publish (read).** The browser lists one app root under the project's
 *   `apps/` directory and batches file reads back to itself, then packs the
 *   archive with the same `.gitignore`-aware packer it uses for a picked
 *   directory. Reads are bounded per file and per batch so a packaging call
 *   can never materialize an unbounded tree on the wire.
 *
 * Security posture: both directions trust the directory the local operator
 * pointed at, never the entry names. Every read/write re-checks that the
 * resolved path stays inside its base, rejects traversal/absolute/NUL names
 * and Windows-reserved device segments outright, refuses symlinks, and caps
 * bytes. Parent directories are created on demand for writes — an install of
 * a few hundred files must not need a mkdir round trip per directory.
 *
 * The wire face over this seam is the `sdkwork-template-install-controller`
 * Remote; this package owns none of the wire vocabulary.
 */

import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { isAbsolute, dirname, join, relative, resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { SdkworkTemplateInstallError } from './errors.ts'
import type {
  SdkworkTemplateFileEntry,
  SdkworkTemplateInstallWriteRequest,
  SdkworkTemplateInstallWriteValue,
  SdkworkTemplateListFilesRequest,
  SdkworkTemplateListFilesValue,
  SdkworkTemplateReadFilesRequest,
  SdkworkTemplateReadFilesValue,
} from './types.ts'

export type * from './types.ts'
export { SdkworkTemplateInstallError } from './errors.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SDKWork template capability: bounded packaging reads and project-file writes. */
    sdkworkTemplateInstall: SdkworkTemplateInstallInstaller
  }
}

/** Inclusive per-file byte ceiling for both directions. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024

/** Inclusive per-batch byte ceiling when more than one file is requested. */
export const MAX_BATCH_BYTES = 32 * 1024 * 1024

/** Inclusive file count of one read batch. */
export const MAX_BATCH_FILES = 64

/** Inclusive file count of one packaging listing. */
export const MAX_LISTED_FILES = 20_000

/** Inclusive nesting depth below the listed directory. */
export const MAX_LIST_DEPTH = 24

/**
 * Child directory names a packaging walk never enters. These are dependency
 * stores, build outputs, VCS internals, and agent/runtime state: a scaffold
 * template ships source, and every one of these can hold tens of thousands of
 * generated entries that must never reach the archive.
 */
export const SKIPPED_SOURCE_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  '.hg',
  '.svn',
  '.pnpm-store',
  '.pnpm-cache-tmp',
  '.npm-cache-tmp',
  '.dsh-build',
  '.desktop-build',
  '.artifacts',
  '.screenshots',
  '.sdkwork',
  '.workbuddy',
  '.zcode',
  '.tmp',
  '.cache',
  '.next',
  '.turbo',
  '.gradle',
  '.dart_tool',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'tmp',
  'temp',
  'vendor',
  'Pods',
  'DerivedData',
  '__pycache__',
])

/** Case-insensitive form of {@link SKIPPED_SOURCE_DIRECTORIES} (Windows names ignore case). */
const SKIPPED_SOURCE_DIRECTORIES_LOWER: ReadonlySet<string> = new Set(
  [...SKIPPED_SOURCE_DIRECTORIES].map(name => name.toLowerCase()),
)

/** One decoded write, shared by validation and the file system step. */
interface DecodedWrite {
  readonly base: string
  readonly target: string
  readonly bytes: Buffer
}

/** The template-install service. Owns every bounded project-file read and write. */
export class SdkworkTemplateInstallInstaller extends Service {
  private readonly maxFileBytes: number

  /**
   * @param ctx - host context.
   * @param maxFileBytes - inclusive per-file ceiling; tests shrink it, the
   *   deployment default is {@link MAX_FILE_BYTES}.
   */
  constructor(ctx: Context, maxFileBytes: number = MAX_FILE_BYTES) {
    super(ctx, 'sdkworkTemplateInstall')
    this.maxFileBytes = maxFileBytes
  }

  /**
   * Write one regular file under the target directory, creating parents.
   * @param request - target directory, target-relative path, base64 content.
   * @returns the absolute path written and the byte count.
   * @throws SdkworkTemplateInstallError with the closed code for every refusal.
   */
  async writeFile(request: SdkworkTemplateInstallWriteRequest): Promise<SdkworkTemplateInstallWriteValue> {
    const decoded = this.prepare(request)
    try {
      await mkdir(dirname(decoded.target), { recursive: true })
      await writeFile(decoded.target, decoded.bytes)
    } catch (cause: unknown) {
      throw new SdkworkTemplateInstallError(
        'write-failed',
        `cannot write "${request.relativePath}": ${cause instanceof Error ? cause.message : String(cause)}`,
        request.relativePath,
      )
    }
    return { absolutePath: decoded.target, bytes: decoded.bytes.length }
  }

  /**
   * List every packaging-eligible regular file under one app directory.
   *
   * The walk is depth-first over sorted names (deterministic archives), never
   * follows symlinks, prunes {@link SKIPPED_SOURCE_DIRECTORIES}, and stops at
   * {@link MAX_LISTED_FILES} / {@link MAX_LIST_DEPTH}, reporting the cut
   * through `truncated`.
   * @param request - the absolute app directory.
   * @returns the regular files with their sizes.
   * @throws SdkworkTemplateInstallError `source-unreadable` when the directory
   *   is missing, not a directory, or not absolute.
   */
  async listFiles(request: SdkworkTemplateListFilesRequest): Promise<SdkworkTemplateListFilesValue> {
    const base = this.readableSourceDirectory(request.directory)
    const files: SdkworkTemplateFileEntry[] = []
    let truncated = false
    const stack: { readonly directory: string; readonly prefix: string; readonly depth: number }[] = [
      { directory: base, prefix: '', depth: 0 },
    ]
    while (stack.length > 0) {
      const current = stack.pop()
      /* v8 ignore next -- the loop condition guarantees an entry. */
      if (current === undefined) break
      let entries
      try {
        entries = await readdir(current.directory, { withFileTypes: true })
      } catch (cause: unknown) {
        throw new SdkworkTemplateInstallError(
          'source-unreadable',
          `cannot list "${current.prefix === '' ? base : join(base, current.prefix)}": ${messageOf(cause)}`,
          request.directory,
        )
      }
      entries.sort((left, right) => left.name.localeCompare(right.name))
      const children: typeof stack = []
      for (const entry of entries) {
        // Symlinks can point outside the app root; a template never carries one.
        if (entry.isSymbolicLink()) continue
        const childPath = current.prefix === '' ? entry.name : `${current.prefix}/${entry.name}`
        if (entry.isDirectory()) {
          if (SKIPPED_SOURCE_DIRECTORIES_LOWER.has(entry.name.toLowerCase())) continue
          if (current.depth + 1 > MAX_LIST_DEPTH) {
            truncated = true
            continue
          }
          children.push({
            directory: join(current.directory, entry.name),
            prefix: childPath,
            depth: current.depth + 1,
          })
          continue
        }
        if (!entry.isFile()) continue
        if (files.length >= MAX_LISTED_FILES) {
          truncated = true
          break
        }
        let size: number
        try {
          size = (await lstat(join(current.directory, entry.name))).size
        } catch {
          // A file that vanished between readdir and lstat is already gone;
          // omitting it keeps the listing truthful rather than failing the pack.
          continue
        }
        files.push({ path: childPath, size })
      }
      if (files.length >= MAX_LISTED_FILES) {
        truncated = true
        break
      }
      // Depth-first in sorted name order despite the LIFO stack.
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]
        /* v8 ignore next -- index is within bounds. */
        if (child !== undefined) stack.push(child)
      }
    }
    files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    return { files, truncated }
  }

  /**
   * Read one bounded batch of regular files under an app directory.
   * @param request - the absolute app directory and the relative paths.
   * @returns each requested file's base64 bytes, in request order.
   * @throws SdkworkTemplateInstallError for an unreadable directory, an unsafe
   *   name, a symlink, or a file/batch over the byte caps.
   */
  async readFiles(request: SdkworkTemplateReadFilesRequest): Promise<SdkworkTemplateReadFilesValue> {
    const base = this.readableSourceDirectory(request.directory)
    if (request.paths.length > MAX_BATCH_FILES) {
      throw new SdkworkTemplateInstallError(
        'content-too-large',
        `${request.paths.length} paths exceed the ${MAX_BATCH_FILES}-file batch cap`,
        request.directory,
      )
    }
    const byteCap = request.paths.length === 1 ? this.maxFileBytes : MAX_BATCH_BYTES
    let totalBytes = 0
    const files: { readonly path: string; readonly contentBase64: string; readonly bytes: number }[] = []
    for (const rawPath of request.paths) {
      const segments = cleanRelativeSegments(rawPath)
      const target = resolve(base, ...segments)
      const containment = relative(base, target)
      /* v8 ignore next 3 -- the segment screen already rejects traversal, so
         no public request reaches this throw. */
      if (containment === '' || containment.startsWith('..') || isAbsolute(containment)) {
        throw new SdkworkTemplateInstallError('path-unsafe', 'path escapes the source directory', rawPath)
      }
      let info
      try {
        info = await lstat(target)
      } catch (cause: unknown) {
        throw new SdkworkTemplateInstallError(
          'read-failed',
          `cannot read "${rawPath}": ${messageOf(cause)}`,
          rawPath,
        )
      }
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new SdkworkTemplateInstallError('path-unsafe', `"${rawPath}" is not a regular file`, rawPath)
      }
      if (info.size > this.maxFileBytes) {
        throw new SdkworkTemplateInstallError(
          'content-too-large',
          `${info.size} bytes exceed the ${this.maxFileBytes} byte per-file cap`,
          rawPath,
        )
      }
      totalBytes += info.size
      if (totalBytes > byteCap) {
        throw new SdkworkTemplateInstallError(
          'content-too-large',
          `${totalBytes} bytes exceed the ${byteCap} byte batch cap`,
          rawPath,
        )
      }
      let bytes: Buffer
      try {
        bytes = await readFile(target)
      } catch (cause: unknown) {
        throw new SdkworkTemplateInstallError(
          'read-failed',
          `cannot read "${rawPath}": ${messageOf(cause)}`,
          rawPath,
        )
      }
      files.push({ path: segments.join('/'), contentBase64: bytes.toString('base64'), bytes: bytes.length })
    }
    return { files }
  }

  /**
   * Validate the request and resolve it into a base/target/bytes triple.
   * Every refusal in one place, before the file system is touched.
   */
  private prepare(request: SdkworkTemplateInstallWriteRequest): DecodedWrite {
    const { targetDirectory, relativePath } = request
    if (targetDirectory.trim() === '' || !isAbsolute(targetDirectory)) {
      throw new SdkworkTemplateInstallError('target-unreadable', 'target directory must be an absolute path', targetDirectory)
    }
    let base: string
    try {
      base = realpathSync(targetDirectory)
    } catch {
      throw new SdkworkTemplateInstallError('target-unreadable', `target directory does not exist: ${targetDirectory}`, targetDirectory)
    }
    const segments = cleanRelativeSegments(relativePath)
    // The request arrives base64; decode AFTER the path screens so hostile
    // names never cost a decode. Size cap checked on the decoded length.
    const bytes = Buffer.from(request.contentBase64, 'base64')
    if (bytes.length > this.maxFileBytes) {
      throw new SdkworkTemplateInstallError(
        'content-too-large',
        `${bytes.length} bytes exceed the ${this.maxFileBytes} byte per-file cap`,
        relativePath,
      )
    }
    const target = resolve(base, ...segments)
    const containment = relative(base, target)
    /* v8 ignore next 3 -- defence in depth: the segment screen already
       rejects traversal, so no public request reaches this throw. */
    if (containment === '' || containment.startsWith('..') || isAbsolute(containment)) {
      throw new SdkworkTemplateInstallError('path-unsafe', 'path escapes the target directory', relativePath)
    }
    return { base, target, bytes }
  }

  /**
   * Real path of an absolute, existing source directory.
   * @throws SdkworkTemplateInstallError `source-unreadable` for every refusal.
   */
  private readableSourceDirectory(directory: string): string {
    if (directory.trim() === '' || !isAbsolute(directory)) {
      throw new SdkworkTemplateInstallError('source-unreadable', 'source directory must be an absolute path', directory)
    }
    let base: string
    try {
      base = realpathSync(directory)
    } catch {
      throw new SdkworkTemplateInstallError('source-unreadable', `source directory does not exist: ${directory}`, directory)
    }
    return base
  }
}

// The Loader discovers a plugin through the module's default export; without
// it the entry loads but never activates (fiber stays undefined, and boot
// reports a bare "failed to import").
export default SdkworkTemplateInstallInstaller

/**
 * Windows keeps device names at any directory level and rejects segments
 * ending in a dot or space; both are refused rather than rewritten, because a
 * silently renamed file is worse than a rejected one.
 */
function isReservedSegment(segment: string): boolean {
  if (/[. ]$/u.test(segment)) return true
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/iu.test(segment)
}

/**
 * Split a caller-relative path into safe segments.
 * @throws SdkworkTemplateInstallError `path-unsafe` for absolute paths, NUL,
 *   empty/dot/parent segments, and Windows-reserved names.
 */
function cleanRelativeSegments(relativePath: string): string[] {
  if (relativePath.includes('\0')) {
    throw new SdkworkTemplateInstallError('path-unsafe', 'path contains a NUL byte', relativePath)
  }
  if (isAbsolute(relativePath) || /^[a-z]:/iu.test(relativePath)) {
    throw new SdkworkTemplateInstallError('path-unsafe', 'path must be base-relative', relativePath)
  }
  const segments = relativePath.split(/[/\\]/)
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new SdkworkTemplateInstallError('path-unsafe', 'path must be a clean relative chain of single names', relativePath)
  }
  if (segments.some(isReservedSegment)) {
    throw new SdkworkTemplateInstallError('path-unsafe', `segment is a reserved device name: ${relativePath}`, relativePath)
  }
  return segments
}

/** One-line cause text for diagnostics. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
