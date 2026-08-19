import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'
import type { IamTokenStore } from '../src/client/iam-token-store.ts'
import { resetSdkworkGlobalTokenManager } from '../src/sdkwork-global-token-manager.ts'

const retrieve = vi.fn(async () => { throw new Error('offline') })

vi.mock('../src/client/iam-runtime.ts', () => ({
  createIamAuthRuntime: (options: { tokenStore: IamTokenStore }) => ({
    contextStore: { clear: async () => {} },
    tokenStore: options.tokenStore,
    service: {
      auth: {
        passwordResetRequests: { create: vi.fn() },
        passwordResets: { create: vi.fn() },
        registrations: { create: vi.fn() },
        sessions: {
          create: vi.fn(),
          refresh: vi.fn(),
          current: {
            delete: vi.fn(),
            retrieve,
            update: vi.fn(),
          },
          loginContextSelection: { create: vi.fn() },
          organizationSelection: { create: vi.fn() },
        },
      },
      iam: { users: { current: { retrieve: vi.fn() } } },
      oauth: {},
      system: { iam: { verificationPolicy: { retrieve: vi.fn() } } },
    },
  }),
}))

import { IamService } from '../src/client/iam-service.ts'

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
    apiBaseUrl: () => 'https://iam.example',
    appId: () => 'sdkwork-birdcoder',
    appKey: () => 'sdkwork-birdcoder',
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

describe('IamService bootstrap persistence', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    resetSdkworkGlobalTokenManager()
    storage.clear()
    retrieve.mockClear()
    globalThis.localStorage = {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value) },
      removeItem: (key) => { storage.delete(key) },
      clear: () => { storage.clear() },
      key: () => null,
      length: 0,
    } as Storage
  })

  it('restores a persisted session when bootstrap validation clears storage', async () => {
    storage.set('dsh.iam.session', JSON.stringify({
      accessToken: 'at',
      authToken: 'auth',
      user: { id: 'u1', displayName: 'Bird' },
    }))
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.bootstrap()
    expect(retrieve).toHaveBeenCalledTimes(1)
    expect(service.controller.getState().isAuthenticated).toBe(true)
    expect(service.controller.getState().user).toEqual({ id: 'u1', displayName: 'Bird' })
    expect(storage.get('dsh.iam.session')).toContain('"authToken":"auth"')
  })
})
