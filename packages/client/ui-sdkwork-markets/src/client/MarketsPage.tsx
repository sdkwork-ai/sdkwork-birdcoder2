/**
 * The Markets page: the center-column surface for the `markets` mode, keyed
 * into the frame's `mode.page` slot. The page header carries the category tab
 * bar (Plugins, Experts, Skills, Connectors) on the left and the catalog
 * tools on the right: a per-category search field and the Plugins add
 * affordance (create or install plugin). The Skills cloud catalog owns its
 * find / upload / create skill toolbar; SkillHub keeps the same add affordance
 * in the header. The Experts tab's
 * my-catalog affordance opens the full-page My-experts view ({@link
 * MineExpertsPage}), which the view's back control leaves.
 * The Experts and Connectors tabs render their SDKWork App Store market page
 * (experts, MCP) through this plugin's host adapter. Skills renders a
 * BirdCoder-owned catalog over the Skills app SDK. A crash boundary keeps any
 * failed panel from collapsing blank. Those catalogs read the
 * SDKWork app-api and need the application Access-Token the host environment
 * provides. The adapter draws the sign-in face when the host holds no
 * credential at all and hands the gesture to this application's own login
 * entry; the catalog loads once a session lands.
 * The page stays the single owner of market navigation chrome. The embedded
 * Plugins catalog keeps its toolbar behavior, but the host places that toolbar
 * in the category row; the other embedded surfaces render without their own
 * headers.
 *
 * Those three categories lead with their **cloud catalog** and land on it.
 * Each opens a sub-tab row whose
 * first chip it is, and the Experts tab opens a row too: its cloud catalog
 * leads and the **expert market** — the built-in
 * `@deepseek-ai/dsh-client-ui-sdkwork-experts` package's own roster panel —
 * follows it. The cloud catalog is the product's shelf; the community markets,
 * the expert market and this deployment's own views sit behind it, and they
 * keep their own chips so a person can still reach them.
 *
 * The Experts tab's market chip embeds the built-in expert market's `main` panel
 * exactly as the Skills tab embeds the SkillHub market ({@link
 * ExpertMarketSurface}): the 331-expert roster, the expert teams, the
 * create-with-AI flows and the plugin's own management stay that package's,
 * and this page supplies only the tab, the viewport and the row suppression.
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
 * The Plugins tab is this application's own plugin surface — it replaces
 * upstream's Plugins page. The SDKWork Plugins catalog leads the tab, and the
 * application's official and installed views remain available alongside it.
 *
 * The Skills tab is a sub-root too, and its leading chip is the cloud catalog;
 * it renders featured and recommended skills, categories, sorting, cloud-library
 * installation state, and details over the Skills app SDK. The SkillHub market
 * follows it. That market is the independent
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
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import {
  ConnectorsIcon, ExpertsIcon, InstalledIcon, OfficialIcon, MineIcon, MarketsIcon, PluginsIcon, SearchIcon, SkillsIcon,
} from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import type { ConfigLedger } from './configItems.ts'
import type { MarketsConfigForms } from './settingsForms.ts'
import type { PluginStore } from './pluginStore.ts'
import { MarketsAdd } from './MarketsAdd.tsx'
import { PluginSourceDialog, type PluginSourceSubmission } from './PluginSourceDialog.tsx'
import { ExpertMarketSurface } from './ExpertMarketSurface.tsx'
import type { ExpertMarketPanel } from './expertMarketPanel.ts'
import { McpConnectorSurface } from './McpConnectorSurface.tsx'
import type { McpConnectorPanel } from './mcpConnectorPanel.ts'
import type { McpConnectorBridge } from './connectorBridge.ts'
import { ImportSkillDialog } from './ImportSkillDialog.tsx'
import {
  MarketsApp, SkillsCatalogSurface, SdkworkPluginsMarketplace,
  type MarketsAppProps, type MarketsHostRenderSnapshot,
} from './marketsHost.ts'
import type { SkillsCatalogActions } from './SkillsCatalogPage.tsx'
import { findInstallation } from './pluginInstallation.ts'
import { SurfaceBoundary } from './SurfaceBoundary.tsx'
import { MineExpertsPage } from './MineExpertsPage.tsx'
import { PluginInstallDialog } from './PluginInstallDialog.tsx'
import { MarketplaceTabs } from './MarketplaceTabs.tsx'
import {
  OfficialPluginsPanel,
  type PluginRow,
} from './OfficialPluginsPanel.tsx'
import type { MarketsPluginSlots } from './PluginDetail.tsx'
import css from './MarketsPage.module.css'

/**
 * One market category tab id. The four top-level tabs are the market
 * categories; the three storefront categories are sub-roots whose panels switch
 * between the category's cloud catalog and its other views through the sub-tab
 * strip below the main bar. Plugins is the fourth: it is this application's own
 * plugin surface and has no cloud catalog.
 */
