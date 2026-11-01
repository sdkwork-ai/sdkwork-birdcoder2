/**
 * The Markets page: the center-column surface for the `markets` mode, keyed
 * into the frame's `mode.page` slot. The page header carries the category tab
 * bar (Plugins, Experts, Skills, Connectors) on the left and the catalog
 * tools on the right: a per-category search field and, on the Plugins and
 * Skills tabs, each category's add affordance (create plugin via
 * conversation / add-market entry dialog; find / upload / create skill via
 * the find-skills, import, and skill-creator flows). The Experts tab's
 * my-catalog affordance opens the full-page My-experts view ({@link
 * MineExpertsPage}), which the view's back control leaves.
 * Each tab's panel renders the SDKWork App Store market page (plugins,
 * experts, skills) through this plugin's host adapter, with a crash boundary
 * so the panel never collapses blank. Catalog browsing stays anonymous: the
 * embedded surface degrades account-bound calls through its own catch
 * handlers.
 * The page stays the single owner of market navigation chrome, so the
 * embedded surfaces render inside the panel without their own headers.
 *
 * The Connectors tab is not a cloud catalog: it is the MCP connector itself
 * ({@link McpConnectorSurface}), the third-party `dsh-mcp-connector` plugin's
 * panel page embedded in place — the connector market, the installed
 * connections and their authorization, the cross-connection tool workbench,
 * and the connection diagnostics. The page draws no chrome around it: the
 * panel carries its own search, filters and actions, and the two facts it
 * needs from this side (the Workspace scope, and the conversation an example
 * Prompt opens) travel through {@link McpConnectorBridge}.
 *
 * The Plugins tab is itself a sub-root. Its leading chip is the Plugin Market
 * — the `dshmarket` profile plugin's own catalog, rendered from the `market`
 * control service that plugin publishes (see {@link PluginMarketPanel}) — and
 * it is the landing view, so the page opens on the catalog a person came for.
 * When that plugin is absent the chip stays and shows an install affordance, so
 * the market is discoverable before it is installed instead of appearing only
 * after. The cloud catalog follows it, and the application's own official and
 * installed views sit below the divider.
 *
 * The Skills tab is a sub-root too, and its leading chip is the SkillHub
 * market. That market is the independent `@montersy123/dsh-skill-market`
 * plugin's own `main` panel; the chip's surface renders it in place
 * ({@link SkillMarketSurface}), so the market is this tab's content rather
 * than a second page to navigate to, and the cloud catalog keeps its chip
 * beside it. When the plugin is absent the surface names the deployment's
 * choice instead of leaving the tab blank. A skill installed there lands in
 * the harness skill root and is published to `ctx.skills`, so it needs no
 * second integration step: the Skills settings page lists it and the model
 * can invoke it in the running session.
 *
 * The page also declares — and therefore owns the render face of — the seven
 * seats the upstream Plugins page declares, so every configuration a plugin
 * registers for itself lands on a surface a person browses:
 *
 * - `plugins.item` — one card per configuration page, in the Official group;
 * - `plugins.bundle.config` / `plugins.row.config` — a bundle's own form and a
 *   declared row's own form, on that bundle's or row's page;
 * - `plugins.bundle.activation` — post-enable guidance, keyed by package name;
 * - `plugins.detail.actions` / `plugins.detail.badge` / `plugins.detail.section`
 *   — contributions to any open detail page, drawn with that page's subject.
 *
 * The page builds the whole face once ({@link MarketsPluginSlots}) and hands it
 * down, so the panels below draw a registrant's view without a slot call of
 * their own and the seat set lives in exactly one place.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import { Fragment, type ComponentType } from 'react'
import type { HostObservable, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import {
  ConnectorsIcon, ExpertsIcon, InstalledIcon, OfficialIcon, MineIcon, MarketsIcon, PluginsIcon, SearchIcon, SkillsIcon,
} from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import type { ConfigLedger } from './configItems.ts'
import type { MarketsConfigForms } from './settingsForms.ts'
import type { PluginStore } from './pluginStore.ts'
import type { MarketControl } from './marketPanel.ts'
import { MarketsAdd } from './MarketsAdd.tsx'
import { AddMarketDialog } from './AddMarketDialog.tsx'
import { SkillsAdd } from './SkillsAdd.tsx'
import { SkillMarketSurface } from './SkillMarketSurface.tsx'
import type { SkillMarketPanel } from './skillMarketPanel.ts'
import { McpConnectorSurface } from './McpConnectorSurface.tsx'
import type { McpConnectorPanel } from './mcpConnectorPanel.ts'
import type { McpConnectorBridge } from './connectorBridge.ts'
import { ImportSkillDialog } from './ImportSkillDialog.tsx'
import { skillSearchPrompt } from './skillPrompts.ts'
import { MarketsApp, type MarketsAppProps } from './marketsHost.ts'
import { SurfaceBoundary } from './SurfaceBoundary.tsx'
import { MineExpertsPage } from './MineExpertsPage.tsx'
import { PluginMarketInstallDialog, PluginMarketPanel } from './PluginMarketPanel.tsx'
import {
  OfficialPluginsPanel,
  type PluginRow,
} from './OfficialPluginsPanel.tsx'
import type { MarketsPluginSlots } from './PluginDetail.tsx'
import css from './MarketsPage.module.css'

/**
 * One market category tab id. The four top-level tabs are the market
 * categories; the Plugins tab is itself a sub-root whose panel switches
 * between the community plugin market (dshmarket), the cloud catalog, and the
 * application's own plugin views (official/installed) through the sub-tab
 * strip below the main bar.
 */
