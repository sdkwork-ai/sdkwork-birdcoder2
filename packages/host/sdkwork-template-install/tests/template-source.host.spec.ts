/** Packaging reads: bounded listing, batching, confinement, and caps. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  MAX_BATCH_FILES,
  SdkworkTemplateInstallInstaller,
} from '../src/index.ts'

const tmpRoots: string[] = []

afterAll(async () => {
  for (const root of tmpRoots) await rm(root, { recursive: true, force: true })
})

/** One installer over a fresh temporary app directory. */
async function bench(maxFileBytes?: number): Promise<{ installer: SdkworkTemplateInstallInstaller; root: string }> {
  const ctx = new Context()
  const root = await mkdtemp(join(tmpdir(), 'template-source-'))
  tmpRoots.push(root)
  return { installer: new SdkworkTemplateInstallInstaller(ctx, maxFileBytes), root }
}

/** Write one file after creating its parent directories. */
async function seed(root: string, relativePath: string, text: string): Promise<string> {
  const path = join(root, ...relativePath.split('/'))
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
  return path
}

/** Create a file symlink, tolerating the Windows privilege requirement. */
async function trySymlink(target: string, path: string): Promise<boolean> {
  try {
    await symlink(target, path)
    return true
  } catch {
    return false
  }
}

describe('SdkworkTemplateInstallInstaller.listFiles', () => {
  it('lists packaging files with sizes, skipping dependency/build/VCS directories and symlinks', async () => {
    const { installer, root } = await bench()
    await seed(root, 'package.json', '{}')
    await seed(root, 'src/index.ts', 'export {}\n')
    await seed(root, 'src/deep/feature.ts', 'export const feature = 1\n')
    await seed(root, 'node_modules/dep/index.js', 'dep')
    await seed(root, 'dist/bundle.js', 'bundle')
    await seed(root, '.git/HEAD', 'ref')
    await seed(root, '.sdkwork/state.json', '{}')
    const linked = await trySymlink(join(root, 'package.json'), join(root, 'linked.json'))

    const listed = await installer.listFiles({ directory: root })
    expect(listed.truncated).toBe(false)
    expect(listed.files.map(file => file.path)).toEqual([
      'package.json',
      'src/deep/feature.ts',
      'src/index.ts',
    ])
    // A symlink must never appear whether or not this host could create one.
    expect(linked || !listed.files.some(file => file.path === 'linked.json')).toBe(true)
    expect(listed.files.find(file => file.path === 'src/index.ts')?.size).toBe(Buffer.byteLength('export {}\n'))
  })

  it('refuses a relative or missing source directory', async () => {
    const { installer } = await bench()
    await expect(installer.listFiles({ directory: 'relative/app' }))
      .rejects.toMatchObject({ code: 'source-unreadable' })
    await expect(installer.listFiles({ directory: join(tmpdir(), 'definitely-missing-template-app') }))
      .rejects.toMatchObject({ code: 'source-unreadable' })
  })
})

describe('SdkworkTemplateInstallInstaller.readFiles', () => {
  it('returns base64 content in request order', async () => {
    const { installer, root } = await bench()
    await seed(root, 'a.txt', 'alpha')
    await seed(root, 'src/b.ts', 'const b = "模板"\n')
    const read = await installer.readFiles({ directory: root, paths: ['src/b.ts', 'a.txt'] })
    expect(read.files.map(file => file.path)).toEqual(['src/b.ts', 'a.txt'])
    expect(Buffer.from(read.files[0]?.contentBase64 ?? '', 'base64').toString('utf8')).toBe('const b = "模板"\n')
    expect(read.files[1]).toMatchObject({ path: 'a.txt', bytes: 5 })
  })

  it('returns an empty batch for no paths', async () => {
    const { installer, root } = await bench()
    await expect(installer.readFiles({ directory: root, paths: [] })).resolves.toEqual({ files: [] })
  })

  it('refuses traversal, absolute, reserved, symlink, directory, and missing entries', async () => {
    const { installer, root } = await bench()
    await seed(root, 'dir/file.txt', 'x')
    await mkdir(join(root, 'folder'))
    const linked = await trySymlink(join(root, 'dir/file.txt'), join(root, 'link.txt'))
    const unsafe = ['../outside.txt', '/etc/passwd', 'C:/tools/x', 'con.txt', 'folder', 'missing.txt']
    if (linked) unsafe.push('link.txt')
    for (const path of unsafe) {
      await expect(installer.readFiles({ directory: root, paths: [path] }), path)
        .rejects.toMatchObject({ code: path === 'missing.txt' ? 'read-failed' : 'path-unsafe' })
    }
  })

  it('enforces the per-file byte cap', async () => {
    const { installer, root } = await bench(4)
    await seed(root, 'big.txt', '0123456789')
    await expect(installer.readFiles({ directory: root, paths: ['big.txt'] }))
      .rejects.toMatchObject({ code: 'content-too-large' })
  })

  it('enforces the batch byte cap when more than one file is requested', async () => {
    const { installer, root } = await bench()
    await seed(root, 'a.txt', 'a'.repeat(20 * 1024 * 1024))
    await seed(root, 'b.txt', 'b'.repeat(20 * 1024 * 1024))
    await expect(installer.readFiles({ directory: root, paths: ['a.txt', 'b.txt'] }))
      .rejects.toMatchObject({ code: 'content-too-large' })
  })

  it('enforces the batch count cap', async () => {
    const { installer, root } = await bench()
    const paths = Array.from({ length: MAX_BATCH_FILES + 1 }, (_, index) => `f${index}.txt`)
    await expect(installer.readFiles({ directory: root, paths }))
      .rejects.toMatchObject({ code: 'content-too-large' })
  })
})
