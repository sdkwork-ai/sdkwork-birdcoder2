/**
 * Install one skill package (directory or ZIP) into a skills root.
 *
 * Every installed package is verified against its manifest before it lands, and
 * a ZIP's entries are rejected when they escape the package. Replacing an
 * existing same-named skill requires `--force`.
 *
 * Usage:
 *   pnpm run install-skill --from <dir|zip> --to <skills-root> [--force]
 *
 * @module scripts/install-skill
 */

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { installSkill, SkillPackageError } from './skill-package-lib.ts'

/** Read one `--name value` argument. */
function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

/** CLI entry. */
export function main(argv: string[]): number {
  const from = option(argv, 'from')
  const to = option(argv, 'to')
  if (from === undefined || to === undefined) {
    process.stderr.write('usage: install-skill --from <dir|zip> --to <skills-root> [--force]\n')
    return 2
  }
  try {
    const installed = installSkill({ from, skillsRoot: to, force: argv.includes('--force') })
    process.stdout.write(`${JSON.stringify(installed, null, 2)}\n`)
    return 0
  } catch (error) {
    if (error instanceof SkillPackageError) {
      process.stderr.write(`install-skill: ${error.code}: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
