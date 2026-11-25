/**
 * ui-sdkwork-message-center apply wiring: the rail shortcut and the overlay
 * host register against the frame's seats, share one store handle, and read
 * one notification snapshot through the real SDKWork HTTP transport.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SyncedConfig, SyncedConfigRef } from '@deepseek-ai/dsh-client-config/types'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { IamService } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-message-center/client'
import type { MessageCenterConfig } from '../src/types.ts'
import { MessageCenterDialog, type MessageCenterDialogInjected } from '../src/client/MessageCenterDialog.tsx'
import { MessageCenterRailEntry, type MessageCenterRailEntryInjected } from '../src/client/MessageCenterRailEntry.tsx'
import type { MessageCenterSnapshot } from '../src/client/message-service.ts'
import { en } from '../src/client/locales.ts'

const OVERLAY = 'shell.overlay'
const RAIL_PANEL = 'mode.rail.panel'
const BASE_URL = 'https://api.example'

/** One synced Config field that never moves. */
function configRef(value: number | undefined): SyncedConfigRef<number | undefined> {
  return {
    get: () => value,
    getSnapshot: () => value,
    subscribe: () => () => {},
  }
}

/** The plugin Config the browser face receives. */
function config(): SyncedConfig<MessageCenterConfig> {
  return { pollIntervalMs: configRef(60_000), pageSize: configRef(20) }
}

/** The shared environment profile stand-in (a subset of the real service). */
function fakeEnv(accessToken = ''): EnvService {
  return {
    isConfigured: () => true,
    apiBaseUrl: () => BASE_URL,
    accessToken: () => accessToken,
    subscribe: () => () => {},
  } as EnvService
}

/** The IAM service stand-in (a subset of the real service). */
function fakeIam(signedIn = true): IamService {
  return {
    sessionTokens: () => (signedIn ? { accessToken: 'access', authToken: 'auth' } : {}),
    onAuthToken: () => () => {},
    requestSignInInPlace: async () => true,
  } as IamService
}

