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
 *   card — the tab's top level is cards, never a flattened roster. The
 *   configuration pages other plugins register (`plugins.item`) are listed
 *   under the same heading, after the bundles, exactly as upstream lists them.
 * - **Installed** lists the entries that are actually in force (enabled),
 *   local and cloud together, and exposes a Settings affordance on exactly
 *   those entries whose namespace this deployment serves.
 *
 * **Every card and every row is a door.** Upstream's listing opens a page from
 * each card's head, and this panel does the same (`PluginDetailView`), so a
 * plugin's own configuration is reachable from the surface a person browses.
 * That is also what makes the roster honest: an entry whose deployment ships no
 * settings offers no Settings button, because the page it would open already
 * says so in words — and a greyed control can never tell "nothing to
 * configure" apart from "the page failed to load".
 *
 * Both tabs carry the per-row switch. A bundle card adds the two capabilities
 * a per-row switch cannot express: a **bundle-level** switch (one toggle for
 * a whole patch layer, matching how the Host composes the profile) and
 * **uninstall** (removing a bundle's dependency), each with the Host's own
 * lock and removability answers deciding what the card offers. The bundle's
 * page carries the same two controls, so a page never has fewer powers than the
 * card it was opened from.
 *
 * Writes never flip a control locally. The panel asks the store, the store
 * reports what the Host actually applied, and the roster re-reads the live
 * tree — so an override, a restart requirement, a cancellation, or a refusal
 * each read differently instead of all looking like success.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { IconPluginPinwheelOutlineRegular, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  BundleInfo, ChangeResult, PluginInfo, PluginInventorySnapshot, ReadOnlyReason,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarketsKey } from './locales.ts'
import { rowConfigKey, type ConfigLedger, type OfficialItem } from './configItems.ts'
import { isServed, namespaceOfEntry, type MarketsConfigForms } from './settingsForms.ts'
import type { PluginStore, PluginStoreState } from './pluginStore.ts'
import {
  PluginDetailView, type DetailEntry, type MarketsPluginSlots, type PluginDetailTarget,
} from './PluginDetail.tsx'
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

/** Injected business data for the official/installed panels. */
export interface OfficialPluginsPanelInjected {
  /** The store every read and write goes through. */
  store: PluginStore
  /**
   * The configuration ledgers the page renders from — the official items, the
   * bundles with a page-level form, and the rows with a page — as one live
   * source, so a plugin that registers its page after the first render still
   * lands a card.
   */
  ledger: HostObservable<ConfigLedger>
  /**
   * The Host's configuration forms. The panel reads the served namespaces from
   * here, both as the re-render trigger (the hook) and as the per-row answer
   * ({@link isServed} over that same list), so a row's Settings affordance and
   * an open entry's page are decided by one rule: the Host answers for the
   * entry's own id.
   */
  configForms: MarketsConfigForms
  /** The render face of the seats this plugin's page hosts. */
  slots: MarketsPluginSlots
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
 * What the panel has open. The listing is a state too, so "back" is the same
 * transition as any other, and a subject that leaves the listing (an uninstall)
 * simply falls back here rather than rendering a page about nothing.
 */
type OpenSubject =
  | { readonly kind: 'list' }
  | { readonly kind: 'item'; readonly id: string }
  | { readonly kind: 'bundle'; readonly name: string }
  | { readonly kind: 'row'; readonly name: string; readonly rowId: string }
  | { readonly kind: 'entry'; readonly key: string }

/** The listing state, shared by both tabs. */
const LISTING: OpenSubject = { kind: 'list' }

/**
 * Render one panel: the official plugin inventory or the installed set, with the
 * bundle section above the roster on the official tab, and one subject's own
 * page when a card or a row has been opened.
 *
 * @param props - the panel scope, store, locale seat, query, and the ledgers.
 * @returns the panel element tree.
 */
export function OfficialPluginsPanel({
  scope, t, query, store, onConfigure, ledger: ledgerSource, configForms, slots,
}: OfficialPluginsPanelProps) {
  const published: PluginStoreState = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const ledger = useSyncExternalStore(ledgerSource.subscribe, ledgerSource.getSnapshot)
  // The namespaces this deployment serves. Held (not just read) because the
  // hook is also the subscription: when the Host's answer moves, every row's
  // Settings affordance and any open entry's page re-decide against it.
  const served = configForms.useServedNamespaces()
  const view = published.read
  const [writes, setWrites] = useState<Readonly<Record<string, WriteOutcome>>>({})
  // One open subject per panel instance, so switching sub-tabs never carries a
  // page from the other tab across (each scope renders its own panel).
  const [open, setOpen] = useState<OpenSubject>(LISTING)

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
      ? ledger.items.filter(item => normalizedQuery === ''
        || item.label.toLocaleLowerCase().includes(normalizedQuery)
        || item.id.toLocaleLowerCase().includes(normalizedQuery))
      : []),
    [ledger, normalizedQuery, scope],
  )
  /** The official tab counts the cards it shows, not the entries inside them. */
  const bundleCount = groups === undefined
    ? 0
    : groups.official.length + groups.bundles.length + visibleItems.length

  /**
   * The subject the open page is about, resolved against the live listing, so a
   * package that leaves the list (uninstalled elsewhere) drops back to the
   * cards instead of rendering a page about a bundle that is gone.
   */
  const target = useMemo((): PluginDetailTarget | undefined => {
    if (ready === undefined || open.kind === 'list') return undefined
    if (open.kind === 'item') {
      const item = ledger.items.find(candidate => candidate.id === open.id)
      return item === undefined ? undefined : { kind: 'item', item }
    }
    if (open.kind === 'entry') {
      const row = rows.find(candidate => candidate.key === open.key)
      return row === undefined ? undefined : { kind: 'entry', row: detailEntryOf(row, t) }
    }
    const bundle = ready.bundles.find(candidate => candidate.name === open.name)
    if (bundle === undefined) return undefined
    if (open.kind === 'bundle') return { kind: 'bundle', bundle }
    const row = bundle.rows.find(candidate => candidate.rowId === open.rowId)
    return row === undefined ? undefined : { kind: 'row', bundle, row }
  }, [open, ready, ledger, rows, t])

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
    const address = targets.get(row.key)
    if (address === undefined || address.readOnlyReason !== undefined) return
    run(row.key, () => store.setPluginEnabled(address.entryId, enabled))
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

  // One open page replaces the listing: it draws its own crumb back, so the
  // panel needs no second header and the two surfaces never fight over the
  // scroll container.
  if (target !== undefined) {
    const body = configOf(target, {
      t, slots, configForms, served, ledger, onConfigure,
      // An entry's page opens this application's settings channel for that
      // entry, and the channel takes the roster row — so the page resolves it
      // back through the same listing the subject came from.
      resolveRow: key => rows.find(candidate => candidate.key === key),
    })
    const openRow = (rowId: string): void => {
      if (target.kind !== 'bundle') return
      setOpen({ kind: 'row', name: target.bundle.name, rowId })
    }
    // The entry's page carries the same switch its roster row does, and the
    // switch writes through the plugin manager — which addresses a roster row,
    // not the page's own facts — so the row is resolved back from the listing.
    const entryRow = target.kind === 'entry'
      ? rows.find(candidate => candidate.key === target.row.key)
      : undefined
    return (
      <div className={css.panel} data-official-scope={scope}>
        <PluginDetailView
          target={target}
          t={t}
          slots={slots}
          config={body.node}
          configurable={body.configurable}
          actions={target.kind === 'bundle'
            ? (
              <BundleControls
                bundle={target.bundle}
                t={t}
                managementAvailable={ready?.managementAvailable === true}
                write={writes[`bundle:${target.bundle.name}`]}
                removeWrite={writes[`remove:${target.bundle.name}`]}
                onToggle={onToggleBundle}
                onUninstall={onUninstall}
              />
            )
            : target.kind === 'entry'
              ? (
                <Switch
                  checked={target.row.enabled}
                  label={t(target.row.enabled ? 'official.toggle.disable' : 'official.toggle.enable', { name: target.row.name })}
                  disabled={entryRow === undefined
                    || targets.get(target.row.key)?.readOnlyReason !== undefined
                    || writes[target.row.key]?.status === 'busy'}
                  title={rowLockTitle(targets.get(target.row.key), t)}
                  className={css.rowSwitch}
                  onChange={(enabled) => {
                    if (entryRow === undefined) return
                    onToggleRow(entryRow, enabled)
                  }}
                />
              )
              : undefined}
          rows={target.kind === 'bundle' ? target.bundle.rows : undefined}
          configuredRows={ledger.rows}
          onOpenRow={target.kind === 'bundle' ? (row) => { openRow(row.rowId) } : undefined}
          onConfigureRow={target.kind === 'bundle' ? (row) => { openRow(row.rowId) } : undefined}
          onBack={() => { setOpen(LISTING) }}
        />
      </div>
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
            t={t}
            slots={slots}
            managementAvailable={ready?.managementAvailable === true}
            writes={writes}
            onOpenItem={(id) => { setOpen({ kind: 'item', id }) }}
            onOpenBundle={(name) => { setOpen({ kind: 'bundle', name }) }}
            onToggle={onToggleBundle}
            onUninstall={onUninstall}
          />
          <BundleGroup
            id="bundles"
            bundles={groups.bundles}
            items={EMPTY_ITEMS}
            t={t}
            slots={slots}
            managementAvailable={ready?.managementAvailable === true}
            writes={writes}
            onOpenItem={(id) => { setOpen({ kind: 'item', id }) }}
            onOpenBundle={(name) => { setOpen({ kind: 'bundle', name }) }}
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
              served={served}
              target={targets.get(row.key)}
              write={writes[row.key]}
              onToggle={onToggleRow}
              onConfigure={onConfigure}
              onOpen={() => { setOpen({ kind: 'entry', key: row.key }) }}
            />
          ))}
        </ul>
      )}
      <PluginInstallDialog t={t} store={store} install={published.install} />
    </div>
  )
}

