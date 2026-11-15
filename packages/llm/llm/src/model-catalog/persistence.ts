/**
 * Copy-on-write persistence for the model catalog.
 *
 * A save writes a new content-addressed revision file first and only then
 * replaces the `current.json` pointer, so a crash leaves either the old
 * pointer or the new one - never a half-written catalog. A load validates the
 * pointer target and, when it is missing or corrupt, falls back to the newest
 * valid revision file, then to "no local catalog".
 *
 * The filesystem is injected so this package stays usable from any host and the
 * ordering rules remain testable without touching a real disk.
 *
 * @module @deepseek-ai/dsh-llm/model-catalog/persistence
 */

import { ModelCatalogContractError, parseModelCatalogSnapshot } from './validation.ts'
import type { ModelCatalogSnapshot } from './types.ts'

/** The filesystem operations copy-on-write persistence needs. */
export interface CatalogFileSystem {
  /** Read a UTF-8 file, or `undefined` when it does not exist. */
  readText(path: string): Promise<string | undefined>
  /**
   * Write UTF-8 text atomically: write a sibling temp file, flush it, then
   * rename it over the destination.
   */
  writeTextAtomic(path: string, content: string): Promise<void>
  /** List a directory's file names, excluding `.` and `..`; empty when absent. */
  listFiles(directory: string): Promise<readonly string[]>
  /** Remove a file; a missing file is not an error. */
  removeFile(path: string): Promise<void>
  /** Create a directory and its parents when absent. */
  ensureDirectory(path: string): Promise<void>
}

/** What a loaded persistence returns. */
export interface PersistedModelCatalog {
  /** The validated snapshot. */
  readonly snapshot: ModelCatalogSnapshot
  /** Validator the snapshot was fetched with. */
  readonly etag?: string
}

/** Durable storage for the local catalog. */
export interface CatalogPersistence {
  /** Load the last known good catalog. */
  load(): Promise<PersistedModelCatalog | undefined>
  /** Persist one catalog as the new current revision. */
  save(snapshot: ModelCatalogSnapshot, options?: { readonly etag?: string }): Promise<void>
}

/** Options for {@link CopyOnWriteCatalogPersistence}. */
export interface CopyOnWriteCatalogPersistenceOptions {
  /** Root directory owned by the syncer. */
  readonly directory: string
  /** Filesystem backend. */
  readonly fileSystem: CatalogFileSystem
  /** Content digest used in revision file names and integrity checks. */
  readonly hash?: (content: string) => string
  /** Revision files to retain, including the current one. Defaults to 3. */
  readonly keepRevisions?: number
  /** Clock used for `savedAt`. */
  readonly now?: () => Date
}

/** The pointer document written last on every save. */
interface CatalogPointer {
  readonly generation: number
  readonly revision: number
  readonly file: string
  readonly contentHash?: string
  readonly etag?: string
  readonly savedAt: string
}

const POINTER_FILE = 'current.json'
const REVISIONS_DIRECTORY = 'revisions'
const QUARANTINE_DIRECTORY = 'quarantine'
const REVISION_FILE_NAME = /^([0-9]{1,19})(?:-([0-9a-z]{1,64}))?\.json$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parsePointer(value: unknown): CatalogPointer | undefined {
  if (!isRecord(value)) return undefined
  const { generation, revision, file, contentHash, etag, savedAt } = value
  if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 1) return undefined
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) return undefined
  if (typeof file !== 'string' || !REVISION_FILE_NAME.test(file)) return undefined
  if (contentHash !== undefined && typeof contentHash !== 'string') return undefined
  if (etag !== undefined && typeof etag !== 'string') return undefined
  if (typeof savedAt !== 'string' || savedAt.length === 0) return undefined
  return {
    generation,
    revision,
    file,
    ...(contentHash === undefined ? {} : { contentHash }),
    ...(etag === undefined ? {} : { etag }),
    savedAt,
  }
}

