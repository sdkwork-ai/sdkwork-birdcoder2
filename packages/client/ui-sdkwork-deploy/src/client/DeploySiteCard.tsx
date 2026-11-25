/**
 * The conversation card a `sdkwork_deploy_app` result renders: the published
 * site's name, address, environment and status, with a copy control and a click
 * that opens the site panel in the right Sidebar.
 *
 * The result's structured facts arrive through the tool's recorded presentation
 * metadata (`meta.deploy`), so the card never parses the model-facing text.
 */
import { useState, type ReactNode } from 'react'
import type { SdkworkDeploySite } from '@deepseek-ai/dsh-tool-sdkwork-deploy/types'
import { StateDot, Tag, useClipboardCopy } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DeployToolOutput } from '@deepseek-ai/dsh-tool-sdkwork-deploy'
import type { NS } from './locales.ts'
import css from './DeploySiteCard.module.css'

/** What the card may ask its owning plugin to do. */
export interface DeploySiteCardInjected {
  /** Open the site panel tab on the published site. */
  openSite(site: SdkworkDeploySite): void
}

/** The card's composed props. */
export type DeploySiteCardProps = ToolCallViewProps & PropsLocale<typeof NS> & InjectFace<DeploySiteCardInjected>

/**
 * Read the structured result the tool recorded for this card.
 * @param meta - the recorded tool presentation metadata, when it settled.
 * @returns the publish outcome, or undefined while the call runs or when an
 *   older result carries no metadata.
 */
export function readDeployOutput(meta: unknown): DeployToolOutput | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const deploy = (meta as { deploy?: unknown }).deploy
  if (typeof deploy !== 'object' || deploy === null) return undefined
  const record = deploy as Partial<DeployToolOutput>
  if (record.ok !== true && record.ok !== false) return undefined
  return record as DeployToolOutput
}

/**
 * Render one deploy call.
 * @param props - tool call state, copy and the panel opener.
 * @returns the running row, the published site card, or the reported failure.
 */
export function DeploySiteCard(props: DeploySiteCardProps): ReactNode {
  if (props.phase === 'preparing') return <RunningCard label={props.t('site.card.running')} />
  if (props.phase === 'start') return <RunningCard label={props.t('site.card.running')} />
  const output = readDeployOutput(props.block.meta)
  if (output?.ok === true && output.site !== undefined) {
    return <PublishedCard site={output.site} t={props.t} openSite={props.openSite} />
  }
  if (output?.ok === false) {
    return <FailedCard stage={output.stage} message={output.message} t={props.t} />
  }
  const detail = props.block.content.map(item => item.type === 'text' ? item.text : '').join('\n').trim()
  return <FailedCard message={detail === '' ? props.block.error?.code : detail} t={props.t} />
}

/** A call that has not settled yet. */
function RunningCard({ label }: { label: string }): ReactNode {
  return <div className={css.running} data-tool="sdkwork_deploy_app" data-state="running">
    <StateDot state="ongoing" size={14} />
    <span>{label}</span>
  </div>
}

/** The published site: mark, name, address, status and the panel affordance. */
function PublishedCard({ site, t, openSite }: {
  site: SdkworkDeploySite
  t: DeploySiteCardProps['t']
  openSite: DeploySiteCardInjected['openSite']
}): ReactNode {
  const { copied, onCopy } = useClipboardCopy(site.siteUrl ?? '')
  const [coverFailed, setCoverFailed] = useState(false)
  const initial = site.appName.trim().charAt(0).toUpperCase() || '?'
  const live = site.appStatus === undefined || site.appStatus === 'ACTIVE'
  return <button
    type="button"
    className={css.card}
    data-tool="sdkwork_deploy_app"
    data-state="published"
    aria-label={t('site.card.open', { name: site.appName })}
    onClick={() => { openSite(site) }}
  >
    {site.coverUrl !== undefined && !coverFailed
      ? <img
        className={css.cover}
        src={site.coverUrl}
        alt={t('site.card.coverAlt', { name: site.appName })}
        loading="lazy"
        onError={() => { setCoverFailed(true) }}
      />
      : <span className={css.mark} aria-hidden>{initial}</span>}
    <span className={css.body}>
      <span className={css.titleRow}>
        <span className={css.name}>{site.appName}</span>
        <Tag tone={live ? 'info' : 'neutral'}>{live ? t('site.card.public') : t('site.card.offline')}</Tag>
      </span>
      <span className={css.urlRow}>
        <span className={css.url}>{site.siteUrl ?? site.domain ?? t('site.card.noAddress')}</span>
        {site.domainDefault === true ? <span className={css.defaultDomain}>{t('site.card.defaultDomain')}</span> : null}
        {site.siteUrl === undefined ? null : <span
          role="button"
          tabIndex={0}
          className={css.copy}
          aria-label={t('site.card.copy')}
          onClick={(event) => { event.stopPropagation(); onCopy() }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            onCopy()
          }}
        >{copied ? t('site.card.copied') : t('site.card.copy')}</span>}
      </span>
      <span className={css.meta}>
        <StoreStatusLabel status={site.appStatus} t={t} />
        <span className={css.separator} aria-hidden>·</span>
        <span>{site.environment}</span>
        {site.version === undefined ? null : <>
          <span className={css.separator} aria-hidden>·</span>
          <span>{t('site.versionPrefix')}{site.version}</span>
        </>}
      </span>
    </span>
    <span className={css.chevron} aria-hidden>›</span>
  </button>
}

/** The reported failure: the stopping stage and its detail. */
function FailedCard({ stage, message, t }: {
  stage?: string
  message?: string
  t: DeploySiteCardProps['t']
}): ReactNode {
  return <div className={css.failure} data-tool="sdkwork_deploy_app" data-state="error">
    <StateDot state="error" size={10} />
    <span className={css.failureText}>
      <span className={css.failureTitle}>{t('site.card.failed')}{stage === undefined ? '' : ` · ${stage}`}</span>
      {message === undefined ? null : <span className={css.failureDetail}>{message}</span>}
    </span>
  </div>
}

/** The application's live status in the card's own copy. */
function StoreStatusLabel({ status, t }: { status: string | undefined; t: DeploySiteCardProps['t'] }): ReactNode {
  const key = status === 'ACTIVE' ? 'site.status.running'
    : status === 'PAUSED' ? 'site.status.paused'
      : status === 'ARCHIVED' ? 'site.status.archived'
        : undefined
  return <span>{key === undefined ? t('site.status.unknown') : t(key)}</span>
}