export type MarketsTab = 'plugins' | 'experts' | 'skills' | 'connectors'

/** The Plugins tab's sub-views. */
export type PluginsSubTab = 'market' | 'cloud' | 'official' | 'installed'

/**
 * The Skills tab's sub-views. Skills is a sub-root for the same reason Plugins
 * is: several catalogs answer the question "what can I install", and the
 * SkillHub community market is a different one from the cloud catalog. The
 * market chip leads because that is the catalog the shipped build carries and
 * its surface is the market's own panel drawn in place; the cloud chip keeps
 * the SDKWork catalog one click away rather than hidden.
 */
export type SkillsSubTab = 'market' | 'cloud'

/**
 * The tabs that render an embedded App Store market page. Connectors is not
 * one of them: its panel is the MCP connector plugin's own surface, embedded
 * page and all.
 */
type CloudMarketsTab = Exclude<MarketsTab, 'connectors'>

/**
 * The Plugins tab's sub-tabs, in chip order. The community plugin market
 * leads and is the landing view (the product's headline catalog); the cloud
 * catalog follows it, and a divider separates the two market views from the two
 * "this app" views (official + installed), so the chip row reads as
 * [plugin market · cloud catalog] | [this app's plugins].
 */
const PLUGIN_SUB_TABS: readonly PluginsSubTab[] = ['market', 'cloud', 'official', 'installed']

/** The Skills tab's sub-tabs, in chip order: the SkillHub market, then the cloud catalog. */
const SKILL_SUB_TABS: readonly SkillsSubTab[] = ['market', 'cloud']

/** Each Skills sub-tab's chip label, in {@link SKILL_SUB_TABS} order. */
const SKILL_SUB_TAB_KEYS = {
  market: 'subtab.skillMarket',
  cloud: 'subtab.skillCloud',
} as const satisfies Record<SkillsSubTab, MarketsKey>

/** Each Skills sub-tab's leading glyph, in {@link SKILL_SUB_TABS} order. */
const SKILL_SUB_TAB_ICONS: Record<SkillsSubTab, ComponentType<ModeIconProps>> = {
  market: SkillsIcon,
  cloud: MarketsIcon,
}

/**
 * The chips a divider precedes. Only the boundary between the two market
 * views and the two local views is a group break; the market and the cloud
 * catalog are siblings under one market heading.
 */
const PLUGIN_SUB_TAB_DIVIDERS: ReadonlySet<PluginsSubTab> = new Set<PluginsSubTab>(['official'])

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
  market: 'search.market',
  cloud: 'search.plugins',
  official: 'search.official',
  installed: 'search.installed',
} as const satisfies Record<PluginsSubTab, MarketsKey>

