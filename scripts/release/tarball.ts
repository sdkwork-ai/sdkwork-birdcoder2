/**
 * Reading packed npm tarballs and the order file that accompanies them.
 *
 * The release steps after pack treat a directory of tarballs as the unit of
 * work, so they read what a tarball declares rather than what the checkout
 * currently says.
 */

import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { capture } from './process.ts'

/** Name of the file recording the order in which a packed family uploads. */
export const PUBLISH_ORDER_FILE = 'publish-order.txt'

/** What a packed tarball calls itself. */
export interface PackedIdentity {
  /** Package name from the packed manifest. */
  readonly name: string
  /** Package version from the packed manifest. */
  readonly version: string
}

/**
 * Run `tar` against one tarball from inside the tarball's own directory.
 *
 * GNU tar reads an archive argument containing a colon as a `host:path` remote
 * spec, so the absolute Windows path a release step naturally holds
 * (`E:\out\pkg.tgz`) is taken as a request to reach host `E` and packing fails
 * with `Cannot connect to E: resolve failed`. Naming the archive relative to its
 * directory drops the drive letter from the argument, so GNU tar and bsdtar
 * read the same local file on every build host.
 * @param tarball - absolute tarball path.
 * @param flags - tar mode flags, without the archive argument.
 * @param members - members to select, appended after the archive argument.
 * @returns The captured standard output.
 */
function tarInPlace(tarball: string, flags: readonly string[], members: readonly string[] = []): string {
  try {
    return capture('tar', [...flags, basename(tarball), ...members], { cwd: dirname(tarball) })
  } catch (error) {
    throw new Error(`${tarball}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * List a tarball's members.
 * @param tarball - absolute tarball path.
 * @returns Every path inside the archive.
 */
export function tarballFiles(tarball: string): string[] {
  return tarInPlace(tarball, ['-tzf']).split(/\r?\n/u).filter(line => line !== '')
}

/**
 * Read a packed tarball's own manifest.
 * @param tarball - absolute tarball path.
 * @returns The manifest object the tarball declares.
 */
export function packedManifest(tarball: string): Record<string, unknown> {
  const manifest: unknown = JSON.parse(tarInPlace(tarball, ['-xOzf'], ['package/package.json']))
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${tarball} has no manifest`)
  }
  return manifest as Record<string, unknown>
}

/**
 * Read a packed tarball's identity.
 * @param tarball - absolute tarball path.
 * @returns The name and version the tarball declares.
 */
export function packedIdentity(tarball: string): PackedIdentity {
  const manifest = packedManifest(tarball)
  const { name, version } = manifest
  if (typeof name !== 'string' || typeof version !== 'string') throw new Error(`${tarball} manifest lacks name/version`)
  return { name, version }
}

/**
 * Read a packed directory's upload order.
 * @param directory - absolute path of a pack output directory.
 * @returns Tarball filenames in upload order.
 */
export function readPublishOrder(directory: string): string[] {
  return readFileSync(join(directory, PUBLISH_ORDER_FILE), 'utf8').split('\n').filter(line => line !== '')
}
