/**
 * Skill package distribution: verify, pack and install one skill directory.
 *
 * A skill package is `SKILL.md`, its `references/`, its `scripts/` and its
 * `skill.manifest.json` (the manifest lists every file with a hash). Packing
 * refuses an incomplete or stale package; installing verifies the archive and
 * refuses unsafe entries, so another agent cannot end up with a half skill.
 *
 * @module scripts/skill-package-lib
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { unzipSync, zipSync } from 'fflate'

/** Fixed archive timestamp so two packs of the same bytes are identical. */
const FIXED_MTIME = 315532800000

/** Files a package carries besides the manifest-listed ones. */
const UNLISTED_ALLOWED = new Set(['skill.manifest.json', 'references/standards.lock.json'])

/** One manifest file entry. */
export interface SkillPackageFile {
  readonly path: string
  readonly sha256?: string
}

/** The packaged skill manifest. */
export interface SkillManifest {
  readonly name: string
  readonly version: string
  readonly scope?: string
  readonly standardsLock?: string
  readonly requires?: readonly string[]
  readonly files: readonly SkillPackageFile[]
}

/** A package failure with a stable code. */
export class SkillPackageError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'SkillPackageError'
  }
}

/** Read and minimally validate a skill manifest. */
export function readSkillManifest(directory: string): SkillManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(directory, 'skill.manifest.json'), 'utf8'))
  } catch {
    throw new SkillPackageError(`${directory} has no readable skill.manifest.json`, 'MANIFEST_MISSING')
  }
  if (typeof parsed !== 'object' || parsed === null) throw new SkillPackageError('skill.manifest.json is not an object', 'MANIFEST_INVALID')
  const manifest = parsed as SkillManifest
  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') throw new SkillPackageError('manifest.name is required', 'MANIFEST_INVALID')
  if (!Array.isArray(manifest.files)) throw new SkillPackageError('manifest.files is required', 'MANIFEST_INVALID')
  return manifest
}

/** Hex SHA-256 of a file's bytes. */
export function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** All regular files under one directory, relative and `/`-separated. */
function listFiles(directory: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry)
      if (statSync(path).isDirectory()) walk(path)
      else files.push(relativePath(directory, path))
    }
  }
  walk(directory)
  return files.sort()
}

/** One file's path relative to a directory, in `/` form. */
function relativePath(directory: string, path: string): string {
  return path.slice(directory.length + 1).replace(/\\/gu, '/')
}

/** Reject a path that escapes the package or is absolute. */
function assertSafePath(relativeFile: string): void {
  if (relativeFile.startsWith('/') || /^[A-Za-z]:/u.test(relativeFile) || relativeFile.split('/').includes('..')) {
    throw new SkillPackageError(`unsafe package path: ${relativeFile}`, 'UNSAFE_ENTRY')
  }
}

/**
 * Verify one skill directory against its manifest.
 * @param directory skill directory.
 * @returns the manifest.
 * @throws {SkillPackageError} `MANIFEST_*`, `FILE_MISSING`, `HASH_MISMATCH`,
 *   `UNLISTED_FILE` or `REQUIRED_MISSING`.
 */
export function verifySkillPackage(directory: string): SkillManifest {
  const manifest = readSkillManifest(directory)
  if (!existsSync(join(directory, 'SKILL.md'))) throw new SkillPackageError('SKILL.md is missing', 'FILE_MISSING')
  const listed = new Set(manifest.files.map(file => file.path))
  if (!listed.has('SKILL.md')) throw new SkillPackageError('manifest.files does not list SKILL.md', 'REQUIRED_MISSING')
  for (const file of manifest.files) {
    assertSafePath(file.path)
    const path = join(directory, file.path)
    if (!existsSync(path)) throw new SkillPackageError(`missing packaged file: ${file.path}`, 'FILE_MISSING')
    if (file.sha256 !== undefined && fileSha256(path) !== file.sha256) {
      throw new SkillPackageError(`stale hash for ${file.path}`, 'HASH_MISMATCH')
    }
  }
  for (const required of manifest.requires ?? []) {
    if (!listed.has(required)) throw new SkillPackageError(`requires ${required} is not listed in files`, 'REQUIRED_MISSING')
    if (!existsSync(join(directory, required))) throw new SkillPackageError(`missing required file: ${required}`, 'FILE_MISSING')
  }
  for (const file of listFiles(directory)) {
    if (!listed.has(file) && !UNLISTED_ALLOWED.has(file)) {
      throw new SkillPackageError(`unlisted file: ${file}`, 'UNLISTED_FILE')
    }
  }
  return manifest
}

