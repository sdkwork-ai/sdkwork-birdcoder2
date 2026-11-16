/**
 * Domain-ownership verification files for one root domain.
 *
 * Every platform that grants a domain-scoped capability proves ownership by
 * fetching a file it issued from the domain root: WeChat official account and
 * mini program (`MP_verify_*.txt`), Alipay and ByteDance mini programs, Google
 * Search Console (`google*.html`), Apple (`apple-developer-domain-association.txt`).
 * The operator picks the platform they are verifying and uploads the file; the
 * deployments service stores it byte-exact and the edge serves it at
 * `https://<hostname>/<fileName>` for every hostname in the zone.
 *
 * The file is zone-scoped even when opened from a subdomain row: the edge serves
 * it for the apex and every registered subdomain, so both entry points open this
 * one surface.
 */
import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode, type SyntheticEvent } from 'react'
import clsx from 'clsx'
import { Button, Drawer, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  CreateDomainVerificationFileRequest, DomainVerificationFileCheckResponse,
  DomainVerificationFileResponse, DomainZoneResponse, SdkworkDeployAppClient,
} from '@sdkwork/deployments-app-sdk'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import {
  formatTimestamp, normalizeVerificationContent, normalizeVerificationFileName,
  VERIFICATION_CONTENT_LIMIT, VERIFICATION_PLATFORMS, type VerificationPlatform,
} from './dnsView.ts'
import type { DnsKey } from './locales.ts'
import { readFailure, type Failure } from './ZoneDetail.tsx'
import css from './DnsModal.module.css'

/** Locale key per platform wire code; a new code must extend this map. */
const PLATFORM_LABEL: Record<VerificationPlatform, DnsKey> = {
  WECHAT_OFFICIAL_ACCOUNT: 'verification.platform.WECHAT_OFFICIAL_ACCOUNT',
  WECHAT_MINI_PROGRAM: 'verification.platform.WECHAT_MINI_PROGRAM',
  ALIPAY: 'verification.platform.ALIPAY',
  BYTEDANCE: 'verification.platform.BYTEDANCE',
  APPLE: 'verification.platform.APPLE',
  GOOGLE: 'verification.platform.GOOGLE',
  CUSTOM: 'verification.platform.CUSTOM',
}

/** Props for the zone's verification-file surface. */
export interface VerificationFilesDrawerProps {
  client: SdkworkDeployAppClient
  zone: DomainZoneResponse
  t: Translate<DnsKey>
  /** Close the drawer (the caller unmounts it). */
  onClose: () => void
}

/**
 * Render the zone's verification-file ledger and upload form.
 * @param props - the generated client, the zone, the locale seat, and the close gesture.
 * @returns the drawer element tree.
 */
