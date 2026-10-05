/**
 * The 部署模板 panel: browse the deploy template marketplace and install a
 * template's latest artifact version into a caller-picked directory. The
 * panel is presentation only — searching, installing, and directory picking
 * arrive through the injected port (plain callbacks over the `deployPublish`
 * service), so the whole flow degrades to a hidden panel when the host
 * composition lacks the deploy plugin or its install bridge.
 */
import { useState } from 'react'
import css from './TemplateLibraryPage.module.css'

/** One marketplace row the panel renders. */
export interface DeployTemplateRow {
  readonly id: string
  readonly displayName: string
  readonly templateKey: string
  readonly version: string
}

/** Progress reported while one install runs. */
export type DeployTemplateInstallProgress =
  | { kind: 'download'; percent: number }
  | { kind: 'write'; file: string; index: number; total: number }

/** The injected port: plain callbacks over the deploy plugin's service. */
export interface DeployTemplatePort {
  /** Search the marketplace; empty keyword lists the newest templates. */
  search(keyword: string): Promise<readonly DeployTemplateRow[]>
  /** Install one template into the target directory. */
  install(options: {
    templateId: string
    targetDirectory: string
    reportProgress?: ((progress: DeployTemplateInstallProgress) => void) | undefined
  }): Promise<{ fileCount: number }>
  /** Open the host directory picker; undefined when cancelled or unavailable. */
  pickDirectory(): Promise<string | undefined>
}

/** Translate seat of the plugin's namespace. */
type Translate = (key: string, params?: Record<string, string>) => string

/** One row's install lifecycle. */
interface InstallState {
  readonly templateId: string
  readonly phase: 'picking' | 'running' | 'done' | 'failed'
  readonly detail: string
}

/** Props for the install panel. */
export interface DeployTemplatePanelProps {
  /** The injected port; absent keeps the whole panel hidden. */
  readonly deploy: DeployTemplatePort | undefined
  readonly t: Translate
}

/**
 * Render the install panel: a keyword search over the marketplace and one
 * install row action with download/write progress.
 * @param props - the injected port plus the locale seat.
 * @returns the panel, or null when the port is absent.
 */
export function DeployTemplatePanel({ deploy, t }: DeployTemplatePanelProps) {
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<readonly DeployTemplateRow[] | undefined>(undefined)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | undefined>(undefined)
  const [install, setInstall] = useState<InstallState | undefined>(undefined)

  if (deploy === undefined) return null

  const search = async (): Promise<void> => {
    setSearching(true)
    setSearchError(undefined)
    try {
      setRows(await deploy.search(keyword))
    } catch (cause) {
      setSearchError(t('deploy.searchFailed', { message: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      setSearching(false)
    }
  }

  const startInstall = async (row: DeployTemplateRow): Promise<void> => {
    setInstall({ templateId: row.id, phase: 'picking', detail: '' })
    const directory = await deploy.pickDirectory().catch(() => undefined)
    if (directory === undefined || directory.trim() === '') {
      setInstall({ templateId: row.id, phase: 'failed', detail: t('deploy.noDirectory') })
      return
    }
    setInstall({ templateId: row.id, phase: 'running', detail: t('deploy.installing') })
    try {
      const outcome = await deploy.install({
        templateId: row.id,
        targetDirectory: directory,
        reportProgress: (progress) => {
          const detail = progress.kind === 'download'
            ? t('deploy.downloadProgress', { percent: String(progress.percent) })
            : t('deploy.writeProgress', { index: String(progress.index), total: String(progress.total), file: progress.file })
          setInstall({ templateId: row.id, phase: 'running', detail })
        },
      })
      setInstall({
        templateId: row.id,
        phase: 'done',
        detail: t('deploy.done', { count: String(outcome.fileCount), directory }),
      })
    } catch (cause) {
      setInstall({
        templateId: row.id,
        phase: 'failed',
        detail: t('deploy.installFailed', { message: cause instanceof Error ? cause.message : String(cause) }),
      })
    }
  }

  return (
    <section className={css.deployPanel} aria-label={t('deploy.title')}>
      <div className={css.deployPanelHead}>
        <span className={css.deployPanelTitle}>{t('deploy.title')}</span>
        <input
          type="search"
          className={css.deployPanelInput}
          placeholder={t('deploy.searchPlaceholder')}
          value={keyword}
          onChange={(event) => { setKeyword(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') void search() }}
        />
        <button type="button" className={css.deployPanelSearch} onClick={() => { void search() }}>
          {searching ? '…' : t('deploy.search')}
        </button>
      </div>
      {searchError !== undefined && (
        <p className={css.deployPanelError} role="alert">{searchError}</p>
      )}
      {rows !== undefined && rows.length === 0 && searchError === undefined && (
        <p className={css.deployPanelHint}>{t('deploy.empty')}</p>
      )}
      {rows !== undefined && rows.length > 0 && (
        <ul className={css.deployPanelRows}>
          {rows.map(row => (
            <li key={row.id} className={css.deployPanelRow}>
              <span className={css.deployPanelName}>{row.displayName}</span>
              <span className={css.deployPanelKey}>{row.templateKey}</span>
              <span className={css.deployPanelVersion}>{row.version}</span>
              <button
                type="button"
                className={css.deployPanelInstall}
                disabled={install?.templateId === row.id && (install.phase === 'picking' || install.phase === 'running')}
                onClick={() => { void startInstall(row) }}
              >
                {install?.templateId === row.id && install.phase !== 'done' && install.phase !== 'failed'
                  ? t('deploy.installing')
                  : t('deploy.install')}
              </button>
              {install?.templateId === row.id && install.detail !== '' && (
                <span
                  className={`${css.deployPanelStatus}${install.phase === 'failed' ? ` ${css.deployPanelStatusError}` : ''}`}
                  role={install.phase === 'failed' ? 'alert' : 'status'}
                >
                  {install.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
