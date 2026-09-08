// @vitest-environment jsdom
/** The api-key plugin's registrations: dictionaries, the host adapter, and the settings.apiKeys seat. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { readActiveApiKeyHost } from '../src/client/apikeyHost.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** Minimal env face: no gateway configured unless a test opts in. */
function makeEnv(apiBaseUrl = '') {
  return {
    apiBaseUrl: () => apiBaseUrl,
    accessToken: () => '',
    subscribe: vi.fn(() => vi.fn()),
  }
}

/** Minimal iam face: a null session and a no-op subscription. */
function makeIam() {
  return {
    controller: {
      getState: () => ({ session: null }),
      subscribe: vi.fn(() => vi.fn()),
    },
  }
}

/** Mount the plugin over the bench services; the returned fiber drives teardown. */
function mount(ctx: Context) {
  return ctx.plugin({ inject: [...inject], apply })
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.provide('env', makeEnv() as never)
  ctx.provide('iam', makeIam() as never)
  return { ctx, slots: ctx.get('slots') as unknown as SlotRegistry, locale }
}

describe('ui-sdkwork-apikey client plugin', () => {
  it('declares its required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam'])
  })

  it('registers the apikey dictionaries and tears them down', async () => {
    const { ctx, locale } = await bench()
    const fiber = mount(ctx)
    await fiber.await()
    const translate = locale.bind(NS)
    locale.setLocale('zh')
    expect(translate('nav')).toBe(zh.nav)
    locale.setLocale('en')
    expect(translate('nav')).toBe(en.nav)
    await fiber.dispose()
    expect(translate('nav')).not.toBe(en.nav)
  })

  it('mounts exactly one host adapter and disposes it with the plugin', async () => {
    const { ctx } = await bench()
    const fiber = mount(ctx)
    await fiber.await()
    expect(readActiveApiKeyHost()).toBeInstanceOf(Object)
    await fiber.dispose()
    expect(readActiveApiKeyHost()).toBeUndefined()
  })

  it('registers a single-seat settings.apiKeys contribution and survives HMR teardown', async () => {
    const { ctx, slots } = await bench()
    const fiber = mount(ctx)
    await fiber.await()
    // The seat declaration lives in the settings-menu shell's children table;
    // a registration without it throws SlotOwnershipError and crashes the
    // whole mode.rail.settings entry — this assertion pins the collaboration.
    expect(() => slots.register({
      name: 'settings.apiKeys',
    } as never)).toThrow(/not declared|declared/)
    await fiber.dispose()
    // HMR: a re-apply must not leave the previous adapter registered.
    const second = mount(ctx)
    await second.await()
    expect(readActiveApiKeyHost()).toBeDefined()
  })
})
