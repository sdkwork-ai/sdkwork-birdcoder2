// @vitest-environment jsdom
/**
 * Durable-session recovery regression: the Harness-home copy is the source of
 * truth across restarts. A boot whose browser copy is gone restores from it; a
 * transient validation failure re-persists it instead of signing the user out;
 * and a token rotation writes the new pair back so the next launch still has
 * the current session.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '../src/sdkwork-global-token-manager.ts'

const SESSION = {
  authToken: 'auth.1',
  accessToken: 'access.1',
  refreshToken: 'refresh.1',
  sessionId: 'session-1',
  context: { tenantId: '100001', organizationId: '0', loginScope: 'TENANT' },
  user: { id: 'user-1', email: 'bird@example.test', displayName: 'Bird User' },
}

const ROTATED = {
  ...SESSION,
  authToken: 'auth.2',
  accessToken: 'access.2',
  refreshToken: 'refresh.2',
}

let retrieveImpl: () => Promise<unknown> = async () => SESSION
let refreshImpl: () => Promise<unknown> = async () => ROTATED

const client = {
  auth: {
    sessions: {
      create: vi.fn(async () => SESSION),
      refresh: vi.fn(async () => refreshImpl()),
      current: {
        delete: vi.fn(async () => undefined),
        retrieve: vi.fn(async () => retrieveImpl()),
        update: vi.fn(async () => SESSION),
      },
    },
  },
  oauth: {
    desktopSessions: { create: vi.fn(async () => SESSION) },
  },
  setTokenManager: vi.fn(() => client),
}

vi.mock('@sdkwork/iam-app-sdk', () => ({
  createClient: vi.fn(() => client),
}))

import { IamService } from '../src/client/iam-service.ts'

let durableRecord: unknown = null

function installDesktopBridge(): void {
  ;(globalThis as Record<string, unknown>).sdkworkDesktop = {
    deepLinks: {
      getInitialUrl: async () => null,
      onOpenUrl: () => () => {},
    },
    shellOpen: { open: async () => {} },
    iamSession: {
      read: async () => durableRecord,
      save: async (session: unknown) => { durableRecord = session },
      clear: async () => { durableRecord = null },
    },
  }
}

function scopeOf(): SettingsScope<UiIamSettings> {
  return {
    getSnapshot: () => ({
      status: 'ready' as const,
      value: DEFAULT_UI_IAM_SETTINGS,
      base: undefined,
      user: undefined,
      revision: 1,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
}

function envOf(): EnvService {
  return {
    isConfigured: () => true,
    apiBaseUrl: () => 'https://api.example.test',
    appId: () => 'birdcoder',
    appKey: () => 'birdcoder',
    accessToken: () => '',
    subscribe: () => () => {},
  } as unknown as EnvService
}

function layoutOf(): ILayout {
  return {
    toggleSidebar: vi.fn(),
    setSidebarVisible: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setMode: vi.fn(),
  }
}

function storedCopy(storage: Map<string, string>): Record<string, unknown> {
  return JSON.parse(storage.get('dsh.iam.session') ?? '{}') as Record<string, unknown>
}

describe('durable IAM session recovery', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    resetSdkworkGlobalTokenManager()
    storage.clear()
    durableRecord = { ...SESSION }
    retrieveImpl = async () => SESSION
    refreshImpl = async () => ROTATED
    client.auth.sessions.current.retrieve.mockClear()
    client.auth.sessions.refresh.mockClear()
    globalThis.localStorage = {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value) },
      removeItem: (key) => { storage.delete(key) },
      clear: () => { storage.clear() },
      key: () => null,
      length: 0,
    } as Storage
    installDesktopBridge()
  })

  it('restores a session from the Harness home when the browser copy is gone', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.bootstrap()

    expect(service.isSignedIn()).toBe(true)
    expect(storedCopy(storage)).toMatchObject({ authToken: 'auth.1', accessToken: 'access.1' })
    expect(getSdkworkGlobalTokenManager().getTokens()).toMatchObject({
      authToken: 'auth.1',
      accessToken: 'access.1',
      refreshToken: 'refresh.1',
    })
    // Validation still runs against the IAM app-api using the restored tokens.
    expect(client.auth.sessions.current.retrieve).toHaveBeenCalled()
  })

  it('keeps the durable session across a transient validation failure', async () => {
    retrieveImpl = async () => { throw new Error('network down') }
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.bootstrap()

    expect(service.isSignedIn()).toBe(true)
    expect(durableRecord).toMatchObject({ authToken: 'auth.1', accessToken: 'access.1' })
    expect(storedCopy(storage)).toMatchObject({ authToken: 'auth.1', accessToken: 'access.1' })
    expect(getSdkworkGlobalTokenManager().getTokens()).toMatchObject({
      authToken: 'auth.1',
      accessToken: 'access.1',
    })
  })

  it('writes a rotated token pair back to the durable copy', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.bootstrap()
    expect(service.isSignedIn()).toBe(true)

    const refreshed = await service.controller.refreshSession()
    expect(client.auth.sessions.refresh).toHaveBeenCalled()
    expect(refreshed.accessToken).toBe('access.2')
    expect(durableRecord).toMatchObject({
      authToken: 'auth.2',
      accessToken: 'access.2',
      refreshToken: 'refresh.2',
    })
    expect(storedCopy(storage)).toMatchObject({ authToken: 'auth.2', accessToken: 'access.2' })
    expect(getSdkworkGlobalTokenManager().getTokens()).toMatchObject({
      authToken: 'auth.2',
      accessToken: 'access.2',
      refreshToken: 'refresh.2',
    })
  })

  it('clears the durable copy when the session is signed out', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.bootstrap()
    await service.controller.signOut()

    expect(durableRecord).toBeNull()
    expect(storage.has('dsh.iam.session')).toBe(false)
    expect(service.isSignedIn()).toBe(false)
  })
})