/** One packed package. */
export interface PackedSkill {
  readonly archivePath: string
  readonly checksum: string
  readonly bytes: number
  readonly files: number
}

/**
 * Pack one verified skill directory into a deterministic ZIP plus checksum and
 * descriptor files.
 * @param options skill directory and output directory.
 * @returns the archive path, checksum, size and file count.
 */
export function packSkill(options: { directory: string; outDir: string }): PackedSkill {
  const manifest = verifySkillPackage(options.directory)
  const entries: Record<string, [Uint8Array, { mtime: number }]> = {}
  for (const file of manifest.files) {
    entries[file.path] = [new Uint8Array(readFileSync(join(options.directory, file.path))), { mtime: FIXED_MTIME }]
  }
  entries['skill.manifest.json'] = [new Uint8Array(readFileSync(join(options.directory, 'skill.manifest.json'))), { mtime: FIXED_MTIME }]
  const lock = join(options.directory, 'references', 'standards.lock.json')
  if (existsSync(lock)) entries['references/standards.lock.json'] = [new Uint8Array(readFileSync(lock)), { mtime: FIXED_MTIME }]
  const archive = zipSync(entries, { level: 9 })
  mkdirSync(options.outDir, { recursive: true })
  const base = `${manifest.name}-${manifest.version}`
  const archivePath = join(options.outDir, `${base}.zip`)
  writeFileSync(archivePath, archive)
  const checksum = createHash('sha256').update(archive).digest('hex')
  writeFileSync(join(options.outDir, `${base}.zip.sha256`), `${checksum}  ${basename(archivePath)}\n`)
  writeFileSync(join(options.outDir, `${base}.json`), `${JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    scope: manifest.scope,
    standardsLock: manifest.standardsLock,
    files: manifest.files.map(file => file.path),
    archive: basename(archivePath),
    checksum,
    bytes: archive.length,
  }, null, 2)}\n`)
  return { archivePath, checksum, bytes: archive.length, files: manifest.files.length }
}

/** One installed package. */
export interface InstalledSkill {
  readonly installedAt: string
  readonly files: number
  readonly replaced: boolean
}

/**
 * Install one package into a skills root, verifying it first.
 * @param options source (directory or ZIP), destination root, and whether to
 *   replace an existing same-named skill.
 * @returns the installed directory and file count.
 */
export function installSkill(options: { from: string; skillsRoot: string; force?: boolean }): InstalledSkill {
  const source = resolve(options.from)
  const zip = statSync(source).isFile()
  const manifest = zip ? undefined : verifySkillPackage(source)
  const name = manifest?.name ?? readSkillManifestFromZip(source).name
  const target = join(options.skillsRoot, name)
  if (existsSync(target) && options.force !== true) {
    throw new SkillPackageError(`${target} already exists; pass --force to replace it`, 'TARGET_EXISTS')
  }
  mkdirSync(options.skillsRoot, { recursive: true })
  const staging = join(options.skillsRoot, `.installing-${name}-${process.pid}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  try {
    if (zip) {
      const entries = unzipSync(new Uint8Array(readFileSync(source)))
      for (const [path, bytes] of Object.entries(entries)) {
        assertSafePath(path)
        if (path.endsWith('/')) continue
        const destination = join(staging, path)
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, bytes)
      }
    } else {
      for (const file of listFiles(source)) {
        const destination = join(staging, file)
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, readFileSync(join(source, file)))
      }
    }
    const verified = verifySkillPackage(staging)
    const replaced = existsSync(target)
    rmSync(target, { recursive: true, force: true })
    renameSync(staging, target)
    return { installedAt: target, files: verified.files.length, replaced }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

/** Read the manifest inside a ZIP without installing it. */
function readSkillManifestFromZip(archive: string): SkillManifest {
  const entries = unzipSync(new Uint8Array(readFileSync(archive)))
  const raw = entries['skill.manifest.json']
  if (raw === undefined) throw new SkillPackageError('archive has no skill.manifest.json', 'MANIFEST_MISSING')
  const manifest = JSON.parse(new TextDecoder().decode(raw)) as SkillManifest
  if (typeof manifest.name !== 'string' || manifest.name.trim() === '') throw new SkillPackageError('manifest.name is required', 'MANIFEST_INVALID')
  return manifest
}
