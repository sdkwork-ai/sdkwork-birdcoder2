/**
 * The Plugin Market panel: the `dshmarket` plugin's own market page, rendered
 * inside the Plugins tab ahead of this application's cloud catalog.
 *
 * Three faces, decided by the two facts the page already holds — whether the
 * market published its `market` control, and what the plugin store read says
 * about this deployment:
 *
 * - the control is present: the market's panel owns the viewport (its own
 *   search, categories, install dialog, updates, and diagnostics). This page
 *   draws no chrome around it and duplicates none of it;
 * - the bundle is not installed: an install affordance that runs the same
 *   installation pipeline the local plugin views use, plus the way back to the
 *   cloud catalog;
 * - the bundle is installed but its client half has not loaded (a page load
 *   predates the install): a reload prompt, because only the next page load
 *   asks the host for the plugin's browser bundle.
 *
 * The panel is deliberately absent from the busiest states: a deployment that
 * manages no profile shows why, and never offers a write it cannot perform.
 */
import type { ReactNode } from 'react'
import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'
import { MarketsIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import type { MarketControl } from './marketPanel.ts'
import { PluginInstallDialog } from './PluginInstallDialog.tsx'
import type { InstallSession, PluginReadState, PluginStore } from './pluginStore.ts'
import css from './MarketsPage.module.css'

/** The npm package that provides the plugin market. */
export const PLUGIN_MARKET_PACKAGE = 'dshmarket'

/** Injected business data for the Plugin Market panel. */
export interface PluginMarketPanelInjected {
  /** Translate seat of the markets namespace. */
  t: (key: MarketsKey, params?: Record<string, string>) => string
  /** The control published by the market plugin's client half, when it loaded. */
  control: MarketControl | undefined
  /** The plugin store the install affordance runs through. */
  store: PluginStore
  /** The store read that decides which affordance applies. */
  read: PluginReadState
  /** The open install session, when the affordance started one. */
  install: InstallSession | undefined
  /** Reload the page so a just-installed client half loads. */
  reload: () => void
  /** Switch the Plugins tab to this application's own cloud catalog. */
  onOpenCloud: () => void
  /** Switch the Plugins tab to the installed roster (where a bundle is switched on). */
  onOpenInstalled: () => void
}

/** Full component props. */
export type PluginMarketPanelProps = PluginMarketPanelInjected

/** An install session that has not settled yet. */
function busy(install: InstallSession | undefined): boolean {
  if (install === undefined) return false
  return install.phase === 'checking' || install.phase === 'installing'
    || install.phase === 'cancelling' || install.phase === 'applying'
}

/**
 * The market bundle this deployment holds, when it holds one.
 * @param read - the store's current read.
 * @returns the bundle entry, or undefined before the read settles or when the
 * package is absent.
 */
function marketBundleOf(read: PluginReadState): BundleInfo | undefined {
  if (read.status !== 'ready') return undefined
  return read.snapshot.bundles.find(bundle => bundle.name === PLUGIN_MARKET_PACKAGE)
}

/**
 * Start installing the market through the plugin store: open a session on the
 * package, then run it (the store's one Install action inspects the spec and
 * starts the pnpm run).
 * @param store - the store every install goes through.
 */
function startMarketInstall(store: PluginStore): void {
  store.openInstall(PLUGIN_MARKET_PACKAGE)
  void store.runInstall()
}

/**
 * Render the Plugin Market panel.
 * @param props - see {@link PluginMarketPanelProps}.
 * @returns the panel element tree.
 */
export function PluginMarketPanel({
  t, control, store, read, install, reload, onOpenCloud, onOpenInstalled,
}: PluginMarketPanelProps) {
  // The market's own page owns everything below the tab: no shared chrome is
  // drawn around it, so its header and this page's sub-tabs never compete.
  if (control !== undefined) {
    return (
      <div className={css.marketEmbed} data-plugin-market="live">
        {control.render({ surface: 'plugins' }) as ReactNode}
      </div>
    )
  }

  if (read.status === 'loading') {
    return (
      <div className={css.empty} data-plugin-market="loading">
        <div className={css.emptyIconTile}>
          <MarketsIcon size={28} />
        </div>
        <p className={css.emptyTitle}>{t('market.loading')}</p>
      </div>
    )
  }

  if (read.status === 'error') {
    return (
      <div className={css.empty} data-plugin-market="error">
        <div className={css.emptyIconTile}>
          <MarketsIcon size={28} />
        </div>
        <p className={css.emptyTitle}>{t('market.error.title')}</p>
        <p className={css.emptyDetail}>{t('market.error.detail')}</p>
        <button type="button" className={css.emptyAction} onClick={() => { void store.refresh().catch(() => {}) }}>
          {t('market.error.retry')}
        </button>
      </div>
    )
  }

  // Installed on disk, but the browser bundle this page would render was not
  // part of the page load that started here: the next load asks for it.
  const installed = marketBundleOf(read)
  if (installed !== undefined) {
    // Selected or not decides which ask is honest. A deselected bundle (for
    // example switched off from the installed roster) never loads on reload,
    // so the person is sent to the switch instead of told to refresh.
    if (installed.enabled === false) {
      return (
        <div className={css.empty} data-plugin-market="disabled">
          <div className={css.emptyIconTile}>
            <MarketsIcon size={28} />
          </div>
          <p className={css.emptyTitle}>{t('market.disabled.title')}</p>
          <p className={css.emptyDetail}>{t('market.disabled.detail')}</p>
          <button type="button" className={css.emptyAction} data-plugin-market-enable onClick={onOpenInstalled}>
            {t('market.disabled.action')}
          </button>
        </div>
      )
    }
    return (
      <div className={css.empty} data-plugin-market="pending">
        <div className={css.emptyIconTile}>
          <MarketsIcon size={28} />
        </div>
        <p className={css.emptyTitle}>{t('market.pending.title')}</p>
        <p className={css.emptyDetail}>{t('market.pending.detail')}</p>
        <button type="button" className={css.emptyAction} data-plugin-market-reload onClick={reload}>
          {t('market.pending.action')}
        </button>
      </div>
    )
  }

  const installing = busy(install)
  const canInstall = read.snapshot.managementAvailable && !installing
  return (
    <div className={css.empty} data-plugin-market="missing">
      <div className={css.emptyIconTile}>
        <MarketsIcon size={28} />
      </div>
      <p className={css.emptyTitle}>{t('market.missing.title')}</p>
      <p className={css.emptyDetail}>{t('market.missing.detail')}</p>
      {!read.snapshot.managementAvailable && (
        <p className={css.emptyDetail} data-plugin-market-unmanaged>{t('market.missing.unmanaged')}</p>
      )}
      <div className={css.emptyActions}>
        <button
          type="button"
          className={css.emptyAction}
          data-plugin-market-install
          disabled={!canInstall}
          onClick={() => { startMarketInstall(store) }}
        >
          {installing ? t('market.missing.installing') : t('market.missing.action')}
        </button>
        <button
          type="button"
          className={css.emptySecondary}
          data-plugin-market-cloud
          onClick={onOpenCloud}
        >
          {t('market.missing.cloud')}
        </button>
      </div>
    </div>
  )
}

/**
 * The install dialog the affordance above opens. Kept beside the panel because
 * the two are one flow: the panel starts a session on the store and this draws
 * its progress, and neither is mounted on the local plugin views (which own
 * their own dialog instance).
 */
export function PluginMarketInstallDialog({
  t, store, install,
}: Pick<PluginMarketPanelProps, 't' | 'store' | 'install'>) {
  if (install === undefined) return null
  return <PluginInstallDialog t={t} store={store} install={install} />
}
