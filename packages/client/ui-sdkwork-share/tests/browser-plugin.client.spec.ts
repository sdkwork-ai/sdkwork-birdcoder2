/**
 * ui-sdkwork-share plugin halves: the browser entry's dictionary and
 * header-slot registrations against the real SlotRegistry (with fiber teardown
 * proving removal — HMR safety) and the inert node entry. Host services (env / iam) are
 * stubbed so the adapter mounts
 * without a real backend.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { resetSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { ShareHost } from '../src/client/shareHost.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** Slot ledger reader: entry ids currently registered in the header list. */
function headerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('conversation.session.header.actions')
    .map(entry => entry.options.id)
}

/** Stub env service: no API origin until the test says otherwise. */
function stubEnv(apiBaseUrl = ''): {
  apiBaseUrl(): string
  accessToken(): string
  subscribe(): () => void
} {
  return {
    apiBaseUrl: () => apiBaseUrl,
    accessToken: () => '',
    subscribe: () => () => {},
  }
}

/** Stub IAM controller with no session. */
const stubIam = {
  controller: {
    getState: () => ({ session: null }),
    subscribe: () => () => {},
  },
}

/** Boot the browser half over a real slot tree that declares the header list. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  ctx.provide('sessions', {})
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  ctx.provide('env', stubEnv())
  ctx.provide('iam', stubIam)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-sdkwork-share browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam'])
  })

  it('registers the share header action, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(headerEntryIds(ctx)).toContain('sdkwork-share')
    await fiber.dispose()
    expect(headerEntryIds(ctx)).not.toContain('sdkwork-share')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('share.aria')).toBe(zh['share.aria'])
    ctx.locale.setLocale('en')
    expect(translate('share.aria')).toBe(en['share.aria'])
    await fiber.dispose()
    expect(translate('share.aria')).not.toBe(en['share.aria'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-sdkwork-share host adapter', () => {
  it('lists no applications when the API origin is unset (best-effort)', async () => {
    const host = new ShareHost({ env: stubEnv(''), iam: stubIam })
    host.mount()
    try {
      expect(await host.listRecentApps(5)).toEqual([])
    } finally {
      host.dispose()
      resetSdkworkGlobalTokenManager()
    }
  })
})

describe('ui-sdkwork-share node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})
