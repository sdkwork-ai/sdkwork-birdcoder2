/**
 * Reading an install spec before pnpm sees it: which of pnpm's spec forms it
 * takes, for a registry name whether it is one the registry can accept, and
 * for a Git spec pinned to a commit the repository directory it installs from.
 * @module @deepseek-ai/dsh-plugin-manager/install-spec
 */

import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import {
  InvalidPluginSourceError, isArchiveUrl, normalizeSourceUrl, readSourceSpecParameters,
} from './source.ts'

/**
 * One spec read into its form and the parts an inspection needs. A git spec
 * and a tarball URL carry the `host` pnpm fetches them from, which no registry
 * stands in for; only their dependencies come from the registry. An archive or
 * a Drive download is fetched by the plugin manager itself before pnpm runs, so
 * `url` is where the bytes come from and `directory`/`sha256` say which package
 * inside them is the plugin.
 */
export type ParsedInstallSpec =
  | { readonly kind: 'registry'; readonly spec: string; readonly name: string; readonly range?: string }
  | { readonly kind: 'path'; readonly spec: string; readonly path: string }
  | { readonly kind: 'tarball'; readonly spec: string; readonly path?: string; readonly host?: string }
  | { readonly kind: 'git'; readonly spec: string; readonly host: string }
  | {
    readonly kind: 'archive'
    readonly spec: string
    readonly url: string
    readonly host: string
    readonly directory?: string
    readonly sha256?: string
  }
  | {
    readonly kind: 'drive'
    readonly spec: string
    readonly url: string
    readonly host: string
    readonly directory?: string
  }

/**
 * The specs the plugin manager fetches and unpacks itself: an archive, and a
 * Drive directory whose download package resolved to one.
 */
export type ParsedArchiveInstallSpec = Extract<ParsedInstallSpec, { kind: 'archive' | 'drive' }>

