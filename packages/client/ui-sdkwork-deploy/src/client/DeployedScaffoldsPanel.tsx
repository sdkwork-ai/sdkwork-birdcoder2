/**
 * Caller-owned app-scaffold ledger inside the settings-menu drawer's
 * "我的应用脚手架" tab.
 *
 * It reads the caller's own scaffold listings through the deployments app API
 * (`app.scaffolds.list` is already account-scoped) and narrows that set
 * by listing status. The whole set is loaded first so a chip's count and the
 * rows it selects come from the same set. The latest semantic version each
 * listing points at is a side read: a failed version read leaves the row
 * listed without a number instead of failing the tab.
 *
 * The tab is read-only: publishing and installing scaffolds stay on the app
 * scaffold center the project row menus open.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ApplicationScaffoldResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployHostClients } from './deployHost.ts'
import { DeployedLedgerError } from './DeployedLedgerError.tsx'
import { DeployedLedgerToolbar } from './DeployedLedgerToolbar.tsx'
import { DeployedListSkeleton } from './DeployedListSkeleton.tsx'
import { formatUpdatedAt, initialOf, messageOf } from './deployedApps.ts'
import type { DeployKey } from './locales.ts'
import {
  OWNED_TEMPLATES_PAGE_SIZE,
  SCAFFOLD_STATUS_LABEL_KEYS,
  countScaffoldStatusFacets,
  filterScaffoldsByStatus,
  hasInstallCount,
  loadOwnedScaffolds,
  resolveScaffoldVersions,
  sortScaffoldsByUpdatedAt,
  type ScaffoldStatus,
} from './deployedScaffolds.ts'
import css from './DeployedAppsDialog.module.css'

/** Versions read per listing when resolving its latest semantic version. */
const SCAFFOLD_VERSION_PAGE_SIZE = 50

/** Props for the deployed-scaffolds panel. */
export interface DeployedScaffoldsPanelProps {
  /** Host-constructed deploy/drive clients (the list only reads the deploy half). */
  readonly clients: DeployHostClients
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: Translate<DeployKey>
}

/**
 * Status → badge tone. Published reads as live, the two in-flight states share
 * the pending tone, a rejected listing reads as an error, and a disabled one
 * recedes.
 */
function statusTone(status: ScaffoldStatus): string {
  if (status === 'PUBLISHED') return css.statusActive
  if (status === 'REJECTED') return css.statusError
  if (status === 'DISABLED') return css.statusMuted
  return css.statusPending
}

/**
 * Render the caller's app scaffolds with their status facet.
 * @param props - the host clients and the locale seat.
 * @returns the tab's ledger content.
 */
