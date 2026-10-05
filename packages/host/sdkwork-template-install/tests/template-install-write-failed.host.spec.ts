// @vitest-environment node
/** The write-failed branch, isolated here because the fs/promises mock is
 * file-wide: a backend refusal surfaces as the typed error, not a crash. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => {
      throw new Error('EACCES: read-only volume')
    }),
  }
})

describe('SdkworkTemplateInstallInstaller.writeFile backend refusal', () => {
  it('answers a refused write with the typed write-failed error', async () => {
    const { SdkworkTemplateInstallInstaller } = await import('../src/index.ts')
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const target = await mkdtemp(join(tmpdir(), 'template-install-fail-'))
    try {
      const installer = new SdkworkTemplateInstallInstaller(new Context())
      await expect(installer.writeFile({
        targetDirectory: target,
        relativePath: 'a.txt',
        contentBase64: Buffer.from('x').toString('base64'),
      })).rejects.toMatchObject({ code: 'write-failed' })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
