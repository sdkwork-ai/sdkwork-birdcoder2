/**
 * Download panel of the app template center: the caller's own scaffold
 * templates and the public marketplace, installed into the project's `apps/`
 * directory (or a custom absolute directory) through the host install bridge.
 *
 * The panel owns its own catalog read because it is independent of the
 * publish scan; it receives only the client pair and the host bridge, so a
 * composition can open the center even when the project has no `apps/` tree.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { installTemplateIntoProject, planTemplateInstallTarget, type TemplateCatalogRow, type TemplateDownloadOutcome, type TemplateInstallTargetMode } from './templateDownload.ts'
import { createTemplateInstallPorts, listTemplateCatalog } from './templatePorts.ts'
import type { TemplateInstallProgress } from './installTemplate.ts'
import type { DeployKey } from './locales.ts'
import css from './TemplateCenter.module.css'

/** One row's install lifecycle. */
interface InstallRowState {
  readonly phase: 'running' | 'done' | 'failed'
  readonly detail: string
  readonly warnings?: readonly string[]
}

/** Props for the download panel. */
export interface TemplateDownloadPanelProps {
  readonly host: DeployHost
  readonly clients: DeployHostClients
  /** The project whose `apps/` directory receives the template. */
  readonly directory?: string | undefined
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly onInstalled?: ((outcome: TemplateDownloadOutcome) => void) | undefined
}

/**
 * Render the download panel.
 * @param props - the host bridge, clients, project directory, and locale seat.
 * @returns the catalog and target surface.
 */
