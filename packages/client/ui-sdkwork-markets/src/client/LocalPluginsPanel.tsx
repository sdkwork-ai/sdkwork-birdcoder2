/**
 * The local and installed plugin panels.
 *
 * Both tabs are views over the running application's own plugin tree — the
 * Host inventory Remote — rather than over a second, divergent roster: the
 * market IS this application's plugin system, so "installed" means "loaded
 * by this deployment", whether the module came from the local workspace or
 * from a published (cloud) package.
 *
 * - **Local** lists every entry the Loader holds, grouped by origin, with
 *   each entry's effective enablement and root-fiber phase.
 * - **Installed** lists the entries that are actually in force (enabled),
 *   local and cloud together, and exposes a Settings affordance per entry:
 *   an entry whose module maps to a served settings namespace opens that
 *   configuration, the rest report that the deployment ships no browser
 *   half for it (mirroring the Settings plugins section's intersection rule).
 */
import { useEffect, useMemo, useState } from 'react'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { MarketsKey } from './locales.ts'
import css from './LocalPluginsPanel.module.css'

/** One inventory row, narrowed to what the panels render. */
type InventoryEntry = PluginInventorySnapshot['entries'][number]

/** Which panel is rendered. */
export type LocalPluginsScope = 'local' | 'installed'

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

/** Injected business data for the local/installed panels. */
export interface LocalPluginsPanelInjected {
  /** Read a current Host inventory snapshot. */
  listPlugins: () => Promise<PluginInventorySnapshot>
  /**
   * Resolve whether one row has a served settings namespace, so the panel
   * can offer a real configuration entry instead of a dead button.
   */
  settingsTarget: (row: PluginRow) => PluginSettingsTarget
}

/** Full component props. */
export interface LocalPluginsPanelProps extends LocalPluginsPanelInjected {
  /** Which panel to render. */
  scope: LocalPluginsScope
  /** Translate seat of the markets namespace. */
  t: (key: MarketsKey, params?: Record<string, string>) => string
  /** The catalog query, owned by the page header's search field. */
  query: string
  /** Open one row's configuration (a served namespace, or the Settings section). */
  onConfigure: (row: PluginRow) => void
}

type Translate = LocalPluginsPanelProps['t']

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginInventorySnapshot }

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
  if (phase === 'active') return 'local.phase.active'
  if (phase === 'failed') return 'local.phase.failed'
  if (phase === 'loading') return 'local.phase.loading'
  if (phase === 'pending') return 'local.phase.pending'
  if (phase === 'unloading') return 'local.phase.unloading'
  return 'local.phase.none'
}

/** Build the panel's rows from one snapshot. */
function rowsOf(snapshot: PluginInventorySnapshot, scope: LocalPluginsScope): PluginRow[] {
  return snapshot.entries
    .filter(entry => scope === 'local' || entry.enabled)
    .map(entry => ({
      key: String(entry.entryId),
      name: moduleShortName(entry.moduleName),
      moduleName: entry.moduleName,
      origin: pluginOrigin(entry.moduleName),
      enabled: entry.enabled,
      phase: entry.fiberPhase,
    }))
}

/** Whether a row matches the header's catalog query. */
function matches(row: PluginRow, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return [row.name, row.moduleName].some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

/**
 * Render one panel: the local plugin inventory or the installed set, with a
 * per-row Settings affordance on the installed tab.
 *
 * @param props - the panel scope, data source, locale seat, and query.
 * @returns the panel element tree.
 */
export function LocalPluginsPanel({
  scope, t, query, listPlugins, settingsTarget, onConfigure,
}: LocalPluginsPanelProps) {
  const [view, setView] = useState<ViewState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let live = true
    setView({ status: 'loading' })
    listPlugins().then(
      (snapshot) => { if (live) setView({ status: 'ready', snapshot }) },
      () => { if (live) setView({ status: 'error' }) },
    )
    return () => { live = false }
  }, [listPlugins, reloadKey])

  const rows = useMemo(
    () => (view.status === 'ready' ? rowsOf(view.snapshot, scope) : []),
    [view, scope],
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = useMemo(
    () => rows.filter(row => matches(row, normalizedQuery)),
    [rows, normalizedQuery],
  )

  if (view.status === 'loading') {
    return <p className={css.hint} data-local-status="loading">{t('local.loading')}</p>
  }
  if (view.status === 'error') {
    return (
      <div className={css.error} data-local-status="error" role="alert">
        <p className={css.errorTitle}>{t('local.error.title')}</p>
        <p className={css.errorDetail}>{t('local.error.detail')}</p>
        <button type="button" className={css.retry} onClick={() => { setReloadKey(key => key + 1) }}>
          {t('local.error.retry')}
        </button>
      </div>
    )
  }
  if (visible.length === 0) {
    return (
      <p className={css.hint} data-local-status="empty">
        {t(scope === 'local' ? 'local.empty' : 'installed.empty')}
      </p>
    )
  }

  return (
    <div className={css.panel} data-local-scope={scope}>
      <div className={css.panelHead}>
        <span className={css.count}>
          {t(scope === 'local' ? 'local.count' : 'installed.count', { count: String(visible.length) })}
        </span>
        <button
          type="button"
          className={css.reload}
          onClick={() => { setReloadKey(key => key + 1) }}
        >
          {t('local.reload')}
        </button>
      </div>
      <ul className={css.list}>
        {visible.map(row => (
          <PluginRowCard
            key={row.key}
            row={row}
            t={t}
            scope={scope}
            settingsTarget={settingsTarget}
            onConfigure={onConfigure}
          />
        ))}
      </ul>
    </div>
  )
}

/** One inventory row: identity, origin, enablement, phase, and its actions. */
function PluginRowCard({ row, t, scope, settingsTarget, onConfigure }: {
  readonly row: PluginRow
  readonly t: Translate
  readonly scope: LocalPluginsScope
  readonly settingsTarget: (row: PluginRow) => PluginSettingsTarget
  readonly onConfigure: (row: PluginRow) => void
}) {
  const target = settingsTarget(row)
  return (
    <li
      className={css.card}
      data-plugin-module={row.moduleName}
      data-plugin-origin={row.origin}
      data-enabled={row.enabled ? 'true' : 'false'}
    >
      <div className={css.cardMain}>
        <div className={css.cardIdentity}>
          <strong className={css.cardTitle} title={row.moduleName}>{row.name}</strong>
          <span className={css.cardModule} title={row.moduleName}>{row.moduleName}</span>
        </div>
        <div className={css.cardMeta}>
          <span className={css.tag} data-origin={row.origin}>
            {t(row.origin === 'local' ? 'local.origin.local' : 'local.origin.cloud')}
          </span>
          <span className={css.tag} data-enabled={row.enabled ? 'true' : 'false'}>
            {t(row.enabled ? 'local.state.enabled' : 'local.state.disabled')}
          </span>
          <span className={css.tag} data-phase={row.phase ?? 'none'}>
            {t(phaseLabelKey(row.phase))}
          </span>
        </div>
      </div>
      {scope === 'installed' && (
        <button
          type="button"
          className={css.settingsButton}
          disabled={!target.configurable}
          onClick={() => { onConfigure(row) }}
          title={target.configurable
            ? t('installed.settings.title')
            : t('installed.settings.unavailable')}
        >
          {t('installed.settings')}
        </button>
      )}
    </li>
  )
}
