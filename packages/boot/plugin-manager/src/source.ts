/**
 * The plugin source standard: where one plugin package comes from, and the
 * install spec that gives a plugin manager the same pin.
 *
 * A marketplace entry, a "create plugin" form, and the install dialog all
 * describe one plugin the same way, so a plugin's provenance can be shown,
 * validated and installed without any of them inventing their own vocabulary:
 *
 * - `git` -- a Git repository, optionally one directory inside it. A repository
 *   may publish several plugins, one per directory, so the directory is part of
 *   the source rather than a note beside it.
 * - `archive` -- a zip or tar archive fetched over http(s), optionally one
 *   directory inside it and an expected SHA-256.
 * - `drive` -- a sdkwork-drive directory, resolved by whoever holds the Drive
 *   credential to the https archive the Drive download-package API hands out.
 *   The resolved archive is what gets downloaded; the Drive node identity is
 *   kept for display and for a later native Drive read.
 *
 * Every form converts to one install spec the plugin manager already accepts,
 * so installation keeps one pipeline:
 *
 * - git: `git+<url>#<ref>&path:/<directory>` (`ref` defaults to `HEAD` when a
 *   directory is named, because pnpm only reads `path:` after a committish).
 * - archive: `<url>#path:/<directory>&sha256=<hex>` (each parameter optional).
 * - drive: `drive+<url>#path:/<directory>` -- the host fetches it exactly like
 *   an archive, and the scheme keeps the provenance visible in saved specs.
 *
 * This module is pure: no Node.js imports, no I/O. The Host parses the same
 * strings with {@link parsePluginSourceSpec}, and a browser can import it to
 * validate a form before anything is installed.
 * @module @deepseek-ai/dsh-plugin-manager/source
 */

/** The three forms a plugin source takes. */
export type PluginSourceKind = 'git' | 'archive' | 'drive'

/** Fields every form shares: the package's directory inside the source. */
export interface PluginSourceBase {
  /** The directory holding the plugin package, relative to the source root; absent means the root. */
  readonly directory?: string
}

/** A plugin published from a Git repository, alone or in one of its directories. */
export interface GitPluginSource extends PluginSourceBase {
  readonly kind: 'git'
  /** The https clone URL, without credentials. */
  readonly url: string
  /** The branch, tag, or commit to install; absent means the remote default. */
  readonly ref?: string
}

/** A plugin published as a zip or tar archive over http(s). */
export interface ArchivePluginSource extends PluginSourceBase {
  readonly kind: 'archive'
  /** The https URL of the archive. */
  readonly url: string
  /** The lowercase hex SHA-256 the archive must hash to; absent means unchecked. */
  readonly sha256?: string
}

/** A plugin published from a sdkwork-drive directory. */
export interface DrivePluginSource extends PluginSourceBase {
  readonly kind: 'drive'
  /** The https archive URL the Drive download-package API resolved for the directory. */
  readonly url: string
  /** The Drive node the directory lives in, when the caller knows it. */
  readonly nodeId?: string
}

/** One plugin's source. */
export type PluginSource = GitPluginSource | ArchivePluginSource | DrivePluginSource

/** A source a caller supplied could not be read; `reason` is what a person reads. */
export class InvalidPluginSourceError extends Error {
  /**
   * @param reason - why the source is refused, as one sentence.
   */
  constructor(readonly reason: string) {
    super(`plugin-source: ${reason}`)
    this.name = 'InvalidPluginSourceError'
  }
}

/** A directory segment inside a source. */
const DIRECTORY_SEGMENT = /^[A-Za-z0-9._@+-]+$/
const DIRECTORY_MAX_LENGTH = 512
/** A branch, tag, or commit as pnpm reads one: no whitespace and no fragment separator. */
const GIT_REF = /^[A-Za-z0-9][A-Za-z0-9._/@+-]*$/
const SHA256 = /^[0-9a-f]{64}$/i
const ARCHIVE_EXTENSION = /\.(?:zip|tar\.gz|tgz)$/i
/** A forge's archive endpoint, whose path carries the format as a segment. */
const FORGE_ARCHIVE_SEGMENT = /\/(?:tar\.gz|zipball|archive)\//i

function refuse(reason: string): never {
  throw new InvalidPluginSourceError(reason)
}

/**
 * Normalize a directory inside a source, rejecting the ones a fetch must never
 * follow.
 * @param value - the directory as typed, or undefined.
 * @returns the directory without surrounding slashes, or undefined for the root.
 * @throws {InvalidPluginSourceError} when a segment is empty, `.`, `..`, or has
 *   a character an archive or repository path may not carry.
 */
export function normalizeSourceDirectory(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
  if (trimmed === '') return undefined
  if (trimmed.length > DIRECTORY_MAX_LENGTH) refuse('the directory inside the source is too long')
  for (const segment of trimmed.split('/')) {
    if (!DIRECTORY_SEGMENT.test(segment) || segment === '.' || segment === '..') {
      refuse(`the directory inside the source has an unusable segment: ${segment === '' ? '(empty)' : segment}`)
    }
  }
  return trimmed
}

