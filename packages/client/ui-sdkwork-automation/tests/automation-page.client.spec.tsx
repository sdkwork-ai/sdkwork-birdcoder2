// @vitest-environment jsdom
/**
 * Automation page spec: the tab bar renders the scheduled-tasks view first and
 * the run-history view second; the scheduled view reads the injected catalog
 * observable and lists every retained task with its stored name, status, and
 * next run behind a search field and a status filter, with its own loading,
 * empty, unavailable, and error states; each row deletes in place behind a
 * confirmation; the add-task dialog opens from the toolbar and from the
 * empty-state affordance; and the twelve-card template catalog stays under the
 * list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { AutomationPage, type AutomationPageProps } from '../src/client/AutomationPage.tsx'
import type { CatalogSnapshot } from '../src/client/catalog-source.ts'
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

/** Device zone the cases pin, so a task storing another rule zone is comparable on any host. */
const DEVICE_ZONE = 'Asia/Shanghai'

beforeEach(() => {
  const options = new Intl.DateTimeFormat().resolvedOptions()
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...options, timeZone: DEVICE_ZONE })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Empty global standard-kit hooks (the page reads none). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}

function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

/** Two catalogued Workspaces the create dialog's picker offers. */
function workspacesOf(): WorkspaceSnapshot {
  return {
    items: [
      { workspaceId: 'ws-alpha' as WorkspaceView['workspaceId'], path: '/work/alpha', title: 'Alpha', sessionIds: [], createdAt: '', updatedAt: '' },
      // A blank title falls back to the path, so the picker never shows an unnamed row.
      { workspaceId: 'ws-beta' as WorkspaceView['workspaceId'], path: '/work/beta', title: '   ', sessionIds: [], createdAt: '', updatedAt: '' },
    ],
    archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }
}

/**
 * Locale seat stand-in: dictionary keys render verbatim so assertions read the
 * contract, and a call that passes template values renders them after the key.
 * `time.locale` is the one key that is not copy but the Intl locale tag the
 * time formatters read, so it resolves to a real tag — `Intl` rejects a key.
 */
const t = ((key: string, params?: Record<string, unknown>) => {
  if (key === 'time.locale') return 'en'
  return params === undefined ? key : `${key}(${Object.values(params).join(', ')})`
}) as AutomationPageProps['t']

/** The page reads none of the standard hooks; supply empty kit. */
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = sel => sel({ activePanelId: null })
const standard = {
  useSessions: emptySessions(), useWorkspaces: emptyWorkspaces(),
  useSessionStatus,
  useSessionRetainInfo: () => undefined,
  usePanelInfo, useResource,
}

/** Stored name of the active task. */
const ACTIVE_TITLE = 'Morning briefing'
/** Stored name of the inactive task. */
const INACTIVE_TITLE = 'Evening wrap-up'

/** The first catalog card's copy, as the key-echoing seat renders it. */
const TEMPLATE_TITLE = 'template.news.title'
const TEMPLATE_PROMPT = 'template.news.description'

/** The active daily task: its name, instruction, and Session binding each carry their own query token. */
const active: ScheduleCatalogEntry = {
  id: 'task-morning' as ScheduleId,
  kind: 'daily',
  title: ACTIVE_TITLE,
  prompt: 'Summarize the repository',
  time: '09:00:00.000',
  timeZone: 'UTC',
  scheduledAt: '2026-10-01T09:00:00.000Z',
  sessionId: 'session-alpha' as SessionId,
  status: 'active',
}

/** The inactive one-shot task. */
const inactive: ScheduleCatalogEntry = {
  id: 'task-evening' as ScheduleId,
  kind: 'at',
  title: INACTIVE_TITLE,
  prompt: 'Log the day',
  scheduledAt: '2026-10-02T21:00:00.000Z',
  sessionId: 'session-beta' as SessionId,
  status: 'inactive',
}

