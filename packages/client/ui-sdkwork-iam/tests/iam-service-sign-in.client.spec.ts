/**
 * Deferred sign-in spec: the IAM service's "ask at the door" half. A backend
 * call can demand a session, many concurrent calls share one overlay, a
 * finished login releases them all, and a dismiss answers "no" instead of
 * leaving the caller suspended forever.
 */
import { describe, expect, it, vi } from 'vitest'
import { IamService } from '../src/client/iam-service.ts'
import { SdkworkSignInRequiredError } from '../src/client/sign-in-requirement.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'

/** A scriptable settings scope for the service specs. */
function scopeOf(initial: Partial<UiIamSettings> = {}): SettingsScope<UiIamSettings> {
  const value: UiIamSettings = { ...DEFAULT_UI_IAM_SETTINGS, ...initial }
  return {
    getSnapshot: () => ({ status: 'ready' as const, value, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' as const }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
}

/** A scriptable environment service carrying the shared sdkwork profile. */
function envOf(profile: Partial<{ apiBaseUrl: string }> = {}): EnvService {
  const current = { apiBaseUrl: 'https://api.birdcoder.com', ...profile }
  return {
    isConfigured: () => current.apiBaseUrl.trim() !== '',
    apiBaseUrl: () => current.apiBaseUrl,
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

/** A service whose modal host is bound to spies. */
function harness(profile: Partial<{ apiBaseUrl: string }> = {}) {
  const service = new IamService(scopeOf(), envOf(profile), layoutOf())
  const open = vi.fn()
  const close = vi.fn()
  service.attachModal({ open, close })
  return { service, open, close }
}

/** A session snapshot the auth controller accepts. */
const SESSION = {
  accessToken: 'at',
  authToken: 'auth',
  user: { id: 'u1', displayName: 'birdcoder' },
}

describe('IamService deferred sign-in', () => {
  it('answers at once while already signed in and never raises the overlay', async () => {
    const { service, open } = harness()
    service.controller.applySession(SESSION)

    await expect(service.requestSignIn()).resolves.toBe(true)
    await expect(service.requireSignedIn()).resolves.toBeUndefined()
    expect(open).not.toHaveBeenCalled()
  })

  it('opens the overlay for a signed-out caller and resumes on login', async () => {
    const { service, open } = harness()
    const pending = service.requestSignIn()
    expect(open).toHaveBeenCalledTimes(1)

    service.controller.applySession(SESSION)
    await expect(pending).resolves.toBe(true)
  })

  it('shares one overlay between concurrent callers', async () => {
    const { service, open } = harness()
    const first = service.requestSignIn()
    const second = service.requestSignIn()
    expect(first).toBe(second)
    expect(open).toHaveBeenCalledTimes(1)

    service.controller.applySession(SESSION)
    await expect(first).resolves.toBe(true)
  })

  it('answers "no" when the user dismisses the overlay', async () => {
    const { service, open, close } = harness()
    const pending = service.requestSignIn()
    expect(open).toHaveBeenCalledTimes(1)

    service.dismissSignIn()
    expect(close).toHaveBeenCalledTimes(1)
    await expect(pending).resolves.toBe(false)

    // The requirement is spent: the next call raises a fresh overlay.
    void service.requestSignIn()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('rejects the held call when the user declines', async () => {
    const { service } = harness()
    const pending = service.requireSignedIn()
    service.dismissSignIn()

    await expect(pending).rejects.toBeInstanceOf(SdkworkSignInRequiredError)
  })

  it('releases the held call once the login lands', async () => {
    const { service } = harness()
    const pending = service.requireSignedIn()
    service.controller.applySession(SESSION)

    await expect(pending).resolves.toBeUndefined()
  })

  it('lets a login outrank a dismiss landing in the same tick', async () => {
    const { service, close } = harness()
    const pending = service.requestSignIn()
    service.controller.applySession(SESSION)
    service.dismissSignIn()

    await expect(pending).resolves.toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('still asks while the environment is unconfigured, so the notice can explain', async () => {
    const { service, open } = harness({ apiBaseUrl: '' })
    const pending = service.requestSignIn()
    expect(open).toHaveBeenCalledTimes(1)

    service.dismissSignIn()
    await expect(pending).resolves.toBe(false)
  })
})