/**
 * Normalize one http(s) address a source names.
 * @param value - the address as typed.
 * @param what - what the address is, for the refusal sentence.
 * @param allowQuery - whether a query string is part of the address (a signed
 *   archive or Drive download link) instead of a mistake.
 * @returns the canonical address.
 * @throws {InvalidPluginSourceError} for another protocol, credentials, a
 *   fragment, or a query the form does not allow.
 */
export function normalizeSourceUrl(value: string, what: string, allowQuery = false): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return refuse(`${what} must be an absolute http(s) URL`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') refuse(`${what} must be an http(s) URL`)
  if (parsed.username !== '' || parsed.password !== '') refuse(`${what} must not carry credentials`)
  if (!allowQuery && parsed.search !== '') refuse(`${what} must be the bare URL, without a query or fragment`)
  if (parsed.hash !== '') refuse(`${what} must not carry a fragment of its own`)
  return parsed.href
}

/**
 * The archive an http(s) URL names: a path ending in an archive extension, or
 * a forge's archive endpoint whose path carries the format as a segment
 * (`/tar.gz/<ref>`, `/zipball/<ref>`, `/archive/<ref>`).
 * @param value - one http(s) URL.
 * @returns whether the URL names an archive this plugin manager can extract.
 */
export function isArchiveUrl(value: string): boolean {
  let pathname: string
  try {
    pathname = new URL(value).pathname
  } catch {
    return false
  }
  return ARCHIVE_EXTENSION.test(pathname) || FORGE_ARCHIVE_SEGMENT.test(pathname)
}

/**
 * Read a Git URL or an `owner/repository` shorthand.
 * @param value - the URL or shorthand as typed.
 * @returns the https clone URL.
 * @throws {InvalidPluginSourceError} for anything else.
 */
export function normalizeGitUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return refuse('the Git repository must not be empty')
  const shorthand = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)$/.exec(trimmed)
  const expanded = shorthand === null ? trimmed : `https://github.com/${shorthand[1]}/${shorthand[2]}`
  const url = normalizeSourceUrl(expanded, 'the Git repository URL')
  const parsed = new URL(url)
  if (parsed.pathname.replace(/^\/+|\/+$/g, '').split('/').length < 2) {
    refuse('the Git repository URL must name a repository, such as https://github.com/owner/repo')
  }
  return url
}

/** The minimum a source needs before it is normalized: its form and its address. */
export interface PluginSourceInput {
  readonly kind: PluginSourceKind
  /** The Git URL, archive URL, or Drive download URL. */
  readonly url: string
  /** A Git branch, tag, or commit; only for `git`. */
  readonly ref?: string
  /** The plugin package's directory inside the source. */
  readonly directory?: string
  /** The expected archive hash; only for `archive`. */
  readonly sha256?: string
  /** The Drive node id; only for `drive`. */
  readonly nodeId?: string
}

/**
 * Read an untrusted source descriptor (a marketplace record, a form, a saved
 * document) into the standard.
 * @param value - the descriptor as received.
 * @returns the normalized source.
 * @throws {InvalidPluginSourceError} for an unknown form or a field the form does not allow.
 */
export function parsePluginSource(value: unknown): PluginSource {
  if (typeof value !== 'object' || value === null) return refuse('the plugin source must be an object')
  const record = value as Record<string, unknown>
  const kind = record.kind
  if (kind !== 'git' && kind !== 'archive' && kind !== 'drive') return refuse('the plugin source kind must be git, archive, or drive')
  const url = typeof record.url === 'string' ? record.url : refuse('the plugin source must carry a URL')
  const directory = normalizeSourceDirectory(typeof record.directory === 'string' ? record.directory : undefined)
  const base = directory === undefined ? {} : { directory }
  if (kind === 'git') {
    if (typeof record.sha256 === 'string' || typeof record.nodeId === 'string') return refuse('a git source carries a ref, not a hash or a Drive node')
    const ref = typeof record.ref === 'string' ? record.ref.trim() : ''
    if (ref !== '' && !GIT_REF.test(ref)) return refuse('the Git ref has an unusable character')
    return { kind, url: normalizeGitUrl(url), ...(ref === '' ? {} : { ref }), ...base }
  }
  if (kind === 'archive') {
    if (typeof record.ref === 'string' || typeof record.nodeId === 'string') return refuse('an archive source carries a hash, not a ref or a Drive node')
    const sha256 = typeof record.sha256 === 'string' ? record.sha256.trim().toLowerCase() : ''
    if (sha256 !== '' && !SHA256.test(sha256)) return refuse('the archive hash must be 64 hex characters')
    const normalized = normalizeSourceUrl(url, 'the archive URL', true)
    if (!isArchiveUrl(normalized)) return refuse('the archive URL must end in .zip, .tar.gz, or .tgz')
    return { kind, url: normalized, ...(sha256 === '' ? {} : { sha256 }), ...base }
  }
  if (typeof record.ref === 'string' || typeof record.sha256 === 'string') return refuse('a drive source carries a Drive node, not a ref or a hash')
  const nodeId = typeof record.nodeId === 'string' ? record.nodeId.trim() : ''
  if (nodeId !== '' && !/^[A-Za-z0-9_-]+$/.test(nodeId)) return refuse('the Drive node id has an unusable character')
  return { kind, url: normalizeSourceUrl(url, 'the Drive download URL', true), ...(nodeId === '' ? {} : { nodeId }), ...base }
}

