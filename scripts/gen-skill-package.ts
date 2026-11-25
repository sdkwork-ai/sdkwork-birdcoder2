/**
 * Lock and package the `birdcoder-app-deploy` skill.
 *
 * The skill must work on a machine without a `sdkwork-specs` checkout, so its
 * distilled contracts travel with it. This script records:
 *
 * - `references/standards.lock.json`: the reviewed revision of the six cited
 *   specs (hashes of the live checkout texts) and the hashes of the bundled
 *   contracts;
 * - `skill.manifest.json`: every packaged file with its SHA-256 and the files the
 *   skill requires, so an installation can prove completeness.
 *
 * `--check` recomputes both and fails on drift. A live checkout is optional:
 * without one, the spec hashes are validated only against the lock when present.
 *
 * @module scripts/gen-skill-package
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKILL = join(ROOT, 'packages', 'skill', 'sdkwork-builtin-skills', 'assets', 'skills', 'birdcoder-app-deploy')
const LOCK = join(SKILL, 'references', 'standards.lock.json')
const MANIFEST = join(SKILL, 'skill.manifest.json')

/** Specs the skill cites: six bundled contracts plus the lifecycle authorities. */
const SPECS = [
  'APP_MANIFEST_SPEC.md',
  'APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md',
  'APPLICATION_DEPLOY_LAYOUT_SPEC.md',
  'PACKAGING_SPEC.md',
  'SDKWORK_DEPLOY_SPEC.md',
  'ENVIRONMENT_SPEC.md',
  'APPLICATION_FACTORY_DEPLOYMENT_SPEC.md',
  'DEPLOYMENT_SPEC.md',
  'RELEASE_SPEC.md',
]

/** One packaged file and the digest an installer verifies. */
interface SkillPackageFile {
  path: string
  sha256: string
}

/** The package manifest an installer proves completeness with. */
interface SkillPackageManifest {
  name: string
  version: string
  scope: 'product'
  standardsLock: string
  requires: string[]
  files: SkillPackageFile[]
}

/** The reviewed specs revision the skill carries. */
interface StandardsLock {
  sdkworkSpecs: { source: 'checkout' | 'absent'; revision?: string }
  reviewedAt: string
  specs: Record<string, string>
  bundled: Record<string, string>
}

/** True when a parsed JSON value is the object map both files carry. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one JSON object file this script wrote itself.
 * @param path - Absolute file path.
 * @returns The parsed object.
 * @throws Error when the file is absent, malformed, or not an object.
 */
function readJsonObject(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isJsonObject(parsed)) throw new Error(`${relative(ROOT, path)} is not a JSON object`)
  return parsed
}

/** The standards source one lock file records, when it records one. */
function lockSource(lock: Record<string, unknown>): unknown {
  const specs = lock['sdkworkSpecs']
  return isJsonObject(specs) ? specs['source'] : undefined
}

/** Files the packaged skill carries, relative to the skill directory. */
function packageFiles(): string[] {
  const files = []
  for (const entry of walk(SKILL)) {
    const path = relative(SKILL, entry).replace(/\\/gu, '/')
    if (path === 'skill.manifest.json' || path === 'references/standards.lock.json') continue
    // Declaration files serve this repository's typecheck beside the `.mjs`
    // scripts; the installed skill runs them through Node and ships none.
    if (path.endsWith('.d.mts')) continue
    files.push(path)
  }
  return files.sort()
}

