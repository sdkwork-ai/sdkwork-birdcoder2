/**
 * App template center: the product surface behind the project row's
 * `发布为模板` action.
 *
 * Two tabs share one account-scoped frame:
 *
 * - **Publish** scans `<project>/apps` for the independent app roots the
 *   SDKWork workspace standard defines, plans the per-app dedupe against the
 *   caller's platform apps and templates, and publishes the selected roots as
 *   scaffold templates with live per-row progress.
 * - **Download** lists the caller's own templates (and the marketplace) and
 *   installs one into `<project>/apps/<key>` or a custom directory through the
 *   host install bridge, then reconciles the app manifest and the
 *   `apps/README.md` index.
 *
 * The component owns presentation state only; scanning, dedupe, publishing,
 * and install execution live in the pure modules and the SDK/host ports.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { scanTemplateApps, type TemplateAppScan } from './templateApps.ts'
import {
  planTemplatePublications,
  publishTemplateApp,
  type OwnedPlatformApp,
  type OwnedTemplate,
  type TemplateAppValues,
  type TemplatePublishPlan,
  type TemplatePublishStage,
  type TemplatePublishSettings,
} from './templatePublish.ts'
import {
  createTemplatePublishPorts,
  listOwnedPlatformApps,
  listOwnedTemplates,
} from './templatePorts.ts'
import type { TemplateDownloadOutcome } from './templateDownload.ts'
import type { TemplateCategoryOption } from './TemplatePublishPanel.tsx'
import {
  TemplatePublishPanel,
  type TemplateRunState,
  type TemplateRunSummary,
} from './TemplatePublishPanel.tsx'
import { TemplateDownloadPanel } from './TemplateDownloadPanel.tsx'
import dialogs from './DeployDialogs.module.css'
import css from './TemplateCenter.module.css'

/** The signed-in account identity the header chip shows. */
export interface TemplateCenterUser {
  readonly id: string
  readonly displayName: string
  readonly avatarUrl?: string
  readonly email?: string
}

/** Props for the template center. */
export interface TemplateCenterDialogProps {
  readonly host: DeployHost
  readonly clients: DeployHostClients
  /** Host color scheme driving the dialog's dark token block. */
  readonly theme: 'light' | 'dark'
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project directory the `apps/` tree is read from and installed into. */
  readonly directory?: string | undefined
  /** Tab to select first; defaults to the publish surface. */
  readonly initialTab?: 'publish' | 'download' | undefined
  /** The current SDKWork account, or undefined while signed out. */
  readonly currentUser?: TemplateCenterUser | undefined
  /** Raise the shared sign-in surface. */
  readonly startSignIn?: (() => void) | undefined
  readonly onClose: () => void
  /** A publish batch completed; `count` templates were created or updated. */
  readonly onPublished?: ((count: number) => void) | undefined
  /** One template install completed. */
  readonly onInstalled?: ((outcome: TemplateDownloadOutcome) => void) | undefined
}

/** One account-scoped catalog read for the publish dedupe. */
interface PublishCatalog {
  readonly apps: readonly OwnedPlatformApp[]
  readonly templates: readonly OwnedTemplate[]
  readonly categories: readonly TemplateCategoryOption[]
}

/**
 * Render the template center.
 * @param props - host bridge, clients, theme, locale seat, the project
 *   directory, the signed-in account, and the close/outcome callbacks.
 * @returns the two-tab dialog.
 */
