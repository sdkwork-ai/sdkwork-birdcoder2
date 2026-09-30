/**
 * The Automation page: the center-column surface for the `automation` mode,
 * keyed into the frame's `mode.page` slot.
 *
 * The page is the fork's own scheduled-task surface. It reads the Host Schedule
 * catalog through one observable source and shows every retained task — active
 * and inactive — with search, a status filter, and each task's stored name,
 * frequency, and next run. A top tab bar switches that list with the run-history
 * view; the template catalog stays below the list as the page's starting point.
 *
 * Task creation goes through the add-task dialog: the Host exposes creation only
 * as the model-facing `schedule_create` tool, so confirm hands the draft to the
 * plugin, which opens a conversation and asks the model to create exactly that
 * task.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { ComponentType } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ScheduleCatalogEntry, ScheduleDeliveryHistoryRequest, ScheduleDeliveryHistoryResult,
  ScheduleUpdateRequest, ScheduleUpdateResult,
} from '@deepseek-ai/dsh-schedule/client'
import { AutomationCreateModal } from './AutomationCreateModal.tsx'
import { AutomationRuns } from './AutomationRuns.tsx'
import { TaskDetail, useTaskDetail } from './TaskDetail.tsx'
import type { CatalogDeleteOutcome, CatalogSnapshot, CatalogStatus } from './catalog-source.ts'
import type { AutomationCreateSeed, AutomationDraft, CreateWorkspaceOption } from './create-request.ts'
import { templateSeed } from './template-seeds.ts'
import { useRelativeClock } from './relative-clock.ts'
import { formatScheduleFrequency, nextRunParts, zoneLabel, type FrequencyZone } from './schedule-format.ts'
import { AlarmCheckIcon, AutomationIcon, PlusIcon, RunsIcon } from './icons.tsx'
import {
  BedtimeMoonIcon, CheckupIcon, HistoryTodayIcon, InterviewChatIcon,
  MeetingAgendaIcon, MoviesIcon, NewsDigestIcon, ParentsCallIcon,
  VocabBookIcon, WallpaperImageIcon, WeeklyReportIcon, WhyBulbIcon,
} from './templateIcons.tsx'
import type { AutomationKey } from './locales.ts'
import type { ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import css from './AutomationPage.module.css'

/** One automation view tab id. */
export type AutomationTab = 'scheduled' | 'runs'

/** The view tabs, in tab-bar order (the panel marker's id space). */
const TAB_IDS: readonly AutomationTab[] = ['scheduled', 'runs']

/** Each view's dictionary key, in {@link TAB_IDS} order. */
const TAB_KEYS = {
  scheduled: 'tab.scheduled',
  runs: 'tab.runs',
} as const satisfies Record<AutomationTab, AutomationKey>

/** Each view tab's leading glyph, in {@link TAB_IDS} order. */
const TAB_ICONS: Record<AutomationTab, ComponentType<ModeIconProps>> = {
  scheduled: AutomationIcon,
  runs: RunsIcon,
}

/** One template-catalog row: its marker id, glyph, and dictionary keys. */
interface AutomationTemplate {
  /** The card's `data-automation-template` marker. */
  id: string
  /** The card's leading glyph. */
  Icon: ComponentType<ModeIconProps>
  /** The card title's dictionary key. */
  titleKey: AutomationKey
  /** The card description's dictionary key. */
  descriptionKey: AutomationKey
}

/** The static template catalog, in card order. */
const TEMPLATES: readonly AutomationTemplate[] = [
  { id: 'news', Icon: NewsDigestIcon, titleKey: 'template.news.title', descriptionKey: 'template.news.description' },
  { id: 'vocab', Icon: VocabBookIcon, titleKey: 'template.vocab.title', descriptionKey: 'template.vocab.description' },
  { id: 'bedtime', Icon: BedtimeMoonIcon, titleKey: 'template.bedtime.title', descriptionKey: 'template.bedtime.description' },
  { id: 'weekly-report', Icon: WeeklyReportIcon, titleKey: 'template.weeklyReport.title', descriptionKey: 'template.weeklyReport.description' },
  { id: 'movies', Icon: MoviesIcon, titleKey: 'template.movies.title', descriptionKey: 'template.movies.description' },
  { id: 'history-today', Icon: HistoryTodayIcon, titleKey: 'template.historyToday.title', descriptionKey: 'template.historyToday.description' },
  { id: 'why', Icon: WhyBulbIcon, titleKey: 'template.why.title', descriptionKey: 'template.why.description' },
  { id: 'parents-call', Icon: ParentsCallIcon, titleKey: 'template.parentsCall.title', descriptionKey: 'template.parentsCall.description' },
  { id: 'checkup', Icon: CheckupIcon, titleKey: 'template.checkup.title', descriptionKey: 'template.checkup.description' },
  { id: 'interview', Icon: InterviewChatIcon, titleKey: 'template.interview.title', descriptionKey: 'template.interview.description' },
  { id: 'meeting', Icon: MeetingAgendaIcon, titleKey: 'template.meeting.title', descriptionKey: 'template.meeting.description' },
  { id: 'wallpaper', Icon: WallpaperImageIcon, titleKey: 'template.wallpaper.title', descriptionKey: 'template.wallpaper.description' },
]

