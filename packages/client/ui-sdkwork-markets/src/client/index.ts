/**
 * Markets mode plugin, browser half: registers its quick entry into the
 * sidebar shell's `sidebar.actions` list seat (declared by ui-sidebar) and
 * its market page into the keyed `mode.page` seat (declared by ui-layout's
 * frame), both keyed by the `markets` mode id. The page's header hosts the
 * market categories (Plugins, Experts, Skills, Connectors); each tab's panel
 * renders the SDKWork App Store market page through the host adapter
 * configured from the shared environment, IAM, and locale services. The add
 * affordances (create plugin / add plugin market) dispatch a composed prompt
 * into a fresh conversation through the sessions/workspaces services.
 *
 * The Plugins tab is also the product's plugin surface, so this plugin declares
 * the seven seats the upstream Plugins page declares — `plugins.item`,
 * `plugins.bundle.config`, `plugins.row.config`, `plugins.bundle.activation`,
 * and the three `plugins.detail.*` — and declares them HERE, on the market
 * page, because the upstream page that declared them is disabled in this fork's
 * composition. A seat that nobody declares does not exist: the registrants keep
 * their registrations in the ledger, but no page can render them, which is how
 * the official group silently lost every configuration card once already.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the layout service Context merge (ctx.layout) and the
// AppModeId vocabulary (ui-layout's frame contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the sidebar actions seat contract (ui-sidebar's declaration).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the sessions/workspaces Context merges (the prompt
// dispatch's services, provided by the runtime plugin).
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ctx.env and ctx.iam into this program (the SDKWork host
// adapter's services).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: the Plugins page's SlotMap merge (the seats the market page
// declares and the official group's configuration cards are rendered from).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: the ctx.remote Context merge and the plugin-management records
// the store reads and writes. The records cross in both directions: the
// manager Remote resolves write targets by entry id, and `pluginInventory.list`
// answers the running tree's own enablement, so a row's switch is enabled by
// this call and confirmed by the very next inventory read.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  MarketsHostIam,
  MarketsHostTheme,
} from './marketsHost.ts'
import { configureMarketsHost } from './marketsHost.ts'
export type { OfficialItem } from './configItems.ts'
import { MarketsAction, type MarketsActionInjected } from './MarketsAction.tsx'
import { pluginSettingsPrompt } from './skillPrompts.ts'
import { MarketsPage, type MarketsPageInjected } from './MarketsPage.tsx'
import { configLedgerSource } from './configItems.ts'
import { createConfigForms, isServed, namespaceOfEntry } from './settingsForms.ts'
import { createPluginStore } from './pluginStore.ts'
import { en, zh, type MarketsKey } from './locales.ts'

export type {
  MarketsActionInjected, MarketsActionProps,
} from './MarketsAction.tsx'
export type {
  MarketsPageInjected, MarketsPageProps,
} from './MarketsPage.tsx'
export type {
  OfficialPluginsPanelInjected, OfficialPluginsPanelProps, OfficialPluginsScope,
  PluginOrigin, PluginRow,
} from './OfficialPluginsPanel.tsx'
export type { PluginInstallDialogProps } from './PluginInstallDialog.tsx'
export type {
  InstallLogLine, InstallSession, PluginReadState, PluginSnapshot, PluginStore, PluginStoreState,
} from './pluginStore.ts'
export { createPluginStore, emptyInstallSession, PluginStoreError } from './pluginStore.ts'
export type {
  MarketsHostAdapter, MarketsHostEnvironment, MarketsHostIam,
  MarketsHostLocale, MarketsHostSession, MarketsHostTheme,
  MarketsHostRenderSnapshot,
} from './marketsHost.ts'
export { toMarketsSession } from './marketsHost.ts'
export type { ConfigLedger } from './configItems.ts'
export type { MarketsConfigForms } from './settingsForms.ts'
export { isServed, namespaceOfEntry } from './settingsForms.ts'
export type {
  DetailEntry, DetailRow, MarketsPluginSlots, PluginDetailTarget, PluginDetailViewProps,
} from './PluginDetail.tsx'
export { bundleReference, detailKey, PluginDetailView, subjectOf } from './PluginDetail.tsx'
export type { MarketsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Markets mode's copy (sidebar entry, tabs). */
    markets: MarketsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'markets'

