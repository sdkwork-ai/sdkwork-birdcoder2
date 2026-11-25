#!/usr/bin/env node
/**
 * Resolve the authoritative SDKWork standards for one installed skill.
 *
 * Order:
 *   1. `$SDKWORK_SPECS_HOME`
 *   2. a `sdkwork-specs` checkout beside the skill (sibling or one level up)
 *   3. the skill's bundled `references/standards/` contract
 *   4. none
 *
 * The skill workflow never depends on step 1 or 2: the bundled contract is the
 * operational authority, and a checkout only adds the full normative text.
 * Pure Node, no network.
 *
 * Usage:
 *   node scripts/standards.mjs                # JSON resolution
 *   node scripts/standards.mjs --check        # exit 0 when a source exists
 *   node scripts/standards.mjs --path APP_MANIFEST_SPEC.md
 *   node scripts/standards.mjs --list
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** This skill's directory. */
export const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

/** Bundled distilled contract directory. */
export const BUNDLED_DIR = join(SKILL_DIR, 'references', 'standards')

/** Bundled lock file: which spec revision the contract was reviewed against. */
export const LOCK_FILE = join(SKILL_DIR, 'references', 'standards.lock.json')

/** Spec files the skill may need to locate. */
export const KNOWN_SPECS = [
  'APP_MANIFEST_SPEC.md',
  'APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md',
  'PACKAGING_SPEC.md',
  'SDKWORK_DEPLOY_SPEC.md',
  'ENVIRONMENT_SPEC.md',
  'APPLICATION_DEPLOY_LAYOUT_SPEC.md',
]

/**
 * Resolve the standards source.
 * @param {NodeJS.ProcessEnv} env environment to read `SDKWORK_SPECS_HOME` from.
 * @param {string[]} candidates extra checkout directories to probe.
 * @returns {{ source: 'checkout' | 'bundled' | 'none', checkoutDir?: string, bundledDir?: string, lock?: Record<string, unknown>, missing?: string[] }}
 */
export function resolveStandards(env = process.env, candidates = [], options = {}) {
  const ancestors = options.ancestors === false ? [] : ancestorSiblings()
  const directories = [
    ...(typeof env.SDKWORK_SPECS_HOME === 'string' && env.SDKWORK_SPECS_HOME.trim() !== '' ? [env.SDKWORK_SPECS_HOME.trim()] : []),
    ...ancestors,
    ...candidates,
  ]
  for (const directory of directories) {
    if (isCheckout(directory)) {
      return {
        source: 'checkout',
        checkoutDir: resolve(directory),
        bundledDir: BUNDLED_DIR,
        lock: readLock(),
      }
    }
  }
  if (existsSync(BUNDLED_DIR)) {
    return {
      source: 'bundled',
      bundledDir: BUNDLED_DIR,
      lock: readLock(),
      missing: KNOWN_SPECS.filter(spec => !existsSync(join(BUNDLED_DIR, spec))),
    }
  }
  return { source: 'none', missing: [...KNOWN_SPECS] }
}

/**
 * Candidate `sdkwork-specs` checkouts beside any of the skill's ancestors: the
 * skill may sit inside a repository, a user skills root, or beside a checkout.
 * @returns {string[]} candidate directories, nearest first.
 */
function ancestorSiblings() {
  const directories = []
  let current = SKILL_DIR
  for (let level = 0; level < 6; level += 1) {
    directories.push(join(current, 'sdkwork-specs'))
    directories.push(resolve(current, '..', 'sdkwork-specs'))
    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }
  return directories
}

/** True when a directory carries the standards tree. */
function isCheckout(directory) {
  return existsSync(join(directory, 'APP_MANIFEST_SPEC.md'))
    && existsSync(join(directory, 'PACKAGING_SPEC.md'))
}

/** Read the bundled lock, tolerating absence or damage. */
function readLock() {
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Resolve the file that carries one standard's current text.
 * @param {string} spec spec file name.
 * @param {{ source: string, checkoutDir?: string, bundledDir?: string }} resolution resolution from {@link resolveStandards}.
 * @returns {string | undefined}
 */
export function resolveSpecPath(spec, resolution) {
  if (!KNOWN_SPECS.includes(spec)) return undefined
  if (resolution.source === 'checkout' && resolution.checkoutDir !== undefined) {
    const checkout = join(resolution.checkoutDir, spec)
    if (existsSync(checkout)) return checkout
  }
  if (resolution.bundledDir !== undefined) {
    const bundled = join(BUNDLED_DIR, spec)
    if (existsSync(bundled)) return bundled
  }
  return undefined
}

/**
 * List the bundled contract files.
 * @returns {string[]} file names under the bundled directory.
 */
export function listBundled() {
  try {
    return readdirSync(BUNDLED_DIR).sort()
  } catch {
    return []
  }
}

/**
 * CLI entry.
 * @param {string[]} argv arguments after the script path.
 * @returns {number} process exit code.
 */
export function main(argv) {
  const resolution = resolveStandards()
  if (argv.includes('--list')) {
    process.stdout.write(`${JSON.stringify({ bundled: listBundled(), known: KNOWN_SPECS }, null, 2)}\n`)
    return 0
  }
  const pathIndex = argv.indexOf('--path')
  if (pathIndex !== -1) {
    const spec = argv[pathIndex + 1]
    if (spec === undefined || !KNOWN_SPECS.includes(spec)) {
      process.stderr.write(`usage: --path <${KNOWN_SPECS.join('|')}>\n`)
      return 2
    }
    const path = resolveSpecPath(spec, resolution)
    if (path === undefined) {
      process.stderr.write(`standard unavailable: ${spec} (source: ${resolution.source})\n`)
      return 1
    }
    process.stdout.write(`${path}\n`)
    return 0
  }
  if (argv.includes('--check')) {
    process.stdout.write(`${JSON.stringify(resolution, null, 2)}\n`)
    return resolution.source === 'none' ? 1 : 0
  }
  process.stdout.write(`${JSON.stringify(resolution, null, 2)}\n`)
  return 0
}

/* v8 ignore next 3 -- only the CLI entry runs main(); tests import the functions. */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