export type MarketsTab = 'plugins' | 'experts' | 'skills' | 'connectors'

/**
 * The Plugins tab's sub-views. The SDKWork catalog is hosted by the page and
 * the local official and installed roster views are rendered by this package.
 */
export type PluginsSubTab = 'market' | 'official' | 'installed'

/**
 * The Experts tab's sub-views. Experts is a sub-root like Skills: the cloud
 * catalog (the SDKWork App Store's expert catalog) is the product's shelf and
 * leads, and the expert market — the built-in expert package's own roster
 * panel — follows it. Both answer "which expert do I use", from different
 * sources, so a person needs to be able to reach each.
 */
export type ExpertsSubTab = 'cloud' | 'market'

/**
 * The Connectors tab's sub-views. Connectors is a sub-root like Plugins:
 * its cloud catalog (the App Store's MCP catalog) leads and is the landing
 * view, and the MCP connector plugin's own panel follows it.
 */
export type ConnectorsSubTab = 'cloud' | 'connector'

/**
 * The tabs that render an embedded App Store market page. Plugins is hosted by
 * the SDKWork Plugins catalog instead.
 */
type CloudMarketsTab = Exclude<MarketsTab, 'plugins'>

/** The cloud categories that also offer a personal my-catalog entry. */
type MineMarketsTab = Exclude<MarketsTab, 'connectors' | 'plugins'>

/**
 * The Plugins tab's local roster views. The SDKWork catalog has its own
 * navigation chrome and does not render this strip while active.
 */
const PLUGIN_VIEW_IDS: readonly PluginsSubTab[] = ['market', 'official', 'installed']

/** The Connectors tab's sub-tabs, in chip order: the cloud catalog, then the connector panel. */
const CONNECTOR_VIEW_IDS: readonly ConnectorsSubTab[] = ['cloud', 'connector']

/**
 * The Experts tab's sub-tabs, in chip order: the cloud catalog leads and is the
 * landing view, and the expert market keeps the second chip.
 */
const EXPERT_VIEW_IDS: readonly ExpertsSubTab[] = ['cloud', 'market']

/** Each Experts sub-tab's chip label, in {@link EXPERT_VIEW_IDS} order. */
const EXPERT_SUB_TAB_KEYS = {
  cloud: 'subtab.expertCloud',
  market: 'subtab.expertMarket',
} as const satisfies Record<ExpertsSubTab, MarketsKey>

/** Each Experts sub-tab's leading glyph, in {@link EXPERT_VIEW_IDS} order. */
const EXPERT_SUB_TAB_ICONS: Record<ExpertsSubTab, ComponentType<ModeIconProps>> = {
  cloud: MarketsIcon,
  market: ExpertsIcon,
}

/** Each Connectors sub-tab's chip label, in {@link CONNECTOR_VIEW_IDS} order. */
const CONNECTOR_SUB_TAB_KEYS = {
  cloud: 'subtab.cloud',
  connector: 'subtab.connector',
} as const satisfies Record<ConnectorsSubTab, MarketsKey>

/** Each Connectors sub-tab's leading glyph, in {@link CONNECTOR_VIEW_IDS} order. */
const CONNECTOR_SUB_TAB_ICONS: Record<ConnectorsSubTab, ComponentType<ModeIconProps>> = {
  cloud: MarketsIcon,
  connector: ConnectorsIcon,
}

/**
 * The chips a group break precedes. Only the boundary between the market view
 * and the two local views is a group break; the break is whitespace, since the
 * page draws no dividers.
 */
const PLUGIN_SUB_TAB_BREAKS: ReadonlySet<PluginsSubTab> = new Set<PluginsSubTab>(['official'])

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

/** Each storefront category's search placeholder key, in {@link TAB_IDS} order.
 * Plugins has none: its panels carry their own search. */
const SEARCH_KEYS = {
  experts: 'search.experts',
  skills: 'search.skills',
  connectors: 'search.connectors',
} as const satisfies Record<CloudMarketsTab, MarketsKey>

