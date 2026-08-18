/** Registrations, the IAM service, the account seam binding, and teardown. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-iam/client'
import { IamService } from '../src/client/iam-service.ts'
import { AccountModePage } from '../src/client/AccountModePage.tsx'
import { SignInOverlay } from '../src/client/SignInOverlay.tsx'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'

usePinnedBrowserLanguages('zh-CN')

/** The seats this plugin fills (slot name → expected component). */
const SEATS = [
  ['mode.page', AccountModePage],
  ['shell.overlay', SignInOverlay],
] as const

/** Minimal account-seam fake: the plugin only calls setSource on it. */
function accountFake() {
  const setSource = vi.fn()
  return {
    getSnapshot: () => ({ signedIn: false }),
    setSource,
    signIn: vi.fn(),
    logout: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  }
}

/**
 * Declare the declaration chain the way ui-layout + ui-app-modes do: the
 * root entry declares the mode rail + mode pages + overlay, and the rail
 * entry declares the keyed rail entries seat; the account mode and modal
 * host come from this plugin's own registers.
 */
function declare(slots: SlotRegistry): () => void {
  const rootDispose = slots.register(
    {
      name: 'root',
      children: {
        'mode.rail': { kind: 'single', scope: 'root' },
        'mode.page': { kind: 'keyed', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
  const railDispose = slots.register(
    {
      name: 'mode.rail',
      children: {
        'mode.rail.entry': { kind: 'keyed', scope: 'root' },
        'mode.rail.settings': { kind: 'single', scope: 'root' },
      },
    } as never,
    () => null,
  )
  return () => { rootDispose(); railDispose() }
}

async function bench(settings: Partial<UiIamSettings> = {}, envProfile: Partial<{ apiBaseUrl: string; appId: string }> = {}) {
  // The initial environment is explicitly unconfigured: the ui-env default is
  // the api.birdcoder.com origin, and a ready+configured environment would make
  // the apply-time bootstrap run the real controller against a Node lane with
  // no localStorage. Tests pass a base URL when they need one.
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  let value: UiIamSettings = { ...DEFAULT_UI_IAM_SETTINGS, ...settings }
  const listeners = new Set<() => void>()
  const publish = (next: Partial<UiIamSettings>): void => {
    value = { ...value, ...next }
    for (const listener of listeners) listener()
  }
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
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
  ctx.provide('settingsScope', { bind: () => scope })
  let envProfileValue = { apiBaseUrl: '', appId: 'sdkwork-birdcoder', ...envProfile }
  const envListeners = new Set<() => void>()
  const setEnvProfile = (next: Partial<{ apiBaseUrl: string; appId: string }>): void => {
    envProfileValue = { ...envProfileValue, ...next }
    for (const listener of envListeners) listener()
  }
  ctx.provide('env', {
    isConfigured: () => envProfileValue.apiBaseUrl.trim() !== '',
    apiBaseUrl: () => envProfileValue.apiBaseUrl,
    appId: () => envProfileValue.appId,
    appKey: () => 'sdkwork-birdcoder',
    accessToken: () => '',
    subscribe: (listener: () => void) => { envListeners.add(listener); return () => { envListeners.delete(listener) } },
  } as never)
  const layout = {
    toggleSidebar: vi.fn(),
    setSidebarVisible: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setMode: vi.fn(),
  }
  ctx.provide('layout', layout)
  const account = accountFake()
  ctx.provide('account', account as never)
  // The theme hook's subscription rides ctx.on('theme/change'); a static
  // snapshot keeps the sdkwork surfaces on the light appearance in this lane.
  ctx.provide('theme', {
    getTheme: () => ({ active: { id: 'light', colorScheme: 'light' as const, tokens: {} } }),
  } as never)
  declare(ctx.get('slots') as SlotRegistry)
  const fiber = ctx.plugin({ apply, inject } as never)
  await fiber.await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, account, layout, publish, setEnvProfile, fiber }
}

describe('ui-iam client plugin', () => {
  it('registers the account mode, the modal host, and the dictionaries', async () => {
    const { slots } = await bench()
    for (const [name, component] of SEATS) {
      const entries = slots.entries(name)
      expect(entries.length).toBeGreaterThan(0)
      expect(entries[0].component).toBe(component)
    }
    const page = slots.entries('mode.page')[0]
    expect(page.options.key).toBe('account')
    const overlay = slots.entries('shell.overlay').find(e => e.options.id === 'iam-sign-in')
    expect(overlay).not.toBeUndefined()
  })

  it('provides the IAM service and binds the account seam to a live source', async () => {
    const { ctx, account } = await bench()
    const iam = ctx.get('iam')
    expect(iam).toBeInstanceOf(IamService)
    expect(account.setSource).toHaveBeenCalledTimes(1)
    // The bound source follows the controller: signed out advertises the
    // sign-in row; an applied session publishes the identity.
    const source = account.setSource.mock.calls[0][0] as { getSnapshot(): unknown }
    expect(source.getSnapshot()).toEqual({ signedIn: false, signInAvailable: true })
    ;(iam as IamService).controller.applySession({
      accessToken: 'at',
      authToken: 'auth',
      user: { id: 'u1', displayName: 'Bird' },
    })
    expect(source.getSnapshot()).toEqual({ signedIn: true, username: 'Bird' })
  })

  it('keeps the sign-in row advertised while the environment is unconfigured', async () => {
    const { account } = await bench()
    const source = account.setSource.mock.calls[0][0] as { getSnapshot(): unknown }
    expect(source.getSnapshot()).toEqual({ signedIn: false, signInAvailable: true })
  })

  it('bootstraps the session once the environment reports a base URL', async () => {
    const { setEnvProfile, ctx } = await bench()
    const iam = ctx.get('iam') as IamService
    const bootstrap = vi.spyOn(iam, 'bootstrap').mockResolvedValue(undefined)
    setEnvProfile({ apiBaseUrl: 'https://iam.example' })
    expect(bootstrap).toHaveBeenCalledTimes(1)
    // A second environment move does not re-bootstrap.
    setEnvProfile({ apiBaseUrl: 'https://iam2.example' })
    expect(bootstrap).toHaveBeenCalledTimes(1)
  })

  it('disposes every registration on teardown', async () => {
    const { slots, fiber } = await bench()
    expect(slots.entries('mode.page').length).toBeGreaterThan(0)
    await fiber.dispose()
    expect(slots.entries('mode.page').length).toBe(0)
  })
})
