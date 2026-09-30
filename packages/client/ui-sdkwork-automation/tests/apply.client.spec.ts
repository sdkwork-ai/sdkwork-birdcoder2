/**
 * ui-sdkwork-automation apply wiring: the sidebar quick entry, the page keyed by
 * the `automation` mode id, the Host task catalog the page reads, and the
 * add-task dialog's create channel (a fresh conversation carrying the composed
 * `schedule_create` request). Teardown cascades.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import { SlotRegistry, createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, DISPATCH_TIMEOUT_MS, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-automation/client'
import type {
  AutomationActionInjected, AutomationDraft, AutomationPageInjected, CreateWorkspaceId,
} from '@deepseek-ai/dsh-client-ui-sdkwork-automation/client'
import { AutomationAction } from '../src/client/AutomationAction.tsx'
import { AutomationPage } from '../src/client/AutomationPage.tsx'

const ACTIONS = 'sidebar.actions'
const PAGE = 'mode.page'

const record = (id: string): ScheduleCatalogEntry => ({
  id: id as ScheduleCatalogEntry['id'],
  kind: 'at',
  title: id,
  prompt: id,
  scheduledAt: '2026-10-01T00:00:00.000Z',
  sessionId: 'session-1' as SessionId,
  status: 'active',
})

/** One complete dialog draft; the run time is what a timed frequency needs. */
function draft(over: Partial<AutomationDraft> = {}): AutomationDraft {
  return {
    title: 'draft-title',
    prompt: 'draft-prompt',
    frequency: 'once',
    runAt: '2026-10-01T09:30',
    intervalValue: 1,
    intervalUnit: 'hour',
    validity: 'forever',
    untilDate: '',
    style: 'balanced',
    pushWorkBuddy: false,
    pushWecomBot: false,
    workspaceId: undefined,
    ...over,
  }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const layout = { setMode: vi.fn(), openPanel: vi.fn(), closePanel: vi.fn() }
  ctx.provide('layout', layout)
  const catalog = vi.fn(async () => ({ ok: true, value: [record('task-1')] }))
  const remove = vi.fn(async (request: { readonly id: string }) => ({
    ok: true, value: { id: request.id, deleted: true },
  }))
  const history = vi.fn()
  const update = vi.fn()
  const listen = vi.fn(() => () => {})
  ctx.provide('remote', { schedule: { catalog, delete: remove, history, update }, $on: listen } as never)
  ctx.provide('remote.schedule', { catalog, delete: remove, history, update } as never)
  // Only the faces the create channel reads: the Session list it diffs, and the
  // scope-to-face resolution it sends the prompt through.
  const sessions = {
    list: createSnapshotStore<SessionListState>(
      { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }),
    scope: vi.fn(),
    sessionOf: vi.fn(),
  }
  ctx.provide('sessions', sessions as never)
  const workspaces = {
    list: createSnapshotStore<WorkspaceSnapshot>({
      items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    }),
  }
  ctx.provide('workspaces', workspaces as never)
  const uiWorkspace = { startSession: vi.fn(), openSession: vi.fn() }
  ctx.provide('uiWorkspace', uiWorkspace as never)
  // Stand in for the sidebar shell and the frame: the root declares the sidebar
  // seat and the keyed page seat, the shell entry declares the actions seat.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  slots.register(
    { name: 'root', children: { 'sidebar': { kind: 'single', scope: 'root' }, [PAGE]: { kind: 'keyed', scope: 'root' } } } as never,
    () => null,
  )
  slots.register(
    { name: 'sidebar', children: { [ACTIONS]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  return { ctx, slots, layout, catalog, remove, history, update, listen, sessions, workspaces, uiWorkspace }
}

/** The injected page face of a mounted plugin. */
async function pageFace(b: Awaited<ReturnType<typeof bench>>): Promise<AutomationPageInjected> {
  await b.ctx.plugin({ inject: [...inject], apply }).await()
  const [page] = b.slots.entries(PAGE)
  return (page.inject as unknown as () => AutomationPageInjected)()
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ui-sdkwork-automation apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual([
      'slots', 'locale', 'layout', 'remote', 'remote.schedule', 'sessions', 'workspaces', 'uiWorkspace',
    ])
  })

  it('registers the sidebar entry and the page keyed by the automation mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [action] = b.slots.entries(ACTIONS)
    expect(action?.options.id).toBe('sdkwork-automation')
    expect(action?.options.order).toBe(30)
    expect(action?.component).toBe(AutomationAction)
    expect(action?.locale).toBe('automation')
    const injected = (action.inject as unknown as () => AutomationActionInjected)()
    injected.setMode()
    // The entry opens the module as a code-surface overlay: the rail selection
    // stays `code` (the code rail entry keeps its highlight), so it drives
    // openPanel rather than a mode switch.
    expect(b.layout.openPanel).toHaveBeenCalledWith('automation')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('automation')
    expect(page?.component).toBe(AutomationPage)
    expect((page.inject as unknown as () => AutomationPageInjected)().mode).toBe('automation')
  })

  it('reads the Host catalog on subscription and re-reads it when the task set or the connection moves', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(b.catalog).toHaveBeenCalledTimes(1) })
    expect(b.listen).toHaveBeenCalledWith('schedule/changed', expect.any(Function))
    b.ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(b.catalog).toHaveBeenCalledTimes(2) })
    expect(injected.hooks.catalog.getSnapshot().records).toEqual([record('task-1')])
    stop()
  })

  it('deletes a shown task through its original Session binding and refreshes the catalog', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    b.catalog.mockResolvedValue({ ok: true, value: [] })
    await expect(injected.onDelete(record('task-1').id)).resolves.toBe('deleted')
    expect(b.remove).toHaveBeenCalledWith({ sessionId: 'session-1', id: 'task-1' })
    stop()
  })

  it('settles a task the catalog no longer holds without asking the Host to delete it', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    await expect(injected.onDelete(record('missing').id)).resolves.toBe('deleted')
    expect(b.remove).not.toHaveBeenCalled()
    stop()
  })

  it('forwards one task-history read to the Schedule Remote', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const request = { sessionId: 'session-1' as SessionId, id: record('task-1').id, limit: 20 }
    b.history.mockResolvedValue({
      ok: true,
      value: {
        id: request.id, records: [], earlierRecordsUnavailable: false, earlierRecordsPruned: false,
        retention: { days: 30, records: 200 },
      },
    })
    await injected.loadHistory(request)
    expect(b.history).toHaveBeenCalledWith(request)
  })

  it('reads the catalog back after an accepted update and after a conflict, but not after a failure', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    const expected = { id: record('task-1').id, kind: 'at' as const, title: 'task-1', prompt: 'task-1', scheduledAt: '2026-10-01T00:00:00.000Z' }
    const request = { sessionId: 'session-1' as SessionId, id: expected.id, expected, change: { kind: 'every' as const, every_seconds: 3_600 } }

    // An accepted write moved the durable state, so its acknowledgement re-reads.
    b.update.mockResolvedValueOnce({ ok: true, value: { id: expected.id, updated: true, record: expected } })
    let reads = b.catalog.mock.calls.length
    await expect(injected.onUpdateTiming(request)).resolves.toMatchObject({ ok: true })
    await vi.waitFor(() => { expect(b.catalog.mock.calls.length).toBe(reads + 1) })

    // Each non-mutating miss states the record moved too, so the shown rule is
    // re-read rather than left describing a record the Host no longer holds.
    for (const code of ['schedule_conflict', 'schedule_ended', 'schedule_not_found'] as const) {
      b.update.mockResolvedValueOnce({ ok: true, value: { id: expected.id, updated: false, code } })
      reads = b.catalog.mock.calls.length
      await injected.onUpdateTiming(request)
      await vi.waitFor(() => { expect(b.catalog.mock.calls.length).toBe(reads + 1) })
    }

    // A rejected update establishes nothing, so the retained rows stand.
    b.update.mockResolvedValueOnce({ ok: false, error: { code: 'gateway/service-unavailable', message: 'offline' } })
    reads = b.catalog.mock.calls.length
    await injected.onUpdateTiming(request)
    expect(b.catalog.mock.calls.length).toBe(reads)
    stop()
  })

  it('opens an available original conversation and refuses an archived or missing one', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const sessionId = 'session-9' as SessionId

    // The Host list does not carry it, so browsing the link navigates nowhere.
    injected.onOpenSession(sessionId)
    expect(b.uiWorkspace.openSession).not.toHaveBeenCalled()

    b.sessions.list.set({ ...b.sessions.list.getSnapshot(), ids: [sessionId] })
    injected.onOpenSession(sessionId)
    expect(b.uiWorkspace.openSession).toHaveBeenCalledWith(sessionId)

    // An archived Session stays archived: the link never unarchives it.
    b.workspaces.list.set({ ...b.workspaces.list.getSnapshot(), archivedSessionIds: [sessionId] })
    b.uiWorkspace.openSession.mockClear()
    injected.onOpenSession(sessionId)
    expect(b.uiWorkspace.openSession).not.toHaveBeenCalled()
  })

  it('creates a task by sending the composed request into the fresh conversation', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const sessionId = 'session-2' as SessionId
    const prompt = vi.fn(async () => ({ ok: true, value: { accepted: true } }))
    b.sessions.scope.mockReturnValue({ sessionId })
    b.sessions.sessionOf.mockReturnValue({ prompt })

    injected.onCreateTask(draft())
    // The frame leaves the overlay and runs the shared New Session action.
    expect(b.layout.closePanel).toHaveBeenCalledTimes(1)
    expect(b.uiWorkspace.startSession).toHaveBeenCalledTimes(1)
    expect(prompt).not.toHaveBeenCalled()

    // The fresh session lands on the list; the dispatch observes it and sends
    // the request into its face.
    b.sessions.list.set({ ...b.sessions.list.getSnapshot(), ids: [sessionId] })
    await vi.waitFor(() => { expect(prompt).toHaveBeenCalledTimes(1) })
    const [blocks, mode] = prompt.mock.calls[0] as unknown as [readonly { text: string }[], string]
    expect(mode).toBe('queue')
    expect(blocks[0]?.text).toContain('draft-title')
    expect(blocks[0]?.text).toContain('draft-prompt')
  })

  it('starts the fresh conversation in the workspace the dialog chose', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const sessionId = 'session-6' as SessionId
    const prompt = vi.fn(async () => ({ ok: true, value: { accepted: true } }))
    b.sessions.scope.mockReturnValue({ sessionId })
    b.sessions.sessionOf.mockReturnValue({ prompt })

    injected.onCreateTask(draft({ workspaceId: 'ws-beta' as CreateWorkspaceId }))
    expect(b.uiWorkspace.startSession).toHaveBeenCalledWith('ws-beta')
    b.sessions.list.set({ ...b.sessions.list.getSnapshot(), ids: [sessionId] })
    await vi.waitFor(() => { expect(prompt).toHaveBeenCalledTimes(1) })
  })

  it('refuses a draft that names no run time instead of dispatching a request', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    injected.onCreateTask(draft({ runAt: '' }))
    expect(b.layout.closePanel).not.toHaveBeenCalled()
    expect(b.uiWorkspace.startSession).not.toHaveBeenCalled()
  })

  it('gives up when no session lands, and again when the landed session has no face', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    injected.onCreateTask(draft())
    await vi.advanceTimersByTimeAsync(DISPATCH_TIMEOUT_MS)
    expect(warn).toHaveBeenCalledWith('[automation] prompt dispatch skipped: no session landed')

    // A session the runtime cannot resolve a face for is reported, not prompted.
    vi.useRealTimers()
    const sessionId = 'session-3' as SessionId
    b.sessions.scope.mockReturnValue(undefined)
    injected.onCreateTask(draft())
    b.sessions.list.set({ ...b.sessions.list.getSnapshot(), ids: [sessionId] })
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(`[automation] prompt dispatch skipped: session ${sessionId} has no face`)
    })
  })

  it('ignores a Session-list tick that reports no newly arrived session', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prompt = vi.fn(async () => ({ ok: true, value: { accepted: true } }))
    b.sessions.scope.mockReturnValue({ sessionId: 'session-x' as SessionId })
    b.sessions.sessionOf.mockReturnValue({ prompt })

    vi.useFakeTimers()
    injected.onCreateTask(draft())
    // A tick that publishes the same Session list cannot answer for the Session
    // the flow started, so the wait runs to its bound and states that instead.
    b.sessions.list.set({ ...b.sessions.list.getSnapshot() })
    await vi.advanceTimersByTimeAsync(DISPATCH_TIMEOUT_MS)
    expect(prompt).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[automation] prompt dispatch skipped: no session landed')
  })

  it('reports a refused prompt and a lost prompt without leaving the frame elsewhere', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sessionId = 'session-4' as SessionId
    b.sessions.scope.mockReturnValue({ sessionId })
    b.sessions.sessionOf.mockReturnValue({
      prompt: vi.fn(async () => ({ ok: false, error: { code: 'busy', message: 'queue is full' } })),
    })
    injected.onCreateTask(draft())
    b.sessions.list.set({ ...b.sessions.list.getSnapshot(), ids: [sessionId] })
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('[automation] prompt dispatch failed: busy: queue is full')
    })

    // A rejected prompt never reached the conversation, so the outcome is stated
    // rather than swallowed.
    const lost = new Error('connection lost')
    b.sessions.sessionOf.mockReturnValue({ prompt: vi.fn(async () => { throw lost }) })
    injected.onCreateTask(draft())
    b.sessions.list.set({ ...b.sessions.list.getSnapshot(), ids: [sessionId, 'session-5' as SessionId] })
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('[automation] prompt dispatch failed:', lost)
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
