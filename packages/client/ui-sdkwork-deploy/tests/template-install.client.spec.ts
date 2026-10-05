// @vitest-environment jsdom
/** Template-install planning behavior: Drive chunked download, zip-slip and
 * platform-name safety, the expansion caps, and the text/binary write split. */
import { describe, expect, it, vi } from 'vitest'
import { strFromU8, strToU8, zipSync } from 'fflate'
import {
  decodeDriveContentChunk,
  downloadArtifactBytes,
  planTemplateInstall,
  TemplateEntryUnsafeError,
  TemplateInstallEmptyError,
  type DriveContentReader,
} from '../src/client/templateInstall.ts'

describe('decodeDriveContentChunk', () => {
  it('round-trips base64 back to the source bytes', () => {
    const source = strToU8('你好 template \u00ff bytes')
    const encoded = btoa(String.fromCharCode(...source))
    expect([...decodeDriveContentChunk(encoded)]).toEqual([...source])
  })
})

describe('downloadArtifactBytes', () => {
  /** A Drive reader serving `chunks` as successive ranged responses. */
  function driveReader(chunks: Uint8Array[]): DriveContentReader {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    let cursor = 0
    return {
      drive: {
        nodes: {
          content: {
            retrieve: vi.fn(async (_nodeId, params) => {
              void params.byteRangeStart
              const chunk = chunks[cursor] ?? new Uint8Array(0)
              cursor += 1
              return {
                content: btoa(String.fromCharCode(...chunk)),
                sizeBytes: total,
                hasMore: cursor < chunks.length,
              }
            }),
          },
        },
      },
    }
  }

  it('reassembles ranged base64 chunks and reports progress', async () => {
    const first = strToU8('a'.repeat(2048))
    const second = strToU8('b'.repeat(10))
    const onProgress = vi.fn()
    const merged = await downloadArtifactBytes(driveReader([first, second]), 'node-1', onProgress)
    expect(merged.length).toBe(first.length + second.length)
    expect(strFromU8(merged.slice(0, 3))).toBe('aaa')
    expect(onProgress).toHaveBeenLastCalledWith(100)
  })

  it('returns an empty buffer when the node has no bytes', async () => {
    const merged = await downloadArtifactBytes(driveReader([]), 'node-empty')
    expect(merged.length).toBe(0)
  })
})

describe('planTemplateInstall', () => {
  it('plans every file entry, skips directory entries, and splits text from binary', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
    const plan = planTemplateInstall(zipSync({
      'src/main.ts': strToU8('export const app = "模板";\n'),
      'assets/logo.png': pngBytes,
      'docs/': new Uint8Array(0),
    }))
    expect(plan.files.map(file => file.path).sort()).toEqual(['assets/logo.png', 'src/main.ts'])
    expect(plan.textCount).toBe(1)
    expect(plan.binaryCount).toBe(1)
    const main = plan.files.find(file => file.path === 'src/main.ts')
    expect(main?.isText).toBe(true)
    expect(strFromU8(main?.bytes ?? new Uint8Array())).toContain('模板')
    expect(plan.files.find(file => file.path === 'assets/logo.png')?.isText).toBe(false)
  })

  it('refuses parent traversal, absolute paths, and NUL names, and defuses drive prefixes', () => {
    const rejections: Record<string, Uint8Array> = {
      '../escape.txt': strToU8('x'),
      'a/../../escape.txt': strToU8('x'),
      '/abs.txt': strToU8('x'),
      'bad\u0000name.txt': strToU8('x'),
    }
    for (const [name, bytes] of Object.entries(rejections)) {
      expect(() => planTemplateInstall(zipSync({ [name]: bytes })), name)
        .toThrow(TemplateEntryUnsafeError)
    }
    // A drive prefix is dangerous only through its colon; sanitization keeps
    // the entry relative instead of rejecting the archive outright.
    const plan = planTemplateInstall(zipSync({ 'C:/tools/run.js': strToU8('x') }))
    expect(plan.files[0]?.path).toBe('C_/tools/run.js')
  })

  it('sanitizes control characters in otherwise-safe names', () => {
    const plan = planTemplateInstall(zipSync({ 'weird\x01name.txt': strToU8('x') }))
    expect(plan.files[0]?.path).toBe('weird_name.txt')
  })

  it('throws the empty error for an archive with no files', () => {
    expect(() => planTemplateInstall(zipSync({ 'only-dir/': new Uint8Array(0) })))
      .toThrow(TemplateInstallEmptyError)
  })
})
