/**
 * Certificate ledger inside the certificate dialog: the list the signed-in
 * account owns, the issuance form built from verified hostnames, and the
 * manual renewal/deletion commands. It owns the ledger and form state and calls
 * the generated deployments client handed down by the dialog.
 */
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Button, Drawer, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CertificateResponse, CreateCertificateRequest, SdkworkDeployAppClient,
} from '@sdkwork/deployments-app-sdk'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import {
  errorText, formatTimestamp, hostnameOption, identifiersText, validateIssue,
  type CertificateScope, type HostnameOption, type IssueProblem,
} from './certificateView.ts'
import type { CertificateKey } from './locales.ts'
import css from './CertificateModal.module.css'

/** How a failed operation reads: the wire message when present, a typed fallback otherwise. */
interface Failure {
  message: string
  fallback: CertificateKey
}

/** Issuance validation problems mapped onto their copy. */
const PROBLEM_KEYS: Record<IssueProblem, CertificateKey> = {
  invalidName: 'cert.create.invalidName',
  noSelection: 'cert.create.noSelection',
  wildcardNeedsWildcard: 'cert.create.wildcardChoice',
  singleNeedsExact: 'cert.create.singleChoice',
}

/** Props handed down by the dialog. */
export interface CertificateWorkspaceProps {
  client: SdkworkDeployAppClient
  t: Translate<CertificateKey>
}

/** One group of verified hostnames under their root domain. */
interface HostnameGroup {
  zoneApex: string
  options: readonly HostnameOption[]
}

/**
 * Render the certificate ledger and its issuance form.
 * @param props - the generated deployments client and the locale seat.
 * @returns the certificate workspace element tree.
 */
