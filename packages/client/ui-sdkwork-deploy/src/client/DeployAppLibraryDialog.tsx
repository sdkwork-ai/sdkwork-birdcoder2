/**
 * App library dialog: the create-app entry's popup.
 *
 * One surface answers "which apps do I already have". Two sources merge into
 * one list: a bounded walk over the session workspace discovers every project
 * carrying `agent.app.config.json` ({@link discoverAppLibrary}), and the
 * caller's deploy apps come from the publishing service. A file row whose
 * manifest links an app suppresses that app's server row; a created app
 * without any local manifest — no session directory to host one, a failed
 * linkage write, or a session project that already records another app —
 * still lists, as a server row with the unlinked-directory badge, so a
 * successful creation is never invisible. File rows run 发布 and 上传代码
 * through {@link DeployProjectAppFlow} for their directory (which creates or
 * links first when the manifest records no app) and 打包 through the host
 * build port; server rows open the publish dialog and the upload dialog
 * directly, because they carry no local directory. The footer's 新建应用
 * opens the console's full create form, whose type grid covers the whole
 * SDKWork app vocabulary (h5, pc-web, desktop, mini-program, android, ios,
 * harmonyos, api-service, static-web, each with its framework stacks).
 *
 * An empty merge renders a clickable placeholder whose action is the same
 * create form, so a first run never dead-ends.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  BuildProgressDialog,
  CreateAppDialog,
  UploadSourceDialog,
  cardsOfAppKind,
  createDeployAppPublishingService,
} from '@sdkwork/deployments-pc-console-publishing'
import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import type { DeployAppMediaGroup } from '@sdkwork/deployments-pc-console-publishing'
import { discoverAppLibrary, type AppLibraryEntry } from './appLibrary.ts'
import { hasProjectApp } from './projectApp.ts'
import { deploymentsLocale, type DeployLocaleFace, type DeployPublishThemePort } from './deployPorts.ts'
import type { DeployHost, DeployHostBuild, DeployHostClients } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import {
  DeployProjectAppFlow,
  type ProjectAppFlowOutcome,
  type ProjectAppIntent,
} from './DeployProjectAppFlow.tsx'
import { DeployPublishDialog } from './DeployPublishDialog.tsx'
import { DeployAppSourceDialog } from './DeployAppSourceDialog.tsx'
import css from './DeployDialogs.module.css'

/** Full props for the app library dialog. */
export interface DeployAppLibraryDialogProps {
  /** Host adapter producing the deploy/drive clients, workspace and build ports. */
  readonly host: DeployHost
  /** Reactive theme port for the shared dialog surfaces. */
  readonly theme: DeployPublishThemePort
  /** Reactive locale face driving the console dialogs' locale mapping. */
  readonly locale: DeployLocaleFace
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Report one outcome to the owner for its banner. */
  readonly onDone?: ((outcome: ProjectAppFlowOutcome) => void) | undefined
  /** Close the library without another side effect. */
  readonly onClose: () => void
}

/** What the library currently stacks over its list. */
type Overlay =
  | { readonly kind: 'none' }
  | { readonly kind: 'flow'; readonly directory: string; readonly intent: ProjectAppIntent }
  | { readonly kind: 'create' }
  | { readonly kind: 'build'; readonly directory: string }
  | { readonly kind: 'source'; readonly directory: string }
  | { readonly kind: 'publishDirect'; readonly app: AppResponse }
  | { readonly kind: 'uploadDirect'; readonly app: AppResponse }

/** One library row: a manifest-carrying local project or a server-only app. */
type LibraryRow =
  | { readonly kind: 'file'; readonly entry: AppLibraryEntry }
  | { readonly kind: 'server'; readonly app: AppResponse }

/** Per-server-page fetch cap (the picker's page size). */
const SERVER_APPS_PAGE_SIZE = 50

/**
 * Merge the file walk's entries with the caller's server apps: file rows
 * first, then every app no local manifest references as a server row, so a
 * created app without a local manifest still lists.
 */