function revisionOf(fileName: string): number | undefined {
  const match = REVISION_FILE_NAME.exec(fileName)
  return match === null ? undefined : Number(match[1])
}

/** Durable copy-on-write catalog storage. */
export class CopyOnWriteCatalogPersistence implements CatalogPersistence {
  readonly #directory: string
  readonly #fileSystem: CatalogFileSystem
  readonly #hash: ((content: string) => string) | undefined
  readonly #keepRevisions: number
  readonly #now: () => Date

  constructor(options: CopyOnWriteCatalogPersistenceOptions) {
    this.#directory = options.directory
    this.#fileSystem = options.fileSystem
    this.#hash = options.hash
    this.#keepRevisions = Math.max(1, options.keepRevisions ?? 3)
    this.#now = options.now ?? (() => new Date())
  }

  async load(): Promise<PersistedModelCatalog | undefined> {
    const pointerText = await this.#fileSystem.readText(this.#pointerPath())
    const pointer = pointerText === undefined ? undefined : parsePointer(this.#parseJson(pointerText))
    if (pointer !== undefined) {
      const loaded = await this.#loadRevision(pointer.file, pointer)
      if (loaded !== undefined) {
        return {
          snapshot: loaded,
          ...(pointer.etag === undefined ? {} : { etag: pointer.etag }),
        }
      }
    }
    return this.#loadNewestValidRevision()
  }

  async save(snapshot: ModelCatalogSnapshot, options: { readonly etag?: string } = {}): Promise<void> {
    const directory = this.#directory
    const revisionsDirectory = this.#revisionsPath()
    await this.#fileSystem.ensureDirectory(directory)
    await this.#fileSystem.ensureDirectory(revisionsDirectory)
    const content = JSON.stringify(snapshot)
    const contentHash = this.#hash?.(content).slice(0, 16)
    const fileName = `${snapshot.revision}${contentHash === undefined ? '' : `-${contentHash}`}.json`
    const revisionPath = `${revisionsDirectory}/${fileName}`
    await this.#fileSystem.writeTextAtomic(revisionPath, content)

    // The pointer replace is the commit point: everything it references is
    // already durable.
    const previous = await this.#readPointer()
    const pointer: CatalogPointer = {
      generation: (previous?.generation ?? 0) + 1,
      revision: snapshot.revision,
      file: fileName,
      savedAt: this.#now().toISOString(),
      ...(contentHash === undefined ? {} : { contentHash }),
      ...(options.etag === undefined ? {} : { etag: options.etag }),
    }
    await this.#fileSystem.writeTextAtomic(this.#pointerPath(), JSON.stringify(pointer))
    await this.#prune(fileName)
  }

  async #loadRevision(fileName: string, pointer: CatalogPointer): Promise<ModelCatalogSnapshot | undefined> {
    if (!REVISION_FILE_NAME.test(fileName)) return undefined
    const path = `${this.#revisionsPath()}/${fileName}`
    const text = await this.#fileSystem.readText(path)
    if (text === undefined) return undefined
    const snapshot = this.#parseSnapshot(text, pointer)
    if (snapshot === undefined) {
      await this.#quarantine(fileName, text)
      return undefined
    }
    return snapshot
  }