export function CertificateWorkspace({ client, t }: CertificateWorkspaceProps): ReactNode {
  const [certificates, setCertificates] = useState<readonly CertificateResponse[] | undefined>(undefined)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | undefined>(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<CertificateKey | undefined>(undefined)
  const [issueFailure, setIssueFailure] = useState<Failure | undefined>(undefined)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<CertificateScope>('SINGLE_DOMAIN')
  const [autoRenew, setAutoRenew] = useState(true)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [hostnameOptions, setHostnameOptions] = useState<readonly HostnameOption[]>([])
  const [hostnamesLoading, setHostnamesLoading] = useState(false)
  const [hostnamesFailed, setHostnamesFailed] = useState(false)

  const loadCertificates = useCallback(async (): Promise<void> => {
    try {
      const result = await client.certificate.list({ page: 1, pageSize: 100 })
      setCertificates(result.items)
    } catch (err) {
      setError({ message: errorText(err), fallback: 'error.load' })
    }
  }, [client])

  const loadHostnames = useCallback(async (): Promise<void> => {
    setHostnamesLoading(true)
    setHostnamesFailed(false)
    try {
      const zones = await client.domain.domainZones.list({ page: 1, pageSize: 100, scope: 'USER' })
      const groups = await Promise.all(zones.items.map(async (zone) => {
        const rows = await client.domain.domainZones.hostnames.list(zone.id, { page: 1, pageSize: 100 })
        return rows.items
          .filter(hostname => hostname.verificationStatus === 'VERIFIED')
          .map(hostname => hostnameOption(hostname, zone.apexHostname))
      }))
      setHostnameOptions(groups.flat())
    } catch {
      setHostnameOptions([])
      setHostnamesFailed(true)
    } finally {
      setHostnamesLoading(false)
    }
  }, [client])

  useEffect(() => { void loadCertificates() }, [loadCertificates])
  useEffect(() => {
    if (formOpen) void loadHostnames()
  }, [formOpen, loadHostnames])

  const groups = useMemo<readonly HostnameGroup[]>(() => {
    const byZone = new Map<string, HostnameOption[]>()
    for (const option of hostnameOptions) {
      const bucket = byZone.get(option.zoneApex)
      if (bucket === undefined) byZone.set(option.zoneApex, [option])
      else bucket.push(option)
    }
    return [...byZone.entries()].map(([zoneApex, options]) => ({ zoneApex, options }))
  }, [hostnameOptions])

  const failureText = (failure: Failure): string => (failure.message === '' ? t(failure.fallback) : failure.message)

  const refresh = (): void => {
    setError(undefined)
    setCertificates(undefined)
    void loadCertificates()
  }

  const resetForm = (): void => {
    setName('')
    setScope('SINGLE_DOMAIN')
    setAutoRenew(true)
    setSelectedIds(new Set())
    setFormError(undefined)
    setIssueFailure(undefined)
  }

  const toggleHostname = (id: string): void => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submitIssue = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const selected = hostnameOptions.filter(option => selectedIds.has(option.id))
    const validation = validateIssue({ name, scope, selected })
    if (!validation.ok) {
      setFormError(PROBLEM_KEYS[validation.problem])
      return
    }
    const body: CreateCertificateRequest = {
      certName: name.trim(),
      domainIds: selected.map(option => option.id),
      certificateScope: scope,
      autoRenew,
    }
    setBusy(true)
    setFormError(undefined)
    setIssueFailure(undefined)
    try {
      await client.certificate.create(body, { idempotencyKey: randomUUID() })
      resetForm()
      setFormOpen(false)
      setCertificates(undefined)
      await loadCertificates()
    } catch (err) {
      setIssueFailure({ message: errorText(err), fallback: 'action.failed' })
    } finally {
      setBusy(false)
    }
  }

  const renew = async (certificate: CertificateResponse): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await client.certificate.renew(certificate.id, { idempotencyKey: randomUUID() })
      setCertificates(undefined)
      await loadCertificates()
    } catch (err) {
      setError({ message: errorText(err), fallback: 'action.failed' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (certificate: CertificateResponse): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await client.certificate.delete(certificate.id)
      setConfirmId(undefined)
      setCertificates(undefined)
      await loadCertificates()
    } catch (err) {
      setError({ message: errorText(err), fallback: 'action.failed' })
    } finally {
      setBusy(false)
    }
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
            onClick={() => { setFormOpen(true); setFormError(undefined); setIssueFailure(undefined) }}
          >
            {t('cert.add')}
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
        title={t('cert.create.title')}
        closeLabel={t('close')}
      >
        <form className={css.form} onSubmit={(event) => { void submitIssue(event) }}>
          <div className={css.formGrid}>
            <label className={css.field}>
              <span>{t('cert.create.name')}</span>
              <Input
                value={name}
                placeholder={t('cert.create.namePlaceholder')}
                onChange={(event) => { setName(event.target.value) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('cert.create.scope')}</span>
              <select
                className={css.select}
                value={scope}
                onChange={(event) => { setScope(event.target.value as CertificateScope) }}
              >
                <option value="SINGLE_DOMAIN">{t('cert.scopeSingle')}</option>
                <option value="WILDCARD">{t('cert.scopeWildcard')}</option>
              </select>
            </label>
          </div>
          <div className={css.pickerHint}>{t('cert.create.scopeHint')}</div>
          <div className={css.pickerHint}>{t('cert.create.selectHint')}</div>
          {hostnamesLoading
            ? <div className={css.pickerHint}>{t('common.loading')}</div>
            : hostnamesFailed
              ? <div className={css.fieldError} role="alert">{t('cert.create.hostnamesUnavailable')}</div>
              : hostnameOptions.length === 0
                ? <div className={css.pickerHint}>{t('cert.create.noHostnames')}</div>
                : (
                  <div className={css.picker}>
                    {groups.map(group => (
                      <div key={group.zoneApex} className={css.pickerGroup}>
                        <div className={css.pickerGroupTitle}>{group.zoneApex}</div>
                        {group.options.map(option => (
                          <label key={option.id} className={css.pickerOption}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(option.id)}
                              onChange={() => { toggleHostname(option.id) }}
                            />
                            <span>{option.hostname}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
          <label className={css.checkRow}>
            <input type="checkbox" checked={autoRenew} onChange={(event) => { setAutoRenew(event.target.checked) }} />
            <span>{t('cert.create.autoRenew')}</span>
          </label>
          {formError !== undefined && <div className={css.fieldError} role="alert">{t(formError)}</div>}
          {issueFailure !== undefined && (
            <div className={css.fieldError} role="alert">{failureText(issueFailure)}</div>
          )}
          <div className={css.formActions}>
            <Button size="sm" onClick={() => { setFormOpen(false); resetForm() }}>{t('common.cancel')}</Button>
            <Button size="sm" variant="primary" type="submit" disabled={busy}>{t('cert.create.submit')}</Button>
          </div>
        </form>
      </Drawer>

      {certificates === undefined
        ? <div className={css.empty}>{t('common.loading')}</div>
        : certificates.length === 0
          ? <div className={css.empty}>{t('cert.empty')}</div>
          : (
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th>{t('cert.name')}</th>
                    <th>{t('cert.scope')}</th>
                    <th>{t('cert.identifiers')}</th>
                    <th>{t('cert.status')}</th>
                    <th>{t('cert.validity')}</th>
                    <th>{t('cert.autoRenew')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((certificate) => {
                    const notAfter = formatTimestamp(certificate.notAfter)
                    return (
                      <tr key={certificate.id}>
                        <td>
                          <div className={css.cellMain}>
                            <span>{certificate.certName}</span>
                            <span className={css.cellSub}>
                              {certificate.certificateSource === 'MANAGED' ? t('cert.sourceManaged') : t('cert.sourceCustom')}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={css.badge}>
                            {certificate.certificateScope === 'WILDCARD' ? t('cert.scopeWildcard') : t('cert.scopeSingle')}
                          </span>
                        </td>
                        <td className={css.cellValue}>{identifiersText(certificate.identifiers)}</td>
                        <td>
                          <span className={clsx(
                            css.badge,
                            certificate.status === 'ACTIVE' && css.badgeOk,
                            (certificate.status === 'PENDING' || certificate.status === 'ISSUING') && css.badgeWarn,
                            (certificate.status === 'EXPIRED' || certificate.status === 'FAILED' || certificate.status === 'REVOKED') && css.badgeError,
                          )}
                          >
                            {certificate.status === 'ACTIVE'
                              ? t('cert.statusActive')
                              : certificate.status === 'PENDING'
                                ? t('cert.statusPending')
                                : certificate.status === 'ISSUING'
                                  ? t('cert.statusIssuing')
                                  : certificate.status === 'EXPIRED'
                                    ? t('cert.statusExpired')
                                    : certificate.status === 'FAILED'
                                      ? t('cert.statusFailed')
                                      : t('cert.statusRevoked')}
                          </span>
                        </td>
                        <td>
                          <div className={css.cellMain}>
                            <span>{notAfter === '' ? t('common.none') : notAfter}</span>
                            {certificate.daysUntilExpiry !== undefined && (
                              <span className={css.daysLeft}>
                                {certificate.daysUntilExpiry < 0
                                  ? t('cert.expired')
                                  : t('cert.expiresIn', { days: certificate.daysUntilExpiry })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{certificate.autoRenew ? t('cert.autoRenewOn') : t('cert.autoRenewOff')}</td>
                        <td>
                          <div className={css.rowActions}>
                            <Button size="sm" disabled={busy} onClick={() => { void renew(certificate) }}>
                              {t('cert.renew')}
                            </Button>
                            {confirmId === certificate.id
                              ? (
                                <>
                                  <Button size="sm" onClick={() => { setConfirmId(undefined) }}>{t('common.cancel')}</Button>
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { void remove(certificate) }}>
                                    {t('common.confirmDelete')}
                                  </Button>
                                </>
                              )
                              : (
                                <Button size="sm" onClick={() => { setConfirmId(certificate.id) }}>{t('common.delete')}</Button>
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
