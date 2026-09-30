// @vitest-environment jsdom
/**
 * TaskDetail behaviors the Automation page suite leaves unreached: an authoritative
 * refresh under a staged rule draft, a weekly choice seeded from a Sunday
 * occurrence, each rule Menu's own close path (a pointer press outside the
 * anchor and its portaled list) rather than the page's Escape guard, the day set
 * one task's card remembers across a kind detour, the save response that a task
 * switch retires, both elapsed-interval stepper arrows and their emptied field,
 * a save failure stated on the Delivery records tab, and the cron rows' close
 * paths and occurrence-seeded day shape.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ScheduleCatalogEntry, ScheduleId, ScheduleUpdateResult } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { AutomationPage, type AutomationPageProps } from '../src/client/AutomationPage.tsx'
import { mergeRuleDraft } from '../src/client/TaskDetail.tsx'
import type { CatalogSnapshot } from '../src/client/catalog-source.ts'
import { timingSnapshot } from '../src/client/task-timing.ts'
import { en } from '../src/client/locales.ts'
import type { AutomationKey } from '../src/client/locales.ts'
import css from '../src/client/AutomationDetail.module.css'

/**
 * Offset of one zone at one instant, in whole minutes east of UTC.
 * @param timeZone - IANA zone name.
 * @param instant - ISO instant to read the offset at.
 * @returns minutes the zone's wall clock is ahead of UTC at that instant.
 */
function zoneOffsetMinutes(timeZone: string, instant: string): number {
  const read = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant)).map(part => [part.type, part.value]))
  const wallClock = Date.UTC(
    Number(read['year']), Number(read['month']) - 1, Number(read['day']),
    Number(read['hour']), Number(read['minute']), Number(read['second']),
  )
  return (wallClock - Date.parse(instant)) / 60_000
}

const at: ScheduleCatalogEntry = {
  id: 'task-at' as ScheduleId, sessionId: 'session-alpha' as SessionId, kind: 'at', status: 'active',
  title: 'Review release', prompt: 'Review release', scheduledAt: '2026-10-01T09:00:00.000Z',
}

const every: ScheduleCatalogEntry = {
  id: 'task-every' as ScheduleId, sessionId: 'session-beta' as SessionId, kind: 'every', status: 'active',
  title: 'Check metrics', prompt: 'Check metrics', everySeconds: 301, scheduledAt: '2026-10-01T09:30:00.000Z',
}

const daily: ScheduleCatalogEntry = {
  id: 'task-daily' as ScheduleId, sessionId: 'session-gamma' as SessionId, kind: 'daily', status: 'active',
  title: 'Daily weather', prompt: 'Daily weather', time: '23:00:00.000', timeZone: 'Asia/Shanghai',
  scheduledAt: '2026-10-01T15:00:00.000Z',
}

const weeklyMonday: ScheduleCatalogEntry = {
  id: 'task-weekly-monday' as ScheduleId, sessionId: 'session-alpha' as SessionId, kind: 'weekly', status: 'active',
  title: 'Weekly Monday', prompt: 'Weekly Monday', time: '09:30:00.000', timeZone: 'Asia/Shanghai',
  weekdays: [1], scheduledAt: '2026-10-05T01:30:00.000Z',
}

const weekdayRule: ScheduleCatalogEntry = {
  id: 'task-weekday-rule' as ScheduleId, sessionId: 'session-beta' as SessionId, kind: 'weekly', status: 'active',
  title: 'Weekday rule', prompt: 'Weekday rule', time: '09:30:00.000', timeZone: 'Asia/Shanghai',
  weekdays: [1, 2, 3, 4, 5], scheduledAt: '2026-10-05T01:30:00.000Z',
}

const sparseWeekdays: ScheduleCatalogEntry = {
  id: 'task-sparse' as ScheduleId, sessionId: 'session-beta' as SessionId, kind: 'weekly', status: 'active',
  title: 'Sparse weekdays', prompt: 'Sparse weekdays', time: '09:30:00.000', timeZone: 'Asia/Shanghai',
  weekdays: [1, 3], scheduledAt: '2026-10-05T01:30:00.000Z',
}

const cron: ScheduleCatalogEntry = {
  id: 'task-cron' as ScheduleId, sessionId: daily.sessionId, kind: 'cron', status: 'active',
  title: 'Cron report', prompt: 'Cron report', expression: '0 9 * * 1-5', timeZone: 'UTC',
  scheduledAt: '2026-10-05T01:30:00.000Z',
}

/** The same `every` task after another client switched its kind to Every day. */
const movedToDaily: ScheduleCatalogEntry = {
  id: every.id, sessionId: every.sessionId, kind: 'daily', status: 'active',
  title: every.title, prompt: every.prompt, time: '09:30:00.000', timeZone: 'UTC',
  scheduledAt: every.scheduledAt,
}

const sessions: SessionListState = {
  ids: [at.sessionId, every.sessionId, daily.sessionId],
  byId: Object.fromEntries([at, every, daily].map(record => [record.sessionId, {
    id: record.sessionId, displayTitle: record.sessionId, running: false, blank: false, updatedAt: 0, retainedBy: {},
  }] as const)),
  phase: 'ready', projectionsBySession: {},
}

const workspaces: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }

afterEach(cleanup)

// jsdom has no `scrollIntoView`, which an open clock panel calls on the row that
// shows the staged value.
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn() })

/**
 * The Time row's picker trigger, whose text is the staged 24-hour clock.
 * @returns the trigger button.
 */
function timeField(): HTMLButtonElement {
  return within(screen.getByRole('region', { name: en['rule.title'] }))
    .getByLabelText<HTMLButtonElement>(en['timing.time'])
}

/**
 * Render the Automation page over one catalog snapshot and let a case replace it.
 * @param records - catalog rows the page lists.
 * @param status - initial catalog query state; defaults to a settled read.
 * @param sources - Session and Workspace projections a case replaces.
 * @returns the update callbacks and the injected action spies.
 */
function mount(
  records: readonly ScheduleCatalogEntry[],
  status: 'loading' | 'ready' | 'error' = 'ready',
  sources: { sessions?: SessionListState; workspaces?: WorkspaceSnapshot } = {},
) {
  const catalog = createSnapshotStore<CatalogSnapshot>({
    records, status, deleting: [], settled: status === 'ready', readRequest: 0, readSettled: 0,
  })
  // The page reads the catalog through the framework-bound `useCatalog` seat and
  // the live Session and Workspace lists through their stores, so every case
  // publishes through the same observable source a Host refresh does.
  const props: AutomationPageProps = {
    mode: 'automation',
    useCatalog: bindSnapshotSelector(catalog),
    useSessions: bindSnapshotSelector(createSnapshotStore<SessionListState>(sources.sessions ?? sessions)),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>(sources.workspaces ?? workspaces)),
    usePanelInfo: select => select({ activePanelId: null }),
    useSessionStatus: select => select(new Map()),
    useSessionRetainInfo: () => undefined,
    useResource: () => { throw new Error('The automation page does not load document resources') },
    onDelete: vi.fn<AutomationPageProps['onDelete']>(async () => 'deleted'),
    onRetry: vi.fn(async () => {}),
    onCreateTask: vi.fn(),
    onUpdateTiming: vi.fn<AutomationPageProps['onUpdateTiming']>(async ({ expected }) => ({
      ok: true, value: { id: expected.id, updated: false, record: expected },
    })),
    onOpenSession: vi.fn(),
    loadHistory: vi.fn<AutomationPageProps['loadHistory']>(async ({ id }) => ({
      ok: true, value: {
        id, records: [], earlierRecordsUnavailable: false,
        earlierRecordsPruned: false, retention: { days: 30, records: 200 },
      },
    })),
    t: makeTranslate(en),
  }
  render(<AutomationPage {...props} />)
  const publish = (patch: Partial<CatalogSnapshot>): void => {
    act(() => { catalog.set({ ...catalog.getSnapshot(), ...patch }) })
  }
  return {
    updateTiming: vi.mocked(props.onUpdateTiming),
    onDelete: vi.mocked(props.onDelete),
    onOpenSession: vi.mocked(props.onOpenSession),
    /** Publish an authoritative catalog snapshot, as a Host refresh does. */
    update(next: readonly ScheduleCatalogEntry[]) { publish({ records: next }) },
    /** Publish one catalog query state, as a refresh or a failure does. */
    setStatus(next: 'loading' | 'ready' | 'error' | 'unavailable') { publish({ status: next }) },
    /** Publish the deletions the catalog reports in flight. */
    setDeleting(next: readonly ScheduleId[]) { publish({ deleting: next }) },
  }
}

/** Select one listed task, opening its detail. */
function selectTask(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }))
}

/** The Repeat selector of the shown rule's Run time card. */
function repeatButton(): HTMLElement {
  return within(screen.getByRole('region', { name: en['rule.title'] }))
    .getByRole('button', { name: new RegExp(`^${en['rule.repeat']}`) })
}

/** The Time zone selector of the shown rule's Run time card. */
function zoneButton(): HTMLElement {
  return within(screen.getByRole('region', { name: en['rule.title'] }))
    .getByRole('button', { name: new RegExp(`^${en['timing.zone']}`) })
}

/** The Weekday toggle group of the shown rule's Run time card. */
function weekdayGroup(): HTMLElement {
  return within(screen.getByRole('region', { name: en['rule.title'] }))
    .getByRole('group', { name: en['rule.weekday'] })
}

/** Pressed state of the Weekday group's seven toggles, Monday through Sunday. */
function weekdayPressed(group: HTMLElement): (string | null)[] {
  return within(group).getAllByRole('button').map(day => day.getAttribute('aria-pressed'))
}

/**
 * The pressed state of one named ISO weekday alone.
 * @param weekday - ISO weekday to read, Monday `1` through Sunday `7`.
 * @returns whether that day's toggle is pressed.
 */
