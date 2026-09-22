import { describe, expect, it, vi } from 'vitest'
import { EnvService } from '../src/client/env-service.ts'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_UI_ENV_SETTINGS, type SdkworkEnvProjection, type UiEnvSettings } from '../src/env-settings.ts'

/**
 * A scriptable settings scope for the service specs.
 *
 * `declared` is the user layer — what the document actually carries — and
 * `value` is the Host's resolution of it over the schema defaults. The service
 * reads the user layer, because the resolved value restates every default and
 * would mask the launch-environment projection in every deployment.
 */
function scopeOf(initial: SdkworkEnvProjection = {}): {
  scope: ConfigForm<UiEnvSettings>
  publish(next: SdkworkEnvProjection): void
} {
  let declared: SdkworkEnvProjection = { ...initial }
  const resolved = (): UiEnvSettings => ({
    ...DEFAULT_UI_ENV_SETTINGS,
    ...declared,
    development: { ...DEFAULT_UI_ENV_SETTINGS.development, ...declared.development },
    testing: { ...DEFAULT_UI_ENV_SETTINGS.testing, ...declared.testing },
    production: { ...DEFAULT_UI_ENV_SETTINGS.production, ...declared.production },
  })
  const listeners = new Set<() => void>()
  return {
    scope: {
      getSnapshot: () => ({ status: 'ready' as const, value: resolved(), base: undefined, user: declared, revision: 1, writable: true, mode: 'host' as const }),
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      mutate: vi.fn(async () => true),
      set: vi.fn(async () => true),
      unset: vi.fn(async () => true),
    },
    publish(next: Partial<UiEnvSettings>) {
      declared = { ...declared, ...next }
      for (const listener of listeners) listener()
    },
  }
}

describe('EnvService', () => {
  it('defaults to the development environment before any document arrives', () => {
    const state = scopeOf()
    const service = new EnvService(state.scope)
    expect(service.currentEnvironment()).toBe('development')
    expect(service.apiBaseUrl()).toBe(DEFAULT_UI_ENV_SETTINGS.development.apiBaseUrl)
    expect(service.appId()).toBe('sdkwork-birdcoder')
    expect(service.appKey()).toBe('sdkwork-birdcoder')
    expect(service.accessToken()).toBe('')
    expect(service.isConfigured()).toBe(true)
  })

  it('reports unconfigured while the settings scope has not resolved', () => {
    // Regression: the pre-ready fallback must never present a base URL as
    // configuration, or the first IAM session restore fires against the
    // fallback environment's gateway before the launch projection lands.
    let ready = false
    const state = scopeOf()
    const snapshotBase = state.scope.getSnapshot.bind(state.scope)
    state.scope.getSnapshot = () => {
      const snapshot = snapshotBase()
      return ready ? snapshot : { ...snapshot, status: 'loading' as const, value: undefined }
    }
    const service = new EnvService(state.scope)
    expect(service.currentEnvironment()).toBe('development')
    expect(service.isConfigured()).toBe(false)
    ready = true
    expect(service.isConfigured()).toBe(true)
  })

  it('projects the active environment profile on switch', () => {
    const state = scopeOf({
      development: { apiBaseUrl: 'http://api-dev.birdcoder.com', appId: 'app-dev', appKey: 'key-dev', accessToken: 'tok-dev' },
      testing: { apiBaseUrl: 'https://api-test.birdcoder.com', appId: 'app-test', appKey: 'key-test', accessToken: 'tok-test' },
      production: { apiBaseUrl: 'https://api.birdcoder.com', appId: 'app-prod', appKey: 'key-prod', accessToken: '' },
    })
    const service = new EnvService(state.scope)
    expect(service.currentEnvironment()).toBe('development')
    expect(service.apiBaseUrl()).toBe('http://api-dev.birdcoder.com')

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
    const state = scopeOf({
      environment: 'production',
      development: { apiBaseUrl: '', appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
    })
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

  it('resolves the launch-environment projection over the schema defaults', () => {
    const state = scopeOf()
    const service = new EnvService(state.scope, {
      environment: 'production',
      production: { apiBaseUrl: 'https://api.birdcoder.com', accessToken: 'boot-token' },
    })
    expect(service.currentEnvironment()).toBe('production')
    expect(service.apiBaseUrl()).toBe('https://api.birdcoder.com')
    expect(service.accessToken()).toBe('boot-token')
    // A profile the projection only partly names keeps the schema defaults.
    expect(service.appId()).toBe('sdkwork-birdcoder')
    expect(service.profile()).toEqual({
      apiBaseUrl: 'https://api.birdcoder.com', appId: 'sdkwork-birdcoder',
      appKey: 'sdkwork-birdcoder', accessToken: 'boot-token',
    })
  })

  it('keeps the projection under the user layer but over the defaults', () => {
    // The document restates the schema default environment; only the fields it
    // actually carries may win, or a packaged build would fall back to the
    // development gateway the moment its document resolved.
    const state = scopeOf({ production: { appKey: 'key-user' } })
    const service = new EnvService(state.scope, {
      environment: 'production',
      production: { apiBaseUrl: 'https://api.birdcoder.com' },
    })
    expect(service.currentEnvironment()).toBe('production')
    expect(service.apiBaseUrl()).toBe('https://api.birdcoder.com')
    expect(service.appKey()).toBe('key-user')

    state.publish({ environment: 'testing' })
    expect(service.currentEnvironment()).toBe('testing')
    expect(service.apiBaseUrl()).toBe(DEFAULT_UI_ENV_SETTINGS.testing.apiBaseUrl)
  })

  it('ignores a projection naming an environment the section does not declare', () => {
    const state = scopeOf()
    const service = new EnvService(state.scope, { environment: 'sandbox' as never })
    expect(service.currentEnvironment()).toBe('development')
  })
})
