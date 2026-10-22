// @vitest-environment jsdom
/**
 * IM host adapter apply wiring: the plugin provides `ctx.im`, starts following
 * the environment and session, and exposes the mount API to the mode pages.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, ImService } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'

function fakeEnv() {
  return {
    apiBaseUrl: () => 'https://api.example.test',
    profile: () => ({
      apiBaseUrl: 'https://api.example.test',
      appId: 'sdkwork-birdcoder',
      appKey: 'sdkwork-birdcoder',
      accessToken: '',
      imEmbedUrl: 'https://im.example.test/embed.js',
    }),
    subscribe: vi.fn(() => () => {}),
  }
}

function fakeIam() {
  return {
    controller: {
      getState: () => ({ session: null }),
      subscribe: vi.fn(() => () => {}),
    },
  }
}

async function bench() {
  const ctx = new Context()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('env', fakeEnv() as never)
  ctx.provide('iam', fakeIam() as never)
  ctx.provide('layout', { setMode: vi.fn() } as never)
  return ctx
}

describe('ui-sdkwork-im apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['env', 'iam', 'layout', 'locale'])
  })

  it('provides ctx.im and starts the session subscriptions', async () => {
    const ctx = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const service = ctx.get('im') as ImService
    expect(service).toBeInstanceOf(ImService)
    expect(service.getSnapshot().selectedConversationId).toBeNull()
    await fiber.dispose()
  })
})
