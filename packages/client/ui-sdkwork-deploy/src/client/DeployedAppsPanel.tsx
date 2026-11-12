/**
 * Deployed-applications ledger inside the settings-menu drawer's "我的应用"
 * tab.
 *
 * It reads the caller's own `deploy_app` rows through the deployments app API
 * (`listApps` under the `USER` ownership scope — the server's ownership gate
 * remains the authority; the scope only narrows it), and narrows that set by
 * application kind. The kind facet is local because `apps.list` accepts no
 * type parameter, and the whole caller-owned set is loaded first so a chip's
 * count and the rows it selects come from the same set. The list is read-only:
 * publishing and the rest of the app lifecycle stay on the console and the
 * session-header flows.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppKind, AppResponse, AppStatus } from '@sdkwork/deployments-app-sdk'
import { createDeployAppPublishingService } from '@sdkwork/deployments-pc-console-publishing'
import type { DeployHostClients } from './deployHost.ts'
import { DeployedLedgerError } from './DeployedLedgerError.tsx'
import { DeployedLedgerToolbar } from './DeployedLedgerToolbar.tsx'
import { DeployedListSkeleton } from './DeployedListSkeleton.tsx'
import {
  APP_KIND_LABEL_KEYS,
  APP_STATUS_LABEL_KEYS,
  OWNED_APPS_PAGE_SIZE,
  countAppKindFacets,
  filterAppsByKind,
  formatUpdatedAt,
  initialOf,
  loadOwnedApps,
  messageOf,
  sortAppsByUpdatedAt,
} from './deployedApps.ts'
import type { DeployKey } from './locales.ts'
import css from './DeployedAppsDialog.module.css'

/** Props for the deployed-applications panel. */
export interface DeployedAppsPanelProps {
  /** Host-constructed deploy/drive clients (the list only reads the deploy half). */
  readonly clients: DeployHostClients
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: Translate<DeployKey>
}

/**
 * Status → badge tone. The six contract statuses split into four tones so the
 * badge never repeats the status name twice: running, failed, frozen/retired,
 * and the pre-publish states.
 */
function statusTone(status: AppStatus): string {
  if (status === 'ACTIVE') return css.statusActive
  if (status === 'FAILED') return css.statusError
  if (status === 'PAUSED' || status === 'ARCHIVED') return css.statusMuted
  return css.statusPending
}

/**
 * Render the caller's deployed applications with their kind facet.
 * @param props - the host clients and the locale seat.
 * @returns the drawer's ledger content.
 */
export function DeployedAppsPanel({ clients, t }: DeployedAppsPanelProps): ReactNode {
  const service = useMemo(() => createDeployAppPublishingService(clients), [clients])
  const [apps, setApps] = useState<AppResponse[] | undefined>(undefined)
  const [truncated, setTruncated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [kinds, setKinds] = useState<ReadonlySet<AppKind>>(() => new Set<AppKind>())
  const [reloadKey, setReloadKey] = useState(0)

  /** Reload the caller's complete owned set; the previous rows stay on failure. */
  const reload = useCallback((): void => { setReloadKey(value => value + 1) }, [])

  useEffect(() => {
    let active = true
    setBusy(true)
    setError(undefined)
    void loadOwnedApps(page => service.listApps({
      page,
      pageSize: OWNED_APPS_PAGE_SIZE,
      scope: 'USER',
    })).then((snapshot) => {
      if (!active) return
      setApps(snapshot.items)
      setTruncated(snapshot.truncated)
    }).catch((cause) => {
      if (active) setError(messageOf(cause))
    }).finally(() => {
      if (active) setBusy(false)
    })
    return () => { active = false }
  }, [reloadKey, service])

  const facets = useMemo(
    () => countAppKindFacets(apps ?? []).filter(facet => facet.count > 0),
    [apps],
  )
  const visible = useMemo(
    () => filterAppsByKind(sortAppsByUpdatedAt(apps ?? []), kinds),
    [apps, kinds],
  )

  const toggleKind = (kind: AppKind): void => {
    setKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }
  const clearFilters = (): void => { setKinds(new Set<AppKind>()) }

  const total = apps?.length ?? 0

  return (
    <div className={css.workspace}>
      <DeployedLedgerToolbar
        label={t('deployments.filterLabel')}
        chips={facets.map(facet => ({
          id: facet.appKind,
          label: t(APP_KIND_LABEL_KEYS[facet.appKind]),
          count: facet.count,
          pressed: kinds.has(facet.appKind),
          onToggle: () => { toggleKind(facet.appKind) },
        }))}
        clear={kinds.size > 0 ? { label: t('deployments.clearFilters'), onClick: clearFilters } : undefined}
        summary={t('deployments.shownCount', { shown: visible.length, total })}
        busy={busy}
        refreshLabel={t('deployments.refresh')}
        onRefresh={reload}
      />

      {error !== undefined && (
        <DeployedLedgerError
          message={t('deployments.loadFailed', { message: error })}
          retryLabel={t('deployments.retry')}
          onRetry={reload}
        />
      )}
      {truncated && <p className={css.note}>{t('deployments.truncated', { count: total })}</p>}

      <div className={css.body} aria-busy={busy}>
        {apps === undefined
          ? (
            // A failed first read keeps its explanation in the banner above;
            // replacing it with a placeholder or an empty state would read as
            // "still loading" or "nothing here".
            error === undefined
              ? <DeployedListSkeleton label={t('deployments.loading')} />
              : null
          )
          : apps.length === 0
            ? (
              <div className={css.empty}>
                <p className={css.emptyTitle}>{t('deployments.empty')}</p>
                <p className={css.emptyHint}>{t('deployments.emptyHint')}</p>
              </div>
            )
            : visible.length === 0
              ? (
                <div className={css.empty}>
                  <p className={css.emptyTitle}>{t('deployments.filteredEmpty')}</p>
                  <Button size="sm" onClick={clearFilters}>{t('deployments.clearFilters')}</Button>
                </div>
              )
              : (
                <ul className={css.list}>
                  {visible.map(app => (
                    <li key={app.id} className={css.row}>
                      <span className={css.avatar} aria-hidden="true">{initialOf(app.name)}</span>
                      <span className={css.main}>
                        <span className={css.name} title={app.name}>{app.name}</span>
                        <span className={css.slug} title={app.slug}>{app.slug}</span>
                        <span className={css.meta}>
                          <span className={css.kind}>{t(APP_KIND_LABEL_KEYS[app.appKind])}</span>
                          <span className={`${css.status} ${statusTone(app.appStatus)}`}>
                            {t(APP_STATUS_LABEL_KEYS[app.appStatus])}
                          </span>
                          {app.latestReleaseTag !== undefined && (
                            <span className={css.version}>{app.latestReleaseTag}</span>
                          )}
                        </span>
                      </span>
                      <span className={css.side}>
                        <span className={css.updated}>
                          {t('deployments.updatedAt', { time: formatUpdatedAt(app.updatedAt) })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
      </div>
    </div>
  )
}
