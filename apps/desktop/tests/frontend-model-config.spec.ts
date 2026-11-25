import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  IAM_FRONTEND_MODEL_CONFIG_FILENAME,
  iamFrontendModelConfigPath,
  writeFrontendModelConfigProjection,
} from '../src/frontend-model-config.ts'
import { IAM_SESSION_VERSION, type IamSessionRecord } from '../src/iam-session-protocol.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function tempSession(): Promise<{ dir: string; sessionPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-desktop-frontend-model-config-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return { dir, sessionPath: join(dir, 'session.json') }
}

function session(): IamSessionRecord {
  return {
    version: IAM_SESSION_VERSION,
    authToken: 'auth-token',
    accessToken: 'access-token',
    savedAt: '2026-11-23T00:00:00Z',
  }
}

function document(): Record<string, unknown> {
  return {
    revision: 5,
    channels: [{
      channelCode: 'llm',
      enabled: true,
      sortOrder: 10,
      capabilityCodes: ['chat'],
      models: [{ catalogKey: 'vendor/model', visible: true, sortOrder: 10 }],
    }],
  }
}

describe('front-end model configuration projection', () => {
  it('writes the document beside the session with both tokens on the wire', async () => {
    const { sessionPath } = await tempSession()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify(document()),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const written = await writeFrontendModelConfigProjection(sessionPath, session(), {
      endpoint: 'https://api.example.com/app/v3/api/ai/frontend_config',
      fetch: fetchMock,
      now: () => new Date('2026-11-23T01:00:00Z'),
    })
    expect(written).toBe(true)
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer auth-token')
    expect(headers.get('access-token')).toBe('access-token')
    const raw = JSON.parse(await readFile(iamFrontendModelConfigPath(sessionPath), 'utf8')) as {
      version: number
      savedAt: string
      document: { revision: number }
    }
    expect(raw.version).toBe(1)
    expect(raw.savedAt).toBe('2026-11-23T01:00:00.000Z')
    expect(raw.document.revision).toBe(5)
    expect(iamFrontendModelConfigPath(sessionPath).endsWith(IAM_FRONTEND_MODEL_CONFIG_FILENAME)).toBe(true)
  })

  it('keeps the previous projection when the gateway rejects or fails', async () => {
    const { sessionPath } = await tempSession()
    const target = iamFrontendModelConfigPath(sessionPath)
    await writeFile(target, '{"version":1,"document":{"revision":4,"channels":[]}}\n', 'utf8')
    const rejected = await writeFrontendModelConfigProjection(sessionPath, session(), {
      endpoint: 'https://api.example.com/app/v3/api/ai/frontend_config',
      fetch: vi.fn(async () => new Response('{}', { status: 401 })),
    })
    expect(rejected).toBe(false)
    expect(await readFile(target, 'utf8')).toContain('"revision":4')
  })

  it('rejects a document without channels', async () => {
    const { sessionPath } = await tempSession()
    const written = await writeFrontendModelConfigProjection(sessionPath, session(), {
      endpoint: 'https://api.example.com/app/v3/api/ai/frontend_config',
      fetch: vi.fn(async () => new Response('{"revision":1}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    })
    expect(written).toBe(false)
  })

  it('does nothing when the projection is disabled', async () => {
    const { sessionPath } = await tempSession()
    const fetchMock = vi.fn()
    const written = await writeFrontendModelConfigProjection(sessionPath, session(), {
      endpoint: '',
      fetch: fetchMock,
    })
    expect(written).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