/** One mounted page, the catalog store it reads, and its injected callbacks. */
function page(initial: Partial<CatalogSnapshot> = {}, workspaceState?: WorkspaceSnapshot) {
  const catalog = createSnapshotStore<CatalogSnapshot>({
    records: [], status: 'ready', deleting: [], settled: true, readRequest: 0, readSettled: 0, ...initial,
  })
  const workspaceStore = workspaceState === undefined
    ? undefined
    : bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>(workspaceState))
  const onRetry = vi.fn<AutomationPageProps['onRetry']>(async () => {})
  const onDelete = vi.fn<AutomationPageProps['onDelete']>(async () => 'deleted')
  const onUpdateTiming = vi.fn<AutomationPageProps['onUpdateTiming']>(async () => ({
    ok: true,
    value: { id: active.id, updated: true, record: active },
  }))
  const onOpenSession = vi.fn<AutomationPageProps['onOpenSession']>()
  const onCreateTask = vi.fn<AutomationPageProps['onCreateTask']>()
  const loadHistory = vi.fn<AutomationPageProps['loadHistory']>(async request => ({
    ok: true,
    value: {
      id: request.id,
      records: [],
      earlierRecordsUnavailable: false,
      earlierRecordsPruned: false,
      retention: { days: 30, records: 200 },
    },
  }))
  const view = render(
    <AutomationPage
      {...standard}
      useWorkspaces={workspaceStore ?? standard.useWorkspaces}
      mode="automation"
      useCatalog={bindSnapshotSelector(catalog)}
      onRetry={onRetry}
      onDelete={onDelete}
      onUpdateTiming={onUpdateTiming}
      onOpenSession={onOpenSession}
      onCreateTask={onCreateTask}
      loadHistory={loadHistory}
      t={t}
    />,
  )
  return { view, catalog, onRetry, onDelete, onUpdateTiming, onOpenSession, onCreateTask, loadHistory }
}

/** The scheduled view's task list of one render. */
function taskList(view: RenderResult): HTMLElement {
  return within(view.container).getByRole('list', { name: 'list.label' })
}

/** One row of that list, by the task's stored name. */
function taskRow(view: RenderResult, title: string): HTMLElement {
  const row = within(taskList(view)).getAllByRole('listitem')
    .find(item => (item.textContent ?? '').includes(title))
  if (row === undefined) throw new Error(`no task row titled ${title}`)
  return row
}

/** Whether one render lists a row for the given stored name. */
function showsTitle(view: RenderResult, title: string): boolean {
  return within(taskList(view)).queryAllByRole('listitem')
    .some(item => (item.textContent ?? '').includes(title))
}

/** Whether the scheduled panel states exactly the given empty-state copy. */
function states(view: RenderResult, copy: string): boolean {
  return within(view.container).queryByText(copy, { exact: true }) !== null
}

/** One view tab, by its dictionary key. */
function viewTab(view: RenderResult, key: string): HTMLElement {
  const tab = within(within(view.container).getByRole('tablist', { name: 'tabs.label' }))
    .getAllByRole('tab').find(candidate => candidate.textContent === key)
  if (tab === undefined) throw new Error(`no view tab labelled ${key}`)
  return tab
}

/** The row's single removal control, which its in-place confirmation replaces. */
function removalControl(view: RenderResult, title: string): HTMLElement {
  return within(taskRow(view, title)).getByRole('button', { name: t('list.deleteAria', { name: title }) })
}

