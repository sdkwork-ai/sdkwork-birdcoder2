/**
 * The Markets page: the center-column surface for the `markets` mode, keyed
 * into the frame's `mode.page` slot. The page header carries the category tab
 * bar (Plugins, Experts, Skills, Connectors) on the left and the catalog
 * tools on the right: a per-category search field and, on the Plugins and
 * Skills tabs, each category's add affordance (create plugin via
 * conversation / add-market entry dialog; find / upload / create skill via
 * the find-skills, import, and skill-creator flows) while the other tabs
 * keep the inert my-catalog affordance (`aria-disabled` with the
 * construction reason, until the catalog and account actions land).
 * Each tab's panel renders the SDKWork App Store market page (plugins,
 * experts, skills; Connectors maps to the storefront's MCP catalog) through
 * this plugin's host adapter, with a crash boundary so the panel never
 * collapses blank. Catalog browsing stays anonymous: the embedded surface
 * degrades account-bound calls through its own catch handlers.
 * The page stays the single owner of market navigation chrome, so the
 * embedded surfaces render inside the panel without their own headers.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Component, Fragment, type ComponentType, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import {
  ConnectorsIcon, ExpertsIcon, MineIcon, PluginsIcon, SearchIcon, SkillsIcon,
} from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import { MarketsAdd } from './MarketsAdd.tsx'
import { AddMarketDialog } from './AddMarketDialog.tsx'
import { SkillsAdd } from './SkillsAdd.tsx'
import { ImportSkillDialog } from './ImportSkillDialog.tsx'
import { skillSearchPrompt } from './skillPrompts.ts'
import { MarketsApp, type MarketsAppProps } from './marketsHost.ts'
import css from './MarketsPage.module.css'

/** One market category tab id. */
export type MarketsTab = 'plugins' | 'experts' | 'skills' | 'connectors'

/** The market categories, in tab-bar order (the panel marker's id space). */
const TAB_IDS: readonly MarketsTab[] = ['plugins', 'experts', 'skills', 'connectors']

/** Each category's dictionary keys, in {@link TAB_IDS} order. */
const TAB_KEYS = {
  plugins: 'tab.plugins',
  experts: 'tab.experts',
  skills: 'tab.skills',
  connectors: 'tab.connectors',
} as const satisfies Record<MarketsTab, MarketsKey>

/** Each category tab's leading glyph, in {@link TAB_IDS} order. */
const TAB_ICONS: Record<MarketsTab, ComponentType<ModeIconProps>> = {
  plugins: PluginsIcon,
  experts: ExpertsIcon,
  skills: SkillsIcon,
  connectors: ConnectorsIcon,
}

/** Each category's search placeholder key, in {@link TAB_IDS} order. */
const SEARCH_KEYS = {
  plugins: 'search.plugins',
  experts: 'search.experts',
  skills: 'search.skills',
  connectors: 'search.connectors',
} as const satisfies Record<MarketsTab, MarketsKey>

/** Each category's my-catalog label key, in {@link TAB_IDS} order. */
const MINE_KEYS = {
  plugins: 'mine.plugins',
  experts: 'mine.experts',
  skills: 'mine.skills',
  connectors: 'mine.connectors',
} as const satisfies Record<MarketsTab, MarketsKey>

/** The SDKWork App Store market page each tab renders. */
const TAB_MARKET_PAGES = {
  plugins: 'plugins',
  experts: 'experts',
  skills: 'skills',
  connectors: 'mcp',
} as const satisfies Record<MarketsTab, MarketsAppProps['page']>

/**
 * Contain render crashes of the embedded market page. The framework's slot
 * boundary renders an empty marker when a mode-page entry crashes, which
 * would leave the whole column blank; this boundary sits below it and keeps
 * a complete, host-themed panel with a retry action between the slot system
 * and the SDKWork surface stack.
 */
class MarketsSurfaceBoundary extends Component<
  { t: MarketsPageProps['t']; children?: ReactNode },
  { failed: boolean; attempt: number }
