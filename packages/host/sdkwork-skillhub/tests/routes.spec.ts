import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply, name, type Config } from '../src/index.ts'
import { SKILLHUB_INSTALL_PATH, SKILLHUB_INSTALLED_PATH } from '../src/shared.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, peer?: { principal: { kind: string } }) => Promise<void>

interface Registration {
  path: string
  handler: Handler
}

const SKILL_FILES: Record<string, Buffer> = {
  'SKILL.md': Buffer.from('# demo\n'),
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function stubUpstream(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const version = url.searchParams.get('version') ?? '1.0.0'
    if (url.pathname.endsWith('/files')) {
      return Response.json({
        version,
        namespace: 'demo',
        slug: 'example',
        count: 1,
        files: [{ path: 'SKILL.md', size: SKILL_FILES['SKILL.md']!.byteLength, sha256: sha256(SKILL_FILES['SKILL.md']!) }],
      })
    }
    if (url.pathname.endsWith('/file')) return new Response(new Uint8Array(SKILL_FILES['SKILL.md']!))
    if (url.pathname.endsWith('/versions')) return Response.json({ versions: [] })
    return Response.json({ latestVersion: { version }, skill: { displayName: 'Demo', summary_zh: '演示' } })
  }))
}

function harnessContext() {
  const registrations: Registration[] = []
  const emitted: string[] = []
  const ctx = {
    effect: (callback: () => unknown) => { callback() },
    emit: (event: string) => { emitted.push(event) },
    webServer: {
      register: (registration: Registration) => {
        registrations.push(registration)
        return () => {}
      },
    },
  } as unknown as Context
  return { ctx, registrations, emitted }
}

interface CallResult {
  status: number
  body: unknown
}

async function call(
  registration: Registration | undefined,
  options: {
    method?: string
    url?: string
    body?: unknown
    rawBody?: string
    owner?: boolean
  } = {},
): Promise<CallResult> {
  if (registration === undefined) throw new Error('route not registered')
  const owner = options.owner ?? true
  const payload = options.rawBody ?? (options.body === undefined ? '' : JSON.stringify(options.body))
  const req = {
    method: options.method ?? 'GET',
    url: options.url ?? registration.path,
    async *[Symbol.asyncIterator]() {
      if (payload !== '') yield Buffer.from(payload)
    },
  } as unknown as IncomingMessage
  let status = 0
  let text = ''
  const res = {
    set statusCode(value: number) { status = value },
    get statusCode() { return status },
    setHeader: () => res,
    end: (chunk?: string) => { text = chunk ?? '' },
  } as unknown as ServerResponse
  await registration.handler(req, res, owner ? { principal: { kind: 'owner' } } : { principal: { kind: 'guest' } })
  return { status: status === 0 ? 200 : status, body: text === '' ? undefined : JSON.parse(text) as unknown }
}

function routeOf(registrations: Registration[], path: string): Registration | undefined {
  return registrations.find(entry => entry.path === path)
}

const temporaryRoots: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function harness() {
  stubUpstream()
  const root = await mkdtemp(join(tmpdir(), 'skillhub-routes-'))
  temporaryRoots.push(root)
  const { ctx, registrations, emitted } = harnessContext()
  const config: Config = {
    apiBaseUrl: 'https://fixture.example',
    skillsRoot: join(root, 'skills'),
    disabledRoot: join(root, 'disabled'),
    ledgerPath: join(root, 'installed.json'),
    concurrency: 2,
    requestTimeoutMs: 5_000,
  }
  apply(ctx, config)
  return { registrations, emitted, root }
}

describe('sdkwork-skillhub plugin', () => {
  it('registers the five installer routes under one prefix', async () => {
    const { registrations } = await harness()
    expect(name).toBe('sdkwork-skillhub')
    expect(registrations.map(entry => entry.path).sort()).toEqual([
      '/sdkwork-skillhub/api/detail',
      '/sdkwork-skillhub/api/enabled',
      '/sdkwork-skillhub/api/install',
      '/sdkwork-skillhub/api/installed',
      '/sdkwork-skillhub/api/uninstall',
    ])
  })

  it('refuses callers that are not the owner and methods the route does not serve', async () => {
    const { registrations, emitted } = await harness()
    const installed = routeOf(registrations, SKILLHUB_INSTALLED_PATH)
    expect(await call(installed, { owner: false })).toMatchObject({ status: 403, body: { code: 'forbidden' } })
    expect(await call(routeOf(registrations, SKILLHUB_INSTALL_PATH), { method: 'GET' })).toMatchObject({ status: 405 })
    expect(emitted).toEqual([])
  })

  it('installs a skill through the route and emits skills/change', async () => {
    const { registrations, emitted, root } = await harness()
    const result = await call(routeOf(registrations, SKILLHUB_INSTALL_PATH), {
      method: 'POST',
      body: { packageKey: 'skillhub.demo/example' },
    })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ restartRequired: true, skill: { id: 'demo--example', version: '1.0.0', enabled: true } })
    expect(emitted).toEqual(['skills/change'])
    const installed = await call(routeOf(registrations, SKILLHUB_INSTALLED_PATH))
    expect(installed.body).toMatchObject({ skills: [{ id: 'demo--example' }] })
    void root
  })

  it('reports invalid requests instead of throwing', async () => {
    const { registrations } = await harness()
    const install = routeOf(registrations, SKILLHUB_INSTALL_PATH)
    expect(await call(install, { method: 'POST', rawBody: '{oops' })).toMatchObject({ status: 400, body: { code: 'invalid-request' } })
    expect(await call(install, { method: 'POST', body: {} })).toMatchObject({ status: 400, body: { code: 'invalid-request' } })
    expect(await call(install, { method: 'POST', body: { packageKey: 'skillhub.demo.dev' } }))
      .toMatchObject({ status: 400, body: { code: 'unsupported-coordinate' } })
  })
})
