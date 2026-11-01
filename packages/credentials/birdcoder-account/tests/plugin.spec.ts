/**
 * Plugin wiring: `apply` resolves the live services, starts the controller, and
 * stops it with the fiber.
 */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as plugin from '../src/index.ts'

describe('birdcoder-account plugin', () => {
  it('provisions from the session through the injected services', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-birdcoder-plugin-'))
    onTestFinished(() => rm(dir, { recursive: true, force: true }))
    await mkdir(join(dir, 'iam'), { recursive: true })
    const sessionFile = join(dir, 'iam', 'session.json')
    const stateFile = join(dir, 'iam', 'marker.json')
    await writeFile(sessionFile, JSON.stringify({ authToken: 'auth-token' }), 'utf8')

    const stored: string[] = []
    const updates: unknown[] = []
    let descriptors = [{
      ns: 'llm-pi-ai',
      autoGenerate: false,
      schema: {},
      revision: 0,
      applies: 'live',
      value: {},
      user: {},
    }]
    const ctx = new Context()
    ctx.provide('credentials', {
      describe: async () => ({ configured: stored.length > 0, writable: true }),
      resolve: async () => stored.length === 0 ? undefined : { value: stored[0]!, source: 'file' },
      set: async (_ref: string, value: string) => { stored.push(value) },
      unset: async () => {},
    } as never)
    ctx.provide('settings', {
      describe: () => descriptors,
      update: async (_ns: string, patch: unknown) => {
        updates.push(patch)
        const section = patch as Record<string, unknown>
        descriptors = [{ ...descriptors[0]!, value: section, user: section }]
      },
      mutate: async () => {},
    } as never)
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }),
      saveSelection: async () => {},
    } as never)
    ctx.provide('llm', {
      listModels: async (provider: string) => provider === 'birdcoder'
        ? [{ id: 'deepseek/deepseek-v4-flash' }]
        : [],
    } as never)
    const fiber = ctx.plugin(plugin, {
      sessionFile,
      stateFile,
      credentialRef: 'BIRDCODER_API_KEY',
      settingsNs: 'llm-pi-ai',
      pollIntervalMs: 0,
    })
    await fiber
    await vi.waitFor(() => { expect(stored).toEqual(['auth-token']) })
    expect(updates).toEqual([{
      providers: { birdcoder: { api: 'openai-completions', apiKeyEnv: 'BIRDCODER_API_KEY' } },
    }])
    await fiber.dispose()
  })
})
