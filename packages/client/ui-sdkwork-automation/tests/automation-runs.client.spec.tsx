// @vitest-environment jsdom
/**
 * Run-history view spec: the first read's loading state, the failure state and
 * its retry, the empty state, the newest-first rows merged from one page per
 * task, a task the Host no longer holds, a delivery saved without a prompt, and
 * the bounded task window.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ScheduleCatalogEntry, ScheduleDeliveryHistoryResult, ScheduleDeliveryRecord, ScheduleId,
} from '@deepseek-ai/dsh-schedule/client'
import type { AutomationRunsProps } from '../src/client/AutomationRuns.tsx'
import { AutomationRuns, RUNS_PAGE_LIMIT, RUNS_TASK_LIMIT } from '../src/client/AutomationRuns.tsx'
import { formatScheduleAbsolute } from '../src/client/schedule-format.ts'
import { en } from '../src/client/locales.ts'

type History = RemoteResult<ScheduleDeliveryHistoryResult>
type LoadHistory = AutomationRunsProps['loadHistory']

/**
 * Locale seat stand-in: the English dictionary, because a row's delivered line
 * formats its instant through `t('time.locale')` and needs a real ICU locale.
 */
const t = makeTranslate(en)

/** One active one-shot task; the view reads its identity, title, and target. */
function task(id: string, title: string, scheduledAt: string): ScheduleCatalogEntry {
  return {
    id: id as ScheduleId,
    kind: 'at',
    title,
    prompt: `${title} instruction`,
    scheduledAt,
    sessionId: `session-${id}` as SessionId,
    status: 'active',
  }
}

/** One saved inbox delivery; the sent prompt is absent unless the case states one. */
function delivery(messageId: string, deliveredAt: string, prompt?: string): ScheduleDeliveryRecord {
  return {
    messageId: messageId as ScheduleDeliveryRecord['messageId'],
    scheduledAt: deliveredAt,
    deliveredAt,
    ...(prompt === undefined ? {} : { prompt }),
  }
}

/** One successful history page. */
function page(id: string, saved: readonly ScheduleDeliveryRecord[]): History {
  return { ok: true, value: {
    id: id as ScheduleId,
    records: [...saved],
    earlierRecordsUnavailable: false,
    earlierRecordsPruned: false,
    retention: { days: 30, records: 200 },
  } }
}

/** The transport failure the retry case starts from. */
const FAILURE: History = {
  ok: false,
  error: new RemoteError('gateway/internal', 'Private transport detail', {}),
}

/** The delivered line one row states for one saved delivery. */
function deliveredLine(saved: ScheduleDeliveryRecord): string {
  return en['runs.delivered'].replace('{time}', formatScheduleAbsolute(saved.deliveredAt, en['time.locale']))
}

/** The notice the view states once the catalog outgrows the read window. */
function notice(): string {
  return en['runs.notice'].replace('{count}', String(RUNS_TASK_LIMIT))
}

