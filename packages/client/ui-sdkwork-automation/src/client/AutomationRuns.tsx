/**
 * Run-history view: the saved delivery records of the tasks the catalog holds.
 *
 * The Host keeps delivery history per task, so this view reads it task by task
 * and merges the pages it gets back. Delivery is an inbox acknowledgment, not a
 * model execution result, and the copy says so.
 */
import { useEffect, useState } from 'react'
import { Button, IconWarningOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ScheduleCatalogEntry, ScheduleDeliveryHistoryRequest, ScheduleDeliveryHistoryResult, ScheduleDeliveryRecord,
} from '@deepseek-ai/dsh-schedule/client'
import { formatScheduleAbsolute } from './schedule-format.ts'
import css from './AutomationPage.module.css'

/** Records requested per task; one page is enough to describe recent activity. */
export const RUNS_PAGE_LIMIT = 20

/** Tasks whose history this view reads; the catalog can hold far more. */
export const RUNS_TASK_LIMIT = 20

/** One delivery record with the task that produced it. */
export interface DeliveryRow {
  /** Task the occurrence was delivered for. */
  readonly task: ScheduleCatalogEntry
  /** The saved delivery acknowledgment. */
  readonly delivery: ScheduleDeliveryRecord
}

/** Query state of the merged run history. */
type RunsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly rows: readonly DeliveryRow[] }
  | { readonly status: 'error' }

/** Props of the run-history view. */
export type AutomationRunsProps = PropsLocale<'automation'> & {
  /** The catalog's current tasks, active and inactive. */
  readonly records: readonly ScheduleCatalogEntry[]
  /** Read one task's saved deliveries. */
  readonly loadHistory: (request: ScheduleDeliveryHistoryRequest) => Promise<RemoteResult<ScheduleDeliveryHistoryResult>>
}

/**
 * The tasks this view reads, newest target first: a bounded window that keeps
 * one screen of history from costing a request per task ever created.
 * @param records - the catalog's tasks.
 * @returns at most {@link RUNS_TASK_LIMIT} tasks.
 */
function recentTasks(records: readonly ScheduleCatalogEntry[]): readonly ScheduleCatalogEntry[] {
  return [...records]
    .sort((left, right) => Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt))
    .slice(0, RUNS_TASK_LIMIT)
}

/**
 * Render the merged delivery records of the catalog's recent tasks.
 * @param props - catalog records, the history reader, and the locale seat.
 * @returns the run-history element tree.
 */
export function AutomationRuns({ records, loadHistory, t }: AutomationRunsProps) {
  const [state, setState] = useState<RunsState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    // A holder rather than a `let`: the cleanup closure is the only writer, so a
    // plain binding would read as never reassigned at the guards below.
    const lifecycle = { cancelled: false }
    const tasks = recentTasks(records)
    setState({ status: 'loading' })
    void (async () => {
      const rows: DeliveryRow[] = []
      // Sequential on purpose: the window is bounded, and one request per task
      // issued at once would burst the Host's queue for a page that only reads.
      for (const task of tasks) {
        const result = await loadHistory({ sessionId: task.sessionId, id: task.id, limit: RUNS_PAGE_LIMIT })
        if (lifecycle.cancelled) return
        if (!result.ok) {
          setState({ status: 'error' })
          return
        }
        // A task the Host no longer holds is an empty page here, not a failure:
        // the catalog's own read states the removal.
        if ('records' in result.value) {
          for (const delivery of result.value.records) rows.push({ task, delivery })
        }
      }
      rows.sort((left, right) => Date.parse(right.delivery.deliveredAt) - Date.parse(left.delivery.deliveredAt))
      setState({ status: 'ready', rows })
    })()
    return () => { lifecycle.cancelled = true }
  }, [records, loadHistory, attempt])

  if (state.status === 'loading') {
    return <div className={css.runsState} role="status" aria-label={t('runs.loading')}><StateDot state="ongoing" /></div>
  }
  if (state.status === 'error') {
    return (
      <div className={css.runsState}>
        <IconWarningOutlineRegular size={24} className={css.emptyIcon} />
        <p role="alert" className={css.emptyTitle}>{t('runs.error')}</p>
        <Button variant="outline" className={css.emptyAction} onClick={() => { setAttempt(value => value + 1) }}>
          {t('runs.retry')}
        </Button>
      </div>
    )
  }
  if (state.rows.length === 0) {
    return (
      <div className={css.runsState}>
        <p className={css.emptyTitle}>{t('empty.runs.title')}</p>
        <p className={css.emptyHint}>{t('empty.runs.hint')}</p>
      </div>
    )
  }
  return (
    <div className={css.runs}>
      {records.length > RUNS_TASK_LIMIT && <p className={css.runsNotice}>{t('runs.notice', { count: RUNS_TASK_LIMIT })}</p>}
      <ul className={css.runsRows} aria-label={t('runs.label')}>
        {state.rows.map(({ task, delivery }) => (
          <li key={`${task.id}-${delivery.messageId}`} className={css.runsRow}>
            <span className={css.runsTitle}>{task.title}</span>
            <time className={css.runsTime} dateTime={delivery.deliveredAt}>
              {t('runs.delivered', { time: formatScheduleAbsolute(delivery.deliveredAt, t('time.locale')) })}
            </time>
            {delivery.prompt !== undefined && <p className={css.runsPrompt}>{delivery.prompt}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