/** The Plugins sub-tab's per-scope search placeholder, narrowed from
 * the global search when the panel switches to a sub-view. */
const PLUGIN_SUB_TAB_SEARCH_KEYS = {
  market: 'search.market',
  official: 'search.official',
  installed: 'search.installed',
} as const satisfies Record<PluginsSubTab, MarketsKey>

/** Each cloud category's my-catalog label key, in {@link TAB_IDS} order.
 * Connectors and Plugins have none: the connector panel carries its own
 * installed view, and the Plugins tab is this application's own roster. */
const MINE_KEYS = {
  experts: 'mine.experts',
  skills: 'mine.skills',
} as const satisfies Record<MineMarketsTab, MarketsKey>

/** The Plugins sub-tab's per-scope chip label, in {@link PLUGIN_VIEW_IDS} order. */
const PLUGIN_SUB_TAB_KEYS = {
  market: 'subtab.market',
  official: 'subtab.official',
  installed: 'subtab.installed',
} as const satisfies Record<PluginsSubTab, MarketsKey>

/** Each Plugins sub-tab's leading glyph, in {@link PLUGIN_VIEW_IDS} order. */
const PLUGIN_SUB_TAB_ICONS: Record<PluginsSubTab, ComponentType<ModeIconProps>> = {
  market: PluginsIcon,
  official: OfficialIcon,
  installed: InstalledIcon,
}

/**
 * The SDKWork App Store market page each embedded cloud catalog renders.
 * Connectors' cloud catalog is the App Store's MCP catalog.
 */
const TAB_MARKET_PAGES = {
  experts: 'experts',
  connectors: 'mcp',
} as const satisfies Record<Exclude<CloudMarketsTab, 'skills'>, MarketsAppProps['page']>

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
   * The built-in expert market's roster panel
   * (`@deepseek-ai/dsh-client-ui-sdkwork-experts`), or undefined while its row
   * is off, its plugin entry is switched to settings-only, or its browser half
   * has not loaded. The Experts tab's market chip renders that panel in place,
   * exactly as the Skills tab renders the SkillHub market; while it is absent
   * the chip says the market is unavailable rather than drawing a panel that
   * cannot work.
   */
  expertMarketPanel: HostObservable<ExpertMarketPanel | undefined>
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
  /** Framework-bound SDKWork environment, identity, locale, and authentication. */
  hooks: { hostSnapshot: HostObservable<MarketsHostRenderSnapshot> }
  /** Skills API callbacks owned by the SDKWork host adapter. */
  skillsCatalog: SkillsCatalogActions
  /** Open the application's shared sign-in surface. */
  requestSignIn: () => void
  /** Report a transient cloud-library installation success. */
  onSkillAdded: (name: string) => void
  /** Report a transient cloud-library installation failure. */
  onSkillAddFailed: () => void
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
  & InjectFace<MarketsPageInjected>
  & PropsLocale<'markets'>
  & PropsRenderSlots<MarketsSeats>

/**
 * Render the Markets page with its category header and panel area.
 *
 * The Skills tab mirrors the Plugins tab's add affordance: its own trigger
 * (find via find-skills / upload via the import dialog / create via
 * skill-creator) rides the same prompt-dispatch channel. The cloud catalog's
 * header search filters Skills app SDK results.
 *
 * @param props - composed slot props (contract share + injected mode + locale seat).
 * @returns the page element tree.
 */
