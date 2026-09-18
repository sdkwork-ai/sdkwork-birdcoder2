/**
 * The official and installed plugin panels.
 *
 * Both tabs are views over the running application's own plugin tree — read
 * through the plugin store — rather than over a second, divergent roster: the
 * market IS this application's plugin system, so "installed" means "loaded by
 * this deployment", whether the module came from the local workspace or from
 * a published (cloud) package.
 *
 * - **Official** splits the surface the way the upstream Plugin manager does,
 *   into a group of **official** bundles and a group of **installed** ones,
 *   with the same predicates and the same card granularity:
 *   `optional && !installed` is a bundle the installation ships for the
 *   person to switch on, and `installed || !optional` is a bundle this
 *   deployment already holds. The page's built-in profile bundles stay out
 *   entirely, and a group with no cards takes no room. Rows live inside a
 *   card — the tab's top level is cards, never a flattened roster.
 * - **Installed** lists the entries that are actually in force (enabled),
 *   local and cloud together, and exposes a Settings affordance per entry:
 *   an entry whose module maps to a served settings namespace opens that
 *   configuration, the rest report that the deployment ships no browser half
 *   for it (mirroring the Settings plugins section's intersection rule).
 *
 * Both tabs carry the per-row switch. A bundle card adds the two capabilities
 * a per-row switch cannot express: a **bundle-level** switch (one toggle for
 * a whole patch layer, matching how the Host composes the profile) and
 * **uninstall** (removing a bundle's dependency), each with the Host's own
 * lock and removability answers deciding what the card offers.
 *
 * Writes never flip a control locally. The panel asks the store, the store
 * reports what the Host actually applied, and the roster re-reads the live
 * tree — so an override, a restart requirement, a cancellation, or a refusal
 * each read differently instead of all looking like success.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { IconPluginPinwheelOutline16, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  BundleInfo, ChangeResult, PluginInfo, PluginInventorySnapshot, ReadOnlyReason,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { MarketsKey } from './locales.ts'
import type { OfficialItem } from './configItems.ts'
import type { PluginStore, PluginStoreState } from './pluginStore.ts'
import { PluginInstallDialog } from './PluginInstallDialog.tsx'
import css from './OfficialPluginsPanel.module.css'

/** One inventory row, narrowed to what the panels render. */
type InventoryEntry = PluginInventorySnapshot['entries'][number]

/**
 * Built-in profile bundles stay out of this surface even when the profile
 * declares them as dependencies — the same exclusion the upstream Plugin
 * manager's page applies, so both pages list the same bundles.
 */
const BUILTIN_PROFILE_BUNDLES = new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
  '@deepseek-ai/dsh-sdk-app',
  '@deepseek-ai/dsh-acp-app',
  '@deepseek-ai/dsh-sdk-minimal',
])

/** The two groups the official tab renders, in the order it renders them. */
export type BundleGroupId = 'official' | 'bundles'

/** The installed group lists bundles only: configuration pages belong to the official group. */
const EMPTY_ITEMS: readonly OfficialItem[] = []

/**
 * The official bundles that carry copy of their own, keyed by exact npm name,
 * plus whether the package is a beta feature the card tags as such.
 *
 * Without this an official card would show the raw package name and the
 * English manifest sentence, so the two pages that list the same package would
 * name it differently. The upstream Plugin manager keeps the same table, and
 * the wording here is its wording.
 */
const OFFICIAL_BUNDLE_COPY = new Map<string, {
  readonly title: MarketsKey
  readonly description: MarketsKey
  readonly beta: boolean
}>([
  ['@deepseek-ai/dsh-experimental-agent-team-profile', {
    title: 'official.bundle.agentTeam.title',
    description: 'official.bundle.agentTeam.description',
    beta: true,
  }],
  ['@deepseek-ai/dsh-experimental-agent-team-web-profile', {
    title: 'official.bundle.agentTeamWeb.title',
    description: 'official.bundle.agentTeamWeb.description',
    beta: true,
  }],
  ['@deepseek-ai/dsh-experimental-auto-review', {
    title: 'official.bundle.autoReview.title',
    description: 'official.bundle.autoReview.description',
    beta: true,
  }],
])

/**
 * Compact a package name to what a person calls it.
 * @param name - the package name.
 * @returns the unscoped name without the harness prefixes.
 */