export function VerificationFilesDrawer({ client, zone, t, onClose }: VerificationFilesDrawerProps): ReactNode {
  const [files, setFiles] = useState<readonly DomainVerificationFileResponse[] | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | undefined>(undefined)
  const [uploaded, setUploaded] = useState(false)
  const [platform, setPlatform] = useState<VerificationPlatform>('WECHAT_OFFICIAL_ACCOUNT')
  const [fileName, setFileName] = useState('')
  const [content, setContent] = useState('')
  const [fieldError, setFieldError] = useState<DnsKey | undefined>(undefined)
  const [confirmId, setConfirmId] = useState<string | undefined>(undefined)
  const [checks, setChecks] = useState<Readonly<Record<string, DomainVerificationFileCheckResponse>>>({})

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await client.domain.domainZones.verificationFiles.list(zone.id)
      setFiles(result.items)
    } catch (err) {
      setFailure(readFailure(err, 'error.load'))
    }
  }, [client, zone.id])

  useEffect(() => { void load() }, [load])

  const failureText = (value: Failure): string => (value.message === '' ? t(value.fallback) : value.message)

  const platformLabel = (code: string): string => t(PLATFORM_LABEL[code as VerificationPlatform] ?? 'verification.platform.CUSTOM')

  const pickFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    // Clear the picker so choosing the same file again still fires `change`.
    event.target.value = ''
    if (file === undefined) return
    setUploaded(false)
    setFailure(undefined)
    if (file.size > VERIFICATION_CONTENT_LIMIT) {
      setFieldError('verification.file.tooLarge')
      return
    }
    const name = normalizeVerificationFileName(file.name)
    if (!name.ok) {
      setFieldError('verification.file.invalidName')
      return
    }
    const value = normalizeVerificationContent(await file.text())
    if (!value.ok) {
      setFieldError('verification.file.invalidContent')
      return
    }
    setFileName(name.value)
    setContent(value.value)
    setFieldError(undefined)
  }

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const name = normalizeVerificationFileName(fileName)
    if (!name.ok) {
      setFieldError('verification.file.invalidName')
      return
    }
    const value = normalizeVerificationContent(content)
    if (!value.ok) {
      setFieldError('verification.file.invalidContent')
      return
    }
    const body: CreateDomainVerificationFileRequest = {
      platform,
      fileName: name.value,
      content: value.value,
    }
    setBusy(true)
    setFailure(undefined)
    setFieldError(undefined)
    setUploaded(false)
    try {
      await client.domain.domainZones.verificationFiles.create(zone.id, body, { idempotencyKey: randomUUID() })
      // The save replaces by file name: conclusions about the previous content
      // no longer describe what is published.
      setChecks({})
      setFiles(undefined)
      setFileName('')
      setContent('')
      setUploaded(true)
      await load()
    } catch (err) {
      setFailure(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (file: DomainVerificationFileResponse): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      await client.domain.domainZones.verificationFiles.delete(zone.id, file.id)
      setConfirmId(undefined)
      setChecks({})
      await load()
    } catch (err) {
      setFailure(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const runCheck = async (file: DomainVerificationFileResponse): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      const result = await client.domain.domainZones.verificationFiles.check(zone.id, file.id)
      setChecks(current => ({ ...current, [file.id]: result }))
    } catch (err) {
      setFailure(readFailure(err, 'action.failed'))
    } finally {
      setBusy(false)
    }
  }

  const verdict = (check: DomainVerificationFileCheckResponse): string =>
    check.matched
      ? t('verification.matched')
      : check.reachable
        ? t('verification.reachableMismatch')
        : t('verification.unreachable')

  return (
    <Drawer open onClose={onClose} title={t('verification.title')} closeLabel={t('close')}>
      <div className={css.form}>
        <p className={css.hint}>{t('verification.hint', { domain: zone.apexHostname })}</p>

        {uploaded && <div className={css.syncNotice} role="status">{t('verification.uploaded')}</div>}

        {failure !== undefined && (
          <div className={clsx(css.banner, css.bannerError)} role="alert">
            <span>{failureText(failure)}</span>
            <Button size="sm" onClick={() => { setFailure(undefined); void load() }}>{t('common.retry')}</Button>
          </div>
        )}

        {files === undefined
          ? <div className={css.empty}>{t('common.loading')}</div>
          : files.length === 0
            ? <div className={css.empty}>{t('verification.empty')}</div>
            : (
              <div className={css.tableWrap}>
                <table className={css.table}>
                  <thead>
                    <tr>
                      <th>{t('verification.name')}</th>
                      <th>{t('verification.platform')}</th>
                      <th>{t('verification.updatedAt')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => {
                      const check = checks[file.id]
                      return (
                        <tr key={file.id}>
                          <td>
                            <div className={css.cellMain}>
                              <span className={css.fileName}>{file.fileName}</span>
                              <span className={css.cellSub}>{formatTimestamp(file.updatedAt)}</span>
                            </div>
                            {check !== undefined && (
                              <div className={css.verifyNotice} role="status">
                                <span>{verdict(check)}</span>
                                {check.detail !== undefined && <span>{check.detail}</span>}
                                {check.scheme !== undefined && <span>{check.scheme.toUpperCase()}</span>}
                              </div>
                            )}
                          </td>
                          <td><span className={css.badge}>{platformLabel(file.platform)}</span></td>
                          <td>{formatTimestamp(file.updatedAt) === '' ? t('common.none') : formatTimestamp(file.updatedAt)}</td>
                          <td>
                            <div className={css.rowActions}>
                              <Button
                                size="sm"
                                disabled={busy}
                                aria-label={`${t('verification.check')} ${file.fileName}`}
                                onClick={() => { void runCheck(file) }}
                              >
                                {t('verification.check')}
                              </Button>
                              {confirmId === file.id
                                ? (
                                  <>
                                    <Button size="sm" onClick={() => { setConfirmId(undefined) }}>{t('common.cancel')}</Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={busy}
                                      aria-label={`${t('common.confirmDelete')} ${file.fileName}`}
                                      onClick={() => { void remove(file) }}
                                    >
                                      {t('common.confirmDelete')}
                                    </Button>
                                  </>
                                )
                                : (
                                  <Button
                                    size="sm"
                                    aria-label={`${t('verification.delete')} ${file.fileName}`}
                                    onClick={() => { setConfirmId(file.id) }}
                                  >
                                    {t('verification.delete')}
                                  </Button>
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

        <form className={css.form} onSubmit={(event) => { void submit(event) }}>
          <div className={css.formGrid}>
            <label className={css.field}>
              <span>{t('verification.platform')}</span>
              <select
                className={css.select}
                value={platform}
                onChange={(event) => { setPlatform(event.target.value as VerificationPlatform) }}
              >
                {VERIFICATION_PLATFORMS.map(code => (
                  <option key={code} value={code}>{t(PLATFORM_LABEL[code])}</option>
                ))}
              </select>
            </label>
            <label className={clsx(css.field, css.fieldWide)}>
              <span>{t('verification.file')}</span>
              <input
                className={css.fileInput}
                type="file"
                accept=".txt,.html,.xml"
                onChange={(event) => { void pickFile(event) }}
              />
              <span className={css.cellSub}>{t('verification.fileHint')}</span>
            </label>
            <label className={clsx(css.field, css.fieldWide)}>
              <span>{t('verification.fileName')}</span>
              <Input
                value={fileName}
                placeholder="MP_verify_xxxxxxxx.txt"
                onChange={(event) => { setFileName(event.target.value) }}
              />
            </label>
            <label className={clsx(css.field, css.fieldWide)}>
              <span>{t('verification.content')}</span>
              <textarea
                className={css.textarea}
                rows={5}
                value={content}
                onChange={(event) => { setContent(event.target.value) }}
              />
            </label>
          </div>
          {fieldError !== undefined && <div className={css.fieldError} role="alert">{t(fieldError)}</div>}
          <div className={css.formActions}>
            <Button size="sm" variant="primary" type="submit" disabled={busy}>{t('verification.upload')}</Button>
          </div>
        </form>
      </div>
    </Drawer>
  )
}
