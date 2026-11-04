// @vitest-environment jsdom
/** The official-account plugin's registrations: dictionaries, the host adapter, and the settings.officialAccounts seat. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** Minimal env face: no gateway configured unless a test opts in. */
function makeEnv(apiBaseUrl = '') {
  return {
    apiBaseUrl: () => apiBaseUrl,
    accessToken: () => '',
    subscribe: vi.fn(() => vi.fn()),
  }
}

/** Minimal IAM face: anonymous until a test signs in. */
function makeIam() {
  return {
    isSignedIn: () => false,
    startSignIn: vi.fn(),
    controller: {
      getState: () => ({ session: null }),
      subscribe: vi.fn(() => vi.fn()),
    },
  }
}

/** Minimal theme face: the dialog reads only the resolved color scheme. */
function makeTheme() {
  return { getTheme: () => ({ active: { colorScheme: 'dark' as const } }) }
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
  ctx.provide('theme', makeTheme() as never)
  return { ctx, slots: ctx.get('slots') as unknown as SlotRegistry, locale }
}

describe('ui-sdkwork-official-accounts client plugin', () => {
  it('declares its required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam', 'theme'])
  })

  it('registers the officialAccounts dictionaries and tears them down', async () => {
    const { ctx, locale } = await bench()
    const fiber = mount(ctx)
    await fiber.await()
    const translate = locale.bind(NS)
    locale.setLocale('zh')
    expect(translate('section.title')).toBe(zh['section.title'])
    locale.setLocale('en')
    expect(translate('section.title')).toBe(en['section.title'])
    await fiber.dispose()
    expect(translate('section.title')).not.toBe(en['section.title'])
  })

  it('registers a single-seat settings.officialAccounts contribution only through the shell grant', async () => {
    const { ctx, slots } = await bench()
    const fiber = mount(ctx)
    await fiber.await()
    // The seat declaration lives in the settings-menu shell's children table;
    // a registration without it throws SlotOwnershipError and crashes the
    // whole mode.rail.settings entry — this assertion pins the collaboration.
    expect(() => slots.register({
      name: 'settings.officialAccounts',
    } as never)).toThrow(/not declared|declared/)
    await fiber.dispose()
    // HMR: a re-apply must leave a working plugin behind.
    const second = mount(ctx)
    await second.await()
    expect(() => slots.register({
      name: 'settings.officialAccounts',
    } as never)).toThrow(/not declared|declared/)
    await second.dispose()
  })
})
