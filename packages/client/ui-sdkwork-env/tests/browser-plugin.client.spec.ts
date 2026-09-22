/** Registrations and the environment service. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import { EnvService } from '../src/client/env-service.ts'
import { SDKWORK_ENV_BOOT_GLOBAL, DEFAULT_UI_ENV_SETTINGS, type UiEnvSettings } from '../src/env-settings.ts'

async function bench(settings: Partial<UiEnvSettings> = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const value: UiEnvSettings = { ...DEFAULT_UI_ENV_SETTINGS, ...settings }
  const scope = {
    getSnapshot: () => ({
      status: 'ready' as const,
      value,
      base: undefined,
      // The user layer is what the document declares, which is the layer the
      // service resolves over the launch-environment projection.
      user: settings,
      revision: 1,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
  ctx.provide('configForms', { get: () => scope })
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

afterEach(() => { Reflect.deleteProperty(globalThis, SDKWORK_ENV_BOOT_GLOBAL) })

describe('ui-sdkwork-env client plugin', () => {
  it('provides the environment service over the settings scope', async () => {
    const { ctx } = await bench()
    const env = ctx.get('env')
    expect(env).toBeInstanceOf(EnvService)
    expect((env as EnvService).apiBaseUrl()).toBe(DEFAULT_UI_ENV_SETTINGS.development.apiBaseUrl)
    expect((env as EnvService).currentEnvironment()).toBe('development')
  })

  it('exposes the configured environment profile', async () => {
    const { ctx } = await bench({
      environment: 'testing',
      testing: { apiBaseUrl: 'https://api-test.birdcoder.com', appId: 'app-test', appKey: 'key-test', accessToken: 'tok-test' },
    })
    const env = ctx.get('env') as EnvService
    expect(env.currentEnvironment()).toBe('testing')
    expect(env.apiBaseUrl()).toBe('https://api-test.birdcoder.com')
    expect(env.accessToken()).toBe('tok-test')
  })

  it('resolves the environment the Host published for this page', async () => {
    Reflect.set(globalThis, SDKWORK_ENV_BOOT_GLOBAL, {
      environment: 'production',
      production: { apiBaseUrl: 'https://api.birdcoder.com', accessToken: 'boot-token' },
    })
    const { ctx } = await bench()
    const env = ctx.get('env') as EnvService
    expect(env.currentEnvironment()).toBe('production')
    expect(env.apiBaseUrl()).toBe('https://api.birdcoder.com')
    expect(env.accessToken()).toBe('boot-token')
  })

  it('ignores a page payload the section schema cannot accept', async () => {
    Reflect.set(globalThis, SDKWORK_ENV_BOOT_GLOBAL, { environment: 'sandbox' })
    const { ctx } = await bench()
    const env = ctx.get('env') as EnvService
    expect(env.currentEnvironment()).toBe('development')
    expect(env.apiBaseUrl()).toBe(DEFAULT_UI_ENV_SETTINGS.development.apiBaseUrl)
  })
})