function weekdayOn(weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7): string | null {
  const name = en['rule.weekdayOption'].replace('{weekday}', en[`frequency.weekday.${weekday}`])
  return within(weekdayGroup()).getByRole('button', { name }).getAttribute('aria-pressed')
}

/**
 * Press one named ISO weekday's toggle in the shown rule's Weekday group.
 * @param weekday - ISO weekday to toggle, Monday `1` through Sunday `7`.
 */
function clickWeekday(weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7): void {
  const name = en['rule.weekdayOption'].replace('{weekday}', en[`frequency.weekday.${weekday}`])
  fireEvent.click(within(weekdayGroup()).getByRole('button', { name }))
}

/** Choose one Repeat menu entry in the shown rule's Run time card. */
function clickRepeat(key: AutomationKey): void {
  fireEvent.click(repeatButton())
  fireEvent.click(screen.getByRole('menuitem', { name: en[key] }))
}

/**
 * Pin the browser-resolved zone for one case, so menu order and the system
 * suffix do not depend on the host zone.
 * @param timeZone - IANA zone the component must resolve as the system zone.
 * @returns a function that restores the spy when the case ends.
 */
function pinSystemZone(timeZone: string): () => void {
  const options = new Intl.DateTimeFormat().resolvedOptions()
  const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockReturnValue({ ...options, timeZone })
  return () => { spy.mockRestore() }
}

/** The staged-edit bar's Save changes action. */
function clickSave(): void {
  fireEvent.click(screen.getByRole('button', { name: en['rule.save'] }))
}

/** Press the pointer outside an open Menu's anchor and portaled list. */
function pressOutsideMenus(): void {
  fireEvent.pointerDown(document.body)
}

/** The elapsed-interval quantity input of the shown rule's Run time card. */
function intervalField(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(en['timing.interval'])
}

/**
 * Press one arrow of the elapsed-interval stepper.
 * @param key - dictionary key of the arrow's accessible name.
 */
function clickIntervalArrow(key: 'timing.intervalIncrease' | 'timing.intervalDecrease'): void {
  fireEvent.click(screen.getByRole('button', { name: en[key] }))
}

/** The Frequency selector of the cron builder's rows. */
function frequencyButton(): HTMLElement {
  return within(screen.getByRole('region', { name: en['rule.title'] }))
    .getByRole('button', { name: new RegExp(`^${en['cronForm.frequency']}`) })
}

/**
 * Open the cron builder's Frequency menu and choose one shape.
 * @param key - dictionary key of the chosen shape's menu label.
 */
function chooseCronShape(key: AutomationKey): void {
  fireEvent.click(frequencyButton())
  fireEvent.click(screen.getByRole('menuitem', { name: en[key] }))
}

/** The Delivery records tab of the shown detail. */
function recordsTab(): HTMLElement {
  return screen.getByRole('tab', { name: en['detail.records'] })
}

