import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IAM_SESSION_BRIDGE,
  IAM_SESSION_VERSION,
  clearIamSessionFile,
  createIamSessionBridge,
  iamSessionPath,
  normalizeIamSession,
  readIamSessionFile,
  writeIamSessionFile,
} from '../src/iam-session.ts'

const homes: string[] = []

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-iam-session-'))
  homes.push(home)
  return home
}

function fakeIpc() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => { handlers.set(channel, handler) }),
    removeHandler: vi.fn((channel: string) => { handlers.delete(channel) }),
  }
}

const SESSION = {
  authToken: 'auth-token',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  sessionId: 'session-1',
  expiresAt: 1_900_000_000_000,
  user: { id: 'user-1', displayName: 'Bird' },
  context: { tenantId: '100001', organizationId: '0', loginScope: 'TENANT' },
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('durable IAM session file', () => {
  it('lives under the Harness home iam directory', () => {
    const home = tempHome()
    expect(iamSessionPath(home)).toBe(join(home, 'iam', 'session.json'))
  })

  it('requires the complete dual-token session and drops unknown fields', () => {
    const record = normalizeIamSession({ ...SESSION, savedAt: '2026-11-01T00:00:00.000Z', extra: 'ignored' })
    expect(record).toEqual({
      version: IAM_SESSION_VERSION,
      ...SESSION,
      savedAt: '2026-11-01T00:00:00.000Z',
    })
    expect(normalizeIamSession({ ...SESSION, authToken: '   ' })).toBeUndefined()
    expect(normalizeIamSession({ ...SESSION, accessToken: undefined })).toBeUndefined()
    expect(normalizeIamSession(null)).toBeUndefined()
    expect(normalizeIamSession([])).toBeUndefined()
  })

  it('round-trips a complete session through the file', () => {
    const home = tempHome()
    const path = iamSessionPath(home)
    const record = normalizeIamSession(SESSION)!
    writeIamSessionFile(path, record)
    expect(readIamSessionFile(path)).toEqual(record)
    // The JSON on disk carries both tokens, which is what a Host-side reader
    // (or the CLI) needs to authenticate without the browser profile.
    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(onDisk.authToken).toBe('auth-token')
    expect(onDisk.accessToken).toBe('access-token')
    expect(onDisk.refreshToken).toBe('refresh-token')
  })

  it('replaces the previous session without leaving a temporary file', () => {
    const home = tempHome()
    const path = iamSessionPath(home)
    writeIamSessionFile(path, normalizeIamSession(SESSION)!)
    writeIamSessionFile(path, normalizeIamSession({ ...SESSION, authToken: 'auth-2', accessToken: 'access-2' })!)
    expect(readIamSessionFile(path)?.authToken).toBe('auth-2')
    expect(readIamSessionFile(path)?.accessToken).toBe('access-2')
    expect(readdirSync(join(home, 'iam'))).toEqual(['session.json'])
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true)
  })

  it('treats an absent, corrupted, or incomplete file as no session', () => {
    const home = tempHome()
    const path = iamSessionPath(home)
    expect(readIamSessionFile(path)).toBeUndefined()
    mkdirSync(join(home, 'iam'), { recursive: true })
    writeFileSync(path, '{not json', 'utf8')
    expect(readIamSessionFile(path)).toBeUndefined()
    writeFileSync(path, JSON.stringify({ accessToken: 'only' }), 'utf8')
    expect(readIamSessionFile(path)).toBeUndefined()
  })

  it('clears the file and tolerates an absent one', () => {
    const home = tempHome()
    const path = iamSessionPath(home)
    writeIamSessionFile(path, normalizeIamSession(SESSION)!)
    clearIamSessionFile(path)
    expect(readIamSessionFile(path)).toBeUndefined()
    expect(() => { clearIamSessionFile(path) }).not.toThrow()
  })
})

describe('createIamSessionBridge', () => {
  it('guards, saves, reads, and clears the durable session over IPC', () => {
    const home = tempHome()
    const ipcMain = fakeIpc()
    const assertSender = vi.fn()
    const bridge = createIamSessionBridge({ home, ipcMain, assertSender })

    const save = ipcMain.handlers.get(IAM_SESSION_BRIDGE.save)!
    const read = ipcMain.handlers.get(IAM_SESSION_BRIDGE.read)!
    const clear = ipcMain.handlers.get(IAM_SESSION_BRIDGE.clear)!

    expect(read({})).toBeNull()
    expect(() => save({}, { accessToken: 'access-only' })).toThrow(/authToken \+ accessToken/u)
    expect(save({}, SESSION)).toMatchObject({ authToken: 'auth-token', accessToken: 'access-token' })
    expect(read({})).toMatchObject({ authToken: 'auth-token', accessToken: 'access-token' })
    // Every IPC call, including the one the validation rejected, was guarded.
    expect(assertSender).toHaveBeenCalledTimes(4)

    clear({})
    expect(assertSender).toHaveBeenCalledTimes(5)
    expect(read({})).toBeNull()
    expect(bridge.read()).toBeUndefined()
    expect(bridge.path).toBe(iamSessionPath(home))

    bridge.dispose()
    expect(ipcMain.handlers.size).toBe(0)
  })
})
