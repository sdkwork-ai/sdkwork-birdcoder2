/**
 * Host half of ui-sdkwork-env: the durable section stays live, and the launch
 * environment declares which environment the page's profile resolves to.
 */
import { Context } from '@deepseek-ai/cordis'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Config, apply } from '../src/index.ts'
import { SDKWORK_ENV_BOOT_GLOBAL, UI_ENV_ENVIRONMENT_FIELD } from '../src/env-settings.ts'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig, volatileForm } from '../../../settings/settings/src/schema.ts'

/** Collect the injection table the way an index render or boot payload does. */
function collect(ctx: Context): IndexInjection[] {
  const table: IndexInjection[] = []
  ctx.emit('webserver/index-inject', table)
  return table
}

describe('ui-sdkwork-env host', () => {
  it('resolves, validates, and disposes the durable section with its fiber', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    expect(plainConfig(configuration.fiber.config)).toMatchObject({
      [UI_ENV_ENVIRONMENT_FIELD]: 'development',
      development: { appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
    })
    await configuration.update({ environment: 'production' })
    expect(plainConfig(configuration.fiber.config)).toMatchObject({ environment: 'production' })
    await expect(configuration.update({ environment: 'sandbox' })).rejects.toThrow()
    await configuration.fiber.dispose()
  })

  it('keeps every field live so the browser scope can resolve the section', () => {
    // A Config without a live form carries no namespace: the settings service
    // skips the entry, and the browser half's `configForms.get` never resolves —
    // `ctx.env` would then answer its own defaults in every deployment.
    expect(Object.keys(volatileForm(Config)?.dict ?? {})).toEqual([
      UI_ENV_ENVIRONMENT_FIELD, 'development', 'testing', 'production',
    ])
  })

  it('publishes the launch-environment projection and withdraws it on disposal', async () => {
    vi.stubEnv('SDKWORK_BIRDCODER_ENVIRONMENT', 'production')
    vi.stubEnv('SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL', 'https://api.example.sdkwork.com')
    vi.stubEnv('SDKWORK_ACCESS_TOKEN', 'boot-token')
    onTestFinished(() => { vi.unstubAllEnvs() })
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    expect(collect(ctx)).toEqual([{
      kind: 'global',
      name: SDKWORK_ENV_BOOT_GLOBAL,
      value: {
        environment: 'production',
        production: { apiBaseUrl: 'https://api.example.sdkwork.com', accessToken: 'boot-token' },
      },
    }])
    await configuration.fiber.dispose()
    expect(collect(ctx)).toEqual([])
  })

  it('publishes an empty projection when the launch environment declares no tier', async () => {
    vi.stubEnv('SDKWORK_BIRDCODER_ENVIRONMENT', '')
    vi.stubEnv('SDKWORK_ENVIRONMENT', '')
    onTestFinished(() => { vi.unstubAllEnvs() })
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    expect(collect(ctx)).toEqual([{ kind: 'global', name: SDKWORK_ENV_BOOT_GLOBAL, value: {} }])
    await configuration.fiber.dispose()
  })
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin({ Config, apply })))
