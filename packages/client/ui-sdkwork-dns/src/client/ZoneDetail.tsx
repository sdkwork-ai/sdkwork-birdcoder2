/**
 * One root domain's management surface inside the domain dialog: the zone
 * header (status, counts, back), the subdomain tab (ownership verification and
 * row deletion), and the DNS resolution tab (synced records plus the
 * create/pause/resume/delete operations). The component owns viewing state and
 * calls the generated deployments client handed down by `DnsWorkspace`; it
 * never constructs a client or reads the environment.
 */
import { useCallback, useEffect, useState, type SyntheticEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Button, Drawer, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CreateDomainDnsRecordRequest, DomainDnsRecordResponse, DomainHostnameResponse,
  DomainVerifyResponse, DomainZoneResponse, SdkworkDeployAppClient,
} from '@sdkwork/deployments-app-sdk'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import {
  errorText, formatTimestamp, normalizeRecordHost, normalizeRelativeName, parsePriority, parseTtl,
  recordTypeHasPriority,
} from './dnsView.ts'
import type { DnsKey } from './locales.ts'
import css from './DnsModal.module.css'

/** How a failed operation reads: the wire message when present, a typed fallback otherwise. */
export interface Failure {
  message: string
  fallback: DnsKey
}

/**
 * Build a failure fact from a rejected operation.
 * @param error - the rejected value.
 * @param fallback - locale key used when the rejection carries no message.
 * @returns the failure fact.
 */
export function readFailure(error: unknown, fallback: DnsKey): Failure {
  return { message: errorText(error), fallback }
}

/** Record types the management plane accepts. */
const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'CAA'] as const
type RecordType = (typeof RECORD_TYPES)[number]

/** Resolution-record draft (all fields are strings until the request is built). */
interface RecordDraft {
  type: RecordType
  host: string
  value: string
  ttl: string
  priority: string
}

const EMPTY_RECORD: RecordDraft = { type: RECORD_TYPES[0], host: '', value: '', ttl: '', priority: '' }

/** Outcome of one ownership-verification attempt. */
interface VerificationState {
  hostname: string
  result: DomainVerifyResponse
}

/** Props handed down by the zone list. */
export interface ZoneDetailProps {
  client: SdkworkDeployAppClient
  zone: DomainZoneResponse
  t: Translate<DnsKey>
  /** Return to the zone list (the caller reloads it). */
  onBack: () => void
  /** The zone header changed (status toggle) — the caller updates its selection. */
  onZoneChanged: (zone: DomainZoneResponse) => void
}

/**
 * Render one root domain's hostname and DNS-record management surface.
 * @param props - the client, the zone, the locale seat, and the navigation callbacks.
 * @returns the zone detail element tree.
 */
