import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillhubInstaller } from '../src/installer.ts'
import { SkillhubClient, SkillhubError, isSafeSkillFilePath, parseSkillhubPackageKey, sha256Hex } from '../src/skillhub.ts'

const PACKAGE_KEY = 'skillhub.demo/example'

function bytesOf(text: string): Buffer {
  return Buffer.from(text, 'utf8')
}

interface SkillhubFixture {
  version: string
  files: Record<string, Buffer>
  versions?: readonly { version: string; changelog: string; createdAt: number }[]
  name?: string
  summary?: string
  /** Serve these bytes instead of the manifest's file content (same length, different digest). */
  tamper?: Readonly<Record<string, Buffer>>
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Upstream double: answers the documented SkillHub routes from one fixture. */
function fixtureFetch(fixture: SkillhubFixture): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const version = url.searchParams.get('version') ?? fixture.version
    if (url.pathname.endsWith('/versions')) {
      return Response.json({
        namespace: 'demo',
        slug: 'example',
        versions: (fixture.versions ?? [{ version: fixture.version, changelog: 'first', createdAt: 1_700_000_000_000 }]).map(entry => ({
          version: entry.version,
          changelog: entry.changelog,
          createdAt: entry.createdAt,
          securityReports: { keen: { status: 'benign', statusText: 'safe', reportUrl: 'https://reports.example/keen' } },
        })),
      })
    }
    if (url.pathname.endsWith('/files')) {
      return Response.json({
        version,
        namespace: 'demo',
        slug: 'example',
        count: Object.keys(fixture.files).length,
        files: Object.entries(fixture.files).map(([path, bytes]) => ({ path, size: bytes.byteLength, sha256: sha256(bytes) })),
      })
    }
    if (url.pathname.endsWith('/file')) {
      const path = url.searchParams.get('path') ?? ''
      const bytes = fixture.tamper?.[path] ?? fixture.files[path]
      if (bytes === undefined) return new Response('missing', { status: 404 })
      return new Response(new Uint8Array(bytes))
    }
    if (/\/api\/v1\/skills\/[^/]+$/.test(url.pathname)) {
      return Response.json({
        latestVersion: { version: fixture.version },
        skill: { displayName: fixture.name ?? 'Demo skill', summary_zh: fixture.summary ?? '演示技能', summary: 'demo skill' },
      })
    }
    return new Response('unexpected', { status: 500 })
  }) as unknown as typeof fetch
}

async function harness(fixture: SkillhubFixture = { version: '1.2.0', files: { 'SKILL.md': bytesOf('# demo\n'), 'refs/a.md': bytesOf('a') } }) {
  const root = await mkdtemp(join(tmpdir(), 'skillhub-install-'))
  const skillsRoot = join(root, 'skills')
  const disabledRoot = join(root, 'disabled')
  const ledgerPath = join(root, 'installed.json')
  const fetchImpl = fixtureFetch(fixture)
  const client = new SkillhubClient({ baseUrl: 'https://fixture.example', fetch: fetchImpl })
  const installer = new SkillhubInstaller({ skillsRoot, disabledRoot, ledgerPath, client })
  return { root, skillsRoot, disabledRoot, ledgerPath, installer, client, fixture, fetchImpl }
}

const temporaryRoots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function installHarness(fixture?: SkillhubFixture) {
  const h = await harness(fixture)
  temporaryRoots.push(h.root)
  return h
}

describe('parseSkillhubPackageKey', () => {
  it('reads the upstream coordinate out of a catalog package key', () => {
    expect(parseSkillhubPackageKey('skillhub.ake/dev-god')).toEqual({ namespace: 'ake', slug: 'dev-god' })
    expect(parseSkillhubPackageKey(' skillhub.ake/dev-god ')).toEqual({ namespace: 'ake', slug: 'dev-god' })
  })

  it('refuses keys that are not an installable SkillHub record', () => {
    expect(parseSkillhubPackageKey('skillhub.ake.dev-god')).toBeUndefined()
    expect(parseSkillhubPackageKey('skillhub.a/b/c')).toBeUndefined()
    expect(parseSkillhubPackageKey('skillhub../escape')).toBeUndefined()
    expect(parseSkillhubPackageKey('local/thing')).toBeUndefined()
    expect(parseSkillhubPackageKey('')).toBeUndefined()
  })
})

describe('isSafeSkillFilePath', () => {
  it('accepts nested relative paths and rejects escapes', () => {
    expect(isSafeSkillFilePath('SKILL.md')).toBe(true)
    expect(isSafeSkillFilePath('references/deep/guide.md')).toBe(true)
    expect(isSafeSkillFilePath('../escape.md')).toBe(false)
    expect(isSafeSkillFilePath('a/../../b.md')).toBe(false)
    expect(isSafeSkillFilePath('/etc/passwd')).toBe(false)
    expect(isSafeSkillFilePath('a\\b.md')).toBe(false)
    expect(isSafeSkillFilePath('')).toBe(false)
  })
})

