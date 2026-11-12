/**
 * Caller-owned app-template ledger inside the settings-menu drawer's
 * "我的应用模板" tab.
 *
 * It reads the caller's own template listings through the deployments app API
 * (`template.appTemplates.list` is already account-scoped) and narrows that set
 * by listing status. The whole set is loaded first so a chip's count and the
 * rows it selects come from the same set. The latest semantic version each
 * listing points at is a side read: a failed version read leaves the row
 * listed without a number instead of failing the tab.
 *
 * The tab is read-only: publishing and installing templates stay on the app
 * template center the project row menus open.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { AppTemplateResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployHostClients } from './deployHost.ts'
import { DeployedLedgerError } from './DeployedLedgerError.tsx'
import { DeployedLedgerToolbar } from './DeployedLedgerToolbar.tsx'
import { DeployedListSkeleton } from './DeployedListSkeleton.tsx'
import { formatUpdatedAt, initialOf, messageOf } from './deployedApps.ts'
import type { DeployKey } from './locales.ts'
import {
  OWNED_TEMPLATES_PAGE_SIZE,
  TEMPLATE_STATUS_LABEL_KEYS,
  countTemplateStatusFacets,
  filterTemplatesByStatus,
  hasInstallCount,
  loadOwnedTemplates,
  resolveTemplateVersions,
  sortTemplatesByUpdatedAt,
  type TemplateStatus,
} from './deployedTemplates.ts'
import css from './DeployedAppsDialog.module.css'

/** Versions read per listing when resolving its latest semantic version. */
const TEMPLATE_VERSION_PAGE_SIZE = 50

/** Props for the deployed-templates panel. */
export interface DeployedTemplatesPanelProps {
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
function statusTone(status: TemplateStatus): string {
  if (status === 'PUBLISHED') return css.statusActive
  if (status === 'REJECTED') return css.statusError
  if (status === 'DISABLED') return css.statusMuted
  return css.statusPending
}

/**
 * Render the caller's app templates with their status facet.
 * @param props - the host clients and the locale seat.
 * @returns the tab's ledger content.
 */
export function DeployedTemplatesPanel({ clients, t }: DeployedTemplatesPanelProps): ReactNode {
  const [templates, setTemplates] = useState<AppTemplateResponse[] | undefined>(undefined)
  const [versions, setVersions] = useState<Readonly<Record<string, string>>>({})
  const [truncated, setTruncated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [statuses, setStatuses] = useState<ReadonlySet<TemplateStatus>>(() => new Set<TemplateStatus>())
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
        const snapshot = await loadOwnedTemplates(page => clients.deployClient.template.appTemplates.list({
          page,
          pageSize: OWNED_TEMPLATES_PAGE_SIZE,
        }, { signal: controller.signal }))
        if (!active) return
        setTemplates(snapshot.items)
        setTruncated(snapshot.truncated)
        // The listing moves to its new set before the version reads start, so
        // a slow version read never delays the rows the operator opened for.
        setVersions({})
        setBusy(false)
        const resolved = await resolveTemplateVersions(snapshot.items, (templateId, signal) =>
          clients.deployClient.template.appTemplateVersions.list(templateId, {
            page: 1,
            pageSize: TEMPLATE_VERSION_PAGE_SIZE,
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
    () => countTemplateStatusFacets(templates ?? []).filter(facet => facet.count > 0),
    [templates],
  )
  const visible = useMemo(
    () => filterTemplatesByStatus(sortTemplatesByUpdatedAt(templates ?? []), statuses),
    [templates, statuses],
  )

  const toggleStatus = (status: TemplateStatus): void => {
    setStatuses((current) => {
      const next = new Set(current)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }
  const clearFilters = (): void => { setStatuses(new Set<TemplateStatus>()) }

  const total = templates?.length ?? 0

  return (
    <div className={css.workspace}>
      <DeployedLedgerToolbar
        label={t('deployments.templates.filterLabel')}
        chips={facets.map(facet => ({
          id: facet.status,
          label: t(TEMPLATE_STATUS_LABEL_KEYS[facet.status]),
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
          message={t('deployments.templates.loadFailed', { message: error })}
          retryLabel={t('deployments.retry')}
          onRetry={reload}
        />
      )}
      {truncated && <p className={css.note}>{t('deployments.templates.truncated', { count: total })}</p>}

      <div className={css.body} aria-busy={busy}>
        {templates === undefined
          ? (
            // A failed first read keeps its explanation in the banner above;
            // replacing it with a placeholder or an empty state would read as
            // "still loading" or "nothing here".
            error === undefined
              ? <DeployedListSkeleton label={t('deployments.templates.loading')} rows={3} />
              : null
          )
          : templates.length === 0
            ? (
              <div className={css.empty}>
                <p className={css.emptyTitle}>{t('deployments.templates.empty')}</p>
                <p className={css.emptyHint}>{t('deployments.templates.emptyHint')}</p>
              </div>
            )
            : visible.length === 0
              ? (
                <div className={css.empty}>
                  <p className={css.emptyTitle}>{t('deployments.templates.filteredEmpty')}</p>
                  <Button size="sm" onClick={clearFilters}>{t('deployments.clearFilters')}</Button>
                </div>
              )
              : (
                <ul className={css.list}>
                  {visible.map((template) => {
                    const version = versions[template.id]
                    return (
                      <li key={template.id} className={css.row}>
                        <span className={css.avatar} aria-hidden="true">{initialOf(template.displayName)}</span>
                        <span className={css.main}>
                          <span className={css.name} title={template.displayName}>{template.displayName}</span>
                          <span className={css.slug} title={template.templateKey}>{template.templateKey}</span>
                          {template.summary.trim() !== '' && (
                            <span className={css.summaryLine} title={template.summary}>{template.summary}</span>
                          )}
                          <span className={css.meta}>
                            <span className={`${css.status} ${statusTone(template.status)}`}>
                              {t(TEMPLATE_STATUS_LABEL_KEYS[template.status])}
                            </span>
                            {version !== undefined && (
                              <span className={css.version}>{t('deployments.templates.version', { version })}</span>
                            )}
                            {hasInstallCount(template.installCount) && (
                              <span className={css.installs}>
                                {t('deployments.templates.installs', { count: template.installCount })}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className={css.side}>
                          <span className={css.updated}>
                            {t('deployments.updatedAt', { time: formatUpdatedAt(template.updatedAt) })}
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