function view(records: readonly ScheduleCatalogEntry[], loadHistory: LoadHistory) {
  return render(<AutomationRuns records={records} loadHistory={loadHistory} t={t} />)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AutomationRuns', () => {
  it('shows the loading state while the first read is in flight', () => {
    const pending = Promise.withResolvers<History>()
    const saved = task('a', 'Task A', '2026-10-05T07:00:00.000Z')
    const loadHistory = vi.fn<LoadHistory>(() => pending.promise)
    view([saved], loadHistory)
    expect(screen.getByRole('status', { name: en['runs.loading'] })).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(en['empty.runs.title'])).toBeNull()
    expect(loadHistory).toHaveBeenCalledWith({ sessionId: saved.sessionId, id: saved.id, limit: RUNS_PAGE_LIMIT })
  })

  it('shows the failure state when a task read fails and reads again on retry', async () => {
    const a = task('a', 'Task A', '2026-10-04T07:00:00.000Z')
    const b = task('b', 'Task B', '2026-10-06T07:00:00.000Z')
    let failing = 'a'
    const loadHistory = vi.fn<LoadHistory>(request => Promise.resolve(request.id === failing
      ? FAILURE
      : page(request.id, [delivery(`m-${request.id}`, '2026-10-07T07:00:05.000Z', 'Saved prompt')])))
    view([a, b], loadHistory)
    expect((await screen.findByRole('alert')).textContent).toBe(en['runs.error'])
    // The page that did arrive is dropped rather than shown beside the failure.
    expect(screen.queryByText('Task B')).toBeNull()
    expect(loadHistory.mock.calls.map(([request]) => request.id)).toEqual(['b', 'a'])
    failing = ''
    fireEvent.click(screen.getByRole('button', { name: en['runs.retry'] }))
    await screen.findByRole('list', { name: en['runs.label'] })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(loadHistory.mock.calls.length).toBeGreaterThan(2)
    expect(screen.getByText('Task A')).toBeDefined()
    expect(screen.getByText('Task B')).toBeDefined()
  })

  it('shows the empty state without reading any task history', async () => {
    const loadHistory = vi.fn<LoadHistory>()
    view([], loadHistory)
    expect(await screen.findByText(en['empty.runs.title'])).toBeDefined()
    expect(screen.getByText(en['empty.runs.hint'])).toBeDefined()
    expect(screen.queryByRole('status')).toBeNull()
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('merges one page per task into rows ordered by delivery, newest first', async () => {
    const a = task('a', 'Task A', '2026-10-04T07:00:00.000Z')
    const b = task('b', 'Task B', '2026-10-06T07:00:00.000Z')
    const older = delivery('m-older', '2026-10-05T07:00:05.000Z', 'Older prompt')
    const middle = delivery('m-middle', '2026-10-06T07:00:05.000Z')
    const newer = delivery('m-newer', '2026-10-07T07:00:05.000Z', 'Newer prompt')
    const loadHistory = vi.fn<LoadHistory>(request => Promise.resolve(
      request.id === 'a' ? page('a', [older, middle]) : page('b', [newer])))
    view([a, b], loadHistory)
    const list = await screen.findByRole('list', { name: en['runs.label'] })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map(row => row.querySelector('time')?.dateTime))
      .toEqual([newer.deliveredAt, middle.deliveredAt, older.deliveredAt])
    expect(within(rows[0]).getByText('Task B')).toBeDefined()
    expect(within(rows[0]).getByText(deliveredLine(newer))).toBeDefined()
    expect(within(rows[0]).getByText('Newer prompt')).toBeDefined()
    expect(within(rows[1]).getByText('Task A')).toBeDefined()
    expect(within(rows[1]).getByText(deliveredLine(middle))).toBeDefined()
    expect(within(rows[2]).getByText(deliveredLine(older))).toBeDefined()
    expect(within(rows[2]).getByText('Older prompt')).toBeDefined()
  })

  it.each(['schedule_not_found', 'delivery_cursor_not_found'] as const)(
    'treats a %s page as an empty page rather than a failure',
    async (code) => {
      const gone = task('gone', 'Gone', '2026-10-05T07:00:00.000Z')
      const loadHistory = vi.fn<LoadHistory>().mockResolvedValue({
        ok: true, value: { id: gone.id, code },
      })
      view([gone], loadHistory)
      expect(await screen.findByText(en['empty.runs.title'])).toBeDefined()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(loadHistory).toHaveBeenCalledTimes(1)
    },
  )

  it('renders no prompt paragraph for a delivery saved without one', async () => {
    const saved = delivery('m-plain', '2026-10-05T07:00:05.000Z')
    const loadHistory = vi.fn<LoadHistory>().mockResolvedValue(page('a', [saved]))
    view([task('a', 'Task A', '2026-10-05T07:00:00.000Z')], loadHistory)
    const list = await screen.findByRole('list', { name: en['runs.label'] })
    const row = within(list).getAllByRole('listitem')[0]
    expect(within(row).getByText('Task A')).toBeDefined()
    expect(within(row).getByText(deliveredLine(saved))).toBeDefined()
    expect(row.querySelector('p')).toBeNull()
  })

  it('reads only the newest tasks up to the window and states the bound', async () => {
    const records = Array.from({ length: RUNS_TASK_LIMIT + 3 }, (_value, index) =>
      task(`t${index}`, `Task ${index}`, new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString()))
    const loadHistory = vi.fn<LoadHistory>(request => Promise.resolve(
      page(request.id, [delivery(`m-${request.id}`, '2026-10-08T07:00:05.000Z')])))
    view(records, loadHistory)
    expect(await screen.findByText(notice())).toBeDefined()
    expect(loadHistory).toHaveBeenCalledTimes(RUNS_TASK_LIMIT)
    const requested = loadHistory.mock.calls.map(([request]) => request.id)
    expect(requested).toEqual(records.slice(3).reverse().map(record => record.id))
    expect(requested).not.toContain(records[0].id)
    expect(await screen.findByRole('list', { name: en['runs.label'] })).toBeDefined()
  })

  it('drops a page that arrives after unmount without warning or rendering', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pending = Promise.withResolvers<History>()
    const loadHistory = vi.fn<LoadHistory>(() => pending.promise)
    view([task('a', 'Task A', '2026-10-05T07:00:00.000Z')], loadHistory)
    expect(screen.getByRole('status', { name: en['runs.loading'] })).toBeDefined()
    cleanup()
    await act(async () => {
      pending.resolve(page('a', [delivery('m-late', '2026-10-05T07:00:05.000Z', 'Saved prompt')]))
      await pending.promise
    })
    expect(error).not.toHaveBeenCalled()
    expect(document.body.textContent).toBe('')
  })
})