describe('AutomationPage', () => {
  it('renders the two view tabs with Scheduled selected first', () => {
    const { view } = page()
    const tablist = view.getByRole('tablist', { name: 'tabs.label' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['tab.scheduled', 'tab.runs'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
  })

  it('shows the loading state and no rows before the first read settles', () => {
    const { view } = page({ status: 'loading', settled: false })
    expect(view.getByRole('status').textContent).toBe('list.loading')
    expect(within(taskList(view)).queryAllByRole('listitem')).toHaveLength(0)
    expect(states(view, 'list.empty')).toBe(false)
    expect(taskList(view).getAttribute('aria-busy')).toBe('true')
  })

  it('keeps the last settled records visible while a refresh reads', () => {
    const { view } = page({ records: [active, inactive], status: 'loading', settled: true })
    expect(view.queryByRole('status')).toBeNull()
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(true)
  })

  it('renders each stored record with its name, status, and next run', () => {
    const { view } = page({ records: [active, inactive] })
    expect(within(taskList(view)).getAllByRole('listitem')).toHaveLength(2)

    const running = taskRow(view, ACTIVE_TITLE)
    expect(running.textContent).toContain(ACTIVE_TITLE)
    expect(running.textContent).toContain('list.nextPrefix')
    expect(running.textContent).not.toContain('status.inactive')
    expect(running.querySelector('time')?.getAttribute('dateTime')).toBe(active.scheduledAt)

    const ended = taskRow(view, INACTIVE_TITLE)
    expect(ended.textContent).toContain(INACTIVE_TITLE)
    expect(ended.textContent).toContain('status.inactive')
    expect(ended.textContent).not.toContain('list.nextPrefix')
    expect(ended.querySelector('time')).toBeNull()
  })

  it('filters the rows through the status group', () => {
    const { view } = page({ records: [active, inactive] })
    const group = view.getByRole('group', { name: 'statusFilter.label' })
    expect(within(group).getAllByRole('button').map(button => button.textContent))
      .toEqual(['statusFilter.all', 'status.active', 'status.inactive'])

    fireEvent.click(within(group).getByRole('button', { name: 'status.active' }))
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(false)

    fireEvent.click(within(group).getByRole('button', { name: 'status.inactive' }))
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(false)

    fireEvent.click(within(group).getByRole('button', { name: 'statusFilter.all' }))
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(true)
  })

  it('searches the stored name, the instruction, and the session id, and clears', () => {
    const { view } = page({ records: [active, inactive] })
    const field = view.getByRole('searchbox', { name: 'search.label' })
    expect(view.queryByRole('button', { name: 'search.clear' })).toBeNull()

    fireEvent.change(field, { target: { value: 'morning' } })
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(false)

    fireEvent.change(field, { target: { value: 'repository' } })
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(false)

    fireEvent.change(field, { target: { value: 'beta' } })
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(false)

    fireEvent.change(field, { target: { value: 'zzz' } })
    expect(within(taskList(view)).queryAllByRole('listitem')).toHaveLength(0)
    expect(states(view, 'list.noMatches')).toBe(true)

    fireEvent.click(view.getByRole('button', { name: 'search.clear' }))
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(true)
  })

  it('shows the first-task empty state with the add affordance', () => {
    const { view } = page()
    expect(states(view, 'list.empty')).toBe(true)
    expect(view.getByRole('button', { name: 'empty.scheduled.action' })).not.toBeNull()
  })

  it('distinguishes an inactive-only empty state from a query with no matches', () => {
    const filtered = page({ records: [active] })
    fireEvent.click(within(filtered.view.container).getByRole('button', { name: 'status.inactive' }))
    expect(states(filtered.view, 'list.emptyInactive')).toBe(true)
    expect(states(filtered.view, 'list.noMatches')).toBe(false)

    const excluded = page({ records: [inactive] })
    fireEvent.click(within(excluded.view.container).getByRole('button', { name: 'status.active' }))
    expect(states(excluded.view, 'list.noMatches')).toBe(true)
    expect(states(excluded.view, 'list.empty')).toBe(false)

    const searched = page({ records: [active] })
    fireEvent.click(within(searched.view.container).getByRole('button', { name: 'status.inactive' }))
    fireEvent.change(
      within(searched.view.container).getByRole('searchbox', { name: 'search.label' }),
      { target: { value: 'zzz' } })
    expect(states(searched.view, 'list.noMatches')).toBe(true)
  })

  it('reports the missing schedule capability and retries', () => {
    const { view, onRetry } = page({ status: 'unavailable' })
    expect(view.getByRole('alert').textContent).toBe('list.unavailable.title')
    expect(view.getByText('list.unavailable.hint')).not.toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'list.retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('reports a failed read and retries', () => {
    const { view, onRetry } = page({ status: 'error' })
    expect(view.getByRole('alert').textContent).toBe('list.error')
    fireEvent.click(view.getByRole('button', { name: 'list.retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('opens the add-task dialog from the toolbar and hands confirm the typed draft', () => {
    const { view, onCreateTask } = page()
    expect(view.queryByRole('dialog', { name: 'create.title' })).toBeNull()

    fireEvent.click(view.getByRole('button', { name: 'new.action' }))
    expect(view.getByRole('dialog', { name: 'create.title' })).not.toBeNull()

    const confirm = view.getByRole('button', { name: 'create.confirm' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(view.getByLabelText('create.nameLabel'), { target: { value: 'Morning digest' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(view.getByLabelText('create.frequencyDate'), { target: { value: '2026-10-01T09:00' } })
    fireEvent.change(view.getByLabelText('create.frequencyLabel'), { target: { value: 'daily' } })
    expect(confirm.disabled).toBe(false)

    fireEvent.click(confirm)
    expect(onCreateTask).toHaveBeenCalledTimes(1)
    expect(onCreateTask).toHaveBeenCalledWith({
      title: 'Morning digest', prompt: '', frequency: 'daily', runAt: '2026-10-01T09:00',
      intervalValue: 1, intervalUnit: 'hour',
      validity: 'forever', untilDate: '', style: 'balanced', pushWorkBuddy: false, pushWecomBot: false,
      workspaceId: undefined,
    })
    expect(view.queryByRole('dialog', { name: 'create.title' })).toBeNull()
  })

  it('offers the catalogued workspaces in the create dialog and hands the chosen one to creation', () => {
    const { view, onCreateTask } = page({}, workspacesOf())
    fireEvent.click(view.getByRole('button', { name: 'new.action' }))
    fireEvent.click(view.getByRole('button', { name: 'create.workspace' }))
    const rows = within(view.getByRole('menu')).getAllByRole('menuitem')
    // A blank Workspace title falls back to its path, so no row is unnamed.
    expect(rows.map(row => row.textContent)).toEqual(['create.workspaceDefault', 'Alpha', '/work/beta'])

    fireEvent.click(within(view.getByRole('menu')).getByRole('menuitem', { name: '/work/beta' }))
    fireEvent.change(view.getByLabelText('create.nameLabel'), { target: { value: 'Nightly sweep' } })
    fireEvent.change(view.getByLabelText('create.frequencyLabel'), { target: { value: 'hourly' } })
    fireEvent.click(view.getByRole('button', { name: 'create.confirm' }))
    expect(onCreateTask.mock.calls[0]?.[0]).toMatchObject({ title: 'Nightly sweep', workspaceId: 'ws-beta' })
  })

  it('opens the create dialog from a template card, staged with that template', () => {
    const { view, onCreateTask } = page()
    const card = view.getByRole('button', { name: new RegExp(TEMPLATE_TITLE) })
    fireEvent.click(card)

    // The card stages its own name, instruction, and recurrence; its first run is
    // resolved against the moment it was clicked, so it is never in the past.
    expect((view.getByLabelText('create.nameLabel') as HTMLInputElement).value).toBe(TEMPLATE_TITLE)
    expect((view.getByLabelText('create.promptLabel') as HTMLTextAreaElement).value).toBe(TEMPLATE_PROMPT)
    expect((view.getByLabelText('create.frequencyLabel') as HTMLSelectElement).value).toBe('daily')
    const runAt = (view.getByLabelText('create.frequencyDate') as HTMLInputElement).value
    expect(runAt).toMatch(/^\d{4}-\d{2}-\d{2}T09:00$/)
    expect(Date.parse(runAt)).toBeGreaterThan(Date.now())

    const confirm = view.getByRole('button', { name: 'create.confirm' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      title: TEMPLATE_TITLE, prompt: TEMPLATE_PROMPT, frequency: 'daily', runAt,
    }))
  })

  it('opens the add-task dialog from the empty-state affordance and closes it on cancel', () => {
    const { view, onCreateTask } = page()
    fireEvent.click(view.getByRole('button', { name: 'empty.scheduled.action' }))
    expect(view.getByRole('dialog', { name: 'create.title' })).not.toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'create.cancel' }))
    expect(view.queryByRole('dialog', { name: 'create.title' })).toBeNull()
    expect(onCreateTask).not.toHaveBeenCalled()
  })

  it('renders the twelve template cards with their markers', () => {
    const { view } = page()
    expect(view.getByRole('heading', { name: 'templates.title' })).not.toBeNull()
    const cards = view.container.querySelectorAll('[data-automation-template]')
    expect(cards).toHaveLength(12)
    expect(cards[0].getAttribute('data-automation-template')).toBe('news')
    expect(cards[0].textContent).toContain('template.news.title')
    expect(cards[0].textContent).toContain('template.news.description')
    expect(cards[11].getAttribute('data-automation-template')).toBe('wallpaper')
  })

  it('opens one task’s detail from its row and closes it again', () => {
    const { view } = page({ records: [active, inactive] })
    expect(view.queryByRole('complementary', { name: 'detail.label' })).toBeNull()

    const row = view.getByRole('button', { name: ACTIVE_TITLE })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(row)
    // The selected row states its expanded state and points at the panel it opened.
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(row.getAttribute('aria-controls')).not.toBeNull()
    expect(view.getByRole('complementary', { name: 'detail.label' })).toBeDefined()

    fireEvent.click(view.getByRole('button', { name: 'detail.close' }))
    expect(view.queryByRole('complementary', { name: 'detail.label' })).toBeNull()
    expect(row.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps the row removal controls outside the row’s select affordance', () => {
    const { view, onDelete } = page({ records: [active] })
    // The removal control sits beside the select button, so confirming a removal
    // never opens the detail first.
    fireEvent.click(view.getByRole('button', { name: `list.deleteAria(${ACTIVE_TITLE})` }))
    expect(view.queryByRole('complementary', { name: 'detail.label' })).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'list.deleteConfirm' }))
    expect(onDelete).toHaveBeenCalledWith(active.id)
  })

  it('switches to the run-history view and back to the list', async () => {
    const { view, loadHistory } = page({ records: [active, inactive] })
    await act(async () => { fireEvent.click(viewTab(view, 'tab.runs')) })

    expect(view.container.querySelector('[data-automation-tab="runs"]')).not.toBeNull()
    expect(view.container.querySelector('[data-automation-tab="scheduled"]')).toBeNull()
    expect(view.queryByRole('searchbox', { name: 'search.label' })).toBeNull()
    expect(view.queryByRole('button', { name: 'new.action' })).toBeNull()
    expect(view.container.querySelectorAll('[data-automation-template]')).toHaveLength(0)
    expect(loadHistory).toHaveBeenCalledTimes(2)

    fireEvent.click(viewTab(view, 'tab.scheduled'))
    expect(view.container.querySelector('[data-automation-tab="scheduled"]')).not.toBeNull()
    expect(view.getByRole('searchbox', { name: 'search.label' })).not.toBeNull()
    expect(view.getByRole('button', { name: 'new.action' })).not.toBeNull()
    expect(view.container.querySelectorAll('[data-automation-template]')).toHaveLength(12)
    expect(showsTitle(view, ACTIVE_TITLE)).toBe(true)
    expect(showsTitle(view, INACTIVE_TITLE)).toBe(true)
  })

  it('names each row removal control after the record title', () => {
    const { view } = page({ records: [active, inactive] })
    const control = removalControl(view, ACTIVE_TITLE)
    expect(control.getAttribute('aria-label')).toBe(t('list.deleteAria', { name: ACTIVE_TITLE }))
    expect(control.getAttribute('aria-label')).toContain(ACTIVE_TITLE)
    expect(control.textContent).toBe('list.delete')
    expect(removalControl(view, INACTIVE_TITLE).getAttribute('aria-label')).toContain(INACTIVE_TITLE)
  })

  it('confirms an in-place removal and hands the record id to onDelete once', () => {
    const { view, catalog, onDelete } = page({ records: [active, inactive] })
    fireEvent.click(removalControl(view, ACTIVE_TITLE))

    const confirm = view.getByRole('button', { name: 'list.deleteConfirm' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(active.id)

    // The row keeps asking until the catalog reports the deletion, and the
    // confirmation it keeps is disabled while that deletion is in flight.
    expect(view.getByRole('button', { name: 'list.deleteConfirm' })).not.toBeNull()
    act(() => { catalog.set({ ...catalog.getSnapshot(), deleting: [active.id] }) })
    expect((view.getByRole('button', { name: 'list.deleteConfirm' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables the removal confirmation while that record is deleting', () => {
    const { view } = page({ records: [active], deleting: [active.id] })
    fireEvent.click(removalControl(view, ACTIVE_TITLE))
    expect((view.getByRole('button', { name: 'list.deleteConfirm' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('cancels an in-place removal without deleting', () => {
    const { view, onDelete } = page({ records: [active] })
    fireEvent.click(removalControl(view, ACTIVE_TITLE))
    fireEvent.click(view.getByRole('button', { name: 'list.deleteCancel' }))

    expect(view.queryByRole('button', { name: 'list.deleteConfirm' })).toBeNull()
    expect(removalControl(view, ACTIVE_TITLE).textContent).toBe('list.delete')
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('confirms one row while the other keeps its removal control', () => {
    const { view } = page({ records: [active, inactive] })
    fireEvent.click(removalControl(view, ACTIVE_TITLE))

    expect(view.getByRole('button', { name: 'list.deleteConfirm' })).not.toBeNull()
    expect(within(taskRow(view, INACTIVE_TITLE)).queryByRole('button', { name: 'list.deleteConfirm' })).toBeNull()
    expect(removalControl(view, INACTIVE_TITLE).textContent).toBe('list.delete')
  })
})