function shortBundleName(name: string): string {
  const unscoped = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name
  return unscoped.replace(/^dsh-(?:host-|client-)?/, '')
}

/**
 * What one bundle card reads as: its name over its one-liner.
 *
 * A package with copy of its own is localized at render time; every other
 * package falls back to its short name (its manifest name only when the
 * bundle carries no description either, so the card still says something).
 *
 * @param bundle - the bundle as the Host listed it.
 * @param t - the panel's translate seat.
 * @returns the display name, the one-liner, and whether it is a beta feature.
 */
function bundleText(
  bundle: Pick<BundleInfo, 'name' | 'description'>, t: Translate,
): { title: string; description: string | undefined; beta: boolean } {
  const keys = OFFICIAL_BUNDLE_COPY.get(bundle.name)
  if (keys !== undefined) return { title: t(keys.title), description: t(keys.description), beta: keys.beta }
  const description = bundle.description
  return {
    title: shortBundleName(bundle.name),
    description: description === undefined || description === '' ? undefined : description,
    beta: false,
  }
}

/** The dictionary key naming one group's heading. */
function groupTitleKey(id: BundleGroupId): MarketsKey {
  return id === 'official' ? 'official.group.official' : 'official.group.installed'
}

/**
 * Split the Host's bundles into the two groups the upstream page shows.
 *
 * The predicates are the upstream ones, verbatim: a bundle the installation
 * supplies for the person to switch on is `optional && !installed` and lands
 * in the official group; everything else the deployment holds or the profile
 * cannot drop (`installed || !optional`) lands in the installed group. A
 * built-in profile bundle is dropped before either filter runs, and a bundle
 * the Host failed to read stays listed so its error is reachable.
 *
 * @param bundles - the Host's bundles, as the store read them.
 * @param normalizedQuery - the header's query, lowercased; empty matches all.
 * @returns the official and installed groups, each already filtered.
 */
function bundleGroupsOf(
  bundles: readonly BundleInfo[],
  normalizedQuery: string,
): Readonly<Record<BundleGroupId, BundleInfo[]>> {
  const listed = bundles.filter(bundle => !BUILTIN_PROFILE_BUNDLES.has(bundle.name)
    && (bundle.installed || bundle.optional || bundle.error !== undefined))
  const matched = listed.filter(bundle => bundleMatches(bundle, normalizedQuery))
  return {
    official: matched.filter(bundle => bundle.optional && !bundle.installed),
    bundles: matched.filter(bundle => bundle.installed || !bundle.optional),
  }
}

/** Which panel is rendered. */
export type OfficialPluginsScope = 'official' | 'installed'

/** Where one entry's module came from. */
export type PluginOrigin = 'local' | 'cloud'

/** One row as the panel renders it. */
export interface PluginRow {
  /** Stable row key (the Loader entry id). */
  readonly key: string
  /** Display name derived from the module specifier. */
  readonly name: string
  /** Exact module specifier, kept for the detail line and the title. */
  readonly moduleName: string
  readonly origin: PluginOrigin
  readonly enabled: boolean
  readonly phase: InventoryEntry['fiberPhase']
}

/** Settings reachability for one row, resolved by the owning plugin. */
export interface PluginSettingsTarget {
  /** Whether a settings namespace is served for this row. */
  readonly configurable: boolean
  /** The served namespace, when one is. */
  readonly namespace?: string | undefined
}

/** Injected business data for the official/installed panels. */
export interface OfficialPluginsPanelInjected {
  /** The store every read and write goes through. */
  store: PluginStore
  /**
   * Resolve whether one row has a served settings namespace, so the panel
   * can offer a real configuration entry instead of a dead button.
   */
  settingsTarget: (row: PluginRow) => PluginSettingsTarget
}

/** Full component props. */
export interface OfficialPluginsPanelProps extends OfficialPluginsPanelInjected {
  /** Which panel to render. */
  scope: OfficialPluginsScope
  /** Translate seat of the markets namespace. */
  t: (key: MarketsKey, params?: Record<string, string>) => string
  /** The catalog query, owned by the page header's search field. */
  query: string
  /** Open one row's configuration (a served namespace, or the Settings section). */
  onConfigure: (row: PluginRow) => void
  /**
   * The plugins that registered a configuration page of their own, in ledger
   * order. They are listed after the official bundles — upstream's Official
   * group is exactly these two sources — and carry no switch: they are host
   * plane namespaces (shell, agent loop, subagent, web search), not
   * switchable bundles.
   */
  items: readonly OfficialItem[]
  /** Render one configuration entry's own view (`summary` on the card). */
  renderItem: (id: string) => ReactNode
}

