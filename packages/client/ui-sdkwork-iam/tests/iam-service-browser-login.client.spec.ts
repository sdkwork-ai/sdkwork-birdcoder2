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
  readSdkworkDesktopIamSessionBridge: vi.fn(() => {
    const value = (globalThis as { sdkworkDesktop?: { iamSession?: unknown } }).sdkworkDesktop?.iamSession
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

function scopeOf(initial: Partial<UiIamSettings> = {}): SettingsScope<UiIamSettings> {
  const value: UiIamSettings = { ...DEFAULT_UI_IAM_SETTINGS, ...initial }
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

  it('consumes the welcome sign-in request through the in-app surface without the deep-link bridge', async () => {
    Reflect.set(globalThis, '__DSH_IAM_SIGN_IN__', true)
    const service = new IamService(scopeOf(), envOf('https://api.example'), layoutOf())
    const openLogin = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin, openBrowser: vi.fn(), close: vi.fn() })
    await service.startPendingSignIn()
    // No desktop bridge, so the deep link could never return: the gesture
    // degrades to the account methods.
    expect(openLogin).toHaveBeenCalledTimes(1)
    expect(desktop.begin).not.toHaveBeenCalled()
    expect(Reflect.get(globalThis, '__DSH_IAM_SIGN_IN__')).toBeUndefined()
  })

  it('skips the sign-in surface when a session is already restored', async () => {
    Reflect.set(globalThis, '__DSH_IAM_SIGN_IN__', true)
    const service = new IamService(scopeOf(), envOf('https://api.example'), layoutOf())
    service.controller.applySession({ accessToken: 'access', authToken: 'auth', user: { id: 'u1' } })
    const openLogin = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin, openBrowser: vi.fn(), close: vi.fn() })
    await service.startPendingSignIn()
    expect(openLogin).not.toHaveBeenCalled()
    expect(service.isSignedIn()).toBe(true)
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

  it('hands the login panel gesture to the browser by default', async () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    const service = new IamService(scopeOf(), envOf('https://api.example'), layoutOf())
    const openBrowser = vi.fn()
    const openLogin = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin, openBrowser, close: vi.fn() })

    // The hand-off card appears first, then the hosted page opens in the
    // system browser; the in-app methods stay untouched.
    service.startSignIn()
    expect(openBrowser).toHaveBeenCalledTimes(1)
    expect(openLogin).not.toHaveBeenCalled()
    await vi.waitFor(() => { expect(desktop.begin).toHaveBeenCalledTimes(1) })
  })

  it('hands the login panel gesture to the browser when configured', async () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    const service = new IamService(scopeOf({ signInMethod: 'browser' }), envOf('https://api.example'), layoutOf())
    const openBrowser = vi.fn()
    const openLogin = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin, openBrowser, close: vi.fn() })

    service.startSignIn()
    // The hand-off card appears first, then the hosted page opens in the
    // system browser; the in-app methods stay untouched.
    expect(openBrowser).toHaveBeenCalledTimes(1)
    expect(openLogin).not.toHaveBeenCalled()
    await vi.waitFor(() => { expect(desktop.begin).toHaveBeenCalledTimes(1) })
  })

  it('raises the in-app account methods when the login gesture is configured as the popup', () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    const service = new IamService(scopeOf({ signInMethod: 'modal' }), envOf('https://api.example'), layoutOf())
    const openBrowser = vi.fn()
    const openLogin = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin, openBrowser, close: vi.fn() })

    service.startSignIn()
    expect(openLogin).toHaveBeenCalledTimes(1)
    expect(openBrowser).not.toHaveBeenCalled()
    expect(desktop.begin).not.toHaveBeenCalled()
  })

  it('falls back to the in-app account methods where no deep link can return', () => {
    const service = new IamService(scopeOf({ signInMethod: 'browser' }), envOf('https://api.example'), layoutOf())
    const openBrowser = vi.fn()
    const openLogin = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin, openBrowser, close: vi.fn() })

    service.startSignIn()
    expect(openLogin).toHaveBeenCalledTimes(1)
    expect(openBrowser).not.toHaveBeenCalled()
  })

  it('flags a failed hand-off so the card can offer recovery', async () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    desktop.begin.mockRejectedValueOnce(new Error('no browser'))
    const service = new IamService(scopeOf({ signInMethod: 'browser' }), envOf('https://api.example'), layoutOf())
    service.attachModal({ openEntry: vi.fn(), openLogin: vi.fn(), openBrowser: vi.fn(), close: vi.fn() })

    service.startSignIn()
    await vi.waitFor(() => { expect(service.browserSignInFailed()).toBe(true) })
    // Retrying clears the failure and opens the browser again.
    desktop.begin.mockResolvedValueOnce(undefined)
    service.startBrowserSignIn()
    await vi.waitFor(() => { expect(service.browserSignInFailed()).toBe(false) })
    expect(desktop.begin).toHaveBeenCalledTimes(2)
  })

  it('closes the hand-off card once the redeemed session lands', async () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    const service = new IamService(scopeOf(), envOf('https://api.example'), layoutOf())
    const close = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin: vi.fn(), openBrowser: vi.fn(), close })
    await service.beginBrowserSignIn()

    const options = vi.mocked(createIamDesktopLogin).mock.calls[0][0]
    await options.onSession({ accessToken: 'access', authToken: 'auth' })
    expect(service.isSignedIn()).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('abandons a waiting hand-off when the user closes the card', async () => {
    Reflect.set(globalThis, 'sdkworkDesktop', BRIDGE)
    const service = new IamService(scopeOf(), envOf('https://api.example'), layoutOf())
    const close = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin: vi.fn(), openBrowser: vi.fn(), close })
    service.startBrowserSignIn()
    await vi.waitFor(() => { expect(desktop.begin).toHaveBeenCalledTimes(1) })
    vi.spyOn(service, 'browserSignInWaiting').mockReturnValue(true)

    service.dismissSignIn()
    expect(desktop.cancel).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
