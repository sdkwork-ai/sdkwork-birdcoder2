/**
 * Pack one skill into a distributable ZIP with its checksum and descriptor.
 *
 * Usage:
 *   pnpm run pack-skill [--skill <dir>] [--out <dir>]
 *
 * Defaults to the builtin deploy skill and `dist/skill-packages`.
 *
 * @module scripts/pack-skill
 */

import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { packSkill, SkillPackageError } from './skill-package-lib.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Read one `--name value` argument. */
function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? undefined : argv[index + 1]
}

/** CLI entry. */
export function main(argv: string[]): number {
  const directory = resolve(option(argv, 'skill') ?? join(ROOT, 'packages', 'skill', 'sdkwork-builtin-skills', 'assets', 'skills', 'birdcoder-app-deploy'))
  const outDir = resolve(option(argv, 'out') ?? join(ROOT, 'dist', 'skill-packages'))
  try {
    const packed = packSkill({ directory, outDir })
    process.stdout.write(`${JSON.stringify(packed, null, 2)}\n`)
    return 0
  } catch (error) {
    if (error instanceof SkillPackageError) {
      process.stderr.write(`pack-skill: ${error.code}: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
