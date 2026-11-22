/**
 * Install surface for one published scaffold: the caller's own scaffolds and
 * the public marketplace, installed into the project's `apps/` directory (or a
 * custom absolute directory) through the host install bridge.
 *
 * The panel owns its own catalog read and install state; it never imports the
 * publish flow. The install dialog supplies only the client pair, the host
 * bridge, and the target project.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { installScaffoldIntoProject, planScaffoldInstallTarget, type ScaffoldCatalogRow, type ScaffoldDownloadOutcome, type ScaffoldInstallTargetMode } from './scaffoldDownload.ts'
import { createScaffoldInstallPorts, listScaffoldCatalog } from './scaffoldPorts.ts'
import type { ScaffoldInstallProgress } from './installScaffold.ts'
import type { DeployKey } from './locales.ts'
import css from './ScaffoldDialog.module.css'

/** One row's install lifecycle. */
interface InstallRowState {
  readonly phase: 'running' | 'done' | 'failed'
  readonly detail: string
  readonly warnings?: readonly string[]
}

/** Props for the install panel. */
export interface ScaffoldInstallPanelProps {
  readonly host: DeployHost
  readonly clients: DeployHostClients
  /** The project whose `apps/` directory receives the scaffold. */
  readonly directory?: string | undefined
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly onInstalled?: ((outcome: ScaffoldDownloadOutcome) => void) | undefined
  /** True while any row is installing; the dialog uses it to lock closing. */
  readonly onBusyChange?: ((busy: boolean) => void) | undefined
}

/**
 * Render the install panel.
 * @param props - the host bridge, clients, project directory, and locale seat.
 * @returns the catalog and target surface.
 */
