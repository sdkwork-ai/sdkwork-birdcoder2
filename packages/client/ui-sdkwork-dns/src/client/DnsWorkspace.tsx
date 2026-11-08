/**
 * Root-domain list inside the domain dialog: the list of zones the signed-in
 * account owns (`scope: USER` — the tenant-level `app.<suffix>` zones are the
 * platform's, not "my root domains"), the create form, and the doorway into one
 * zone's `ZoneDetail`. It owns the list and form state and calls the generated
 * deployments client handed down by the dialog.
 */
import { useCallback, useEffect, useState, type SyntheticEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Button, Drawer, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CloudAccountResponse, CreateDomainZoneRequest, DomainZoneResponse, SdkworkDeployAppClient,
} from '@sdkwork/deployments-app-sdk'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { ZoneDetail, readFailure, type Failure } from './ZoneDetail.tsx'
import { formatTimestamp, normalizeApex } from './dnsView.ts'
import type { DnsKey } from './locales.ts'
import css from './DnsModal.module.css'

/** DNS families a zone may pin; the selected value is a wire code, the label is copy. */
const PROVIDERS = [
  { value: 'ALIYUN_DNS', labelKey: 'zone.create.provider.aliyun' },
  { value: 'DNSPOD', labelKey: 'zone.create.provider.dnspod' },
  { value: 'CLOUDFLARE', labelKey: 'zone.create.provider.cloudflare' },
] as const

/** Props handed down by the dialog. */
export interface DnsWorkspaceProps {
  client: SdkworkDeployAppClient
  t: Translate<DnsKey>
}

/**
 * Render the root-domain list and hand a selected zone to `ZoneDetail`.
 * @param props - the generated deployments client and the locale seat.
 * @returns the zone list element tree.
 */
