/**
 * SkillHub catalog client: the upstream reads the installer needs, trimmed to
 * the documented surface (`dsh-skill-market`'s `docs/skillhub-api.md`).
 *
 * Every request is pinned to a version where the upstream supports it: a file
 * download without `version` silently returns the latest file, which mixes
 * versions inside one installed directory and fails the manifest checksum.
 * @module @deepseek-ai/dsh-sdkwork-skillhub/skillhub
 */
import { createHash } from 'node:crypto'
import type { SkillhubErrorCode, SkillhubFileInfo, SkillhubSecurityReport, SkillhubVersionInfo } from './shared.ts'

/** Coded failure the routes map to a status and a stable code. */
export class SkillhubError extends Error {
  constructor(
    /** Stable code the browser maps to localized copy. */
    readonly code: SkillhubErrorCode,
    message: string,
    /** HTTP status the route answers with. */
    readonly status: number,
  ) {
    super(message)
    this.name = 'SkillhubError'
  }
}

/** Upstream identity of one skill. */
export interface SkillhubCoordinate {
  readonly namespace: string
  readonly slug: string
}

const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_VERSION_BYTES = 256 * 1024 * 1024
const MAX_FILES = 2_000

/**
 * Read the upstream coordinate out of a catalog package key.
 *
 * The catalog stores `skillhub.<handle>/<slug>`; `/` cannot appear in either
 * upstream segment, so the split is unambiguous.
 * @param packageKey - catalog package key.
 * @returns the coordinate, or undefined when the key is not an installable SkillHub record.
 */
export function parseSkillhubPackageKey(packageKey: string): SkillhubCoordinate | undefined {
  const trimmed = packageKey.trim()
  if (!trimmed.startsWith('skillhub.')) return undefined
  const parts = trimmed.slice('skillhub.'.length).split('/')
  if (parts.length !== 2) return undefined
  const [namespace, slug] = parts
  if (namespace === undefined || slug === undefined) return undefined
  if (!SEGMENT_PATTERN.test(namespace) || !SEGMENT_PATTERN.test(slug)) return undefined
  return { namespace, slug }
}

/** Reject a relative skill file path that could escape the installed directory. */
export function isSafeSkillFilePath(path: string): boolean {
  if (path === '' || path.length > 512) return false
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false
  const segments = path.split('/')
  if (segments.length === 0) return false
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false
    if (segment.length > 128) return false
  }
  return true
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object') return undefined
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function securityReports(value: unknown): SkillhubSecurityReport[] {
  const record = asRecord(value)
  if (record === undefined) return []
  const reports: SkillhubSecurityReport[] = []
  for (const [vendor, entry] of Object.entries(record)) {
    const detail = asRecord(entry)
    if (detail === undefined) continue
    const status = asString(detail.status) ?? 'unknown'
    const statusText = asString(detail.statusText) ?? ''
    const reportUrl = asString(detail.reportUrl)
    reports.push({ vendor, status, statusText, ...(reportUrl === undefined ? {} : { reportUrl }) })
  }
  return reports.sort((left, right) => left.vendor.localeCompare(right.vendor))
}

/** Upstream catalog client with the installer's bounds applied. */
export class SkillhubClient {
  readonly #baseUrl: string
  readonly #fetch: typeof fetch
  readonly #timeoutMs: number

