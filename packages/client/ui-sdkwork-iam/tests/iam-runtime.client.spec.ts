import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createIamAuthRuntime } from '../src/client/iam-runtime.ts'
import { createIamTokenStore, type IamStorageLike } from '../src/client/iam-token-store.ts'
import type { SdkworkAppClient } from '@sdkwork/iam-app-sdk'

/** Stub of the generated client capturing SDK call wiring. */
function clientStub() {
  const fns = {
    sessionCreate: vi.fn(),
    sessionCurrentDelete: vi.fn(),
    sessionCurrentRetrieve: vi.fn(),
    registrationCreate: vi.fn(),
    passwordResetRequestCreate: vi.fn(),
    iamUserCurrentRetrieve: vi.fn(),
    verificationPolicyRetrieve: vi.fn(),
  }
  const stub = {
    auth: {
      passwordResetRequests: { create: fns.passwordResetRequestCreate },
      passwordResets: { create: vi.fn() },
      registrations: { create: fns.registrationCreate },
      sessions: {
        create: fns.sessionCreate,
        refresh: vi.fn(),
        current: { delete: fns.sessionCurrentDelete, retrieve: fns.sessionCurrentRetrieve, update: vi.fn() },
        loginContextSelection: { create: vi.fn() },
        organizationSelection: { create: vi.fn() },
      },
    },
    iam: { users: { current: { retrieve: fns.iamUserCurrentRetrieve } } },
    oauth: {
      authorizationUrls: { create: vi.fn() },
      authorizations: { completions: { create: vi.fn() } },
      deviceAuthorizations: {
        create: vi.fn(),
        passwordCompletions: { create: vi.fn() },
        retrieve: vi.fn(),
        scans: { create: vi.fn() },
        sessionCompletions: { create: vi.fn() },
        sessionExchanges: { create: vi.fn() },
      },
      providers: { list: vi.fn() },
      scanLoginModes: { list: vi.fn() },
      sessions: { create: vi.fn() },
    },
    system: { iam: { verificationPolicy: { retrieve: fns.verificationPolicyRetrieve } } },
  } as unknown as SdkworkAppClient
  return { stub, fns }
}

const tokenManagerStub = () =>
  ({
    getAccessToken: () => undefined,
    getAuthToken: () => undefined,
    getRefreshToken: () => undefined,
    getTokens: () => ({}),
    setTokens: vi.fn(),
    setAccessToken: vi.fn(),
    setAuthToken: vi.fn(),
    setRefreshToken: vi.fn(),
    clearTokens: vi.fn(),
    clearAuthToken: vi.fn(),
    clearAccessToken: vi.fn(),
    isExpired: () => false,
    isValid: () => true,
    hasToken: () => false,
    hasAuthToken: () => false,
    hasAccessToken: () => false,
    willExpireIn: () => false,
  }) as any

vi.mock('@sdkwork/iam-app-sdk', () => ({
  createClient: vi.fn(() => clientStub().stub),
}))

import { createClient } from '@sdkwork/iam-app-sdk'

function storage(): IamStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
  }
}

describe('createIamAuthRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the dual-token client for the configured base URL', () => {
    const tokenManager = tokenManagerStub()
    createIamAuthRuntime({
      baseUrl: 'https://iam.example',
      tokenStore: createIamTokenStore({ storageKey: 'k', storage: storage() }),
      tokenManager,
    })
    expect(createClient).toHaveBeenCalledWith({
      authMode: 'dual-token',
      baseUrl: 'https://iam.example',
      platform: 'pc',
      tokenManager,
    })
  })

  it('maps the required service surface onto the client methods', async () => {
    const { stub, fns } = clientStub()
    vi.mocked(createClient).mockReturnValue(stub)
    const tokenManager = tokenManagerStub()
    const runtime = createIamAuthRuntime({
      baseUrl: 'https://iam.example',
      tokenStore: createIamTokenStore({ storageKey: 'k', storage: storage() }),
      tokenManager,
    })

    await runtime.service.auth.sessions.create({ username: 'u', password: 'p' })
    expect(fns.sessionCreate).toHaveBeenCalledWith({ username: 'u', password: 'p' })
    await runtime.service.auth.registrations.create({ email: 'e@example.com' })
    expect(fns.registrationCreate).toHaveBeenCalledWith({ email: 'e@example.com' })
    await runtime.service.auth.sessions.current.retrieve()
    expect(fns.sessionCurrentRetrieve).toHaveBeenCalledTimes(1)
    await runtime.service.auth.sessions.current.delete()
    expect(fns.sessionCurrentDelete).toHaveBeenCalledTimes(1)
    await runtime.service.auth.passwordResetRequests.create({ email: 'e@example.com' })
    expect(fns.passwordResetRequestCreate).toHaveBeenCalledTimes(1)
    await runtime.service.iam.users.current.retrieve()
    expect(fns.iamUserCurrentRetrieve).toHaveBeenCalledTimes(1)
    await runtime.service.system?.iam?.verificationPolicy?.retrieve?.()
    expect(fns.verificationPolicyRetrieve).toHaveBeenCalledTimes(1)
  })

  it('syncs token manager tokens from token store reads and writes', async () => {
    const { setTokens, clearTokens } = tokenManagerStub()
    const backing = storage()
    const tokenStore = createIamTokenStore({ storageKey: 'dsh.iam.session', storage: backing })
    const tokenManager = tokenManagerStub()

    vi.mocked(createClient).mockReturnValue(clientStub().stub)
    const runtime = createIamAuthRuntime({ baseUrl: 'https://iam.example', tokenStore, tokenManager })

    await runtime.tokenStore.set({ accessToken: 'at', authToken: 'auth' })
    expect(tokenManager.setTokens).toHaveBeenCalledWith({ accessToken: 'at', authToken: 'auth', refreshToken: undefined })
    expect(clearTokens).not.toHaveBeenCalled()

    ;(tokenManager.setTokens as any).mockClear()
    await runtime.tokenStore.get()
    expect(tokenManager.setTokens).toHaveBeenCalledWith({ accessToken: 'at', authToken: 'auth', refreshToken: undefined })
  })

  it('clears stored session through token store and clears token manager tokens', async () => {
    const tokenManager = tokenManagerStub()
    const backing = storage()
    backing.setItem('dsh.iam.session', JSON.stringify({ accessToken: 'at' }))
    const tokenStore = createIamTokenStore({ storageKey: 'dsh.iam.session', storage: backing })
    vi.mocked(createClient).mockReturnValue(clientStub().stub)

    const runtime = createIamAuthRuntime({ baseUrl: 'https://iam.example', tokenStore, tokenManager })
    await runtime.tokenStore.clear()

    expect(backing.data.has('dsh.iam.session')).toBe(false)
    expect(tokenManager.clearTokens).toHaveBeenCalledTimes(1)
  })
})