export function DnsWorkspace({ client, t }: DnsWorkspaceProps): ReactNode {
  const [zones, setZones] = useState<readonly DomainZoneResponse[] | undefined>(undefined)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<DomainZoneResponse | undefined>(undefined)
  const [confirmId, setConfirmId] = useState<string | undefined>(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<DnsKey | undefined>(undefined)
  const [formFailure, setFormFailure] = useState<Failure | undefined>(undefined)
  const [apex, setApex] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [provider, setProvider] = useState('')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState<readonly CloudAccountResponse[]>([])

  const loadZones = useCallback(async (): Promise<void> => {
    try {
      const result = await client.domain.domainZones.list({ page: 1, pageSize: 100, scope: 'USER' })
      setZones(result.items)
    } catch (err) {
      setError(readFailure(err, 'error.load'))
    }
  }, [client])

  const loadAccounts = useCallback(async (): Promise<void> => {
    try {
      const result = await client.domain.cloudAccounts.list({ page: 1, pageSize: 100, mine: true })
      setAccounts(result.items)
    } catch {
      // An unreadable account list only narrows the optional binding picker;
      // the zone itself can still be created unpinned.
      setAccounts([])
    }
  }, [client])

  useEffect(() => { void loadZones() }, [loadZones])
  useEffect(() => {
    if (formOpen) void loadAccounts()
  }, [formOpen, loadAccounts])

  const failureText = (failure: Failure): string => (failure.message === '' ? t(failure.fallback) : failure.message)

  const refresh = (): void => {
    setError(undefined)
    setZones(undefined)
    void loadZones()
  }

  const resetForm = (): void => {
    setApex('')
    setDisplayName('')
    setProvider('')
    setAccountId('')
    setFormError(undefined)
    setFormFailure(undefined)
  }

  const submitZone = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const value = normalizeApex(apex)
    if (!value.ok) {
      setFormError('zone.create.invalidApex')
      return
    }
    const body: CreateDomainZoneRequest = { apexHostname: value.value }
    if (displayName.trim() !== '') body.displayName = displayName.trim()
    if (provider !== '') body.dnsProvider = provider
    if (accountId !== '') body.providerAccountId = accountId
    setBusy(true)
    setFormFailure(undefined)
    setFormError(undefined)
    try {
      await client.domain.domainZones.create(body, { idempotencyKey: randomUUID() })
      resetForm()
      setFormOpen(false)
      setZones(undefined)
      await loadZones()
    } catch (err) {
      setFormFailure(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const toggleZone = async (zone: DomainZoneResponse): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await client.domain.domainZones.update(zone.id, {
        status: zone.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
      })
      setZones(undefined)
      await loadZones()
    } catch (err) {
      setError(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const removeZone = async (zone: DomainZoneResponse): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await client.domain.domainZones.delete(zone.id)
      setConfirmId(undefined)
      setZones(undefined)
      await loadZones()
    } catch (err) {
      setError(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (selected !== undefined) {
    return (
      <ZoneDetail
        client={client}
        zone={selected}
        t={t}
        onBack={() => { setSelected(undefined); void loadZones() }}
        onZoneChanged={(zone) => { setSelected(zone); void loadZones() }}
      />
    )
  }

  return (
    <div className={css.workspace}>
      <div className={css.toolbar}>
        <div className={css.toolbarActions}>
          <Button size="sm" onClick={refresh}>{t('common.refresh')}</Button>
        </div>
        <div className={css.toolbarActions}>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => { setFormOpen(true); setFormError(undefined); setFormFailure(undefined) }}
          >
            {t('zone.add')}
          </Button>
        </div>
      </div>

      {error !== undefined && (
        <div className={clsx(css.banner, css.bannerError)} role="alert">
          <span>{failureText(error)}</span>
          <Button size="sm" onClick={refresh}>{t('common.retry')}</Button>
        </div>
      )}

      <Drawer
        open={formOpen}
        onClose={() => { setFormOpen(false); resetForm() }}
        title={t('zone.create.title')}
        closeLabel={t('close')}
      >
        <form className={css.form} onSubmit={(event) => { void submitZone(event) }}>
          <div className={css.formGrid}>
            <label className={css.field}>
              <span>{t('zone.create.apex')}</span>
              <Input
                value={apex}
                placeholder={t('zone.create.apexPlaceholder')}
                onChange={(event) => { setApex(event.target.value) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('zone.create.displayName')}</span>
              <Input value={displayName} onChange={(event) => { setDisplayName(event.target.value) }} />
            </label>
            <label className={css.field}>
              <span>{t('zone.create.provider')}</span>
              <select className={css.select} value={provider} onChange={(event) => { setProvider(event.target.value) }}>
                <option value="">{t('zone.create.providerAuto')}</option>
                {PROVIDERS.map(item => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}
              </select>
            </label>
            <label className={css.field}>
              <span>{t('zone.create.account')}</span>
              <select className={css.select} value={accountId} onChange={(event) => { setAccountId(event.target.value) }}>
                <option value="">{t('zone.create.accountNone')}</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>{account.displayName}</option>
                ))}
              </select>
            </label>
          </div>
          {formError !== undefined && <div className={css.fieldError} role="alert">{t(formError)}</div>}
          {formFailure !== undefined && (
            <div className={css.fieldError} role="alert">{failureText(formFailure)}</div>
          )}
          <div className={css.formActions}>
            <Button size="sm" onClick={() => { setFormOpen(false); resetForm() }}>{t('common.cancel')}</Button>
            <Button size="sm" variant="primary" type="submit" disabled={busy}>{t('zone.create.submit')}</Button>
          </div>
        </form>
      </Drawer>

      {zones === undefined
        ? <div className={css.empty}>{t('common.loading')}</div>
        : zones.length === 0
          ? <div className={css.empty}>{t('zone.empty')}</div>
          : (
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th>{t('zone.apex')}</th>
                    <th>{t('zone.provider')}</th>
                    <th>{t('zone.status')}</th>
                    <th>{t('zone.hostnames')}</th>
                    <th>{t('zone.verified')}</th>
                    <th>{t('zone.certificates')}</th>
                    <th>{t('zone.updatedAt')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => {
                    const updated = formatTimestamp(zone.updatedAt)
                    return (
                      <tr key={zone.id}>
                        <td>
                          <div className={css.cellMain}>
                            <button type="button" className={css.linkButton} onClick={() => { setSelected(zone) }}>
                              {zone.apexHostname}
                            </button>
                            {zone.displayName !== undefined && zone.displayName !== '' && (
                              <span className={css.cellSub}>{zone.displayName}</span>
                            )}
                          </div>
                        </td>
                        <td>{zone.dnsProvider === undefined || zone.dnsProvider === '' ? t('common.none') : zone.dnsProvider}</td>
                        <td>
                          <span className={clsx(css.badge, zone.status === 'ACTIVE' ? css.badgeOk : css.badgeMuted)}>
                            {zone.status === 'ACTIVE' ? t('zone.statusActive') : t('zone.statusPaused')}
                          </span>
                        </td>
                        <td>{zone.hostnameCount}</td>
                        <td>{zone.verifiedHostnameCount}</td>
                        <td>{zone.certificateCount}</td>
                        <td>{updated === '' ? t('common.none') : updated}</td>
                        <td>
                          <div className={css.rowActions}>
                            <Button size="sm" onClick={() => { setSelected(zone) }}>{t('zone.manage')}</Button>
                            <Button size="sm" disabled={busy} onClick={() => { void toggleZone(zone) }}>
                              {zone.status === 'ACTIVE' ? t('zone.pause') : t('zone.resume')}
                            </Button>
                            {confirmId === zone.id
                              ? (
                                <>
                                  <Button size="sm" onClick={() => { setConfirmId(undefined) }}>{t('common.cancel')}</Button>
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { void removeZone(zone) }}>
                                    {t('common.confirmDelete')}
                                  </Button>
                                </>
                              )
                              : (
                                <Button size="sm" onClick={() => { setConfirmId(zone.id) }}>{t('common.delete')}</Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
    </div>
  )
}
