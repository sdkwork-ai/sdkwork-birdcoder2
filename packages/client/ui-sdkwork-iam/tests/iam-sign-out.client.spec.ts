/**
 * The sign-out gesture the settings surfaces and the 个人主页 section share:
 * confirmation first, then the hosted CloudRouter page in the system browser,
 * then the local clear. The profile snapshot the 个人主页 reads is covered at
 * the same seam — it is the only account data that page exposes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IamService } from '../src/client/iam-service.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'

function scopeWith(baseUrl: string): SettingsScope<UiIamSettings> {
  return {
    getSnapshot: () => ({
      status: 'ready' as const,
      value: { ...DEFAULT_UI_IAM_SETTINGS, baseUrl },
      base: undefined,
      user: undefined,
      revision: 1,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe: () => () => {},
    set: async () => {},
    unset: async () => {},
  }
}

function layout() {
  return {
    toggleSidebar: vi.fn(),
    setSidebarVisible: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setMode: vi.fn(),
  } as never
}

interface EnvOverrides {
  apiBaseUrl?: string
  appId?: string
  cloudRouterUrl?: string
  environment?: 'development' | 'testing' | 'production'
}

function envOf(over: EnvOverrides = {}): EnvService {
  const current = {
    apiBaseUrl: 'https://api.birdcoder.com',
    appId: 'sdkwork-birdcoder',
    cloudRouterUrl: 'https://router.sdkwork.com',
    environment: 'production' as const,
    ...over,
  }
  return {
    isConfigured: () => current.apiBaseUrl.trim() !== '',
    apiBaseUrl: () => current.apiBaseUrl,
    appId: () => current.appId,
    accessToken: () => '',
    cloudRouterUrl: () => current.cloudRouterUrl,
    currentEnvironment: () => current.environment,
    subscribe: () => () => {},
  } as unknown as EnvService
}

function signedInService(over: EnvOverrides = {}): IamService {
  const service = new IamService(scopeWith('https://api.birdcoder.com'), envOf(over), layout())
  service.controller.applySession({
    accessToken: 'at',
    authToken: 'auth',
    context: { organizationId: '0', tenantId: '100001' },
    user: { id: 'u1', displayName: 'Bird Coder', email: 'bird@example.com', username: 'bird' },
  })
  return service
}

const originalOpen = Object.getOwnPropertyDescriptor(globalThis, 'open')

afterEach(() => {
  if (originalOpen === undefined) {
    Reflect.deleteProperty(globalThis, 'open')
  } else {
    Object.defineProperty(globalThis, 'open', originalOpen)
  }
  vi.restoreAllMocks()
})

function stubWindowOpen(): ReturnType<typeof vi.fn> {
  const open = vi.fn().mockReturnValue(null)
  Object.defineProperty(globalThis, 'open', { value: open, configurable: true, writable: true })
  return open
}

describe('IamService sign-out flow', () => {
  it('asks for confirmation before touching the session', () => {
    const service = signedInService()
    const openConfirm = vi.fn()
    service.attachSignOutConfirm({ open: openConfirm, close: vi.fn() })
    const signOut = vi.spyOn(service.controller, 'signOut').mockResolvedValue(undefined)
    service.requestSignOut()
    expect(openConfirm).toHaveBeenCalledTimes(1)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('is inert while signed out', () => {
    const service = new IamService(scopeWith('https://api.birdcoder.com'), envOf(), layout())
    const openConfirm = vi.fn()
    service.attachSignOutConfirm({ open: openConfirm, close: vi.fn() })
    service.requestSignOut()
    expect(openConfirm).not.toHaveBeenCalled()
  })

  it('confirms into the hosted sign-out page and clears the local session', async () => {
    const open = stubWindowOpen()
    const service = signedInService()
    const closeConfirm = vi.fn()
    service.attachSignOutConfirm({ open: vi.fn(), close: closeConfirm })
    const signOut = vi.spyOn(service.controller, 'signOut').mockResolvedValue(undefined)
    service.confirmSignOut()
    expect(closeConfirm).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(
      'https://router.sdkwork.com/auth/sign-out',
      '_blank',
      'noopener,noreferrer',
    )
    await vi.waitFor(() => { expect(signOut).toHaveBeenCalledTimes(1) })
  })

  it('still clears the local session when no hosted page is configured', async () => {
    const open = stubWindowOpen()
    const service = signedInService({ cloudRouterUrl: '' })
    service.attachSignOutConfirm({ open: vi.fn(), close: vi.fn() })
    const signOut = vi.spyOn(service.controller, 'signOut').mockResolvedValue(undefined)
    expect(service.signOutUrl()).toBeUndefined()
    service.confirmSignOut()
    expect(open).not.toHaveBeenCalled()
    await vi.waitFor(() => { expect(signOut).toHaveBeenCalledTimes(1) })
  })

  it('dismisses without ending the session', () => {
    const service = signedInService()
    const closeConfirm = vi.fn()
    service.attachSignOutConfirm({ open: vi.fn(), close: closeConfirm })
    const signOut = vi.spyOn(service.controller, 'signOut')
    service.dismissSignOut()
    expect(closeConfirm).toHaveBeenCalledTimes(1)
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('IamService profile snapshot', () => {
  it('reports a personal account for the IAM personal login context', () => {
    const snapshot = signedInService().profileSnapshot()
    expect(snapshot).toMatchObject({
      signedIn: true,
      displayName: 'Bird Coder',
      email: 'bird@example.com',
      username: 'bird',
      accountId: 'u1',
      accountKind: 'personal',
      organizationId: undefined,
      tenantId: '100001',
      appId: 'sdkwork-birdcoder',
      environment: 'production',
      managementCenterUrl: 'https://router.sdkwork.com',
      signOutAvailable: true,
      signOutUrl: 'https://router.sdkwork.com/auth/sign-out',
    })
  })

  it('reports the enterprise organization the session was issued for', () => {
    const service = new IamService(scopeWith('https://api.birdcoder.com'), envOf(), layout())
    service.controller.applySession({
      accessToken: 'at',
      authToken: 'auth',
      context: { organizationId: 'org-1', tenantId: 'tenant-9' },
      user: { id: 'u2', displayName: 'Acme Admin' },
    })
    expect(service.profileSnapshot()).toMatchObject({
      accountKind: 'enterprise',
      organizationId: 'org-1',
      tenantId: 'tenant-9',
    })
  })

  it('keeps one snapshot reference until a fact moves', () => {
    const service = signedInService()
    const first = service.profileSnapshot()
    expect(service.profileSnapshot()).toBe(first)
    // A session that expires resets the controller synchronously, which is the
    // state move the cache key tracks.
    service.controller.handleSessionExpired()
    const second = service.profileSnapshot()
    expect(second).not.toBe(first)
    expect(second.signedIn).toBe(false)
  })

  it('omits the management center and sign-out URL without a CloudRouter origin', () => {
    expect(signedInService({ cloudRouterUrl: '' }).profileSnapshot()).toMatchObject({
      managementCenterUrl: undefined,
      signOutUrl: undefined,
    })
  })
})
