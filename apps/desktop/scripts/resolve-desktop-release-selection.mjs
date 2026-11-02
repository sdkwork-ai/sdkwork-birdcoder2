/** Resolve one Desktop release run's version and the targets it packages. */

import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DESKTOP_TARGET_NAMES } from './desktop-build-paths.mjs'

const ALL_TARGETS = DESKTOP_TARGET_NAMES.join(',')

/**
 * Resolve the version one release run packages and the targets it builds.
 * @param request - `version` is the version the caller requires (blank follows the manifest); `targets` is `all` or a comma-separated target list.
 * @param manifestVersion - Version the root manifest declares.
 * @returns The packaged version, the selected targets in release order, and whether the selection omits any target.
 * @throws If the version differs from the manifest, or the selection names an unknown, repeated, or empty target.
 */
export function resolveDesktopReleaseSelection(request, manifestVersion) {
  if (typeof manifestVersion !== 'string' || manifestVersion.trim() === '') {
    throw new Error('desktop release: package.json declares no version')
  }
  const requestedVersion = request.version.trim()
  const version = requestedVersion === '' ? manifestVersion : requestedVersion
  if (version !== manifestVersion) {
    throw new Error(`desktop release: release version ${version} does not match package.json ${manifestVersion}`)
  }
  const requestedTargets = request.targets.trim()
  if (requestedTargets === '' || requestedTargets === 'all') {
    return { version, targets: [...DESKTOP_TARGET_NAMES], partial: false }
  }
  const selected = []
  for (const entry of requestedTargets.split(',')) {
    const target = entry.trim()
    if (target === '') {
      throw new Error(`desktop release: the target selection ${JSON.stringify(requestedTargets)} has an empty entry`)
    }
    if (!DESKTOP_TARGET_NAMES.includes(target)) {
      throw new Error(`desktop release: unknown target ${JSON.stringify(target)}; expected all or any of ${ALL_TARGETS}`)
    }
    if (selected.includes(target)) {
      throw new Error(`desktop release: target ${target} is selected more than once`)
    }
    selected.push(target)
  }
  // Release order, not argument order: the lanes and the assembled asset set keep
  // one order whatever order a maintainer typed.
  const targets = DESKTOP_TARGET_NAMES.filter(name => selected.includes(name))
  return { version, targets, partial: targets.length !== DESKTOP_TARGET_NAMES.length }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', '..', '..', 'package.json'), 'utf8'))
  const selection = resolveDesktopReleaseSelection({
    version: process.env.EXPECTED_VERSION ?? '',
    targets: process.env.REQUESTED_TARGETS ?? 'all',
  }, manifest.version)
  if (!process.env.GITHUB_OUTPUT) throw new Error('Run this adapter from GitHub Actions')
  console.log(`desktop release: packaging ${selection.version} for ${selection.targets.join(', ')}`)
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `version=${selection.version}`,
    `targets=${selection.targets.join(',')}`,
    `partial=${selection.partial ? 'true' : 'false'}`,
    '',
  ].join('\n'))
}
