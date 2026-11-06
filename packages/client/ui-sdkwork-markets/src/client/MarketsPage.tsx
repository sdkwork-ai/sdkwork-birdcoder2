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
 * Each category's cloud catalog renders its SDKWork App Store market page
 * (plugins, experts, skills, MCP) through this plugin's host adapter, with a
 * crash boundary so the panel never collapses blank. Catalog browsing stays
 * anonymous: the embedded surface degrades account-bound calls through its own
 * catch handlers.
 * The page stays the single owner of market navigation chrome, so the
 * embedded surfaces render inside the panel without their own headers.
 *
 * Every category leads with its **cloud catalog** — the SDKWork App Store page
 * for that category — and every category lands on it: Experts draws that
 * catalog as its whole surface, and the other three open a sub-tab row whose
 * first chip it is (Plugins, Skills, Connectors). The cloud catalog is the
 * product's shelf; the community markets and this deployment's own views sit
 * behind it, and they keep their own chips so a person can still reach them.
 *
 * The Connectors tab is a sub-root for the same reason: its leading chip is
 * the cloud catalog (the App Store's MCP catalog), and the second chip is the
 * MCP connector itself ({@link McpConnectorSurface}), the third-party
 * `dsh-mcp-connector` plugin's panel page embedded in place — the connector
 * market, the installed connections and their authorization, the
 * cross-connection tool workbench, and the connection diagnostics. The
 * connector chip draws no page chrome around the panel: the panel carries its
 * own search, filters and actions, and the two facts it needs from this side
 * (the Workspace scope, and the conversation an example Prompt opens) travel
 * through {@link McpConnectorBridge}.
 *
 * The Plugins tab is itself a sub-root. Its leading chip is the cloud catalog;
 * then the Plugin Market — the `dshmarket` profile plugin's own catalog,
 * rendered from the `market` control service that plugin publishes (see
 * {@link PluginMarketPanel}). When that plugin is absent the chip stays and
 * shows an install affordance, so the market is discoverable before it is
 * installed instead of appearing only after. The application's own official
 * and installed views sit below the divider.
 *
 * The Skills tab is a sub-root too, and its leading chip is the cloud catalog;
 * the SkillHub market follows it. That market is the independent
 * `@montersy123/dsh-skill-market` plugin's own `main` panel; the chip's
 * surface renders it in place ({@link SkillMarketSurface}), so the market is
 * this tab's content rather than a second page to navigate to. When the
 * plugin is absent the surface names the deployment's choice instead of
 * leaving the tab blank. A skill installed there lands in the harness skill
 * root and is published to `ctx.skills`, so it needs no second integration
 * step: the Skills settings page lists it and the model can invoke it in the
 * running session.
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
 * categories; Plugins, Skills, and Connectors are sub-roots whose panels
 * switch between the category's cloud catalog and its other views through the
 * sub-tab strip below the main bar. Experts has no strip: its cloud catalog is
 * the tab's whole surface.
 */
export type MarketsTab = 'plugins' | 'experts' | 'skills' | 'connectors'

/** The Plugins tab's sub-views. */
export type PluginsSubTab = 'cloud' | 'market' | 'official' | 'installed'

/**
 * The Skills tab's sub-views. Skills is a sub-root for the same reason Plugins
 * is: several catalogs answer the question "what can I install", and the
 * SkillHub community market is a different one from the cloud catalog. The
 * cloud catalog leads and is the landing view, so the tab opens on the
 * product's shelf; the SkillHub market keeps its chip beside it.
 */
export type SkillsSubTab = 'cloud' | 'market'

/**
 * The Connectors tab's sub-views. Connectors is a sub-root like Plugins and
 * Skills: its cloud catalog (the App Store's MCP catalog) leads and is the
 * landing view, and the MCP connector plugin's own panel follows it.
 */
export type ConnectorsSubTab = 'cloud' | 'connector'

/**
 * The tabs that render an embedded App Store market page. Every category has
 * one: its cloud catalog is the category's leading view, and Experts draws
 * that catalog as its whole surface.
 */
type CloudMarketsTab = MarketsTab

/** The cloud categories that also offer a personal my-catalog entry. */
type MineMarketsTab = Exclude<MarketsTab, 'connectors'>

/**
 * The Plugins tab's sub-tabs, in chip order. The cloud catalog leads and is
 * the landing view (the product's shelf); the community plugin market follows,
 * and a divider separates the two market views from the two "this app" views
 * (official + installed), so the chip row reads as
 * [cloud catalog · plugin market] | [this app's plugins].
 */
const PLUGIN_SUB_TABS: readonly PluginsSubTab[] = ['cloud', 'market', 'official', 'installed']

/** The Skills tab's sub-tabs, in chip order: the cloud catalog, then the SkillHub market. */
const SKILL_SUB_TABS: readonly SkillsSubTab[] = ['cloud', 'market']

/** The Connectors tab's sub-tabs, in chip order: the cloud catalog, then the connector panel. */
const CONNECTOR_SUB_TABS: readonly ConnectorsSubTab[] = ['cloud', 'connector']

/** Each Skills sub-tab's chip label, in {@link SKILL_SUB_TABS} order. */
const SKILL_SUB_TAB_KEYS = {
  cloud: 'subtab.skillCloud',
  market: 'subtab.skillMarket',
} as const satisfies Record<SkillsSubTab, MarketsKey>

/** Each Skills sub-tab's leading glyph, in {@link SKILL_SUB_TABS} order. */
const SKILL_SUB_TAB_ICONS: Record<SkillsSubTab, ComponentType<ModeIconProps>> = {
  cloud: MarketsIcon,
  market: SkillsIcon,
}

/** Each Connectors sub-tab's chip label, in {@link CONNECTOR_SUB_TABS} order. */
const CONNECTOR_SUB_TAB_KEYS = {
  cloud: 'subtab.cloud',
  connector: 'subtab.connector',
} as const satisfies Record<ConnectorsSubTab, MarketsKey>

/** Each Connectors sub-tab's leading glyph, in {@link CONNECTOR_SUB_TABS} order. */
const CONNECTOR_SUB_TAB_ICONS: Record<ConnectorsSubTab, ComponentType<ModeIconProps>> = {
  cloud: MarketsIcon,
  connector: ConnectorsIcon,
}

/**
 * The chips a divider precedes. Only the boundary between the two market
 * views and the two local views is a group break; the cloud catalog and the
 * plugin market are siblings under one market heading.
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
  cloud: 'search.plugins',
  market: 'search.market',
  official: 'search.official',
  installed: 'search.installed',
} as const satisfies Record<PluginsSubTab, MarketsKey>

/** Each cloud category's my-catalog label key, in {@link TAB_IDS} order.
 * Connectors has none: the connector panel carries its own installed view. */
const MINE_KEYS = {
  plugins: 'mine.plugins',
  experts: 'mine.experts',
  skills: 'mine.skills',
} as const satisfies Record<MineMarketsTab, MarketsKey>

/** The Plugins sub-tab's per-scope chip label, in {@link PLUGIN_SUB_TABS} order. */
const PLUGIN_SUB_TAB_KEYS = {
  cloud: 'subtab.cloud',
  market: 'subtab.market',
  official: 'subtab.official',
  installed: 'subtab.installed',
} as const satisfies Record<PluginsSubTab, MarketsKey>

/** Each Plugins sub-tab's leading glyph, in {@link PLUGIN_SUB_TABS} order. */
const PLUGIN_SUB_TAB_ICONS: Record<PluginsSubTab, ComponentType<ModeIconProps>> = {
  cloud: MarketsIcon,
  market: PluginsIcon,
  official: OfficialIcon,
  installed: InstalledIcon,
}

/**
 * The SDKWork App Store market page each category's cloud catalog renders.
 * Connectors' cloud catalog is the App Store's MCP catalog, the one page of
 * that surface this product had not yet given a home.
 */
const TAB_MARKET_PAGES = {
  plugins: 'plugins',
  experts: 'experts',
  skills: 'skills',
  connectors: 'mcp',
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
   * This page renders that plugin's own market panel on the market chip of the
   * Plugins sub-tab and falls back to an install/reload affordance when it is
   * absent.
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
   * or its browser half has not loaded. The Connectors tab's connector chip
   * embeds the page that plugin serves; while the panel is absent that chip
   * states the connector is unavailable instead of framing a route nobody
   * serves.
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
  // Each sub-root lands on its cloud catalog: the chip row below the main bar
  // opens on the SDKWork shelf, and every re-entry (a category switch, the
  // My-experts view's back control) returns there instead of to whatever was
  // browsed last time.
  const [pluginSubTab, setPluginSubTab] = useState<PluginsSubTab>('cloud')
  // The Skills tab's cloud catalog chip leads; the SkillHub market follows.
  const [skillSubTab, setSkillSubTab] = useState<SkillsSubTab>('cloud')
  // The Connectors tab's cloud catalog leads; the MCP connector panel follows.
  const [connectorSubTab, setConnectorSubTab] = useState<ConnectorsSubTab>('cloud')
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
    // The gate owns the read that answers whether the bundle is installed.
    // The store collapses concurrent reads. It runs only while the gate is the
    // open surface: the cloud catalog leads the chip row, so entering Plugins
    // spends no community-catalog read until the market chip is opened.
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
  // The connector panel and the SkillHub market draw their own page, which
  // carries its own search, so the header draws no second, dead field beside
  // them — the same arrangement for both, and the same reason.
  const connectorPanelSubTab = tab === 'connectors' && connectorSubTab === 'connector'
  // The header search belongs to every cloud catalog; the embedded panels own
  // their search, so the field collapses for them.
  const embeddedPanelSubTab = marketSubTab || skillMarketSubTab || connectorPanelSubTab
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
                  setSkillSubTab('cloud')
                  setConnectorSubTab('cloud')
                }}
              >
                <CategoryIcon size={14} className={css.tabIcon} />
                {t(TAB_KEYS[id])}
              </button>
            )
          })}
        </div>
        {/* The embedded panels hand the column to their own page, which
            carries its own search and filters — so this header keeps only the
            category's own tools there, and draws no second, dead search field
            beside the panel's own. The cloud catalog and the local plugin
            views are the surfaces the header search serves. */}
        <div className={css.tools}>
          {!embeddedPanelSubTab && (
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
          lets the user pick between the cloud catalog, the community plugin
          market, and the two views over this deployment's own plugin tree.
          The cloud catalog leads (the landing view), a hairline divider
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
      {/* The Skills tab is a sub-root for the same reason: the cloud catalog
          leads (the landing view) and the SkillHub market keeps its seat
          beside it. The row collapses out of the DOM for the other main
          categories, so it adds chrome only where it means something. */}
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
      {/* The Connectors tab is a sub-root too: the cloud catalog (the App
          Store's MCP catalog) leads as the landing view, and the MCP
          connector's own panel keeps the second chip. */}
      {tab === 'connectors' && (
        <div
          className={css.subTabs}
          role="tablist"
          aria-label={t('subtabs.connectors.label')}
          data-connectors-subtabs
        >
          {CONNECTOR_SUB_TABS.map((id) => {
            const Icon = CONNECTOR_SUB_TAB_ICONS[id]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                className={clsx(css.subTab, connectorSubTab === id && css.subTabActive)}
                aria-selected={connectorSubTab === id}
                data-connector-subtab={id}
                onClick={() => { setConnectorSubTab(id) }}
              >
                <Icon size={12} className={css.subTabIcon} />
                {t(CONNECTOR_SUB_TAB_KEYS[id])}
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
        data-connectors-subtab={tab === 'connectors' ? connectorSubTab : undefined}
      >
        <MarketsSurfaceBoundary t={t}>
          {connectorPanelSubTab
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