export function TemplateCenterDialog({
  host, clients, theme, t, directory, initialTab, currentUser, startSignIn, onClose, onPublished, onInstalled,
}: TemplateCenterDialogProps) {
  const [tab, setTab] = useState<'publish' | 'download'>(initialTab ?? 'publish')
  const [scan, setScan] = useState<TemplateAppScan | undefined>(undefined)
  const [scanError, setScanError] = useState<string | undefined>(undefined)
  const [scanRevision, setScanRevision] = useState(0)
  const [catalog, setCatalog] = useState<PublishCatalog | undefined>(undefined)
  const [catalogError, setCatalogError] = useState<string | undefined>(undefined)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [valueOverrides, setValueOverrides] = useState<Readonly<Record<string, Partial<TemplateAppValues>>>>({})
  const [categoryUuid, setCategoryUuid] = useState('')
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE')
  const [submitForReview, setSubmitForReview] = useState(false)
  const [runs, setRuns] = useState<Readonly<Record<string, TemplateRunState>>>({})
  const [publishing, setPublishing] = useState(false)
  const [summary, setSummary] = useState<TemplateRunSummary | undefined>(undefined)
  const [latestVersions, setLatestVersions] = useState<Readonly<Record<string, string>>>({})
  const latestVersionAttempts = useRef(new Set<string>())
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // Escape closes an idle dialog; a running publish keeps it on screen.
  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !publishing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose, publishing])

  // Scan the project's apps/ tree whenever the directory or the operator asks.
  useEffect(() => {
    if (currentUser === undefined) {
      setScan(undefined)
      return
    }
    if (directory === undefined || directory.trim() === '') {
      setScan(undefined)
      setScanError(t('templateCenter.noDirectory'))
      return
    }
    let cancelled = false
    setScan(undefined)
    setScanError(undefined)
    void scanTemplateApps(host, directory).then((next) => {
      if (!cancelled) setScan(next)
    }).catch((cause: unknown) => {
      if (!cancelled) setScanError(t('templateCenter.loadFailed', { message: messageOf(cause) }))
    })
    return () => { cancelled = true }
  }, [host, directory, scanRevision, currentUser, t])

  // Read the account-scoped catalog the publish plan dedupes against.
  useEffect(() => {
    if (currentUser === undefined) {
      setCatalog(undefined)
      return
    }
    let cancelled = false
    setCatalogError(undefined)
    void Promise.all([
      listOwnedPlatformApps(clients.deployClient),
      listOwnedTemplates(clients.deployClient),
      clients.deployClient.template.templateCategories.list({ includeDisabled: false }),
    ]).then(([apps, templates, page]) => {
      if (cancelled) return
      setCatalog({
        apps,
        templates,
        categories: page.items
          .filter(category => category.status === 'ACTIVE')
          .map(category => ({ id: category.id, displayName: category.displayName })),
      })
    }).catch((cause: unknown) => {
      if (!cancelled) setCatalogError(t('templateCenter.loadFailed', { message: messageOf(cause) }))
    })
    return () => { cancelled = true }
  }, [clients, currentUser, catalogRevision, t])

  // Resolve the latest SEMANTIC version for every existing listing. The
  // listing response carries `latestVersionUuid` plus an optimistic-lock
  // counter named `version`; using that counter as a version number would
  // produce nonsense defaults, so the versions are read once per listing and
  // refreshed when a publish advances `latestVersionUuid`.
  useEffect(() => {
    const pending = (catalog?.templates ?? []).filter((template) => {
      const uuid = template.latestVersionUuid
      return uuid !== undefined && !latestVersionAttempts.current.has(`${template.id}:${uuid}`)
    })
    if (pending.length === 0) return
    let cancelled = false
    for (const template of pending) {
      const uuid = template.latestVersionUuid
      if (uuid === undefined) continue
      latestVersionAttempts.current.add(`${template.id}:${uuid}`)
      void clients.deployClient.template.appTemplateVersions
        .list(template.id, { page: 1, pageSize: 50 })
        .then((page) => {
          if (cancelled) return
          const latest = (page.items.find(item => item.id === uuid) ?? page.items[0]) as
            { readonly templateVersion?: string } | undefined
          const semantic = latest?.templateVersion?.trim() ?? ''
          if (semantic === '') return
          setLatestVersions(current => ({ ...current, [template.id]: semantic }))
        })
        .catch(() => {
          // A missing version read leaves the manifest-recorded version (or
          // the safe 0.1.0 default) in place; the operator can edit it.
        })
    }
    return () => { cancelled = true }
  }, [catalog, clients])

  // Keep the category selection on a value the server still offers.
  useEffect(() => {
    const categories = catalog?.categories ?? []
    setCategoryUuid(current =>
      current !== '' && categories.some(category => category.id === current)
        ? current
        : categories[0]?.id ?? '')
  }, [catalog])

  const plans = useMemo(() => {
    const versions: Readonly<Record<string, string | undefined>> = latestVersions
    const templates = (catalog?.templates ?? []).map(template =>
      versions[template.id] === undefined
        ? template
        : { ...template, latestVersion: versions[template.id] })
    return planTemplatePublications(scan?.apps ?? [], catalog?.apps ?? [], templates)
  }, [scan, catalog, latestVersions])

  const valuesOf = (plan: TemplatePublishPlan): TemplateAppValues => ({
    ...plan.values,
    ...valueOverrides[plan.candidate.directory],
  })

  const selectedPlans = plans.filter(plan => selected.has(plan.candidate.directory))
  const settings: TemplatePublishSettings = {
    categoryUuid,
    visibility,
    submitForReview: visibility === 'PUBLIC' && submitForReview,
  }

  const toggle = (candidateDirectory: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(candidateDirectory)) next.delete(candidateDirectory)
      else next.add(candidateDirectory)
      return next
    })
  }

  const selectAll = (): void => {
    setSelected(new Set(plans
      .filter(plan => plan.conflict === undefined)
      .map(plan => plan.candidate.directory)))
  }

  const changeValues = (candidateDirectory: string, patch: Partial<TemplateAppValues>): void => {
    setValueOverrides(current => ({
      ...current,
      [candidateDirectory]: { ...current[candidateDirectory], ...patch },
    }))
  }

  const startPublish = async (): Promise<void> => {
    if (publishing || selectedPlans.length === 0) return
    setPublishing(true)
    setSummary(undefined)
    setRuns({})
    const ports = createTemplatePublishPorts(clients, host)
    let created = 0
    let updated = 0
    let failed = 0
    for (const plan of selectedPlans) {
      const candidateDirectory = plan.candidate.directory
      setRuns(current => ({
        ...current,
        [candidateDirectory]: { phase: 'running', detail: t('templateCenter.row.pending') },
      }))
      try {
        const outcome = await publishTemplateApp(ports, {
          plan,
          values: valuesOf(plan),
          settings,
          onStage: (stage) => {
            setRuns(current => ({
              ...current,
              [candidateDirectory]: runStateOf(stage, t),
            }))
          },
        })
        if (outcome.createdTemplate) created += 1
        else updated += 1
        setRuns(current => ({
          ...current,
          [candidateDirectory]: {
            phase: 'done',
            detail: t('templateCenter.row.done', { version: outcome.version }),
            ...(outcome.warnings.length === 0 ? {} : { warnings: outcome.warnings }),
          },
        }))
      } catch (cause: unknown) {
        failed += 1
        setRuns(current => ({
          ...current,
          [candidateDirectory]: {
            phase: 'failed',
            detail: t('templateCenter.row.failed', { message: messageOf(cause) }),
          },
        }))
      }
    }
    setPublishing(false)
    setSummary({ created, updated, failed })
    setCatalogRevision(revision => revision + 1)
    if (created + updated > 0) onPublished?.(created + updated)
  }

  const body = ((): ReactNode => {
    if (currentUser === undefined) {
      return (
        <div className={css.signInState}>
          <span className={css.signInGlyph} aria-hidden="true">◎</span>
          <span className={css.emptyTitle}>{t('templateCenter.signedOut.title')}</span>
          <span className={css.emptyHint}>{t('templateCenter.signedOut.hint')}</span>
          {startSignIn !== undefined && (
            <button type="button" className={css.primaryButton} onClick={startSignIn}>
              {t('templateCenter.signIn')}
            </button>
          )}
        </div>
      )
    }
    if (tab === 'download') {
      return (
        <TemplateDownloadPanel
          host={host}
          clients={clients}
          directory={directory}
          t={t}
          onInstalled={onInstalled}
        />
      )
    }
    if (catalog === undefined && catalogError !== undefined) {
      return (
        <div className={css.catalogFailure}>
          <div className={css.notice} role="alert">
            <span>{catalogError}</span>
            <button
              type="button"
              className={css.ghostButton}
              onClick={() => { setCatalogRevision(revision => revision + 1) }}
            >
              {t('templateCenter.retry')}
            </button>
          </div>
        </div>
      )
    }
    return (
      <>
        {catalogError !== undefined && (
          <div className={css.notice} role="alert">
            <span>{catalogError}</span>
            <button
              type="button"
              className={css.ghostButton}
              onClick={() => { setCatalogRevision(revision => revision + 1) }}
            >
              {t('templateCenter.retry')}
            </button>
          </div>
        )}
        <TemplatePublishPanel
          t={t}
          directory={directory}
          scan={scan}
          scanError={scanError}
          loading={(scan === undefined && scanError === undefined)
            || (catalog === undefined && catalogError === undefined)}
          plans={plans}
          categories={catalog?.categories ?? []}
          categoryUuid={categoryUuid}
          visibility={visibility}
          submitForReview={submitForReview}
          selected={selected}
          runs={runs}
          publishing={publishing}
          error={undefined}
          summary={summary}
          valuesOf={valuesOf}
          onToggle={toggle}
          onSelectAll={selectAll}
          onClear={() => { setSelected(new Set()) }}
          onValuesChange={changeValues}
          onCategoryChange={setCategoryUuid}
          onVisibilityChange={(next) => {
            setVisibility(next)
            setSubmitForReview(next === 'PUBLIC')
          }}
          onSubmitForReviewChange={setSubmitForReview}
          onRescan={() => {
            setScanRevision(revision => revision + 1)
            setCatalogRevision(revision => revision + 1)
            setSummary(undefined)
            setRuns({})
          }}
          onPublish={() => { void startPublish() }}
        />
      </>
    )
  })()

  return (
    <div
      className={dialogs.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('templateCenter.title')}
      data-theme={theme}
    >
      <div className={`${dialogs.modal} ${css.modal}`}>
        <header className={css.header}>
          <div className={css.titleBlock}>
            <span className={css.titleGlyph} aria-hidden="true">▤</span>
            <div>
              <h2 className={css.title}>{t('templateCenter.title')}</h2>
              <p className={css.subtitle}>{t('templateCenter.subtitle')}</p>
            </div>
          </div>
          <div className={css.headerRight}>
            {currentUser !== undefined && <UserChip user={currentUser} t={t} />}
            <button
              ref={closeRef}
              type="button"
              className={dialogs.closeButton}
              onClick={onClose}
              disabled={publishing}
              aria-label={t('templateCenter.close')}
            >
              ✕
            </button>
          </div>
        </header>
        <nav className={css.tabs} role="tablist" aria-label={t('templateCenter.title')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'publish'}
            className={`${css.tab}${tab === 'publish' ? ` ${css.tabActive}` : ''}`}
            onClick={() => { setTab('publish') }}
            disabled={publishing}
          >
            {t('templateCenter.tab.publish')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'download'}
            className={`${css.tab}${tab === 'download' ? ` ${css.tabActive}` : ''}`}
            onClick={() => { setTab('download') }}
            disabled={publishing}
          >
            {t('templateCenter.tab.download')}
          </button>
        </nav>
        <div className={css.body} role="tabpanel">
          {body}
        </div>
      </div>
    </div>
  )
}