/** The bar-side save failure line, or null while no failure shows. */
function saveFailure(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.${css.saveFailure}`)
}

describe('TaskDetail authoritative refresh', () => {
  it('shows the refreshed stored rule while the draft is clean', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    expect(timeField().textContent).toBe('23:00:00')

    const refreshed: ScheduleCatalogEntry = { ...daily, time: '21:15:00.000' }
    h.update([refreshed])
    expect(timeField().textContent).toBe('21:15:00')
    // The replaced values are the stored ones, so the draft is still clean.
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })

  it('keeps a staged interval draft and expects the refreshed record on save', () => {
    const h = mount([every])
    selectTask('Check metrics')
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['timing.interval']), { target: { value: '600' } })

    const refreshed: ScheduleCatalogEntry = { ...every, everySeconds: 302 }
    h.update([refreshed])
    expect(screen.getByLabelText<HTMLInputElement>(en['timing.interval']).value).toBe('600')
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: every.sessionId, id: every.id, expected: timingSnapshot(refreshed),
      change: { kind: 'every', every_seconds: 600 },
    })
  })

  it('takes a refreshed rule kind while the timing draft is clean', () => {
    const h = mount([every])
    selectTask('Check metrics')
    expect(screen.getByLabelText<HTMLInputElement>(en['timing.interval']).value).toBe('301')

    // Another client switched the rule to Every day. No timing value was staged,
    // so the refreshed record replaces the card as its own clean rule instead of
    // leaving the old interval rule staged against the new kind.
    h.update([movedToDaily])
    expect(timeField().textContent).toBe('09:30:00')
    expect(screen.queryByLabelText(en['timing.interval'])).toBeNull()
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })

  it('keeps the staged rule whole when the refreshed record switches kind', () => {
    const h = mount([every])
    selectTask('Check metrics')
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['timing.interval']), { target: { value: '7200' } })

    h.update([movedToDaily])
    // The staged interval must not survive as a hidden field of a kind that does
    // not state it: the card keeps the local interval rule whole, so the reader
    // sees what a save would send rather than a mixed rule.
    expect(screen.getByLabelText<HTMLInputElement>(en['timing.interval']).value).toBe('7200')
    expect(screen.queryByLabelText(en['timing.time'])).toBeNull()
    expect(screen.getByRole('button', { name: en['rule.save'] })).toBeDefined()
  })

  it('keeps the card choice agreeing with the weekday set a refresh merges in', () => {
    const h = mount([sparseWeekdays])
    selectTask('Sparse weekdays')
    // The reader adds Friday to the stored Monday-and-Wednesday rule.
    clickWeekday(5)
    expect(weekdayOn(5)).toBe('true')

    // Another client widens the stored rule to Monday to Friday, whose own choice
    // reads as Monday to Friday. The staged set is what the card keeps, so its
    // choice has to stay Weekly: the Weekday row exists only for that choice, and
    // the Repeat value must not read as the choice the kept set does not match.
    h.update([{ ...sparseWeekdays, weekdays: [1, 2, 3, 4, 5] }])
    expect(weekdayPressed(weekdayGroup()))
      .toEqual(['true', 'false', 'true', 'false', 'true', 'false', 'false'])
    expect(repeatButton().textContent).toContain(en['rule.weekly'])
    expect(repeatButton().textContent).not.toContain(en['rule.weekdays'])
  })

  it('keeps an edited name and takes a refreshed time for the untouched field', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['detail.name']), { target: { value: 'Weather check' } })

    const refreshed: ScheduleCatalogEntry = { ...daily, time: '21:15:00.000' }
    h.update([refreshed])
    expect(screen.getByLabelText<HTMLInputElement>(en['detail.name']).value).toBe('Weather check')
    // The concurrent remote edit to another field survives the unsaved name.
    expect(timeField().textContent).toBe('21:15:00')
    expect(screen.getByRole('button', { name: en['rule.save'] })).toBeDefined()
  })

  it('keeps a newer authoritative refresh when an older save response lands', async () => {
    const h = mount([at])
    selectTask('Review release')
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['detail.name']), { target: { value: 'Renamed locally' } })
    const pending = Promise.withResolvers<RemoteResult<ScheduleUpdateResult>>()
    h.updateTiming.mockReturnValueOnce(pending.promise)
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledOnce()

    // Another writer's newer record reaches the catalog before this save answers.
    const newer: ScheduleCatalogEntry = { ...at, prompt: 'Prompt changed elsewhere' }
    h.update([newer])

    await act(async () => {
      pending.resolve({ ok: true, value: { id: at.id, updated: true, record: at } })
      await pending.promise
    })
    // The answer describes the record this save submitted, so it must not put the
    // older instruction back over the refresh that already landed; the newer
    // record stays authoritative and the completed save leaves no draft behind.
    expect(screen.getByLabelText<HTMLTextAreaElement>(en['detail.instruction']).value).toBe('Prompt changed elsewhere')
    expect(screen.getByLabelText<HTMLInputElement>(en['detail.name']).value).toBe('Review release')
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })

  it('leads the scrolling detail with a failed refresh and its Retry', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    const detail = screen.getByRole('complementary', { name: en['detail.label'] })
    const scroll = detail.querySelector<HTMLElement>(`.${css.detailScroll}`)!

    h.setStatus('error')
    const alert = within(detail).getByRole('alert')
    expect(alert.textContent).toBe(en['list.error'])
    const retry = within(detail).getByRole('button', { name: en['list.retry'] })
    expect(alert.parentElement?.contains(retry)).toBe(true)
    // The feedback leads this region, above the name control and the Run time
    // card, so a long rule form never pushes it out of view; it stays inside
    // the region so a start or settle moves no fixed row above it.
    expect(scroll.firstElementChild?.contains(alert)).toBe(true)
    const rule = within(detail).getByRole('region', { name: en['rule.title'] })
    expect(scroll.contains(rule)).toBe(true)
    expect(alert.compareDocumentPosition(rule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

type RuleShown = Parameters<typeof mergeRuleDraft>[1]

/** One complete staged value set, with any field replaced by an override. */
function rule(
  overrides: Omit<Partial<RuleShown>, 'draft'> & { draft?: Partial<RuleShown['draft']> } = {},
): RuleShown {
  const { draft, ...rest } = overrides
  return {
    title: 'Daily weather',
    prompt: 'Daily weather',
    kind: 'daily',
    draft: {
      date: '2026-10-01', time: '23:00:00.000', timeZone: 'Asia/Shanghai',
      seconds: '300', expression: '0 1 * * *', ...draft,
    },
    weekdays: [1, 2, 3, 4, 5],
    ...rest,
  }
}

describe('mergeRuleDraft', () => {
  const stored = rule()

  it('takes every field of the refreshed record while the draft is clean', () => {
    const authoritative = rule({
      title: 'Remote', prompt: 'Remote prompt', kind: 'weekly',
      draft: { date: '2026-11-02', time: '09:00:00.000', timeZone: 'UTC', seconds: '600', expression: '30 8 * * *' },
      weekdays: [6],
    })
    expect(mergeRuleDraft(authoritative, stored, stored)).toEqual(authoritative)
  })

  it('keeps the staged rule whole when the draft switches kind', () => {
    // The draft stages a cron rule against a stored every-day rule, so the
    // refreshed record describes a rule the draft does not: the whole staged rule
    // stays, and no field of it is replaced by the refreshed one.
    const draft = rule({
      title: 'Edited', prompt: 'Edited prompt', kind: 'cron',
      draft: { date: '2026-12-03', time: '08:00:00.000', timeZone: 'Europe/Berlin', seconds: '900', expression: '15 7 * * *' },
      weekdays: [7],
    })
    const authoritative = rule({
      title: 'Remote', prompt: 'Remote prompt', kind: 'every',
      draft: { date: '2027-01-04', time: '07:00:00.000', timeZone: 'UTC', seconds: '1200', expression: '45 6 * * *' },
      weekdays: [3, 5],
    })
    expect(mergeRuleDraft(authoritative, draft, stored)).toEqual(draft)
  })

  it('takes the refreshed timing field the draft left alone', () => {
    const draft = rule({ title: 'Edited', prompt: 'Edited prompt' })
    const authoritative = rule({ title: 'Remote', prompt: 'Remote prompt', draft: { time: '21:15:00.000' } })
    expect(mergeRuleDraft(authoritative, draft, stored))
      .toEqual({ ...draft, draft: { ...draft.draft, time: '21:15:00.000' } })
  })

  it('takes a refreshed timing field while the draft edits another of the same kind', () => {
    // All three value sets state the same kind, so the merge is per field: the
    // weekday set the draft edited stays dropped to four days and the clock the
    // draft never touched takes the refreshed one.
    const storedWeekly = rule({ kind: 'weekly', draft: { time: '09:00:00.000' } })
    const draft = rule({ kind: 'weekly', weekdays: [1, 2, 3, 4], draft: { time: '09:00:00.000' } })
    const authoritative = rule({ kind: 'weekly', draft: { time: '10:00:00.000' } })
    const merged = mergeRuleDraft(authoritative, draft, storedWeekly)
    expect(merged.weekdays).toEqual([1, 2, 3, 4])
    expect(merged.draft.time).toBe('10:00:00.000')
    expect(merged).toEqual({ ...authoritative, weekdays: [1, 2, 3, 4] })
  })

  it("keeps a refreshed weekday set while the draft edits the same weekly rule's clock", () => {
    // Monday-to-Friday and Weekly are the same Host weekly rule, so the refreshed
    // record has not switched kind: the merge stays per field, keeping the clock
    // the draft edited and taking the day set the refreshed record narrowed.
    const storedWeekdays = rule({ kind: 'weekdays', draft: { time: '09:00:00.000' } })
    const draft = rule({ kind: 'weekdays', draft: { time: '11:00:00.000' } })
    const authoritative = rule({ kind: 'weekly', weekdays: [1, 3], draft: { time: '09:00:00.000' } })
    const merged = mergeRuleDraft(authoritative, draft, storedWeekdays)
    expect(merged.draft.time).toBe('11:00:00.000')
    expect(merged.weekdays).toEqual([1, 3])
    // The merged set is not Monday to Friday, so the choice it is shown under must
    // be Weekly: a Monday-to-Friday label beside Monday-and-Wednesday would both
    // misstate the rule and make a save submit the Monday-to-Friday set.
    expect(merged.kind).toBe('weekly')
  })

  it('keeps the merged choice agreeing with the merged weekday set', () => {
    const storedSparse = rule({ kind: 'weekly', weekdays: [1, 3], draft: { time: '09:00:00.000' } })
    const widened = rule({ kind: 'weekdays', weekdays: [1, 2, 3, 4, 5], draft: { time: '09:00:00.000' } })

    // The reader added Friday and changed nothing else: the draft keeps the stored
    // clock, so the day set is the only staged difference the merge weighs. The
    // kept set is no longer Monday to Friday, so the choice follows the kept set
    // rather than the refreshed record's.
    const keptEdit = mergeRuleDraft(
      widened, rule({ kind: 'weekly', weekdays: [1, 3, 5], draft: { time: '09:00:00.000' } }), storedSparse,
    )
    expect(keptEdit.kind).toBe('weekly')
    expect(keptEdit.weekdays).toEqual([1, 3, 5])

    // An untouched set takes the refreshed, wider one, and the choice follows it.
    const takenRefresh = mergeRuleDraft(widened, storedSparse, storedSparse)
    expect(takenRefresh.kind).toBe('weekdays')
    expect(takenRefresh.weekdays).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps the reader’s Weekly choice while they are editing it', () => {
    // Monday-to-Friday and Weekly are one Host rule, so a reader who switched to
    // Weekly while keeping five days has still made a choice: a refresh that only
    // renames the record must not relabel them back and close the Weekday row.
    const storedWeekdays = rule({ kind: 'weekdays', weekdays: [1, 2, 3, 4, 5], draft: { time: '09:00:00.000' } })
    const draft = rule({ kind: 'weekly', weekdays: [1, 2, 3, 4, 5], draft: { time: '09:00:00.000' } })
    const renamed = rule({
      kind: 'weekdays', weekdays: [1, 2, 3, 4, 5], title: 'Renamed', prompt: 'Renamed', draft: { time: '09:00:00.000' },
    })
    const merged = mergeRuleDraft(renamed, draft, storedWeekdays)
    expect(merged.kind).toBe('weekly')
    expect(merged.weekdays).toEqual([1, 2, 3, 4, 5])
    expect(merged.title).toBe('Renamed')
  })

  it('keeps the reader’s Weekly choice while its set is theirs', () => {
    // The reader widened Monday-and-Wednesday to five days while on Weekly, so the
    // choice is theirs even though the merged set now spells Monday to Friday: a
    // relabel would close the row they are editing and submit the other set.
    const storedSparse = rule({ kind: 'weekly', weekdays: [1, 3], draft: { time: '09:00:00.000' } })
    const draft = rule({ kind: 'weekly', weekdays: [1, 2, 3, 4, 5], draft: { time: '09:00:00.000' } })
    const renamed = rule({
      kind: 'weekly', weekdays: [1, 3], title: 'Renamed', prompt: 'Renamed', draft: { time: '09:00:00.000' },
    })
    const merged = mergeRuleDraft(renamed, draft, storedSparse)
    expect(merged.kind).toBe('weekly')
    expect(merged.weekdays).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps a changed weekday set of the same length and of a different length', () => {
    const authoritative = rule({ weekdays: [7] })
    expect(mergeRuleDraft(authoritative, rule({ weekdays: [1, 2, 3, 4, 6] }), stored).weekdays).toEqual([1, 2, 3, 4, 6])
    expect(mergeRuleDraft(authoritative, rule({ weekdays: [1, 2] }), stored).weekdays).toEqual([1, 2])
  })

  it('keeps the staged weekday set while an unsaved rule switch is up', () => {
    // The user just switched the kind to a weekly 23:55 on Monday and has not
    // saved; another writer's refresh then moves the record's own every-rule to
    // Tuesday. The draft stages a kind the refreshed record does not state, so
    // its weekday set describes the staged rule and must not be rewritten.
    const stagedSwitch = rule({ kind: 'weekly', draft: { time: '23:55:00.000' }, weekdays: [1] })
    const storedEvery = rule({ kind: 'every', draft: { seconds: '300' }, weekdays: [1] })
    const remote = rule({ kind: 'every', weekdays: [2] })
    expect(mergeRuleDraft(remote, stagedSwitch, storedEvery).weekdays).toEqual([1])
  })

  it('keeps a remote rename while a rule switch is staged', () => {
    // Another client renames the record and rewrites its instruction while this
    // detail stages an unsaved switch to a weekly 23:55 on Monday. The staged
    // kind is not the record's, so its clock and weekday set stay as staged; the
    // name and the instruction are not staged, so the remote values win.
    const storedRule = rule({ kind: 'every', title: 'Stored title', prompt: 'Stored instruction', weekdays: [1] })
    const stagedSwitch = rule({
      kind: 'weekly', title: 'Stored title', prompt: 'Stored instruction',
      draft: { time: '23:55:00.000' }, weekdays: [1],
    })
    const remote = rule({ kind: 'every', title: 'Remote title', prompt: 'Remote instruction', weekdays: [2] })
    const merged = mergeRuleDraft(remote, stagedSwitch, storedRule)
    expect(merged.title).toBe('Remote title')
    expect(merged.prompt).toBe('Remote instruction')
    expect(merged.kind).toBe('weekly')
    expect(merged.draft.time).toBe('23:55:00.000')
    expect(merged.weekdays).toEqual([1])
  })
})

describe('TaskDetail rule menus', () => {
  it('seeds the weekly choice with Sunday from a committed Sunday occurrence', () => {
    // 2026-10-04 is a Sunday, the only UTC weekday the Monday-first ISO set
    // cannot take from its own index.
    const sunday: ScheduleCatalogEntry = { ...at, id: 'task-sunday' as ScheduleId, scheduledAt: '2026-10-04T09:00:00.000Z' }
    mount([sunday])
    selectTask('Review release')
    fireEvent.click(repeatButton())
    fireEvent.click(screen.getByRole('menuitem', { name: en['rule.weekly'] }))
    expect(weekdayPressed(weekdayGroup())).toEqual(['false', 'false', 'false', 'false', 'false', 'false', 'true'])
  })

  it('closes the overflow menu on an outside pointer press and keeps the detail', () => {
    mount([at])
    selectTask('Review release')
    fireEvent.click(screen.getByRole('button', { name: en['detail.more'] }))
    expect(screen.getByRole('menu')).toBeDefined()
    pressOutsideMenus()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('complementary')).toBeDefined()
  })

  it('closes the Repeat menu on an outside pointer press without closing the detail', () => {
    mount([at])
    selectTask('Review release')
    fireEvent.click(repeatButton())
    expect(screen.getByRole('menu')).toBeDefined()
    pressOutsideMenus()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('complementary')).toBeDefined()
  })

  it('closes the Time zone menu on an outside pointer press without closing the detail', () => {
    mount([daily])
    selectTask('Daily weather')
    fireEvent.click(zoneButton())
    expect(screen.getByRole('menu')).toBeDefined()
    pressOutsideMenus()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('complementary')).toBeDefined()
  })

  it('marks the Time zone search box as the field the menu hands the keyboard to', () => {
    mount([daily])
    selectTask('Daily weather')
    fireEvent.click(zoneButton())
    // The portaled list paints hidden while it is measured, so a mount-time
    // autoFocus on the box cannot take effect; marking it is what makes the menu
    // hand the keyboard over once placement made it focusable (see the primitive
    // case in ui-primitives tests).
    expect(screen.getByRole('searchbox', { name: en['timing.zoneSearch'] })
      .hasAttribute('data-menu-field')).toBe(true)
  })

  it('keeps a shared zone row’s own id when a query names several of its ids', () => {
    // Three zones hold one label at any instant, so they render as one row, and
    // the rule already states one of them, whose id that row preserves.
    const restoreSystemZone = pinSystemZone('Asia/Shanghai')
    const inventory = vi.spyOn(Intl, 'supportedValuesOf')
      .mockReturnValue(['America/Detroit', 'America/New_York', 'America/Toronto'])
    try {
      mount([{ ...daily, timeZone: 'America/Toronto' }])
      selectTask('Daily weather')
      fireEvent.click(zoneButton())
      fireEvent.change(screen.getByRole('searchbox', { name: en['timing.zoneSearch'] }), {
        target: { value: 'america/' },
      })

      // The query matches several ids of that row, including the one the rule
      // states, so the row keeps that preferred id, which is what marks the stored
      // choice as the selected row.
      const row = screen.getByRole('menuitem')
      expect(row.querySelector('svg')).not.toBeNull()
      fireEvent.click(row)
      expect(screen.queryByRole('menu')).toBeNull()
      expect(zoneButton().textContent).toContain(en['timing.zone'])
    } finally {
      inventory.mockRestore()
      restoreSystemZone()
    }
  })

  it('selects the one zone a partial query names inside a shared row', () => {
    // Athens and Cairo hold one offset and one ICU name at the pinned instant, so
    // they render as a single row whose own id is the group's first alias, Cairo.
    const restoreSystemZone = pinSystemZone('UTC')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-20T12:00:00.000Z'))
    const inventory = vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Africa/Cairo', 'Europe/Athens'])
    try {
      const h = mount([{ ...daily, timeZone: 'UTC' }])
      selectTask('Daily weather')
      fireEvent.click(zoneButton())
      fireEvent.change(screen.getByRole('searchbox', { name: en['timing.zoneSearch'] }), {
        target: { value: 'Athens' },
      })

      // The query names exactly one id of that row, so the row adopts that id
      // instead of the alias a bare row would submit.
      fireEvent.click(screen.getByRole('menuitem'))
      clickSave()
      expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        change: { kind: 'daily', daily: { time: '23:00:00.000', time_zone: 'Europe/Athens' } },
      }))
    } finally {
      inventory.mockRestore()
      clock.mockRestore()
      restoreSystemZone()
    }

    // The two aliases are not interchangeable: their 09:00 on 2026-10-27 falls at
    // 07:00Z in Athens and 06:00Z in Cairo, so the id the row adopted is the one
    // that day's clock reads through.
    expect([
      zoneOffsetMinutes('Europe/Athens', '2026-10-27T07:00:00.000Z'),
      zoneOffsetMinutes('Africa/Cairo', '2026-10-27T07:00:00.000Z'),
    ]).toEqual([120, 180])
  })

  it('selects the first zone a partial query matches when the row’s own id is not one', () => {
    // Cairo, Athens, and Bucharest hold one offset and one ICU name at the pinned
    // instant, so they render as one row whose own id is its first alias, Cairo.
    const restoreSystemZone = pinSystemZone('UTC')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-20T12:00:00.000Z'))
    const inventory = vi.spyOn(Intl, 'supportedValuesOf')
      .mockReturnValue(['Africa/Cairo', 'Europe/Athens', 'Europe/Bucharest'])
    try {
      const h = mount([{ ...daily, timeZone: 'Africa/Cairo' }])
      selectTask('Daily weather')
      fireEvent.click(zoneButton())
      fireEvent.change(screen.getByRole('searchbox', { name: en['timing.zoneSearch'] }), {
        target: { value: 'europe' },
      })

      // The query names two ids of that row and not the row's own: the row adopts
      // the first of them rather than a zone the query never matched.
      fireEvent.click(screen.getByRole('menuitem'))
      clickSave()
      expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        change: { kind: 'daily', daily: { time: '23:00:00.000', time_zone: 'Europe/Athens' } },
      }))
    } finally {
      inventory.mockRestore()
      clock.mockRestore()
      restoreSystemZone()
    }

    // The adopted id is not interchangeable with the row's own: their 09:00 on
    // 2026-10-27 falls at 07:00Z in Athens and 06:00Z in Cairo.
    expect([
      zoneOffsetMinutes('Europe/Athens', '2026-10-27T07:00:00.000Z'),
      zoneOffsetMinutes('Africa/Cairo', '2026-10-27T07:00:00.000Z'),
    ]).toEqual([120, 180])
  })
})

describe('TaskDetail weekday memory across tasks', () => {
  it('seeds a switched task from its own target day, never from another task set', () => {
    mount([weeklyMonday, daily])
    selectTask('Weekly Monday')
    // The weekly draft starts on its stored Monday; the reader narrows it to Wednesday.
    clickWeekday(3)
    clickWeekday(1)
    expect(weekdayOn(3)).toBe('true')
    expect(weekdayOn(1)).toBe('false')

    // The other task's Daily rule states no weekday set, so its Weekly choice
    // seeds the day its own target falls on (2026-10-01 23:00 in Asia/Shanghai is
    // a Thursday) rather than the set left staged on the first task.
    selectTask('Daily weather')
    clickRepeat('rule.weekly')
    expect(weekdayOn(4)).toBe('true')
    expect(weekdayOn(3)).toBe('false')

    // Leaving the first task drops its unsaved draft, so coming back re-seeds the
    // card from its stored Monday: neither the set abandoned on the first task nor
    // the one staged on the second reaches it.
    selectTask('Weekly Monday')
    expect(weekdayOn(1)).toBe('true')
    expect(weekdayOn(3)).toBe('false')
    expect(weekdayOn(4)).toBe('false')
  })

  it('keeps a stored Monday-to-Friday set through a detour in Every day', () => {
    mount([weekdayRule])
    selectTask('Weekday rule')
    // A stored Monday-to-Friday rule opens on that choice, which lists no Weekday toggles.
    expect(within(screen.getByRole('region', { name: en['rule.title'] }))
      .queryByRole('group', { name: en['rule.weekday'] })).toBeNull()

    // Every day shows no Weekday row either, and no pill was pressed on the way
    // out: the stored rule still states five days, so its Weekly choice keeps all
    // five instead of collapsing to the one day the carried clock falls on.
    clickRepeat('rule.daily')
    clickRepeat('rule.weekly')
    expect(weekdayPressed(weekdayGroup()))
      .toEqual(['true', 'true', 'true', 'true', 'true', 'false', 'false'])
  })

  it('keeps an edited set through detours of one and of two kinds', () => {
    // Short detour: Weekly -> Every day -> Weekly.
    mount([weekdayRule])
    selectTask('Weekday rule')
    clickRepeat('rule.weekly')
    clickWeekday(5)
    expect(weekdayOn(5)).toBe('false')
    clickRepeat('rule.daily')
    clickRepeat('rule.weekly')
    expect(weekdayPressed(weekdayGroup()))
      .toEqual(['true', 'true', 'true', 'true', 'false', 'false', 'false'])

    // The same edit through one more kind must answer the same: the stored
    // Monday-to-Friday set only seeds a memory this task has not got yet, so a
    // longer detour cannot put the dropped Friday back.
    cleanup()
    mount([weekdayRule])
    selectTask('Weekday rule')
    clickRepeat('rule.weekly')
    clickWeekday(5)
    clickRepeat('rule.daily')
    clickRepeat('rule.cron')
    clickRepeat('rule.weekly')
    expect(weekdayPressed(weekdayGroup()))
      .toEqual(['true', 'true', 'true', 'true', 'false', 'false', 'false'])
  })

  it('retires a memory that only mirrors the stored set a refresh replaces', () => {
    const h = mount([weekdayRule])
    selectTask('Weekday rule')
    // Leaving Monday to Friday for Every day seeds this task's memory with the
    // stored set, which is a seed rather than a choice the reader made.
    clickRepeat('rule.daily')

    // Another client narrows the stored rule to Monday while the detour is up.
    h.update([{ ...weekdayRule, weekdays: [1] }])
    clickRepeat('rule.weekly')
    // The refresh retires that seed, so the Weekly choice seeds the refreshed
    // Monday instead of the five days the stored rule held before the refresh.
    expect(weekdayPressed(weekdayGroup()))
      .toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false'])
  })

  it('keeps an added day through a detour that passes through the cron choice', () => {
    mount([sparseWeekdays])
    selectTask('Sparse weekdays')
    // A stored Monday-and-Wednesday rule opens on Weekly, whose Weekday row shows both days.
    expect(weekdayOn(1)).toBe('true')
    expect(weekdayOn(3)).toBe('true')
    clickWeekday(5)
    expect(weekdayOn(5)).toBe('true')

    clickRepeat('rule.daily')
    clickRepeat('rule.cron')
    clickRepeat('rule.weekly')
    expect(weekdayPressed(weekdayGroup()))
      .toEqual(['true', 'false', 'true', 'false', 'true', 'false', 'false'])
  })

  it('drops a cancelled set so a later Weekly choice seeds the target day again', () => {
    mount([daily])
    selectTask('Daily weather')
    clickRepeat('rule.weekly')
    expect(weekdayOn(4)).toBe('true')

    // The reader replaces the seeded Thursday with Wednesday and then cancels.
    clickWeekday(3)
    clickWeekday(4)
    expect(weekdayOn(3)).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: en['rule.cancel'] }))

    // The cancelled choice leaves with the draft it belonged to, so the next
    // Weekly choice seeds the occurrence's own day instead of restoring it.
    clickRepeat('rule.weekly')
    expect(weekdayOn(4)).toBe('true')
    expect(weekdayOn(3)).toBe('false')
  })
})

describe('TaskDetail save identity', () => {
  it('keeps a draft typed after returning to a task whose earlier save is in flight', async () => {
    const h = mount([at, daily])
    selectTask('Review release')
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['detail.name']), { target: { value: 'First draft' } })
    const unanswered = Promise.withResolvers<RemoteResult<ScheduleUpdateResult>>()
    h.updateTiming.mockReturnValueOnce(unanswered.promise)
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledOnce()

    // The reader leaves while the save is unanswered, comes back, and types again.
    selectTask('Daily weather')
    selectTask('Review release')
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['detail.name']), { target: { value: 'Second draft' } })

    await act(async () => {
      unanswered.resolve({ ok: true, value: { id: at.id, updated: true, record: at } })
      await unanswered.promise
    })
    // The answer describes the record the abandoned save submitted, and the task
    // switch retired it: the draft typed after coming back stays staged.
    expect(screen.getByLabelText<HTMLInputElement>(en['detail.name']).value).toBe('Second draft')
    expect(screen.getByRole('button', { name: en['rule.save'] })).toBeDefined()
    expect(screen.queryByRole('button', { name: en['rule.saving'] })).toBeNull()
  })

  it('does not apply an answered save to the task opened after it', async () => {
    const h = mount([at, daily])
    selectTask('Review release')
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['detail.name']), { target: { value: 'First draft' } })
    const unanswered = Promise.withResolvers<RemoteResult<ScheduleUpdateResult>>()
    h.updateTiming.mockReturnValueOnce(unanswered.promise)
    clickSave()

    // Another task is open and holds its own unsaved draft when the answer lands.
    selectTask('Daily weather')
    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['detail.name']), { target: { value: 'Weather draft' } })

    await act(async () => {
      unanswered.resolve({ ok: true, value: { id: at.id, updated: true, record: at } })
      await unanswered.promise
    })
    // The answer names the task that submitted it, so it must not re-seed the
    // task opened since with that task's record.
    expect(screen.getByLabelText<HTMLInputElement>(en['detail.name']).value).toBe('Weather draft')
    expect(screen.getByRole('button', { name: en['rule.save'] })).toBeDefined()
  })
})

describe('TaskDetail interval stepper', () => {
  it('moves the staged interval one whole unit and stops at the Host floor', () => {
    mount([{ ...every, everySeconds: 61 }])
    selectTask('Check metrics')
    expect(intervalField().value).toBe('61')

    // The decrease moves the staged quantity down one second to the Host's
    // 60-second floor, which is the lowest the arrow offers.
    clickIntervalArrow('timing.intervalDecrease')
    expect(intervalField().value).toBe('60')
    expect(screen.getByRole('button', { name: en['timing.intervalDecrease'] }).hasAttribute('disabled')).toBe(true)

    clickIntervalArrow('timing.intervalIncrease')
    expect(intervalField().value).toBe('61')
  })

  it('starts an emptied interval field from the Host floor', () => {
    mount([every])
    selectTask('Check metrics')
    fireEvent.change(intervalField(), { target: { value: '' } })
    expect(intervalField().value).toBe('')

    // An emptied field states no quantity, so the increase stages the floor
    // rather than a value derived from the removed one.
    clickIntervalArrow('timing.intervalIncrease')
    expect(intervalField().value).toBe('60')
  })
})

describe('TaskDetail records-tab save failure', () => {
  it('states the refused interval in the row unit while the records tab shows', () => {
    mount([every])
    selectTask('Check metrics')
    fireEvent.change(intervalField(), { target: { value: '59' } })
    fireEvent.click(recordsTab())
    clickSave()

    const bar = saveFailure()
    expect(bar?.textContent).toBe(en['timing.invalidInterval.second'])
    expect(bar?.getAttribute('role')).toBe('alert')
  })

  it('states a save the Host did not answer while the records tab shows', async () => {
    const h = mount([every])
    selectTask('Check metrics')
    fireEvent.change(intervalField(), { target: { value: '600' } })
    fireEvent.click(recordsTab())
    h.updateTiming.mockRejectedValueOnce(new Error('save response disconnected'))
    await act(async () => { clickSave() })

    expect(saveFailure()?.textContent).toBe(en['rule.error.unknown'])
  })
})

describe('TaskDetail cron rows', () => {
  it('closes the Frequency menu on an outside pointer press without closing the detail', () => {
    mount([cron])
    selectTask('Cron report')
    fireEvent.click(frequencyButton())
    expect(screen.getByRole('menu')).toBeDefined()

    pressOutsideMenus()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('complementary')).toBeDefined()
  })

  it('closes the Time panel on an outside pointer press without closing the detail', () => {
    mount([cron])
    selectTask('Cron report')
    fireEvent.click(timeField())
    expect(screen.getByRole('dialog', { name: en['timing.time'] })).toBeDefined()

    pressOutsideMenus()
    expect(screen.queryByRole('dialog', { name: en['timing.time'] })).toBeNull()
    expect(screen.getByRole('complementary')).toBeDefined()
  })

  it('seeds a day shape from the committed occurrence when the staged expression states minutes alone', () => {
    const minutely: ScheduleCatalogEntry = { ...cron, expression: '* * * * *' }
    const h = mount([minutely])
    selectTask('Cron report')

    // `* * * * *` states neither an hour nor a minute of its own, so both come
    // from the committed occurrence in the staged zone.
    chooseCronShape('cronForm.daily')
    expect(timeField().textContent).toBe('01:30')
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: minutely.sessionId, id: minutely.id, expected: timingSnapshot(minutely),
      change: { kind: 'cron', cron: { expression: '30 1 * * *', time_zone: 'UTC' } },
    })
  })

  it('stages nothing when the Frequency menu names the shape the expression already has', () => {
    mount([cron])
    selectTask('Cron report')
    chooseCronShape('rule.cronLabel')
    expect(screen.getByLabelText<HTMLInputElement>(en['rule.cronLabel']).value).toBe('0 9 * * 1-5')

    // The staged expression recognizes the weekly shape, so naming that shape
    // restores the rows without staging an edit.
    chooseCronShape('cronForm.weekly')
    expect(screen.queryByLabelText(en['rule.cronLabel'])).toBeNull()
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })
})

/** The shown task detail region. */
function detail(): HTMLElement {
  return screen.getByRole('complementary', { name: en['detail.label'] })
}

/** The detail's editable task name control. */
function nameField(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('textbox', { name: en['detail.name'] })
}

/** The detail's editable instruction control. */
function instructionField(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: en['detail.instruction'] })
}

/** The detail's overflow control, whose menu carries the deletion. */
function moreButton(): HTMLElement {
  return screen.getByRole('button', { name: en['detail.more'] })
}

/** The Date row's picker trigger of a one-shot rule, scoped to the Run time card. */
function dateButton(): HTMLButtonElement {
  return within(screen.getByRole('region', { name: en['rule.title'] }))
    .getByLabelText<HTMLButtonElement>(en['timing.date'])
}

/** The Time zone row's search box of the open menu. */
function zoneSearchField(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('searchbox', { name: en['timing.zoneSearch'] })
}

/** One column of the open clock panel. */
function clockColumn(key: 'timing.hour' | 'timing.minute' | 'timing.second'): HTMLElement {
  return screen.getByRole('listbox', { name: en[key] })
}

/**
 * Stage one clock through the Time row's picker, opening its panel when closed.
 * @param hour - hour option text.
 * @param minute - minute option text.
 * @param second - second option text, or undefined for a panel without that column.
 * @returns the trigger's text once the picks are staged.
 */
function chooseTime(hour: string, minute: string, second: string | undefined): string {
  if (screen.queryByRole('listbox', { name: en['timing.hour'] }) === null) fireEvent.click(timeField())
  const picks: readonly (readonly ['timing.hour' | 'timing.minute' | 'timing.second', string])[] = [
    ['timing.hour', hour], ['timing.minute', minute],
    ...(second === undefined ? [] : [['timing.second', second] as const]),
  ]
  for (const [key, value] of picks) {
    fireEvent.click(within(clockColumn(key)).getByRole('option', { name: value }))
  }
  return timeField().textContent ?? ''
}

/**
 * Stage one calendar day through the Date row's picker, opening its panel when closed.
 * @param day - day of the month the grid shows.
 * @returns the trigger's text once the day is staged.
 */
function chooseDay(day: number): string {
  if (screen.queryByRole('grid', { name: /.+/ }) === null) fireEvent.click(dateButton())
  fireEvent.click(screen.getAllByRole('gridcell', { name: String(day) })[0])
  return dateButton().textContent ?? ''
}

/** The monthly date toggle group of the cron builder. */
function dateGroup(): HTMLElement {
  return within(screen.getByRole('region', { name: en['rule.title'] }))
    .getByRole('group', { name: en['cronForm.dates'] })
}

/**
 * Accessible name of one monthly date toggle.
 * @param day - day of the month the toggle states.
 * @returns the toggle's accessible name.
 */
function dateName(day: number): string {
  return en['cronForm.dateOption'].replace('{day}', String(day))
}

/**
 * Days of the monthly date group whose toggles are pressed.
 * @param group - the monthly date group.
 * @returns pressed days in grid order.
 */
function datesPressed(group: HTMLElement): number[] {
  return within(group).getAllByRole('button')
    .filter(day => day.getAttribute('aria-pressed') === 'true')
    .map(day => Number(day.textContent))
}

/** Open the overflow menu, choose its delete row, and return the confirmation dialog. */
function openDelete(): HTMLElement {
  fireEvent.click(moreButton())
  fireEvent.click(screen.getByRole('menuitem', { name: en['delete.action'] }))
  return screen.getByRole('dialog')
}

/** Click the staged-edit bar's Cancel action. */
function clickCancel(): void {
  fireEvent.click(screen.getByRole('button', { name: en['rule.cancel'] }))
}

describe('TaskDetail name and instruction edits', () => {
  it('saves an edited name and instruction without a timing change', async () => {
    const h = mount([daily])
    selectTask('Daily weather')
    h.updateTiming.mockResolvedValueOnce({
      ok: true,
      value: {
        id: daily.id, updated: true,
        record: { ...timingSnapshot(daily), title: 'Weather check', prompt: 'Check the forecast' },
      },
    })
    fireEvent.change(nameField(), { target: { value: 'Weather check' } })
    fireEvent.change(instructionField(), { target: { value: 'Check the forecast' } })
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: daily.sessionId, id: daily.id, expected: timingSnapshot(daily),
      title: 'Weather check', prompt: 'Check the forecast',
    })

    // The record this save submitted settles the draft, so the staged-edit bar leaves.
    await act(async () => { await h.updateTiming.mock.results[0].value })
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
    expect(nameField().value).toBe('Weather check')
  })

  it('refuses a blank name, an over-long name, and a blank instruction locally', () => {
    const h = mount([daily])
    selectTask('Daily weather')

    fireEvent.change(nameField(), { target: { value: '   ' } })
    clickSave()
    expect(h.updateTiming).not.toHaveBeenCalled()
    expect(within(detail()).getByRole('alert').textContent).toBe(en['rule.invalidTitle'])

    fireEvent.change(nameField(), { target: { value: 'x'.repeat(121) } })
    clickSave()
    expect(h.updateTiming).not.toHaveBeenCalled()
    expect(within(detail()).getByRole('alert').textContent).toBe(en['rule.invalidTitle'])

    fireEvent.change(nameField(), { target: { value: 'Daily weather' } })
    fireEvent.change(instructionField(), { target: { value: ' ' } })
    clickSave()
    expect(h.updateTiming).not.toHaveBeenCalled()
    expect(within(detail()).getByRole('alert').textContent).toBe(en['rule.invalidPrompt'])
  })

  it('accepts a name of exactly the Host limit', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    fireEvent.change(nameField(), { target: { value: 'x'.repeat(120) } })
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledOnce()
  })
})

describe('TaskDetail refused and rejected saves', () => {
  it('refuses a stored clock the rows cannot state', () => {
    const h = mount([{ ...daily, time: '9:00' }])
    selectTask('Daily weather')
    fireEvent.change(nameField(), { target: { value: 'Weather check' } })
    clickSave()
    expect(h.updateTiming).not.toHaveBeenCalled()
    expect(within(detail()).getByRole('alert').textContent).toBe(en['timing.invalid'])
  })

  it('refuses a one-shot whose committed instant cannot be read', () => {
    const h = mount([{ ...at, scheduledAt: 'not-an-instant' }])
    selectTask('Review release')
    fireEvent.change(nameField(), { target: { value: 'Release check' } })
    clickSave()
    expect(h.updateTiming).not.toHaveBeenCalled()
    expect(within(detail()).getByRole('alert').textContent).toBe(en['timing.invalid'])
  })

  it('reports a resolved Remote failure as an unconfirmed update', async () => {
    const h = mount([daily])
    selectTask('Daily weather')
    h.updateTiming.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) })
    fireEvent.change(nameField(), { target: { value: 'Weather check' } })
    clickSave()
    await act(async () => { await h.updateTiming.mock.results[0].value })
    expect(within(detail()).getByRole('alert').textContent).toBe(en['rule.error.unknown'])
    expect(nameField().value).toBe('Weather check')
  })

  it('keeps the shared wording for a controlled failure without an override', async () => {
    const h = mount([daily])
    selectTask('Daily weather')
    h.updateTiming.mockResolvedValueOnce({
      ok: true, value: { id: daily.id, updated: false, code: 'schedule_ended' },
    })
    fireEvent.change(nameField(), { target: { value: 'Weather check' } })
    clickSave()
    await act(async () => { await h.updateTiming.mock.results[0].value })
    expect(within(detail()).getByRole('alert').textContent).toBe(en['timing.inactive'])
  })

  it('reports a conflict with the rule-specific wording', async () => {
    const h = mount([daily])
    selectTask('Daily weather')
    h.updateTiming.mockResolvedValueOnce({
      ok: true, value: { id: daily.id, updated: false, code: 'schedule_conflict' },
    })
    fireEvent.change(nameField(), { target: { value: 'Weather check' } })
    clickSave()
    await act(async () => { await h.updateTiming.mock.results[0].value })
    expect(within(detail()).getByRole('alert').textContent).toBe(en['rule.error.conflict'])
  })

  it('retires a rejected save that a task switch superseded', async () => {
    const h = mount([at, daily])
    selectTask('Review release')
    fireEvent.change(nameField(), { target: { value: 'First draft' } })
    const unanswered = Promise.withResolvers<RemoteResult<ScheduleUpdateResult>>()
    h.updateTiming.mockReturnValueOnce(unanswered.promise)
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledOnce()

    selectTask('Daily weather')
    selectTask('Review release')
    await act(async () => {
      unanswered.reject(new Error('save response disconnected'))
      await unanswered.promise.catch(() => {})
    })
    // The retired submission reports neither success nor failure: the detail is
    // back on the stored rule and shows no notice of the abandoned save.
    expect(within(detail()).queryByRole('alert')).toBeNull()
    expect(nameField().value).toBe('Review release')
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })
})

describe('TaskDetail interval units', () => {
  it('shows a whole-hour and a whole-minute stored interval in its own unit', () => {
    mount([{ ...every, everySeconds: 3600 }])
    selectTask('Check metrics')
    expect(intervalField().value).toBe('1')
    expect(screen.getByText(en['timing.unit.hour'])).toBeDefined()

    cleanup()
    mount([{ ...every, everySeconds: 60 }])
    selectTask('Check metrics')
    expect(intervalField().value).toBe('1')
    expect(screen.getByText(en['timing.unit.minute'])).toBeDefined()
  })

  it('stages each interval choice with its own unit and keeps a repeated choice', () => {
    const h = mount([daily])
    selectTask('Daily weather')

    // Leaving a clock-time rule for an interval choice seeds whole hours and
    // states them in the unit the reader picked.
    clickRepeat('rule.everyMinutes')
    expect(intervalField().value).toBe('60')
    expect(screen.getByText(en['timing.unit.minute'])).toBeDefined()

    // Naming another interval choice restates the staged seconds in that unit
    // without reseeding them, because the kind itself did not change.
    clickRepeat('rule.everySeconds')
    expect(intervalField().value).toBe('3600')
    expect(screen.getByText(en['timing.unit.second'])).toBeDefined()

    clickRepeat('rule.everyHours')
    expect(intervalField().value).toBe('1')
    expect(screen.getByText(en['timing.unit.hour'])).toBeDefined()

    fireEvent.change(intervalField(), { target: { value: '2' } })
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: daily.sessionId, id: daily.id, expected: timingSnapshot(daily),
      change: { kind: 'every', every_seconds: 7200 },
    })
  })

  it('re-seeds the stored unit when a switched-away interval rule is cancelled', () => {
    mount([{ ...every, everySeconds: 3600 }])
    selectTask('Check metrics')
    clickRepeat('rule.daily')
    expect(screen.queryByLabelText(en['timing.interval'])).toBeNull()

    clickCancel()
    // Cancel restores the stored rule, and the kind effect re-derives the unit
    // from the stored seconds rather than from the abandoned choice.
    expect(intervalField().value).toBe('1')
    expect(screen.getByText(en['timing.unit.hour'])).toBeDefined()
  })
})

describe('TaskDetail one-shot and weekly edits', () => {
  it('switches to a one-shot target and saves a picked day', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    clickRepeat('rule.once')
    expect(dateButton().textContent).toBe('2026/10/01')
    expect(timeField().textContent).toBe('23:00:00')

    // Escape closes the calendar and returns focus to the row.
    const date = dateButton()
    date.focus()
    fireEvent.click(date)
    fireEvent.keyDown(screen.getByRole('grid', { name: /.+/ }), { key: 'Escape' })
    expect(screen.queryByRole('grid', { name: /.+/ })).toBeNull()
    expect(document.activeElement).toBe(date)

    expect(chooseDay(5)).toBe('2026/10/05')
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: daily.sessionId, id: daily.id, expected: timingSnapshot(daily),
      change: { kind: 'at', at: { date: '2026-10-05', time: '23:00:00.000', time_zone: 'Asia/Shanghai' } },
    })
  })

  it('closes the clock panel with Escape and stages a picked clock', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    clickRepeat('rule.once')

    const time = timeField()
    time.focus()
    fireEvent.click(time)
    fireEvent.keyDown(clockColumn('timing.hour'), { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: en['timing.hour'] })).toBeNull()
    expect(document.activeElement).toBe(time)

    expect(chooseTime('10', '25', '30')).toBe('10:25:30')
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: daily.sessionId, id: daily.id, expected: timingSnapshot(daily),
      change: { kind: 'at', at: { date: '2026-10-01', time: '10:25:30', time_zone: 'Asia/Shanghai' } },
    })
  })

  it('saves a weekly rule with the weekday set the reader toggled', () => {
    const h = mount([sparseWeekdays])
    selectTask('Sparse weekdays')
    clickWeekday(5)
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: sparseWeekdays.sessionId, id: sparseWeekdays.id, expected: timingSnapshot(sparseWeekdays),
      change: { kind: 'weekly', weekly: { time: '09:30:00.000', time_zone: 'Asia/Shanghai', weekdays: [1, 3, 5] } },
    })
  })

  it('keeps the last selected weekday of a weekly rule', () => {
    mount([weeklyMonday])
    selectTask('Weekly Monday')
    clickWeekday(1)
    expect(weekdayOn(1)).toBe('true')
    // The Host rejects an empty weekday set, so the last day stays selected and
    // nothing is staged.
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })

  it('seeds a weekly choice from the occurrence when the stored zone is unusable', () => {
    mount([{ ...daily, timeZone: 'Not/AZone' }])
    selectTask('Daily weather')
    clickRepeat('rule.weekly')
    // The unusable zone cannot place the day, so the ISO weekday reads the UTC
    // calendar day of the committed occurrence: 2026-10-01 is a Thursday.
    expect(weekdayOn(4)).toBe('true')
  })

  it('stages the Monday-to-Friday choice and saves that weekday set', () => {
    const h = mount([sparseWeekdays])
    selectTask('Sparse weekdays')
    clickRepeat('rule.weekdays')
    // The Monday-to-Friday choice lists no Weekday toggles: its rows state the
    // whole set, which is what a save submits.
    expect(repeatButton().textContent).toContain(en['rule.weekdays'])
    expect(within(screen.getByRole('region', { name: en['rule.title'] }))
      .queryByRole('group', { name: en['rule.weekday'] })).toBeNull()

    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: sparseWeekdays.sessionId, id: sparseWeekdays.id, expected: timingSnapshot(sparseWeekdays),
      change: { kind: 'weekly', weekly: { time: '09:30:00.000', time_zone: 'Asia/Shanghai', weekdays: [1, 2, 3, 4, 5] } },
    })
  })

  it('restores the stored rule when a detour ends on the stored kind', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    clickRepeat('rule.cron')

    // Choosing the stored kind again is not a staged change: the stored values
    // come back whole, so the reader is not left with the occurrence restated.
    clickRepeat('rule.daily')
    expect(timeField().textContent).toBe('23:00:00')
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
    expect(h.updateTiming).not.toHaveBeenCalled()
  })

  it('submits a stored minute-precision clock as whole seconds', () => {
    const coarse: ScheduleCatalogEntry = { ...weeklyMonday, time: '09:30' }
    const h = mount([coarse])
    selectTask('Weekly Monday')
    expect(timeField().textContent).toBe('09:30:00')

    // The stored clock names minutes alone, so the toggled day is the change
    // that submits it, stated at whole-second precision.
    clickWeekday(3)
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: coarse.sessionId, id: coarse.id, expected: timingSnapshot(coarse),
      change: { kind: 'weekly', weekly: { time: '09:30:00', time_zone: 'Asia/Shanghai', weekdays: [1, 3] } },
    })
  })
})

describe('TaskDetail tabs and menu guards', () => {
  it('cycles and focuses the detail tabs with arrows and Home or End', () => {
    mount([daily])
    selectTask('Daily weather')
    const rules = screen.getByRole('tab', { name: en['detail.rule'] })
    const records = screen.getByRole('tab', { name: en['detail.records'] })

    rules.focus()
    expect(fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })).toBe(false)
    expect(records.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(records)

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(rules.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(records.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(rules.getAttribute('aria-selected')).toBe('true')

    // A key the strip does not own, and a modified arrow, stay with the page.
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab' })).toBe(true)
    expect(rules.getAttribute('aria-selected')).toBe('true')
    expect(fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight', shiftKey: true })).toBe(true)
    expect(rules.getAttribute('aria-selected')).toBe('true')
  })

  it('closes the overflow menu with Escape and returns focus to its trigger', () => {
    mount([at])
    selectTask('Review release')
    const more = moreButton()

    // With the menu shut the guard leaves the key to the page.
    fireEvent.keyDown(more, { key: 'Tab' })
    expect(detail()).toBeDefined()
    fireEvent.keyDown(more, { key: 'Escape' })
    expect(detail()).toBeDefined()

    more.focus()
    fireEvent.click(more)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(more)
    expect(detail()).toBeDefined()
  })

  it('closes the Repeat menu with Escape without closing the detail', () => {
    mount([at])
    selectTask('Review release')
    const repeat = repeatButton()
    repeat.focus()
    fireEvent.click(repeat)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(repeat)
    expect(detail()).toBeDefined()
  })
})

describe('TaskDetail deletion', () => {
  it('confirms a deletion and leaves the task once the refreshed catalog drops the row', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    const dialog = openDelete()
    expect(dialog.textContent).toContain(en['delete.description'])

    fireEvent.click(within(dialog).getByRole('button', { name: en['delete.confirm'] }))
    expect(h.onDelete).toHaveBeenCalledExactlyOnceWith(daily.id)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(detail()).toBeDefined()

    // The catalog first reports the deletion in flight, then the refreshed read
    // without the row; the retained draft keeps the detail mounted until then.
    h.setDeleting([daily.id])
    expect(detail()).toBeDefined()
    h.update([])
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('keeps the rule when a confirmed deletion reaches no authoritative removal', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    openDelete()
    fireEvent.click(screen.getByRole('button', { name: en['delete.confirm'] }))

    h.setDeleting([daily.id])
    h.setDeleting([])
    // The attempt ended with the row still authoritative, so the rule comes
    // back and the detail stays.
    expect(detail()).toBeDefined()
    expect(nameField().value).toBe('Daily weather')

    // A second attempt that ends while the catalog is not settled keeps the
    // confirmation instead: no ready, authoritative read reported the removal.
    openDelete()
    fireEvent.click(screen.getByRole('button', { name: en['delete.confirm'] }))
    h.setDeleting([daily.id])
    h.setStatus('error')
    h.setDeleting([])
    expect(detail()).toBeDefined()
    expect(within(detail()).getByRole('alert').textContent).toBe(en['list.error'])
  })

  it('cancels the confirmation, returns focus, and reports the in-flight label', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    const dialog = openDelete()
    fireEvent.click(within(dialog).getByRole('button', { name: en['delete.cancel'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(moreButton())
    expect(h.onDelete).not.toHaveBeenCalled()

    h.setDeleting([daily.id])
    fireEvent.click(moreButton())
    const pending = screen.getByRole('menuitem', { name: en['delete.pending'] })
    expect(pending.hasAttribute('disabled')).toBe(true)
  })
})

describe('TaskDetail session link and ended tasks', () => {
  it('opens the linked Session under its catalog title', () => {
    const titled: SessionListState = {
      ...sessions,
      byId: {
        ...sessions.byId,
        [daily.sessionId]: { ...sessions.byId[daily.sessionId], title: 'Weather chat' },
      },
    }
    const h = mount([daily], 'ready', { sessions: titled })
    selectTask('Daily weather')
    const link = screen.getByRole('button', {
      name: en['detail.openSessionTitle'].replace('{title}', 'Weather chat'),
    })
    fireEvent.click(link)
    expect(h.onOpenSession).toHaveBeenCalledExactlyOnceWith(daily.sessionId)
  })

  it('states an unavailable, loading, or archived original Session', () => {
    const orphan: ScheduleCatalogEntry = { ...daily, sessionId: 'session-orphan' as SessionId }
    mount([orphan])
    selectTask('Daily weather')
    expect(screen.getByRole('button', { name: en['detail.openSession'] }).hasAttribute('disabled')).toBe(true)
    expect(within(detail()).getByRole('status').textContent).toBe(en['detail.sessionUnavailable'])
    cleanup()

    mount([daily], 'ready', { sessions: { ...sessions, phase: 'pending' } })
    selectTask('Daily weather')
    expect(within(detail()).getByRole('status').textContent).toBe(en['detail.sessionLoading'])
    cleanup()

    mount([daily], 'ready', { workspaces: { ...workspaces, archivedSessionIds: [daily.sessionId] } })
    selectTask('Daily weather')
    expect(within(detail()).getByRole('status').textContent).toBe(en['detail.sessionArchived'])
  })

  it('shows an ended task as read-only text without a staged-edit bar', () => {
    mount([{ ...daily, status: 'inactive', prompt: 'Ended instruction' }])
    selectTask('Daily weather')
    expect(screen.getByRole('heading', { name: 'Daily weather' })).toBeDefined()
    expect(screen.queryByLabelText(en['detail.name'])).toBeNull()
    expect(within(detail()).getByText('Ended instruction')).toBeDefined()
    expect(within(detail()).getByText(en['status.inactive'])).toBeDefined()
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })

  it('drops a staged draft when the shown task ends', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    fireEvent.change(nameField(), { target: { value: 'Weather check' } })
    expect(screen.getByRole('button', { name: en['rule.save'] })).toBeDefined()

    h.update([{ ...daily, status: 'inactive' }])
    // An ended rule can never be saved again, so the draft is replaced by the
    // stored values instead of reading as the rule the record holds.
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Daily weather' })).toBeDefined()
  })

  it('re-seeds an ended task from a refresh that changed its rule', () => {
    const ended: ScheduleCatalogEntry = { ...daily, status: 'inactive' }
    const h = mount([ended])
    selectTask('Daily weather')
    h.update([{ ...ended, title: 'Renamed weather', prompt: 'Renamed instruction' }])
    expect(screen.getByRole('heading', { name: 'Renamed weather' })).toBeDefined()
    expect(within(detail()).getByText('Renamed instruction')).toBeDefined()
  })

  it('reads a missing capability as a failed read inside the open detail', () => {
    const h = mount([daily])
    selectTask('Daily weather')
    // The detail has no capability notice of its own, so the catalog's
    // `unavailable` state reads as the failed read it already states.
    h.setStatus('unavailable')
    expect(within(detail()).getByRole('alert').textContent).toBe(en['list.error'])
  })
})

describe('TaskDetail zone choices', () => {
  it('closes the zone menu with Escape and drops a typed query when the trigger closes it', () => {
    mount([daily])
    selectTask('Daily weather')
    const zone = zoneButton()
    zone.focus()
    fireEvent.click(zone)
    fireEvent.change(zoneSearchField(), { target: { value: 'utc' } })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(zone)

    // Pressing the trigger of an open menu closes it and clears the query, so
    // the next opening starts from the full list.
    fireEvent.click(zone)
    fireEvent.change(zoneSearchField(), { target: { value: 'utc' } })
    fireEvent.click(zone)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(zone)
    expect(zoneSearchField().value).toBe('')
  })

  it('adopts the exact id a zone query names', () => {
    const restoreSystemZone = pinSystemZone('UTC')
    const inventory = vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Africa/Cairo', 'Europe/Athens'])
    try {
      const h = mount([{ ...daily, timeZone: 'UTC' }])
      selectTask('Daily weather')
      fireEvent.click(zoneButton())
      fireEvent.change(zoneSearchField(), { target: { value: 'Europe/Athens' } })
      fireEvent.click(screen.getByRole('menuitem'))
      clickSave()
      expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        change: { kind: 'daily', daily: { time: '23:00:00.000', time_zone: 'Europe/Athens' } },
      }))
    } finally {
      inventory.mockRestore()
      restoreSystemZone()
    }
  })

  it('keeps the row id when a query names only the row label', () => {
    const restoreSystemZone = pinSystemZone('UTC')
    try {
      mount([{ ...daily, timeZone: 'UTC' }])
      selectTask('Daily weather')
      fireEvent.click(zoneButton())
      // The system suffix names the row's label, not any IANA id, so the row
      // keeps the zone the rule states instead of adopting an alias.
      fireEvent.change(zoneSearchField(), { target: { value: en['rule.zone.system'].trim() } })
      fireEvent.click(screen.getByRole('menuitem'))
      expect(screen.queryByRole('menu')).toBeNull()
      expect(zoneButton().textContent).toContain(en['timing.zone'])
      expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
    } finally {
      restoreSystemZone()
    }
  })
})

describe('TaskDetail cron rows', () => {
  it('switches a cron rule between the weekly and monthly shapes', () => {
    const h = mount([cron])
    selectTask('Cron report')

    // A weekly expression has no date field, so the monthly choice seeds its date
    // from the committed occurrence —2026-10-05T01:30Z is the 5th in the zone the
    // rule states —and keeps the clock the weekly shape already states.
    chooseCronShape('cronForm.monthly')
    expect(datesPressed(dateGroup())).toEqual([5])
    expect(timeField().textContent).toBe('09:00')

    // Back to weekly: the shape's own fields seed the weekday set from the same
    // occurrence, whose UTC day is a Monday.
    chooseCronShape('cronForm.weekly')
    expect(weekdayPressed(weekdayGroup()))
      .toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false'])

    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: cron.sessionId, id: cron.id, expected: timingSnapshot(cron),
      change: { kind: 'cron', cron: { expression: '0 9 * * 1', time_zone: 'UTC' } },
    })
  })

  it('removes a weekday from the weekly cron shape', () => {
    const h = mount([cron])
    selectTask('Cron report')
    clickWeekday(1)
    expect(weekdayPressed(weekdayGroup()))
      .toEqual(['false', 'true', 'true', 'true', 'true', 'false', 'false'])

    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: cron.sessionId, id: cron.id, expected: timingSnapshot(cron),
      change: { kind: 'cron', cron: { expression: '0 9 * * 2-5', time_zone: 'UTC' } },
    })
  })

  it('refuses an unparsable cron expression locally', () => {
    const stored: ScheduleCatalogEntry = { ...cron, expression: 'nonsense' }
    const h = mount([stored])
    selectTask('Cron report')
    fireEvent.change(nameField(), { target: { value: 'Cron check' } })
    clickSave()
    expect(h.updateTiming).not.toHaveBeenCalled()
    expect(within(detail()).getByRole('alert').textContent).toBe(en['rule.cronInvalid'])
  })

  it('dismisses both one-shot pickers on an outside pointer press', () => {
    mount([daily])
    selectTask('Daily weather')
    clickRepeat('rule.once')

    const date = dateButton()
    fireEvent.click(date)
    expect(screen.getByRole('grid', { name: /.+/ })).toBeDefined()
    pressOutsideMenus()
    expect(screen.queryByRole('grid', { name: /.+/ })).toBeNull()

    const time = timeField()
    fireEvent.click(time)
    expect(clockColumn('timing.hour')).toBeDefined()
    pressOutsideMenus()
    expect(screen.queryByRole('listbox', { name: en['timing.hour'] })).toBeNull()
    // Neither dismissal staged a value, so the switch itself is still the only change.
    expect(screen.getByRole('button', { name: en['rule.save'] })).toBeDefined()
  })

  it('switches a cron rule to the minutely and hourly shapes and edits both steppers', () => {
    const h = mount([cron])
    selectTask('Cron report')
    chooseCronShape('rule.everyMinutes')
    expect(intervalField().value).toBe('5')

    chooseCronShape('rule.everyHours')
    expect(screen.getByLabelText<HTMLInputElement>(en['cronForm.atMinute']).value).toBe('30')

    fireEvent.change(intervalField(), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: en['timing.intervalIncrease'] }))
    expect(intervalField().value).toBe('4')
    fireEvent.click(screen.getByRole('button', { name: en['timing.intervalDecrease'] }))
    expect(intervalField().value).toBe('3')

    fireEvent.change(screen.getByLabelText<HTMLInputElement>(en['cronForm.atMinute']), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: en['cronForm.minuteIncrease'] }))
    expect(screen.getByLabelText<HTMLInputElement>(en['cronForm.atMinute']).value).toBe('46')
    fireEvent.click(screen.getByRole('button', { name: en['cronForm.minuteDecrease'] }))
    expect(screen.getByLabelText<HTMLInputElement>(en['cronForm.atMinute']).value).toBe('45')

    // An emptied stepper stages nothing rather than clearing the field.
    fireEvent.change(intervalField(), { target: { value: '' } })
    expect(intervalField().value).toBe('3')

    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: cron.sessionId, id: cron.id, expected: timingSnapshot(cron),
      change: { kind: 'cron', cron: { expression: '45 */3 * * *', time_zone: 'UTC' } },
    })
  })

  it('regenerates the weekly cron expression from its pills and keeps the last day', () => {
    const h = mount([cron])
    selectTask('Cron report')
    expect(within(weekdayGroup()).getAllByRole('button')).toHaveLength(7)
    clickWeekday(7)
    expect(weekdayOn(7)).toBe('true')
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: cron.sessionId, id: cron.id, expected: timingSnapshot(cron),
      change: { kind: 'cron', cron: { expression: '0 9 * * 0-5', time_zone: 'UTC' } },
    })

    cleanup()
    mount([{ ...cron, expression: '0 9 * * 1' }])
    selectTask('Cron report')
    clickWeekday(1)
    expect(weekdayOn(1)).toBe('true')
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })

  it('regenerates the monthly cron expression from its dates and keeps the last date', () => {
    const stored: ScheduleCatalogEntry = { ...cron, expression: '30 8 1,15 * *' }
    const h = mount([stored])
    selectTask('Cron report')
    expect(datesPressed(dateGroup())).toEqual([1, 15])

    fireEvent.click(within(dateGroup()).getByRole('button', { name: dateName(20) }))
    expect(datesPressed(dateGroup())).toEqual([1, 15, 20])
    fireEvent.click(within(dateGroup()).getByRole('button', { name: dateName(1) }))
    expect(datesPressed(dateGroup())).toEqual([15, 20])

    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: cron.sessionId, id: cron.id, expected: timingSnapshot(stored),
      change: { kind: 'cron', cron: { expression: '30 8 15,20 * *', time_zone: 'UTC' } },
    })

    cleanup()
    mount([{ ...cron, expression: '0 9 15 * *' }])
    selectTask('Cron report')
    fireEvent.click(within(dateGroup()).getByRole('button', { name: dateName(15) }))
    expect(datesPressed(dateGroup())).toEqual([15])
    expect(screen.queryByRole('button', { name: en['rule.save'] })).toBeNull()
  })

  it('closes the cron Frequency menu with Escape without closing the detail', () => {
    mount([cron])
    selectTask('Cron report')
    const frequency = frequencyButton()
    frequency.focus()
    fireEvent.click(frequency)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(frequency)
    expect(detail()).toBeDefined()
  })

  it('picks a clock into the cron expression and closes its panel with Escape', () => {
    const h = mount([cron])
    selectTask('Cron report')
    const time = timeField()
    time.focus()
    fireEvent.click(time)
    expect(screen.queryByRole('listbox', { name: en['timing.second'] })).toBeNull()
    fireEvent.keyDown(clockColumn('timing.hour'), { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: en['timing.hour'] })).toBeNull()
    expect(document.activeElement).toBe(time)

    // A cron expression has no seconds field, so the picked clock stages whole minutes.
    expect(chooseTime('10', '45', undefined)).toBe('10:45')
    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: cron.sessionId, id: cron.id, expected: timingSnapshot(cron),
      change: { kind: 'cron', cron: { expression: '45 10 * * 1-5', time_zone: 'UTC' } },
    })
  })

  it('keeps a raw unrecognized expression editable until another shape is chosen', () => {
    const stored: ScheduleCatalogEntry = { ...cron, expression: 'nonsense' }
    const h = mount([stored])
    selectTask('Cron report')
    const raw = screen.getByLabelText<HTMLInputElement>(en['rule.cronLabel'])
    expect(raw.value).toBe('nonsense')
    expect(raw.getAttribute('aria-invalid')).toBe('true')

    // Typing a recognized expression hands the rows back to the builder.
    fireEvent.change(raw, { target: { value: '15 7 * * *' } })
    expect(screen.queryByLabelText(en['rule.cronLabel'])).toBeNull()

    clickSave()
    expect(h.updateTiming).toHaveBeenCalledExactlyOnceWith({
      sessionId: stored.sessionId, id: stored.id, expected: timingSnapshot(stored),
      change: { kind: 'cron', cron: { expression: '15 7 * * *', time_zone: 'UTC' } },
    })
  })
})