describe('SkillhubInstaller', () => {
  it('downloads a version-pinned manifest, verifies every file, and lists the install', async () => {
    const h = await installHarness()
    const installed = await h.installer.install(PACKAGE_KEY)
    expect(installed).toMatchObject({ id: 'demo--example', packageKey: PACKAGE_KEY, version: '1.2.0', enabled: true, files: 2 })
    expect(installed.bytes).toBe(bytesOf('# demo\n').byteLength + 1)
    expect(await readFile(join(h.skillsRoot, 'demo--example', 'SKILL.md'), 'utf8')).toBe('# demo\n')
    expect(await readFile(join(h.skillsRoot, 'demo--example', 'refs', 'a.md'), 'utf8')).toBe('a')

    // Every file download names the manifest version; an unpinned download
    // would silently mix the latest files into a pinned install.
    const calls = (h.fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls
    const fileCalls = calls.map(([url]) => String(url)).filter(url => url.includes('/file?'))
    expect(fileCalls).toHaveLength(2)
    for (const url of fileCalls) expect(url).toContain('version=1.2.0')

    const listed = await h.installer.list()
    expect(listed).toEqual([expect.objectContaining({ id: 'demo--example', enabled: true, version: '1.2.0' })])
    const ledger = JSON.parse(await readFile(h.ledgerPath, 'utf8')) as { version: number; skills: Record<string, unknown> }
    expect(ledger.version).toBe(1)
    expect(Object.keys(ledger.skills)).toEqual(['demo--example'])
  })

  it('rejects a file whose bytes do not match the manifest and leaves the previous install intact', async () => {
    const h = await installHarness()
    await h.installer.install(PACKAGE_KEY)
    const tampered = await installHarness({
      version: '1.3.0',
      files: { 'SKILL.md': bytesOf('# demo\n'), 'refs/a.md': bytesOf('a') },
      tamper: { 'refs/a.md': bytesOf('b') },
    })
    const updater = new SkillhubInstaller({
      skillsRoot: h.skillsRoot,
      disabledRoot: h.disabledRoot,
      ledgerPath: h.ledgerPath,
      client: tampered.client,
    })
    await expect(updater.install(PACKAGE_KEY)).rejects.toBeInstanceOf(SkillhubError)
    // The previous installation is still there, and no staging directory leaked.
    expect(await readFile(join(h.skillsRoot, 'demo--example', 'SKILL.md'), 'utf8')).toBe('# demo\n')
    expect((await readdir(h.skillsRoot)).filter(name => name.startsWith('.staging-'))).toEqual([])
    expect((await h.installer.list())[0]).toMatchObject({ version: '1.2.0' })
  })

  it('moves a skill between roots for enable and disable', async () => {
    const h = await installHarness()
    await h.installer.install(PACKAGE_KEY)
    const disabled = await h.installer.setEnabled(PACKAGE_KEY, false)
    expect(disabled.enabled).toBe(false)
    await expect(stat(join(h.skillsRoot, 'demo--example'))).rejects.toThrow()
    await expect(stat(join(h.disabledRoot, 'demo--example'))).resolves.toBeTruthy()
    const enabled = await h.installer.setEnabled(PACKAGE_KEY, true)
    expect(enabled.enabled).toBe(true)
    await expect(stat(join(h.skillsRoot, 'demo--example'))).resolves.toBeTruthy()
    // Disabling is idempotent and unknown skills are reported, not invented.
    expect((await h.installer.setEnabled(PACKAGE_KEY, true)).enabled).toBe(true)
    await expect(h.installer.setEnabled('skillhub.demo/missing', false)).rejects.toMatchObject({ code: 'not-found' })
  })

  it('removes the directory and the ledger row on uninstall', async () => {
    const h = await installHarness()
    await h.installer.install(PACKAGE_KEY)
    expect(await h.installer.uninstall(PACKAGE_KEY)).toBe(true)
    await expect(stat(join(h.skillsRoot, 'demo--example'))).rejects.toThrow()
    expect(await h.installer.list()).toEqual([])
    expect(await h.installer.uninstall(PACKAGE_KEY)).toBe(false)
  })

  it('reports upstream detail with versions, files and security reports', async () => {
    const h = await installHarness({
      version: '2.0.0',
      files: { 'SKILL.md': bytesOf('# demo\n') },
      versions: [
        { version: '2.0.0', changelog: 'new', createdAt: 1_700_000_000_000 },
        { version: '1.0.0', changelog: 'old', createdAt: 1_600_000_000_000 },
      ],
      name: '演示技能',
      summary: '摘要',
    })
    const detail = await h.installer.detail(PACKAGE_KEY)
    expect(detail).toMatchObject({ namespace: 'demo', slug: 'example', name: '演示技能', summary: '摘要', version: '2.0.0' })
    expect(detail.versions.map(entry => entry.version)).toEqual(['2.0.0', '1.0.0'])
    expect(detail.versions[0]?.security[0]).toMatchObject({ vendor: 'keen', status: 'benign' })
    expect(detail.files).toHaveLength(1)
  })

  it('refuses an unsafe file path from the manifest', async () => {
    const h = await installHarness({ version: '1.0.0', files: { '../escape.md': bytesOf('x') } })
    await expect(h.installer.install(PACKAGE_KEY)).rejects.toBeInstanceOf(SkillhubError)
    expect(await h.installer.list()).toEqual([])
  })

  it('leaves no staging directory behind when a download fails', async () => {
    const h = await installHarness()
    vi.spyOn(h.client, 'file').mockRejectedValueOnce(new SkillhubError('unavailable', 'offline', 502))
    await expect(h.installer.install(PACKAGE_KEY)).rejects.toBeInstanceOf(SkillhubError)
    expect((await readdir(h.skillsRoot).catch(() => [])).filter(name => name.startsWith('.staging-'))).toEqual([])
    expect(await h.installer.list()).toEqual([])
  })

  it('keeps a manually placed directory visible without claiming a version', async () => {
    const h = await installHarness()
    await mkdir(join(h.skillsRoot, 'manual--skill'), { recursive: true })
    expect(await h.installer.list()).toEqual([
      expect.objectContaining({ id: 'manual--skill', version: '', enabled: true }),
    ])
  })

  it('hashes file bytes with SHA-256', () => {
    expect(sha256Hex(bytesOf('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