/** The fragment parameters a source spec carries, before they are read by form. */
export interface SourceSpecParameters {
  /** `path:/...` -- the directory inside the source. */
  readonly directory?: string
  /** `sha256=<hex>` -- an archive's expected hash. */
  readonly sha256?: string
}

/**
 * Read the `&`-separated parameters of an install spec's fragment.
 * @param fragment - everything after `#`, without the `#`.
 * @returns the source parameters; parameters this standard does not define are ignored.
 * @throws {InvalidPluginSourceError} for a repeated `path:` or `sha256=`, or an unusable value.
 */
export function readSourceSpecParameters(fragment: string): SourceSpecParameters {
  let directory: string | undefined
  let sha256: string | undefined
  if (fragment !== '') {
    for (const part of fragment.split('&')) {
      if (part.startsWith('path:')) {
        if (directory !== undefined) refuse('the source spec names more than one path: directory')
        directory = normalizeSourceDirectory(part.slice('path:'.length))
      } else if (part.startsWith('sha256=')) {
        if (sha256 !== undefined) refuse('the source spec names more than one archive hash')
        const value = part.slice('sha256='.length).trim().toLowerCase()
        if (!SHA256.test(value)) refuse('the archive hash must be 64 hex characters')
        sha256 = value
      }
    }
  }
  return { ...(directory === undefined ? {} : { directory }), ...(sha256 === undefined ? {} : { sha256 }) }
}

/**
 * Render one source as the install spec every surface passes to the plugin
 * manager.
 * @param source - the normalized source.
 * @returns the spec string.
 */
export function pluginSourceSpec(source: PluginSource): string {
  const parameters: string[] = []
  if (source.kind === 'git') {
    const ref = source.ref?.trim() ?? ''
    if (ref !== '') parameters.push(ref)
    else if (source.directory !== undefined) parameters.push('HEAD')
    if (source.directory !== undefined) parameters.push(`path:/${source.directory}`)
    const base = `git+${withGitSuffix(source.url)}`
    return parameters.length === 0 ? base : `${base}#${parameters.join('&')}`
  }
  if (source.directory !== undefined) parameters.push(`path:/${source.directory}`)
  if (source.kind === 'archive' && source.sha256 !== undefined) parameters.push(`sha256=${source.sha256}`)
  const base = source.kind === 'drive'
    ? `drive+${source.url}`
    : zipUrl(source.url) ? source.url : `archive+${source.url}`
  return parameters.length === 0 ? base : `${base}#${parameters.join('&')}`
}

function withGitSuffix(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    /* v8 ignore next -- normalizeGitUrl already refused anything a URL cannot read */
    return url
  }
  if (parsed.pathname.endsWith('.git')) return parsed.href
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}.git`
  return parsed.href
}

/**
 * Read a source back out of an install spec the plugin manager saved or was
 * given: `git+...`, `drive+...`, or an http(s) archive URL.
 * @param spec - the install spec.
 * @returns the source, or undefined for a form that is not one of the three
 *   (a registry name, a local path, an npm tarball).
 * @throws {InvalidPluginSourceError} when the spec has the form but unusable parts.
 */
export function parsePluginSourceSpec(spec: string): PluginSource | undefined {
  const trimmed = spec.trim()
  const hash = trimmed.indexOf('#')
  const base = hash === -1 ? trimmed : trimmed.slice(0, hash)
  const fragment = hash === -1 ? '' : trimmed.slice(hash + 1)
  const parameters = readSourceSpecParameters(fragment)
  if (/^drive\+https?:\/\//i.test(base)) {
    return parsePluginSource({ kind: 'drive', url: base.replace(/^drive\+/i, ''), ...parameters })
  }
  if (/^archive\+https?:\/\//i.test(base)) {
    return parsePluginSource({ kind: 'archive', url: base.replace(/^archive\+/i, ''), ...parameters })
  }
  if (/^git\+/i.test(base) || /^git@|^github:|^gitlab:|^bitbucket:|^gist:/i.test(base)) {
    if (parameters.sha256 !== undefined) return refuse('a git source carries a ref, not a hash')
    const ref = fragment.split('&').find(part => part !== '' && !part.startsWith('path:'))
    return parsePluginSource({
      kind: 'git',
      url: base.replace(/^git\+/i, ''),
      ...(ref === undefined || ref === 'HEAD' ? {} : { ref }),
      ...parameters.directory === undefined ? {} : { directory: parameters.directory },
    })
  }
  if (isArchiveUrl(base) && zipUrl(base)) {
    return parsePluginSource({ kind: 'archive', url: base, ...parameters })
  }
  return undefined
}

/** Whether an http(s) address names a zip by its path, which needs no `archive+` marker. */
function zipUrl(value: string): boolean {
  try {
    return /\.zip$/i.test(new URL(value).pathname)
  } catch {
    return false
  }
}
