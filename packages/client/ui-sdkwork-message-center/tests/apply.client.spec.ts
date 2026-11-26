/**
 * ui-sdkwork-message-center apply wiring: the `main` message page and the rail
 * shortcut register against the frame's seats, and the shortcut selects that
 * page through `ctx.layout` instead of opening a modal.
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
import { MessageCenterView, type MessageCenterViewInjected } from '../src/client/MessageCenterView.tsx'
import { MessageCenterRailEntry, type MessageCenterRailEntryInjected } from '../src/client/MessageCenterRailEntry.tsx'
import type { MessageCenterSnapshot } from '../src/client/message-service.ts'
import { en } from '../src/client/locales.ts'

const MAIN = 'main'
const RAIL_PANEL = 'mode.rail.panel'
const PANEL_ID = 'message-center'
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
  const layout = { selectPanel: vi.fn(), panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe: () => () => {} } }
  ctx.provide('layout', layout)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register(
    {
      name: 'root',
      children: {
        [MAIN]: { kind: 'keyed', scope: 'root' },
        [RAIL_PANEL]: { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
  return { ctx, slots, layout }
}

/** Read the message page's injected face. */
function viewInjected(inject: unknown): MessageCenterViewInjected {
  return (inject as () => MessageCenterViewInjected)()
}

/** Read the rail shortcut's injected face. */
function railInjected(inject: unknown): MessageCenterRailEntryInjected {
  return (inject as () => MessageCenterRailEntryInjected)()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ui-sdkwork-message-center apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam', 'layout'])
  })

  it('registers the message page and the rail shortcut', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => listResponse([wire()])))
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()

    const [page] = b.slots.entries(MAIN)
    expect(page?.options.key).toBe(PANEL_ID)
    expect(page?.component).toBe(MessageCenterView)
    expect(page?.locale).toBe('messageCenter')

    const [rail] = b.slots.entries(RAIL_PANEL)
    expect(rail?.options.id).toBe(PANEL_ID)
    expect(rail?.options.order).toBe(20)
    expect(rail?.component).toBe(MessageCenterRailEntry)
    expect(rail?.locale).toBe('messageCenter')

    await fiber.dispose()
  })

  it('selects the message page from the rail shortcut, not a modal', async () => {
    const fetchMock = vi.fn(async () => listResponse([wire()], true))
    vi.stubGlobal('fetch', fetchMock)
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()

    const [page] = b.slots.entries(MAIN)
    const view = viewInjected(page?.inject)
    await vi.waitFor(() => {
      expect(view.hooks.snapshot.getSnapshot().status).toBe('ready')
    })
    const [rail] = b.slots.entries(RAIL_PANEL)
    const shortcut = railInjected(rail?.inject)
    const before = fetchMock.mock.calls.length
    shortcut.open()
    expect(b.layout.selectPanel).toHaveBeenCalledExactlyOnceWith(PANEL_ID)
    await vi.waitFor(() => { expect(fetchMock.mock.calls.length).toBe(before + 1) })

    await fiber.dispose()
  })

  it('reads the notification page through the app notification API', async () => {
    const fetchMock = vi.fn(async () => listResponse([wire()], true))
    vi.stubGlobal('fetch', fetchMock)
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()

    const [page] = b.slots.entries(MAIN)
    const injected = viewInjected(page?.inject)
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

    injected.close()
    expect(b.layout.selectPanel).toHaveBeenLastCalledWith(null)
    expect(en['title']).toBe('Message center')

    await fiber.dispose()
  })

  it('exposes the page snapshot to the rail badge', async () => {
    const fetchMock = vi.fn(async () => listResponse([wire()]))
    vi.stubGlobal('fetch', fetchMock)
    const b = await bench()
    const fiber = b.ctx.plugin({ inject, apply: (context) => { apply(context, config()) } })
    await fiber.await()

    const [rail] = b.slots.entries(RAIL_PANEL)
    const shortcut = railInjected(rail?.inject)
    await vi.waitFor(() => {
      const snapshot: MessageCenterSnapshot = shortcut.hooks.snapshot.getSnapshot()
      expect(snapshot.unreadCount).toBe(1)
    })
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
    const [page] = b.slots.entries(MAIN)
    const injected = viewInjected(page?.inject)
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

    const [page] = b.slots.entries(MAIN)
    const injected = viewInjected(page?.inject)
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
    expect(b.slots.entries(MAIN)).toHaveLength(1)
    expect(b.slots.entries(RAIL_PANEL)).toHaveLength(1)
    const calls = fetchMock.mock.calls.length
    await fiber.dispose()
    expect(b.slots.entries(MAIN)).toEqual([])
    expect(b.slots.entries(RAIL_PANEL)).toEqual([])
    expect(fetchMock.mock.calls.length).toBe(calls)
  })
})
