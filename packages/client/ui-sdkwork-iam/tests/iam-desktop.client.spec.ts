import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'

const runtime = {
  beginLogin: vi.fn(async () => ({ authorizeUrl: 'https://platform.example/iam/oauth/authorize' })),
  cancelLogin: vi.fn(async () => {}),
  completePendingCallbackFromLaunch: vi.fn(async () => false),
  controller: { isWaiting: vi.fn(() => true), subscribe: vi.fn(() => () => {}) },
  dispose: vi.fn(),
}

const request = vi.fn(async () => ({ accessToken: 'access', authToken: 'auth' }))

vi.mock('@sdkwork/iam-app-sdk', () => ({
  appApiPath: (path: string) => `/app/v3/api${path}`,
  createClient: vi.fn(() => ({ http: { request } })),
}))
vi.mock('@sdkwork/iam-desktop-auth', () => ({
  createSdkworkIamDesktopAuthRuntime: vi.fn(() => runtime),
}))

import { createClient } from '@sdkwork/iam-app-sdk'
import { createSdkworkIamDesktopAuthRuntime } from '@sdkwork/iam-desktop-auth'
import { createIamDesktopLogin, readSdkworkDesktopBridge } from '../src/client/iam-desktop.ts'

function bridge(): SdkworkDesktopBridgeShape {
  return {
    deepLinks: {
      getInitialUrl: async () => 'birdcoder://auth/callback?code=c&state=s',
      onOpenUrl: () => () => {},
    },
    shellOpen: { open: async () => {} },
  }
}

const tokenManager = {} as never

beforeEach(() => {
  request.mockClear()
})

describe('readSdkworkDesktopBridge', () => {
  it('accepts the standard preload shape and rejects incomplete globals', () => {
    Reflect.set(globalThis, 'sdkworkDesktop', bridge())
    try {
      expect(readSdkworkDesktopBridge()).toBeDefined()
      Reflect.set(globalThis, 'sdkworkDesktop', { deepLinks: {} })
      expect(readSdkworkDesktopBridge()).toBeUndefined()
      Reflect.set(globalThis, 'sdkworkDesktop', null)
      expect(readSdkworkDesktopBridge()).toBeUndefined()
    } finally {
      Reflect.deleteProperty(globalThis, 'sdkworkDesktop')
    }
  })
})

describe('createIamDesktopLogin', () => {
  it('binds the generated PC client, the pending-flow window, and the upstream runtime to the bridge', async () => {
    const onSession = vi.fn()
    const input = bridge()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: input,
      flowTtlMs: 270_000,
      onSession,
    })

    expect(createClient).toHaveBeenCalledWith({
      authMode: 'dual-token',
      baseUrl: 'https://api.birdcoder.com',
      platform: 'pc',
      tokenManager,
    })
    expect(createSdkworkIamDesktopAuthRuntime).toHaveBeenCalledTimes(1)
    const runtimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls[0][0]
    expect(runtimeOptions.appId).toBe('birdcoder')
    expect(runtimeOptions.redirectUri).toBe('birdcoder://auth/callback')
    expect(runtimeOptions.authorizeBaseUrl).toBe('https://platform.birdcoder.com')
    expect(runtimeOptions.flowTtlMs).toBe(270_000)
    expect(runtimeOptions.host.id).toBe('electron')
    expect(runtimeOptions.onSession).toBe(onSession)

    await login.begin()
    expect(runtime.beginLogin).toHaveBeenCalledTimes(1)
    expect(login.isWaiting()).toBe(true)
    await login.cancel()
    expect(runtime.cancelLogin).toHaveBeenCalledTimes(1)
    expect(await login.completePendingCallbackFromLaunch()).toBe(false)
    login.dispose()
    expect(runtime.dispose).toHaveBeenCalledTimes(1)
  })

  it('redeems a code at most once, through the generated transport with retries disabled', async () => {
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: bridge(),
      onSession: vi.fn(),
    })
    const runtimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0]
    const create = runtimeOptions.appSdkClient.oauth?.desktopSessions?.create
    expect(create).toBeDefined()

    const command = {
      authorizationCode: 'sdkwork-oauth_code-single',
      clientId: 'birdcoder',
      codeVerifier: 'verifier',
      redirectUri: 'birdcoder://auth/callback',
    }
    const first = await create!(command)
    const second = await create!(command)

    // A single-use code: the transport sees one POST, and a repeat delivery of
    // the same deep link observes that request's outcome.
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/app/v3/api/oauth/desktop_sessions', {
      method: 'POST',
      contentType: 'application/json',
      skipAuth: true,
      sdkworkUnwrapKind: 'data',
      retry: { maxRetries: 0 },
      body: command,
    })
    expect(first).toBe(second)

    // A different code is a different login attempt and redeems on its own.
    await create!({ ...command, authorizationCode: 'sdkwork-oauth_code-next' })
    expect(request).toHaveBeenCalledTimes(2)
    login.dispose()
  })
})