  constructor(options: {
    /** Upstream origin, e.g. `https://api.skillhub.cn`. */
    baseUrl: string
    /** Fetch implementation; tests inject a fixture. */
    fetch?: typeof fetch
    /** Per-request timeout. */
    timeoutMs?: number
  }) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async #json(url: string): Promise<unknown> {
    let response: Response
    try {
      response = await this.#fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'dsh-sdkwork-skillhub/1.0' },
        signal: AbortSignal.timeout(this.#timeoutMs),
      })
    } catch (error) {
      throw new SkillhubError('unavailable', `SkillHub request failed: ${error instanceof Error ? error.message : String(error)}`, 502)
    }
    if (response.status === 404) throw new SkillhubError('not-found', `SkillHub does not list ${url}`, 404)
    if (!response.ok) throw new SkillhubError('unavailable', `SkillHub answered ${response.status} for ${url}`, 502)
    try {
      return await response.json()
    } catch {
      throw new SkillhubError('unavailable', `SkillHub returned malformed JSON for ${url}`, 502)
    }
  }

  #skillUrl(coord: SkillhubCoordinate, suffix: string, query: Record<string, string>): string {
    const params = new URLSearchParams({ namespace: coord.namespace, ...query })
    return `${this.#baseUrl}/api/v1/skills/${encodeURIComponent(coord.slug)}${suffix}?${params.toString()}`
  }

  /** Published versions, newest first, plus the latest label and display copy. */
  async versions(coord: SkillhubCoordinate): Promise<{ latest: string; name: string; summary: string; versions: SkillhubVersionInfo[] }> {
    const payload = asRecord(await this.#json(this.#skillUrl(coord, '/versions', {})))
    const detail = asRecord(await this.#json(this.#skillUrl(coord, '', {})))
    const skill = asRecord(detail?.skill)
    const latest = asString(detail?.latestVersion) ?? asString(asRecord(detail?.latestVersion)?.version)
      ?? asString(asRecord(detail?.skill)?.version) ?? ''
    const rows = Array.isArray(payload?.versions) ? payload.versions : []
    const versions: SkillhubVersionInfo[] = []
    for (const row of rows) {
      const entry = asRecord(row)
      const version = asString(entry?.version)
      if (entry === undefined || version === undefined) continue
      const createdAt = asNumber(entry.createdAt)
      versions.push({
        version,
        changelog: asString(entry.changelog) ?? '',
        createdAt: createdAt === undefined ? '' : new Date(createdAt).toISOString(),
        security: securityReports(entry.securityReports),
      })
    }
    const name = asString(skill?.displayName) ?? coord.slug
    const summary = asString(skill?.summary_zh) ?? asString(skill?.summary) ?? ''
    const resolvedLatest = latest === '' && versions.length > 0 ? versions[0]!.version : latest
    return { latest: resolvedLatest, name, summary, versions }
  }

  /** File manifest for one version (or the latest when omitted). */
  async files(coord: SkillhubCoordinate, version?: string): Promise<{ version: string; files: SkillhubFileInfo[] }> {
    const payload = asRecord(await this.#json(this.#skillUrl(coord, '/files', version === undefined ? {} : { version })))
    const resolvedVersion = asString(payload?.version) ?? version ?? ''
    const rows = Array.isArray(payload?.files) ? payload.files : []
    const files: SkillhubFileInfo[] = []
    let total = 0
    for (const row of rows) {
      const entry = asRecord(row)
      const path = asString(entry?.path)
      const sha256 = asString(entry?.sha256)
      const size = asNumber(entry?.size)
      if (entry === undefined || path === undefined || sha256 === undefined || size === undefined) {
        throw new SkillhubError('unavailable', 'SkillHub returned a file entry without path, size or checksum', 502)
      }
      if (!isSafeSkillFilePath(path)) {
        throw new SkillhubError('unavailable', `SkillHub returned an unsafe file path: ${path}`, 502)
      }
      total += size
      files.push({ path, size, sha256: sha256.toLowerCase() })
    }
    if (files.length > MAX_FILES) throw new SkillhubError('unavailable', `SkillHub returned ${files.length} files, above the install bound`, 502)
    if (total > MAX_VERSION_BYTES) throw new SkillhubError('unavailable', `SkillHub version exceeds the install size bound (${total} bytes)`, 502)
    if (files.length === 0) throw new SkillhubError('not-found', 'SkillHub returned an empty file list for this version', 404)
    return { version: resolvedVersion, files }
  }

  /** One file's bytes for an exact version. */
  async file(coord: SkillhubCoordinate, path: string, version: string): Promise<Buffer> {
    if (!isSafeSkillFilePath(path)) throw new SkillhubError('invalid-request', `unsafe skill file path: ${path}`, 400)
    const url = `${this.#baseUrl}/api/v1/skills/${encodeURIComponent(coord.slug)}/file?${new URLSearchParams({
      path,
      namespace: coord.namespace,
      version,
    }).toString()}`
    let response: Response
    try {
      response = await this.#fetch(url, {
        headers: { 'user-agent': 'dsh-sdkwork-skillhub/1.0' },
        signal: AbortSignal.timeout(this.#timeoutMs),
      })
    } catch (error) {
      throw new SkillhubError('unavailable', `SkillHub file download failed: ${error instanceof Error ? error.message : String(error)}`, 502)
    }
    if (response.status === 404) throw new SkillhubError('not-found', `SkillHub does not list ${path} at ${version}`, 404)
    if (!response.ok) throw new SkillhubError('unavailable', `SkillHub answered ${response.status} for ${path}`, 502)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > MAX_FILE_BYTES) throw new SkillhubError('unavailable', `skill file ${path} exceeds the per-file bound`, 502)
    return bytes
  }
}

/** Hex SHA-256 of one downloaded file. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
