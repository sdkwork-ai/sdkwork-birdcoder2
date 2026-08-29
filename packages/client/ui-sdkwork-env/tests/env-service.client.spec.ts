import { describe, expect, it, vi } from 'vitest'
import { EnvService } from '../src/client/env-service.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_UI_ENV_SETTINGS, type UiEnvSettings } from '../src/env-settings.ts'

/** A scriptable settings scope for the service specs. */
function scopeOf(initial: Partial<UiEnvSettings> = {}): {
  scope: SettingsScope<UiEnvSettings>
  publish(next: Partial<UiEnvSettings>): void
} {
  let value: UiEnvSettings = {
    ...DEFAULT_UI_ENV_SETTINGS,
    ...initial,
    development: { ...DEFAULT_UI_ENV_SETTINGS.development, ...initial.development },
    testing: { ...DEFAULT_UI_ENV_SETTINGS.testing, ...initial.testing },
    production: { ...DEFAULT_UI_ENV_SETTINGS.production, ...initial.production },
  }
  const listeners = new Set<() => void>()
  return {
    scope: {
      getSnapshot: () => ({ status: 'ready' as const, value, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' as const }),
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      mutate: vi.fn(async () => {}),
      set: vi.fn(async () => {}),
      unset: vi.fn(async () => {}),
    },
    publish(next: Partial<UiEnvSettings>) {
      value = { ...value, ...next }
      for (const listener of listeners) listener()
    },
  }
}

describe('EnvService', () => {
  it('defaults to the production environment with the api.birdcoder.com origin', () => {
    const state = scopeOf()
    const service = new EnvService(state.scope)
    expect(service.currentEnvironment()).toBe('production')
    expect(service.apiBaseUrl()).toBe('https://api.birdcoder.com')
    expect(service.appId()).toBe('sdkwork-birdcoder')
    expect(service.appKey()).toBe('sdkwork-birdcoder')
    expect(service.accessToken()).toBe('')
    expect(service.isConfigured()).toBe(true)
  })

  it('projects the active environment profile on switch', () => {
    const state = scopeOf({
      development: { apiBaseUrl: 'http://api-dev.birdcoder.com', appId: 'app-dev', appKey: 'key-dev', accessToken: 'tok-dev' },
      testing: { apiBaseUrl: 'https://api-test.birdcoder.com', appId: 'app-test', appKey: 'key-test', accessToken: 'tok-test' },
      production: { apiBaseUrl: 'https://api.birdcoder.com', appId: 'app-prod', appKey: 'key-prod', accessToken: '' },
    })
    const service = new EnvService(state.scope)
    expect(service.currentEnvironment()).toBe('production')
    expect(service.apiBaseUrl()).toBe('https://api.birdcoder.com')

    state.publish({ environment: 'testing' })
    expect(service.currentEnvironment()).toBe('testing')
    expect(service.apiBaseUrl()).toBe('https://api-test.birdcoder.com')
    expect(service.appId()).toBe('app-test')
    expect(service.appKey()).toBe('key-test')
    expect(service.accessToken()).toBe('tok-test')

    state.publish({ environment: 'development' })
    expect(service.apiBaseUrl()).toBe('http://api-dev.birdcoder.com')
    expect(service.accessToken()).toBe('tok-dev')
  })

  it('reports unconfigured when the active profile carries an empty base URL', () => {
    const state = scopeOf({ development: { ...DEFAULT_UI_ENV_SETTINGS.development, apiBaseUrl: '' } })
    const service = new EnvService(state.scope)
    expect(service.isConfigured()).toBe(true)
    state.publish({ environment: 'development' })
    expect(service.isConfigured()).toBe(false)
  })

  it('notifies subscribers on environment or profile moves', () => {
    const state = scopeOf()
    const service = new EnvService(state.scope)
    const listener = vi.fn()
    const dispose = service.subscribe(listener)
    state.publish({ environment: 'testing' })
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
    state.publish({ environment: 'development' })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
