/**
 * Local SkillHub installer: fetches a skill's exact files, verifies them against
 * the upstream manifest, and publishes them into the Harness skill root — the
 * same place a hand-written skill lives, so the skill provider discovers it
 * without any further registration.
 *
 * Enable/disable is a location, not a flag: the directory moves between the
 * enabled skill root and this package's disabled root, exactly as the SkillHub
 * market does, so the disk always states the fact.
 * @module @deepseek-ai/dsh-sdkwork-skillhub/installer
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  SkillhubError,
  parseSkillhubPackageKey,
  sha256Hex,
  type SkillhubClient,
  type SkillhubCoordinate,
} from './skillhub.ts'
import type { SkillhubDetail, SkillhubFileInfo, SkillhubInstalledSkill } from './shared.ts'

/** One managed install, as the ledger records it. */
interface LedgerEntry {
  readonly packageKey: string
  readonly namespace: string
  readonly slug: string
  readonly version: string
  readonly files: number
  readonly bytes: number
  readonly installedAt: string
}

interface LedgerFile {
  readonly version: 1
  readonly skills: Record<string, LedgerEntry>
}

/** Installer inputs: both roots, the ledger, and the upstream client. */
export interface SkillhubInstallerOptions {
  /** The Harness skill root (`$DSH_HOME/skills`); files here are live skills. */
  skillsRoot: string
  /** Where a disabled skill's directory is parked (outside the skill roots). */
  disabledRoot: string
  /** Durable ledger of managed installs. */
  ledgerPath: string
  client: SkillhubClient
  /** Parallel file downloads. */
  concurrency?: number
}

const STAGING_PREFIX = '.staging-'
const PREVIOUS_PREFIX = '.previous-'
const DEFAULT_CONCURRENCY = 4

function directoryId(namespace: string, slug: string): string {
  const safe = (value: string): string => value.replaceAll(/[^A-Za-z0-9._-]+/g, '_').slice(0, 96)
  return `${safe(namespace)}--${safe(slug)}`
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function directories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
  } catch {
    return []
  }
}

/** Local install engine shared by the installer routes and their tests. */
export class SkillhubInstaller {
  readonly #skillsRoot: string
  readonly #disabledRoot: string
  readonly #ledgerPath: string
  readonly #client: SkillhubClient
  readonly #concurrency: number