/** The lock tooltip of one roster row's switch, when the manager cannot address it. */
function rowLockTitle(address: PluginInfo | undefined, t: Translate): string | undefined {
  // An unaddressable row and a locked one read the same to the person: the
  // manager will refuse the write, and the reason is what the tooltip carries.
  if (address === undefined) return t('official.locked.unaddressable')
  return address.readOnlyReason === undefined ? undefined : t(lockReasonKey(address.readOnlyReason, 'plugin'))
}

/**
 * One roster row as its page renders it. The roster owns the `official.*`
 * vocabulary it already renders the row's tags with, so it resolves those
 * labels here and hands the page text: the page then needs no second copy of
 * another surface's dictionary, and its own `detail.*` keys stay its own.
 * @param row - the roster row.
 * @param t - the panel's translate seat.
 * @returns the entry facts the page draws.
 */
function detailEntryOf(row: PluginRow, t: Translate): DetailEntry {
  return {
    key: row.key,
    entryId: namespaceOfEntry(row.key),
    name: row.name,
    moduleName: row.moduleName,
    enabled: row.enabled,
    originLabel: t(row.origin === 'local' ? 'official.origin.local' : 'official.origin.cloud'),
    stateLabel: t(row.enabled ? 'official.state.enabled' : 'official.state.disabled'),
    phaseLabel: t(phaseLabelKey(row.phase)),
  }
}