export function MarketsPage({
  mode, t, dispatchPrompt, store, ledger, configForms, onConfigure,
  bundleRequest, onBundleRequestHandled,
  expertMarketPanel, mcpConnectorPanel, connectorBridge, renderSlot,
  useHostSnapshot, skillsCatalog, requestSignIn, onSkillAdded, onSkillAddFailed,
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
  const hostSnapshot = useHostSnapshot(current => current)
  const [tab, setTab] = useState<MarketsTab>('plugins')
  // The SDKWork Plugins catalog is the default landing view.
  const [pluginSubTab, setPluginSubTab] = useState<PluginsSubTab>('market')
  // The Experts tab's cloud catalog chip leads; the expert market follows.
  const [expertSubTab, setExpertSubTab] = useState<ExpertsSubTab>('cloud')
  // The Connectors tab's cloud catalog leads; the MCP connector panel follows.
  const [connectorSubTab, setConnectorSubTab] = useState<ConnectorsSubTab>('cloud')
  const [query, setQuery] = useState('')
  // Which source-aware form is open: creating a plugin from a source, or
  // installing one from it. Both share one dialog so the three source forms
  // are described once.
  const [sourceMode, setSourceMode] = useState<'create' | 'install' | undefined>(undefined)
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  // The Experts tab's my-catalog affordance swaps the whole market chrome for
  // the My-experts page; its back control restores the market exactly as it
  // stood (the market's own tab/query state lives above this flag).
  const [mineExpertsOpen, setMineExpertsOpen] = useState(false)

  const selectTab = (id: MarketsTab) => {
    setTab(id)
    setQuery('')
    setPluginSubTab('market')
    setExpertSubTab('cloud')
    setConnectorSubTab('cloud')
  }
  const categoryTabs = (
    <MarketplaceTabs
      tabs={TAB_IDS.map(id => ({ id, label: t(TAB_KEYS[id]), icon: TAB_ICONS[id] }))}
      selected={tab}
      ariaLabel={t('tabs.label')}
      onSelect={selectTab}
    />
  )

  // One `pluginNavigation.openBundle(name)` call — the contract upstream's
  // Plugins page served — lands the page on the Plugins tab and on a local
  // roster view, because a bundle's detail page lives under those two. The
  // request itself is handed to the roster below, which owns the open detail.
  const requestedBundle = useSyncExternalStore(bundleRequest.subscribe, bundleRequest.getSnapshot)
  useEffect(() => {
    if (requestedBundle === undefined) return
    setTab('plugins')
    setPluginSubTab(current => current === 'market' ? 'official' : current)
  }, [requestedBundle])

  // The expert market's panel, read the same way and for the same reason: the
  // plugin may activate after this page, and a profile overlay that disables
  // its row (or a person switching its own entry off) swaps the Experts tab
  // back to the unavailable notice, live, without a reload.
  const expertMarket = useSyncExternalStore(expertMarketPanel.subscribe, expertMarketPanel.getSnapshot)
  // The MCP connector's panel, read the same way and for the same reason: the
  // Connectors tab swaps between the embedded connector page and the notice a
  // deployment without that row shows, live, without a reload.
  const connector = useSyncExternalStore(mcpConnectorPanel.subscribe, mcpConnectorPanel.getSnapshot)
  // The plugin store drives the local roster and shared installation dialog.
  const storeState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => {
    // Refresh the Host management capability while the Plugins surface is open.
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
  const expertMarketSubTab = tab === 'experts' && expertSubTab === 'market'
  // The connector panel and the expert market draw their own page, which
  // carries its own search, so the header draws no second, dead field beside
  // them. The cloud catalogs keep the header search.
  const connectorPanelSubTab = tab === 'connectors' && connectorSubTab === 'connector'
  const embeddedPanelSubTab = connectorPanelSubTab || expertMarketSubTab
  const searchKey = tab === 'plugins' ? PLUGIN_SUB_TAB_SEARCH_KEYS[pluginSubTab] : SEARCH_KEYS[tab]
  // The storefront categories' embedded catalog page, or undefined on the
  // Plugins tab, which renders its own two local views and the community
  // market instead of an App Store page.
  const cloudPage: MarketsAppProps['page'] | undefined = tab === 'experts' || tab === 'connectors'
    ? TAB_MARKET_PAGES[tab]
    : undefined
  const installBusy = storeState.install !== undefined && (
    storeState.install.phase === 'checking'
    || storeState.install.phase === 'installing'
    || storeState.install.phase === 'cancelling'
    || storeState.install.phase === 'applying'
  )
  const managementAvailable = storeState.read.status === 'ready' && storeState.read.snapshot.managementAvailable

  // One search field for the whole page: it filters the embedded catalog on
  // every category, and the Plugins catalog takes its query from here too.
  const pageSearch = (
    <div className={css.search}>
      <SearchIcon size={14} className={css.searchIcon} />
      <input
        className={css.searchInput}
        type="search"
        value={query}
        placeholder={t(searchKey)}
        aria-label={t(searchKey)}
        onChange={(e) => { setQuery(e.target.value) }}
      />
    </div>
  )

  if (marketSubTab) {
    return (
      <div className={css.page} data-mode={mode} data-mode-page={mode} data-markets-surface="sdkwork" data-plugin-market="">
        {/* The Plugins catalog is hosted by this page, so the row carries the
            same tools as every other category: the catalog's search and its
            Manage / Add pair live here, not inside the embedded page. The
            catalog itself renders only its category strip and cards. */}
        <div className={css.pluginMarketHeader}>
          {categoryTabs}
          <div className={css.tools}>
            {pageSearch}
            <button
              type="button"
              className={clsx(css.mineButton, css.mineButtonLive)}
              data-manage-plugins=""
              onClick={() => { setPluginSubTab('installed') }}
            >
              <InstalledIcon size={14} className={css.mineIcon} />
              {t('manage.plugins')}
            </button>
            <MarketsAdd
              t={t}
              onCreatePlugin={() => { setSourceMode('create') }}
              onInstallPlugin={() => { setSourceMode('install') }}
            />
          </div>
        </div>
        <SurfaceBoundary t={t}>
          <div className={css.marketScroll}>
            <SdkworkPluginsMarketplace
              t={t}
              store={store}
              managementAvailable={managementAvailable}
              installBusy={installBusy}
              searchQuery={query}
              onSearchChange={setQuery}
              installationOf={plugin => findInstallation(
                plugin,
                storeState.read.status === 'ready' ? storeState.read.snapshot.bundles : [],
              )}
              onManage={() => { setPluginSubTab('installed') }}
              onAdd={() => { setSourceMode('install') }}
              onSectionChange={(section) => {
                setQuery('')
                if (section === 'plugins') {
                  setTab('plugins')
                  setPluginSubTab('market')
                } else if (section === 'skills') {
                  setTab('skills')
                } else {
                  setTab('experts')
                  setExpertSubTab('cloud')
                }
              }}
            />
          </div>
        </SurfaceBoundary>
        {!showLocalPanel && storeState.install !== undefined && <PluginInstallDialog t={t} store={store} install={storeState.install} />}
        {/* The row's Add menu offers both paths here too: a created plugin goes
            to the conversation, an install runs through this surface. */}
        {sourceMode !== undefined && (
          <PluginSourceDialog
            t={t}
            mode={sourceMode}
            {...sourceMode === 'create'
              ? { onGuided: () => { setSourceMode(undefined); dispatchPrompt(t('prompt.create')) } }
              : {}}
            onSubmit={(submission) => {
              setSourceMode(undefined)
              if (sourceMode === 'create') {
                dispatchPrompt(createFromSourcePrompt(t, submission))
                return
              }
              store.openInstall(submission.spec)
              void store.runInstall()
            }}
            onClose={() => { setSourceMode(undefined) }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={css.page}
      data-mode={mode}
      data-mode-page={mode}
      data-markets-surface="sdkwork"
    >
      <div className={css.header}>
        {categoryTabs}
        {/* The embedded panels hand the column to their own page, which
            carries its own search and filters — so this header keeps only the
            category's own tools there, and draws no second, dead search field
            beside the panel's own. The storefront cloud catalogs and the local
            plugin views are the surfaces the header search serves. */}
        <div className={css.tools}>
          {!embeddedPanelSubTab && pageSearch}
          {tab === 'plugins' && pluginSubTab !== 'market' && (
            <MarketsAdd
              t={t}
              onCreatePlugin={() => { setSourceMode('create') }}
              onInstallPlugin={() => { setSourceMode('install') }}
            />
          )}
          {/* The Experts tab's my-catalog affordance opens the full-page
              My-experts view, which is the cloud catalog's own roster. The
              expert market chip draws the plugin's panel, which owns its
              management (including its own create flows), so the affordance
              stays off that chip rather than opening a second, unrelated
              roster beside it. Connectors has none: the connector panel
              carries its own installed view, so a second entry would be dead
              chrome. */}
          {tab === 'experts' && expertSubTab === 'cloud' && (
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
      {/* The local plugin views keep their catalog entry beside Official and
          Installed. The SDKWork catalog renders its own navigation. */}
      {tab === 'plugins' && (
        <div
          className={css.subTabs}
          role="tablist"
          aria-label={t('subtabs.label')}
          data-plugins-subtabs
        >
          {PLUGIN_VIEW_IDS.map((id) => {
            const Icon = PLUGIN_SUB_TAB_ICONS[id]
            return (
              <Fragment key={id}>
                {PLUGIN_SUB_TAB_BREAKS.has(id) && <span className={css.subTabBreak} aria-hidden="true" />}
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
      {/* The Experts tab is a sub-root too: the cloud catalog leads (the
          landing view) and the expert market keeps its seat beside it. That
          market is another package's panel, so the header search collapses
          there and the panel carries its own. */}
      {tab === 'experts' && (
        <div
          className={css.subTabs}
          role="tablist"
          aria-label={t('subtabs.experts.label')}
          data-experts-subtabs
        >
          {EXPERT_VIEW_IDS.map((id) => {
            const Icon = EXPERT_SUB_TAB_ICONS[id]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                className={clsx(css.subTab, expertSubTab === id && css.subTabActive)}
                aria-selected={expertSubTab === id}
                data-expert-subtab={id}
                onClick={() => { setExpertSubTab(id) }}
              >
                <Icon size={12} className={css.subTabIcon} />
                {t(EXPERT_SUB_TAB_KEYS[id])}
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
          {CONNECTOR_VIEW_IDS.map((id) => {
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
        data-experts-subtab={tab === 'experts' ? expertSubTab : undefined}
        data-connectors-subtab={tab === 'connectors' ? connectorSubTab : undefined}
      >
        <MarketsSurfaceBoundary t={t}>
          {connectorPanelSubTab
            ? (
              <McpConnectorSurface t={t} panel={connector} bridge={connectorBridge} />
            )
            : expertMarketSubTab
              ? (
                <ExpertMarketSurface t={t} panel={expertMarket} />
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
                : tab === 'skills'
                  ? (
                    <div className={css.marketScroll}>
                      <SkillsCatalogSurface
                        snapshot={hostSnapshot}
                        actions={skillsCatalog}
                        requestSignIn={requestSignIn}
                        dispatchPrompt={dispatchPrompt}
                        onImportSkill={() => { setSkillDialogOpen(true) }}
                        onAdded={onSkillAdded}
                        onAddFailed={onSkillAddFailed}
                        t={t}
                        searchQuery={query}
                        onClearSearch={() => { setQuery('') }}
                      />
                    </div>
                  )
                  : cloudPage === undefined
                    ? null
                    : (
                      <div className={css.marketScroll}>
                        {/* The header's search field is the one search: its query
                              drives the embedded catalog's controlled filter. */}
                        <MarketsApp page={cloudPage} t={t} searchQuery={query} />
                      </div>
                    )}
        </MarketsSurfaceBoundary>
      </div>
      {/* The install dialog follows whichever plugin view started the run.
          The local official/installed panels mount their own copy inside the
          roster, so this page-level one stays off those views to keep a single
          overlay. */}
      {!showLocalPanel && storeState.install !== undefined && (
        <PluginInstallDialog t={t} store={store} install={storeState.install} />
      )}
      {sourceMode !== undefined && (
        <PluginSourceDialog
          t={t}
          mode={sourceMode}
          {...sourceMode === 'create'
            ? { onGuided: () => { setSourceMode(undefined); dispatchPrompt(t('prompt.create')) } }
            : {}}
          onSubmit={(submission) => {
            setSourceMode(undefined)
            if (sourceMode === 'install') {
              // Progress belongs to the market surface the install started from.
              setPluginSubTab('market')
              store.openInstall(submission.spec)
              void store.runInstall()
              return
            }
            dispatchPrompt(createFromSourcePrompt(t, submission))
          }}
          onClose={() => { setSourceMode(undefined) }}
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

/**
 * Compose the create-plugin prompt from one validated source.
 *
 * The conversation is still the creation channel (it writes the package), but
 * it now starts from the standard's own vocabulary: the form, the address, the
 * directory that distinguishes several plugins in one repository, the install
 * spec it must verify, and the requirement that the package declare its bundle
 * the way every installed plugin does.
 * @param t - the page's locale seat.
 * @param submission - the validated source and the identity the form recorded.
 * @returns the prompt text sent as one queued user turn.
 */
function createFromSourcePrompt(t: MarketsPageProps['t'], submission: PluginSourceSubmission): string {
  const source = submission.source
  const kind = t(source.kind === 'git' ? 'source.kind.git' : source.kind === 'archive' ? 'source.kind.archive' : 'source.kind.drive')
  return t('prompt.createFromSource')
    .replace('{name}', submission.name ?? '')
    .replace('{description}', submission.description ?? t('source.description.fallback'))
    .replace('{kind}', kind)
    .replace('{url}', source.url)
    .replace('{directory}', source.directory ?? t('prompt.sparse.fallback'))
    .replace('{spec}', submission.spec)
}
