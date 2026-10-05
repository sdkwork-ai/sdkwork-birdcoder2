// @vitest-environment jsdom
/** Directory packer behavior: .gitignore selection with pruning, the size
 * cap, and a zip the round-trip unzip can read back. */
import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import {
  DirectoryPackEmptyError,
  DirectoryPackTooLargeError,
  packDirectory,
  type PackableFile,
} from '../src/client/directoryArchive.ts'

/** A PackableFile over plain text content. */
function textFile(path: string, content: string): PackableFile {
  const bytes = new TextEncoder().encode(content)
  return {
    path,
    name: path.split('/').pop() ?? path,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteLength) as ArrayBuffer,
  }
}

/** Run one pack and hand back the inflated name → text map plus the facts. */
async function packAndUnzip(files: readonly PackableFile[], maxBytes = 64 * 1024 * 1024) {
  const pack = await packDirectory(files, maxBytes)
  const zipped = unzipSync(new Uint8Array(await pack.archive.arrayBuffer()))
  const contents = Object.fromEntries(
    Object.entries(zipped).map(([name, bytes]) => [name, strFromU8(bytes)]),
  )
  return { pack, contents }
}

describe('packDirectory', () => {
  it('packs every file when no .gitignore exists, in deterministic order', async () => {
    const { pack, contents } = await packAndUnzip([
      textFile('z.txt', 'z'),
      textFile('apps/pc/main.ts', 'main'),
      textFile('a.txt', 'a'),
    ])
    expect(pack.fileCount).toBe(3)
    expect(Object.keys(contents).sort()).toEqual(['a.txt', 'apps/pc/main.ts', 'z.txt'])
    expect(contents['apps/pc/main.ts']).toBe('main')
    expect(pack.checksumSha256).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('honors root .gitignore rules and keeps the rules file itself', async () => {
    const { pack, contents } = await packAndUnzip([
      textFile('.gitignore', 'dist/\n*.log\n'),
      textFile('src/main.ts', 'main'),
      textFile('src/debug.log', 'noise'),
      textFile('dist/output.js', 'output'),
    ])
    expect(Object.keys(contents).sort()).toEqual(['.gitignore', 'src/main.ts'])
    expect(pack.fileCount).toBe(2)
  })

  it('scopes nested .gitignore files to their subtree and lets them re-include', async () => {
    const { contents } = await packAndUnzip([
      textFile('.gitignore', '*.log\n'),
      textFile('packages/inner/.gitignore', '!special.log\n'),
      textFile('packages/inner/special.log', 'kept'),
      textFile('packages/inner/other.log', 'dropped'),
      textFile('packages/outer/top.log', 'dropped'),
    ])
    expect(Object.keys(contents).sort()).toEqual([
      '.gitignore',
      'packages/inner/.gitignore',
      'packages/inner/special.log',
    ])
  })

  it('drops .git metadata wherever it appears', async () => {
    const { contents } = await packAndUnzip([
      textFile('.git/config', 'repo'),
      textFile('src/index.ts', 'code'),
      textFile('packages/app/.git/HEAD', 'ref'),
    ])
    expect(Object.keys(contents)).toEqual(['src/index.ts'])
  })

  it('prunes an ignored directory wholesale: nothing inside re-includes', async () => {
    const { contents } = await packAndUnzip([
      textFile('.gitignore', 'vendor/\n'),
      textFile('vendor/inner/.gitignore', '!*\n'),
      textFile('vendor/inner/keepme.txt', 'still dropped'),
      textFile('app/main.ts', 'kept'),
    ])
    expect(Object.keys(contents)).toEqual(['.gitignore', 'app/main.ts'])
  })

  it('throws on an empty selection and on the byte cap', async () => {
    await expect(packDirectory(
      [textFile('.gitignore', '*\n'), textFile('a.ts', 'x')],
      64 * 1024 * 1024,
    )).rejects.toBeInstanceOf(DirectoryPackEmptyError)
    await expect(packDirectory([textFile('a.ts', 'hello')], 4)).rejects
      .toBeInstanceOf(DirectoryPackTooLargeError)
  })
})
