/**
 * Settings-menu "我的域名" drawer: the caller's root domains, one selected
 * domain's hostnames, and that domain's ownership verification files.
 *
 * The verification half is the point: a platform proves domain control by
 * fetching a file it issued from the domain root, and the file has a fixed
 * shape per platform (WeChat `MP_verify_<token>.txt`, Google `<token>.html`,
 * Apple's association file). The dialog lets the operator pick the issued file
 * or derive its name, then shows the exact public URL the crawler will read.
 *
 * Every row is the deployments app API's own record; no second backend contract
 * is introduced here. Host availability, the IAM session and the generated
 * clients come from the injected face, exactly like the app-inventory drawer.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { WideModal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the settings slot declarations (settings.dns) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {
  CreateDomainVerificationFileRequest,
  DomainHostnameResponse,
  DomainVerificationFileCheckResponse,
  DomainVerificationFileResponse,
  DomainZoneResponse,
} from '@sdkwork/deployments-app-sdk'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { createDomainCenterService, type DomainCenterService } from './domainCenter.ts'
import {
  DEFAULT_VERIFICATION_PLATFORM,
  DOMAIN_VERIFICATION_PLATFORMS,
  domainVerificationPlatform,
  isServableVerificationFileName,
  platformAcceptsVerificationExtension,
  suggestVerificationFileName,
  verificationFileExtension,
  verificationFilePublicUrl,
  type DomainVerificationPlatform,
} from './domainVerification.ts'
import css from './DomainCenterDialog.module.css'

/** Injected business face: the host adapter, the sign-in gesture, and live host facts. */
export interface DomainCenterDialogInjected {
  host: DeployHost
  startSignIn: () => void
  hooks: {
    available: HostObservable<boolean>
    signedIn: HostObservable<boolean>
    revision: HostObservable<number>
  }
}

export type DomainCenterDialogProps =
  PropsRuntime<'settings.dns'>
  & InjectFace<DomainCenterDialogInjected>
  & PropsLocale<'deploy'>

type VerificationForm = {
  platform: DomainVerificationPlatform
  fileName: string
  content: string
}

const EMPTY_VERIFICATION_FORM: VerificationForm = {
  platform: DEFAULT_VERIFICATION_PLATFORM,
  fileName: '',
  content: '',
}

