import { describe, expect, it, vi } from 'vitest'
import { IamService } from '../src/client/iam-service.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'

/** A scriptable settings scope for the service specs. */
function scopeOf(initial: Partial<UiIamSettings> = {}): {
  scope: SettingsScope<UiIamSettings>
  publish(next: Partial<UiIamSettings>): void
} {
  let value: UiIamSettings = { ...DEFAULT_UI_IAM_SETTINGS, ...initial }
  const listeners = new Set<() => void>()
  return {
    scope: {
      getSnapshot: () => ({ status: 'ready' as const, value, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' as const }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      set: vi.fn(async () => {}),
      unset: vi.fn(async () => {}),
    },
    publish(next: Partial<UiIamSettings>) {
      value = { ...value, ...next }
      for (const listener of listeners) listener()
    },
  }
}

/** A scriptable environment service carrying the shared sdkwork profile. */
function envOf(profile: Partial<{ apiBaseUrl: string; appId: string; appKey: string; accessToken: string }> = {}): {
  env: EnvService
  setProfile(next: Partial<{ apiBaseUrl: string; appId: string; accessToken: string }>): void
} {
  let current = { apiBaseUrl: 'https://api.birdcoder.com', appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '', ...profile }
  const listeners = new Set<() => void>()
  return {
    env: {
      isConfigured: () => current.apiBaseUrl.trim() !== '',
      apiBaseUrl: () => current.apiBaseUrl,
      appId: () => current.appId,
      appKey: () => current.appKey,
      accessToken: () => current.accessToken,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    } as unknown as EnvService,
    setProfile(next) {
      current = { ...current, ...next }
      for (const listener of listeners) listener()
    },
  }
}

function layoutOf(): ILayout & { setMode: ReturnType<typeof vi.fn> } {
  return {
    toggleSidebar: vi.fn(),
    setSidebarVisible: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setMode: vi.fn(),
  }
}

describe('IamService', () => {
  it('reports configured from the environment profile and only an empty base URL as unconfigured', () => {
    // The shared ui-sdkwork-env profile defaults to the api.birdcoder.com origin, so
    // the untouched environment counts as a configured IAM base URL.
    expect(new IamService(scopeOf().scope, envOf().env, layoutOf()).isConfigured()).toBe(true)

    const unconfigured = envOf({ apiBaseUrl: '' })
    expect(new IamService(scopeOf().scope, unconfigured.env, layoutOf()).isConfigured()).toBe(false)

    const configured = envOf({ apiBaseUrl: 'https://iam.example' })
    expect(new IamService(scopeOf().scope, configured.env, layoutOf()).isConfigured()).toBe(true)
  })

  it('mirrors settings changes into authRuntimeConfig and the environment into isConfigured', () => {
    const state = scopeOf()
    const env = envOf({ apiBaseUrl: 'https://iam.example' })
    const service = new IamService(state.scope, env.env, layoutOf())
    expect(service.authRuntimeConfig().qrLoginEnabled).toBe(false)
    state.publish({ qrLoginEnabled: true, oauthLoginEnabled: true })
    expect(service.authRuntimeConfig().qrLoginEnabled).toBe(true)
    expect(service.authRuntimeConfig().oauthLoginEnabled).toBe(true)
    // The auth surface config keeps the harness's fixed method surface.
    expect(service.authRuntimeConfig().loginMethods).toEqual(['password'])
    env.setProfile({ apiBaseUrl: '' })
    expect(service.isConfigured()).toBe(false)
  })

  it('exposes the environment app id and follows environment moves', () => {
    const env = envOf({ apiBaseUrl: 'https://iam.example', appId: 'app-1' })
    const service = new IamService(scopeOf().scope, env.env, layoutOf())
    expect(service.appId()).toBe('app-1')
    expect(service.isConfigured()).toBe(true)
    env.setProfile({ apiBaseUrl: '' })
    expect(service.isConfigured()).toBe(false)
    env.setProfile({ apiBaseUrl: 'https://iam2.example', appId: 'app-2' })
    expect(service.appId()).toBe('app-2')
    expect(service.isConfigured()).toBe(true)
  })

  it('openSignIn dispatches to the account mode for the page presentation even while unconfigured', async () => {
    const { scope } = scopeOf({ presentation: 'page' })
    const layout = layoutOf()
    const service = new IamService(scope, envOf().env, layout)
    service.openSignIn()
    expect(layout.setMode).toHaveBeenCalledWith('account')
  })

  it('openSignIn opens the modal for the modal presentation through the attached actions even while unconfigured', async () => {
    const { scope } = scopeOf()
    const service = new IamService(scope, envOf({ apiBaseUrl: '' }).env, layoutOf())
    const open = vi.fn()
    const close = vi.fn()
    service.attachModal({ open, close })
    service.openSignIn()
    expect(open).toHaveBeenCalledTimes(1)
    service.closeModal()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('openSignIn is a no-op while already authenticated', async () => {
    const { scope } = scopeOf({ presentation: 'page' })
    const layout = layoutOf()
    const service = new IamService(scope, envOf().env, layout)
    const open = vi.fn()
    service.attachModal({ open, close: vi.fn() })
    service.controller.applySession({
      accessToken: 'at',
      authToken: 'auth',
      user: { id: 'u1', displayName: 'birdcoder' },
    })
    service.openSignIn()
    expect(layout.setMode).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('bootstrap is a no-op while unconfigured', async () => {
    const service = new IamService(scopeOf().scope, envOf({ apiBaseUrl: '' }).env, layoutOf())
    await expect(service.bootstrap()).resolves.toBeUndefined()
  })

  it('subscribes listeners to the controller, the settings scope, and the environment', () => {
    const state = scopeOf()
    const env = envOf()
    const service = new IamService(state.scope, env.env, layoutOf())
    const listener = vi.fn()
    const dispose = service.subscribe(listener)
    state.publish({ qrLoginEnabled: true })
    expect(listener).toHaveBeenCalledTimes(1)
    env.setProfile({ apiBaseUrl: 'https://iam2.example' })
    expect(listener).toHaveBeenCalledTimes(2)
    dispose()
    state.publish({ qrLoginEnabled: false })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
