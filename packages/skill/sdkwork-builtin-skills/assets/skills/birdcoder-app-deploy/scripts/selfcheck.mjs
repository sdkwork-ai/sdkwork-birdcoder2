#!/usr/bin/env node
/**
 * Verify that one installed skill is complete.
 *
 * A skill is a directory package: `SKILL.md`, its `references/`, and its
 * `scripts/`. Installers that copy only the entrypoint leave a skill that links
 * to files no machine has. This check reports exactly what is missing and what
 * the skill needs, using the package's own `skill.manifest.json` and the links
 * the entrypoint declares.
 *
 * Usage:
 *   node scripts/selfcheck.mjs              # human-readable report
 *   node scripts/selfcheck.mjs --json       # machine-readable
 *   node scripts/selfcheck.mjs --strict     # exit 1 on any missing file
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** This skill's directory. */
export const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Read the package manifest.
 * @param {string} [directory] skill directory; defaults to this skill.
 * @returns {{ name?: string, version?: string, scope?: string, files?: { path: string, sha256?: string }[], requires?: string[] } | undefined}
 */
export function readManifest(directory = SKILL_DIR) {
  try {
    return JSON.parse(readFileSync(join(directory, 'skill.manifest.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Collect the relative files the entrypoint names in markdown links.
 * @param {string} [directory] skill directory; defaults to this skill.
 * @returns {string[]} relative paths the skill refers to.
 */
export function declaredReferences(directory = SKILL_DIR) {
  let text
  try {
    text = readFileSync(join(directory, 'SKILL.md'), 'utf8')
  } catch {
    return []
  }
  return [...text.matchAll(/\]\(((?:references|scripts|assets)\/[^)\s]+)\)/gu)].map(match => match[1])
}

/**
 * Check one installed package.
 * @param {string} [directory] skill directory; defaults to this skill.
 * @returns {{ ok: boolean, skillDir: string, manifest?: ReturnType<typeof readManifest>, missing: string[], referenced: string[] }}
 */
export function selfCheck(directory = SKILL_DIR) {
  const manifest = readManifest(directory)
  const referenced = declaredReferences(directory)
  const required = new Set([...referenced])
  for (const file of manifest?.files ?? []) required.add(file.path)
  for (const entry of manifest?.requires ?? []) required.add(entry)
  const missing = [...required].filter(path => !existsSync(join(directory, path)))
  return {
    ok: existsSync(join(directory, 'SKILL.md')) && missing.length === 0,
    skillDir: directory,
    ...(manifest === undefined ? {} : { manifest }),
    missing,
    referenced,
  }
}

/**
 * CLI entry.
 * @param {string[]} argv arguments after the script path.
 * @returns {number} process exit code.
 */
export function main(argv) {
  const report = selfCheck()
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(`skill: ${report.skillDir}\n`)
    process.stdout.write(`manifest: ${report.manifest === undefined ? 'none' : `${report.manifest.name ?? 'unnamed'} ${report.manifest.version ?? ''} (${report.manifest.scope ?? 'unknown'})`}\n`)
    process.stdout.write(`referenced files: ${report.referenced.length}\n`)
    if (report.missing.length === 0) {
      process.stdout.write('package complete\n')
    } else {
      process.stdout.write(`MISSING (install the whole skill directory, not only SKILL.md):\n`)
      for (const path of report.missing) process.stdout.write(`  - ${path}\n`)
    }
  }
  if (!report.ok && argv.includes('--strict')) return 1
  return 0
}

/* v8 ignore next 3 -- only the CLI entry runs main(); tests import the functions. */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2))
}
