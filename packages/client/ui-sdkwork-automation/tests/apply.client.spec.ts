/**
 * ui-sdkwork-automation apply wiring: the sidebar quick entry, the page keyed by
 * the `automation` mode id, the Host task catalog the page reads, and the
 * add-task dialog's create channel — one `schedule/create` Remote write followed
 * by the catalog read that shows the stored task. Teardown cascades.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ScheduleCatalogEntry, ScheduleCreateRequest } from '@deepseek-ai/dsh-schedule/client'
import { SlotRegistry, createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-sdkwork-automation/client'
import type {
  AutomationActionInjected, AutomationDraft, AutomationPageInjected, CreateWorkspaceOption,
} from '@deepseek-ai/dsh-client-ui-sdkwork-automation/client'
import { AutomationAction } from '../src/client/AutomationAction.tsx'
import { AutomationPage } from '../src/client/AutomationPage.tsx'

const ACTIONS = 'sidebar.actions'
const PAGE = 'mode.page'

const SESSION = 'session-1' as SessionId

/**
 * One catalog entry. The Host stores a task's destination as a `target` rather
 * than as "the Session this task belongs to", so the row names an existing
 * Session there and lists it among the Sessions told about later changes.
 * @param id - task identity.
 * @returns catalog row whose deliveries land in {@link SESSION}.
 */
