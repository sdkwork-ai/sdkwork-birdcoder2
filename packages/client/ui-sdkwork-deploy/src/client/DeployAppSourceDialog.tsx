/**
 * Source binding dialog: records where an app's source lives.
 *
 * Two modes cover the two source forms an app carries beside its deployment
 * code (the compiled artifacts the upload/publish flows produce):
 *
 * - **本地目录** — the project directory hosting the source; recorded in the
 *   manifest's `metadata.publishing.birdcoder.sourceDirectory` and consumed by
 *   the build port's 打包 and the publish dialog's default directory.
 * - **Git 仓库** — an https clone URL with an optional default branch and the
 *   project subdirectory the app packages. When the project's manifest
 *   records a linked app, the binding also lands on the platform through
 *   `connectGitSource` (the same call the template flow makes); the URL,
 *   branch, and subdirectory are always recorded in the manifest so the
 *   source spec travels with the project.
 *
 * Everything writes through the host's read-modify-write manifest bridge and
 * never blocks on failure: the outcome reports through the caller's banner.
 */
import { useEffect, useState } from 'react'
import { createDeployAppOperationsService } from '@sdkwork/deployments-pc-console-publishing'
import {
  repoKeyFromUrl,
  repoProviderFromUrl,
} from './templatePlatforms.ts'
import type { DeployHost } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import css from './DeployDialogs.module.css'

/** Full props for the source binding dialog. */
export interface DeployAppSourceDialogProps {
  /** Host adapter providing the manifest bridge, directory picker and clients. */
  readonly host: DeployHost
  /** The project directory whose manifest records the binding. */
  readonly directory: string
  /** Host color scheme driving the dialog's dark-token block. */
  readonly theme: 'light' | 'dark'
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Report one outcome to the owner for its banner. */
  readonly onDone?: ((outcome: { readonly text: string; readonly tone: 'success' | 'error' }) => void) | undefined
  /** Close the dialog; the owner rescans the project's manifest. */
  readonly onClose: () => void
}

/** The source form the dialog currently edits. */
type SourceMode = 'local' | 'git'

/**
 * Render the source binding dialog over the project's current manifest.
 * @param props - the host adapter, the project directory, theme/locale seats,
 *   and the outcome/close callbacks.
 * @returns the modal surface.
 */
