/**
 * Publish-as-template dialog: turns an existing deploy_app into a
 * deploy_app_template — category, platform targets, display copy, visibility,
 * an initial version record, and the template's SOURCE: the app's current
 * code (default), a local .zip archive, a local directory packed
 * .gitignore-aware in the browser, or a git repository binding (with the
 * project subdirectory recorded into the local manifest). Optionally submits
 * the template for review right after creation. The template identity (and a
 * bound git source) is persisted by the caller through the project manifest so
 * repeat runs relate by ID instead of creating duplicates.
 */
import { useEffect, useState } from 'react'
import {
  createDeployAppOperationsService,
  DEPLOY_PACKAGE_TYPE_OPTIONS,
} from '@sdkwork/deployments-pc-console-publishing'
import type {
  AppResponse,
  CreateAppTemplateVersionRequest,
  SdkworkDeployAppClient,
} from '@sdkwork/deployments-app-sdk'
import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import { packDirectory, type PackableFile } from './directoryArchive.ts'
import type { DeployKey } from './locales.ts'
import {
  maxBytesForPackageType,
  packageTypeForPlatforms,
  repoKeyFromUrl,
  repoProviderFromUrl,
  TEMPLATE_PLATFORM_OPTIONS,
  type TemplatePlatformOption,
} from './templatePlatforms.ts'
import css from './DeployDialogs.module.css'

/** One template category as served by `templateCategories.list`. */
interface TemplateCategory {
  id: string
  displayName: string
  status: 'ACTIVE' | 'DISABLED'
}

/** A git repository bound as the template's source at publish time. */
export interface TemplateGitSource {
  /** The https clone URL as submitted. */
  readonly repoUrl: string
  /** The branch recorded with the binding, when given. */
  readonly defaultBranch?: string
  /** The project subdirectory the template packages, when given. */
  readonly subDirectory?: string
}

/** The created template identity handed back for persistence. */
export interface PublishedTemplate {
  id: string
  templateKey: string
  displayName: string
  /** The git source bound at publish time; absent for the app/archive sources. */
  readonly gitSource?: TemplateGitSource
}

/** Where the template's code comes from. */
type TemplateSourceMode = 'app' | 'archive' | 'directory' | 'git'

/** The https clone URLs the dialog is willing to submit. */
const GIT_CLONE_URL_PATTERN = /^https:\/\/\S+$/u

/** Props for the publish-as-template dialog. */
export interface PublishTemplateDialogProps {
  readonly deployClient: SdkworkDeployAppClient
  /** Drive client for the archive upload chain (local zip / packed directory). */
  readonly driveClient: SdkworkDriveAppClient
  /** The source app the template is created from (`deploy_app_template.app_uuid`). */
  readonly app: AppResponse
  /** Host color scheme driving the dialog's dark-token block. */
  readonly theme: 'light' | 'dark'
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly onClose: () => void
  readonly onPublished: (template: PublishedTemplate) => void
}

