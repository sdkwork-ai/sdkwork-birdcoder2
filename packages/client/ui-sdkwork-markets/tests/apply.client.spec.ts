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
  return { ctx, slots, layout, sessions, workspaces }
}

describe('ui-sdkwork-markets apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout', 'sessions', 'workspaces', 'env', 'iam', 'theme'])
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
    const injected = (page!.inject as unknown as () => MarketsPageInjected)()
    expect(injected.mode).toBe('markets')
    expect(typeof injected.dispatchPrompt).toBe('function')
    // The page is public: its injection carries no IAM session face.
    expect('authGate' in injected).toBe(false)
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
