/**
 * Fetching and unpacking a plugin archive for installation.
 *
 * A plugin published as a zip or tar archive, or as a sdkwork-drive directory
 * the Drive download-package API resolved to one, is not something pnpm can
 * read: pnpm installs registry packages, Git repositories, npm tarballs, and
 * local directories. This module bridges the gap by downloading the archive
 * inside the profile, unpacking the plugin package from it, and handing pnpm a
 * local directory — so installation keeps the one pipeline it already has
 * (manifest write, bundle validation, activation, rollback).
 *
 * Nothing here trusts the bytes: the download is bounded by size and time, an
 * optional SHA-256 is verified, every entry path is confined to the extraction
 * directory, file and byte totals are capped, and only the plugin package's own
 * subtree is kept. A failed, cancelled, or invalid archive leaves no directory
 * behind, and a repeated install of the same source reuses the unpacked copy.
 * @module @deepseek-ai/dsh-plugin-manager/archive
 */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import type { ParsedArchiveInstallSpec } from './install-spec.ts'

/** Largest archive the manager downloads for one installation, in bytes. */
export const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
/** Largest total unpacked content accepted from one archive, in bytes. */
export const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024
/** Largest number of files accepted from one archive. */
export const MAX_ARCHIVE_FILES = 20_000
/** Largest single file accepted from one archive, in bytes. */
export const MAX_ARCHIVE_FILE_BYTES = 64 * 1024 * 1024
/** Deadline for one archive download, in milliseconds. */
export const ARCHIVE_TIMEOUT_MS = 120_000

/** Why an archive could not become an installable directory. */
export type ArchiveProblem =
  | 'download-failed'
  | 'too-large'
  | 'invalid-format'
  | 'checksum-mismatch'
  | 'not-a-package'
  | 'path-escaped'
  | 'cancelled'

/** A refused archive, carrying what a person reads. */
export class ArchiveSourceError extends Error {
  /**
   * @param problem - the stable reason.
   * @param detail - the sentence a person reads.
   */
  constructor(readonly problem: ArchiveProblem, detail: string) {
    super(`plugin-manager: ${detail}`)
    this.name = 'ArchiveSourceError'
  }
}

/** One regular file read from an archive, by its slash-separated relative path. */
interface ArchiveEntry {
  readonly path: string
  readonly bytes: Uint8Array
}

/** What one materialized source is. */
export interface MaterializedSource {
  /** The directory `pnpm add file:<dir>` installs. */
  readonly dir: string
  /** The package name the unpacked manifest declares. */
  readonly name: string
  /** The package version the unpacked manifest declares, when it has one. */
  readonly version?: string
}

/** Dependencies one materialization consumes. */
export interface MaterializeSourceOptions {
  /** The parsed archive or Drive spec. */
  readonly source: ParsedArchiveInstallSpec
  /** The profile directory the cache lives under. */
  readonly profileDir: string
  /** A signal that cancels the download and leaves no directory behind. */
  readonly signal: AbortSignal
  /** How long the download may take, in milliseconds. */
  readonly timeoutMs?: number
  /** How large the archive may be, in bytes. */
  readonly maxBytes?: number
}

/** Where the unpacked copies live under the profile. */
export function sourceCacheDir(profileDir: string): string {
  return join(profileDir, '.plugin-manager', 'sources')
}

/**
 * Download and unpack one plugin source into the profile cache.
 * @param options - the parsed source, the profile, and the cancellation signal.
 * @returns the directory pnpm installs and the package it declares.
 * @throws {ArchiveSourceError} for every refusal and transport failure.
 */