/**
 * The configuration body of one open page, and whether it carries something the
 * person can act on.
 *
 * The registered views are the plugins' own: an entry that registered a
 * `plugins.item` page draws whatever it likes, so it always counts as
 * configurable. A bundle or a row counts only when this deployment registered a
 * form for it. A roster entry is the fork's own case — no plugin registers a
 * page for a bare Loader id — so its configuration runs through this
 * application's conversation channel, and only when the deployment serves the
 * entry's own namespace.
 *
 * @param target - the subject the page is about.
 * @param deps - the render face, the ledgers, the form resolver, and the two actions.
 * @returns the body to render and whether it is actionable.
 */
function configOf(target: PluginDetailTarget, deps: {
  t: Translate
  slots: MarketsPluginSlots
  configForms: MarketsConfigForms
  /** The namespaces this deployment serves, as the panel last read them. */
  served: readonly string[]
  /** The ledgers, for the two keyed seats' registration keys. */
  ledger: ConfigLedger
  onConfigure: (row: PluginRow) => void
  /** Resolve a subject back to the roster row the settings channel takes. */
  resolveRow: (key: string) => PluginRow | undefined
}): { node: ReactNode; configurable: boolean } {
  const { t, slots, configForms, served, onConfigure, resolveRow } = deps
  if (target.kind === 'item') {
    // Upstream hands the entry the Host form when one is served for its id;
    // the host-plane pages carry their own form and ignore it.
    return { node: slots.itemPage(target.item.id, configForms.pageForm(target.item.id)), configurable: true }
  }
  if (target.kind === 'bundle') {
    // A bundle's page-level form is optional: a bundle that ships none has no
    // configuration section to fill, and the page says so instead of leaving a
    // heading over nothing.
    const registered = deps.ledger.bundles.has(target.bundle.name)
    return {
      node: registered ? slots.bundleConfig(target.bundle.name) : null,
      configurable: registered,
    }
  }
  if (target.kind === 'row') {
    const key = rowConfigKey(target.bundle.name, target.row.rowId)
    const registered = deps.ledger.rows.has(key)
    const namespace = target.row.entryId === undefined ? undefined : namespaceOfEntry(String(target.row.entryId))
    return {
      node: registered
        ? slots.rowConfig(key, namespace === undefined ? undefined : configForms.pageForm(namespace))
        : null,
      configurable: registered,
    }
  }
  // A bare Loader entry, the fork's own case. This application owns no form for
  // a namespace it did not author, so an entry's settings channel IS the
  // conversation — and it is offered on exactly the entries the Host serves a
  // namespace for. Everything else says so in words rather than showing a
  // control that opens nothing.
  const row = resolveRow(target.row.key)
  if (row === undefined || !isServed(served, target.row.key)) return { node: null, configurable: false }
  return {
    node: (
      <div className={css.detailAction}>
        <button
          type="button"
          className={css.settingsButton}
          data-plugin-detail-configure=""
          onClick={() => { onConfigure(row) }}
        >
          {t('installed.settings')}
        </button>
        <p className={css.detailHint}>{t('detail.config.channel')}</p>
      </div>
    ),
    configurable: true,
  }
}

