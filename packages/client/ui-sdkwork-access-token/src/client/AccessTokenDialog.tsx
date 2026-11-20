/**
 * The access-token initializer dialog: one `shell.overlay` entry rendering the
 * project's manifest-bearing application roots, the token scope choice, the
 * application type per root, the environment profile matrix, a claims preview,
 * and the per-file result of the last initialization.
 *
 * Everything the dialog shows is derived from the project manifests; the
 * operator chooses the token level (tenant-level or organization-level), can
 * override the deployment anchor or tenant id, and can change any root's
 * application type when the root follows a non-default delivery.
 */
import { useEffect, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  AccessTokenLevel, AccessTokenProfile, ClientProfileId, RuntimeTarget,
} from './accessToken.ts'
import {
  buildPublicApplicationAccessToken, clientProfileIds, summarizePublicApplicationAccessToken,
} from './accessToken.ts'
import type { ApplicationTypeId } from './applicationTypes.ts'
import { APPLICATION_TYPES, applicationTypeById } from './applicationTypes.ts'
import type { AccessTokenFileSystem, AccessTokenProject } from './project.ts'
import { describeAccessTokenProject } from './project.ts'
import type { AccessTokenInitializeResult, AccessTokenRootSelection } from './initializer.ts'
import { initializeAccessTokens } from './initializer.ts'
import { messageOf } from './errors.ts'
import { SignedTokenPanel } from './SignedTokenPanel.tsx'
import type { SignedAccessFeatures } from './SignedTokenPanel.tsx'
import type { AccessTokenCredentialsFace } from './credentials-contract.ts'
import type { AccessTokenDialogTarget } from './store.ts'
import type { createAccessTokenDialogStore } from './store.ts'
import type { SdkworkAccessTokenKey } from './locales.ts'
import css from './AccessTokenDialog.module.css'

/** Injected business face: the directory bridge, the DSH-home credentials, and the dismiss gesture. */
export interface AccessTokenDialogInjected {
  /** Current `uiWorkspace` directory bridge; undefined in a composition without it. */
  fileSystem: () => AccessTokenFileSystem | undefined
  /** Close the dialog. */
  onClose: () => void
  /** Authenticated signed-token transport (login, my apps, exchange). */
  signed: SignedAccessFeatures
  /** Remembered-login face over the Host settings section. */
  credentials: AccessTokenCredentialsFace
}

/** Form state of one open dialog, derived from the scanned project. */
interface FormState {
  /** Selected application roots by absolute root path. */
  selected: Record<string, boolean | undefined>
  /** Chosen application type per root. */
  types: Record<string, ApplicationTypeId | undefined>
  /** Chosen runtime target per root. */
  runtimeTargets: Record<string, RuntimeTarget | undefined>
  /** Token level. */
  level: AccessTokenLevel
  /** Organization binding for an organization-level token. */
  organizationId: string
  /** Tenant override (empty means each manifest's own tenant). */
  tenantId: string
  /** Deployment anchor override (empty means each manifest's own app id). */
  appId: string
  /** Selected profile ids. */
  profileIds: string[]
}

/** Load state of the dialog for one project. */
type LoadState =
  | { phase: 'closed' }
  | { phase: 'loading' }
  | { phase: 'unavailable' }
  | { phase: 'error'; message: string }
  | { phase: 'empty'; project: AccessTokenProject }
  | { phase: 'ready'; project: AccessTokenProject; form: FormState }

/** Copy keys of the application-type labels. */
const APPLICATION_TYPE_LABEL: Record<ApplicationTypeId, SdkworkAccessTokenKey> = {
  vite: 'dialog.applicationType.vite',
  flutter: 'dialog.applicationType.flutter',
  'mini-program': 'dialog.applicationType.mini-program',
  'harmony-native': 'dialog.applicationType.harmony-native',
  'json-runtime': 'dialog.applicationType.json-runtime',
}

/** All profile ids of the matrix. */
const ALL_PROFILE_IDS: readonly ClientProfileId[] = clientProfileIds()

/**
 * First item of a list, with absence explicit.
 * @param items - any list.
 * @returns the first item, or undefined when the list is empty.
 */
function firstOf<T>(items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[0]
}

