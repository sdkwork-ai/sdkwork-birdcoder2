/** Template-install controller behavior: wire refusal, seam projection, and
 * the success passthrough. The capability itself is a stub — its behavior has
 * its own spec in the capability package. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { SdkworkTemplateInstallError } from '@deepseek-ai/dsh-sdkwork-template-install'
import { SdkworkTemplateInstallController } from '../src/index.ts'

/** A controller over a stub capability; rejections are simulated seam answers. */
type StubWrite = (request: {
  targetDirectory: string
  relativePath: string
  contentBase64: string
}) => Promise<{ absolutePath: string; bytes: number }>

async function bench(write: StubWrite): Promise<SdkworkTemplateInstallController> {
  const ctx = new Context()
  ctx.provide('sdkworkTemplateInstall', { writeFile: vi.fn(write) })
  return new SdkworkTemplateInstallController(ctx)
}

const ok = { targetDirectory: '/tmp/target', relativePath: 'src/main.ts', contentBase64: 'aGVsbG8=' }

describe('SdkworkTemplateInstallController.writeFile', () => {
  it('passes a clean request through to the capability', async () => {
    const controller = await bench(async () => ({ absolutePath: '/tmp/target/src/main.ts', bytes: 5 }))
    expect(await controller.writeFile(ok)).toEqual({ absolutePath: '/tmp/target/src/main.ts', bytes: 5 })
  })

  it('refuses unclean paths, relative targets, and non-base64 content at the wire', async () => {
    const controller = await bench(async () => ({ absolutePath: '/x', bytes: 0 }))
    const bad: Array<Record<'targetDirectory' | 'relativePath' | 'contentBase64', string>> = [
      { ...ok, relativePath: 'a/../b.txt' },
      { ...ok, relativePath: '.gitignore/' },
      { ...ok, relativePath: '/abs.txt' },
      { ...ok, relativePath: 'readme.txt ' },
      { ...ok, relativePath: 'apps/com1' },
      { ...ok, targetDirectory: 'relative/dir' },
      { ...ok, contentBase64: 'not base64!!' },
    ]
    for (const request of bad) {
      await expect(controller.writeFile(request), JSON.stringify(request)).rejects.toMatchObject({
        code: 'gateway/bad-request',
      })
    }
  })

  it('admits dotfile names the template archives legitimately carry', async () => {
    const controller = await bench(async () => ({ absolutePath: '/tmp/target/.gitignore', bytes: 4 }))
    await expect(controller.writeFile({ ...ok, relativePath: '.gitignore' })).resolves.toMatchObject({ bytes: 4 })
  })

  it('projects each seam failure code onto its wire code', async () => {
    for (const code of ['target-unreadable', 'path-unsafe', 'content-too-large', 'write-failed'] as const) {
      const controller = await bench(async () => {
        throw new SdkworkTemplateInstallError(code, `boom: ${code}`, 'a.txt')
      })
      const failure = await controller.writeFile(ok).catch((cause: unknown) => cause)
      expect(failure).toBeInstanceOf(RemoteError)
      expect((failure as RemoteError).code).toBe(`template-install/${code}`)
    }
  })

  it('answers an unforeseen seam rejection as an infrastructure failure', async () => {
    const controller = await bench(async () => {
      throw new Error('disk gone')
    })
    await expect(controller.writeFile(ok)).rejects.toMatchObject({ code: 'gateway/internal' })
  })
})