/** One notification envelope response. */
function listResponse(items: readonly Record<string, unknown>[], hasMore = false): Response {
  return new Response(JSON.stringify({
    code: 0,
    traceId: 'trace',
    data: { items, pageInfo: { page: 1, hasMore } },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

/** One wire notification. */
function wire(id = 'n-1'): Record<string, unknown> {
  return {
    id,
    appId: 'sdkwork-birdcoder',
    title: 'Welcome',
    desc: 'Summary',
    content: 'Body',
    time: '2026-11-16T08:00:00.000Z',
    type: 'info',
    read: false,
    showAsPopup: false,
    popupSeen: false,
    archived: false,
  }
}

/** Boot the client slots and register the two seats this plugin occupies. */
async function bench(options: { signedIn?: boolean; accessToken?: string } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('env', fakeEnv(options.accessToken ?? ''))
  ctx.provide('iam', fakeIam(options.signedIn ?? true))
  const slots = ctx.get('slots') as SlotRegistry
  slots.register(
    {
      name: 'root',
      children: {
        [OVERLAY]: { kind: 'list', scope: 'root' },
        [RAIL_PANEL]: { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
  return { ctx, slots }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ui-sdkwork-message-center apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam'])
  })

  it('registers the overlay host and the rail shortcut over one shared store', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => listResponse([wire()])))
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()

    const [dialog] = b.slots.entries(OVERLAY)
    expect(dialog?.options.id).toBe('message-center')
    expect(dialog?.component).toBe(MessageCenterDialog)
    expect(dialog?.locale).toBe('messageCenter')

    const [rail] = b.slots.entries(RAIL_PANEL)
    expect(rail?.options.id).toBe('message-center')
    expect(rail?.options.order).toBe(20)
    expect(rail?.component).toBe(MessageCenterRailEntry)
    expect(rail?.locale).toBe('messageCenter')

    expect(rail?.store).toBe(dialog?.store)

    await fiber.dispose()
  })

  it('reads the notification page through the app notification API', async () => {
    const fetchMock = vi.fn(async () => listResponse([wire()], true))
    vi.stubGlobal('fetch', fetchMock)
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()

    const [dialog] = b.slots.entries(OVERLAY)
    const injected = (dialog?.inject as unknown as () => MessageCenterDialogInjected)()
    await vi.waitFor(() => {
      expect(injected.hooks.snapshot.getSnapshot()).toMatchObject({
        status: 'ready', unreadCount: 1, hasMore: true,
      })
    })
    const unsubscribe = injected.hooks.snapshot.subscribe(() => {})
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/app/v3/api/notification/notifications')
    expect(init.headers).toMatchObject({ 'Access-Token': 'access', Authorization: 'Bearer auth' })

    injected.refresh()
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(2) })
    injected.markRead('n-1')
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(3) })
    expect(new URL(String(fetchMock.mock.calls[2]?.[0])).pathname)
      .toBe('/app/v3/api/notification/notifications/n-1/acknowledge')
    injected.loadMore()
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(4) })
    injected.signIn()
    await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalledTimes(5) })
    expect(injected.canSignIn).toBe(true)
    expect(en['title']).toBe('Message center')

    await fiber.dispose()
  })

  it('exposes the rail refresh gesture and the unread snapshot', async () => {
    const fetchMock = vi.fn(async () => listResponse([wire()]))
    vi.stubGlobal('fetch', fetchMock)
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()

    const [rail] = b.slots.entries(RAIL_PANEL)
    const injected = (rail?.inject as unknown as () => MessageCenterRailEntryInjected)()
    await vi.waitFor(() => {
      const snapshot: MessageCenterSnapshot = injected.hooks.snapshot.getSnapshot()
      expect(snapshot.unreadCount).toBe(1)
    })
    const calls = fetchMock.mock.calls.length
    injected.refresh()
    await vi.waitFor(() => { expect(fetchMock.mock.calls.length).toBe(calls + 1) })
    await fiber.dispose()
  })

  it('falls back to the built-in settings when the Host syncs neither field', async () => {
    const fetchMock = vi.fn(async () => listResponse([wire()]))
    vi.stubGlobal('fetch', fetchMock)
    const b = await bench()
    const absentConfig: SyncedConfig<MessageCenterConfig> = {
      pollIntervalMs: configRef(undefined),
      pageSize: configRef(undefined),
    }
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, absentConfig) } })
    await fiber.await()
    const [dialog] = b.slots.entries(OVERLAY)
    const injected = (dialog?.inject as unknown as () => MessageCenterDialogInjected)()
    injected.refresh()
    await vi.waitFor(() => {
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('page_size=20')
    })
    await fiber.dispose()
  })

  it('reports the signed-out state without credentials', async () => {
    const fetchMock = vi.fn(async () => listResponse([wire()]))
    vi.stubGlobal('fetch', fetchMock)
    const b = await bench({ signedIn: false, accessToken: '' })
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()

    const [dialog] = b.slots.entries(OVERLAY)
    const injected = (dialog?.inject as unknown as () => MessageCenterDialogInjected)()
    expect(injected.hooks.snapshot.getSnapshot()).toMatchObject({ status: 'signed-out', items: [] })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(injected.canSignIn).toBe(true)
    await fiber.dispose()
  })

  it('removes both seats and stops polling on teardown', async () => {
    const fetchMock = vi.fn(async () => listResponse([wire()]))
    vi.stubGlobal('fetch', fetchMock)
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()
    expect(b.slots.entries(OVERLAY)).toHaveLength(1)
    expect(b.slots.entries(RAIL_PANEL)).toHaveLength(1)
    const calls = fetchMock.mock.calls.length
    await fiber.dispose()
    expect(b.slots.entries(OVERLAY)).toEqual([])
    expect(b.slots.entries(RAIL_PANEL)).toEqual([])
    expect(fetchMock.mock.calls.length).toBe(calls)
  })
})