/** The status filter's value space: either status, or no filter. */
type StatusFilter = 'all' | ScheduleCatalogEntry['status']

/** The filter values, in filter-bar order. */
const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'active', 'inactive']

/** Each filter value's dictionary key, in {@link STATUS_FILTERS} order. */
const STATUS_KEYS = {
  all: 'statusFilter.all',
  active: 'status.active',
  inactive: 'status.inactive',
} as const satisfies Record<StatusFilter, AutomationKey>

/** Injected business face: the catalog, its actions, and the create channel. */
export interface AutomationPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'automation'
  /** The Host task catalog this page renders. */
  hooks: { catalog: HostObservable<CatalogSnapshot> }
  /** Reload the catalog after a failed read. */
  onRetry: (since?: number) => Promise<void>
  /**
   * Delete one task through its original Session binding. Deletion is hard: the
   * Host removes the stored task with its saved delivery records.
   * @param id - task shown in the list.
   */
  onDelete: (id: ScheduleCatalogEntry['id']) => Promise<CatalogDeleteOutcome>
  /**
   * Apply one compare-and-update request. The plugin re-reads the catalog after
   * an accepted write, a conflict, or a task the Host no longer holds.
   * @param request - complete expected record with the optional content and timing change.
   * @returns the Host's own result, unchanged.
   */
  onUpdateTiming: (request: ScheduleUpdateRequest) => Promise<RemoteResult<ScheduleUpdateResult>>
  /**
   * Open an available, unarchived original conversation after rechecking current
   * Session and Workspace metadata.
   * @param id - Session bound to the shown task.
   */
  onOpenSession: (id: SessionId) => void
  /** Hand a completed dialog draft to the create channel. */
  onCreateTask: (draft: AutomationDraft) => void
  /** Read one task's saved delivery records. */
  loadHistory: (request: ScheduleDeliveryHistoryRequest) => Promise<RemoteResult<ScheduleDeliveryHistoryResult>>
}

/** Full component props: runtime share + injected face + the locale seat. */
export type AutomationPageProps =
  PropsRuntime<'mode.page'>
  & InjectFace<AutomationPageInjected>
  & PropsLocale<'automation'>

/** The first-task empty state's copy for one query state. */
function emptyKey(records: readonly ScheduleCatalogEntry[], statusFilter: StatusFilter, search: string): AutomationKey {
  // An inactive-only filter is its own empty state: no task is inactive, rather
  // than no task matched.
  if (statusFilter === 'inactive' && search === '') return 'list.emptyInactive'
  return records.length === 0 ? 'list.empty' : 'list.noMatches'
}

/** The catalog's loading, failure, and missing-capability states. */
function ListFeedback({ status, settled, onRetry, t }: {
  status: CatalogStatus
  settled: boolean
  onRetry: () => void
  t: (key: AutomationKey) => string
}) {
  if (status === 'loading' && !settled) return <p className={css.listState} role="status">{t('list.loading')}</p>
  if (status === 'unavailable') {
    return (
      <div className={css.listState}>
        <p className={css.listStateTitle} role="alert">{t('list.unavailable.title')}</p>
        <p className={css.emptyHint}>{t('list.unavailable.hint')}</p>
        <button type="button" className={css.linkButton} onClick={onRetry}>{t('list.retry')}</button>
      </div>
    )
  }
  if (status !== 'error') return null
  return (
    <div className={css.listState}>
      <p className={css.listStateTitle} role="alert">{t('list.error')}</p>
      <button type="button" className={css.linkButton} onClick={onRetry}>{t('list.retry')}</button>
    </div>
  )
}

/**
 * Render the Automation page with its view tabs, task list, run history, and
 * template catalog.
 * @param props - composed slot props (runtime share + injected face + locale seat).
 * @returns the page element tree.
 */