export async function materializePluginSource(options: MaterializeSourceOptions): Promise<MaterializedSource> {
  const { source, profileDir, signal } = options
  const key = createHash('sha256')
    .update(`${source.url}\n${source.directory ?? ''}\n${source.kind === 'archive' ? source.sha256 ?? '' : ''}`)
    .digest('hex')
  const target = join(sourceCacheDir(profileDir), key)
  const cached = await readMaterialized(target)
  if (cached !== undefined) return cached

  const bytes = await downloadArchive(source.url, signal, options.timeoutMs ?? ARCHIVE_TIMEOUT_MS, options.maxBytes ?? MAX_ARCHIVE_BYTES)
  if (source.kind === 'archive' && source.sha256 !== undefined) {
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== source.sha256) {
      throw new ArchiveSourceError('checksum-mismatch', `the archive hash is ${actual}, not ${source.sha256}`)
    }
  }
  const entries = readArchive(bytes)
  const selected = selectPackage(entries, source.directory)
  if (selected.length === 0) {
    throw new ArchiveSourceError('not-a-package', source.directory === undefined
      ? 'the archive carries no plugin package'
      : `the archive carries no plugin package at ${source.directory}`)
  }

  const staging = `${target}.tmp-${randomUUID()}`
  try {
    await writeEntries(staging, selected)
    const manifest = await readMaterialized(staging)
    if (manifest === undefined) throw new ArchiveSourceError('not-a-package', 'the unpacked directory has no readable package.json')
    if (existsSync(target)) await rm(target, { recursive: true, force: true })
    await rename(staging, target)
    return { ...manifest, dir: target }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

/** Read an already-unpacked source, when a previous installation left one. */
async function readMaterialized(dir: string): Promise<MaterializedSource | undefined> {
  let text: string
  try {
    text = await readFile(join(dir, 'package.json'), 'utf8')
  } catch {
    return undefined
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof manifest !== 'object' || manifest === null) return undefined
  const name = (manifest as { name?: unknown }).name
  if (typeof name !== 'string' || name.trim() === '') return undefined
  const version = (manifest as { version?: unknown }).version
  return { dir, name, ...typeof version === 'string' && version.trim() !== '' ? { version } : {} }
}

/**
 * GET one archive, bounded by time and size.
 * @param url - the http(s) address.
 * @param signal - the installation's cancellation signal.
 * @param timeoutMs - the download deadline.
 * @param maxBytes - the largest accepted body.
 * @returns the archive bytes.
 * @throws {ArchiveSourceError} when the request fails, times out, is cancelled, or is too large.
 */
async function downloadArchive(url: string, signal: AbortSignal, timeoutMs: number, maxBytes: number): Promise<Uint8Array> {
  const deadline = AbortSignal.timeout(timeoutMs)
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.any([signal, deadline]), redirect: 'follow' })
  } catch (error) {
    if (signal.aborted) throw new ArchiveSourceError('cancelled', 'the archive download was cancelled')
    throw new ArchiveSourceError('download-failed', `cannot download the archive: ${messageOf(error)}`)
  }
  if (!response.ok) {
    throw new ArchiveSourceError('download-failed', `the archive answered HTTP ${String(response.status)}`)
  }
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ArchiveSourceError('too-large', `the archive is ${String(declared)} bytes, over the ${String(maxBytes)} byte limit`)
  }
  const reader = response.body?.getReader()
  if (reader === undefined) throw new ArchiveSourceError('download-failed', 'the archive answered no body')
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        throw new ArchiveSourceError('too-large', `the archive is over the ${String(maxBytes)} byte limit`)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof ArchiveSourceError) throw error
    if (signal.aborted) throw new ArchiveSourceError('cancelled', 'the archive download was cancelled')
    throw new ArchiveSourceError('download-failed', `cannot read the archive: ${messageOf(error)}`)
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
}

/**
 * Read every regular file of one zip or tar archive.
 * @param bytes - the archive body.
 * @returns the files by relative path.
 * @throws {ArchiveSourceError} for an unsupported or malformed archive, or one
 *   over the file, size, or path limits.
 */
