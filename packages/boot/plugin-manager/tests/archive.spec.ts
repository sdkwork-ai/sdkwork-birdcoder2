/** Fetching and unpacking a plugin archive: format readers, confinement, limits, and caching. */

import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zip, tarGz } from './archive-fixture.ts'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveSourceError, materializePluginSource, readArchive } from '@deepseek-ai/dsh-plugin-manager'

const temporary: string[] = []
const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => { resolve() })
  })))
  await Promise.all(temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function profileDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-archive-'))
  temporary.push(dir)
  return dir
}

/** Serve one body on a loopback port for the duration of a test. */
async function serve(body: Uint8Array): Promise<{ url: string; hits: () => number }> {
  let hits = 0
  const server = createServer((_request, response) => {
    hits += 1
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(body.byteLength) })
    response.end(Buffer.from(body))
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('the test server has no port')
  return { url: `http://127.0.0.1:${String(address.port)}/plugin.zip`, hits: () => hits }
}

describe('readArchive', () => {
  it('reads a zip and a tar.gz by relative path', () => {
    const files = { 'package.json': '{"name":"dsh-x"}', 'lib/index.js': 'export default 1' }
    for (const archive of [zip(files), tarGz(files)]) {
      const entries = readArchive(archive)
      expect(entries.map(entry => entry.path).sort()).toEqual(['lib/index.js', 'package.json'])
      expect(Buffer.from(entries.find(entry => entry.path === 'package.json')?.bytes ?? []).toString()).toBe('{"name":"dsh-x"}')
    }
  })

  it('refuses another format and an entry that escapes the extraction directory', () => {
    expect(() => readArchive(Buffer.from('not an archive'))).toThrow(/neither a zip nor a tar archive/)
    expect(() => readArchive(zip({ '../evil.txt': 'x' }))).toThrow(/escapes the plugin directory/)
    expect(() => readArchive(tarGz({ '/absolute.txt': 'x' }))).toThrow(/is not a relative path/)
  })
})

describe('materializePluginSource', () => {
  it('downloads, strips a wrapping directory, and reuses the unpacked copy', async () => {
    const source = zip({
      'dsh-x-1.0.0/package.json': '{"name":"dsh-x","version":"1.0.0"}',
      'dsh-x-1.0.0/lib/index.js': 'export default 1',
    })
    const agent = await serve(source)
    const dir = await profileDir()
    const parsed = { kind: 'archive', spec: agent.url, url: agent.url, host: '127.0.0.1' } as const
    const materialized = await materializePluginSource({ source: parsed, profileDir: dir, signal: new AbortController().signal })
    expect(materialized.name).toBe('dsh-x')
    expect(materialized.version).toBe('1.0.0')
    expect(await readFile(join(materialized.dir, 'lib', 'index.js'), 'utf8')).toBe('export default 1')
    await materializePluginSource({ source: parsed, profileDir: dir, signal: new AbortController().signal })
    expect(agent.hits()).toBe(1)
  })

  it('keeps only the named plugin directory of a multi-plugin repository archive', async () => {
    const source = zip({
      'plugins/a/package.json': '{"name":"dsh-a"}',
      'plugins/b/package.json': '{"name":"dsh-b"}',
    })
    const agent = await serve(source)
    const dir = await profileDir()
    const parsed = { kind: 'archive', spec: agent.url, url: agent.url, host: '127.0.0.1', directory: 'plugins/b' } as const
    const materialized = await materializePluginSource({ source: parsed, profileDir: dir, signal: new AbortController().signal })
    expect(materialized.name).toBe('dsh-b')
    expect(await readFile(join(materialized.dir, 'package.json'), 'utf8')).toBe('{"name":"dsh-b"}')
  })

  it('verifies the declared hash and refuses another archive', async () => {
    const agent = await serve(zip({ 'package.json': '{"name":"dsh-x"}' }))
    const dir = await profileDir()
    const parsed = {
      kind: 'archive', spec: agent.url, url: agent.url, host: '127.0.0.1', sha256: 'a'.repeat(64),
    } as const
    await expect(materializePluginSource({ source: parsed, profileDir: dir, signal: new AbortController().signal }))
      .rejects.toMatchObject({ name: 'ArchiveSourceError', problem: 'checksum-mismatch' })
  })

  it('bounds the download and honours cancellation', async () => {
    const agent = await serve(zip({ 'package.json': '{"name":"dsh-x"}' }))
    const dir = await profileDir()
    const parsed = { kind: 'archive', spec: agent.url, url: agent.url, host: '127.0.0.1' } as const
    await expect(materializePluginSource({ source: parsed, profileDir: dir, signal: new AbortController().signal, maxBytes: 8 }))
      .rejects.toMatchObject({ name: 'ArchiveSourceError', problem: 'too-large' })
    const aborted = new AbortController()
    aborted.abort()
    await expect(materializePluginSource({ source: parsed, profileDir: dir, signal: aborted.signal }))
      .rejects.toBeInstanceOf(ArchiveSourceError)
  })

  it('reports an archive with no plugin package', async () => {
    const agent = await serve(zip({ 'readme.txt': 'hello' }))
    const dir = await profileDir()
    const parsed = { kind: 'archive', spec: agent.url, url: agent.url, host: '127.0.0.1', directory: 'missing' } as const
    await expect(materializePluginSource({ source: parsed, profileDir: dir, signal: new AbortController().signal }))
      .rejects.toMatchObject({ problem: 'not-a-package' })
  })
})