export function DeployAppSourceDialog({
  host, directory, theme, t, onDone, onClose,
}: DeployAppSourceDialogProps) {
  const [mode, setMode] = useState<SourceMode>('local')
  const [localDirectory, setLocalDirectory] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [gitSubDirectory, setGitSubDirectory] = useState('')
  const [linkedAppId, setLinkedAppId] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  // Load the project's current source facts once; the form opens prefilled.
  useEffect(() => {
    let alive = true
    void host.readDeployLink(directory).then((link: DeployAppConfigLink | undefined) => {
      if (!alive) return
      setLinkedAppId(link?.appId)
      setLocalDirectory(link?.sourceDirectory ?? directory)
      if (link?.sourceGitUrl !== undefined) {
        setMode('git')
        setGitUrl(link.sourceGitUrl)
        setGitBranch(link.sourceGitBranch ?? '')
        setGitSubDirectory(link.sourceGitSubDirectory ?? '')
      }
    })
    return () => { alive = false }
  }, [host, directory])

  const browse = async (): Promise<void> => {
    const picked = await host.pickDirectory(localDirectory === '' ? undefined : localDirectory)
    if (picked !== undefined) setLocalDirectory(picked)
  }

  /** Persist the edited source form; failures report without closing. */
  const save = async (): Promise<void> => {
    setError(undefined)
    if (mode === 'local') {
      const directory_ = localDirectory.trim()
      if (directory_ === '') {
        setError(t('source.localRequired'))
        return
      }
      setBusy(true)
      try {
        const written = await host.writeDeployLink({ sourceDirectory: directory_ }, directory)
        onDone?.({ text: written ? t('source.saved') : t('source.writeFailed'), tone: written ? 'success' : 'error' })
        onClose()
      } finally {
        setBusy(false)
      }
      return
    }
    const url = gitUrl.trim()
    if (!/^https:\/\//iu.test(url)) {
      setError(t('template.git.invalidUrl'))
      return
    }
    const branch = gitBranch.trim()
    const subDirectory = gitSubDirectory.trim()
    setBusy(true)
    try {
      // The platform binding needs the linked app and the clients; a project
      // without either still records the source spec in its manifest.
      let bound = false
      const clients: DeployHostClients | undefined = (() => {
        try {
          return host.readClients()
        } catch {
          return undefined
        }
      })()
      if (linkedAppId !== undefined && clients !== undefined) {
        await createDeployAppOperationsService(clients).connectGitSource(linkedAppId, {
          repoKey: repoKeyFromUrl(url),
          repoProvider: repoProviderFromUrl(url),
          repoUrl: url,
          ...(branch === '' ? {} : { defaultBranch: branch }),
          cloneMode: 'FULL',
        })
        bound = true
      }
      const written = await host.writeDeployLink({
        sourceGitUrl: url,
        ...(branch === '' ? {} : { sourceGitBranch: branch }),
        ...(subDirectory === '' ? {} : { sourceSubDirectory: subDirectory }),
      }, directory)
      if (!written && !bound) {
        onDone?.({ text: t('source.writeFailed'), tone: 'error' })
        onClose()
        return
      }
      onDone?.({ text: bound && written ? t('source.savedPlatform') : t('source.saved'), tone: 'success' })
      onClose()
    } catch (cause) {
      setError(t('source.connectFailed', { message: cause instanceof Error && cause.message !== '' ? cause.message : String(cause) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={css.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('source.title')}
      data-theme={theme}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}
    >
      <div className={css.modal}>
        <div className={css.modalHeader}>
          <div>
            <h3 className={css.modalTitle}>{t('source.title')}</h3>
            <p className={css.modalSubtitle}>{t('source.subtitle')}</p>
          </div>
          <button type="button" className={css.closeButton} disabled={busy} onClick={onClose} aria-label={t('common.cancel')}>
            ✕
          </button>
        </div>
        <div className={css.chipRow}>
          <button
            type="button"
            className={mode === 'local' ? css.chipActive : css.chip}
            aria-pressed={mode === 'local'}
            onClick={() => { setMode('local') }}
          >
            {t('source.mode.local')}
          </button>
          <button
            type="button"
            className={mode === 'git' ? css.chipActive : css.chip}
            aria-pressed={mode === 'git'}
            onClick={() => { setMode('git') }}
          >
            {t('source.mode.git')}
          </button>
        </div>
        {mode === 'local' ? (
          <div className={css.modeRow}>
            <label className={css.fieldLabel}>
              {t('source.local.label')}
              <input
                type="text"
                className={css.input}
                value={localDirectory}
                placeholder={t('source.local.label')}
                onChange={(event) => { setLocalDirectory(event.target.value) }}
              />
            </label>
            <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => { void browse() }}>
              {t('source.local.pick')}
            </button>
          </div>
        ) : (
          <>
            <label className={css.fieldLabel}>
              {t('source.git.label')}
              <input
                type="text"
                className={css.input}
                value={gitUrl}
                placeholder={t('template.git.urlPlaceholder')}
                onChange={(event) => { setGitUrl(event.target.value) }}
              />
            </label>
            <label className={css.fieldLabel}>
              {t('source.git.branch')}
              <input
                type="text"
                className={css.input}
                value={gitBranch}
                placeholder={t('template.git.branchPlaceholder')}
                onChange={(event) => { setGitBranch(event.target.value) }}
              />
            </label>
            <label className={css.fieldLabel}>
              {t('source.git.sub')}
              <input
                type="text"
                className={css.input}
                value={gitSubDirectory}
                placeholder={t('template.git.subDirectoryPlaceholder')}
                onChange={(event) => { setGitSubDirectory(event.target.value) }}
              />
            </label>
            {linkedAppId === undefined && <p className={css.hint}>{t('source.noAppHint')}</p>}
          </>
        )}
        {error !== undefined && <p className={css.errorText} role="alert">{error}</p>}
        <div className={css.modalActions}>
          <button type="button" className={css.secondaryButton} disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={css.primaryButton} disabled={busy} onClick={() => { void save() }}>
            {busy ? t('source.saving') : t('source.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