/** The signed-in account chip in the header. */
function UserChip({
  user,
  t,
}: {
  readonly user: TemplateCenterUser
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
}) {
  return (
    <span className={css.userChip} title={t('templateCenter.userChip', { name: user.displayName })}>
      <span className={css.userAvatar}>
        {user.avatarUrl === undefined
          ? <span className={css.userInitial}>{user.displayName.slice(0, 1).toUpperCase()}</span>
          : <img className={css.userAvatarImage} src={user.avatarUrl} alt="" />}
      </span>
      <span className={css.userText}>
        <span className={css.userName}>{user.displayName}</span>
        {user.email !== undefined && <span className={css.userEmail}>{user.email}</span>}
      </span>
    </span>
  )
}

/** Map one publish stage onto the row's live status. */
function runStateOf(
  stage: TemplatePublishStage,
  t: (key: DeployKey, params?: Record<string, string>) => string,
): TemplateRunState {
  switch (stage.kind) {
    case 'registering':
      return { phase: 'running', detail: t('templateCenter.stage.registering') }
    case 'packing':
      return {
        phase: 'running',
        detail: t('templateCenter.stage.packing', {
          read: String(stage.read),
          total: String(stage.total),
        }),
        ...(stage.total > 0 ? { percent: Math.round((stage.read / stage.total) * 100) } : {}),
      }
    case 'uploading':
      return {
        phase: 'running',
        detail: t('templateCenter.stage.uploading', { percent: String(stage.percent) }),
        percent: stage.percent,
      }
    case 'saving':
      return { phase: 'running', detail: t('templateCenter.stage.saving') }
    case 'submitting':
      return { phase: 'running', detail: t('templateCenter.stage.submitting') }
    case 'linking':
      return { phase: 'running', detail: t('templateCenter.stage.linking') }
  }
}

/** One-line cause text for localized failure copy. */
function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : String(cause)
}