const record = (id: string): ScheduleCatalogEntry => ({
  id: id as ScheduleCatalogEntry['id'],
  kind: 'at',
  title: id,
  prompt: id,
  scheduledAt: '2026-10-01T00:00:00.000Z',
  target: { kind: 'session', sessionId: SESSION },
  involvedSessionIds: [SESSION],
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
    workspace: undefined,
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
  const create = vi.fn(async (_request: ScheduleCreateRequest) => ({ ok: true, value: record('task-new') }))
  const run = vi.fn(async (_request: { readonly id: string }) => ({ ok: true, value: record('task-1') }))
  const history = vi.fn()
  const edit = vi.fn()
  const listen = vi.fn((_event?: string, _listener?: () => void) => () => {})
  const schedule = { catalog, delete: remove, create, run, history, edit }
  ctx.provide('remote', { schedule, $on: listen } as never)
  ctx.provide('remote.schedule', schedule as never)
  // Only the faces the linked-conversation action reads: the Session list and
  // the Workspace snapshot it checks availability against.
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
  return {
    ctx, slots, layout, catalog, remove, create, run, history, edit, listen, sessions, workspaces, uiWorkspace,
  }
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

  it('re-reads the catalog when the Host announces a task change', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    // The catalog forwards the Host's own `schedule/changed` notice into this
    // read, which is how a task that ran without the page writing it appears.
    const changed = b.listen.mock.calls.find(([event]) => event === 'schedule/changed')?.[1]
    expect(changed).toBeDefined()
    const reads = b.catalog.mock.calls.length
    changed?.()
    await vi.waitFor(() => { expect(b.catalog.mock.calls.length).toBe(reads + 1) })
    stop()
  })

  it('deletes a shown task as one edit against the revision the catalog read', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    b.catalog.mockResolvedValue({ ok: true, value: [] })
    b.edit.mockResolvedValue({ ok: true, value: { id: 'task-1', deleted: true } })
    await expect(injected.onDelete(record('task-1').id)).resolves.toBe('deleted')
    // Deletion is the same closed edit as an update: identity, action, revision.
    expect(b.edit).toHaveBeenCalledWith({ id: 'task-1', action: 'delete', expectedUpdatedAt: null })
    stop()
  })

  it('settles a task the catalog no longer holds without asking the Host to delete it', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    await expect(injected.onDelete(record('missing').id)).resolves.toBe('deleted')
    expect(b.edit).not.toHaveBeenCalled()
    stop()
  })

  it('forwards one task-history read to the Schedule Remote', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const request = { id: record('task-1').id, limit: 20 }
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

  it('reads the catalog back after an accepted edit and after a conflict, but not after a failure', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    const task = record('task-1')
    const request = { id: task.id, action: 'update' as const, patch: { title: 'renamed' } }

    // An accepted edit answers with the stored row, which moved the durable
    // state, so its acknowledgement re-reads.
    b.edit.mockResolvedValueOnce({ ok: true, value: { ...task, title: 'renamed' } })
    let reads = b.catalog.mock.calls.length
    await expect(injected.onUpdateTiming(request)).resolves.toMatchObject({ ok: true })
    await vi.waitFor(() => { expect(b.catalog.mock.calls.length).toBe(reads + 1) })

    // Each non-mutating miss states the record moved too, so the shown rule is
    // re-read rather than left describing a record the Host no longer holds.
    for (const code of ['schedule_conflict', 'schedule_not_found'] as const) {
      b.edit.mockResolvedValueOnce({ ok: true, value: { id: task.id, code } })
      reads = b.catalog.mock.calls.length
      await injected.onUpdateTiming(request)
      await vi.waitFor(() => { expect(b.catalog.mock.calls.length).toBe(reads + 1) })
    }

    // A rejected edit establishes nothing, so the retained rows stand.
    b.edit.mockResolvedValueOnce({ ok: false, error: { code: 'gateway/service-unavailable', message: 'offline' } })
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

  it('writes the composed request and reads the catalog back before reporting the stored task', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    const reads = b.catalog.mock.calls.length

    const outcome = await injected.onCreateTask(draft())
    expect(outcome).toEqual({ created: record('task-new') })
    // One Remote write carries the whole draft: no conversation, no prompt.
    expect(b.create).toHaveBeenCalledTimes(1)
    expect(b.create.mock.calls[0]?.[0]).toMatchObject({
      title: 'draft-title',
      prompt: expect.stringContaining('draft-prompt'),
      timing: { kind: 'at', at: { date: '2026-10-01', time: '09:30:00', time_zone: expect.any(String) } },
      target: { kind: 'new_once', create: {} },
    })
    expect(b.uiWorkspace.startSession).not.toHaveBeenCalled()
    // The accepted write moved the durable set, so its acknowledgement re-reads.
    await vi.waitFor(() => { expect(b.catalog.mock.calls.length).toBe(reads + 1) })
    stop()
  })

  it('starts the created conversation in the workspace the dialog chose', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const workspace: CreateWorkspaceOption = {
      id: 'ws-beta' as CreateWorkspaceOption['id'], label: 'Beta', cwd: '/work/beta',
    }
    await injected.onCreateTask(draft({ workspace }))
    expect(b.create.mock.calls[0]?.[0]?.target).toEqual({ kind: 'new_once', create: { cwd: '/work/beta' } })
  })

  it('refuses a draft that names no run time instead of writing it', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    await expect(injected.onCreateTask(draft({ runAt: '' }))).resolves.toEqual({ failed: 'rule' })
    expect(b.create).not.toHaveBeenCalled()
  })

  it('runs one task now and reads the execution state back', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })
    const reads = b.catalog.mock.calls.length

    await expect(injected.onRunTask(record('task-1').id)).resolves.toEqual({ queued: true })
    expect(b.run).toHaveBeenCalledWith({ id: 'task-1' })
    // The admitted delivery moved the execution slot the row shows, so the
    // acknowledgement re-reads the catalog.
    await vi.waitFor(() => { expect(b.catalog.mock.calls.length).toBe(reads + 1) })
    stop()
  })

  it('reports each refused run it can distinguish', async () => {
    const b = await bench()
    const injected = await pageFace(b)

    b.run.mockResolvedValueOnce({ ok: true, value: { id: 'task-1', code: 'schedule_execution_pending' } } as never)
    await expect(injected.onRunTask(record('task-1').id)).resolves.toEqual({ queued: false, code: 'pending' })

    b.run.mockResolvedValueOnce({ ok: true, value: { id: 'task-1', code: 'schedule_not_found' } } as never)
    await expect(injected.onRunTask(record('task-1').id)).resolves.toEqual({ queued: false, code: 'missing' })

    b.run.mockResolvedValueOnce({
      ok: false,
      error: { code: 'schedule/target-archived', message: 'archived', details: { sessionId: SESSION } },
    } as never)
    await expect(injected.onRunTask(record('task-1').id)).resolves.toEqual({ queued: false, code: 'archived' })

    b.run.mockResolvedValueOnce({
      ok: false,
      error: { code: 'gateway/service-unavailable', message: 'offline', details: {} },
    } as never)
    await expect(injected.onRunTask(record('task-1').id)).resolves.toEqual({ queued: false, code: 'failed' })

    b.run.mockRejectedValueOnce(new Error('connection lost'))
    await expect(injected.onRunTask(record('task-1').id)).resolves.toEqual({ queued: false, code: 'failed' })
  })

  it('pauses and resumes one task against the revision the catalog read', async () => {
    const b = await bench()
    const injected = await pageFace(b)
    const stop = injected.hooks.catalog.subscribe(() => {})
    await vi.waitFor(() => { expect(injected.hooks.catalog.getSnapshot().status).toBe('ready') })

    b.edit.mockResolvedValue({ ok: true, value: { ...record('task-1'), status: 'paused' } })
    await expect(injected.onSetActive(record('task-1'), false)).resolves.toEqual({ saved: true })
    expect(b.edit).toHaveBeenCalledWith({
      id: 'task-1', action: 'update', patch: { active: false }, expectedUpdatedAt: null,
    })

    // A refused write and a rejection both leave the stored lifecycle state alone.
    b.edit.mockResolvedValueOnce({ ok: false, error: { code: 'schedule/input-invalid', message: 'no', details: { code: 'invalid_rule' } } as never })
    await expect(injected.onSetActive(record('task-1'), true)).resolves.toEqual({ saved: false })
    b.edit.mockRejectedValueOnce(new Error('offline'))
    await expect(injected.onSetActive(record('task-1'), true)).resolves.toEqual({ saved: false })
    stop()
  })

  it('reports the correction each Host refusal asks for, and a transport miss as an unclassified failure', async () => {
    const b = await bench()
    const injected = await pageFace(b)

    b.create.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'schedule/input-invalid', message: 'not future',
        details: { code: 'not_future' },
      },
    } as never)
    await expect(injected.onCreateTask(draft())).resolves.toEqual({ failed: 'notFuture' })

    b.create.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'schedule/input-invalid', message: 'bad title',
        details: { code: 'invalid_prompt' },
      },
    } as never)
    await expect(injected.onCreateTask(draft())).resolves.toEqual({ failed: 'title' })

    b.create.mockResolvedValueOnce({
      ok: false,
      error: { code: 'gateway/service-unavailable', message: 'offline', details: {} },
    } as never)
    await expect(injected.onCreateTask(draft())).resolves.toEqual({ failed: 'host' })

    // A rejected call leaves the write unknown, so it is reported the same way.
    b.create.mockRejectedValueOnce(new Error('connection lost'))
    await expect(injected.onCreateTask(draft())).resolves.toEqual({ failed: 'host' })
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