function mergeRows(entries: readonly AppLibraryEntry[], apps: readonly AppResponse[]): LibraryRow[] {
  const rows: LibraryRow[] = entries.map(entry => ({ kind: 'file', entry }))
  const linked = new Set(
    entries.map(entry => entry.linkedAppId).filter((id): id is string => id !== undefined),
  )
  for (const app of apps) {
    if (!linked.has(app.id)) rows.push({ kind: 'server', app })
  }
  return rows
}

/** Console type card → dictionary key of its display label. */
const LIBRARY_TYPE_KEYS: Readonly<Record<string, DeployKey>> = {
  'h5': 'library.type.h5',
  'pc-web': 'library.type.pcWeb',
  'desktop': 'library.type.desktop',
  'mini-program': 'library.type.miniProgram',
  'android': 'library.type.android',
  'ios': 'library.type.ios',
  'harmonyos': 'library.type.harmonyos',
  'api-service': 'library.type.apiService',
  'static-web': 'library.type.staticWeb',
}

/**
 * Render the app library dialog over the workspace scan.
 * @param props - the host adapter, theme/locale ports, and the outcome/close
 *   callbacks.
 * @returns the modal surface.
 */
export function DeployAppLibraryDialog({
  host, theme, locale: localeFace, t, onDone, onClose,
}: DeployAppLibraryDialogProps) {
  const [clients, setClients] = useState<DeployHostClients | undefined>(() => {
    try {
      return host.readClients()
    } catch {
      return undefined
    }
  })
  const [rows, setRows] = useState<LibraryRow[] | undefined>(undefined)
  const [scanError, setScanError] = useState<string | undefined>(undefined)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  /** The root the current list was scanned from; a moved cwd triggers a rescan. */
  const scannedRootRef = useRef<string | undefined>(undefined)
  /** Mirrors `overlay` for the host listener, which must read the live value. */
  const overlayRef = useRef<Overlay>(overlay)
  // uSES calls both members unbound: bind the ports through stable closures
  // instead of handing the port's own methods through.
  const subscribeTheme = useCallback((listener: () => void) => theme.subscribe(listener), [theme])
  const readTheme = useCallback(() => theme.getColorScheme(), [theme])
  const subscribeLocale = useCallback((listener: () => void) => localeFace.subscribe(listener), [localeFace])
  const readLocale = useCallback(() => localeFace.getSnapshot(), [localeFace])
  const colorScheme = useSyncExternalStore(subscribeTheme, readTheme, readTheme)
  const localeSnapshot = useSyncExternalStore(subscribeLocale, readLocale, readLocale)
  const locale = useMemo(() => deploymentsLocale(localeSnapshot.active), [localeSnapshot.active])
  const buildPort: DeployHostBuild | undefined = host.readBuildPort()

  /** Re-walk the workspace and re-fetch the caller's apps; neither is fatal. */
  const scan = useCallback(async (): Promise<void> => {
    setRows(undefined)
    setScanError(undefined)
    const root = host.readDefaultDirectory()
    scannedRootRef.current = root
    let fileEntries: AppLibraryEntry[] = []
    let failure: string | undefined
    if (root !== undefined && root.trim() !== '') {
      try {
        fileEntries = await discoverAppLibrary(host, root, { profileIdOf: raw => host.readDeployProfileId(raw) })
      } catch (cause) {
        failure = t('library.scanFailed', { message: messageOf(cause) })
      }
    }
    // The server list is additive: a caller-owned app without a local
    // manifest still lists, and a failure here only shrinks the merge.
    let serverApps: AppResponse[] = []
    if (clients !== undefined) {
      try {
        const service = createDeployAppPublishingService(clients)
        const page = await service.listApps({ page: 1, pageSize: SERVER_APPS_PAGE_SIZE })
        serverApps = page.items
      } catch {
        serverApps = []
      }
    }
    setRows(mergeRows(fileEntries, serverApps))
    if (failure !== undefined) setScanError(failure)
  }, [clients, host, t])

  // Rebuild clients on host notifications (IAM hydration, token rotation,
  // environment switch), the same self-heal the other flows use. Every other
  // change the channel carries — a session cwd move, or another surface's
  // manifest write forwarded through the host — re-walks the current tree in
  // place; a stacked surface suppresses the rescan because its own close
  // already refreshes the list.
  useEffect(() => {
    overlayRef.current = overlay
  }, [overlay])
  useEffect(() => {
    return host.subscribe(() => {
      try {
        setClients(host.readClients())
      } catch {
        setClients(undefined)
      }
      if (overlayRef.current.kind === 'none') void scan()
    })
  }, [host, scan])

  // Scan once on open; the list refreshes after every stacked surface closes.
  useEffect(() => { void scan() }, [scan])

  /** Close the stacked surface and re-read the projects it may have changed. */
  const closeOverlay = useCallback((): void => {
    setOverlay({ kind: 'none' })
    void scan()
  }, [scan])

  const flowOutcome = useCallback((outcome: ProjectAppFlowOutcome): void => {
    onDone?.(outcome)
  }, [onDone])

  /** Record a manually created app, linking it to the session project when free. */
  const createdManually = useCallback(async (app: AppResponse, media?: DeployAppMediaGroup): Promise<void> => {
    setOverlay({ kind: 'none' })
    let linked = false
    let linkable = false
    const cwd = host.readDefaultDirectory()
    const iconUrl = media?.icon?.url
    if (cwd !== undefined && cwd.trim() !== '') {
      try {
        const state = await host.readProjectApp(cwd)
        if (!hasProjectApp(state)) {
          linkable = true
          linked = await host.writeDeployLink({
            appId: app.id,
            appName: app.name,
            appSlug: app.slug,
            sourceDirectory: cwd,
          }, cwd, {
            name: app.name,
            appSlug: app.slug,
            appKind: app.appKind,
            ...(iconUrl === undefined ? {} : { iconUrl }),
          })
        }
      } catch {
        linked = false
      }
    }
    onDone?.({
      text: linked
        ? t('library.createdLinked', { name: app.name })
        : linkable
          ? t('library.linkWriteFailed', { name: app.name })
          : t('library.created', { name: app.name }),
      tone: linked || !linkable ? 'success' : 'error',
    })
    void scan()
  }, [host, onDone, scan, t])

  const openCreate = useCallback((): void => {
    setOverlay({ kind: 'create' })
  }, [])

  const hasRows = rows !== undefined && rows.length > 0

  return (
    <div
      className={css.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('library.title')}
      data-theme={colorScheme}
      onMouseDown={(event) => { if (event.target === event.currentTarget && overlay.kind === 'none') onClose() }}
    >
      <div className={`${css.modal} ${css.libraryModal}`}>
        <div className={css.modalHeader}>
          <div>
            <h3 className={css.modalTitle}>{t('library.title')}</h3>
            <p className={css.modalSubtitle}>
              {rows === undefined
                ? t('library.scanning')
                : t('library.count', { count: String(rows.length) })}
            </p>
          </div>
          <div className={css.libraryHeaderActions}>
            <button
              type="button"
              className={css.libraryRescan}
              disabled={rows === undefined}
              onClick={() => { void scan() }}
            >
              {t('library.rescan')}
            </button>
            <button type="button" className={css.closeButton} onClick={onClose} aria-label={t('library.close')}>
              ✕
            </button>
          </div>
        </div>
        {scanError !== undefined && <p className={css.errorText} role="alert">{scanError}</p>}
        {rows === undefined && <p className={css.hint}>{t('library.scanning')}</p>}
        {rows !== undefined && rows.length === 0 && (
          <button type="button" className={css.libraryEmpty} onClick={openCreate}>
            <span className={css.libraryEmptyGlyph} aria-hidden="true">＋</span>
            <span className={css.libraryEmptyTitle}>{t('library.empty.title')}</span>
            <span className={css.libraryEmptyHint}>{t('library.empty.hint')}</span>
            <span className={css.libraryEmptyAction}>{t('library.empty.action')}</span>
          </button>
        )}
        {hasRows && (
          <ul className={css.libraryList}>
            {rows.map(row => (row.kind === 'file'
              ? (
                <FileRow
                  key={row.entry.directory}
                  entry={row.entry}
                  buildable={buildPort !== undefined}
                  t={t}
                  onPublish={() => { setOverlay({ kind: 'flow', directory: row.entry.directory, intent: 'publish' }) }}
                  onUpload={() => { setOverlay({ kind: 'flow', directory: row.entry.directory, intent: 'upload' }) }}
                  onBuild={() => { setOverlay({ kind: 'build', directory: row.entry.directory }) }}
                  onSource={() => { setOverlay({ kind: 'source', directory: row.entry.directory }) }}
                />
              )
              : (
                <ServerRow
                  key={row.app.id}
                  app={row.app}
                  t={t}
                  onPublish={() => { setOverlay({ kind: 'publishDirect', app: row.app }) }}
                  onUpload={() => { setOverlay({ kind: 'uploadDirect', app: row.app }) }}
                />
              )))}
          </ul>
        )}
        <div className={css.modalActions}>
          <button type="button" className={css.secondaryButton} onClick={onClose}>
            {t('library.close')}
          </button>
          <button type="button" className={css.primaryButton} onClick={openCreate}>
            {t('library.create')}
          </button>
        </div>
      </div>

      {overlay.kind === 'flow' && (
        <DeployProjectAppFlow
          host={host}
          theme={theme}
          locale={localeFace}
          t={t}
          directory={overlay.directory}
          intent={overlay.intent}
          onDone={flowOutcome}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === 'publishDirect' && (
        <DeployPublishDialog
          host={host}
          theme={theme}
          locale={localeFace}
          app={overlay.app}
          onPublished={() => { closeOverlay() }}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === 'uploadDirect' && clients !== undefined && (
        <UploadSourceDialog
          deployClient={clients.deployClient}
          driveClient={clients.driveClient}
          locale={locale}
          app={overlay.app}
          theme={colorScheme}
          onUploaded={(summary) => {
            onDone?.({ text: t('notice.uploaded', { summary }), tone: 'success' })
            closeOverlay()
          }}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === 'create' && clients !== undefined && (
        <CreateAppDialog
          deployClient={clients.deployClient}
          driveClient={clients.driveClient}
          locale={locale}
          theme={colorScheme}
          onCreated={(app, media) => { void createdManually(app, media) }}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === 'source' && (
        <DeployAppSourceDialog
          host={host}
          directory={overlay.directory}
          theme={colorScheme}
          t={t}
          onDone={flowOutcome}
          onClose={closeOverlay}
        />
      )}

      {overlay.kind === 'build' && buildPort !== undefined && (
        <BuildProgressDialog
          locale={locale}
          theme={colorScheme}
          cwd={overlay.directory}
          port={buildPort}
          onClose={closeOverlay}
          onFinished={(outcome) => {
            onDone?.({
              text: outcome === 'succeeded' ? t('library.buildSucceeded') : t('library.buildFailed'),
              tone: outcome === 'succeeded' ? 'success' : 'error',
            })
          }}
        />
      )}
    </div>
  )
}

/** The manifest-derived label for a row's type, or the unrecognized fallback. */
function typeLabelOf(cardId: string | undefined, t: (key: DeployKey) => string): string {
  if (cardId === undefined) return t('library.type.unknown')
  return t(LIBRARY_TYPE_KEYS[cardId] ?? 'library.type.unknown')
}

/** Props for one manifest-carrying project row. */
interface FileRowProps {
  readonly entry: AppLibraryEntry
  /** The host build port exists, so 打包 is offered. */
  readonly buildable: boolean
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly onPublish: () => void
  readonly onUpload: () => void
  readonly onBuild: () => void
  readonly onSource: () => void
}

/** One manifest-carrying project row: manifest identity plus directory flows. */
function FileRow({ entry, buildable, t, onPublish, onUpload, onBuild, onSource }: FileRowProps) {
  const sourceBadge = entry.sourceGitUrl !== undefined
    ? t('source.badge.git')
    : entry.sourceDirectory !== undefined
      ? t('source.badge.local')
      : undefined
  return (
    <li className={css.libraryRow}>
      <LibraryAvatar name={entry.name} iconUrl={entry.iconUrl} />
      <span className={css.libraryMain}>
        <span className={css.libraryName}>{entry.name}</span>
        <span className={css.libraryMeta}>
          <span className={css.libraryType}>{typeLabelOf(entry.cardId, t)}</span>
          <span
            className={
              entry.linkedAppId === undefined
                ? css.libraryBadgeUnlinked
                : css.libraryBadgeLinked
            }
          >
            {entry.linkedAppId === undefined
              ? t('library.unlinked')
              : t('library.linked', { name: entry.linkedAppName ?? entry.linkedAppId })}
          </span>
          {sourceBadge !== undefined && <span className={css.libraryType}>{sourceBadge}</span>}
        </span>
        <span className={css.libraryPath} title={entry.directory}>{entry.directory}</span>
      </span>
      <span className={css.libraryActions}>
        <button type="button" className={css.libraryActionButton} onClick={onPublish}>
          {t('library.action.publish')}
        </button>
        <button type="button" className={css.libraryActionButton} onClick={onUpload}>
          {t('library.action.upload')}
        </button>
        <button type="button" className={css.libraryActionButton} onClick={onSource}>
          {t('library.action.source')}
        </button>
        {buildable && (
          <button type="button" className={css.libraryActionButton} onClick={onBuild}>
            {t('library.action.build')}
          </button>
        )}
      </span>
    </li>
  )
}

/** Props for one server-only app row. */
interface ServerRowProps {
  readonly app: AppResponse
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly onPublish: () => void
  readonly onUpload: () => void
}

/**
 * One caller-owned app no local manifest references: type derived from the
 * app kind's single card, the unlinked-directory badge, and the publish /
 * upload actions the server dialogs carry without a local directory.
 */
function ServerRow({ app, t, onPublish, onUpload }: ServerRowProps) {
  const cards = cardsOfAppKind(app.appKind)
  const cardId = cards.length === 1 ? cards[0]?.id : undefined
  return (
    <li className={css.libraryRow}>
      <LibraryAvatar name={app.name} />
      <span className={css.libraryMain}>
        <span className={css.libraryName}>{app.name}</span>
        <span className={css.libraryMeta}>
          <span className={css.libraryType}>{typeLabelOf(cardId, t)}</span>
          <span className={css.libraryBadgeUnlinked}>{t('library.unlinkedDirectory')}</span>
        </span>
        <span className={css.libraryPath} title={app.slug}>{app.slug}</span>
      </span>
      <span className={css.libraryActions}>
        <button type="button" className={css.libraryActionButton} onClick={onPublish}>
          {t('library.action.publish')}
        </button>
        <button type="button" className={css.libraryActionButton} onClick={onUpload}>
          {t('library.action.upload')}
        </button>
      </span>
    </li>
  )
}

/** Row logo: the manifest icon when it loads, else the name's initial. */
function LibraryAvatar({ name, iconUrl }: { readonly name: string; readonly iconUrl?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className={css.libraryAvatar} aria-hidden="true">
      {iconUrl !== undefined && !broken
        ? (
          <img
            className={css.libraryAvatarImage}
            src={iconUrl}
            alt=""
            onError={() => { setBroken(true) }}
          />
        )
        : <span className={css.libraryAvatarFallback}>{initialOf(name)}</span>}
    </span>
  )
}

/** First code point of a display name, uppercased, with a blank-name guard. */
function initialOf(name: string): string {
  const first = [...name.trim()][0]
  return first === undefined ? '?' : first.toUpperCase()
}

/** One-line cause text for localized failure copy. */
function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : String(cause)
}
