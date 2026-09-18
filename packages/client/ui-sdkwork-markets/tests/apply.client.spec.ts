// @vitest-environment jsdom
/** ui-sdkwork-markets apply wiring: the sidebar quick entry and the public
 * market page, the page keyed by the `markets` mode id, registered once their
 * slot declarations are on the ledger; teardown cascades. The page's
 * injection also carries the create/add prompt dispatch over the sessions
 * and workspaces services. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SlotRegistry, createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-markets/client'
import type {
  MarketsPageInjected,
} from '@deepseek-ai/dsh-client-ui-sdkwork-markets/client'
import { MarketsAction } from '../src/client/MarketsAction.tsx'
import { MarketsPage } from '../src/client/MarketsPage.tsx'

const ACTIONS = 'sidebar.actions'
const PAGE = 'mode.page'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const layout = { setMode: vi.fn(), openPanel: vi.fn(), closePanel: vi.fn() }
  ctx.provide('layout', layout)
  // The sessions/workspaces doubles: only the faces the dispatch reads.
  const sessions = {
    list: createSnapshotStore<SessionListState>(
      { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined }),
    scope: vi.fn(),
    sessionOf: vi.fn(),
  }
  ctx.provide('sessions', sessions)
  const workspaces = { startSession: vi.fn() }
  ctx.provide('workspaces', workspaces)
  // The SDKWork host adapter doubles: the adapter never mounts its App Store
  // runtime in this spec, so only the service keys the apply body reads.
  const env = {
    apiBaseUrl: () => '',
    accessToken: () => '',
    subscribe: () => () => {},
  }
  ctx.provide('env', env)
  const iam = {
    controller: {
      getState: () => ({ session: null }),
      subscribe: () => () => {},
    },
  }
  ctx.provide('iam', iam)
  const theme = {
    getTheme: () => ({ active: { colorScheme: 'light' as const } }),
  }
  ctx.provide('theme', theme)
  // The store's read path: a Host inventory Remote double, the manager Remote
  // double (roster + bundles + writes), and a settings scope double. The
  // inventory answers one empty snapshot; the scope serves no namespace, so
  // every row reads as not-yet-configurable. The `remote` root carries the
  // `$on` face the store subscribes its three Host events through, alongside
  // the dotted namespaces.
  const remote = {
    $on: vi.fn(() => () => {}),
    pluginInventory: {
      list: vi.fn(async () => ({
        ok: true as const,
        value: { entries: [], managementAvailable: true },
      })),
    },
    pluginManager: {
      listPlugins: vi.fn(async () => ({ ok: true as const, value: [] })),
      listBundles: vi.fn(async () => ({ ok: true as const, value: [] })),
      setPluginEnabled: vi.fn(async () => ({
        ok: true as const,
        value: { changed: true, application: 'applied', stage: 'enable', target: 'e1' },
      })),
      setBundleEnabled: vi.fn(async () => ({
        ok: true as const,
        value: { changed: true, application: 'applied', stage: 'enable', target: 'b1' },
      })),
      removeBundle: vi.fn(async () => ({
        ok: true as const,
        value: { changed: true, application: 'applied', stage: 'remove', target: 'b1' },
      })),
      inspect: vi.fn(async () => ({
        ok: true as const,
        value: { status: 'accepted', kind: 'registry', name: 'demo-plugin', bundle: true },
      })),
      installBundle: vi.fn(async () => ({
        ok: true as const,
        value: { changed: true, application: 'applied', stage: 'enable', target: 'demo-plugin', bundle: 'demo-plugin' },
      })),
      cancelInstall: vi.fn(async () => ({ ok: true as const, value: { status: 'cancelled' } })),
    },
  }
  ctx.provide('remote', remote as never)
  ctx.provide('remote.pluginInventory', remote.pluginInventory as never)
  const pluginManager = remote.pluginManager
  ctx.provide('remote.pluginManager', pluginManager as never)
  const settingsScope = {
    describe: () => ({
      getSnapshot: () => ({ view: { namespaces: [] } }),
      subscribe: () => () => {},
      ensure: async () => {},
      acceptView: () => {},
    }),
  }
  ctx.provide('settingsScope', settingsScope)
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  if (declare) {
    // Stand in for the sidebar shell and the frame: the root declares the
    // sidebar seat and the keyed page seat, the shell entry declares the
    // actions list seat.
    slots.register(
      { name: 'root', children: { 'sidebar': { kind: 'single', scope: 'root' }, [PAGE]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
    slots.register(
      { name: 'sidebar', children: { [ACTIONS]: { kind: 'list', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots, layout, sessions, workspaces, manager: pluginManager, remote }
}
describe('ui-sdkwork-markets apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual([
      'slots', 'locale', 'layout', 'sessions', 'workspaces', 'env', 'iam', 'theme',
      'remote', 'remote.pluginInventory', 'remote.pluginManager', 'settingsScope',
    ])
  })

  it('registers the sidebar entry and the page keyed by the markets mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    expect(action?.options.id).toBe('sdkwork-markets')
    expect(action?.options.order).toBe(40)
    expect(action?.component).toBe(MarketsAction)
    expect(action?.locale).toBe('markets')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('markets')
    expect(page?.component).toBe(MarketsPage)
    // The market page declares the `plugins.item` seat its official group reads
    // from. Upstream's Plugins page declared it, but this fork keeps that page
    // disabled, so without this declaration the host-plane configuration pages
    // have nowhere to register and the official group silently loses half its
    // membership — a failure that shows up only as a short list, not an error.
    expect(b.slots.spec('plugins.item')).toMatchObject({ kind: 'list', scope: 'root' })
    const injected = (page!.inject as unknown as () => MarketsPageInjected)()
    expect(injected.mode).toBe('markets')
    expect(typeof injected.dispatchPrompt).toBe('function')
    // The official group's second source rides the same injection: the
    // configuration entries read from the `plugins.item` ledger. With no
    // registrant on that ledger the list is empty, not absent. (The entries'
    // own views are drawn through the page's child-slot render face, which
    // the renderer supplies as a prop — never through the injection.)
    expect(Array.isArray(injected.items)).toBe(true)
    expect(injected.items).toEqual([])
    expect('renderItem' in injected).toBe(false)
    // The page is public: its injection carries no IAM session face.
    expect('authGate' in injected).toBe(false)
    // The plugin store is the page's one read/write face, wired from both
    // Remotes and already subscribed to the Host's three plugin events (plus
    // the connection reset) so a change from any surface lands here.
    const store = injected.store
    await store.refresh()
    const state = store.getSnapshot()
    expect(state.read.status).toBe('ready')
    expect(b.remote.$on).toHaveBeenCalledWith('plugin-manager/changed', expect.any(Function))
    expect(b.remote.$on).toHaveBeenCalledWith('plugin-manager/install-state', expect.any(Function))
    expect(b.remote.$on).toHaveBeenCalledWith('plugin-manager/install-log', expect.any(Function))
    // The write face unwraps the RemoteResult, so the page never handles the
    // transport envelope itself.
    await expect(store.setPluginEnabled('e1' as never, false)).resolves.toMatchObject({
      changed: true, application: 'applied',
    })
    expect(b.manager.setPluginEnabled).toHaveBeenCalledWith('e1', false)
  })

  it('reads the official configuration entries off the live slot ledger', async () => {
    // The official group's second source is the `plugins.item` ledger. The
    // registrants are other plugins (in a stock deployment the host-plane
    // configuration pages: Shell, Agent loop, Subagent, Web search), so this
    // spec registers real entries on a real registry and checks that the
    // page's injected face observes them — the join between the two halves.
    const b = await bench(false)
    // The root declares the page seat; the market page declares `plugins.item`
    // itself, which is exactly what lets the registrants below land.
    b.slots.register(
      {
        name: 'root',
        children: { [PAGE]: { kind: 'keyed', scope: 'root' } },
      } as never,
      () => null,
    )
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    // A registrant lands its entry, declaring its own order and title.
    b.slots.register({
      name: 'plugins.item', id: 'web-search', order: 40, label: () => 'Web search',
    } as never, () => null)
    b.slots.register({
      name: 'plugins.item', id: 'bash', order: 10, label: () => 'Shell',
    } as never, () => null)

    const [page] = b.slots.entries(PAGE)
    const injected = (page!.inject as unknown as () => MarketsPageInjected)()
    // The injected list is the ledger's own order, not the registration order.
    expect(injected.items.map(item => item.id)).toEqual(['bash', 'web-search'])
    expect(injected.items.map(item => item.label)).toEqual(['Shell', 'Web search'])
    // The entries' own views reach the panel through the page's props face
    // (`PropsRenderSlots<'plugins.item'>`), not through the injection: the
    // ctx-level renderSlot only serves `root`, so a call here would throw.
    expect('renderItem' in injected).toBe(false)
  })

  it('raises a failed manager write instead of reporting an absent outcome', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [page] = b.slots.entries(PAGE)
    const injected = (page!.inject as unknown as () => MarketsPageInjected)()
    b.manager.setPluginEnabled.mockResolvedValueOnce({
      ok: false,
      error: { code: 'unavailable', message: 'no profile' },
    } as never)
    await expect(injected.store.setPluginEnabled('e1' as never, true)).rejects.toThrow(/setPluginEnabled/)
  })

  it('covers the bundle and install faces through the same unwrapped store', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [page] = b.slots.entries(PAGE)
    const store = (page!.inject as unknown as () => MarketsPageInjected)().store

    // Bundle-layer write, bundle uninstall, and the install pair all reach
    // their own manager method and unwrap its envelope the same way.
    await expect(store.setBundleEnabled('demo-bundle', false)).resolves.toMatchObject({ application: 'applied' })
    expect(b.manager.setBundleEnabled).toHaveBeenCalledWith('demo-bundle', false)
    await expect(store.removeBundle('demo-bundle')).resolves.toMatchObject({ stage: 'remove' })
    expect(b.manager.removeBundle).toHaveBeenCalledWith('demo-bundle')

    // Opening the dialog, inspecting, then installing: the store carries the
    // inspection result and the settled bundle onto the session.
    store.openInstall('@scope/demo')
    await store.inspectInstall()
    expect(store.getSnapshot().install?.inspection).toMatchObject({ status: 'accepted', name: 'demo-plugin' })
    await store.runInstall()
    expect(b.manager.installBundle).toHaveBeenCalledWith('@scope/demo', expect.objectContaining({
      requestId: expect.any(String),
    }))
    expect(store.getSnapshot().install).toMatchObject({ phase: 'done', bundle: 'demo-plugin' })
  })

  it('refuses an inspect that names a problem, without installing anything', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [page] = b.slots.entries(PAGE)
    const store = (page!.inject as unknown as () => MarketsPageInjected)().store
    b.manager.inspect.mockResolvedValueOnce({
      ok: true,
      value: { status: 'refused', problem: 'already-installed', reason: 'already there' },
    } as never)

    store.openInstall('demo-plugin')
    await store.inspectInstall()
    const install = store.getSnapshot().install
    expect(install?.problem).toEqual({ problem: 'already-installed', reason: 'already there' })
    expect(install?.inspection).toBeUndefined()
    // Nothing was installed: the refusal is a pre-check, not a failed run.
    expect(b.manager.installBundle).not.toHaveBeenCalled()
  })

  it('rejects an install whose manager call fails, carrying the transport word', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [page] = b.slots.entries(PAGE)
    const store = (page!.inject as unknown as () => MarketsPageInjected)().store
    b.manager.installBundle.mockResolvedValueOnce({
      ok: false,
      error: { code: 'timeout', message: 'pnpm took too long' },
    } as never)

    store.openInstall('demo-plugin')
    await store.runInstall()
    const install = store.getSnapshot().install
    expect(install?.phase).toBe('failed')
    // The line a person reads is the Host's own message, prefixed with the
    // call it came from — never a generic "something went wrong".
    expect(install?.detail).toContain('pnpm took too long')
    expect(install?.detail).toContain('pluginManager.installBundle')
  })

  it('dispatches a prompt: new session flow, then the prompt into the landed face', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [page] = b.slots.entries(PAGE)
    const injected = (page!.inject as unknown as () => MarketsPageInjected)()

    // A fresh session's face accepts the prompt.
    const sessionId = 'session-1' as SessionId
    const session = { prompt: vi.fn().mockResolvedValue({ ok: true, value: { accepted: true } }) }
    b.sessions.scope.mockReturnValue({ sessionId })
    b.sessions.sessionOf.mockReturnValue(session)

    injected.dispatchPrompt('prompt.create')
    // The flow switched the frame to the conversation surface and ran the
    // shared New Session action.
    expect(b.layout.setMode).toHaveBeenCalledWith('code')
    expect(b.workspaces.startSession).toHaveBeenCalledTimes(1)

    // The fresh session lands on the list (the connect resolves); the
    // dispatch's wait observes it and sends the prompt into the face.
    b.sessions.list.set({ ...b.sessions.list.getSnapshot(), ids: [sessionId], current: sessionId })
    await vi.waitFor(() => {
      expect(session.prompt).toHaveBeenCalledWith([{ type: 'text', text: 'prompt.create' }], 'queue')
    })
  })

  it('teardown removes the entries and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(ACTIONS)).toHaveLength(1)
    expect(b.slots.entries(PAGE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(ACTIONS)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
  })
})