/**
 * One configuration-carrying plugin as a card the card's head opens.
 *
 * Upstream lists these beside the official bundles and gives them no switch —
 * the plugin is a host-plane namespace, not a bundle, so there is nothing to
 * enable or remove. The card exists so the configuration page is reachable,
 * which is exactly what it is for, so its head is the door.
 */
function PluginItemCard({ item, t, onOpen, slots }: {
  readonly item: OfficialItem
  readonly t: Translate
  readonly onOpen: () => void
  readonly slots: MarketsPluginSlots
}): ReactNode {
  const description = slots.itemSummary(item.id)
  return (
    <li className={css.bundleCard} data-plugin-item={item.id} data-plugin-item-card="true">
      <div className={css.bundleRow}>
        <button
          type="button"
          className={css.cardHeadButton}
          data-plugin-item-open={item.id}
          aria-label={t('detail.open.title', { name: item.label })}
          title={t('detail.open.title', { name: item.label })}
          onClick={onOpen}
        >
          <span className={css.cardIcon} aria-hidden="true"><IconPluginPinwheelOutlineRegular size={20} /></span>
          <div className={css.bundleIdentity}>
            <div className={css.bundleTitleRow}>
              <strong className={css.cardTitle}>{item.label}</strong>
            </div>
            {/* The entry owns this line: a namespace with no summary of its own
                renders nothing rather than an empty row. */}
            {description !== undefined && <span className={css.bundleDesc}>{description}</span>}
          </div>
        </button>
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
function BundleGroup({
  id, bundles, items, t, slots, managementAvailable, writes, onOpenItem, onOpenBundle, onToggle, onUninstall,
}: {
  readonly id: BundleGroupId
  readonly bundles: readonly BundleInfo[]
  readonly items: readonly OfficialItem[]
  readonly t: Translate
  /** The render face, so a configuration card draws its own summary view. */
  readonly slots: MarketsPluginSlots
  readonly managementAvailable: boolean
  readonly writes: Readonly<Record<string, WriteOutcome>>
  readonly onOpenItem: (id: string) => void
  readonly onOpenBundle: (name: string) => void
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
            onOpen={() => { onOpenBundle(bundle.name) }}
            onToggle={onToggle}
            onUninstall={onUninstall}
          />
        ))}
        {items.map(item => (
          <PluginItemCard
            key={`item:${item.id}`}
            item={item}
            t={t}
            slots={slots}
            onOpen={() => { onOpenItem(item.id) }}
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * One bundle's write controls: uninstall and the whole-layer switch.
 *
 * Extracted so the card and the bundle's own page carry the same two controls
 * with the same locks, the same busy handling, and the same tooltips — a page
 * opened from a card never has fewer powers than the card had.
 */
function BundleControls({ bundle, t, managementAvailable, write, removeWrite, onToggle, onUninstall }: {
  readonly bundle: BundleInfo
  readonly t: Translate
  readonly managementAvailable: boolean
  readonly write: WriteOutcome | undefined
  readonly removeWrite: WriteOutcome | undefined
  readonly onToggle: (bundle: BundleInfo, enabled: boolean) => void
  readonly onUninstall: (bundle: BundleInfo) => void
}) {
  const locked = !managementAvailable || bundle.readOnlyReason !== undefined
  const busy = write?.status === 'busy' || removeWrite?.status === 'busy'
  const lockTitle = bundle.readOnlyReason === undefined
    ? (managementAvailable ? undefined : t('official.write.unavailable'))
    : t(lockReasonKey(bundle.readOnlyReason, 'bundle'))
  const removable = bundle.removable && managementAvailable
  return (
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
  )
}

/**
 * One bundle card: identity, switch, uninstall, and the rows it declares.
 *
 * The card's head is the door to the bundle's own page (its configuration and
 * its rows). The declared rows start folded and scroll once opened: a bundle
 * routinely declares a hundred rows, and they restate what the roster below
 * already reports for the running tree. The row count tag doubles as the
 * disclosure button, so the control names exactly what it reveals.
 */
function BundleCard({
  bundle, t, managementAvailable, write, removeWrite, onOpen, onToggle, onUninstall,
}: {
  readonly bundle: BundleInfo
  readonly t: Translate
  readonly managementAvailable: boolean
  readonly write: WriteOutcome | undefined
  readonly removeWrite: WriteOutcome | undefined
  readonly onOpen: () => void
  readonly onToggle: (bundle: BundleInfo, enabled: boolean) => void
  readonly onUninstall: (bundle: BundleInfo) => void
}) {
  const [rowsOpen, setRowsOpen] = useState(false)
  const locked = !managementAvailable || bundle.readOnlyReason !== undefined
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
        {/* The same head the upstream Plugin manager's cards carry — and the
            same door: the pinwheel, the name and its one-liner, opening the
            bundle's own page. */}
        <button
          type="button"
          className={css.cardHeadButton}
          data-bundle-open={bundle.name}
          aria-label={t('detail.open.title', { name: title })}
          title={t('detail.open.title', { name: title })}
          onClick={onOpen}
        >
          <span className={css.cardIcon} aria-hidden="true"><IconPluginPinwheelOutlineRegular size={20} /></span>
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
        </button>
        <BundleControls
          bundle={bundle}
          t={t}
          managementAvailable={managementAvailable}
          write={write}
          removeWrite={removeWrite}
          onToggle={onToggle}
          onUninstall={onUninstall}
        />
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
function PluginRowCard({
  row, t, scope, served, target, write, onToggle, onConfigure, onOpen,
}: {
  readonly row: PluginRow
  readonly t: Translate
  readonly scope: OfficialPluginsScope
  /** The namespaces this deployment serves, so the Settings affordance is offered only where it opens something. */
  readonly served: readonly string[]
  readonly target: PluginInfo | undefined
  readonly write: WriteOutcome | undefined
  readonly onToggle: (row: PluginRow, enabled: boolean) => void
  readonly onConfigure: (row: PluginRow) => void
  readonly onOpen: () => void
}) {
  const configurable = isServed(served, row.key)
  const locked = target === undefined || target.readOnlyReason !== undefined
  const busy = write?.status === 'busy'
  const lockTitle = rowLockTitle(target, t)
  return (
    <li
      className={css.card}
      data-plugin-module={row.moduleName}
      data-plugin-origin={row.origin}
      data-enabled={row.enabled ? 'true' : 'false'}
      data-plugin-locked={locked ? 'true' : 'false'}
    >
      <div className={css.cardMain}>
        {/* The identity is the door to the entry's own page, so a row the
            deployment ships no settings for is still reachable and says so,
            rather than offering a control that opens nothing. */}
        <button
          type="button"
          className={css.cardHeadButton}
          data-plugin-open={row.key}
          aria-label={t('detail.open.title', { name: row.name })}
          title={t('detail.open.title', { name: row.name })}
          onClick={onOpen}
        >
          <div className={css.cardIdentity}>
            <strong className={css.cardTitle} title={row.moduleName}>{row.name}</strong>
            <span className={css.cardModule} title={row.moduleName}>{row.moduleName}</span>
          </div>
        </button>
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
        {/* The affordance exists exactly where it opens something: the Host
            serves a settings namespace for this entry's own id. Every other
            row still has its page, and that page is where the missing settings
            are explained — in words, because a greyed control cannot say which
            of the two happened. */}
        {scope === 'installed' && configurable && (
          <button
            type="button"
            className={css.settingsButton}
            data-plugin-settings={row.key}
            onClick={() => { onConfigure(row) }}
            title={t('installed.settings.title')}
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