export function TemplateDownloadPanel({ host, clients, directory, t, onInstalled }: TemplateDownloadPanelProps) {
  const [source, setSource] = useState<'mine' | 'market'>('mine')
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<readonly TemplateCatalogRow[] | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<TemplateInstallTargetMode>('apps')
  const [customDirectory, setCustomDirectory] = useState('')
  const [appsChildren, setAppsChildren] = useState<readonly string[] | undefined>(undefined)
  const [appsRevision, setAppsRevision] = useState(0)
  const [installs, setInstalls] = useState<Readonly<Record<string, InstallRowState>>>({})
  const ports = useMemo(() => createTemplateInstallPorts(clients, host), [clients, host])

  const search = useCallback(async (nextSource: 'mine' | 'market', nextKeyword: string): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      setRows(await listTemplateCatalog(clients.deployClient, nextSource, nextKeyword))
    } catch (cause) {
      setRows(undefined)
      setError(t('templateCenter.download.failed', { message: messageOf(cause) }))
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

  const pickDirectory = async (): Promise<void> => {
    const picked = await host.pickDirectory(customDirectory.trim() === '' ? undefined : customDirectory)
    if (picked !== undefined && picked !== '') setCustomDirectory(picked)
  }

  const targetFor = (row: TemplateCatalogRow): string | undefined => {
    if (directory === undefined || directory.trim() === '') return undefined
    try {
      return planTemplateInstallTarget({
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

  const startInstall = async (row: TemplateCatalogRow): Promise<void> => {
    if (directory === undefined || directory.trim() === '') {
      setInstalls(current => ({
        ...current,
        [row.id]: { phase: 'failed', detail: t('templateCenter.download.noDirectory') },
      }))
      return
    }
    setInstalls(current => ({
      ...current,
      [row.id]: { phase: 'running', detail: t('templateCenter.download.preparing') },
    }))
    try {
      const outcome = await installTemplateIntoProject(ports, {
        templateId: row.id,
        templateKey: row.templateKey,
        displayName: row.displayName,
        projectDirectory: directory,
        mode,
        ...(mode === 'custom' ? { customDirectory } : {}),
      }, (progress: TemplateInstallProgress) => {
        setInstalls(current => ({
          ...current,
          [row.id]: { phase: 'running', detail: progressText(progress, t) },
        }))
      })
      setInstalls(current => ({
        ...current,
        [row.id]: {
          phase: 'done',
          detail: t('templateCenter.download.done', {
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
          detail: t('templateCenter.download.failed', { message: messageOf(cause) }),
        },
      }))
    }
  }

  return (
    <div className={css.downloadLayout}>
      <section className={css.downloadCatalog} aria-label={t('templateCenter.download.title')}>
        <div className={css.toolbar}>
          <div className={css.tabsInline} role="group" aria-label={t('templateCenter.download.sourceLabel')}>
            <button
              type="button"
              className={`${css.inlineTab}${source === 'mine' ? ` ${css.inlineTabActive}` : ''}`}
              aria-pressed={source === 'mine'}
              onClick={() => { setKeyword(''); setSource('mine') }}
            >
              {t('templateCenter.download.source.mine')}
            </button>
            <button
              type="button"
              className={`${css.inlineTab}${source === 'market' ? ` ${css.inlineTabActive}` : ''}`}
              aria-pressed={source === 'market'}
              onClick={() => { setKeyword(''); setSource('market') }}
            >
              {t('templateCenter.download.source.market')}
            </button>
          </div>
          {source === 'market' && (
            <div className={css.searchRow}>
              <input
                type="search"
                className={css.input}
                placeholder={t('templateCenter.download.searchPlaceholder')}
                value={keyword}
                onChange={(event) => { setKeyword(event.target.value) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void search('market', keyword)
                }}
                aria-label={t('templateCenter.download.search')}
              />
              <button type="button" className={css.ghostButton} onClick={() => { void search('market', keyword) }}>
                {t('templateCenter.download.search')}
              </button>
            </div>
          )}
        </div>
        {loading && <SkeletonRows />}
        {!loading && error !== undefined && (
          <div className={css.notice} role="alert">
            <span>{error}</span>
            <button type="button" className={css.ghostButton} onClick={() => { void search(source, keyword) }}>
              {t('templateCenter.retry')}
            </button>
          </div>
        )}
        {!loading && error === undefined && rows !== undefined && rows.length === 0 && (
          <div className={css.emptyState}>
            <span className={css.emptyGlyph} aria-hidden="true">◫</span>
            <span className={css.emptyTitle}>{t('templateCenter.download.empty')}</span>
            <span className={css.emptyHint}>
              {source === 'mine' ? t('templateCenter.download.emptyMine') : t('templateCenter.download.emptyMarket')}
            </span>
          </div>
        )}
        {!loading && error === undefined && rows !== undefined && rows.length > 0 && (
          <ul className={css.templateList}>
            {rows.map((row) => {
              const install = installs[row.id] as InstallRowState | undefined
              return (
                <li key={row.id} className={css.templateRow}>
                  <span className={css.templateGlyph} aria-hidden="true">▤</span>
                  <span className={css.templateMain}>
                    <span className={css.appNameRow}>
                      <span className={css.appName} title={row.displayName}>{row.displayName}</span>
                      {row.version !== '' && <span className={css.versionBadge}>v{row.version}</span>}
                      <span className={`${css.statusBadge} ${statusClass(row.status, css)}`}>{t(statusKey(row.status))}</span>
                    </span>
                    <span className={css.appKey}>{row.templateKey}</span>
                    {row.summary !== '' && <span className={css.templateSummary}>{row.summary}</span>}
                    <span className={css.templateTarget}>
                      {t('templateCenter.download.targetPreview')}: {targetFor(row) ?? t('templateCenter.download.noTarget')}
                    </span>
                  </span>
                  <span className={css.templateActions}>
                    <button
                      type="button"
                      className={css.primarySmall}
                      disabled={install?.phase === 'running' || directory === undefined
                      || (mode === 'custom' && customDirectory.trim() === '')
                      || targetFor(row) === undefined}
                      onClick={() => { void startInstall(row) }}
                    >
                      {install?.phase === 'running'
                        ? t('templateCenter.download.installing')
                        : t('templateCenter.download.install')}
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
      <aside className={css.downloadTarget} aria-label={t('templateCenter.download.target')}>
        <h3 className={css.sectionTitle}>{t('templateCenter.download.target')}</h3>
        <label className={`${css.targetOption}${mode === 'apps' ? ` ${css.targetOptionActive}` : ''}`}>
          <input
            type="radio"
            name="template-install-target"
            checked={mode === 'apps'}
            onChange={() => { setMode('apps') }}
          />
          <span className={css.targetMain}>
            <span className={css.targetTitle}>{t('templateCenter.download.targetApps')}</span>
            <span className={css.targetPath}>{directory === undefined
              ? t('templateCenter.noDirectory')
              : `${directory.replace(/[/\\]+$/u, '')}/apps`}</span>
          </span>
        </label>
        <label className={`${css.targetOption}${mode === 'custom' ? ` ${css.targetOptionActive}` : ''}`}>
          <input
            type="radio"
            name="template-install-target"
            checked={mode === 'custom'}
            onChange={() => { setMode('custom') }}
          />
          <span className={css.targetMain}>
            <span className={css.targetTitle}>{t('templateCenter.download.targetCustom')}</span>
            <span className={css.targetPath}>{customDirectory === '' ? '—' : customDirectory}</span>
          </span>
        </label>
        {mode === 'custom' && (
          <div className={css.customRow}>
            <input
              type="text"
              className={css.input}
              placeholder={t('templateCenter.download.customPlaceholder')}
              value={customDirectory}
              onChange={(event) => { setCustomDirectory(event.target.value) }}
              aria-label={t('templateCenter.download.customPlaceholder')}
            />
            <button type="button" className={css.ghostButton} onClick={() => { void pickDirectory() }}>
              {t('templateCenter.download.pick')}
            </button>
          </div>
        )}
        <p className={css.footHint}>
          {mode === 'custom' ? t('templateCenter.download.customHint') : t('templateCenter.download.targetHint')}
        </p>
      </aside>
    </div>
  )
}

/** Progress copy for one install stage. */
function progressText(
  progress: TemplateInstallProgress,
  t: (key: DeployKey, params?: Record<string, string>) => string,
): string {
  return progress.kind === 'download'
    ? t('templateCenter.download.downloading', { percent: String(progress.percent) })
    : t('templateCenter.download.writing', {
      index: String(progress.index),
      total: String(progress.total),
      file: progress.file,
    })
}

/** Translation key for one template status. */
function statusKey(status: string): DeployKey {
  switch (status) {
    case 'DRAFT': return 'templateCenter.download.status.draft'
    case 'PENDING_REVIEW': return 'templateCenter.download.status.pending'
    case 'PUBLISHED': return 'templateCenter.download.status.published'
    case 'REJECTED': return 'templateCenter.download.status.rejected'
    case 'DISABLED': return 'templateCenter.download.status.disabled'
    default: return 'templateCenter.download.status.draft'
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
    <ul className={css.templateList} aria-hidden="true">
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
