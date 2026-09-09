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
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import {
  ConnectorsIcon, ExpertsIcon, InstalledIcon, LocalIcon, MineIcon, PluginsIcon, SearchIcon, SkillsIcon,
} from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import { MarketsAdd } from './MarketsAdd.tsx'
import { AddMarketDialog } from './AddMarketDialog.tsx'
import { SkillsAdd } from './SkillsAdd.tsx'
import { ImportSkillDialog } from './ImportSkillDialog.tsx'
import { skillSearchPrompt } from './skillPrompts.ts'
import { MarketsApp, type MarketsAppProps } from './marketsHost.ts'
import {
  LocalPluginsPanel,
  type PluginRow, type PluginSettingsTarget,
} from './LocalPluginsPanel.tsx'
import css from './MarketsPage.module.css'

/**
 * One market category tab id. The four top-level tabs are the market
 * categories; the Plugins tab is itself a sub-root whose panel switches
 * between the cloud catalog and the application's own plugin views
 * (local/installed) through the sub-tab strip below the main bar.
 */
export type MarketsTab = 'plugins' | 'experts' | 'skills' | 'connectors'

/** The Plugins tab's sub-views. */
export type PluginsSubTab = 'cloud' | 'local' | 'installed'

/** The tabs that render an embedded App Store market page. */
type CloudMarketsTab = MarketsTab

/**
 * The Plugins tab's sub-tabs, in chip order. The cloud catalog sits on the
 * left (the default landing view); a divider separates it from the two
 * "this app" views (local + installed), so the chip row reads as
 * [store] | [this app's plugins].
 */
const PLUGIN_SUB_TABS: readonly PluginsSubTab[] = ['cloud', 'local', 'installed']

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

/** The Plugins sub-tab's per-scope search placeholder, narrowed from
 * the global search when the panel switches to a sub-view. */
const PLUGIN_SUB_TAB_SEARCH_KEYS = {
  cloud: 'search.plugins',
  local: 'search.local',
  installed: 'search.installed',
} as const satisfies Record<PluginsSubTab, MarketsKey>

/** Each cloud category's my-catalog label key, in {@link TAB_IDS} order. */
const MINE_KEYS = {
  plugins: 'mine.plugins',
  experts: 'mine.experts',
  skills: 'mine.skills',
  connectors: 'mine.connectors',
} as const satisfies Record<CloudMarketsTab, MarketsKey>

/** The Plugins sub-tab's per-scope chip label, in {@link PLUGIN_SUB_TABS} order. */
const PLUGIN_SUB_TAB_KEYS = {
  cloud: 'subtab.cloud',
  local: 'subtab.local',
  installed: 'subtab.installed',
} as const satisfies Record<PluginsSubTab, MarketsKey>

/** Each Plugins sub-tab's leading glyph, in {@link PLUGIN_SUB_TABS} order. */
const PLUGIN_SUB_TAB_ICONS: Record<PluginsSubTab, ComponentType<ModeIconProps>> = {
  cloud: PluginsIcon,
  local: LocalIcon,
  installed: InstalledIcon,
}

/** The SDKWork App Store market page each cloud tab renders. */
const TAB_MARKET_PAGES = {
  plugins: 'plugins',
  experts: 'experts',
  skills: 'skills',
  connectors: 'mcp',
} as const satisfies Record<CloudMarketsTab, MarketsAppProps['page']>

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
  /**
   * Read a point-in-time snapshot of this deployment's own plugin tree.
   * The local and installed tabs render from it, so both are views over the
   * running application's plugin system.
   */
  listPlugins: () => Promise<PluginInventorySnapshot>
  /**
   * Resolve whether one installed row has a served settings namespace, so the
   * row's Settings affordance is offered only when it can open something.
   */
  settingsTarget: (row: PluginRow) => PluginSettingsTarget
  /** Open one installed row's configuration. */
  onConfigure: (row: PluginRow) => void
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
export function MarketsPage({
  mode, t, dispatchPrompt, listPlugins, settingsTarget, onConfigure,
}: MarketsPageProps) {
  const [tab, setTab] = useState<MarketsTab>('plugins')
  // The Plugins tab is itself a sub-root: the chip row below the main bar
  // switches between the cloud catalog (the default landing view) and the
  // two views over this application's own plugin tree. Resetting the sub-tab
  // when the main tab changes keeps every re-entry to Plugins on the same
  // starting surface (the store), so a previous browse of the local roster
  // never bleeds across categories.
  const [pluginSubTab, setPluginSubTab] = useState<PluginsSubTab>('cloud')
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)

  const showLocalPanel = tab === 'plugins' && pluginSubTab !== 'cloud'
  const searchKey = tab === 'plugins' ? PLUGIN_SUB_TAB_SEARCH_KEYS[pluginSubTab] : SEARCH_KEYS[tab]
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
                  setPluginSubTab('cloud')
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
              placeholder={t(searchKey)}
              aria-label={t(searchKey)}
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
          {tab === 'plugins' && (
            <MarketsAdd
              t={t}
              dispatchPrompt={dispatchPrompt}
              onAddMarket={() => { setDialogOpen(true) }}
            />
          )}
          {tab === 'skills' && (
            <SkillsAdd
              t={t}
              dispatchPrompt={dispatchPrompt}
              onImportSkill={() => { setSkillDialogOpen(true) }}
            />
          )}
          {/* Experts and Connectors keep the inert my-catalog affordance
              (the catalogs under those two roots are not built yet). */}
          {tab !== 'plugins' && tab !== 'skills' && (
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
      {/* The Plugins tab is a sub-root: the chip row below the main bar
          lets the user pick between the cloud catalog and the two views
          over this deployment's own plugin tree. The cloud chip sits on
          the left (the default), a hairline divider separates it from the
          "this app" pair (local + installed), and the row collapses out of
          the DOM for the other main categories. */}
      {tab === 'plugins' && (
        <div
          className={css.subTabs}
          role="tablist"
          aria-label={t('subtabs.label')}
          data-plugins-subtabs
        >
          {PLUGIN_SUB_TABS.map((id, index) => {
            const Icon = PLUGIN_SUB_TAB_ICONS[id]
            return (
              <Fragment key={id}>
                {index > 0 && <div className={css.subTabDivider} aria-hidden="true" />}
                <button
                  type="button"
                  role="tab"
                  className={clsx(css.subTab, pluginSubTab === id && css.subTabActive)}
                  aria-selected={pluginSubTab === id}
                  data-plugin-subtab={id}
                  onClick={() => { setPluginSubTab(id) }}
                >
                  <Icon size={12} className={css.subTabIcon} />
                  {t(PLUGIN_SUB_TAB_KEYS[id])}
                </button>
              </Fragment>
            )
          })}
        </div>
      )}
      <div
        className={css.panelArea}
        role="tabpanel"
        data-markets-tab={tab}
        data-plugins-subtab={tab === 'plugins' ? pluginSubTab : undefined}
      >
        <MarketsSurfaceBoundary t={t}>
          {showLocalPanel
            ? (
              <LocalPluginsPanel
                scope={pluginSubTab === 'installed' ? 'installed' : 'local'}
                t={t}
                query={query}
                listPlugins={listPlugins}
                settingsTarget={settingsTarget}
                onConfigure={onConfigure}
              />
            )
            : (
              <div className={css.marketScroll}>
                <MarketsApp page={TAB_MARKET_PAGES[tab]} t={t} />
              </div>
            )}
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