> {
  override state = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('ui-sdkwork-markets: embedded market page crashed:', error)
  }

  private readonly retry = (): void => {
    this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={css.empty} data-markets-empty="crashed">
          <div className={css.emptyIconTile}>
            <PluginsIcon size={28} />
          </div>
          <p className={css.emptyTitle}>{this.props.t('surface.error.title')}</p>
          <p className={css.emptyDetail}>{this.props.t('surface.error.detail')}</p>
          <button type="button" className={css.emptyAction} onClick={this.retry}>
            {this.props.t('surface.error.retry')}
          </button>
        </div>
      )
    }
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
  }
}

/** Injected business data for the Markets page. */
export interface MarketsPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'markets'
  /**
   * Dispatch one composed prompt into a fresh conversation and switch the
   * frame there (the create/add plugin and find/upload/create skill flows'
   * execution channel).
   */
  dispatchPrompt: (text: string) => void
}

/** Full component props: runtime share + injected mode + the locale seat. */
export type MarketsPageProps =
  PropsRuntime<'mode.page'>
  & MarketsPageInjected
  & PropsLocale<'markets'>

/**
 * Render the Markets page with its category header and panel area.
 *
 * The Skills tab mirrors the Plugins tab's add affordance: its own trigger
 * (find via find-skills / upload via the import dialog / create via
 * skill-creator) rides the same prompt-dispatch channel, and the search
 * field hands its query to the find-skills flow on Enter.
 *
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function MarketsPage({ mode, t, dispatchPrompt }: MarketsPageProps) {
  const [tab, setTab] = useState<MarketsTab>('plugins')
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  return (
    <div
      className={css.page}
      data-mode={mode}
      data-mode-page={mode}
      data-markets-surface="sdkwork"
    >
      <div className={css.header}>
        <div className={css.tabs} role="tablist" aria-label={t('tabs.label')}>
          {TAB_IDS.map((id) => {
            const CategoryIcon = TAB_ICONS[id]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                className={clsx(css.tab, tab === id && css.tabActive)}
                aria-selected={tab === id}
                onClick={() => {
                  setTab(id)
                  setQuery('')
                }}
              >
                <CategoryIcon size={14} className={css.tabIcon} />
                {t(TAB_KEYS[id])}
              </button>
            )
          })}
        </div>
        <div className={css.tools}>
          <div className={css.search}>
            <SearchIcon size={14} className={css.searchIcon} />
            <input
              className={css.searchInput}
              type="search"
              value={query}
              placeholder={t(SEARCH_KEYS[tab])}
              aria-label={t(SEARCH_KEYS[tab])}
              onChange={(e) => { setQuery(e.target.value) }}
              onKeyDown={(e) => {
                // The skills catalog has no local surface yet: pressing Enter
                // hands the query to the find-skills flow instead.
                if (tab === 'skills' && e.key === 'Enter') {
                  dispatchPrompt(skillSearchPrompt(t, query))
                }
              }}
            />
          </div>
          {tab === 'plugins' ? (
            <MarketsAdd
              t={t}
              dispatchPrompt={dispatchPrompt}
              onAddMarket={() => { setDialogOpen(true) }}
            />
          ) : tab === 'skills' ? (
            <SkillsAdd
              t={t}
              dispatchPrompt={dispatchPrompt}
              onImportSkill={() => { setSkillDialogOpen(true) }}
            />
          ) : (
            <button
              type="button"
              className={css.mineButton}
              aria-disabled="true"
              title={t('action.pending.title')}
            >
              <MineIcon size={14} className={css.mineIcon} />
              {t(MINE_KEYS[tab])}
            </button>
          )}
        </div>
      </div>
      <div className={css.panelArea} role="tabpanel" data-markets-tab={tab}>
        <MarketsSurfaceBoundary t={t}>
          <MarketsApp page={TAB_MARKET_PAGES[tab]} t={t} />
        </MarketsSurfaceBoundary>
      </div>
      {dialogOpen && (
        <AddMarketDialog
          t={t}
          onSubmit={(text) => {
            setDialogOpen(false)
            dispatchPrompt(text)
          }}
          onClose={() => { setDialogOpen(false) }}
        />
      )}
      {skillDialogOpen && (
        <ImportSkillDialog
          t={t}
          onSubmit={(text) => {
            setSkillDialogOpen(false)
            dispatchPrompt(text)
          }}
          onClose={() => { setSkillDialogOpen(false) }}
        />
      )}
    </div>
  )
}