type Translate = OfficialPluginsPanelProps['t']

/** One settled write's outcome, keyed by the subject it addressed. */
interface WriteOutcome {
  readonly status: 'busy' | 'applied' | 'restart' | 'overridden' | 'cancelled' | 'failed' | 'unavailable'
  /** The Host's own diagnostic, when one came back. */
  readonly detail?: string | undefined
}

/** Shorten a module specifier without guessing whether its Loader id was generated. */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@')
    ? moduleName.slice(moduleName.indexOf('/') + 1)
    : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/**
 * Classify one module specifier by origin. A path-like or workspace-linked
 * specifier was loaded from this machine; anything else was installed as a
 * published package (the cloud/market route).
 */
function pluginOrigin(moduleName: string): PluginOrigin {
  return /^[./\\]|^file:|^[A-Za-z]:[\\/]/.test(moduleName) ? 'local' : 'cloud'
}

/** Human-readable lifecycle label for one row's root-fiber phase. */
function phaseLabelKey(phase: InventoryEntry['fiberPhase']): MarketsKey {
  if (phase === 'active') return 'official.phase.active'
  if (phase === 'failed') return 'official.phase.failed'
  if (phase === 'loading') return 'official.phase.loading'
  if (phase === 'pending') return 'official.phase.pending'
  if (phase === 'unloading') return 'official.phase.unloading'
  return 'official.phase.none'
}

/** Build the panel's rows from one snapshot. */
function rowsOf(snapshot: PluginInventorySnapshot, scope: OfficialPluginsScope): PluginRow[] {
  return snapshot.entries
    .filter(entry => scope === 'official' || entry.enabled)
    .map(entry => ({
      key: String(entry.entryId),
      name: moduleShortName(entry.moduleName),
      moduleName: entry.moduleName,
      origin: pluginOrigin(entry.moduleName),
      enabled: entry.enabled,
      phase: entry.fiberPhase,
    }))
}

/**
 * Key the manager's roster by Loader entry id, so one lookup answers both
 * halves of a row's switch: the entry id the write addresses, and why the
 * manager refuses to address it when it does.
 */
export function targetsOf(rows: readonly PluginInfo[]): ReadonlyMap<string, PluginInfo> {
  const index = new Map<string, PluginInfo>()
  for (const info of rows) index.set(String(info.entryId), info)
  return index
}

/** The dictionary key naming why a row's switch is locked. */
function lockReasonKey(reason: ReadOnlyReason, subject: 'plugin' | 'bundle'): MarketsKey {
  if (subject === 'bundle') {
    return reason === 'management-required' ? 'bundles.locked.management' : 'bundles.locked.unaddressable'
  }
  return reason === 'management-required' ? 'official.locked.management' : 'official.locked.unaddressable'
}

/**
 * Fold one settled ChangeResult onto a write outcome. The Host's
 * `application` field is the authority: `applied` is the only value that
 * leaves no line, because only it means "the deployment already reflects
 * this" — every other value names something the person still needs to know.
 */
export function outcomeOf(result: ChangeResult): WriteOutcome {
  if (result.application === 'restart-required') return { status: 'restart' }
  if (result.application === 'overridden') return { status: 'overridden' }
  if (result.application === 'cancelled') return { status: 'cancelled' }
  if (result.application === 'failed' || result.error !== undefined) {
    return { status: 'failed', detail: result.error?.diagnostic ?? result.error?.code }
  }
  return { status: 'applied' }
}