/** The forms pnpm resolves through a git host: a host shorthand, a git URL, or a hosted repository URL. */
const GIT_SHORTHAND = /^(?:github|gitlab|bitbucket|gist):/i
const GIT_URL = /^git(?:\+[a-z]+)?:\/\/|^git@[^:]+:/i
const HOSTED_REPOSITORY_URL = /^https?:\/\/[^/]+\/[^/]+\/[^/#]+(?:\.git)?(?:#.*)?$/i
/** The hosts pnpm's shorthands stand for. */
const GIT_SHORTHAND_HOSTS: Readonly<Record<string, string>> = {
  github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org', gist: 'gist.github.com',
}
/** A tarball, on disk or over HTTP. */
const TARBALL_SPEC = /\.(?:tgz|tar\.gz)(?:#.*)?$/i
/** An npm package name: lowercase URL-safe segments, an optional scope, no leading dot or underscore. */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const PACKAGE_NAME_MAX_LENGTH = 214

/** A spec neither pnpm nor the registry would take; `reason` is what the person reads. */
export class InvalidInstallSpecError extends Error {
  /**
   * @param spec - the spec as typed, trimmed.
   * @param reason - why it is refused, as one sentence.
   */
  constructor(readonly spec: string, readonly reason: string) {
    super(`plugin-manager: ${reason}: ${spec}`)
    this.name = 'InvalidInstallSpecError'
  }
}

function invalid(spec: string, reason: string): InvalidInstallSpecError {
  return new InvalidInstallSpecError(spec, reason)
}

/**
 * Whether an http(s) address names a zip archive by its path, ignoring a query
 * a signed download link carries.
 * @param value - one http(s) address.
 * @returns whether the path ends in `.zip`.
 */
function zipUrl(value: string): boolean {
  try {
    return /\.zip$/i.test(new URL(value).pathname)
  } catch {
    return false
  }
}

/** The host a git spec is cloned from: the shorthand's host, the scp-like user@host, or the URL's host with its port. */
function gitHost(spec: string): string {
  const shorthand = /^([a-z]+):/i.exec(spec)?.[1]?.toLowerCase()
  if (shorthand !== undefined && Object.hasOwn(GIT_SHORTHAND_HOSTS, shorthand)) return GIT_SHORTHAND_HOSTS[shorthand] as string
  const scp = /^git@([^:]+):/i.exec(spec)?.[1]
  if (scp !== undefined) return scp.toLowerCase()
  return new URL(spec.replace(/^git\+/i, '')).host
}

/**
 * Read a spec into its form. A path must be absolute: the Host's working
 * directory means nothing to the person typing into a browser, and a
 * relative path resolved against the profile would point inside it.
 * @param raw - the spec as typed.
 * @returns the parsed spec.
 * @throws {InvalidInstallSpecError} for an empty spec, a relative path, a name the
 * registry would refuse, or a URL that is neither a git host nor a tarball.
 */
export function parseInstallSpec(raw: string): ParsedInstallSpec {
  const spec = raw.trim()
  if (spec === '') throw invalid(spec, 'the package spec must not be empty')
  const path = spec.replace(/^(?:file|link):/, '')
  if (path !== spec || isAbsolute(path)) {
    if (!isAbsolute(path)) throw invalid(spec, 'a local path must be absolute')
    return TARBALL_SPEC.test(path) ? { kind: 'tarball', spec, path } : { kind: 'path', spec, path }
  }
  if (/^\.{1,2}(?:[\\/]|$)/.test(spec)) throw invalid(spec, 'a local path must be absolute')
  const source = sourceSpec(spec)
  if (source !== undefined) return source
  const git = GIT_SHORTHAND.test(spec) || GIT_URL.test(spec) || HOSTED_REPOSITORY_URL.test(spec)
  if (git && !TARBALL_SPEC.test(spec)) return { kind: 'git', spec, host: gitHost(spec) }
  if (/^https?:\/\//i.test(spec)) {
    if (TARBALL_SPEC.test(spec)) return { kind: 'tarball', spec, host: new URL(spec).host }
    throw invalid(spec, 'a URL must point at a git repository, a tarball, or a plugin archive')
  }
  const at = spec.indexOf('@', 1)
  const name = at === -1 ? spec : spec.slice(0, at)
  const range = at === -1 ? undefined : spec.slice(at + 1)
  if (name.length > PACKAGE_NAME_MAX_LENGTH || !PACKAGE_NAME.test(name)) {
    throw invalid(spec, 'not a package name the registry accepts')
  }
  if (range === '') throw invalid(spec, 'a version after @ must not be empty')
  return range === undefined ? { kind: 'registry', spec, name } : { kind: 'registry', spec, name, range }
}

/**
 * Read the source forms pnpm cannot fetch itself: an archive the plugin manager
 * downloads and extracts, and a Drive directory its download package resolves
 * to one. `archive+` and `drive+` mark a URL whose path does not end in an
 * archive extension; a bare `.zip` URL is an archive too.
 * @param spec - one trimmed install spec.
 * @returns the parsed archive or Drive spec, or undefined when the spec is
 * another form.
 * @throws {InvalidInstallSpecError} for a marked URL the source standard refuses.
 */
function sourceSpec(spec: string): ParsedInstallSpec | undefined {
  const hash = spec.indexOf('#')
  const base = hash === -1 ? spec : spec.slice(0, hash)
  const fragment = hash === -1 ? '' : spec.slice(hash + 1)
  const drive = /^drive\+/i.test(base)
  const marked = drive || /^archive\+/i.test(base)
  const bareZip = /^https?:\/\//i.test(base) && zipUrl(base)
  if (!marked && !bareZip) return undefined
  const address = base.replace(/^(?:drive|archive)\+/i, '')
  const what = drive ? 'the Drive download URL' : 'the archive URL'
  let url: string
  let parameters
  try {
    url = normalizeSourceUrl(address, what, true)
    parameters = readSourceSpecParameters(fragment)
  } catch (error) {
    if (!(error instanceof InvalidPluginSourceError)) throw error
    throw invalid(spec, error.reason)
  }
  if (drive) {
    if (parameters.sha256 !== undefined) throw invalid(spec, 'a Drive source carries no archive hash')
    return {
      kind: 'drive', spec, url, host: new URL(url).host,
      ...parameters.directory === undefined ? {} : { directory: parameters.directory },
    }
  }
  if (!isArchiveUrl(url)) throw invalid(spec, 'an archive URL must end in .zip, .tar.gz, or .tgz')
  return {
    kind: 'archive', spec, url, host: new URL(url).host,
    ...parameters.directory === undefined ? {} : { directory: parameters.directory },
    ...parameters.sha256 === undefined ? {} : { sha256: parameters.sha256 },
  }
}

/** A full SHA-1 commit name, as a fragment parameter of a Git spec. */
const FULL_COMMIT = /^[0-9a-f]{40}$/i

/**
 * Where a Git spec pinned to a full commit installs from: the lower-case host and the repository path, without
 * transport, user, or `.git`, then `#` and the `path:` directory. The origin ignores the form pnpm saves, so the SSH
 * form saved for an HTTPS repository it cannot read, and the host shortcut saved for a known host, have the HTTPS
 * form's origin. Equal origins name one repository on a host that serves it at the same path over every transport,
 * as Git forges do; on a plain SSH server, an scp-like path is relative to the login's home directory.
 * @param spec - an install spec, such as a saved dependency or an update's target.
 * @returns the origin, or undefined for a spec that is not Git, or whose fragment is not one full commit and at most
 * one `path:` directory.
 */
export function pinnedGitOrigin(spec: string): string | undefined {
  let parsed: ParsedInstallSpec
  try { parsed = parseInstallSpec(spec) } catch (error) {
    /* v8 ignore next -- parseInstallSpec throws nothing but its own refusal */
    if (!(error instanceof InvalidInstallSpecError)) throw error
    return undefined
  }
  const hash = parsed.spec.indexOf('#')
  if (parsed.kind !== 'git' || hash === -1) return undefined
  const parameters = parsed.spec.slice(hash + 1).split('&')
  const paths = parameters.filter(part => part.startsWith('path:'))
  const others = parameters.filter(part => !part.startsWith('path:'))
  // pnpm reads the last of repeated parameters, so a spec that repeats one names no single origin.
  if (paths.length > 1 || others.length !== 1 || !FULL_COMMIT.test(others.join(''))) return undefined
  const path = (paths[0]?.slice('path:'.length) ?? '').replace(/^\/+|\/+$/g, '')
  const location = parsed.spec.slice(0, hash)
    .replace(/^(github|gitlab|bitbucket|gist):/i, (_prefix, shorthand: string) => `${GIT_SHORTHAND_HOSTS[shorthand.toLowerCase()] as string}/`)
    .replace(/^git\+/i, '').replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^[^@/]+@/, '').replace(/^([^/:]+):(?!\d)/, '$1/')
    .replace(/\/+$/, '').replace(/\.git$/i, '').replace(/^[^/]+/, host => host.toLowerCase())
  return `${location}#${path}`
}

/** A recorded dependency value pnpm resolves outside a registry: a protocol other than a registry alias, or an scp-like git address. */
const NON_REGISTRY_VALUE = /^(?!(?:npm|jsr|workspace|catalog):)[a-z][a-z0-9+.-]*:|^[^@/:\s]+@[^:/\s]+:/i
/** The user information of an http(s) URL, up to the last `@` before the path, which holds a password or access token when present. */
export const HTTP_USER_INFO = /^((?:git\+)?https?:\/\/)[^/]*@/i

/**
 * The spec `pnpm add` accepts for a dependency the profile manifest records. A git address, URL, or other
 * non-registry protocol is the recorded value without the user information of an http(s) URL, whose query string
 * is kept; a `file:` or `link:` path, which pnpm records relative to the profile or with `~` for the home
 * directory, becomes absolute. A registry range, tag, or alias follows the dependency name after `@`, as does a
 * non-registry value installed under a name other than the package's own.
 * @param name - the dependency name.
 * @param recorded - the value the profile manifest records for it.
 * @param profileDir - the profile directory a relative local path is resolved against.
 * @param packageName - the name the installed package's manifest declares, when it could be read.
 * @returns the installable spec.
 */
export function dependencySpec(name: string, recorded: string, profileDir: string, packageName = name): string {
  const local = /^(file|link):(.*)$/s.exec(recorded)
  let spec: string
  if (local !== null) {
    const path = (local[2] as string).replace(/^~(?=$|[\\/])/, () => homedir())
    spec = `${local[1]}:${resolve(profileDir, path)}`
  } else if (NON_REGISTRY_VALUE.test(recorded)) {
    spec = recorded.replace(HTTP_USER_INFO, '$1')
  } else {
    return `${name}@${recorded}`
  }
  return packageName === name ? spec : `${name}@${spec}`
}
