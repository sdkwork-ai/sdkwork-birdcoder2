/**
 * The `sdkwork-deploy-site` tab body: one deployed site's observation,
 * management, release history and log views, read from the site facts the
 * conversation card opened with and refreshed through the generated clients.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { SegmentedTabs, StateDot, Tag, useClipboardCopy } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SdkworkDeploySite } from '@deepseek-ai/dsh-tool-sdkwork-deploy/types'
import { formatSiteTime, type DeploySiteDashboard, type DeploySiteTabParams, type SiteDeployment, type SiteRelease } from './deploySite.ts'
import type { NS } from './locales.ts'
import css from './DeploySitePanel.module.css'

/** What the panel body may read. */
export interface DeploySiteInjected {
  /** Read one site's live dashboard; rejects when the application read fails. */
  loadDashboard(appId: string, signal?: AbortSignal): Promise<DeploySiteDashboard>
}

/** The panel body's composed props. */
export type DeploySitePanelProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<DeploySiteInjected> & PropsLocale<typeof NS>

/** The panel's inner views. */
type SiteView = 'observability' | 'manage' | 'history' | 'logs'

/** One dashboard read's presentation state. */
type Snapshot =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly dashboard: DeploySiteDashboard }
  | { readonly phase: 'error'; readonly message: string }

/**
 * Render one deployed site's panel.
 * @param props - the tab it draws, its loader and the plugin's copy.
 * @returns the site header, view switch and the selected view.
 */
export function DeploySitePanel({ useTabInfo, loadDashboard, t }: DeploySitePanelProps): ReactNode {
  const { tab } = useTabInfo()
  const site = (tab.navigation.params as DeploySiteTabParams | undefined)?.site
  const [view, setView] = useState<SiteView>('observability')
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<Snapshot>({ phase: 'loading' })
  const [coverFailed, setCoverFailed] = useState(false)
  const copied = useClipboardCopy(site?.siteUrl ?? '')
  const appId = site?.appId
  useEffect(() => {
    if (appId === undefined) return
    const controller = new AbortController()
    setSnapshot({ phase: 'loading' })
    void loadDashboard(appId, controller.signal).then(
      (dashboard) => { if (!controller.signal.aborted) setSnapshot({ phase: 'ready', dashboard }) },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setSnapshot({ phase: 'error', message: error instanceof Error ? error.message : t('site.panel.error') })
      },
    )
    return () => { controller.abort() }
  }, [appId, revision, loadDashboard, t])
  if (site === undefined) {
    return <div className={css.panel} data-site-panel="missing"><p className={css.empty}>{t('site.panel.missing')}</p></div>
  }
  return <div className={css.panel} data-site-panel={site.appId}>
    <header className={css.header}>
      {site.coverUrl !== undefined && !coverFailed
        ? <img
          className={css.cover}
          src={site.coverUrl}
          alt={t('site.card.coverAlt', { name: site.appName })}
          onError={() => { setCoverFailed(true) }}
        />
        : <span className={css.mark} aria-hidden>{site.appName.trim().charAt(0).toUpperCase() || '?'}</span>}
      <span className={css.identity}>
        <span className={css.name}>{site.appName}</span>
        <span className={css.addressRow}>
          <span className={css.address} title={site.siteUrl}>{site.siteUrl ?? t('site.card.noAddress')}</span>
          {site.siteUrl === undefined ? null : <button
            type="button"
            className={css.linkButton}
            onClick={() => { copied.onCopy() }}
          >{copied.copied ? t('site.card.copied') : t('site.card.copy')}</button>}
        </span>
      </span>
      <Tag tone={site.appStatus === 'ACTIVE' || site.appStatus === undefined ? 'success' : 'neutral'}>
        {statusLabel(site.appStatus, t)}
      </Tag>
    </header>
    <div className={css.toolbar}>
      <SegmentedTabs
        size="sm"
        label={t('site.panel.views')}
        value={view}
        onChange={setView}
        items={[
          { value: 'observability', label: t('site.view.observability'), id: 'sdkwork-site-observability', panelId: 'sdkwork-site-panel' },
          { value: 'manage', label: t('site.view.manage'), id: 'sdkwork-site-manage', panelId: 'sdkwork-site-panel' },
          { value: 'history', label: t('site.view.history'), id: 'sdkwork-site-history', panelId: 'sdkwork-site-panel' },
          { value: 'logs', label: t('site.view.logs'), id: 'sdkwork-site-logs', panelId: 'sdkwork-site-panel' },
        ]}
      />
      <button type="button" className={css.refresh} onClick={() => { setRevision(value => value + 1) }}>
        {t('site.panel.refresh')}
      </button>
    </div>
    <div className={css.content} id="sdkwork-site-panel" role="tabpanel">
      {snapshot.phase === 'loading' ? <p className={css.empty}>{t('site.panel.loading')}</p> : null}
      {snapshot.phase === 'error' ? <p className={css.error}>{t('site.panel.error')}: {snapshot.message}</p> : null}
      {snapshot.phase === 'ready' ? <SiteViewBody view={view} site={site} dashboard={snapshot.dashboard} t={t} /> : null}
    </div>
  </div>
}