export function ScaffoldInstallPanel({
  host, clients, directory, t, onInstalled, onBusyChange,
}: ScaffoldInstallPanelProps) {
  const [source, setSource] = useState<'mine' | 'market'>('mine')
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<readonly ScaffoldCatalogRow[] | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [customDirectory, setCustomDirectory] = useState('')
  const mode: ScaffoldInstallTargetMode = customDirectory.trim() === '' ? 'apps' : 'custom'
  const [appsChildren, setAppsChildren] = useState<readonly string[] | undefined>(undefined)
  const [appsRevision, setAppsRevision] = useState(0)
  const [installs, setInstalls] = useState<Readonly<Record<string, InstallRowState>>>({})
  const ports = useMemo(() => createScaffoldInstallPorts(clients, host), [clients, host])
  const busy = Object.values(installs).some(row => row.phase === 'running')
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])

  const search = useCallback(async (nextSource: 'mine' | 'market', nextKeyword: string): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      setRows(await listScaffoldCatalog(clients.deployClient, nextSource, nextKeyword))
    } catch (cause) {
      setRows(undefined)
      setError(t('scaffoldCenter.download.failed', { message: messageOf(cause) }))
    } finally {
      setLoading(false)
    }
  }, [clients, t])

  // The keyword only applies to an explicit market search; switching sources
  // reloads the first page of that source.
  useEffect(() => {
    void search(source, '')
  }, [search, source])

  useEffect(() => {
    if (directory === undefined || directory.trim() === '') {
      setAppsChildren(undefined)
      return
    }
    let cancelled = false
    void host.listDirectory(`${directory.replace(/[/\\]+$/u, '')}/apps`).then((listing) => {
      if (cancelled) return
      setAppsChildren(listing === undefined
        ? undefined
        : listing.entries.filter(entry => !entry.hidden).map(entry => entry.name))
    })
    return () => { cancelled = true }
  }, [directory, host, appsRevision])

  const defaultAppsPath = directory === undefined || directory.trim() === ''
    ? undefined
    : `${directory.replace(/[/\\]+$/u, '')}/apps`
  const targetPath = customDirectory !== '' ? customDirectory : defaultAppsPath

  const pickDirectory = async (): Promise<void> => {
    if (defaultAppsPath === undefined) return
    const picked = await host.pickDirectory(customDirectory.trim() === '' ? defaultAppsPath : customDirectory)
    if (picked === undefined || picked === '') return
    setCustomDirectory(picked === defaultAppsPath ? '' : picked)
  }

  const targetFor = (row: ScaffoldCatalogRow): string | undefined => {
    if (directory === undefined || directory.trim() === '') return undefined
    try {
      return planScaffoldInstallTarget({
        templateId: row.id,
        templateKey: row.templateKey,
        displayName: row.displayName,
        projectDirectory: directory,
        mode,
        ...(mode === 'custom' ? { customDirectory } : {}),
      }, appsChildren).directory
    } catch {
      return undefined
    }
  }

  const startInstall = async (row: ScaffoldCatalogRow): Promise<void> => {
    if (directory === undefined || directory.trim() === '') {
      setInstalls(current => ({
        ...current,
        [row.id]: { phase: 'failed', detail: t('scaffoldCenter.download.noDirectory') },
      }))
      return
    }
    setInstalls(current => ({
      ...current,
      [row.id]: { phase: 'running', detail: t('scaffoldCenter.download.preparing') },
    }))
    try {
      const outcome = await installScaffoldIntoProject(ports, {
        templateId: row.id,
        templateKey: row.templateKey,
        displayName: row.displayName,
        projectDirectory: directory,
        mode,
        ...(mode === 'custom' ? { customDirectory } : {}),
      }, (progress: ScaffoldInstallProgress) => {
        setInstalls(current => ({
          ...current,
          [row.id]: { phase: 'running', detail: progressText(progress, t) },
        }))
      })
      setInstalls(current => ({
        ...current,
        [row.id]: {
          phase: 'done',
          detail: t('scaffoldCenter.download.done', {
            count: String(outcome.fileCount),
            directory: outcome.directory,
          }),
          warnings: outcome.warnings,
        },
      }))
      setAppsRevision(revision => revision + 1)
      onInstalled?.(outcome)
    } catch (cause) {
      setInstalls(current => ({
        ...current,
        [row.id]: {
          phase: 'failed',
          detail: t('scaffoldCenter.download.failed', { message: messageOf(cause) }),
        },
      }))
    }
  }

  return (
    <div className={css.downloadLayout}>
      <section className={css.downloadCatalog} aria-label={t('scaffoldCenter.download.title')}>
        <div className={css.toolbar}>
          <div className={css.tabsInline} role="group" aria-label={t('scaffoldCenter.download.sourceLabel')}>
            <button
              type="button"
              className={`${css.inlineTab}${source === 'mine' ? ` ${css.inlineTabActive}` : ''}`}
              aria-pressed={source === 'mine'}
              onClick={() => { setKeyword(''); setSource('mine') }}
            >
              {t('scaffoldCenter.download.source.mine')}
            </button>
            <button
              type="button"
              className={`${css.inlineTab}${source === 'market' ? ` ${css.inlineTabActive}` : ''}`}
              aria-pressed={source === 'market'}
              onClick={() => { setKeyword(''); setSource('market') }}
            >
              {t('scaffoldCenter.download.source.market')}
            </button>
          </div>
          {source === 'market' && (
            <div className={css.searchRow}>
              <input
                type="search"
                className={css.input}
                placeholder={t('scaffoldCenter.download.searchPlaceholder')}
                value={keyword}
                onChange={(event) => { setKeyword(event.target.value) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void search('market', keyword)
                }}
                aria-label={t('scaffoldCenter.download.search')}
              />
              <button type="button" className={css.ghostButton} onClick={() => { void search('market', keyword) }}>
                {t('scaffoldCenter.download.search')}
              </button>
            </div>
          )}
        </div>
        {loading && <SkeletonRows />}
        {!loading && error !== undefined && (
          <div className={css.notice} role="alert">
            <span>{error}</span>
            <button type="button" className={css.ghostButton} onClick={() => { void search(source, keyword) }}>
              {t('scaffoldCenter.retry')}
            </button>
          </div>
        )}
        {!loading && error === undefined && rows !== undefined && rows.length === 0 && (
          <div className={css.emptyState}>
            <span className={css.emptyGlyph} aria-hidden="true">◫</span>
            <span className={css.emptyTitle}>{t('scaffoldCenter.download.empty')}</span>
            <span className={css.emptyHint}>
              {source === 'mine' ? t('scaffoldCenter.download.emptyMine') : t('scaffoldCenter.download.emptyMarket')}
            </span>
          </div>
        )}
        {!loading && error === undefined && rows !== undefined && rows.length > 0 && (
          <ul className={css.scaffoldList}>
            {rows.map((row) => {
              const install = installs[row.id] as InstallRowState | undefined
              return (
                <li key={row.id} className={css.scaffoldRow}>
                  <span className={css.scaffoldGlyph} aria-hidden="true">▤</span>
                  <span className={css.scaffoldMain}>
                    <span className={css.appNameRow}>
                      <span className={css.appName} title={row.displayName}>{row.displayName}</span>
                      {row.version !== '' && (
                        <span className={css.versionBadge}>
                          {t('scaffoldCenter.versionBadge', { version: row.version })}
                        </span>
                      )}
                      <span className={`${css.statusBadge} ${statusClass(row.status, css)}`}>{t(statusKey(row.status))}</span>
                    </span>
                    <span className={css.appKey}>{row.templateKey}</span>
                    {row.summary !== '' && <span className={css.scaffoldSummary}>{row.summary}</span>}
                    <span className={css.scaffoldTarget}>
                      {t('scaffoldCenter.download.targetPreview')}: {targetFor(row) ?? t('scaffoldCenter.download.noTarget')}
                    </span>
                  </span>
                  <span className={css.scaffoldActions}>
                    <button
                      type="button"
                      className={css.primarySmall}
                      disabled={install?.phase === 'running' || targetPath === undefined
                      || targetFor(row) === undefined}
                      onClick={() => { void startInstall(row) }}
                    >
                      {install?.phase === 'running'
                        ? t('scaffoldCenter.download.installing')
                        : t('scaffoldCenter.download.install')}
                    </button>
                  </span>
                  {install !== undefined && (
                    <span className={css.installStatusRow} role={install.phase === 'failed' ? 'alert' : 'status'}>
                      <span className={`${css.runText}${install.phase === 'failed' ? ` ${css.runTextError}` : ''}`}>
                        {install.detail}
                      </span>
                      {install.warnings !== undefined && install.warnings.length > 0 && (
                        <span className={css.runHint}>{install.warnings.join('；')}</span>
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <aside className={css.downloadTarget} aria-label={t('scaffoldCenter.download.target')}>
        <h3 className={css.sectionTitle}>{t('scaffoldCenter.download.target')}</h3>
        <button
          type="button"
          className={css.locationButton}
          aria-label={t('scaffoldCenter.download.changeLocation')}
          disabled={busy || defaultAppsPath === undefined}
          onClick={() => { void pickDirectory() }}
        >
          <span className={css.locationGlyph} aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h4l1.5 2H16a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5Z" />
            </svg>
          </span>
          <span className={css.locationMain}>
            <span className={css.locationMode}>
              {customDirectory === ''
                ? t('scaffoldCenter.download.defaultLocation')
                : t('scaffoldCenter.download.customLocation')}
            </span>
            <span className={css.locationPath} title={targetPath}>
              {targetPath ?? t('scaffoldCenter.noDirectory')}
            </span>
          </span>
          <span className={css.locationAction}>{t('scaffoldCenter.download.change')}</span>
        </button>
        {customDirectory !== '' && (
          <button
            type="button"
            className={css.locationReset}
            disabled={busy}
            onClick={() => { setCustomDirectory('') }}
          >
            {t('scaffoldCenter.download.resetLocation')}
          </button>
        )}
        <p className={css.footHint}>
          {customDirectory === ''
            ? t('scaffoldCenter.download.locationHint')
            : t('scaffoldCenter.download.customHint')}
        </p>
      </aside>
    </div>
  )
}

/** Progress copy for one install stage. */
function progressText(
  progress: ScaffoldInstallProgress,
  t: (key: DeployKey, params?: Record<string, string>) => string,
): string {
  return progress.kind === 'download'
    ? t('scaffoldCenter.download.downloading', { percent: String(progress.percent) })
    : t('scaffoldCenter.download.writing', {
      index: String(progress.index),
      total: String(progress.total),
      file: progress.file,
    })
}

/** Translation key for one scaffold status. */
function statusKey(status: string): DeployKey {
  switch (status) {
    case 'DRAFT': return 'scaffoldCenter.download.status.draft'
    case 'PENDING_REVIEW': return 'scaffoldCenter.download.status.pending'
    case 'PUBLISHED': return 'scaffoldCenter.download.status.published'
    case 'REJECTED': return 'scaffoldCenter.download.status.rejected'
    case 'DISABLED': return 'scaffoldCenter.download.status.disabled'
    default: return 'scaffoldCenter.download.status.draft'
  }
}

/** The status-specific badge class. */
function statusClass(status: string, styles: typeof css): string {
  if (status === 'PUBLISHED') return styles.statusPublished
  if (status === 'PENDING_REVIEW') return styles.statusPending
  if (status === 'REJECTED' || status === 'DISABLED') return styles.statusWarning
  return ''
}

/** Three shimmer rows while the catalog loads. */
function SkeletonRows() {
  return (
    <ul className={css.scaffoldList} aria-hidden="true">
      {[0, 1, 2].map(index => (
        <li key={index} className={css.skeletonRow}>
          <span className={css.skeletonBlock} />
          <span className={css.skeletonLines}>
            <span className={css.skeletonLine} />
            <span className={`${css.skeletonLine} ${css.skeletonShort}`} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One-line cause text for localized failure copy. */
function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : String(cause)
}