/** Build the form state a freshly scanned project starts with. */
function initialForm(project: AccessTokenProject): FormState {
  const selected: Record<string, boolean> = {}
  const types: Record<string, ApplicationTypeId> = {}
  const runtimeTargets: Record<string, RuntimeTarget> = {}
  for (const candidate of project.candidates) {
    selected[candidate.rootPath] = true
    types[candidate.rootPath] = candidate.detectedTypeId
    runtimeTargets[candidate.rootPath] = applicationTypeById(candidate.detectedTypeId)?.defaultRuntimeTarget
      ?? 'browser'
  }
  // An application root whose manifest already binds a non-zero organization is
  // an organization-level surface; default the scope to match it.
  const organizationId = project.candidates
    .map(candidate => candidate.identity.organizationId)
    .find(value => value !== '' && value !== '0') ?? ''
  return {
    selected,
    types,
    runtimeTargets,
    level: organizationId === '' ? 'tenant' : 'organization',
    organizationId,
    tenantId: '',
    appId: '',
    profileIds: ALL_PROFILE_IDS.map(profile => profile.profileId),
  }
}

/** Resolve one profile id to its profile shape. */
function profileOf(profileId: string): AccessTokenProfile | undefined {
  const profile = ALL_PROFILE_IDS.find(candidate => candidate.profileId === profileId)
  return profile === undefined
    ? undefined
    : { deploymentProfile: profile.deploymentProfile, environment: profile.environment }
}

/** One generated sample of the current form, or the reason it cannot be built. */
type Preview =
  | { kind: 'claims'; claims: ReturnType<typeof summarizePublicApplicationAccessToken> }
  | { kind: 'none' }
  | { kind: 'error'; message: string }

/** Full component props: overlay owner share + store + injected face + locale seat. */
export type AccessTokenDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createAccessTokenDialogStore>>
  & PropsLocale<'sdkworkAccessToken'>
  & InjectFace<AccessTokenDialogInjected>

/**
 * Render the initializer dialog for the project the workspace row opened.
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the dialog element tree, or null while closed.
 */
