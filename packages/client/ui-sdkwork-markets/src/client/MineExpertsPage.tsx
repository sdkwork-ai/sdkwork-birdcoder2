/**
 * The My-experts page: the full-page view the Experts tab's my-catalog
 * affordance opens, replacing the market chrome until the back affordance
 * returns. The header carries the back control and the page title on the
 * left, and the catalog tools on the right: a search field over the roster
 * and the create-expert trigger (its hover menu dispatches one guided
 * creation prompt per expert type). The filter row carries the roster tabs —
 * experts and teams, each with its live count — and the source scope
 * (created / purchased). The panel renders the roster, or the per-scope
 * empty notice: the experts catalog has no store yet, so both lists are
 * empty and the counts read zero until that store lands and feeds them.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { ArrowLeftIcon, ExpertsIcon, SearchIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import { CreateExpertMenu } from './CreateExpertMenu.tsx'
import css from './MineExpertsPage.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/** One roster tab id (the filter row's tab vocabulary). */
type MineExpertsTab = 'experts' | 'teams'

/** One source-scope id (created by me / purchased). */
type MineExpertsScope = 'created' | 'purchased'

/** The roster, until the experts catalog store lands: both lists empty, so
 * the page renders its empty face and the count chips read zero. */
const ROSTER: Record<MineExpertsTab, readonly string[]> = { experts: [], teams: [] }

/** Each roster tab's empty-notice key, per source scope. */
const EMPTY_KEYS: Record<MineExpertsTab, Record<MineExpertsScope, MarketsKey>> = {
  experts: {
    created: 'mine.experts.empty.created',
    purchased: 'mine.experts.empty.purchased',
  },
  teams: {
    created: 'mine.experts.empty.teams.created',
    purchased: 'mine.experts.empty.teams.purchased',
  },
}

/** Full props for the my-experts page. */
export interface MineExpertsPageProps {
  /** The locale seat. */
  t: Translate
  /** Dispatch the composed prompt into a fresh conversation (create flows). */
  dispatchPrompt: (text: string) => void
  /** Leave the mine view and return to the market page. */
  onBack: () => void
}

/**
 * Render the My-experts page.
 * @param props - the locale seat, the create flows' dispatch, and the back control.
 * @returns the page element tree.
 */
export function MineExpertsPage({ t, dispatchPrompt, onBack }: MineExpertsPageProps) {
  const [tab, setTab] = useState<MineExpertsTab>('experts')
  const [scope, setScope] = useState<MineExpertsScope>('created')
  const [query, setQuery] = useState('')
  const emptyKey = EMPTY_KEYS[tab][scope]
  return (
    <div className={css.page} data-mine-experts="">
      <div className={css.header}>
        <div className={css.titleGroup}>
          <button
            type="button"
            className={css.back}
            aria-label={t('mine.experts.back')}
            data-mine-experts-back=""
            onClick={onBack}
          >
            <ArrowLeftIcon size={16} />
          </button>
          <h2 className={css.title}>{t('mine.experts.title')}</h2>
        </div>
        <div className={css.tools}>
          {/* The search field over the created roster; the roster it filters
              has no store yet, so the input stays a controlled field. */}
          <div className={css.search}>
            <SearchIcon size={14} className={css.searchIcon} />
            <input
              className={css.searchInput}
              type="search"
              value={query}
              placeholder={t('mine.experts.search')}
              aria-label={t('mine.experts.search')}
              onChange={(e) => { setQuery(e.target.value) }}
            />
          </div>
          <CreateExpertMenu t={t} dispatchPrompt={dispatchPrompt} />
        </div>
      </div>
      <div className={css.filterRow}>
        <div className={css.rosterTabs} role="tablist" aria-label={t('mine.experts.tabs.label')}>
          {(Object.keys(EMPTY_KEYS) as readonly MineExpertsTab[]).map(id => (
            <button
              key={id}
              type="button"
              role="tab"
              className={clsx(css.rosterTab, tab === id && css.rosterTabActive)}
              aria-selected={tab === id}
              data-mine-experts-tab={id}
              onClick={() => { setTab(id) }}
            >
              {t(id === 'experts' ? 'mine.experts.tab.experts' : 'mine.experts.tab.teams')}
              <span className={css.rosterCount}>{ROSTER[id].length}</span>
            </button>
          ))}
        </div>
        <div className={css.scope} role="radiogroup" aria-label={t('mine.experts.scope.label')}>
          {(['created', 'purchased'] as const).map(id => (
            <button
              key={id}
              type="button"
              role="radio"
              className={clsx(css.scopeOption, scope === id && css.scopeOptionActive)}
              aria-checked={scope === id}
              data-mine-experts-scope-option={id}
              onClick={() => { setScope(id) }}
            >
              {t(id === 'created' ? 'mine.experts.scope.created' : 'mine.experts.scope.purchased')}
            </button>
          ))}
        </div>
      </div>
      <div className={css.panel} data-mine-experts-panel={tab} data-mine-experts-scope={scope}>
        {ROSTER[tab].length === 0 && (
          <div className={css.empty} data-mine-experts-empty="">
            <div className={css.emptyIconTile}>
              <ExpertsIcon size={28} />
            </div>
            <p className={css.emptyText}>{t(emptyKey)}</p>
          </div>
        )}
      </div>
    </div>
  )
}