  #parseSnapshot(text: string, pointer: CatalogPointer): ModelCatalogSnapshot | undefined {
    if (pointer.contentHash !== undefined && this.#hash !== undefined) {
      if (this.#hash(text).slice(0, 16) !== pointer.contentHash) return undefined
    }
    try {
      const snapshot = parseModelCatalogSnapshot(this.#parseJson(text))
      return snapshot.revision === pointer.revision ? snapshot : undefined
    } catch (error) {
      if (error instanceof ModelCatalogContractError) return undefined
      throw error
    }
  }

  async #loadNewestValidRevision(): Promise<PersistedModelCatalog | undefined> {
    const revisionsDirectory = this.#revisionsPath()
    const files = await this.#fileSystem.listFiles(revisionsDirectory)
    const candidates = files
      .flatMap((fileName) => {
        const revision = revisionOf(fileName)
        return revision === undefined ? [] : [{ fileName, revision }]
      })
      .sort((left, right) => right.revision - left.revision)
    for (const candidate of candidates) {
      const text = await this.#fileSystem.readText(`${revisionsDirectory}/${candidate.fileName}`)
      if (text === undefined) continue
      try {
        const snapshot = parseModelCatalogSnapshot(this.#parseJson(text))
        if (snapshot.revision !== candidate.revision) continue
        // Restore the pointer so the next start takes the fast path.
        await this.#restorePointer(candidate.fileName, snapshot, text).catch(() => {})
        return { snapshot }
      } catch {
        await this.#quarantine(candidate.fileName, text)
      }
    }
    return undefined
  }

  async #restorePointer(fileName: string, snapshot: ModelCatalogSnapshot, text: string): Promise<void> {
    const contentHash = this.#hash?.(text).slice(0, 16)
    const previous = await this.#readPointer()
    const pointer: CatalogPointer = {
      generation: (previous?.generation ?? 0) + 1,
      revision: snapshot.revision,
      file: fileName,
      savedAt: this.#now().toISOString(),
      ...(contentHash === undefined ? {} : { contentHash }),
    }
    await this.#fileSystem.ensureDirectory(this.#revisionsPath())
    await this.#fileSystem.writeTextAtomic(this.#pointerPath(), JSON.stringify(pointer))
  }

  async #readPointer(): Promise<CatalogPointer | undefined> {
    const text = await this.#fileSystem.readText(this.#pointerPath())
    return text === undefined ? undefined : parsePointer(this.#parseJson(text))
  }

  async #prune(currentFileName: string): Promise<void> {
    const revisionsDirectory = this.#revisionsPath()
    let files: readonly string[]
    try {
      files = await this.#fileSystem.listFiles(revisionsDirectory)
    } catch {
      return
    }
    const removable = files
      .flatMap((fileName) => {
        const revision = revisionOf(fileName)
        return revision === undefined ? [] : [{ fileName, revision }]
      })
      .sort((left, right) => right.revision - left.revision)
      .slice(this.#keepRevisions)
    for (const file of removable) {
      if (file.fileName === currentFileName) continue
      await this.#fileSystem.removeFile(`${revisionsDirectory}/${file.fileName}`).catch(() => {})
    }
  }

  async #quarantine(fileName: string, text: string): Promise<void> {
    try {
      await this.#fileSystem.ensureDirectory(`${this.#directory}/${QUARANTINE_DIRECTORY}`)
      await this.#fileSystem.writeTextAtomic(`${this.#directory}/${QUARANTINE_DIRECTORY}/${fileName}`, text)
    } catch {
      // Quarantine is best effort; the corrupt file is simply ignored.
    }
    await this.#fileSystem.removeFile(`${this.#revisionsPath()}/${fileName}`).catch(() => {})
  }

  #parseJson(text: string): unknown {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return undefined
    }
  }

  #pointerPath(): string {
    return `${this.#directory}/${POINTER_FILE}`
  }

  #revisionsPath(): string {
    return `${this.#directory}/${REVISIONS_DIRECTORY}`
  }
}

/** In-memory persistence for tests and for a host without a writable directory. */
export class MemoryCatalogPersistence implements CatalogPersistence {
  #current: PersistedModelCatalog | undefined

  /** @param initial - an optional starting catalog. */
  constructor(initial?: PersistedModelCatalog) {
    this.#current = initial
  }

  /** @returns the stored catalog. */
  async load(): Promise<PersistedModelCatalog | undefined> {
    return this.#current
  }

  /** Replace the stored catalog. */
  async save(snapshot: ModelCatalogSnapshot, options: { readonly etag?: string } = {}): Promise<void> {
    this.#current = {
      snapshot,
      ...(options.etag === undefined ? {} : { etag: options.etag }),
    }
  }
}