export function AccessTokenDialog(props: AccessTokenDialogProps) {
  const { useStore, fileSystem, onClose, signed, credentials, t } = props
  const open = useStore(state => state.open)
  const target = useStore(state => state.target)
  const [mode, setMode] = useState<'public' | 'signed'>('public')
  const [load, setLoad] = useState<LoadState>({ phase: 'closed' })
  const [result, setResult] = useState<AccessTokenInitializeResult | undefined>(undefined)
  const [running, setRunning] = useState(false)
  const [formError, setFormError] = useState<string | undefined>(undefined)

  // Scan the opened project once per (open, target) change. The dialog is the
  // only reader of this data, so the scan result stays component-local.
  useEffect(() => {
    setResult(undefined)
    setFormError(undefined)
    setRunning(false)
    setMode('public')
    if (!open || target === null) {
      setLoad({ phase: 'closed' })
      return
    }
    const bridge = fileSystem()
    if (bridge === undefined) {
      setLoad({ phase: 'unavailable' })
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setLoad({ phase: 'loading' })
    void describeAccessTokenProject(bridge, target.directory, controller.signal)
      .then((project) => {
        if (cancelled) return
        setLoad(project.candidates.length === 0
          ? { phase: 'empty', project }
          : { phase: 'ready', project, form: initialForm(project) })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoad({ phase: 'error', message: messageOf(error) })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [open, target, fileSystem])

  if (!open || target === null) return null

  const dismiss = (): void => {
    if (running) return
    onClose()
  }

  const updateForm = (patch: Partial<FormState>): void => {
    setLoad(state => state.phase === 'ready'
      ? { ...state, form: { ...state.form, ...patch } }
      : state)
  }

  const setRootType = (rootPath: string, typeId: ApplicationTypeId): void => {
    setLoad((state) => {
      if (state.phase !== 'ready') return state
      const type = applicationTypeById(typeId)
      return {
        ...state,
        form: {
          ...state.form,
          types: { ...state.form.types, [rootPath]: typeId },
          runtimeTargets: {
            ...state.form.runtimeTargets,
            [rootPath]: type?.defaultRuntimeTarget ?? state.form.runtimeTargets[rootPath] ?? 'browser',
          },
        },
      }
    })
  }

  const setRootRuntimeTarget = (rootPath: string, runtimeTarget: RuntimeTarget): void => {
    setLoad(state => state.phase === 'ready'
      ? {
        ...state,
        form: {
          ...state.form,
          runtimeTargets: { ...state.form.runtimeTargets, [rootPath]: runtimeTarget },
        },
      }
      : state)
  }

  const toggleProfile = (profileId: string, checked: boolean): void => {
    setLoad((state) => {
      if (state.phase !== 'ready') return state
      const profileIds = checked
        ? [...new Set([...state.form.profileIds, profileId])]
        : state.form.profileIds.filter(id => id !== profileId)
      return { ...state, form: { ...state.form, profileIds } }
    })
  }

  const ready = load.phase === 'ready' ? load : undefined
  const form = ready?.form
  const selectedCandidates = ready === undefined || form === undefined
    ? []
    : ready.project.candidates.filter(candidate => form.selected[candidate.rootPath])
  const selectedProfiles = form === undefined
    ? []
    : ALL_PROFILE_IDS
      .filter(profile => form.profileIds.includes(profile.profileId))
      .map(profile => profileOf(profile.profileId))
      .filter((profile): profile is AccessTokenProfile => profile !== undefined)
  const selections: AccessTokenRootSelection[] = ready === undefined || form === undefined
    ? []
    : selectedCandidates.map(candidate => ({
      candidate,
      applicationTypeId: form.types[candidate.rootPath] ?? candidate.detectedTypeId,
      runtimeTarget: form.runtimeTargets[candidate.rootPath]
        ?? applicationTypeById(candidate.detectedTypeId)?.defaultRuntimeTarget
        ?? 'browser',
    }))
  const fileCount = selections.length * selectedProfiles.length

  const preview: Preview = (() => {
    if (form === undefined) return { kind: 'none' }
    const selection = firstOf(selections)
    const profile = firstOf(selectedProfiles)
    if (selection === undefined || profile === undefined) return { kind: 'none' }
    try {
      const token = buildPublicApplicationAccessToken({
        identity: {
          appId: form.appId.trim() || selection.candidate.identity.appId,
          tenantId: form.tenantId.trim() || selection.candidate.identity.tenantId,
          organizationId: form.organizationId,
          permissionScope: selection.candidate.identity.permissionScope,
        },
        profile,
        runtimeTarget: selection.runtimeTarget,
        level: form.level,
      })
      return { kind: 'claims', claims: summarizePublicApplicationAccessToken(token) }
    } catch (error: unknown) {
      return { kind: 'error', message: messageOf(error) }
    }
  })()

  const onInitialize = (): void => {
    if (form === undefined || running) return
    if (selections.length === 0) {
      setFormError(t('dialog.validation.noRoot'))
      return
    }
    if (selectedProfiles.length === 0) {
      setFormError(t('dialog.validation.noProfile'))
      return
    }
    if (form.level === 'organization' && !/^[1-9][0-9]*$/u.test(form.organizationId.trim())) {
      setFormError(t('dialog.validation.organizationId'))
      return
    }
    const bridge = fileSystem()
    if (bridge === undefined) {
      setFormError(t('dialog.unavailable'))
      return
    }
    setFormError(undefined)
    setResult(undefined)
    setRunning(true)
    void initializeAccessTokens({
      fs: bridge,
      roots: selections,
      level: form.level,
      organizationId: form.organizationId,
      tenantId: form.tenantId,
      appId: form.appId,
      profiles: selectedProfiles,
    }).then(
      (next) => { setResult(next) },
      (error: unknown) => { setFormError(messageOf(error)) },
    ).finally(() => { setRunning(false) })
  }

  const footer = mode === 'signed'
    ? (
      <div className={css.actions}>
        <button type="button" className={css.submit} onClick={onClose}>{t('dialog.done')}</button>
      </div>
    )
    : result !== undefined
      ? (
        <div className={css.actions}>
          {result.failed > 0 && (
            <button type="button" className={css.cancel} onClick={() => { setResult(undefined) }}>
              {t('dialog.retry')}
            </button>
          )}
          <button type="button" className={css.submit} onClick={onClose}>{t('dialog.done')}</button>
        </div>
      )
      : (
        <div className={css.actions}>
          <button type="button" className={css.cancel} onClick={dismiss} disabled={running}>
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            className={css.submit}
            onClick={onInitialize}
            disabled={running || ready === undefined}
          >
            {running ? t('dialog.initializing') : t('dialog.initialize')}
          </button>
        </div>
      )

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={t('dialog.title')}
      closeLabel={t('dialog.close')}
      description={t('dialog.description')}
      footer={footer}
      className={css.dialog}
    >
      <div className={css.body}>
        <p className={css.pathLine} title={target.directory}>
          <span className={css.pathLabel}>{t('dialog.project')}</span>
          <code className={css.path}>{target.directory}</code>
        </p>
        <div className={css.modeRow} role="radiogroup" aria-label={t('mode.label')}>
          <label className={css.modeCell}>
            <input
              type="radio"
              name="sdkwork-access-token-mode"
              checked={mode === 'public'}
              onChange={() => { setMode('public') }}
            />
            <span className={css.modeName}>{t('mode.public')}</span>
            <span className={css.modeHint}>{t('mode.public.hint')}</span>
          </label>
          <label className={css.modeCell}>
            <input
              type="radio"
              name="sdkwork-access-token-mode"
              checked={mode === 'signed'}
              onChange={() => { setMode('signed') }}
            />
            <span className={css.modeName}>{t('mode.signed')}</span>
            <span className={css.modeHint}>{t('mode.signed.hint')}</span>
          </label>
        </div>
        {mode === 'public' && (load.phase === 'closed' || load.phase === 'loading')
          && <p className={css.note}>{t('dialog.loading')}</p>}
        {mode === 'public' && load.phase === 'unavailable' && <p className={css.note}>{t('dialog.unavailable')}</p>}
        {mode === 'public' && load.phase === 'error' && (
          <p className={css.error}>{t('dialog.error', { message: load.message })}</p>
        )}
        {mode === 'public' && load.phase === 'empty' && (
          <div className={css.note}>
            <p>{t('dialog.empty')}</p>
            <p className={css.noteSecondary}>{t('dialog.empty.scope', { directory: load.project.directory })}</p>
          </div>
        )}
        {mode === 'signed' && (
          <SignedTokenPanel
            signed={signed}
            savedCredentials={credentials.read(target.directory)}
            saveCredentials={input => credentials.save(target.directory, input)}
            t={(key, params) => t(key as SdkworkAccessTokenKey, params)}
          />
        )}
        {mode === 'public' && ready !== undefined && form !== undefined && (
          <>
            <section className={css.section}>
              <h3 className={css.sectionTitle}>{t('dialog.roots')}</h3>
              <div className={css.rootList}>
                {ready.project.candidates.map((candidate) => {
                  const typeId = form.types[candidate.rootPath] ?? candidate.detectedTypeId
                  const type = applicationTypeById(typeId)
                  const runtimeTarget = form.runtimeTargets[candidate.rootPath]
                    ?? type?.defaultRuntimeTarget
                    ?? 'browser'
                  return (
                    <div key={candidate.rootPath} className={css.rootRow}>
                      <label className={css.rootSelect}>
                        <input
                          type="checkbox"
                          checked={form.selected[candidate.rootPath]}
                          onChange={(event) => {
                            updateForm({
                              selected: { ...form.selected, [candidate.rootPath]: event.target.checked },
                            })
                          }}
                        />
                        <span className={css.rootName}>{candidate.displayName}</span>
                        <span className={css.rootKind}>
                          {t(candidate.isProjectRoot ? 'dialog.root.project' : 'dialog.root.apps')}
                        </span>
                      </label>
                      <span className={css.rootIdentity} title={candidate.rootPath}>
                        {t('dialog.root.identity', {
                          appId: candidate.identity.appId === '' ? '—' : candidate.identity.appId,
                        })}
                      </span>
                      <label className={css.rootField}>
                        <span className={css.fieldLabel}>{t('dialog.root.type')}</span>
                        <select
                          className={css.select}
                          value={typeId}
                          onChange={(event) => { setRootType(candidate.rootPath, event.target.value as ApplicationTypeId) }}
                        >
                          {APPLICATION_TYPES.map(option => (
                            <option key={option.id} value={option.id}>
                              {t(APPLICATION_TYPE_LABEL[option.id])}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={css.rootField}>
                        <span className={css.fieldLabel}>{t('dialog.root.runtime')}</span>
                        <select
                          className={css.select}
                          value={runtimeTarget}
                          onChange={(event) => {
                            setRootRuntimeTarget(candidate.rootPath, event.target.value as RuntimeTarget)
                          }}
                        >
                          {(type?.runtimeTargets ?? ['browser']).map(target => (
                            <option key={target} value={target}>{target}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className={css.section}>
              <h3 className={css.sectionTitle}>{t('dialog.level')}</h3>
              <div className={css.levelRow}>
                <label className={css.levelCell}>
                  <input
                    type="radio"
                    name="sdkwork-access-token-level"
                    checked={form.level === 'tenant'}
                    onChange={() => { updateForm({ level: 'tenant' }) }}
                  />
                  <span className={css.levelName}>{t('dialog.level.tenant')}</span>
                  <span className={css.levelHint}>{t('dialog.level.tenant.hint')}</span>
                </label>
                <label className={css.levelCell}>
                  <input
                    type="radio"
                    name="sdkwork-access-token-level"
                    checked={form.level === 'organization'}
                    onChange={() => { updateForm({ level: 'organization' }) }}
                  />
                  <span className={css.levelName}>{t('dialog.level.organization')}</span>
                  <span className={css.levelHint}>{t('dialog.level.organization.hint')}</span>
                </label>
              </div>
              <div className={css.fieldRow}>
                {form.level === 'organization' && (
                  <label className={css.field}>
                    <span className={css.fieldLabel}>{t('dialog.organizationId')}</span>
                    <input
                      className={css.input}
                      type="text"
                      inputMode="numeric"
                      value={form.organizationId}
                      placeholder={t('dialog.organizationId.placeholder')}
                      onChange={(event) => { updateForm({ organizationId: event.target.value }) }}
                    />
                  </label>
                )}
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('dialog.tenantId')}</span>
                  <input
                    className={css.input}
                    type="text"
                    inputMode="numeric"
                    value={form.tenantId}
                    placeholder={t('dialog.tenantId.placeholder')}
                    onChange={(event) => { updateForm({ tenantId: event.target.value }) }}
                  />
                </label>
                <label className={css.field}>
                  <span className={css.fieldLabel}>{t('dialog.appId')}</span>
                  <input
                    className={css.input}
                    type="text"
                    value={form.appId}
                    placeholder={t('dialog.appId.placeholder')}
                    onChange={(event) => { updateForm({ appId: event.target.value }) }}
                  />
                </label>
              </div>
            </section>

            <section className={css.section}>
              <div className={css.sectionHeader}>
                <h3 className={css.sectionTitle}>{t('dialog.profiles')}</h3>
                <div className={css.profileActions}>
                  <button
                    type="button"
                    className={css.linkButton}
                    onClick={() => { updateForm({ profileIds: ALL_PROFILE_IDS.map(profile => profile.profileId) }) }}
                  >
                    {t('dialog.profiles.all')}
                  </button>
                  <button
                    type="button"
                    className={css.linkButton}
                    onClick={() => { updateForm({ profileIds: [] }) }}
                  >
                    {t('dialog.profiles.none')}
                  </button>
                </div>
              </div>
              <div className={css.profileGrid}>
                {ALL_PROFILE_IDS.map(profile => (
                  <label key={profile.profileId} className={css.profileCell}>
                    <input
                      type="checkbox"
                      checked={form.profileIds.includes(profile.profileId)}
                      onChange={(event) => { toggleProfile(profile.profileId, event.target.checked) }}
                    />
                    <span>{profile.profileId}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className={css.section}>
              <h3 className={css.sectionTitle}>{t('dialog.preview')}</h3>
              {preview.kind === 'claims' && (
                <dl className={css.claims}>
                  <dt>{t('dialog.preview.app')}</dt><dd>{preview.claims.appId}</dd>
                  <dt>{t('dialog.preview.tenant')}</dt><dd>{preview.claims.tenantId}</dd>
                  <dt>{t('dialog.preview.organization')}</dt><dd>{preview.claims.organizationId}</dd>
                  <dt>{t('dialog.preview.loginScope')}</dt><dd>{preview.claims.loginScope}</dd>
                  <dt>{t('dialog.preview.ownershipScope')}</dt><dd>{preview.claims.ownershipScope}</dd>
                  <dt>{t('dialog.preview.runtime')}</dt><dd>{preview.claims.runtimeTarget}</dd>
                  <dt>{t('dialog.preview.environment')}</dt><dd>{preview.claims.environment}</dd>
                  <dt>{t('dialog.preview.permission')}</dt><dd>{preview.claims.permissionScope.join(', ')}</dd>
                </dl>
              )}
              {preview.kind === 'error' && <p className={css.error}>{preview.message}</p>}
              <p className={css.noteSecondary}>
                {t('dialog.summary', {
                  roots: String(selections.length),
                  profiles: String(selectedProfiles.length),
                  files: String(fileCount),
                })}
              </p>
            </section>
          </>
        )}
        {mode === 'public' && formError !== undefined && <p className={css.error} role="alert">{formError}</p>}
        {mode === 'public' && result !== undefined && (
          <section className={css.section}>
            <h3 className={css.sectionTitle}>{t('dialog.result.title')}</h3>
            <p className={css.resultSummary}>
              {t('dialog.result.written', { count: String(result.written) })}
              {' · '}
              {t('dialog.result.unchanged', { count: String(result.unchanged) })}
              {result.failed > 0 && ` · ${t('dialog.result.failed', { count: String(result.failed) })}`}
            </p>
            <ul className={css.fileList}>
              {result.files.map(file => (
                <li key={`${file.rootPath}:${file.profileId}`} className={css.fileRow}>
                  <span className={css[`status_${file.status}`]}>{t(`dialog.result.status.${file.status}`)}</span>
                  <code className={css.filePath} title={file.path}>{file.path}</code>
                  {file.message !== undefined && <span className={css.fileError}>{file.message}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  )
}

/** Re-export the captured target shape for tests composing the store. */
export type { AccessTokenDialogTarget }