/** Render the "我的域名" drawer. */
export function DomainCenterDialog(props: DomainCenterDialogProps): ReactNode {
  const {
    open, onClose, host, startSignIn, useAvailable, useSignedIn, useRevision, t,
  } = props
  const available = useAvailable((value: boolean) => value)
  const signedIn = useSignedIn((value: boolean) => value)
  useRevision((value: number) => value)

  const [zones, setZones] = useState<readonly DomainZoneResponse[]>()
  const [selectedZoneId, setSelectedZoneId] = useState<string>()
  const [hostnames, setHostnames] = useState<readonly DomainHostnameResponse[]>()
  const [files, setFiles] = useState<readonly DomainVerificationFileResponse[]>()
  const [checks, setChecks] = useState<Record<string, DomainVerificationFileCheckResponse>>({})
  const [zoneForm, setZoneForm] = useState({ apexHostname: '', displayName: '' })
  const [hostnameForm, setHostnameForm] = useState('')
  const [verificationForm, setVerificationForm] = useState<VerificationForm>(EMPTY_VERIFICATION_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const clients = useMemo<DeployHostClients | undefined>(() => {
    if (!available) return undefined
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  }, [available, host])
  const service = useMemo<DomainCenterService | undefined>(
    () => (clients === undefined ? undefined : createDomainCenterService(clients)),
    [clients],
  )

  const selectedZone = zones?.find(zone => zone.id === selectedZoneId)

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  const reloadZones = useCallback(async () => {
    if (service === undefined) return
    const loaded = await service.listZones()
    setZones(loaded)
  }, [service])

  useEffect(() => {
    if (!open || !signedIn || service === undefined) return
    let active = true
    void service.listZones().then((loaded) => {
      if (active) setZones(loaded)
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { active = false }
  }, [open, signedIn, service])

  useEffect(() => {
    if (!open || service === undefined || selectedZoneId === undefined) return
    let active = true
    setHostnames(undefined)
    setFiles(undefined)
    setChecks({})
    void service.listHostnames(selectedZoneId).then((loaded) => {
      if (active) setHostnames(loaded)
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause))
    })
    void service.listVerificationFiles(selectedZoneId).then((loaded) => {
      if (active) setFiles(loaded)
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { active = false }
  }, [open, selectedZoneId, service])

  const spec = domainVerificationPlatform(verificationForm.platform)

  const addZone = (): void => {
    if (service === undefined) return
    void run(async () => {
      const created = await service.createZone({
        apexHostname: zoneForm.apexHostname.trim(),
        displayName: zoneForm.displayName.trim() === '' ? undefined : zoneForm.displayName.trim(),
      })
      setZoneForm({ apexHostname: '', displayName: '' })
      setNotice(t('domain.notice.zoneCreated', { name: created.apexHostname }))
      await reloadZones()
      setSelectedZoneId(created.id)
    })
  }

  const addHostname = (): void => {
    if (service === undefined || selectedZoneId === undefined) return
    void run(async () => {
      const created = await service.createHostname(selectedZoneId, {
        relativeName: hostnameForm.trim(),
      })
      setHostnameForm('')
      setNotice(t('domain.notice.hostnameCreated', { name: created.hostname }))
      setHostnames(await service.listHostnames(selectedZoneId))
    })
  }

  const verifyHostname = (hostname: DomainHostnameResponse): void => {
    if (service === undefined || selectedZoneId === undefined) return
    void run(async () => {
      const result = await service.verifyHostname(selectedZoneId, hostname.id)
      setNotice(result.verified
        ? t('domain.notice.hostnameVerified', { name: hostname.hostname })
        : t('domain.notice.hostnamePending', { name: hostname.hostname }))
      setHostnames(await service.listHostnames(selectedZoneId))
    })
  }

  const pickFile = (file: File | undefined): void => {
    if (file === undefined) return
    if (file.size > 4096) {
      setError(t('domain.error.fileTooLarge'))
      return
    }
    if (!isServableVerificationFileName(file.name)
      || !platformAcceptsVerificationExtension(
        verificationForm.platform,
        verificationFileExtension(file.name),
      )) {
      setError(t('domain.error.platformShape', { extension: spec?.extension ?? 'txt' }))
      return
    }
    void file.text().then((content) => {
      setError(undefined)
      setVerificationForm(current => ({ ...current, fileName: file.name, content }))
    })
  }

  const deriveName = (): void => {
    const suggested = suggestVerificationFileName(
      verificationForm.platform,
      verificationForm.content || verificationForm.fileName,
    )
    if (suggested !== undefined) {
      setVerificationForm(current => ({ ...current, fileName: suggested }))
    }
  }

  const uploadVerificationFile = (): void => {
    if (service === undefined || selectedZoneId === undefined) return
    if (!isServableVerificationFileName(verificationForm.fileName)
      || !platformAcceptsVerificationExtension(
        verificationForm.platform,
        verificationFileExtension(verificationForm.fileName),
      )) {
      setError(t('domain.error.platformShape', { extension: spec?.extension ?? 'txt' }))
      return
    }
    const request: CreateDomainVerificationFileRequest = {
      platform: verificationForm.platform,
      fileName: verificationForm.fileName.trim(),
      content: verificationForm.content,
    }
    void run(async () => {
      const created = await service.createVerificationFile(selectedZoneId, request)
      setVerificationForm(EMPTY_VERIFICATION_FORM)
      setNotice(t('domain.notice.fileUploaded', { name: created.fileName }))
      setFiles(await service.listVerificationFiles(selectedZoneId))
    })
  }

  const removeVerificationFile = (file: DomainVerificationFileResponse): void => {
    if (service === undefined || selectedZoneId === undefined) return
    void run(async () => {
      await service.deleteVerificationFile(selectedZoneId, file.id)
      setFiles(await service.listVerificationFiles(selectedZoneId))
    })
  }

  const checkVerificationFile = (file: DomainVerificationFileResponse): void => {
    if (service === undefined || selectedZoneId === undefined) return
    void run(async () => {
      const result = await service.checkVerificationFile(selectedZoneId, file.id)
      setChecks(current => ({ ...current, [file.id]: result }))
    })
  }

  const removeZone = (zone: DomainZoneResponse): void => {
    if (service === undefined) return
    void run(async () => {
      await service.deleteZone(zone.id)
      if (selectedZoneId === zone.id) setSelectedZoneId(undefined)
      await reloadZones()
    })
  }

  const readiness = !available
    ? t('domain.unavailable')
    : !signedIn
      ? t('domain.signInRequired')
      : undefined

  return (
    <WideModal
      open={open}
      onClose={onClose}
      title={t('domain.title')}
      description={t('domain.description')}
      closeLabel={t('domain.close')}
    >
      <div className={css.workspace}>
        {readiness !== undefined ? (
          <div className={css.notice}>
            {readiness}
            {!signedIn && available ? (
              <> <button className={css.button} type="button" onClick={startSignIn}>{t('domain.signIn')}</button></>
            ) : null}
          </div>
        ) : null}
        {error !== undefined ? <div className={css.error} role="alert">{error}</div> : null}
        {notice !== undefined ? <div className={css.notice} role="status">{notice}</div> : null}

        {readiness === undefined ? (
          <>
            <section className={css.section}>
              <h3 className={css.sectionTitle}>{t('domain.zones')}</h3>
              <p className={css.hint}>{t('domain.zonesHint')}</p>
              {zones === undefined ? (
                <p className={css.hint}>{t('domain.loading')}</p>
              ) : zones.length === 0 ? (
                <p className={css.hint}>{t('domain.zonesEmpty')}</p>
              ) : (
                <table className={css.table}>
                  <thead>
                    <tr>
                      <th>{t('domain.column.apex')}</th>
                      <th>{t('domain.column.status')}</th>
                      <th>{t('domain.column.hostnames')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map(zone => (
                      <tr
                        key={zone.id}
                        className={zone.id === selectedZoneId ? css.selected : undefined}
                      >
                        <td className={css.mono}>{zone.apexHostname}</td>
                        <td>{zone.status}</td>
                        <td>{zone.hostnameCount}</td>
                        <td>
                          <div className={css.actions}>
                            <button
                              className={css.button}
                              type="button"
                              onClick={() => { setSelectedZoneId(zone.id) }}
                            >
                              {t('domain.open')}
                            </button>
                            <button
                              className={css.button}
                              type="button"
                              disabled={busy}
                              onClick={() => { removeZone(zone) }}
                            >
                              {t('domain.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className={css.row}>
                <label className={css.field}>
                  <span>{t('domain.field.apex')}</span>
                  <input
                    value={zoneForm.apexHostname}
                    onChange={event => setZoneForm(current => ({ ...current, apexHostname: event.target.value }))}
                    placeholder="example.com"
                  />
                </label>
                <label className={css.field}>
                  <span>{t('domain.field.displayName')}</span>
                  <input
                    value={zoneForm.displayName}
                    onChange={event => setZoneForm(current => ({ ...current, displayName: event.target.value }))}
                  />
                </label>
                <button
                  className={css.buttonPrimary}
                  type="button"
                  disabled={busy || zoneForm.apexHostname.trim() === ''}
                  onClick={addZone}
                >
                  {t('domain.addZone')}
                </button>
              </div>
            </section>

            {selectedZone !== undefined ? (
              <>
                <section className={css.section}>
                  <h3 className={css.sectionTitle}>
                    {t('domain.hostnames')} · <span className={css.mono}>{selectedZone.apexHostname}</span>
                  </h3>
                  {hostnames === undefined ? (
                    <p className={css.hint}>{t('domain.loading')}</p>
                  ) : (
                    <table className={css.table}>
                      <thead>
                        <tr>
                          <th>{t('domain.column.hostname')}</th>
                          <th>{t('domain.column.verification')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {hostnames.map(hostname => (
                          <tr key={hostname.id}>
                            <td className={css.mono}>{hostname.hostname}</td>
                            <td>{hostname.verificationStatus}</td>
                            <td>
                              <div className={css.actions}>
                                <button
                                  className={css.button}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => { verifyHostname(hostname) }}
                                >
                                  {t('domain.verify')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className={css.row}>
                    <label className={css.field}>
                      <span>{t('domain.field.relativeName')}</span>
                      <input
                        value={hostnameForm}
                        onChange={event => setHostnameForm(event.target.value)}
                        placeholder={t('domain.field.hostnamePlaceholder')}
                      />
                    </label>
                    <button
                      className={css.buttonPrimary}
                      type="button"
                      disabled={busy || hostnameForm.trim() === ''}
                      onClick={addHostname}
                    >
                      {t('domain.addHostname')}
                    </button>
                  </div>
                </section>

                <section className={css.section}>
                  <h3 className={css.sectionTitle}>{t('domain.verificationFiles')}</h3>
                  <p className={css.hint}>{t('domain.verificationFilesHint')}</p>
                  {files === undefined ? (
                    <p className={css.hint}>{t('domain.loading')}</p>
                  ) : files.length === 0 ? (
                    <p className={css.hint}>{t('domain.verificationFilesEmpty')}</p>
                  ) : (
                    <table className={css.table}>
                      <thead>
                        <tr>
                          <th>{t('domain.column.fileName')}</th>
                          <th>{t('domain.column.publicUrl')}</th>
                          <th>{t('domain.column.check')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((file) => {
                          const result = checks[file.id]
                          return (
                            <tr key={file.id}>
                              <td className={css.mono}>{file.fileName}</td>
                              <td className={css.mono}>
                                {verificationFilePublicUrl(selectedZone.apexHostname, file.fileName)}
                              </td>
                              <td>
                                {result === undefined
                                  ? '—'
                                  : result.matched
                                    ? t('domain.check.matched')
                                    : result.reachable
                                      ? t('domain.check.mismatch')
                                      : t('domain.check.unreachable')}
                              </td>
                              <td>
                                <div className={css.actions}>
                                  <button
                                    className={css.button}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => { checkVerificationFile(file) }}
                                  >
                                    {t('domain.check')}
                                  </button>
                                  <button
                                    className={css.button}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => { removeVerificationFile(file) }}
                                  >
                                    {t('domain.delete')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  <div className={css.row}>
                    <label className={css.field}>
                      <span>{t('domain.field.platform')}</span>
                      <select
                        value={verificationForm.platform}
                        onChange={event => setVerificationForm(current => ({
                          ...current,
                          platform: event.target.value as DomainVerificationPlatform,
                        }))}
                      >
                        {DOMAIN_VERIFICATION_PLATFORMS.map(platform => (
                          <option key={platform.platform} value={platform.platform}>
                            {t(`domain.platform.${platform.platform}` as never)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={css.field}>
                      <span>{t('domain.field.fileName')}</span>
                      <input
                        className={css.mono}
                        value={verificationForm.fileName}
                        onChange={event => setVerificationForm(current => ({ ...current, fileName: event.target.value }))}
                        placeholder={spec?.fixedFileName ?? spec?.fileNameHint ?? t('domain.field.verificationFileNamePlaceholder')}
                      />
                    </label>
                    <label className={css.field}>
                      <span>{t('domain.field.content')}</span>
                      <input
                        className={css.mono}
                        value={verificationForm.content}
                        onChange={event => setVerificationForm(current => ({ ...current, content: event.target.value }))}
                        placeholder="verification-token"
                      />
                    </label>
                  </div>
                  {spec !== undefined ? <p className={css.hint}>{t(spec.issuedByKey as never)}</p> : null}
                  <div className={css.row}>
                    <label className={css.field}>
                      <span>{t('domain.field.pickFile')}</span>
                      <input
                        type="file"
                        accept=".txt,.html,.xml"
                        onChange={(event) => {
                          pickFile(event.target.files?.[0])
                          event.target.value = ''
                        }}
                      />
                    </label>
                    <button className={css.button} type="button" disabled={busy} onClick={deriveName}>
                      {t('domain.deriveName')}
                    </button>
                    <button
                      className={css.buttonPrimary}
                      type="button"
                      disabled={busy
                        || verificationForm.fileName.trim() === ''
                        || verificationForm.content === ''}
                      onClick={uploadVerificationFile}
                    >
                      {t('domain.upload')}
                    </button>
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </WideModal>
  )
}
