import { describe, expect, it, vi } from 'vitest'
import type { SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'

const runtime = {
  beginLogin: vi.fn(async () => ({ authorizeUrl: 'https://platform.example/iam/v3/oauth/authorize' })),
  cancelLogin: vi.fn(async () => {}),
  completePendingCallbackFromLaunch: vi.fn(async () => false),
  controller: { isWaiting: vi.fn(() => true), subscribe: vi.fn(() => () => {}) },
  dispose: vi.fn(),
}

vi.mock('@sdkwork/iam-app-sdk', () => ({
  createClient: vi.fn(() => ({})),
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
  it('binds the generated PC client and the upstream desktop runtime to the bridge', async () => {
    const onSession = vi.fn()
    const input = bridge()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: input,
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
})
