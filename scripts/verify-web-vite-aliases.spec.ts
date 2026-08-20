import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { verifyWebViteAliases } from './verify-web-vite-aliases.ts'

const root = resolve(import.meta.dirname, '..')
const tempRoots: string[] = []

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

describe('verifyWebViteAliases', () => {
  it('accepts the repository alias targets', async () => {
    await expect(verifyWebViteAliases(root)).resolves.toEqual([])
  })

  it('rejects missing alias targets', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-verify-web-vite-'))
    tempRoots.push(tempRoot)
    mkdirSync(join(tempRoot, 'apps', 'web'), { recursive: true })
    writeFileSync(
      join(tempRoot, 'apps', 'web', 'vite-source-aliases.ts'),
      `export const WEB_SOURCE_ALIASES = [{ replacement: ${JSON.stringify(join(tempRoot, 'missing.ts'))} }]`,
      'utf8',
    )

    await expect(verifyWebViteAliases(tempRoot)).resolves.toEqual([
      'missing.ts: apps/web Vite alias target is missing; update apps/web/vite-source-aliases.ts after renaming the web shell entry',
    ])
  })
})
