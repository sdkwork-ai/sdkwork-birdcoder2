/** Host-backed packaging: batching, secret exclusion, and cap failures. */
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  isSensitiveSourcePath,
  packTemplateApp,
  TemplateArchiveTruncatedError,
  TemplateArchiveUnavailableError,
  type TemplateArchivePort,
} from '../src/client/hostArchive.ts'

const FILES: Record<string, string> = {
  '.gitignore': 'dist/\n',
  'package.json': '{"name":"demo"}',
  'src/index.ts': 'export const demo = 1\n',
  'src/deep/file.ts': 'export const deep = true\n',
  'dist/generated.js': 'generated',
  '.env': 'SECRET=1',
  'config/.env.local': 'TOKEN=2',
  'config/.env.example': 'TOKEN=',
  'secret.pem': 'key',
}

function base64(text: string): string {
  return btoa(text)
}

/** In-memory host bridge over {@link FILES}. */
function port(overrides: Partial<TemplateArchivePort> = {}): TemplateArchivePort & {
  readonly batches: string[][]
} {
  const batches: string[][] = []
  const base: TemplateArchivePort = {
    listTemplateFiles: async () => ({
      files: Object.entries(FILES).map(([path, content]) => ({ path, size: content.length })),
      truncated: false,
    }),
    readTemplateFiles: async (_directory, paths) => {
      batches.push([...paths])
      return paths.map(path => ({
        path,
        contentBase64: base64(FILES[path] ?? ''),
        bytes: (FILES[path] ?? '').length,
      }))
    },
  }
  return Object.assign(base, { batches }, overrides)
}

describe('isSensitiveSourcePath', () => {
  it('excludes local env files and key material but keeps examples', () => {
    expect(isSensitiveSourcePath('.env')).toBe(true)
    expect(isSensitiveSourcePath('config/.env.local')).toBe(true)
    expect(isSensitiveSourcePath('config/app.local.toml')).toBe(true)
    expect(isSensitiveSourcePath('config/.env.example')).toBe(false)
    expect(isSensitiveSourcePath('config/.env.sample')).toBe(false)
    // A checked-in per-profile template is scaffold source, not a local secret.
    expect(isSensitiveSourcePath('config/.env.cloud.production')).toBe(false)
    expect(isSensitiveSourcePath('.npmrc')).toBe(true)
    expect(isSensitiveSourcePath('certs/server.pem')).toBe(true)
    expect(isSensitiveSourcePath('src/key.ts')).toBe(false)
    expect(isSensitiveSourcePath('src/app.ts')).toBe(false)
  })
})

describe('packTemplateApp', () => {
  it('packs the included files through bounded batches and drops sensitive carriers', async () => {
    const p = port()
    const progress: number[] = []
    const pack = await packTemplateApp(p, '/proj/apps/demo', 1024 * 1024, {
      onReadProgress: (event) => { progress.push(event.read) },
    })
    expect(pack.archive.type).toBe('application/zip')
    expect(pack.archive.size).toBeGreaterThan(0)
    const archived = unzipSync(new Uint8Array(await pack.archive.arrayBuffer()))
    const names = Object.keys(archived).sort()
    expect(names).toEqual([
      '.gitignore',
      'config/.env.example',
      'package.json',
      'src/deep/file.ts',
      'src/index.ts',
    ])
    expect(strFromU8(archived['src/deep/file.ts'])).toBe('export const deep = true\n')
    expect(pack.excludedSensitive).toEqual(expect.arrayContaining(['.env', 'config/.env.local', 'secret.pem']))
    expect(pack.listedFiles).toBe(Object.keys(FILES).length)
    expect(pack.fileCount).toBe(5)
    expect(progress.at(-1)).toBeGreaterThan(0)
    // More than one file per host call: the batch is bounded but not per-file.
    expect(p.batches.some(batch => batch.length > 1)).toBe(true)
  })

  it('rejects a listing the host cut at its bound', async () => {
    const p = port({ listTemplateFiles: async () => ({ files: [], truncated: true }) })
    await expect(packTemplateApp(p, '/proj/apps/demo', 1024)).rejects.toBeInstanceOf(TemplateArchiveTruncatedError)
  })

  it('rejects an unavailable host bridge', async () => {
    const p = port({ listTemplateFiles: async () => undefined })
    await expect(packTemplateApp(p, '/proj/apps/demo', 1024)).rejects.toBeInstanceOf(TemplateArchiveUnavailableError)
  })

  it('rejects an app with no eligible files', async () => {
    const p = port({
      listTemplateFiles: async () => ({ files: [{ path: '.env', size: 3 }], truncated: false }),
    })
    await expect(packTemplateApp(p, '/proj/apps/demo', 1024)).rejects.toThrow('no packaging-eligible files')
  })

  it('rejects a failed batch read', async () => {
    const p = port({ readTemplateFiles: async () => undefined })
    await expect(packTemplateApp(p, '/proj/apps/demo', 1024)).rejects.toBeInstanceOf(TemplateArchiveUnavailableError)
  })

  it('rejects an over-cap pack', async () => {
    const p = port()
    await expect(packTemplateApp(p, '/proj/apps/demo', 10)).rejects.toThrow('exceed')
  })
})