/** Each cloud category's my-catalog label key, in {@link TAB_IDS} order.
 * Connectors has none: the connector panel carries its own installed view. */
const MINE_KEYS = {
  plugins: 'mine.plugins',
  experts: 'mine.experts',
  skills: 'mine.skills',
} as const satisfies Record<CloudMarketsTab, MarketsKey>

/** The Plugins sub-tab's per-scope chip label, in {@link PLUGIN_SUB_TABS} order. */
const PLUGIN_SUB_TAB_KEYS = {
  market: 'subtab.market',
  cloud: 'subtab.cloud',
  official: 'subtab.official',
  installed: 'subtab.installed',
} as const satisfies Record<PluginsSubTab, MarketsKey>

/** Each Plugins sub-tab's leading glyph, in {@link PLUGIN_SUB_TABS} order. */
const PLUGIN_SUB_TAB_ICONS: Record<PluginsSubTab, ComponentType<ModeIconProps>> = {
  market: MarketsIcon,
  cloud: PluginsIcon,
  official: OfficialIcon,
  installed: InstalledIcon,
}

/** The SDKWork App Store market page each cloud tab renders. */
const TAB_MARKET_PAGES = {
  plugins: 'plugins',
  experts: 'experts',
  skills: 'skills',
} as const satisfies Record<CloudMarketsTab, MarketsAppProps['page']>

/**
 * The seven seats this page hosts. Written as one union so the props face and
 * the registration's `children` declaration cannot drift apart: every key here
 * is declared in `index.ts`, and `__renders` enforces that at the register
 * call site.
 */
type MarketsSeats =
  | 'plugins.item'
  | 'plugins.bundle.config'
  | 'plugins.row.config'
  | 'plugins.bundle.activation'
  | 'plugins.detail.actions'
  | 'plugins.detail.badge'
  | 'plugins.detail.section'

/**
 * Contain render crashes of the embedded market page: the shared
 * {@link SurfaceBoundary} renders a complete, host-themed panel with a retry
 * action instead of letting the slot system's empty marker blank the column.
 */
const MarketsSurfaceBoundary = SurfaceBoundary

/** Injected business data for the Markets page. */
export interface MarketsPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  mode: 'markets'
  /**
   * Dispatch one composed prompt into a fresh conversation and switch the
   * frame there (the create/add plugin and find/upload/create skill flows'
   * execution channel, and the installed roster's own settings channel).
   */
  dispatchPrompt: (text: string) => void
  /**
   * The plugin store: one owner for every read of the running tree and every
   * write to the profile, shared by the official/installed panels and the
   * install dialog so a change made in one shows up in the other.
   */
  store: PluginStore
  /**
   * The configuration ledgers the panels render from — the official items, the
   * bundles with a page-level form, and the rows with a page — as one live
   * source, so a plugin that registers its page after the first render still
   * lands a card.
   */
  ledger: HostObservable<ConfigLedger>
  /**
   * The Host's configuration forms, gated by the namespaces this deployment
   * serves: the roster offers a Settings affordance exactly when the Host
   * answers for that entry's own id.
   */
  configForms: MarketsConfigForms
  /** Open one installed row's configuration. */
  onConfigure: (row: PluginRow) => void
  /**
   * The bundle one `pluginNavigation.openBundle` call asked for, or undefined.
   * This page hosts the plugin surface a fork composition runs, so the upstream
   * navigation contract's request lands here.
   */
  bundleRequest: HostObservable<string | undefined>
  /** Clear the request once the roster has opened it. */
  onBundleRequestHandled: () => void
  /**
   * The `market` control the installed dshmarket plugin publishes, or
   * undefined while it is not installed or its client half has not loaded.
   * This page renders that plugin's own market panel on the leading Plugins
   * sub-tab and falls back to an install/reload affordance when it is absent.
   */
  marketControl: HostObservable<MarketControl | undefined>
  /**
   * The independent skill-market plugin's panel
   * (`@montersy123/dsh-skill-market`, the SkillHub market), or undefined while
   * it is not registered in this composition. The Skills tab's market chip
   * renders that panel in place; while it is absent (the row is off, or the
   * client half has not loaded yet) the chip's surface says the market is
   * unavailable rather than drawing a panel that cannot work.
   */
  skillMarketPanel: HostObservable<SkillMarketPanel | undefined>
  /**
   * The MCP connector's panel
   * (`dsh-mcp-connector`, the third-party plugin linked in as the
   * `plugins/dsh-mcp-connector` submodule), or undefined while its row is off
   * or its browser half has not loaded. The Connectors tab embeds the page
   * that plugin serves; while the panel is absent the tab states that the
   * connector is unavailable instead of framing a route nobody serves.
   */
  mcpConnectorPanel: HostObservable<McpConnectorPanel | undefined>
  /**
   * The two facts the connector panel needs from this side of the frame: the
   * Workspace scope a new connection defaults to, and the conversation an
   * example Prompt opens.
   */
  connectorBridge: McpConnectorBridge
  /**
   * Reload this page. The Plugin Market's client half arrives with a page
   * load, so a just-installed market needs one; the page never navigates on
   * its own without the person asking for it.
   */
  reload: () => void
}