export function readArchive(bytes: Uint8Array): ArchiveEntry[] {
  const magic = Buffer.from(bytes.subarray(0, 4))
  if (magic.subarray(0, 2).toString('latin1') === 'PK') return readZip(bytes)
  if (magic[0] === 0x1f && magic[1] === 0x8b) return readTar(gunzipSync(bytes))
  if (Buffer.from(bytes.subarray(257, 262)).toString('latin1') === 'ustar') return readTar(bytes)
  throw new ArchiveSourceError('invalid-format', 'the archive is neither a zip nor a tar archive')
}

/**
 * Keep the plugin package's own files: the named directory, or the archive
 * root with a single wrapping directory removed (a GitHub codeload archive).
 */
function selectPackage(entries: readonly ArchiveEntry[], directory: string | undefined): ArchiveEntry[] {
  if (directory !== undefined) {
    const prefix = `${directory}/`
    return entries.filter(entry => entry.path.startsWith(prefix))
      .map(entry => ({ path: entry.path.slice(prefix.length), bytes: entry.bytes }))
  }
  if (entries.some(entry => entry.path === 'package.json')) return [...entries]
  const roots = new Set(entries.map(entry => entry.path.split('/')[0] ?? ''))
  const first = [...roots][0]
  if (roots.size === 1 && first !== undefined && first !== '') {
    const prefix = `${first}/`
    return entries.filter(entry => entry.path.startsWith(prefix))
      .map(entry => ({ path: entry.path.slice(prefix.length), bytes: entry.bytes }))
  }
  return [...entries]
}

/**
 * Write the selected files under one fresh directory, refusing any path that
 * would land outside it.
 */
async function writeEntries(root: string, entries: readonly ArchiveEntry[]): Promise<void> {
  await mkdir(root, { recursive: true })
  const base = resolve(root)
  for (const entry of entries) {
    if (entry.path === '') continue
    const target = resolve(base, ...entry.path.split('/'))
    if (target !== base && !target.startsWith(`${base}${sep}`)) {
      throw new ArchiveSourceError('path-escaped', `the archive entry ${entry.path} escapes the plugin directory`)
    }
    await mkdir(resolve(target, '..'), { recursive: true })
    await writeFile(target, entry.bytes)
  }
}

/** Read a zip archive through its central directory, inflating stored entries. */
function readZip(bytes: Uint8Array): ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEndOfCentralDirectory(view)
  if (eocd === undefined) throw new ArchiveSourceError('invalid-format', 'the zip archive has no end-of-central-directory record')
  const count = view.getUint16(eocd + 10, true)
  const size = view.getUint32(eocd + 12, true)
  const offset = view.getUint32(eocd + 16, true)
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    throw new ArchiveSourceError('invalid-format', 'zip64 archives are not supported')
  }
  if (offset + size > bytes.byteLength) throw new ArchiveSourceError('invalid-format', 'the zip central directory points past the archive')
  const entries: ArchiveEntry[] = []
  let total = 0
  let cursor = offset
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new ArchiveSourceError('invalid-format', 'the zip central directory is malformed')
    }
    const method = view.getUint16(cursor + 10, true)
    const compressed = view.getUint32(cursor + 20, true)
    const uncompressed = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = Buffer.from(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).toString('utf8')
    cursor += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/')) continue
    if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new ArchiveSourceError('invalid-format', `the zip entry ${name} has no local header`)
    }
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localNameLength + localExtraLength
    if (start + compressed > bytes.byteLength) throw new ArchiveSourceError('invalid-format', `the zip entry ${name} points past the archive`)
    if (uncompressed > MAX_ARCHIVE_FILE_BYTES) throw new ArchiveSourceError('too-large', `the zip entry ${name} is over the file size limit`)
    total += uncompressed
    if (total > MAX_EXTRACTED_BYTES) throw new ArchiveSourceError('too-large', 'the archive expands past the size limit')
    const raw = bytes.subarray(start, start + compressed)
    let content: Uint8Array
    if (method === 0) content = raw
    else if (method === 8) content = inflateRawSync(raw)
    else throw new ArchiveSourceError('invalid-format', `the zip entry ${name} uses unsupported compression ${String(method)}`)
    if (content.byteLength !== uncompressed) throw new ArchiveSourceError('invalid-format', `the zip entry ${name} has an unexpected size`)
    entries.push({ path: safeEntryPath(name), bytes: content })
    if (entries.length > MAX_ARCHIVE_FILES) throw new ArchiveSourceError('too-large', 'the archive carries too many files')
  }
  return entries
}

