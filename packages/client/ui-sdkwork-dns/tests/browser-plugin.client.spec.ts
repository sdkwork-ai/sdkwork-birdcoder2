// @vitest-environment jsdom
/** The DNS plugin's registrations: dictionaries, the settings.dns seat, the injected face, and teardown. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { resetSdkworkGlobalTokenManager } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import type { DnsModalInjected } from '../src/client/DnsModal.tsx'

afterEach(() => {
  resetSdkworkGlobalTokenManager()
})

/** Controllable env/iam bench services. */
function makeServices() {
  const state = { baseUrl: 'https://api.example.com', signedIn: true }
  const envListeners = new Set<() => void>()
  const env = {
    apiBaseUrl: () => state.baseUrl,
    accessToken: () => '',
    subscribe: vi.fn((listener: () => void) => {
      envListeners.add(listener)
      return () => { envListeners.delete(listener) }
    }),
  }
  const iamListeners = new Set<() => void>()
  const iam = {
    isSignedIn: () => state.signedIn,
    startSignIn: vi.fn(),
    controller: {
      getState: () => ({ session: null }),
      subscribe: vi.fn((listener: () => void) => {
        iamListeners.add(listener)
        return () => { iamListeners.delete(listener) }
      }),
    },
  }
  return { state, env, iam, envListeners, iamListeners }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const services = makeServices()
  ctx.provide('env', services.env as never)
  ctx.provide('iam', services.iam as never)
  return { ctx, locale, ...services }
}

/** Declare the seat the way the settings-menu shell does. */
function declareSeat(slots: SlotRegistry): void {
  slots.register({
    name: 'root',
    children: { 'settings.dns': { kind: 'single', scope: 'root' } },
  } as never, () => null)
}

describe('ui-sdkwork-dns client plugin', () => {
  it('declares its required services', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam'])
  })

  it('contributes no host-side behavior', () => {
    expect(applyNode).not.toThrow()
  })

  it('registers the dns dictionaries and tears them down', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const translate = b.locale.bind(NS)
    b.locale.setLocale('zh')
    expect(translate('section.title')).toBe(zh['section.title'])
    b.locale.setLocale('en')
    expect(translate('section.title')).toBe(en['section.title'])
    await fiber.dispose()
    expect(translate('section.title')).not.toBe(en['section.title'])
  })

  it('registers the dialog only through the shell grant and survives HMR teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(() => { b.ctx.slots.register({ name: 'settings.dns' } as never, () => null) }).toThrow(/not declared|declared/)
    await fiber.dispose()
    // HMR: a re-apply must leave a working plugin behind.
    const second = b.ctx.plugin({ inject: [...inject], apply })
    await second.await()
    await second.dispose()
    declareSeat(b.ctx.slots as unknown as SlotRegistry)
    const third = b.ctx.plugin({ inject: [...inject], apply })
    await third.await()
    expect(b.ctx.slots.entries('settings.dns')).toHaveLength(1)
    await third.dispose()
    expect(b.ctx.slots.entries('settings.dns')).toHaveLength(0)
  })

  it('projects readiness, session, and revision through the injected face', async () => {
    const b = await bench()
    declareSeat(b.ctx.slots as unknown as SlotRegistry)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = b.ctx.slots.entries('settings.dns')[0]
    const injected = (entry.inject as unknown as () => DnsModalInjected)()
    expect(injected.host.readReady()).toBe(true)
    expect(injected.hooks.available.getSnapshot()).toBe(true)
    expect(injected.hooks.signedIn.getSnapshot()).toBe(true)
    const revision = injected.hooks.revision.getSnapshot()
    const revisionListener = vi.fn()
    const offRevision = injected.hooks.revision.subscribe(revisionListener)
    const listener = vi.fn()
    const offAvailable = injected.hooks.available.subscribe(listener)
    b.state.baseUrl = 'https://api2.example.com'
    for (const notify of b.envListeners) notify()
    expect(injected.hooks.revision.getSnapshot()).toBe(revision + 1)
    expect(listener).toHaveBeenCalled()
    expect(revisionListener).toHaveBeenCalled()
    offRevision()
    offAvailable()
    expect(b.envListeners.size).toBe(1)
    const sessionListener = vi.fn()
    const offSession = injected.hooks.signedIn.subscribe(sessionListener)
    b.state.signedIn = false
    for (const notify of b.iamListeners) notify()
    expect(injected.hooks.signedIn.getSnapshot()).toBe(false)
    expect(sessionListener).toHaveBeenCalled()
    offSession()
    injected.startSignIn()
    expect(b.iam.startSignIn).toHaveBeenCalledTimes(1)
    await fiber.dispose()
  })
})