/**
 * Full component props: runtime share + injected mode + the locale seat + the
 * child-slot render face.
 *
 * The seven seats are children of this page, so their views render through the
 * props face rather than through `ctx.slots.renderSlot` (which only serves
 * `root`). Declaring the seats is what lets other plugins register onto them;
 * holding the render face here is what lets the panels draw their views.
 */
export type MarketsPageProps =
  PropsRuntime<'mode.page'>
  & MarketsPageInjected
  & PropsLocale<'markets'>
  & PropsRenderSlots<MarketsSeats>

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
  mode, t, dispatchPrompt, store, ledger, configForms, onConfigure,
  bundleRequest, onBundleRequestHandled, marketControl, skillMarketPanel,
  mcpConnectorPanel, connectorBridge, reload, renderSlot,
}: MarketsPageProps) {
  // The page builds the registrants' render face once and hands it down: each
  // panel draws a configuration entry's own `summary` or `page` view, a
  // bundle's or row's form, and the detail contributions, all through this one
  // object. The child seats render through the props face (the ctx-level one
  // only serves `root`), which is why the binding is closed over here.
  const slots: MarketsPluginSlots = {
    itemSummary: id => renderSlot('plugins.item', { view: 'summary' }, { only: id }),
    itemPage: (id, form) => renderSlot('plugins.item', { view: 'page', form }, { only: id }),
    bundleConfig: name => renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: name }),
    rowConfig: (key, form) => renderSlot('plugins.row.config', { view: 'page', form }, { entryKey: key }),
    detailActions: subject => renderSlot('plugins.detail.actions', { subject }),
    detailBadge: subject => renderSlot('plugins.detail.badge', { subject }),
    detailSection: subject => renderSlot('plugins.detail.section', { subject }),
    activation: (owner, name) => renderSlot('plugins.bundle.activation', owner, { entryKey: name }),
  }
  const [tab, setTab] = useState<MarketsTab>('plugins')
  // The Plugins tab is itself a sub-root: the chip row below the main bar
  // switches between the community plugin market (the leading chip and the
  // landing view), the cloud catalog, and the two views over this
  // application's own plugin tree. Resetting the sub-tab when the main tab
  // changes keeps every re-entry to Plugins on the same starting surface, so a
  // previous browse of the official roster never bleeds across categories.
  const [pluginSubTab, setPluginSubTab] = useState<PluginsSubTab>('market')
  // The Skills tab's own sub-root: the SkillHub market chip leads (the shipped
  // build mounts that plugin), the cloud catalog follows. Reset on every main
  // tab change for the same reason the Plugins sub-tab is: re-entering Skills
  // always starts on the market, never on whatever was browsed last time.
  const [skillSubTab, setSkillSubTab] = useState<SkillsSubTab>('market')
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  // The Experts tab's my-catalog affordance swaps the whole market chrome for
  // the My-experts page; its back control restores the market exactly as it
  // stood (the market's own tab/query state lives above this flag).
  const [mineExpertsOpen, setMineExpertsOpen] = useState(false)

  // One `pluginNavigation.openBundle(name)` call — the contract upstream's
  // Plugins page served — lands the page on the Plugins tab and on a local
  // roster view, because a bundle's detail page lives under those two. The
  // request itself is handed to the roster below, which owns the open detail.
  const requestedBundle = useSyncExternalStore(bundleRequest.subscribe, bundleRequest.getSnapshot)
  useEffect(() => {
    if (requestedBundle === undefined) return
    setTab('plugins')
    setPluginSubTab(current => current === 'market' || current === 'cloud' ? 'official' : current)
  }, [requestedBundle])

  // The dshmarket plugin's own panel, when its client half is loaded. A
  // separate subscription from the store: the control is published by another
  // plugin and can attach or detach at any time, and the page must swap
  // between the live panel and its install affordance without a reload.
  const market = useSyncExternalStore(marketControl.subscribe, marketControl.getSnapshot)
  // The SkillHub market is the independent skill-market plugin's own panel.
  // Read live, because the plugin may activate after this page or be disabled
  // by a profile overlay: the tab swaps between the panel and its notice
  // without a reload, and never draws a panel that is not there.
  const skillMarket = useSyncExternalStore(skillMarketPanel.subscribe, skillMarketPanel.getSnapshot)
  // The MCP connector's panel, read the same way and for the same reason: the
  // Connectors tab swaps between the embedded connector page and the notice a
  // deployment without that row shows, live, without a reload.
  const connector = useSyncExternalStore(mcpConnectorPanel.subscribe, mcpConnectorPanel.getSnapshot)
  // The plugin store, read once for the market gate: whether this deployment
  // already holds the market bundle, and whether the gate's own install is
  // running. The local roster views subscribe on their own, so this one stays
  // cheap while they are mounted.
  const storeState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => {
    // The gate is the only surface that can be the first one opened after a
    // boot (the market leads the chip row), so it owns the read that answers
    // whether the bundle is installed. The store collapses concurrent reads.
    if (tab !== 'plugins' || pluginSubTab !== 'market') return
    if (storeState.read.status !== 'loading') return
    void store.refresh().catch(() => {})
  }, [store, tab, pluginSubTab, storeState.read.status])

  // The mine view owns the whole column: the market chrome (tabs, tools,
  // panels) is not mounted behind it, so its back control is the only exit.
  if (mineExpertsOpen) {
    return (
      <MineExpertsPage
        t={t}
        dispatchPrompt={dispatchPrompt}
        onBack={() => { setMineExpertsOpen(false) }}
      />
    )
  }

  const marketSubTab = tab === 'plugins' && pluginSubTab === 'market'
  const showLocalPanel = tab === 'plugins' && (pluginSubTab === 'official' || pluginSubTab === 'installed')
  const skillMarketSubTab = tab === 'skills' && skillSubTab === 'market'
  // The Connectors tab draws the connector's own page, which carries its own
  // search, so the header draws no second, dead field beside it — the same
  // arrangement the SkillHub market chip has, and the same reason.
  const connectorTab = tab === 'connectors'
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
                  setPluginSubTab('market')
                  setSkillSubTab('market')
                }}
              >
                <CategoryIcon size={14} className={css.tabIcon} />
                {t(TAB_KEYS[id])}
              </button>
            )
          })}
        </div>
        {/* The Plugin Market subtab hands the column to the market's own page,
            which carries its own search and filters — so this header keeps only
            the Add menu there (create plugin / add plugin market), and draws no
            second, dead search field beside the market's own. The Skills tab's
            market chip and the Connectors tab are the same arrangement for the
            same reason: those panels own their search, so only their own tools
            ride this header. */}
        <div className={css.tools}>
          {!marketSubTab && !skillMarketSubTab && !connectorTab && (
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
          )}
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
              // The add menu's market row points at the market chip: the market
              // is this tab's own content, so the row switches sub-tabs instead
              // of leaving the page. It appears only while the panel is
              // registered, so the menu never lists a destination this
              // deployment cannot show.
              {...(skillMarket === undefined ? {} : { onShowSkillMarket: () => { setSkillSubTab('market') } })}
            />
          )}
          {/* The Experts tab's my-catalog affordance opens the full-page
              My-experts view. Connectors has none: the connector panel carries
              its own installed view, so a second entry to it would be dead
              chrome. */}
          {tab === 'experts' && (
            <button
              type="button"
              className={clsx(css.mineButton, css.mineButtonLive)}
              data-mine-experts-entry=""
              onClick={() => { setMineExpertsOpen(true) }}
            >
              <MineIcon size={14} className={css.mineIcon} />
              {t(MINE_KEYS[tab])}
            </button>
          )}
        </div>
      </div>
      {/* The Plugins tab is a sub-root: the chip row below the main bar
          lets the user pick between the community plugin market, the cloud
          catalog, and the two views over this deployment's own plugin tree.
          The Plugin Market chip leads (the landing view), a hairline divider
          separates the two market views from the "this app" pair
          (official + installed), and the row collapses out of the DOM for the
          other main categories. */}
      {tab === 'plugins' && (
        <div
          className={css.subTabs}
          role="tablist"
          aria-label={t('subtabs.label')}
          data-plugins-subtabs
        >
          {PLUGIN_SUB_TABS.map((id) => {
            const Icon = PLUGIN_SUB_TAB_ICONS[id]
            return (
              <Fragment key={id}>
                {PLUGIN_SUB_TAB_DIVIDERS.has(id) && <div className={css.subTabDivider} aria-hidden="true" />}
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
      {/* The Skills tab is a sub-root for the same reason: the SkillHub market
          leads (the catalog the shipped build carries) and the cloud catalog
          keeps its seat beside it. The row collapses out of the DOM for the
          other main categories, so it adds chrome only where it means
          something. */}
      {tab === 'skills' && (
        <div
          className={css.subTabs}
          role="tablist"
          aria-label={t('subtabs.skills.label')}
          data-skills-subtabs
        >
          {SKILL_SUB_TABS.map((id) => {
            const Icon = SKILL_SUB_TAB_ICONS[id]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                className={clsx(css.subTab, skillSubTab === id && css.subTabActive)}
                aria-selected={skillSubTab === id}
                data-skill-subtab={id}
                onClick={() => { setSkillSubTab(id) }}
              >
                <Icon size={12} className={css.subTabIcon} />
                {t(SKILL_SUB_TAB_KEYS[id])}
              </button>
            )
          })}
        </div>
      )}
      <div
        className={css.panelArea}
        role="tabpanel"
        data-markets-tab={tab}
        data-plugins-subtab={tab === 'plugins' ? pluginSubTab : undefined}
        data-skills-subtab={tab === 'skills' ? skillSubTab : undefined}
      >
        <MarketsSurfaceBoundary t={t}>
          {connectorTab
            ? (
              <McpConnectorSurface t={t} panel={connector} bridge={connectorBridge} />
            )
            : skillMarketSubTab
              ? (
                <SkillMarketSurface t={t} panel={skillMarket?.component} />
              )
              : marketSubTab
                ? (
                  <PluginMarketPanel
                    t={t}
                    control={market}
                    store={store}
                    read={storeState.read}
                    install={storeState.install}
                    reload={reload}
                    onOpenCloud={() => { setPluginSubTab('cloud') }}
                    onOpenInstalled={() => { setPluginSubTab('installed') }}
                  />
                )
                : showLocalPanel
                  ? (
                    <OfficialPluginsPanel
                      scope={pluginSubTab === 'installed' ? 'installed' : 'official'}
                      t={t}
                      query={query}
                      store={store}
                      onConfigure={onConfigure}
                      ledger={ledger}
                      configForms={configForms}
                      slots={slots}
                      openRequest={requestedBundle}
                      onOpenRequestHandled={onBundleRequestHandled}
                    />
                  )
                  : (
                    <div className={css.marketScroll}>
                      {/* The header's search field is the one search: its query
                          drives the embedded catalog's controlled filter. */}
                      <MarketsApp page={TAB_MARKET_PAGES[tab]} t={t} searchQuery={query} />
                    </div>
                  )}
        </MarketsSurfaceBoundary>
      </div>
      {/* The market gate's install flow: the dialog is mounted beside the
          panel (not inside it) so the page-level surface keeps the progress,
          the log, and the cancel action above the panel it replaced. */}
      {marketSubTab && (
        <PluginMarketInstallDialog t={t} store={store} install={storeState.install} />
      )}
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