/** Recursively list files under a directory. */
function walk(directory: string): string[] {
  const files = []
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

/** Hex SHA-256 of a file's bytes. */
function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** The live `sdkwork-specs` checkout, when one is reachable. */
function specsCheckout(): string | undefined {
  const configured = process.env.SDKWORK_SPECS_HOME?.trim()
  if (configured !== undefined && configured !== '' && existsSync(join(configured, 'APP_MANIFEST_SPEC.md'))) return resolve(configured)
  const sibling = resolve(ROOT, '..', 'sdkwork-specs')
  return existsSync(join(sibling, 'APP_MANIFEST_SPEC.md')) ? sibling : undefined
}

/** The reviewed SDKWork specs revision, when a checkout can report one. */
function specsRevision(checkout: string | undefined): string | undefined {
  if (checkout === undefined) return undefined
  const result = spawnSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const revision = result.status === 0 ? result.stdout.trim() : ''
  return revision === '' ? undefined : revision
}

/** Build the lock object from the current checkout and packaged contracts. */
function buildLock(): StandardsLock {
  const checkout = specsCheckout()
  const revision = specsRevision(checkout)
  const specs: Record<string, string> = {}
  for (const spec of SPECS) {
    const path = checkout === undefined ? undefined : join(checkout, spec)
    if (path !== undefined && existsSync(path)) specs[spec] = hashFile(path)
  }
  const bundled: Record<string, string> = {}
  const standardsDir = join(SKILL, 'references', 'standards')
  if (existsSync(standardsDir)) {
    for (const entry of readdirSync(standardsDir).sort()) {
      const path = join(standardsDir, entry)
      if (statSync(path).isFile()) bundled[`references/standards/${entry}`] = hashFile(path)
    }
  }
  return {
    sdkworkSpecs: {
      source: checkout === undefined ? 'absent' : 'checkout',
      ...(revision === undefined ? {} : { revision }),
    },
    reviewedAt: new Date().toISOString().slice(0, 10),
    specs,
    bundled,
  }
}

/** Build the package manifest for the current files. */
function buildManifest(): SkillPackageManifest {
  const files = packageFiles().map(path => ({ path, sha256: hashFile(join(SKILL, path)) }))
  const requires = files
    .map(file => file.path)
    .filter(path => path.startsWith('references/') || path.startsWith('scripts/'))
  return {
    name: 'birdcoder-app-deploy',
    version: '0.1.0',
    scope: 'product',
    standardsLock: 'references/standards.lock.json',
    requires,
    files,
  }
}

/** Compare the packaged-file hashes a manifest declares with the current ones. */
function manifestDrift(current: Record<string, unknown>, expected: SkillPackageManifest): string[] {
  return JSON.stringify(current['files']) === JSON.stringify(expected.files) ? [] : ['skill.manifest.json: file hashes']
}

/**
 * Write or check the lock and manifest.
 * @param {boolean} check whether to verify instead of write.
 * @returns {number} process exit code.
 */
export function main(check: boolean): number {
  const lock = buildLock()
  const manifest = buildManifest()
  if (check) {
    if (!existsSync(LOCK)) return fail('references/standards.lock.json is missing; run pnpm run gen-skill-package')
    if (!existsSync(MANIFEST)) return fail('skill.manifest.json is missing; run pnpm run gen-skill-package')
    const currentLock = readJsonObject(LOCK)
    const currentManifest = readJsonObject(MANIFEST)
    const drift: string[] = []
    if (lockSource(currentLock) === 'checkout' && lock.sdkworkSpecs.source === 'checkout') {
      if (JSON.stringify(currentLock['specs']) !== JSON.stringify(lock.specs)) drift.push('references/standards.lock.json: spec hashes')
    }
    if (JSON.stringify(currentLock['bundled']) !== JSON.stringify(lock.bundled)) {
      drift.push('references/standards.lock.json: bundled hashes')
    }
    drift.push(...manifestDrift(currentManifest, manifest))
    if (drift.length > 0) {
      for (const item of drift) process.stderr.write(`gen-skill-package: drift at ${item}\n`)
      process.stderr.write('gen-skill-package: run pnpm run gen-skill-package and review the diff\n')
      return 1
    }
    process.stdout.write('gen-skill-package: lock and manifest are current\n')
    return 0
  }
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`)
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`gen-skill-package: wrote ${relative(ROOT, LOCK)} and ${relative(ROOT, MANIFEST)} (${String(manifest.files.length)} files)\n`)
  return 0
}

/** Report one failure and return the exit code. */
function fail(message: string): number {
  process.stderr.write(`gen-skill-package: ${message}\n`)
  return 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.includes('--check'))
}