  constructor(options: SkillhubInstallerOptions) {
    this.#skillsRoot = options.skillsRoot
    this.#disabledRoot = options.disabledRoot
    this.#ledgerPath = options.ledgerPath
    this.#client = options.client
    this.#concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  }

  /** The enabled skill root, for callers that must describe it. */
  get skillsRoot(): string {
    return this.#skillsRoot
  }

  async #readLedger(): Promise<LedgerFile> {
    try {
      const text = await readFile(this.#ledgerPath, 'utf8')
      const parsed = JSON.parse(text) as Partial<LedgerFile>
      if (parsed === null || typeof parsed !== 'object' || typeof parsed.skills !== 'object' || parsed.skills === null) {
        return { version: 1, skills: {} }
      }
      return { version: 1, skills: parsed.skills as Record<string, LedgerEntry> }
    } catch {
      return { version: 1, skills: {} }
    }
  }

  async #writeLedger(ledger: LedgerFile): Promise<void> {
    await mkdir(dirname(this.#ledgerPath), { recursive: true })
    const temporary = `${this.#ledgerPath}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
    await rename(temporary, this.#ledgerPath)
  }

  #record(id: string, directory: string, enabled: boolean, entry: LedgerEntry | undefined): SkillhubInstalledSkill {
    return {
      id,
      namespace: entry?.namespace ?? id.split('--')[0] ?? '',
      slug: entry?.slug ?? id.split('--').slice(1).join('--'),
      packageKey: entry?.packageKey ?? '',
      version: entry?.version ?? '',
      enabled,
      directory,
      files: entry?.files ?? 0,
      bytes: entry?.bytes ?? 0,
      installedAt: entry?.installedAt ?? '',
    }
  }

  /** Everything the roots hold, with ledger metadata where this package installed it. */
  async list(): Promise<SkillhubInstalledSkill[]> {
    const ledger = await this.#readLedger()
    const active = new Set(await directories(this.#skillsRoot))
    const disabled = new Set(await directories(this.#disabledRoot))
    const ids = new Set([...Object.keys(ledger.skills), ...active, ...disabled])
    const skills: SkillhubInstalledSkill[] = []
    for (const id of [...ids].sort()) {
      const enabled = active.has(id)
      if (!enabled && !disabled.has(id)) continue
      const directory = join(enabled ? this.#skillsRoot : this.#disabledRoot, id)
      skills.push(this.#record(id, directory, enabled, ledger.skills[id]))
    }
    return skills
  }

  async #download(coord: SkillhubCoordinate, version: string, files: readonly SkillhubFileInfo[], staging: string): Promise<number> {
    let next = 0
    let bytes = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = next
        next += 1
        const file = files[index]
        if (file === undefined) return
        const content = await this.#client.file(coord, file.path, version)
        if (content.byteLength !== file.size) {
          throw new SkillhubError('checksum', `${file.path} is ${content.byteLength} bytes, the manifest declares ${file.size}`, 502)
        }
        const digest = sha256Hex(content)
        if (digest !== file.sha256) {
          throw new SkillhubError('checksum', `${file.path} does not match the manifest checksum`, 502)
        }
        const target = join(staging, ...file.path.split('/'))
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, content)
        bytes += content.byteLength
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.#concurrency, files.length) }, worker))
    return bytes
  }

  /**
   * Install one catalog skill (or a pinned version) into the skill root.
   * A failed download or checksum leaves the previous installation untouched:
   * files are staged beside it and swapped in only after every check passes.
   * @param packageKey - catalog package key carrying the upstream coordinate.
   * @param version - exact upstream version; omitted installs the current latest.
   * @returns the installed record.
   */
  async install(packageKey: string, version?: string): Promise<SkillhubInstalledSkill> {
    const coord = parseSkillhubPackageKey(packageKey)
    if (coord === undefined) {
      throw new SkillhubError('unsupported-coordinate', `${packageKey} does not carry a SkillHub namespace and slug`, 400)
    }
    const manifest = await this.#client.files(coord, version)
    if (version !== undefined && manifest.version !== version) {
      throw new SkillhubError('not-found', `SkillHub does not publish ${version} for ${packageKey}`, 404)
    }
    const id = directoryId(coord.namespace, coord.slug)
    const activePath = join(this.#skillsRoot, id)
    const disabledPath = join(this.#disabledRoot, id)
    const wasDisabled = !await exists(activePath) && await exists(disabledPath)
    const staging = join(this.#skillsRoot, `${STAGING_PREFIX}${randomUUID()}`)
    const previous = join(this.#skillsRoot, `${PREVIOUS_PREFIX}${randomUUID()}`)

    await mkdir(staging, { recursive: true })
    let bytes: number
    try {
      bytes = await this.#download(coord, manifest.version, manifest.files, staging)
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      throw error
    }

    const destination = wasDisabled ? disabledPath : activePath
    await mkdir(dirname(destination), { recursive: true })
    const hadPrevious = await exists(destination)
    if (hadPrevious) await rename(destination, previous)
    try {
      await rename(staging, destination)
    } catch (error) {
      if (hadPrevious) await rename(previous, destination).catch(() => {})
      await rm(staging, { recursive: true, force: true })
      throw new SkillhubError('install-failed', `could not publish the skill directory: ${error instanceof Error ? error.message : String(error)}`, 500)
    }
    if (hadPrevious) await rm(previous, { recursive: true, force: true })

    const entry: LedgerEntry = {
      packageKey,
      namespace: coord.namespace,
      slug: coord.slug,
      version: manifest.version,
      files: manifest.files.length,
      bytes,
      installedAt: new Date().toISOString(),
    }
    const ledger = await this.#readLedger()
    ledger.skills[id] = entry
    await this.#writeLedger(ledger)
    return this.#record(id, destination, !wasDisabled, entry)
  }

  /**
   * Remove an installed skill from both roots.
   * @param packageKey - catalog package key carrying the upstream coordinate.
   * @returns whether anything was removed.
   */
  async uninstall(packageKey: string): Promise<boolean> {
    const coord = parseSkillhubPackageKey(packageKey)
    if (coord === undefined) {
      throw new SkillhubError('unsupported-coordinate', `${packageKey} does not carry a SkillHub namespace and slug`, 400)
    }
    const id = directoryId(coord.namespace, coord.slug)
    let removed = false
    for (const root of [this.#skillsRoot, this.#disabledRoot]) {
      const path = join(root, id)
      if (await exists(path)) {
        await rm(path, { recursive: true, force: true })
        removed = true
      }
    }
    const ledger = await this.#readLedger()
    if (ledger.skills[id] !== undefined) {
      delete ledger.skills[id]
      await this.#writeLedger(ledger)
      removed = true
    }
    return removed
  }

  /**
   * Move an installed skill between the enabled and disabled roots.
   * @param packageKey - catalog package key carrying the upstream coordinate.
   * @param enabled - target state.
   * @returns the installed record at its new location.
   */
  async setEnabled(packageKey: string, enabled: boolean): Promise<SkillhubInstalledSkill> {
    const coord = parseSkillhubPackageKey(packageKey)
    if (coord === undefined) {
      throw new SkillhubError('unsupported-coordinate', `${packageKey} does not carry a SkillHub namespace and slug`, 400)
    }
    const id = directoryId(coord.namespace, coord.slug)
    const ledger = await this.#readLedger()
    const entry = ledger.skills[id]
    const source = join(enabled ? this.#disabledRoot : this.#skillsRoot, id)
    const destination = join(enabled ? this.#skillsRoot : this.#disabledRoot, id)
    const alreadyThere = await exists(destination)
    if (!await exists(source)) {
      if (!alreadyThere) throw new SkillhubError('not-found', `${packageKey} is not installed`, 404)
      return this.#record(id, destination, enabled, entry)
    }
    await mkdir(dirname(destination), { recursive: true })
    if (alreadyThere) await rm(destination, { recursive: true, force: true })
    await rename(source, destination)
    return this.#record(id, destination, enabled, entry)
  }

  /**
   * Upstream detail for one skill: versions (with security reports) and the
   * file list of the requested or latest version.
   * @param packageKey - catalog package key carrying the upstream coordinate.
   * @param version - version whose file list is reported; omitted reports latest.
   * @returns the detail payload the browser drawer renders.
   */
  async detail(packageKey: string, version?: string): Promise<SkillhubDetail> {
    const coord = parseSkillhubPackageKey(packageKey)
    if (coord === undefined) {
      throw new SkillhubError('unsupported-coordinate', `${packageKey} does not carry a SkillHub namespace and slug`, 400)
    }
    const [detail, manifest] = await Promise.all([
      this.#client.versions(coord),
      this.#client.files(coord, version),
    ])
    return {
      namespace: coord.namespace,
      slug: coord.slug,
      name: detail.name,
      summary: detail.summary,
      version: manifest.version,
      files: manifest.files,
      versions: detail.versions,
    }
  }
}

/** Directory id for one upstream coordinate (exported for tests and callers). */
export { directoryId }
