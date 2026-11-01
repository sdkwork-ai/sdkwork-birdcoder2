/**
 * Live-seam coverage: the relay profile is written through the real settings
 * service (a volatile provider dict over the profile patch), not only through
 * the controller's fake port.
 */

import { describe, expect, it, onTestFinished } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { resolveProfiles } from '../../../llm/llm-pi-ai/src/config.ts'
import type { PiAiProviderProfile } from '../../../llm/llm-pi-ai/src/config.ts'
import { configurationFixture } from '../../../settings/settings/tests/configuration-fixture.ts'
import { BirdcoderAccountProvisioner } from '../src/account.ts'

describe('BirdcoderAccountProvisioner settings integration', () => {
  it('declares the relay profile through the live settings seam', async () => {
    const fixture = await configurationFixture({
      hmr: false,
      schema: z.object({
        providers: z.dict(z.object({
          api: z.string(),
          apiKeyEnv: z.string(),
        })).default({}).volatile(),
      }),
    })
    const dir = await mkdtemp(join(tmpdir(), 'dsh-birdcoder-settings-'))
    onTestFinished(() => rm(dir, { recursive: true, force: true }))
    const sessionFile = join(dir, 'session.json')
    const stateFile = join(dir, 'marker.json')
    await writeFile(sessionFile, JSON.stringify({ authToken: 'auth-token', accessToken: 'access-token' }), 'utf8')
    const stored: string[] = []
    const controller = new BirdcoderAccountProvisioner({
      credentials: {
        describe: async () => ({ configured: false, writable: true }),
        resolve: async () => undefined,
        set: async (_ref, value) => { stored.push(value) },
        unset: async () => {},
      },
      settings: fixture.ctx.settings,
    }, {
      sessionFile,
      stateFile,
      credentialRef: 'BIRDCODER_API_KEY',
      settingsNs: 'first',
      pollIntervalMs: 0,
    })

    await controller.refresh()

    const value = fixture.ctx.settings.describe().find(row => row.ns === 'first')?.value as {
      providers?: Record<string, unknown>
    }
    expect(value.providers?.['birdcoder']).toEqual({
      api: 'openai-completions',
      apiKeyEnv: 'BIRDCODER_API_KEY',
    })
    expect(stored).toEqual(['auth-token'])

    // The written profile is not merely shape-valid: the real adapter resolves
    // it into a serviceable BirdCoder route with its shipped model catalog.
    const resolved = resolveProfiles(value.providers as Record<string, PiAiProviderProfile>)
    const relay = resolved.get('birdcoder')
    expect(relay?.api).toBe('openai-completions')
    expect(relay?.apiKeyEnv).toBe('BIRDCODER_API_KEY')
    expect(relay?.catalogError).toBeUndefined()
    expect(relay?.piProvider?.getModels().length).toBeGreaterThan(0)
  })
})