export function DeployedScaffoldsPanel({ clients, t }: DeployedScaffoldsPanelProps): ReactNode {
  const [scaffolds, setScaffolds] = useState<ApplicationScaffoldResponse[] | undefined>(undefined)
  const [versions, setVersions] = useState<Readonly<Record<string, string>>>({})
  const [truncated, setTruncated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [statuses, setStatuses] = useState<ReadonlySet<ScaffoldStatus>>(() => new Set<ScaffoldStatus>())
  const [reloadKey, setReloadKey] = useState(0)

  /** Reload the caller's complete set; the previous rows stay on failure. */
  const reload = useCallback((): void => { setReloadKey(value => value + 1) }, [])

  useEffect(() => {
    let active = true
    // Closing the drawer aborts the in-flight page and version reads; without
    // it a large account keeps resolving versions after the tab is gone.
    const controller = new AbortController()
    setBusy(true)
    setError(undefined)
    void (async () => {
      try {
        const snapshot = await loadOwnedScaffolds(page => clients.deployClient.app.scaffolds.list({
          page,
          pageSize: OWNED_TEMPLATES_PAGE_SIZE,
        }, { signal: controller.signal }))
        if (!active) return
        setScaffolds(snapshot.items)
        setTruncated(snapshot.truncated)
        // The listing moves to its new set before the version reads start, so
        // a slow version read never delays the rows the operator opened for.
        setVersions({})
        setBusy(false)
        const resolved = await resolveScaffoldVersions(snapshot.items, (templateId, signal) =>
          clients.deployClient.app.scaffolds.versions.list(templateId, {
            page: 1,
            pageSize: SCAFFOLD_VERSION_PAGE_SIZE,
          }, { signal }), { signal: controller.signal })
        if (active) setVersions(resolved)
      } catch (cause) {
        if (!active) return
        setError(messageOf(cause))
        setBusy(false)
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [clients, reloadKey])

  const facets = useMemo(
    () => countScaffoldStatusFacets(scaffolds ?? []).filter(facet => facet.count > 0),
    [scaffolds],
  )
  const visible = useMemo(
    () => filterScaffoldsByStatus(sortScaffoldsByUpdatedAt(scaffolds ?? []), statuses),
    [scaffolds, statuses],
  )

  const toggleStatus = (status: ScaffoldStatus): void => {
    setStatuses((current) => {
      const next = new Set(current)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }
  const clearFilters = (): void => { setStatuses(new Set<ScaffoldStatus>()) }

  const total = scaffolds?.length ?? 0

  return (
    <div className={css.workspace}>
      <DeployedLedgerToolbar
        label={t('deployments.scaffolds.filterLabel')}
        chips={facets.map(facet => ({
          id: facet.status,
          label: t(SCAFFOLD_STATUS_LABEL_KEYS[facet.status]),
          count: facet.count,
          pressed: statuses.has(facet.status),
          onToggle: () => { toggleStatus(facet.status) },
        }))}
        clear={statuses.size > 0 ? { label: t('deployments.clearFilters'), onClick: clearFilters } : undefined}
        summary={t('deployments.shownCount', { shown: visible.length, total })}
        busy={busy}
        refreshLabel={t('deployments.refresh')}
        onRefresh={reload}
      />

      {error !== undefined && (
        <DeployedLedgerError
          message={t('deployments.scaffolds.loadFailed', { message: error })}
          retryLabel={t('deployments.retry')}
          onRetry={reload}
        />
      )}
      {truncated && <p className={css.note}>{t('deployments.scaffolds.truncated', { count: total })}</p>}

      <div className={css.body} aria-busy={busy}>
        {scaffolds === undefined
          ? (
            // A failed first read keeps its explanation in the banner above;
            // replacing it with a placeholder or an empty state would read as
            // "still loading" or "nothing here".
            error === undefined
              ? <DeployedListSkeleton label={t('deployments.scaffolds.loading')} rows={3} />
              : null
          )
          : scaffolds.length === 0
            ? (
              <div className={css.empty}>
                <p className={css.emptyTitle}>{t('deployments.scaffolds.empty')}</p>
                <p className={css.emptyHint}>{t('deployments.scaffolds.emptyHint')}</p>
              </div>
            )
            : visible.length === 0
              ? (
                <div className={css.empty}>
                  <p className={css.emptyTitle}>{t('deployments.scaffolds.filteredEmpty')}</p>
                  <Button size="sm" onClick={clearFilters}>{t('deployments.clearFilters')}</Button>
                </div>
              )
              : (
                <ul className={css.list}>
                  {visible.map((scaffold) => {
                    const version = versions[scaffold.id]
                    return (
                      <li key={scaffold.id} className={css.row}>
                        <span className={css.avatar} aria-hidden="true">{initialOf(scaffold.displayName)}</span>
                        <span className={css.main}>
                          <span className={css.name} title={scaffold.displayName}>{scaffold.displayName}</span>
                          <span className={css.slug} title={scaffold.templateKey}>{scaffold.templateKey}</span>
                          {scaffold.summary.trim() !== '' && (
                            <span className={css.summaryLine} title={scaffold.summary}>{scaffold.summary}</span>
                          )}
                          <span className={css.meta}>
                            <span className={`${css.status} ${statusTone(scaffold.status)}`}>
                              {t(SCAFFOLD_STATUS_LABEL_KEYS[scaffold.status])}
                            </span>
                            {version !== undefined && (
                              <span className={css.version}>{t('deployments.scaffolds.version', { version })}</span>
                            )}
                            {hasInstallCount(scaffold.installCount) && (
                              <span className={css.installs}>
                                {t('deployments.scaffolds.installs', { count: scaffold.installCount })}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className={css.side}>
                          <span className={css.updated}>
                            {t('deployments.updatedAt', { time: formatUpdatedAt(scaffold.updatedAt) })}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
      </div>
    </div>
  )
}