export function AutomationPage(props: AutomationPageProps) {
  const { mode, useCatalog, useWorkspaces, onRetry, onDelete, onCreateTask, loadHistory, t } = props
  const catalog = useCatalog(snapshot => snapshot)
  const { records, status, settled, deleting } = catalog
  const [view, setView] = useState<AutomationTab>('scheduled')
  const [createOpen, setCreateOpen] = useState(false)
  /**
   * Values the dialog opens with. A template card stages its own; the New action
   * stages nothing, so the same dialog serves both entries.
   */
  const [seed, setSeed] = useState<AutomationCreateSeed | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  // Deletion is confirmed in place: the row that asks is the row that acts, and
  // the confirmation cannot outlive the record it names.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<ScheduleId | null>(null)
  // The detail's draft, view, confirmation, and element id belong to the page,
  // not to the panel: they survive a catalog refresh and reset with the selection.
  const detail = useTaskDetail(props, catalog, selectedId ?? undefined)
  const { record: shownRecord, task: shownTask, id: detailId, setTab: setDetailTab } = detail
  const closeDetails = (): void => { setSelectedId(null) }
  // The rows state how long remains, so they read the shared ticking clock
  // rather than a value sampled at mount: a catalog refresh can move the target
  // this text describes.
  const now = useRelativeClock()

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter(record => (
      (statusFilter === 'all' || record.status === statusFilter)
      && (query === ''
        || record.title.toLowerCase().includes(query)
        || record.prompt.toLowerCase().includes(query)
        || record.sessionId.toLowerCase().includes(query))
    )).toSorted((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))
  }, [records, search, statusFilter])

  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const frequencyZone: FrequencyZone = { system: systemZone, label: zone => zoneLabel(zone, t) }
  // The picker offers the Workspaces the browser already catalogues; a blank
  // title falls back to the path, so no row is unnamed.
  const workspaces: readonly CreateWorkspaceOption[] = useWorkspaces(snapshot => snapshot.items)
    .map(item => ({ id: item.workspaceId, label: item.title.trim() === '' ? item.path : item.title }))
  const openCreate = (next?: AutomationCreateSeed): void => {
    setSeed(next)
    setCreateOpen(true)
  }
  const submitDraft = (draft: AutomationDraft): void => {
    setCreateOpen(false)
    onCreateTask(draft)
  }

  return (
    <div className={css.page} data-mode={mode} data-mode-page={mode}>
      <div className={css.tabs} role="tablist" aria-label={t('tabs.label')}>
        {TAB_IDS.map((id) => {
          const TabIcon = TAB_ICONS[id]
          return (
            <button
              key={id}
              type="button"
              role="tab"
              className={clsx(css.tab, view === id && css.tabActive)}
              aria-selected={view === id}
              onClick={() => { setView(id) }}
            >
              <TabIcon size={14} className={css.tabIcon} />
              {t(TAB_KEYS[id])}
            </button>
          )
        })}
      </div>
      <div className={clsx(css.body, shownTask !== undefined && css.bodySplit)}>
        {view === 'scheduled' && (
          <section
            className={css.scheduled}
            role="tabpanel"
            aria-label={t('tab.scheduled')}
            data-automation-tab="scheduled"
          >
            <div className={css.toolbar}>
              <div className={css.filters} role="group" aria-label={t('statusFilter.label')}>
                {STATUS_FILTERS.map(value => (
                  <button
                    key={value}
                    type="button"
                    className={clsx(css.filter, statusFilter === value && css.filterActive)}
                    aria-pressed={statusFilter === value}
                    onClick={() => { setStatusFilter(value) }}
                  >
                    {t(STATUS_KEYS[value])}
                  </button>
                ))}
              </div>
              <div className={css.searchField}>
                <input
                  type="search"
                  className={css.searchInput}
                  aria-label={t('search.label')}
                  placeholder={t('search.placeholder')}
                  value={search}
                  onChange={(event) => { setSearch(event.target.value) }}
                />
                {search !== '' && (
                  <button
                    type="button"
                    className={css.searchClear}
                    aria-label={t('search.clear')}
                    onClick={() => { setSearch('') }}
                  >
                    {'×'}
                  </button>
                )}
              </div>
              <button type="button" className={css.newButton} onClick={() => { openCreate() }}>
                <PlusIcon size={14} className={css.addIcon} />
                {t('new.action')}
              </button>
            </div>
            <div className={css.list}>
              <ListFeedback status={status} settled={settled} onRetry={() => { void onRetry() }} t={t} />
              {status === 'ready' && rows.length === 0 && (
                <div className={css.empty}>
                  <AlarmCheckIcon size={44} className={css.emptyIcon} />
                  <p className={css.emptyTitle}>{t(emptyKey(records, statusFilter, search.trim()))}</p>
                  <button type="button" className={css.addButton} onClick={() => { openCreate() }}>
                    <PlusIcon size={14} className={css.addIcon} />
                    {t('empty.scheduled.action')}
                  </button>
                </div>
              )}
              <ul className={css.listRows} aria-label={t('list.label')} aria-busy={status === 'loading'}>
                {rows.map((record) => {
                  // One pair per row: the same absolute stamp and distance reach
                  // both halves, from one formatting call.
                  const nextRun = nextRunParts(record.scheduledAt, t('time.locale'), now, t)
                  return (
                    <li
                      key={record.id}
                      className={clsx(css.listRow, selectedId === record.id && css.listRowSelected)}
                    >
                      <button
                        type="button"
                        className={css.rowOpen}
                        aria-label={record.title}
                        aria-expanded={selectedId === record.id}
                        aria-controls={selectedId === record.id ? detailId : undefined}
                        onClick={() => { setSelectedId(record.id); setDetailTab('rule') }}
                      >
                        <span className={css.rowGlyph} aria-hidden="true"><AutomationIcon size={16} /></span>
                        <span className={css.rowContent}>
                          <span className={css.rowTitle}>{record.title}</span>
                          <span className={css.rowSummary}>
                            {record.status === 'inactive' && <span className={css.metadata}>{t('status.inactive')}</span>}
                            <span className={css.metadata}>{formatScheduleFrequency(record, t, frequencyZone)}</span>
                            {record.status === 'active' && <span className={css.metadata}>
                              {t('list.nextPrefix')}
                              <time dateTime={record.scheduledAt}>{nextRun.absolute}</time>
                              {' '}<span className={css.nextRunRelative}>{nextRun.relative}</span>
                            </span>}
                          </span>
                        </span>
                      </button>
                      <span className={css.rowActions}>
                        {confirming === record.id
                          ? <>
                            <button
                              type="button"
                              className={css.dangerButton}
                              disabled={deleting.includes(record.id)}
                              onClick={() => { void onDelete(record.id) }}
                            >
                              {t('list.deleteConfirm')}
                            </button>
                            <button
                              type="button"
                              className={css.linkButton}
                              onClick={() => { setConfirming(null) }}
                            >
                              {t('list.deleteCancel')}
                            </button>
                          </>
                          : <button
                            type="button"
                            className={css.rowAction}
                            aria-label={t('list.deleteAria', { name: record.title })}
                            onClick={() => { setConfirming(record.id) }}
                          >
                            {t('list.delete')}
                          </button>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
            <section className={css.templates} aria-label={t('templates.label')}>
              <h2 className={css.templatesTitle}>{t('templates.title')}</h2>
              <ul className={css.templateGrid}>
                {TEMPLATES.map(({ id, Icon, titleKey, descriptionKey }) => (
                  <li key={id} data-automation-template={id}>
                    <button
                      type="button"
                      className={css.templateCard}
                      // The card stages its own recurrence, resolved against the
                      // moment it is clicked, and opens the same create dialog.
                      onClick={() => { openCreate(templateSeed(id, t(titleKey), t(descriptionKey), new Date())) }}
                    >
                      <Icon size={18} className={css.templateIcon} />
                      <span className={css.templateText}>
                        <span className={css.templateName}>{t(titleKey)}</span>
                        <span className={css.templateDescription}>{t(descriptionKey)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        )}
        {view === 'runs' && (
          <section
            className={css.runsPane}
            role="tabpanel"
            aria-label={t('tab.runs')}
            data-automation-tab="runs"
          >
            <AutomationRuns records={records} loadHistory={loadHistory} t={t} />
          </section>
        )}
        {shownTask !== undefined && (
          <TaskDetail
            {...detail.props}
            task={shownTask}
            authoritative={shownRecord !== undefined}
            onDeleted={closeDetails}
            onClose={closeDetails}
          />
        )}
      </div>
      <AutomationCreateModal
        open={createOpen}
        seed={seed}
        workspaces={workspaces}
        onClose={() => { setCreateOpen(false) }}
        onConfirm={submitDraft}
        t={t}
      />
    </div>
  )
}
