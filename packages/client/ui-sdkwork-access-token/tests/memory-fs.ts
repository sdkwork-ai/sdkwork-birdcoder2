/**
 * In-memory directory bridge for the access-token initializer specs. Mirrors
 * the governed Host bridge the plugin consumes: listing reports child
 * directories only, a write needs its parent to exist, and a read of an absent
 * file rejects (the initializer treats that as an absent profile file).
 */
import type { AccessTokenFileSystem } from '../src/client/project.ts'

/** Join one POSIX test path with one segment. */
function childPath(parent: string, name: string): string {
  return `${parent.replace(/\/+$/u, '')}/${name}`
}

/** In-memory bridge with write tracking. */
export class MemoryFs implements AccessTokenFileSystem {
  /** File contents by absolute POSIX path. */
  readonly files = new Map<string, string>()
  /** Existing directories by absolute POSIX path. */
  readonly directories = new Set<string>()
  /** Every successful write, in call order. */
  readonly writes: string[] = []

  /**
   * @param directories - existing directories.
   * @param files - initial file contents.
   */
  constructor(directories: readonly string[], files: Readonly<Record<string, string>> = {}) {
    for (const directory of directories) this.directories.add(directory)
    for (const [path, content] of Object.entries(files)) this.files.set(path, content)
  }

  /** @param path - directory to list. */
  async listDirectory(path: string): Promise<{
    path: string
    entries: ReadonlyArray<{ name: string; path: string }>
  }> {
    if (!this.directories.has(path)) throw new Error(`cannot list ${path}`)
    const prefix = `${path.replace(/\/+$/u, '')}/`
    const entries = [...this.directories]
      .filter(candidate => candidate !== path && candidate.startsWith(prefix)
        && !candidate.slice(prefix.length).includes('/'))
      .sort()
      .map(candidate => ({ name: candidate.slice(prefix.length), path: candidate }))
    return { path, entries }
  }

  /** @param path - file to read. */
  async readTextFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`cannot read ${path}: not a file`)
    return content
  }

  /** @param path - file to write; its parent must exist. */
  async writeTextFile(path: string, content: string): Promise<string> {
    const parent = path.slice(0, path.lastIndexOf('/'))
    if (!this.directories.has(parent)) throw new Error(`cannot write ${path}: parent ${parent} is missing`)
    this.files.set(path, content)
    this.writes.push(path)
    return path
  }

  /** @param path - existing parent directory. @param name - one child segment. */
  async createDirectory(path: string, name: string): Promise<string> {
    if (!this.directories.has(path)) throw new Error(`cannot create under ${path}`)
    const created = childPath(path, name)
    this.directories.add(created)
    return created
  }
}
