// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'

const desktop = {
  begin: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  isWaiting: vi.fn(() => false),
  subscribe: vi.fn(() => () => {}),
  completePendingCallbackFromLaunch: vi.fn(async () => false),
  dispose: vi.fn(),
}

vi.mock('../src/client/iam-desktop.ts', () => ({
  createIamDesktopLogin: vi.fn(() => desktop),
  readSdkworkDesktopBridge: vi.fn(() => {
    const value = (globalThis as { sdkworkDesktop?: unknown }).sdkworkDesktop
    return value === undefined ? undefined : value
  }),
}))

import { IamService } from '../src/client/iam-service.ts'
import { createIamDesktopLogin } from '../src/client/iam-desktop.ts'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'

const BRIDGE: SdkworkDesktopBridgeShape = {
  deepLinks: { getInitialUrl: async () => null, onOpenUrl: () => () => {} },
  shellOpen: { open: async () => {} },
}

function scopeOf(): SettingsScope<UiIamSettings> {
  const value: UiIamSettings = { ...DEFAULT_UI_IAM_SETTINGS }
  return {
    getSnapshot: () => ({ status: 'ready' as const, value, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' as const }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
}

/**
 * Environment service stand-in: the base class resolves the profile from a
 * settings scope, so the spec overrides only the active-profile reads it
 * exercises. A structural stub would need a cast past EnvService's private
 * state, which the repository forbids for new code.
 */
class StubEnvService extends EnvService {
  constructor(private readonly configuredBaseUrl: string) {
    super({
      getSnapshot: () => ({
        status: 'unavailable' as const,
        value: undefined,
        base: undefined,
        user: undefined,
        revision: undefined,
        writable: false,
      }),
      subscribe: () => () => {},
      mutate: async () => false,
      set: async () => false,
      unset: async () => false,
    })
  }

  override isConfigured(): boolean {
    return this.configuredBaseUrl.trim() !== ''
  }

  override apiBaseUrl(): string {
    return this.configuredBaseUrl
  }

  override appId(): string {
    return 'sdkwork-birdcoder'
  }

  override appKey(): string {
    return 'sdkwork-birdcoder'
  }

  override accessToken(): string {
    return ''
  }
}

function envOf(apiBaseUrl: string): EnvService {
  return new StubEnvService(apiBaseUrl)
}

function layoutOf(): ILayout {
  return { toggleSidebar: vi.fn(), setSidebarVisible: vi.fn(), openDetails: vi.fn(), closeDetails: vi.fn(), setMode: vi.fn() }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sdkworkDesktop')
  Reflect.deleteProperty(globalThis, '__DSH_OEM__')
  Reflect.deleteProperty(globalThis, '__DSH_IAM_SIGN_IN__')
  vi.clearAllMocks()
})

describe('IamService desktop browser login', () => {
  it('is unavailable in a plain page and available with the preload bridge', () => {
    expect(new IamService(scopeOf(), envOf('https://api.example'), layoutOf()).browserSignInAvailable()).toBe(false)
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    expect(new IamService(scopeOf(), envOf('https://api.example'), layoutOf()).browserSignInAvailable()).toBe(true)
  })

  it('consumes the welcome sign-in request and starts the browser flow', async () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    Reflect.set(globalThis, '__DSH_IAM_SIGN_IN__', true)
    const service = new IamService(scopeOf(), envOf('https://api.example'), layoutOf())
    await service.startPendingBrowserSignIn()
    expect(desktop.begin).toHaveBeenCalledTimes(1)
    expect(Reflect.get(globalThis, '__DSH_IAM_SIGN_IN__')).toBeUndefined()
  })

  it('starts the hosted authorize flow with the OEM origins and commits the redeemed session', async () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    Reflect.set(globalThis, '__DSH_OEM__', {
      sdkwork: { iamBaseUrl: 'https://api.oem.test', iamAuthorizeBaseUrl: 'https://platform.oem.test' },
    })
    const service = new IamService(scopeOf(), envOf('https://env.example'), layoutOf())
    await service.beginBrowserSignIn()
    expect(createIamDesktopLogin).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.oem.test',
      baseUrl: 'https://api.oem.test',
    }))
    expect(desktop.begin).toHaveBeenCalledTimes(1)

    const options = vi.mocked(createIamDesktopLogin).mock.calls[0][0]
    await options.onSession({
      accessToken: 'access',
      authToken: 'auth',
      refreshToken: 'refresh',
      user: { id: 'u1', email: 'a@example.com', displayName: 'A User' },
    })
    expect(service.isSignedIn()).toBe(true)
    expect(JSON.parse(localStorage.getItem('dsh.iam.session') ?? '{}')).toMatchObject({
      accessToken: 'access', authToken: 'auth', refreshToken: 'refresh',
    })
  })

  it('presents the OEM OAuth client and deep-link callback instead of the shipped ones', async () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    Reflect.set(globalThis, '__DSH_OEM__', {
      sdkwork: {
        iamBaseUrl: 'https://api.oem.test',
        iamAuthorizeBaseUrl: 'https://platform.oem.test',
        iamClientId: 'acme-coder',
        iamRedirectUri: 'acme://auth/callback',
      },
    })
    const service = new IamService(scopeOf(), envOf('https://env.example'), layoutOf())
    await service.beginBrowserSignIn()
    expect(createIamDesktopLogin).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'acme-coder',
      redirectUri: 'acme://auth/callback',
    }))
  })
})
