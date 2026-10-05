/** Template-install capability behavior: confinement, name screening, the
 * byte cap, parent creation, and the acknowledged write facts. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  MAX_FILE_BYTES,
  SdkworkTemplateInstallError,
  SdkworkTemplateInstallInstaller,
} from '../src/index.ts'

const tmpRoots: string[] = []

afterAll(async () => {
  for (const root of tmpRoots) await rm(root, { recursive: true, force: true })
})

/** One installer over a fresh temporary target directory. */
async function bench(maxFileBytes?: number): Promise<{ installer: SdkworkTemplateInstallInstaller; target: string }> {
  const ctx = new Context()
  const target = await mkdtemp(join(tmpdir(), 'template-install-'))
  tmpRoots.push(target)
  return { installer: new SdkworkTemplateInstallInstaller(ctx, maxFileBytes), target }
}

const content = (text: string): string => Buffer.from(text, 'utf8').toString('base64')

describe('SdkworkTemplateInstallInstaller.writeFile', () => {
  it('writes one file, creating parents, and acknowledges path and bytes', async () => {
    const { installer, target } = await bench()
    const written = await installer.writeFile({
      targetDirectory: target,
      relativePath: 'apps/pc/src/main.ts',
      contentBase64: content('export const app = "模板";\n'),
    })
    expect(written.bytes).toBe(Buffer.byteLength('export const app = "模板";\n'))
    expect(written.absolutePath).toBe(join(target, 'apps', 'pc', 'src', 'main.ts'))
    expect(await readFile(written.absolutePath, 'utf8')).toBe('export const app = "模板";\n')
  })

  it('overwrites an existing file in place', async () => {
    const { installer, target } = await bench()
    await installer.writeFile({ targetDirectory: target, relativePath: 'a.txt', contentBase64: content('one') })
    await installer.writeFile({ targetDirectory: target, relativePath: 'a.txt', contentBase64: content('two') })
    expect(await readFile(join(target, 'a.txt'), 'utf8')).toBe('two')
  })

  it('refuses a relative or nonexistent target directory', async () => {
    const { installer } = await bench()
    await expect(installer.writeFile({
      targetDirectory: 'relative/dir', relativePath: 'a.txt', contentBase64: content('x'),
    })).rejects.toMatchObject({ code: 'target-unreadable' })
    await expect(installer.writeFile({
      targetDirectory: '/definitely/missing/dir', relativePath: 'a.txt', contentBase64: content('x'),
    })).rejects.toMatchObject({ code: 'target-unreadable' })
  })

  it('refuses traversal, absolute, NUL, and non-clean segment chains', async () => {
    const { installer, target } = await bench()
    const unsafe: string[] = [
      '../escape.txt',
      'a/../b.txt',
      'a//b.txt',
      './a.txt',
      '/abs.txt',
      'C:/tools/run.js',
      'bad\u0000name.txt',
    ]
    for (const relativePath of unsafe) {
      await expect(installer.writeFile({
        targetDirectory: target, relativePath, contentBase64: content('x'),
      }), relativePath).rejects.toMatchObject({ code: 'path-unsafe' })
    }
  })

  it('refuses Windows-reserved device segments and dot/space-terminated segments', async () => {
    const { installer, target } = await bench()
    for (const relativePath of ['con.txt', 'apps/com1', 'nul/settings.json', 'readme.txt.', 'readme.txt ']) {
      await expect(installer.writeFile({
        targetDirectory: target, relativePath, contentBase64: content('x'),
      }), relativePath).rejects.toMatchObject({ code: 'path-unsafe' })
    }
  })

  it('enforces the per-file byte cap', async () => {
    const { installer, target } = await bench(8)
    await expect(installer.writeFile({
      targetDirectory: target, relativePath: 'big.bin', contentBase64: content('0123456789'),
    })).rejects.toMatchObject({ code: 'content-too-large' })
    expect(MAX_FILE_BYTES).toBeGreaterThan(0)
  })

  it('throws the typed error class the controller projects onto the wire', async () => {
    const { installer, target } = await bench()
    const failure = await installer.writeFile({
      targetDirectory: target, relativePath: '../x', contentBase64: content('x'),
    }).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(SdkworkTemplateInstallError)
  })
})
