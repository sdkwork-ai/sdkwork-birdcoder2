/**
 * The Automation page: the center-column surface for the `automation` mode,
 * keyed into the frame's `mode.page` slot. A top tab bar switches the
 * scheduled-tasks and run-history views; the scheduled view carries the
 * first-task empty state plus the static template catalog that seeds task
 * ideas, and the runs view carries its own empty state. Task creation and
 * run records have no capability behind them yet: the add affordance opens
 * the add-task dialog as a front-end-only interaction (the dialog's confirm
 * closes without creating anything until the creation capability lands).
 * The page owns its full column surface; the sidebar column stays beside it.
 */
import { useState } from 'react'
import clsx from 'clsx'
import type { ComponentType } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { AutomationCreateModal } from './AutomationCreateModal.tsx'
import { AlarmCheckIcon, AutomationIcon, PlusIcon, RunsIcon } from './icons.tsx'
import {
  BedtimeMoonIcon, CheckupIcon, HistoryTodayIcon, InterviewChatIcon,
  MeetingAgendaIcon, MoviesIcon, NewsDigestIcon, ParentsCallIcon,
  VocabBookIcon, WallpaperImageIcon, WeeklyReportIcon, WhyBulbIcon,
} from './templateIcons.tsx'
import type { AutomationKey } from './locales.ts'
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

/** Each view's empty-state glyph, in {@link TAB_IDS} order. */
const EMPTY_ICONS: Record<AutomationTab, ComponentType<ModeIconProps>> = {
  scheduled: AlarmCheckIcon,
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

/** Injected business face: which mode this keyed entry renders. */
export interface AutomationPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'automation'
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type AutomationPageProps =
  PropsRuntime<'mode.page'>
  & AutomationPageInjected
  & PropsLocale<'automation'>

/**
 * Render the Automation page with its view tabs, empty states, and template
 * catalog.
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function AutomationPage({ mode, t }: AutomationPageProps) {
  const [tab, setTab] = useState<AutomationTab>('scheduled')
  const [createOpen, setCreateOpen] = useState(false)
  const EmptyIcon = EMPTY_ICONS[tab]
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
              className={clsx(css.tab, tab === id && css.tabActive)}
              aria-selected={tab === id}
              onClick={() => { setTab(id) }}
            >
              <TabIcon size={14} className={css.tabIcon} />
              {t(TAB_KEYS[id])}
            </button>
          )
        })}
      </div>
      <div className={css.body}>
        <div
          className={css.empty}
          role="tabpanel"
          data-automation-tab={tab}
        >
          <EmptyIcon size={44} className={css.emptyIcon} />
          <p className={css.emptyTitle}>
            {t(tab === 'scheduled' ? 'empty.scheduled.title' : 'empty.runs.title')}
          </p>
          {tab === 'runs' && <p className={css.emptyHint}>{t('empty.runs.hint')}</p>}
          {tab === 'scheduled' && (
            <button
              type="button"
              className={css.addButton}
              onClick={() => { setCreateOpen(true) }}
            >
              <PlusIcon size={14} className={css.addIcon} />
              {t('empty.scheduled.action')}
            </button>
          )}
        </div>
        {tab === 'scheduled' && (
          <section className={css.templates} aria-label={t('templates.label')}>
            <h2 className={css.templatesTitle}>{t('templates.title')}</h2>
            <ul className={css.templateGrid}>
              {TEMPLATES.map(({ id, Icon, titleKey, descriptionKey }) => (
                <li key={id} className={css.templateCard} data-automation-template={id}>
                  <Icon size={18} className={css.templateIcon} />
                  <div className={css.templateText}>
                    <div className={css.templateName}>{t(titleKey)}</div>
                    <div className={css.templateDescription}>{t(descriptionKey)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <AutomationCreateModal open={createOpen} onClose={() => { setCreateOpen(false) }} t={t} />
    </div>
  )
}