/** The selected view over one loaded dashboard. */
function SiteViewBody({ view, site, dashboard, t }: {
  view: SiteView
  site: SdkworkDeploySite
  dashboard: DeploySiteDashboard
  t: DeploySitePanelProps['t']
}): ReactNode {
  switch (view) {
    case 'observability': return <ObservabilityView site={site} dashboard={dashboard} t={t} />
    case 'manage': return <ManageView dashboard={dashboard} t={t} />
    case 'history': return <HistoryView dashboard={dashboard} t={t} />
    case 'logs': return <LogsView site={site} dashboard={dashboard} t={t} />
  }
}

/** Deployment and health numbers the site runs at, plus the newest deployments. */
function ObservabilityView({ site, dashboard, t }: {
  site: SdkworkDeploySite
  dashboard: DeploySiteDashboard
  t: DeploySitePanelProps['t']
}): ReactNode {
  const latestDeployment = dashboard.deployments[0]
  return <>
    <div className={css.metrics}>
      <Metric label={t('site.metric.status')} value={statusLabel(site.appStatus ?? dashboard.app.status, t)} />
      <Metric label={t('site.metric.environment')} value={site.environment} />
      <Metric label={t('site.metric.latestRelease')} value={site.version ?? dashboard.releases[0]?.version ?? t('site.value.none')} />
      <Metric label={t('site.metric.deployments')} value={String(dashboard.deployments.length)} />
    </div>
    <Section title={t('site.section.health')}>
      {dashboard.health.length === 0
        ? <p className={css.empty}>{t('site.empty.health')}</p>
        : dashboard.health.map((check, index) => <div className={css.row} key={check.id ?? `${check.checkUrl ?? index}`}>
          <StateDot state={check.status === 'HEALTHY' || check.status === 'UP' ? 'done' : check.status === undefined ? 'idle' : 'warning'} size={10} />
          <span className={css.rowMain}>{check.checkType ?? t('site.metric.health')}</span>
          <span className={css.rowMeta}>{check.checkUrl ?? t('site.value.none')}</span>
        </div>)}
    </Section>
    <Section title={t('site.section.deployments')}>
      {dashboard.deployments.length === 0
        ? <p className={css.empty}>{t('site.empty.deployments')}</p>
        : dashboard.deployments.slice(0, 5).map(row => (
          <DeploymentRow key={row.id} row={row} latest={row.id === latestDeployment?.id} t={t} />
        ))}
    </Section>
  </>
}

/** Application identity, hostnames and platform targets. */
function ManageView({ dashboard, t }: { dashboard: DeploySiteDashboard; t: DeploySitePanelProps['t'] }): ReactNode {
  const app = dashboard.app
  return <>
    <Section title={t('site.section.app')}>
      <InfoRow label={t('site.row.kind')} value={app.kind} />
      <InfoRow label={t('site.row.slug')} value={app.slug} />
      <InfoRow label={t('site.row.owner')} value={app.ownerType} />
      <InfoRow label={t('site.row.createdAt')} value={formatSiteTime(app.createdAt) ?? t('site.value.none')} />
      <InfoRow label={t('site.row.updatedAt')} value={formatSiteTime(app.updatedAt) ?? t('site.value.none')} />
    </Section>
    <Section title={t('site.section.domains')}>
      {dashboard.domains.length === 0
        ? <p className={css.empty}>{t('site.empty.domains')}</p>
        : dashboard.domains.map(row => <div className={css.row} key={row.hostname}>
          <Tag tone={row.bindingStatus === 'ACTIVE' ? 'success' : row.bindingStatus === 'FAILED' ? 'danger' : 'neutral'}>{row.bindingStatus}</Tag>
          <span className={css.rowMain}>{row.hostname}</span>
          <span className={css.rowMeta}>{row.kind} · {row.environment}</span>
        </div>)}
    </Section>
    <Section title={t('site.section.targets')}>
      {dashboard.targets.length === 0
        ? <p className={css.empty}>{t('site.empty.targets')}</p>
        : dashboard.targets.map(row => <div className={css.row} key={row.id}>
          <span className={css.rowMain}>{row.targetKey}</span>
          <span className={css.rowMeta}>{[row.platform, row.techStack, row.status].filter(value => value !== undefined && value !== '').join(' · ')}</span>
        </div>)}
    </Section>
  </>
}

/** Every deployment and release the app recorded. */
function HistoryView({ dashboard, t }: { dashboard: DeploySiteDashboard; t: DeploySitePanelProps['t'] }): ReactNode {
  return <>
    <Section title={t('site.section.deployments')}>
      {dashboard.deployments.length === 0
        ? <p className={css.empty}>{t('site.empty.deployments')}</p>
        : dashboard.deployments.map(row => <DeploymentRow key={row.id} row={row} t={t} />)}
    </Section>
    <Section title={t('site.section.releases')}>
      {dashboard.releases.length === 0
        ? <p className={css.empty}>{t('site.empty.releases')}</p>
        : dashboard.releases.map(row => <ReleaseRow key={row.id} row={row} t={t} />)}
    </Section>
  </>
}