/** Modal form that creates (and optionally submits) a deploy app template. */
export function PublishTemplateDialog({
  deployClient,
  driveClient,
  app,
  theme,
  t,
  onClose,
  onPublished,
}: PublishTemplateDialogProps) {
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [categoryUuid, setCategoryUuid] = useState<string>('')
  const [templateKey, setTemplateKey] = useState<string>(app.slug)
  const [displayName, setDisplayName] = useState<string>(app.name)
  const [summary, setSummary] = useState<string>(app.description ?? '')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE')
  const [submitForReview, setSubmitForReview] = useState(true)
  const [platforms, setPlatforms] = useState<readonly string[]>([])
  const [version, setVersion] = useState('0.1.0')
  const [changelog, setChangelog] = useState('')
  const [sourceMode, setSourceMode] = useState<TemplateSourceMode>('app')
  const [archiveFile, setArchiveFile] = useState<File | undefined>(undefined)
  const [directoryFiles, setDirectoryFiles] = useState<readonly PackableFile[]>([])
  const [gitUrl, setGitUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [gitSubDirectory, setGitSubDirectory] = useState('')
  const [stage, setStage] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    deployClient.template.templateCategories
      .list()
      .then((page) => {
        if (cancelled) return
        const active = page.items.filter(category => category.status === 'ACTIVE')
        setCategories(active)
        setCategoryUuid(current => (current === '' ? (active[0]?.id ?? '') : current))
      })
      .catch((cause) => {
        if (cancelled) return
        setLoadError(
          t('template.loadCategoriesFailed', {
            message: String(cause instanceof Error ? cause.message : cause),
          }),
        )
      })
    return () => {
      cancelled = true
    }
  }, [deployClient, t])

  const togglePlatform = (id: string): void => {
    setPlatforms(current =>
      current.includes(id) ? current.filter(entry => entry !== id) : [...current, id])
  }

  /** Strip the browser's root-name segment off a directory selection path. */
  const readDirectorySelection = (fileList: FileList): void => {
    const files: PackableFile[] = []
    for (const file of fileList) {
      const relative = file.webkitRelativePath.replace(/^[^/]+\//u, '')
      if (relative === '') continue
      files.push({
        path: relative,
        name: file.name,
        size: file.size,
        arrayBuffer: () => file.arrayBuffer(),
      })
    }
    setDirectoryFiles(files)
  }

  const publish = async (): Promise<void> => {
    if (categoryUuid === '' || templateKey.trim() === '' || displayName.trim() === '') return
    if (sourceMode === 'archive' && archiveFile === undefined) return
    if (sourceMode === 'directory' && directoryFiles.length === 0) return
    if (sourceMode === 'git' && !GIT_CLONE_URL_PATTERN.test(gitUrl.trim())) return
    setBusy(true)
    setError(undefined)
    try {
      const platformTargets = [...platforms]
      let initialVersion: CreateAppTemplateVersionRequest | undefined
      let gitSource: TemplateGitSource | undefined
      if (sourceMode === 'archive' || sourceMode === 'directory') {
        setStage(t('template.source.packing'))
        const packageType = packageTypeForPlatforms(platformTargets)
        const maxBytes = maxBytesForPackageType(packageType)
        let file: File
        let checksumSha256: string
        let byteSize: number
        if (sourceMode === 'archive' && archiveFile !== undefined) {
          file = archiveFile
          checksumSha256 = await createDeployAppOperationsService({ deployClient, driveClient })
            .archiveChecksum(file)
          byteSize = file.size
        } else {
          const pack = await packDirectory(directoryFiles, maxBytes)
          file = new File([pack.archive], `${templateKey.trim()}-${version.trim()}.zip`, { type: 'application/zip' })
          checksumSha256 = pack.checksumSha256
          byteSize = pack.totalBytes
        }
        setStage(t('template.source.uploading'))
        const ops = createDeployAppOperationsService({ deployClient, driveClient })
        const uploaded = await ops.uploadCodeFromArchive({
          appId: app.id,
          packageType,
          archive: { file, fileName: file.name, contentType: 'application/zip', checksumSha256 },
          onProgress: (progress) => {
            if (progress.totalBytes > 0) {
              setStage(t('template.source.uploadProgress', {
                percent: String(Math.round((progress.uploadedBytes / progress.totalBytes) * 100)),
              }))
            }
          },
        })
        initialVersion = {
          version: version.trim(),
          ...(changelog.trim() === '' ? {} : { changelog: changelog.trim() }),
          platformTargets,
          artifactUuid: uploaded.artifactId,
          checksumSha256,
          packageSizeBytes: String(byteSize),
        }
      } else {
        initialVersion = {
          version: version.trim(),
          ...(changelog.trim() === '' ? {} : { changelog: changelog.trim() }),
          platformTargets,
        }
        if (sourceMode === 'git') {
          gitSource = {
            repoUrl: gitUrl.trim(),
            ...(gitBranch.trim() === '' ? {} : { defaultBranch: gitBranch.trim() }),
            ...(gitSubDirectory.trim() === '' ? {} : { subDirectory: gitSubDirectory.trim() }),
          }
        }
      }

      const created = await deployClient.template.appTemplates.create(
        {
          appUuid: app.id,
          categoryUuid,
          templateKey: templateKey.trim(),
          displayName: displayName.trim(),
          summary: summary.trim(),
          visibility,
          initialVersion,
        },
        { idempotencyKey: newIdempotencyKey() },
      )
      if (gitSource !== undefined) {
        try {
          const ops = createDeployAppOperationsService({ deployClient, driveClient })
          await ops.connectGitSource(app.id, {
            repoKey: repoKeyFromUrl(gitSource.repoUrl),
            repoProvider: repoProviderFromUrl(gitSource.repoUrl),
            repoUrl: gitSource.repoUrl,
            ...(gitSource.defaultBranch === undefined ? {} : { defaultBranch: gitSource.defaultBranch }),
            cloneMode: 'FULL',
          })
        } catch (cause) {
          setError(
            t('template.git.connectFailed', {
              message: String(cause instanceof Error ? cause.message : cause),
            }),
          )
          setBusy(false)
          setStage(undefined)
          return
        }
      }
      const finalTemplate =
        submitForReview ? await deployClient.template.appTemplates.submit(created.id) : created
      onPublished({
        id: finalTemplate.id,
        templateKey: finalTemplate.templateKey,
        displayName: finalTemplate.displayName,
        ...(gitSource === undefined ? {} : { gitSource }),
      })
    } catch (cause) {
      setError(
        t('template.createFailed', {
          message: String(cause instanceof Error ? cause.message : cause),
        }),
      )
      setBusy(false)
      setStage(undefined)
    }
  }

  const packageTypeLabel = t(
    DEPLOY_PACKAGE_TYPE_OPTIONS.find(option =>
      option.value === packageTypeForPlatforms(platforms))?.labelKey as DeployKey | undefined
      ?? 'template.source.genericPackage',
  )

  return (
    <div
      className={css.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('template.title')}
      data-theme={theme}
    >
      <div className={css.modal}>
        <div className={css.modalHeader}>
          <div>
            <h3 className={css.modalTitle}>{t('template.title')}</h3>
            <p className={css.modalSubtitle}>{t('template.subtitle', { name: app.name })}</p>
          </div>
          <button type="button" className={css.closeButton} onClick={onClose} aria-label={t('common.cancel')}>
            ✕
          </button>
        </div>

        <label className={css.fieldLabel}>
          {t('template.category')}
          <select
            className={css.input}
            value={categoryUuid}
            onChange={(event) => { setCategoryUuid(event.target.value) }}
          >
            {categories.length === 0 && <option value="">—</option>}
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className={css.fieldLabel}>
          {t('template.platform')}
          <div className={css.chipRow} role="group" aria-label={t('template.platform')}>
            {TEMPLATE_PLATFORM_OPTIONS.map((option: TemplatePlatformOption) => (
              <button
                key={option.id}
                type="button"
                className={`${css.chip}${platforms.includes(option.id) ? ` ${css.chipActive}` : ''}`}
                aria-pressed={platforms.includes(option.id)}
                onClick={() => { togglePlatform(option.id) }}
              >
                {t(option.labelKey as DeployKey)}
              </button>
            ))}
          </div>
        </label>

        <div className={css.fieldLabel}>
          {t('template.source')}
          {SOURCE_MODE_OPTIONS.map(option => (
            <label key={option.mode} className={css.modeRow}>
              <input
                type="radio"
                name="template-source"
                checked={sourceMode === option.mode}
                onChange={() => { setSourceMode(option.mode) }}
              />
              <span>{t(option.labelKey as DeployKey)}</span>
            </label>
          ))}
          {sourceMode === 'archive' && (
            <input
              type="file"
              className={css.input}
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(event) => { setArchiveFile(event.target.files?.[0]) }}
            />
          )}
          {sourceMode === 'directory' && (
            <>
              <input
                ref={(element) => {
                  // React types carry no `webkitdirectory`; the attribute is
                  // what makes the picker hand back the whole directory.
                  if (element !== null) element.setAttribute('webkitdirectory', '')
                }}
                type="file"
                className={css.input}
                multiple
                onChange={(event) => {
                  const selection = event.target.files
                  if (selection !== null) readDirectorySelection(selection)
                }}
              />
              {directoryFiles.length > 0 && (
                <span className={css.hint}>
                  {t('template.source.directoryPicked', { count: String(directoryFiles.length) })}
                </span>
              )}
            </>
          )}
          {sourceMode === 'git' && (
            <>
              <input
                type="url"
                className={css.input}
                placeholder={t('template.git.urlPlaceholder')}
                value={gitUrl}
                aria-invalid={gitUrl.trim() !== '' && !GIT_CLONE_URL_PATTERN.test(gitUrl.trim())}
                onChange={(event) => { setGitUrl(event.target.value) }}
              />
              {gitUrl.trim() !== '' && !GIT_CLONE_URL_PATTERN.test(gitUrl.trim()) && (
                <span className={css.errorText} role="alert">{t('template.git.invalidUrl')}</span>
              )}
              <input
                type="text"
                className={css.input}
                placeholder={t('template.git.branchPlaceholder')}
                value={gitBranch}
                onChange={(event) => { setGitBranch(event.target.value) }}
              />
              <input
                type="text"
                className={css.input}
                placeholder={t('template.git.subDirectoryPlaceholder')}
                value={gitSubDirectory}
                onChange={(event) => { setGitSubDirectory(event.target.value) }}
              />
            </>
          )}
          {(sourceMode === 'archive' || sourceMode === 'directory') && (
            <span className={css.hint}>{t('template.source.packageType', { type: packageTypeLabel })}</span>
          )}
          {sourceMode === 'app' && (
            <span className={css.hint}>{t('template.source.appHint')}</span>
          )}
        </div>

        <label className={css.fieldLabel}>
          {t('template.displayName')}
          <input
            className={css.input}
            value={displayName}
            onChange={(event) => { setDisplayName(event.target.value) }}
          />
        </label>

        <label className={css.fieldLabel}>
          {t('template.key')}
          <input
            className={css.input}
            value={templateKey}
            onChange={(event) => { setTemplateKey(event.target.value) }}
          />
        </label>

        <label className={css.fieldLabel}>
          {t('template.summary')}
          <textarea
            className={css.input}
            rows={3}
            value={summary}
            onChange={(event) => { setSummary(event.target.value) }}
          />
        </label>

        <div className={css.fieldLabel}>
          <div className={css.chipRow}>
            <label className={css.fieldLabel}>
              {t('template.version')}
              <input
                className={css.input}
                value={version}
                onChange={(event) => { setVersion(event.target.value) }}
              />
            </label>
            <label className={css.fieldLabel}>
              {t('template.changelog')}
              <input
                className={css.input}
                value={changelog}
                onChange={(event) => { setChangelog(event.target.value) }}
              />
            </label>
          </div>
        </div>

        <label className={css.fieldLabel}>
          {t('template.visibility')}
          <select
            className={css.input}
            value={visibility}
            onChange={(event) => { setVisibility(event.target.value === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE') }}
          >
            <option value="PRIVATE">{t('template.visibility.private')}</option>
            <option value="PUBLIC">{t('template.visibility.public')}</option>
          </select>
        </label>

        <label className={css.checkboxRow}>
          <input
            type="checkbox"
            checked={submitForReview}
            onChange={(event) => { setSubmitForReview(event.target.checked) }}
          />
          {t('template.submitReview')}
        </label>

        {loadError !== undefined && <p className={css.errorText} role="alert">{loadError}</p>}
        {error !== undefined && <p className={css.errorText} role="alert">{error}</p>}

        <div className={css.modalActions}>
          <button type="button" className={css.secondaryButton} onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={css.primaryButton}
            disabled={busy || categoryUuid === '' || templateKey.trim() === '' || displayName.trim() === ''
              || (sourceMode === 'archive' && archiveFile === undefined)
              || (sourceMode === 'directory' && directoryFiles.length === 0)
              || (sourceMode === 'git' && !GIT_CLONE_URL_PATTERN.test(gitUrl.trim()))}
            onClick={() => { void publish() }}
          >
            {busy ? '…' : t('template.create')}
          </button>
        </div>
        {stage !== undefined && <p className={css.hint} role="status">{stage}</p>}
      </div>
    </div>
  )
}

/** The source-mode radio rows, in display order. */
const SOURCE_MODE_OPTIONS: readonly { mode: TemplateSourceMode; labelKey: string }[] = [
  { mode: 'app', labelKey: 'template.source.app' },
  { mode: 'archive', labelKey: 'template.source.archive' },
  { mode: 'directory', labelKey: 'template.source.directory' },
  { mode: 'git', labelKey: 'template.source.git' },
]

/** Idempotency key for the template create call (browser crypto with a fallback). */
function newIdempotencyKey(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