/** Whether a row matches the header's catalog query. */
function matches(row: PluginRow, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [row.name, row.moduleName].some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/** Whether a bundle matches the header's catalog query. */
function bundleMatches(bundle: BundleInfo, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [bundle.name, bundle.description ?? '', ...bundle.rows.map(row => row.moduleName)]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/** The dictionary key naming a bundle read failure. */
function bundleErrorKey(bundle: BundleInfo): MarketsKey {
  const code = bundle.error?.code
  if (code === 'not-bundle') return 'bundles.error.not-bundle'
  if (code === 'management-required') return 'bundles.error.management-required'
  return 'bundles.error.other'
}

/** The dictionary key naming a write's outcome line. */
function outcomeKey(outcome: WriteOutcome): MarketsKey {
  if (outcome.status === 'restart') return 'official.write.restart'
  if (outcome.status === 'overridden') return 'official.write.overridden'
  if (outcome.status === 'cancelled') return 'official.write.cancelled'
  if (outcome.status === 'unavailable') return 'official.write.unavailable'
  if (outcome.status === 'busy') return 'official.write.busy'
  // `applied` is the only outcome that draws no line; its callers never ask
  // for a key, so this arm exists only to keep the mapping total.
  return 'official.write.applied'
}

/**
 * Render one panel: the official plugin inventory or the installed set, with the
 * bundle section above the roster on the official tab.
 *
 * @param props - the panel scope, store, locale seat, and query.
 * @returns the panel element tree.
 */
export function OfficialPluginsPanel({
  scope, t, query, store, settingsTarget, onConfigure, items, renderItem,
}: OfficialPluginsPanelProps) {
  const published: PluginStoreState = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const view = published.read
  const [writes, setWrites] = useState<Readonly<Record<string, WriteOutcome>>>({})

  useEffect(() => {
    void store.refresh().catch(() => {})
  }, [store])

  const ready = view.status === 'ready' ? view.snapshot : undefined
  const targets = useMemo(
    () => (ready === undefined ? new Map<string, PluginInfo>() : targetsOf(ready.rows)),
    [ready],
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()

  const rows = useMemo(
    () => (ready === undefined ? [] : rowsOf(ready.inventory, scope)),
    [ready, scope],
  )
  const visibleRows = useMemo(
    () => rows.filter(row => matches(row, normalizedQuery)),
    [rows, normalizedQuery],
  )
  /**
   * The official tab's two groups. The installed tab is a roster of entries
   * in force, so it never renders bundles at all.
   */
  const groups = useMemo(
    () => (ready === undefined || scope !== 'official'
      ? undefined
      : bundleGroupsOf(ready.bundles, normalizedQuery)),
    [ready, normalizedQuery, scope],
  )
  /**
   * The plugins whose configuration the deployment serves, filtered by the
   * header's query the same way bundles are. The installed tab is a roster of
   * entries in force, so it never shows them.
   */
  const visibleItems = useMemo(
    () => (scope === 'official'
      ? items.filter(item => normalizedQuery === ''
        || item.label.toLocaleLowerCase().includes(normalizedQuery)
        || item.id.toLocaleLowerCase().includes(normalizedQuery))
      : []),
    [items, normalizedQuery, scope],
  )
  /** The official tab counts the cards it shows, not the entries inside them. */
  const bundleCount = groups === undefined
    ? 0
    : groups.official.length + groups.bundles.length + visibleItems.length

  /**
   * Run one write, then re-read. The panel never flips a control itself: it
   * reports what the Host applied, and a rejected call reports the transport's
   * own failure rather than an optimistic state.
   */
  const run = useCallback((
    key: string,
    write: () => Promise<ChangeResult>,
  ): void => {
    setWrites(current => ({ ...current, [key]: { status: 'busy' } }))
    write().then(
      (result) => {
        // `applied` means the deployment already reflects the change, so the
        // row draws no line and the re-read shows the new state directly.
        setWrites(current => ({ ...current, [key]: outcomeOf(result) }))
        void store.refresh().catch(() => {})
      },
      (error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error)
        setWrites(current => ({
          ...current,
          [key]: /management|unaddressable|readonly/i.test(detail)
            ? { status: 'unavailable', detail }
            : { status: 'failed', detail },
        }))
        void store.refresh().catch(() => {})
      },
    )
  }, [store])

  const onToggleRow = useCallback((row: PluginRow, enabled: boolean): void => {
    const target = targets.get(row.key)
    if (target === undefined || target.readOnlyReason !== undefined) return
    run(row.key, () => store.setPluginEnabled(target.entryId, enabled))
  }, [run, store, targets])

  const onToggleBundle = useCallback((bundle: BundleInfo, enabled: boolean): void => {
    if (bundle.readOnlyReason !== undefined || !ready?.managementAvailable) return
    run(`bundle:${bundle.name}`, () => store.setBundleEnabled(bundle.name, enabled))
  }, [ready?.managementAvailable, run, store])

  const onUninstall = useCallback((bundle: BundleInfo): void => {
    if (!bundle.removable || !ready?.managementAvailable) return
    run(`remove:${bundle.name}`, () => store.removeBundle(bundle.name))
  }, [ready?.managementAvailable, run, store])

  if (view.status === 'loading') {
    return <p className={css.hint} data-official-status="loading">{t('official.loading')}</p>
  }
  if (view.status === 'error') {
    return (
      <div className={css.error} data-official-status="error" role="alert">
        <p className={css.errorTitle}>{t('official.error.title')}</p>
        <p className={css.errorDetail}>{t('official.error.detail')}</p>
        <button type="button" className={css.retry} onClick={() => { void store.refresh().catch(() => {}) }}>
          {t('official.error.retry')}
        </button>
      </div>
    )
  }

  // The official tab is card-granular, matching the upstream page: its two
  // bundle groups ARE the surface, and an entry's row only appears inside the
  // card that declares it. The installed tab is the roster of entries in
  // force, which is a different question and keeps the flat list. Each tab's
  // emptiness therefore reads its own surface, never the other's.
  const cardsOnly = scope === 'official'
  const empty = cardsOnly
    ? groups === undefined
      || (groups.official.length === 0 && groups.bundles.length === 0 && visibleItems.length === 0)
    : visibleRows.length === 0
  if (empty) {
    return (
      <p className={css.hint} data-official-status="empty">
        {t(scope === 'official' ? 'official.empty' : 'installed.empty')}
      </p>
    )
  }

  return (
    <div className={css.panel} data-official-scope={scope}>
      <div className={css.panelHead}>
        <span className={css.count} data-official-count={cardsOnly ? bundleCount : visibleRows.length}>
          {cardsOnly
            ? t('official.count', { count: String(bundleCount) })
            : t('installed.count', { count: String(visibleRows.length) })}
        </span>
        <div className={css.panelHeadActions}>
          {/* Installing a package is a profile write, so the trigger lives
              beside Refresh — the one place the official tab speaks for the
              deployment rather than about it. */}
          {ready?.managementAvailable === true && (
            <button
              type="button"
              className={css.reload}
              data-markets-install-open
              onClick={() => { store.openInstall() }}
            >
              {t('install.title')}
            </button>
          )}
          <button
            type="button"
            className={css.reload}
            onClick={() => { void store.refresh().catch(() => {}) }}
          >
            {t('official.reload')}
          </button>
        </div>
      </div>
      {groups !== undefined && (
        <>
          <BundleGroup
            id="official"
            bundles={groups.official}
            items={visibleItems}
            renderItem={renderItem}
            t={t}
            managementAvailable={ready?.managementAvailable === true}
            writes={writes}
            onToggle={onToggleBundle}
            onUninstall={onUninstall}
          />
          <BundleGroup
            id="bundles"
            bundles={groups.bundles}
            items={EMPTY_ITEMS}
            renderItem={renderItem}
            t={t}
            managementAvailable={ready?.managementAvailable === true}
            writes={writes}
            onToggle={onToggleBundle}
            onUninstall={onUninstall}
          />
        </>
      )}
      {!cardsOnly && (
        <ul className={css.list}>
          {visibleRows.map(row => (
            <PluginRowCard
              key={row.key}
              row={row}
              t={t}
              scope={scope}
              target={targets.get(row.key)}
              write={writes[row.key]}
              onToggle={onToggleRow}
              settingsTarget={settingsTarget}
              onConfigure={onConfigure}
            />
          ))}
        </ul>
      )}
      <PluginInstallDialog t={t} store={store} install={published.install} />
    </div>
  )
}

/**
 * One configuration-carrying plugin as a card: the pinwheel, its registered
 * title, and the one-liner the entry itself renders.
 *
 * Upstream lists these beside the official bundles and gives them no switch —
 * the plugin is a host-plane namespace, not a bundle, so there is nothing to
 * enable or remove. The card exists so the configuration page is reachable,
 * which is exactly what it is for.
 */
function PluginItemCard({ item, renderItem }: {
  readonly item: OfficialItem
  readonly renderItem: (id: string) => ReactNode
}): ReactNode {
  const description = renderItem(item.id)
  return (
    <li className={css.bundleCard} data-plugin-item={item.id} data-plugin-item-card="true">
      <div className={css.bundleRow}>
        <span className={css.cardIcon} aria-hidden="true"><IconPluginPinwheelOutline16 size={20} /></span>
        <div className={css.bundleIdentity}>
          <div className={css.bundleTitleRow}>
            <strong className={css.cardTitle}>{item.label}</strong>
          </div>
          {/* The entry owns this line: a namespace with no summary of its own
              renders nothing rather than an empty row. */}
          {description !== undefined && <span className={css.bundleDesc}>{description}</span>}
        </div>
      </div>
    </li>
  )
}

/**
 * One group of bundle cards under its heading and count — the shape the
 * upstream Plugin manager page uses, and the only top-level unit on the
 * official tab. A group with no cards takes no room, so an installation that
 * ships nothing optional shows one group rather than an empty heading.
 *
 * The cards themselves are always rendered: they are the surface, not a
 * disclosure. Only the rows *inside* a card fold, because a bundle routinely
 * declares a hundred of them.
 */
function BundleGroup({ id, bundles, items, renderItem, t, managementAvailable, writes, onToggle, onUninstall }: {
  readonly id: BundleGroupId
  readonly bundles: readonly BundleInfo[]
  readonly items: readonly OfficialItem[]
  readonly renderItem: (id: string) => ReactNode
  readonly t: Translate
  readonly managementAvailable: boolean
  readonly writes: Readonly<Record<string, WriteOutcome>>
  readonly onToggle: (bundle: BundleInfo, enabled: boolean) => void
  readonly onUninstall: (bundle: BundleInfo) => void
}) {
  // Upstream's Official group is two sources under one heading: the bundles the
  // installation ships, then the plugins that registered a configuration page.
  // The count covers both, and the group is empty only when both are.
  const count = bundles.length + items.length
  if (count === 0) return null
  return (
    <section
      className={css.section}
      data-markets-bundles={id}
      data-bundle-group={id}
      data-bundle-group-count={count}
    >
      <div className={css.sectionHead}>
        <h3 className={css.sectionTitle}>{t(groupTitleKey(id))}</h3>
        <span className={css.count}>
          {t(id === 'official' ? 'official.group.official.count' : 'official.group.installed.count',
            { count: String(count) })}
        </span>
      </div>
      <p className={css.sectionHint}>
        {t(id === 'official' ? 'official.group.official.hint' : 'official.group.installed.hint')}
      </p>
      <ul className={css.bundleList}>
        {bundles.map(bundle => (
          <BundleCard
            key={bundle.name}
            bundle={bundle}
            t={t}
            managementAvailable={managementAvailable}
            write={writes[`bundle:${bundle.name}`]}
            removeWrite={writes[`remove:${bundle.name}`]}
            onToggle={onToggle}
            onUninstall={onUninstall}
          />
        ))}
        {items.map(item => (
          <PluginItemCard key={`item:${item.id}`} item={item} renderItem={renderItem} />
        ))}
      </ul>
    </section>
  )
}

/**
 * One bundle card: identity, switch, uninstall, and the rows it declares.
 *
 * The declared rows start folded and scroll once opened: a bundle routinely
 * declares a hundred rows, and they restate what the roster below already
 * reports for the running tree. The row count tag doubles as the disclosure
 * button, so the control names exactly what it reveals.
 */
function BundleCard({ bundle, t, managementAvailable, write, removeWrite, onToggle, onUninstall }: {
  readonly bundle: BundleInfo
  readonly t: Translate
  readonly managementAvailable: boolean
  readonly write: WriteOutcome | undefined
  readonly removeWrite: WriteOutcome | undefined
  readonly onToggle: (bundle: BundleInfo, enabled: boolean) => void
  readonly onUninstall: (bundle: BundleInfo) => void
}) {
  const [rowsOpen, setRowsOpen] = useState(false)
  const locked = !managementAvailable || bundle.readOnlyReason !== undefined
  const busy = write?.status === 'busy' || removeWrite?.status === 'busy'
  const lockTitle = bundle.readOnlyReason === undefined
    ? (managementAvailable ? undefined : t('official.write.unavailable'))
    : t(lockReasonKey(bundle.readOnlyReason, 'bundle'))
  const removable = bundle.removable && managementAvailable
  const { title, description, beta } = bundleText(bundle, t)
  return (
    <li
      className={css.bundleCard}
      data-bundle={bundle.name}
      data-enabled={bundle.enabled ? 'true' : 'false'}
      data-removable={bundle.removable ? 'true' : 'false'}
      data-bundle-locked={locked ? 'true' : 'false'}
      data-bundle-rows-expanded={rowsOpen ? 'true' : 'false'}
    >
      <div className={css.bundleRow}>
        {/* The same head the upstream Plugin manager's cards carry: the
            pinwheel in its framed box, then the name over its one-liner. */}
        <span className={css.cardIcon} aria-hidden="true"><IconPluginPinwheelOutline16 size={20} /></span>
        <div className={css.bundleIdentity}>
          <div className={css.bundleTitleRow}>
            <strong className={css.cardTitle} title={bundle.name}>{title}</strong>
            {beta ? <Tag className={css.statusTag} tone="info">{t('official.bundle.beta')}</Tag> : null}
            {bundle.version !== undefined && <span className={css.cardVersion}>{bundle.version}</span>}
          </div>
          {description !== undefined && (
            <span className={css.bundleDesc} title={bundle.name}>{description}</span>
          )}
        </div>
        <div className={css.cardActions}>
          {/* Uninstall is offered only when the profile owns the dependency;
              an installation-supplied bundle stays installed by design. */}
          <button
            type="button"
            className={css.dangerButton}
            data-bundle-uninstall={bundle.name}
            disabled={!removable || busy}
            onClick={() => { onUninstall(bundle) }}
            title={removable ? t('bundles.uninstall') : t('bundles.uninstall.blocked')}
          >
            {t('bundles.uninstall')}
          </button>
          <Switch
            checked={bundle.enabled}
            label={t(bundle.enabled ? 'bundles.toggle.disable' : 'bundles.toggle.enable', { name: bundle.name })}
            disabled={busy || locked}
            title={lockTitle}
            className={css.rowSwitch}
            onChange={(enabled) => { onToggle(bundle, enabled) }}
          />
        </div>
      </div>
      <div className={css.cardMeta}>
        <span className={css.tag} data-enabled={bundle.enabled ? 'true' : 'false'}>
          {t(bundle.enabled ? 'bundles.state.enabled' : 'bundles.state.disabled')}
        </span>
        {/* Group membership already says whether the installation supplies
            this bundle, so the card carries only what the heading cannot: the
            installation's own hold on it. */}
        {bundle.installed && <span className={css.tag}>{t('bundles.state.installed')}</span>}
        {bundle.rows.length > 0
          ? (
            <button
              type="button"
              className={css.rowsToggle}
              data-bundle-rows-toggle={bundle.name}
              aria-expanded={rowsOpen}
              onClick={() => { setRowsOpen(current => !current) }}
              title={t(rowsOpen ? 'bundles.rows.collapse' : 'bundles.rows.expand',
                { name: bundle.name, count: String(bundle.rows.length) })}
            >
              <span className={css.disclosure} data-expanded={rowsOpen ? 'true' : 'false'} aria-hidden="true" />
              {t('bundles.rows', { count: String(bundle.rows.length) })}
            </button>
          )
          : <span className={css.tag}>{t('bundles.rows', { count: String(bundle.rows.length) })}</span>}
        {bundle.overrides.length > 0 && (
          <span className={css.tag}>{t('bundles.overrides', { count: String(bundle.overrides.length) })}</span>
        )}
      </div>
      {bundle.error !== undefined && (
        <p className={css.writeFailed} data-bundle-error={bundle.error.code}>
          {t(bundleErrorKey(bundle))}
        </p>
      )}
      {rowsOpen && bundle.rows.length > 0 && (
        <ul className={css.bundleRows} data-bundle-rows={bundle.name}>
          {bundle.rows.map(row => (
            <li key={row.rowId} className={css.bundleRowItem} data-bundle-row={row.rowId}>
              <span className={css.bundleRowId}>{row.rowId}</span>
              <span className={css.bundleRowModule} title={row.moduleName}>{row.moduleName}</span>
              {/* A row with no live entry is declared but not mounted, which is
                  what a disabled bundle's rows look like. */}
              {row.entryId === undefined && <span className={css.bundleRowLive}>{t('official.phase.none')}</span>}
            </li>
          ))}
        </ul>
      )}
      {write !== undefined && write.status !== 'busy' && write.status !== 'applied' && (
        <p
          className={write.status === 'failed' ? css.writeFailed : css.writeNote}
          data-bundle-write={write.status}
          role={write.status === 'failed' ? 'alert' : undefined}
        >
          {t(outcomeKey(write))}
        </p>
      )}
      {removeWrite !== undefined && removeWrite.status !== 'busy' && (
        <p
          className={removeWrite.status === 'failed' ? css.writeFailed : css.writeNote}
          data-bundle-remove={removeWrite.status}
          role={removeWrite.status === 'failed' ? 'alert' : undefined}
        >
          {t(removeWrite.status === 'failed' ? 'bundles.uninstall.error.other' : outcomeKey(removeWrite))}
        </p>
      )}
    </li>
  )
}

/** One inventory row: identity, origin, enablement, phase, and its actions. */
function PluginRowCard({ row, t, scope, target, write, onToggle, settingsTarget, onConfigure }: {
  readonly row: PluginRow
  readonly t: Translate
  readonly scope: OfficialPluginsScope
  readonly target: PluginInfo | undefined
  readonly write: WriteOutcome | undefined
  readonly onToggle: (row: PluginRow, enabled: boolean) => void
  readonly settingsTarget: (row: PluginRow) => PluginSettingsTarget
  readonly onConfigure: (row: PluginRow) => void
}) {
  const settings = settingsTarget(row)
  const locked = target === undefined || target.readOnlyReason !== undefined
  const busy = write?.status === 'busy'
  const lockTitle = target?.readOnlyReason === undefined ? undefined : t(lockReasonKey(target.readOnlyReason, 'plugin'))
  return (
    <li
      className={css.card}
      data-plugin-module={row.moduleName}
      data-plugin-origin={row.origin}
      data-enabled={row.enabled ? 'true' : 'false'}
      data-plugin-locked={locked ? 'true' : 'false'}
    >
      <div className={css.cardMain}>
        <div className={css.cardIdentity}>
          <strong className={css.cardTitle} title={row.moduleName}>{row.name}</strong>
          <span className={css.cardModule} title={row.moduleName}>{row.moduleName}</span>
        </div>
        <div className={css.cardMeta}>
          <span className={css.tag} data-origin={row.origin}>
            {t(row.origin === 'local' ? 'official.origin.local' : 'official.origin.cloud')}
          </span>
          <span className={css.tag} data-enabled={row.enabled ? 'true' : 'false'}>
            {t(row.enabled ? 'official.state.enabled' : 'official.state.disabled')}
          </span>
          <span className={css.tag} data-phase={row.phase ?? 'none'}>
            {t(phaseLabelKey(row.phase))}
          </span>
        </div>
      </div>
      <div className={css.cardActions}>
        {scope === 'installed' && (
          <button
            type="button"
            className={css.settingsButton}
            disabled={!settings.configurable}
            onClick={() => { onConfigure(row) }}
            title={settings.configurable
              ? t('installed.settings.title')
              : t('installed.settings.unavailable')}
          >
            {t('installed.settings')}
          </button>
        )}
        {/* The switch stays visible on every row, locked rather than hidden
            when the manager cannot address it, so the roster reads the same
            down the column and the reason is one hover away. */}
        <Switch
          checked={row.enabled}
          label={t(row.enabled ? 'official.toggle.disable' : 'official.toggle.enable', { name: row.name })}
          disabled={busy || locked}
          title={lockTitle}
          className={css.rowSwitch}
          onChange={(enabled) => { onToggle(row, enabled) }}
        />
      </div>
      {write === undefined || write.status === 'busy' || write.status === 'applied' ? null : (
        <p
          className={write.status === 'failed' ? css.writeFailed : css.writeNote}
          data-write-status={write.status}
          role={write.status === 'failed' ? 'alert' : undefined}
        >
          {t(outcomeKey(write))}
          {write.detail === undefined ? null : ` ${t('official.write.detail', { detail: write.detail })}`}
        </p>
      )}
    </li>
  )
}
