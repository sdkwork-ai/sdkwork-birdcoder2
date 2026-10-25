/**
 * Selecting the packed tarballs the host platform can install.
 *
 * A release family ships members that target one platform alone: their manifest
 * names the target (`"os": ["darwin"]`) so npm refuses them wherever they cannot
 * run. npm treats such a package reached through an optional dependency as
 * skipped, but a direct request makes it an error — handing every family
 * tarball to one `npm install` aborts the whole installation with EBADPLATFORM,
 * taking along the packages that would have installed beside it.
 *
 * The Linux container image builds for exactly one platform and can never host
 * those members, so the image install asks for the subset this platform accepts.
 * The tarballs themselves stay packed and published for the platforms that can
 * use them; this module decides what one consumer requests, not what a release
 * contains.
 *
 * Compatibility is read from the packed tarball rather than the checkout, the
 * way every other release consumer step reads it.
 */

import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isEntry } from './process.ts'
import { packedManifest } from './tarball.ts'

/** One packed tarball and whether this host accepts it. */
export interface PackCandidate {
  /** Absolute tarball path. */
  readonly path: string
  /** Package name declared by the tarball. */
  readonly name: string
  /** Package version declared by the tarball. */
  readonly version: string
  /** Whether this host's platform and architecture satisfy the manifest constraints. */
  readonly compatible: boolean
}

/**
 * Decide whether one platform constraint accepts the current value.
 *
 * The npm form is one constraint array per field, where every entry either adds
 * a value or excludes one with a leading `!`. A list of only exclusions accepts
 * everything not named; a list carrying at least one inclusion accepts only the
 * names included. `any` is accepted literally by npm, and only on its own.
 * @param value - the manifest field (`os` or `cpu`) to interpret.
 * @param current - this host's value for the field.
 * @returns True when the constraint accepts `current`.
 */
export function acceptsPlatform(value: unknown, current: string): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || !value.every((tag): tag is string => typeof tag === 'string')) {
    throw new Error('packed platform constraints must be arrays of strings')
  }
  let accepted = value.every(tag => tag.startsWith('!'))
  for (const tag of value) {
    if (tag === `!${current}`) return false
    if (tag === current || (tag === 'any' && value.length === 1)) accepted = true
  }
  return accepted
}

/**
 * Read every packed tarball of the given directories and judge its platform.
 *
 * The directories are read by their contents rather than a pack order file: a
 * directory here can hold tarballs packed only to satisfy a cross-sequence
 * dependency, which no release order describes.
 * @param directories - absolute directories holding packed tarballs.
 * @param platform - platform to accept, defaulting to this host.
 * @param architecture - architecture to accept, defaulting to this host.
 * @returns One candidate per tarball, in directory and then filename order.
 */
export function selectPacks(
  directories: readonly string[], platform = process.platform, architecture = process.arch,
): PackCandidate[] {
  const candidates: PackCandidate[] = []
  for (const directory of directories) {
    const tarballs = readdirSync(directory).filter(name => name.endsWith('.tgz')).sort()
    if (tarballs.length === 0) throw new Error(`${directory} holds no packed tarball`)
    for (const filename of tarballs) {
      const tarball = join(directory, filename)
      const manifest = packedManifest(tarball)
      const { name, version, os, cpu } = manifest
      if (typeof name !== 'string' || typeof version !== 'string') throw new Error(`${tarball} manifest lacks name/version`)
      const compatible = acceptsPlatform(os, platform) && acceptsPlatform(cpu, architecture)
      candidates.push({ path: tarball, name, version, compatible })
    }
  }
  return candidates
}

/**
 * Absolute paths of the packed tarballs this host may install directly.
 * @param directories - absolute directories holding packed tarballs.
 * @param platform - platform to accept, defaulting to this host.
 * @param architecture - architecture to accept, defaulting to this host.
 * @returns Tarball paths npm accepts as direct dependencies.
 */
export function installablePacks(
  directories: readonly string[], platform?: string, architecture?: string,
): string[] {
  return selectPacks(directories, platform, architecture).filter(candidate => candidate.compatible)
    .map(candidate => candidate.path)
}

/** Print the packed tarballs this platform accepts, one absolute path per line. */
function main(): void {
  const directories = process.argv.slice(2).map(directory => resolve(directory))
  if (directories.length === 0) throw new Error('usage: platform-packs.ts <packed directory> [<packed directory> ...]')
  console.log(installablePacks(directories).join('\n'))
}

if (isEntry(import.meta.url)) main()