/** Locate the end-of-central-directory record, scanning the last 64 KiB plus its own 22 bytes. */
function findEndOfCentralDirectory(view: DataView): number | undefined {
  const lowest = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let offset = view.byteLength - 22; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  return undefined
}

/** Read an uncompressed tar archive, honouring ustar prefixes, GNU long names, and pax paths. */
function readTar(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  let total = 0
  let longName: string | undefined
  let paxPath: string | undefined
  let cursor = 0
  const buffer = Buffer.from(bytes)
  while (cursor + 512 <= buffer.byteLength) {
    const header = buffer.subarray(cursor, cursor + 512)
    if (header.every(byte => byte === 0)) break
    const size = readTarOctal(header.subarray(124, 136))
    const type = String.fromCharCode(header[156] ?? 0)
    const bodyStart = cursor + 512
    const body = buffer.subarray(bodyStart, bodyStart + size)
    if (body.byteLength < size) throw new ArchiveSourceError('invalid-format', 'the tar archive ends inside an entry')
    cursor = bodyStart + Math.ceil(size / 512) * 512
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0+$/, '')
      continue
    }
    if (type === 'x') {
      paxPath = readPaxPath(body.toString('utf8')) ?? paxPath
      continue
    }
    if (type !== '0' && type !== '\0') continue
    const prefix = String.fromCharCode(...header.subarray(345, 500)).replace(/\0.*$/, '')
    const name = paxPath ?? longName ?? [prefix, String.fromCharCode(...header.subarray(0, 100)).replace(/\0.*$/, '')]
      .filter(part => part !== '').join('/')
    paxPath = undefined
    longName = undefined
    if (name === '') continue
    total += body.byteLength
    if (total > MAX_EXTRACTED_BYTES) throw new ArchiveSourceError('too-large', 'the archive expands past the size limit')
    if (body.byteLength > MAX_ARCHIVE_FILE_BYTES) throw new ArchiveSourceError('too-large', `the tar entry ${name} is over the file size limit`)
    entries.push({ path: safeEntryPath(name), bytes: body })
    if (entries.length > MAX_ARCHIVE_FILES) throw new ArchiveSourceError('too-large', 'the archive carries too many files')
  }
  return entries
}

function readTarOctal(field: Uint8Array): number {
  const text = String.fromCharCode(...field).replace(/\0.*$/, '').trim()
  if (text === '') return 0
  // A base-256 size (tar's extension for very large members) is outside this
  // manager's limits, and reading it as zero would desynchronize the stream.
  if (!/^[0-7]+$/.test(text)) throw new ArchiveSourceError('invalid-format', 'the tar archive has an unreadable member size')
  const value = Number.parseInt(text, 8)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

/** The `path` record of one pax extended header, when it carries a plain path. */
function readPaxPath(text: string): string | undefined {
  for (const record of text.split('\n')) {
    const space = record.indexOf(' ')
    if (space === -1) continue
    const body = record.slice(space + 1)
    if (body.startsWith('path=')) return body.slice('path='.length)
  }
  return undefined
}

/** Normalize one entry name, refusing anything that could escape the extraction directory. */
function safeEntryPath(name: string): string {
  const normalized = name.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '')
  if (normalized === '' || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0')) {
    throw new ArchiveSourceError('path-escaped', `the archive entry ${name} is not a relative path`)
  }
  if (normalized.split('/').some(segment => segment === '..' || segment === '')) {
    throw new ArchiveSourceError('path-escaped', `the archive entry ${name} escapes the plugin directory`)
  }
  return normalized
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