/** The newest deployment's recorded facts. */
function LogsView({ site, dashboard, t }: {
  site: SdkworkDeploySite
  dashboard: DeploySiteDashboard
  t: DeploySitePanelProps['t']
}): ReactNode {
  const deployment = dashboard.deployments[0]
  return <>
    <Section title={t('site.section.latestDeployment')}>
      {deployment === undefined
        ? <p className={css.empty}>{t('site.empty.deployments')}</p>
        : <>
          <InfoRow label={t('site.log.id')} value={deployment.id} />
          <InfoRow label={t('site.log.status')} value={deployment.status} />
          <InfoRow label={t('site.log.kind')} value={deployment.kind ?? t('site.value.none')} />
          <InfoRow label={t('site.log.target')} value={deployment.target ?? t('site.value.none')} />
          <InfoRow label={t('site.log.startedAt')} value={formatSiteTime(deployment.startedAt) ?? t('site.value.none')} />
          <InfoRow label={t('site.log.completedAt')} value={formatSiteTime(deployment.completedAt) ?? t('site.value.none')} />
        </>}
    </Section>
    <Section title={t('site.section.app')}>
      <InfoRow label={t('site.log.appId')} value={site.appId} />
      <InfoRow label={t('site.log.environment')} value={site.environment} />
      <InfoRow label={t('site.log.releaseId')} value={site.releaseId ?? t('site.value.none')} />
      <InfoRow label={t('site.log.deploymentId')} value={site.deploymentId ?? t('site.value.none')} />
      {site.publishedBy === undefined ? null : <InfoRow label={t('site.log.publishedBy')} value={site.publishedBy} />}
      {site.sourceRecorded === undefined ? null : (
        <InfoRow
          label={t('site.log.sourceRecorded')}
          value={site.sourceRecorded ? t('site.value.yes') : t('site.value.no')}
        />
      )}
      {site.previousDeploymentId === undefined ? null : (
        <InfoRow label={t('site.log.previousDeployment')} value={site.previousDeploymentId} />
      )}
    </Section>
  </>
}

/** One deployment row: state, environment, identity and time. */
function DeploymentRow({ row, latest = false, t }: { row: SiteDeployment; latest?: boolean; t: DeploySitePanelProps['t'] }): ReactNode {
  return <div className={css.row} data-latest={latest ? '' : undefined}>
    <Tag tone={statusTone(row.status)}>{row.status}</Tag>
    <span className={css.rowMain}>{row.environment}</span>
    <span className={css.rowMeta}>{row.kind ?? row.target ?? row.id}</span>
    <span className={css.rowTime}>{formatSiteTime(row.startedAt ?? row.createdAt) ?? t('site.value.none')}</span>
  </div>
}

/** One release row: version, state and creation time. */
function ReleaseRow({ row, t }: { row: SiteRelease; t: DeploySitePanelProps['t'] }): ReactNode {
  return <div className={css.row}>
    <Tag tone={statusTone(row.status)}>{row.status}</Tag>
    <span className={css.rowMain}>{t('site.versionPrefix')}{row.version}</span>
    <span className={css.rowTime}>{formatSiteTime(row.createdAt) ?? t('site.value.none')}</span>
  </div>
}

/** One labelled section. */
function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return <section className={css.section}>
    <h3 className={css.sectionTitle}>{title}</h3>
    {children}
  </section>
}

/** One metric tile. */
function Metric({ label, value }: { label: string; value: string }): ReactNode {
  return <div className={css.metric}>
    <span className={css.metricLabel}>{label}</span>
    <span className={css.metricValue}>{value}</span>
  </div>
}

/** One label/value row. */
function InfoRow({ label, value }: { label: string; value: string }): ReactNode {
  return <div className={css.infoRow}>
    <span className={css.infoLabel}>{label}</span>
    <span className={css.infoValue}>{value}</span>
  </div>
}

/** The application's status in the plugin's copy. */
function statusLabel(status: string | undefined, t: DeploySitePanelProps['t']): string {
  const key = status === 'ACTIVE' ? 'site.status.running'
    : status === 'PAUSED' ? 'site.status.paused'
      : status === 'ARCHIVED' ? 'site.status.archived'
        : undefined
  return key === undefined ? t('site.status.unknown') : t(key)
}

/** The tag tone for one release or deployment status. */
function statusTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'SUCCEEDED' || status === 'ACTIVE' || status === 'PUBLISHED' || status === 'RELEASED') return 'success'
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger'
  if (status === 'PENDING' || status === 'RUNNING' || status === 'DEPLOYING') return 'warning'
  return 'neutral'
}