/** Services required by the Markets mode plugin. */
export const inject = [
  'slots', 'locale', 'layout', 'sessions', 'workspaces', 'env', 'iam', 'theme',
  // The local/installed plugin tabs read this deployment's own plugin tree
  // through the Host inventory (the same read-only source the Settings
  // plugin-inventory tab uses), so the market is a view over the running
  // application's plugin system rather than a second, divergent roster.
  'remote', 'remote.pluginInventory',
  // The roster's per-row switches write through the same manager Remote the
  // upstream Plugins page uses: the profile's desired enablement is persisted
  // and applied to the live tree, and the inventory read above observes the
  // result. The manager Remote mounts whether or not this Host manages a
  // profile; the inventory's `managementAvailable` says which.
  'remote.pluginManager',
  // The installed tab's Settings affordance resolves against the namespaces
  // the Host actually serves, so a row offers configuration only when this
  // deployment has one for it.
  'configForms',
]

/** How long the create/add flows wait for the New Session connect to land a current session. */
const DISPATCH_TIMEOUT_MS = 15000

/**
 * Client plugin body: register the sidebar entry and the market page, each
 * once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-markets: dictionaries')
  const t = ctx.locale.bind(NS)

  // The SDKWork host adapter: the market pages read the active environment's
  // gateway (empty keeps the panel on its unconfigured face), the mounted IAM
  // session, and the host locale. Environment changes remount the App Store
  // runtime; IAM and locale changes propagate through host props.
  const themeRuntime = ctx.get('theme') as ThemeRuntime
  const theme: MarketsHostTheme = {
    getColorScheme: () => themeRuntime.getTheme().active.colorScheme,
    subscribe: listener => ctx.on('theme/change', listener),
  }
  const adapter = configureMarketsHost({
    env: ctx.get('env') as EnvService,
    iam: ctx.get('iam') as MarketsHostIam,
    locale: ctx.locale,
    theme,
  })
  ctx.effect(() => () => { adapter.dispose() }, 'ui-sdkwork-markets: SDKWork host adapter')

  // The plugin store: the one place the market reads the running tree and
  // writes to the profile. It owns the `RemoteResult` unwrapping (so an
  // absent outcome can never read as success), the one-read-at-a-time
  // concurrency guard, and the four Host subscriptions the marketplace
  // needs to stay live — `plugin-manager/changed` (a write from any surface
  // refreshes this one), `install-state` and `install-log` (a run's phases
  // and pnpm output stream into the dialog), and `connection/reset`.
  const store = createPluginStore(ctx)
  ctx.effect(() => () => { store.dispose() }, 'ui-sdkwork-markets: plugin store subscriptions')

  // The three configuration ledgers the page renders from: the plugins that
  // register a configuration page on `plugins.item` (Shell, Agent loop,
  // Subagent, Web search in a stock deployment), the bundles that registered a
  // page-level form, and the rows that registered one. They are listed as
  // configuration entries, not as toggleable bundles, so their cards carry no
  // switch. The projection is a uSES source over the slot ledgers and the
  // locale revision, so a card appears the moment its registrant does.
  const ledger = configLedgerSource(ctx)

  // The namespaces the Host serves right now, plus the per-namespace form each
  // `page` view renders with. A row is configurable only when the Host answers
  // for the entry's OWN id (with the composition-only `include:` marker
  // stripped) — the same rule the upstream Plugins page and the Settings
  // plugin-inventory tab apply. Resolution is never by module tail: a fork row
  // points at a differently named module (`ui-settings-general` loads
  // `ui-sdkwork-settings-menu`), so a name-shaped guess hands one plugin
  // another's settings page — it both missed served namespaces and matched
  // namespaces the row does not own.
  const configForms = createConfigForms(ctx)

  // Opening one row's configuration hands the plugin's settings namespace to
  // the conversation, which is this application's single configuration
  // channel for a plugin the market itself does not own a form for. The gate
  // is re-asked at click time: the roster draws the button only for a served
  // entry, but the Host's answer can have moved since that render.
  const onConfigure: MarketsPageInjected['onConfigure'] = (row) => {
    if (!isServed(configForms.servedNamespaces(), row.key)) return
    dispatchPrompt(pluginSettingsPrompt(t, row.name, namespaceOfEntry(row.key)))
  }

  // The create/add flows' execution channel: switch the frame to the
  // conversation surface, run the shared New Session flow, wait for the
  // fresh session to become current, then send the composed prompt into it.
  // The wait is bounded: a connect failure (or no Workspace at all) leaves
  // the frame on the conversation surface where the user can act directly.
  const dispatchPrompt = (text: string): void => {
    ctx.layout.setMode('code')
    const before = ctx.sessions.list.getSnapshot().current
    ctx.workspaces.startSession()
    const landed = new Promise<typeof before>((resolve) => {
      // finish hoists (a synchronous list tick cannot touch an uninitialized
      // binding); the timer lands before the subscription so any synchronous
      // tick finds both bindings live.
      function finish(value: typeof before): void {
        clearTimeout(timer)
        unsubscribe()
        resolve(value)
      }
      const timer = setTimeout(() => { finish(undefined) }, DISPATCH_TIMEOUT_MS)
      const unsubscribe = ctx.sessions.list.subscribe(() => {
        const current = ctx.sessions.list.getSnapshot().current
        if (current !== undefined && current !== before) finish(current)
      })
    })
    void landed.then(async (sessionId) => {
      if (sessionId === undefined) {
        console.warn('[markets] prompt dispatch skipped: no session landed')
        return
      }
      const scope = ctx.sessions.scope(sessionId)
      const session = scope === undefined ? undefined : ctx.sessions.sessionOf(scope)
      if (session === undefined) {
        console.warn(`[markets] prompt dispatch skipped: session ${sessionId} has no face`)
        return
      }
      const result = await session.prompt([{ type: 'text', text }], 'queue')
      if (!result.ok) console.warn(`[markets] prompt dispatch failed: ${result.error.code}: ${result.error.message}`)
    }, (reason: unknown) => {
      console.warn('[markets] prompt dispatch failed:', reason)
    })
  }

  ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
    name: 'sidebar.actions',
    id: 'sdkwork-markets',
    // Last in the quick-entry stack, behind Automation.
    order: 40,
    locale: NS,
    inject: (): MarketsActionInjected => ({
      // Open the market as an overlay inside the code surface: the rail
      // selection stays `code`, so the code rail entry keeps its highlight
      // while the market page renders in the center column.
      setMode: () => { ctx.layout.openPanel('markets') },
    }),
  }, MarketsAction))

  ctx.slots.inject('mode.page', () => ctx.slots.register({
    name: 'mode.page',
    key: 'markets',
    locale: NS,
    // The seven seats the upstream Plugins page declared. Upstream's page is
    // disabled in this fork's composition (the market owns the plugin surface
    // instead), so the market must declare them: a seat only exists once
    // someone declares it, and the registrants — the host-plane configuration
    // pages, and any bundle that ships a form of its own — have nowhere to land
    // otherwise.
    children: {
      'plugins.item': { kind: 'list', scope: 'root' },
      'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
      'plugins.row.config': { kind: 'keyed', scope: 'root' },
      'plugins.bundle.activation': { kind: 'keyed', scope: 'root' },
      'plugins.detail.actions': { kind: 'list', scope: 'root' },
      'plugins.detail.badge': { kind: 'list', scope: 'root' },
      'plugins.detail.section': { kind: 'list', scope: 'root' },
    },
    inject: (): MarketsPageInjected => ({
      mode: 'markets',
      dispatchPrompt,
      store,
      ledger,
      configForms,
      onConfigure,
    }),
  }, MarketsPage))
}
