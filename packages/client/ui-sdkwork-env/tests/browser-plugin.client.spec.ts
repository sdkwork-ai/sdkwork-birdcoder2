/** Registrations and the environment service. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import { EnvService } from '../src/client/env-service.ts'
import { DEFAULT_UI_ENV_SETTINGS, type UiEnvSettings } from '../src/env-settings.ts'

async function bench(settings: Partial<UiEnvSettings> = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const value: UiEnvSettings = { ...DEFAULT_UI_ENV_SETTINGS, ...settings }
  const scope = {
    getSnapshot: () => ({
      status: 'ready' as const,
      value,
      base: undefined,
      user: undefined,
      revision: 1,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
  ctx.provide('settingsScope', { bind: () => scope })
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-sdkwork-env client plugin', () => {
  it('provides the environment service over the settings scope', async () => {
    const { ctx } = await bench()
    const env = ctx.get('env')
    expect(env).toBeInstanceOf(EnvService)
    expect((env as EnvService).apiBaseUrl()).toBe('https://api.birdcoder.com')
    expect((env as EnvService).currentEnvironment()).toBe('production')
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
})