export function ZoneDetail({ client, zone, t, onBack, onZoneChanged }: ZoneDetailProps): ReactNode {
  const [tab, setTab] = useState<'hostnames' | 'records'>('hostnames')
  const [hostnames, setHostnames] = useState<readonly DomainHostnameResponse[] | undefined>(undefined)
  const [records, setRecords] = useState<readonly DomainDnsRecordResponse[] | undefined>(undefined)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'hostname' | 'record'; id: string } | undefined>(undefined)
  const [verification, setVerification] = useState<VerificationState | undefined>(undefined)
  const [syncMessage, setSyncMessage] = useState<string | undefined>(undefined)
  const [hostnameForm, setHostnameForm] = useState(false)
  const [hostnameDraft, setHostnameDraft] = useState('')
  const [hostnameError, setHostnameError] = useState<DnsKey | undefined>(undefined)
  const [hostnameFailure, setHostnameFailure] = useState<Failure | undefined>(undefined)
  const [recordForm, setRecordForm] = useState(false)
  const [recordDraft, setRecordDraft] = useState<RecordDraft>(EMPTY_RECORD)
  const [recordError, setRecordError] = useState<DnsKey | undefined>(undefined)
  const [recordFailure, setRecordFailure] = useState<Failure | undefined>(undefined)

  const loadHostnames = useCallback(async (): Promise<void> => {
    try {
      const result = await client.domain.domainZones.hostnames.list(zone.id, { page: 1, pageSize: 100 })
      setHostnames(result.items)
    } catch (err) {
      setError(readFailure(err, 'error.load'))
    }
  }, [client, zone.id])

  const loadRecords = useCallback(async (): Promise<void> => {
    try {
      const result = await client.domain.domainZones.dnsRecords.list(zone.id, { page: 1, pageSize: 100 })
      setRecords(result.items)
    } catch (err) {
      setError(readFailure(err, 'error.load'))
    }
  }, [client, zone.id])

  useEffect(() => { void loadHostnames() }, [loadHostnames])
  useEffect(() => {
    if (tab === 'records') void loadRecords()
  }, [tab, loadRecords])

  const failureText = (failure: Failure): string => (failure.message === '' ? t(failure.fallback) : failure.message)

  const toggleZoneStatus = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const updated = await client.domain.domainZones.update(zone.id, {
        status: zone.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
      })
      onZoneChanged(updated)
    } catch (err) {
      setError(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const submitHostname = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const value = normalizeRelativeName(hostnameDraft)
    if (!value.ok) {
      setHostnameError('hostname.create.invalid')
      return
    }
    setBusy(true)
    setError(undefined)
    setHostnameError(undefined)
    setHostnameFailure(undefined)
    try {
      await client.domain.domainZones.hostnames.create(
        zone.id,
        { relativeName: value.value },
        { idempotencyKey: randomUUID() },
      )
      setHostnameDraft('')
      setHostnameForm(false)
      await loadHostnames()
    } catch (err) {
      setHostnameFailure(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const verifyHostname = async (hostname: DomainHostnameResponse): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await client.domain.domainZones.hostnames.verify(
        zone.id,
        hostname.id,
        { idempotencyKey: randomUUID() },
      )
      setVerification({ hostname: hostname.hostname, result })
      await loadHostnames()
    } catch (err) {
      setError(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const removeHostname = async (hostname: DomainHostnameResponse): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await client.domain.domainZones.hostnames.delete(zone.id, hostname.id)
      setConfirm(undefined)
      setVerification(undefined)
      await loadHostnames()
    } catch (err) {
      setError(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const syncRecords = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setSyncMessage(undefined)
    try {
      const result = await client.domain.domainZones.dnsRecords.sync(zone.id, { idempotencyKey: randomUUID() })
      setSyncMessage(t('record.synced', { count: result.recordCount }))
      await loadRecords()
    } catch (err) {
      setError(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const submitRecord = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const host = normalizeRecordHost(recordDraft.host)
    if (!host.ok) {
      setRecordError('record.create.invalidHost')
      return
    }
    if (recordDraft.value.trim() === '') {
      setRecordError('record.create.invalidValue')
      return
    }
    const ttl = parseTtl(recordDraft.ttl)
    if (!ttl.ok) {
      setRecordError('record.create.invalidTtl')
      return
    }
    const priority = parsePriority(recordDraft.priority)
    if (!priority.ok) {
      setRecordError('record.create.invalidPriority')
      return
    }
    const body: CreateDomainDnsRecordRequest = {
      recordType: recordDraft.type,
      host: host.value,
      recordValue: recordDraft.value.trim(),
    }
    if (ttl.value !== undefined) body.ttlSeconds = ttl.value
    if (recordTypeHasPriority(recordDraft.type) && priority.value !== undefined) body.priority = priority.value
    setBusy(true)
    setError(undefined)
    setRecordError(undefined)
    setRecordFailure(undefined)
    try {
      await client.domain.domainZones.dnsRecords.create(zone.id, body, { idempotencyKey: randomUUID() })
      setRecordDraft(EMPTY_RECORD)
      setRecordForm(false)
      setRecords(undefined)
      await loadRecords()
    } catch (err) {
      setRecordFailure(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const toggleRecord = async (record: DomainDnsRecordResponse): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await client.domain.domainZones.dnsRecords.status.update(
        zone.id,
        record.id,
        { enabled: record.recordStatus !== 'ENABLED' },
        { idempotencyKey: randomUUID() },
      )
      await loadRecords()
    } catch (err) {
      setError(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const removeRecord = async (record: DomainDnsRecordResponse): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await client.domain.domainZones.dnsRecords.delete(
        zone.id,
        record.id,
        { idempotencyKey: randomUUID() },
      )
      setConfirm(undefined)
      await loadRecords()
    } catch (err) {
      setError(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const statusBadge = zone.status === 'ACTIVE'
    ? <span className={clsx(css.badge, css.badgeOk)}>{t('zone.statusActive')}</span>
    : <span className={clsx(css.badge, css.badgeMuted)}>{t('zone.statusPaused')}</span>

  return (
    <div className={css.workspace}>
      <div className={css.detailHeader}>
        <Button size="sm" onClick={onBack}>{t('detail.back')}</Button>
        <div className={css.detailIdentity}>
          <span className={css.detailTitle}>{zone.apexHostname}</span>
          {statusBadge}
          <span className={css.detailMeta}>
            {t('zone.hostnames')} {zone.hostnameCount} · {t('zone.verified')} {zone.verifiedHostnameCount} · {t('zone.certificates')} {zone.certificateCount}
          </span>
        </div>
        <div className={css.detailSpacer} />
        <Button size="sm" disabled={busy} onClick={() => { void toggleZoneStatus() }}>
          {zone.status === 'ACTIVE' ? t('zone.pause') : t('zone.resume')}
        </Button>
      </div>

      <div className={css.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'hostnames'}
          className={clsx(css.tab, tab === 'hostnames' && css.tabActive)}
          onClick={() => { setTab('hostnames') }}
        >
          {t('detail.tab.hostnames')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'records'}
          className={clsx(css.tab, tab === 'records' && css.tabActive)}
          onClick={() => { setTab('records') }}
        >
          {t('detail.tab.records')}
        </button>
      </div>

      {error !== undefined && (
        <div className={clsx(css.banner, css.bannerError)} role="alert">
          <span>{failureText(error)}</span>
          <Button size="sm" onClick={() => { setError(undefined) }}>{t('common.cancel')}</Button>
        </div>
      )}

      {tab === 'hostnames'
        ? (
          <section className={css.detailPane}>
            <div className={css.toolbar}>
              <div className={css.toolbarActions}>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    setHostnameForm(true); setHostnameError(undefined); setHostnameFailure(undefined)
                  }}
                >
                  {t('hostname.add')}
                </Button>
              </div>
            </div>
            {verification !== undefined && (
              <div className={css.verifyNotice} role="status">
                {verification.result.verified
                  ? <span>{t('hostname.verifyDone')}</span>
                  : (
                    <>
                      <span>
                        {t('hostname.verifyInstruction', {
                          name: verification.result.recordName ?? verification.hostname,
                          value: verification.result.token ?? '',
                        })}
                      </span>
                      {verification.result.expiresAt !== undefined && (
                        <span>{t('hostname.verifyExpires', { time: formatTimestamp(verification.result.expiresAt) })}</span>
                      )}
                      <span>{t('hostname.verifyPending')}</span>
                    </>
                  )}
              </div>
            )}
            {hostnames === undefined
              ? <div className={css.empty}>{t('common.loading')}</div>
              : hostnames.length === 0
                ? <div className={css.empty}>{t('hostname.empty')}</div>
                : (
                  <div className={css.tableWrap}>
                    <table className={css.table}>
                      <thead>
                        <tr>
                          <th>{t('hostname.name')}</th>
                          <th>{t('hostname.type')}</th>
                          <th>{t('hostname.verification')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {hostnames.map(hostname => (
                          <tr key={hostname.id}>
                            <td>
                              <div className={css.cellMain}>
                                <span>{hostname.hostname}</span>
                                <span className={css.cellSub}>{formatTimestamp(hostname.updatedAt)}</span>
                              </div>
                            </td>
                            <td>
                              <span className={css.badge}>
                                {hostname.hostnameType === 'WILDCARD' ? t('hostname.typeWildcard') : t('hostname.typeExact')}
                              </span>
                            </td>
                            <td>
                              <span className={clsx(
                                css.badge,
                                hostname.verificationStatus === 'VERIFIED' && css.badgeOk,
                                hostname.verificationStatus === 'PENDING' && css.badgeWarn,
                                (hostname.verificationStatus === 'FAILED' || hostname.verificationStatus === 'EXPIRED') && css.badgeError,
                              )}
                              >
                                {hostname.verificationStatus === 'VERIFIED'
                                  ? t('hostname.statusVerified')
                                  : hostname.verificationStatus === 'PENDING'
                                    ? t('hostname.statusPending')
                                    : hostname.verificationStatus === 'FAILED'
                                      ? t('hostname.statusFailed')
                                      : t('hostname.statusExpired')}
                              </span>
                            </td>
                            <td>
                              <div className={css.rowActions}>
                                {hostname.verificationStatus !== 'VERIFIED' && (
                                  <Button size="sm" disabled={busy} onClick={() => { void verifyHostname(hostname) }}>
                                    {t('hostname.verify')}
                                  </Button>
                                )}
                                {confirm?.kind === 'hostname' && confirm.id === hostname.id
                                  ? (
                                    <>
                                      <Button size="sm" onClick={() => { setConfirm(undefined) }}>{t('common.cancel')}</Button>
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void removeHostname(hostname) }}>
                                        {t('common.confirmDelete')}
                                      </Button>
                                    </>
                                  )
                                  : (
                                    <Button size="sm" onClick={() => { setConfirm({ kind: 'hostname', id: hostname.id }) }}>
                                      {t('common.delete')}
                                    </Button>
                                  )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
          </section>
        )
        : (
          <section className={css.detailPane}>
            <div className={css.toolbar}>
              <div className={css.toolbarActions}>
                <Button size="sm" disabled={busy} onClick={() => { void syncRecords() }}>{t('record.sync')}</Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    setRecordForm(true); setRecordError(undefined); setRecordFailure(undefined)
                  }}
                >
                  {t('record.add')}
                </Button>
              </div>
            </div>
            {syncMessage !== undefined && <div className={css.syncNotice} role="status">{syncMessage}</div>}
            {records === undefined
              ? <div className={css.empty}>{t('common.loading')}</div>
              : records.length === 0
                ? <div className={css.empty}>{t('record.empty')}</div>
                : (
                  <div className={css.tableWrap}>
                    <table className={css.table}>
                      <thead>
                        <tr>
                          <th>{t('record.type')}</th>
                          <th>{t('record.host')}</th>
                          <th>{t('record.value')}</th>
                          <th>{t('record.ttl')}</th>
                          <th>{t('record.status')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {records.map(record => (
                          <tr key={record.id}>
                            <td><span className={css.badge}>{record.recordType}</span></td>
                            <td>{record.host}</td>
                            <td className={css.cellValue}>{record.recordValue}</td>
                            <td>{record.ttlSeconds === undefined ? t('common.none') : record.ttlSeconds}</td>
                            <td>
                              <span className={clsx(css.badge, record.recordStatus === 'ENABLED' ? css.badgeOk : css.badgeMuted)}>
                                {record.recordStatus === 'ENABLED' ? t('record.enabled') : t('record.disabled')}
                              </span>
                            </td>
                            <td>
                              <div className={css.rowActions}>
                                <Button size="sm" disabled={busy} onClick={() => { void toggleRecord(record) }}>
                                  {record.recordStatus === 'ENABLED' ? t('record.pause') : t('record.resume')}
                                </Button>
                                {confirm?.kind === 'record' && confirm.id === record.id
                                  ? (
                                    <>
                                      <Button size="sm" onClick={() => { setConfirm(undefined) }}>{t('common.cancel')}</Button>
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void removeRecord(record) }}>
                                        {t('common.confirmDelete')}
                                      </Button>
                                    </>
                                  )
                                  : (
                                    <Button size="sm" onClick={() => { setConfirm({ kind: 'record', id: record.id }) }}>
                                      {t('common.delete')}
                                    </Button>
                                  )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
          </section>
        )}

      <Drawer
        open={hostnameForm}
        onClose={() => { setHostnameForm(false); setHostnameError(undefined); setHostnameFailure(undefined) }}
        title={t('hostname.add')}
        closeLabel={t('close')}
      >
        <form className={css.form} onSubmit={(event) => { void submitHostname(event) }}>
          <div className={css.formGrid}>
            <label className={clsx(css.field, css.fieldWide)}>
              <span>{t('hostname.name')}</span>
              <Input
                value={hostnameDraft}
                placeholder={t('hostname.createPlaceholder')}
                onChange={(event) => { setHostnameDraft(event.target.value) }}
              />
            </label>
          </div>
          {hostnameError !== undefined && <div className={css.fieldError} role="alert">{t(hostnameError)}</div>}
          {hostnameFailure !== undefined && (
            <div className={css.fieldError} role="alert">{failureText(hostnameFailure)}</div>
          )}
          <div className={css.formActions}>
            <Button size="sm" onClick={() => {
              setHostnameForm(false); setHostnameError(undefined); setHostnameFailure(undefined)
            }}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={busy}>{t('record.create.submit')}</Button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={recordForm}
        onClose={() => { setRecordForm(false); setRecordError(undefined); setRecordFailure(undefined) }}
        title={t('record.create.title')}
        closeLabel={t('close')}
      >
        <form className={css.form} onSubmit={(event) => { void submitRecord(event) }}>
          <div className={css.formGrid}>
            <label className={css.field}>
              <span>{t('record.type')}</span>
              <select
                className={css.select}
                value={recordDraft.type}
                onChange={(event) => { setRecordDraft({ ...recordDraft, type: event.target.value as RecordType }) }}
              >
                {RECORD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className={css.field}>
              <span>{t('record.host')}</span>
              <Input
                value={recordDraft.host}
                placeholder={t('record.create.hostPlaceholder')}
                onChange={(event) => { setRecordDraft({ ...recordDraft, host: event.target.value }) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('record.value')}</span>
              <Input
                value={recordDraft.value}
                placeholder={t('record.create.valuePlaceholder')}
                onChange={(event) => { setRecordDraft({ ...recordDraft, value: event.target.value }) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('record.ttl')}</span>
              <Input
                value={recordDraft.ttl}
                onChange={(event) => { setRecordDraft({ ...recordDraft, ttl: event.target.value }) }}
              />
            </label>
            {recordTypeHasPriority(recordDraft.type) && (
              <label className={css.field}>
                <span>{t('record.priority')}</span>
                <Input
                  value={recordDraft.priority}
                  onChange={(event) => { setRecordDraft({ ...recordDraft, priority: event.target.value }) }}
                />
              </label>
            )}
          </div>
          {recordError !== undefined && <div className={css.fieldError} role="alert">{t(recordError)}</div>}
          {recordFailure !== undefined && (
            <div className={css.fieldError} role="alert">{failureText(recordFailure)}</div>
          )}
          <div className={css.formActions}>
            <Button size="sm" onClick={() => {
              setRecordForm(false); setRecordError(undefined); setRecordFailure(undefined)
            }}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={busy}>{t('record.create.submit')}</Button>
          </div>
        </form>
      </Drawer>
    </div>
  )
}
