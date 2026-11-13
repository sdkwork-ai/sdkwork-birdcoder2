/**
 * Publish-as-template dialog: the product surface behind the project row's
 * `发布为模板` action.
 *
 * The dialog owns the publish workflow only. It scans `<project>/apps` or
 * inspects one custom directory, plans the app/template dedupe against the
 * caller's platform apps and templates, and publishes the selected app with
 * one inline progress/result run. Install is a separate dialog with its own
 * state and panel.
 *
 * Scanning, dedupe, and publish execution live in the pure modules and the
 * SDK/host ports; this component composes them for publication.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import type { DeployKey } from './locales.ts'
import { scanTemplateApps, type TemplateAppCandidate, type TemplateAppScan } from './templateApps.ts'
import {
  CustomTemplateDirectoryError,
  inspectCustomTemplateApp,
  type CustomTemplateAppInspection,
} from './templateCustomApp.ts'
import { templateAppTypeOption, type TemplateAppTypeOption } from './templateAppTypes.ts'
import {
  planTemplatePublications,
  publishTemplateApp,
  type OwnedPlatformApp,
  type OwnedTemplate,
  type TemplateAppValues,
  type TemplateMediaDraft,
  type TemplatePublishPlan,
  type TemplatePublishStage,
  type TemplatePublishSettings,
} from './templatePublish.ts'
import {
  createCustomTemplateAppPort,
  createTemplatePublishPorts,
  listOwnedPlatformApps,
  listOwnedTemplates,
} from './templatePorts.ts'
import type { TemplateCategoryOption } from './TemplatePublishPanel.tsx'
import {
  TemplatePublishPanel,
  type TemplateRunState,
  type TemplateRunSummary,
} from './TemplatePublishPanel.tsx'
import { TemplateDialogFrame, type TemplateDialogUser } from './TemplateDialogFrame.tsx'
import css from './TemplateDialog.module.css'

/** Props for the publish dialog. */
export interface TemplatePublishDialogProps {
  readonly host: DeployHost
  readonly clients: DeployHostClients
  /** Host color scheme driving the dialog's dark token block. */
  readonly theme: 'light' | 'dark'
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project directory the `apps/` tree is read from. */
  readonly directory?: string | undefined
  /** The current SDKWork account, or undefined while signed out. */
  readonly currentUser?: TemplateDialogUser | undefined
  /** Raise the shared sign-in surface. */
  readonly startSignIn?: (() => void) | undefined
  readonly onClose: () => void
  /** One publish completed; `count` is 0 or 1. */
  readonly onPublished?: ((count: number) => void) | undefined
}

/** One account-scoped catalog read for the publish dedupe. */
interface PublishCatalog {
  readonly apps: readonly OwnedPlatformApp[]
  readonly templates: readonly OwnedTemplate[]
  readonly categories: readonly TemplateCategoryOption[]
}

/**
 * Render the publish dialog.
 * @param props - host bridge, clients, theme, locale seat, the project
 *   directory, the signed-in account, and the close/outcome callbacks.
 * @returns the publish-only dialog.
 */
export function TemplatePublishDialog({
  host, clients, theme, t, directory, currentUser, startSignIn, onClose, onPublished,
}: TemplatePublishDialogProps) {
  const [publishStep, setPublishStep] = useState<1 | 2>(1)
  const [sourceMode, setSourceMode] = useState<'apps' | 'custom'>('apps')
  const [customInspection, setCustomInspection] = useState<CustomTemplateAppInspection | undefined>(undefined)
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState<string | undefined>(undefined)
  const [scan, setScan] = useState<TemplateAppScan | undefined>(undefined)
  const [scanError, setScanError] = useState<string | undefined>(undefined)
  const [scanRevision, setScanRevision] = useState(0)
  const [catalog, setCatalog] = useState<PublishCatalog | undefined>(undefined)
  const [catalogError, setCatalogError] = useState<string | undefined>(undefined)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [selectedDirectory, setSelectedDirectory] = useState<string | undefined>(undefined)
  const [valueOverrides, setValueOverrides] = useState<Readonly<Record<string, Partial<TemplateAppValues>>>>({})
  const [mediaDrafts, setMediaDrafts] = useState<Readonly<Record<string, TemplateMediaDraft>>>({})
  const [categoryUuid, setCategoryUuid] = useState('')
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE')
  const [submitForReview, setSubmitForReview] = useState(false)
  const [runs, setRuns] = useState<Readonly<Record<string, TemplateRunState>>>({})
  const [publishing, setPublishing] = useState(false)
  const [summary, setSummary] = useState<TemplateRunSummary | undefined>(undefined)
  const [latestVersions, setLatestVersions] = useState<Readonly<Record<string, string>>>({})
  const latestVersionAttempts = useRef(new Set<string>())

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

  const customApp = customInspection?.candidate
  const activeCandidates = sourceMode === 'custom'
    ? customApp === undefined ? [] : [customApp]
    : scan?.apps ?? []
  const activeSelection = sourceMode === 'custom' ? customApp?.directory : selectedDirectory
  const plans = useMemo(() => {
    const versions: Readonly<Record<string, string | undefined>> = latestVersions
    const templates = (catalog?.templates ?? []).map(template =>
      versions[template.id] === undefined
        ? template
        : { ...template, latestVersion: versions[template.id] })
    return planTemplatePublications(activeCandidates, catalog?.apps ?? [], templates)
  // `activeCandidates` is derived from these three inputs.
  }, [activeCandidates, catalog, latestVersions])

  const valuesOf = (plan: TemplatePublishPlan): TemplateAppValues => ({
    ...plan.values,
    ...valueOverrides[plan.candidate.directory],
  })

  const selectedPlan = plans.find(plan => plan.candidate.directory === activeSelection)
  const settings: TemplatePublishSettings = {
    categoryUuid,
    visibility,
    submitForReview: visibility === 'PUBLIC' && submitForReview,
  }

  const select = (candidateDirectory: string): void => {
    setSelectedDirectory(candidateDirectory)
  }

  const changeValues = (candidateDirectory: string, patch: Partial<TemplateAppValues>): void => {
    setValueOverrides(current => ({
      ...current,
      [candidateDirectory]: { ...current[candidateDirectory], ...patch },
    }))
  }

  const changeMedia = (candidateDirectory: string, draft: TemplateMediaDraft): void => {
    setMediaDrafts(current => ({ ...current, [candidateDirectory]: draft }))
  }

  const changeSourceMode = (mode: 'apps' | 'custom'): void => {
    setSourceMode(mode)
    setPublishStep(1)
  }

  const chooseCustomDirectory = async (): Promise<void> => {
    const picked = await host.pickDirectory(directory).catch(() => undefined)
    if (picked === undefined || picked.trim() === '') return
    setCustomLoading(true)
    setCustomError(undefined)
    try {
      const inspection = await inspectCustomTemplateApp(createCustomTemplateAppPort(host), picked)
      setCustomInspection(inspection)
      setSourceMode('custom')
      setPublishStep(1)
    } catch (cause: unknown) {
      setCustomInspection(undefined)
      setCustomError(customDirectoryMessage(cause, t))
      setSourceMode('custom')
    } finally {
      setCustomLoading(false)
    }
  }

  const rescanCustomDirectory = async (): Promise<void> => {
    const directoryToScan = customInspection?.candidate.directory
    if (directoryToScan === undefined) return
    setCustomLoading(true)
    setCustomError(undefined)
    try {
      setCustomInspection(await inspectCustomTemplateApp(createCustomTemplateAppPort(host), directoryToScan))
    } catch (cause: unknown) {
      setCustomInspection(undefined)
      setCustomError(customDirectoryMessage(cause, t))
    } finally {
      setCustomLoading(false)
    }
  }

  const clearCustomDirectory = (): void => {
    setCustomInspection(undefined)
    setCustomError(undefined)
  }

  const changeCustomType = (typeId: string): void => {
    const option = templateAppTypeOption(typeId)
    if (option === undefined) return
    setCustomInspection(current => current === undefined
      ? current
      : { ...current, candidate: withCustomAppType(current.candidate, option) })
  }

  const startPublish = async (): Promise<void> => {
    if (publishing || selectedPlan === undefined) return
    const plan = selectedPlan
    const candidateDirectory = plan.candidate.directory
    setPublishing(true)
    setSummary(undefined)
    setRuns({ [candidateDirectory]: { phase: 'running', detail: t('templateCenter.row.pending') } })
    const ports = createTemplatePublishPorts(clients, host)
    let created = 0
    let updated = 0
    let failed = 0
    try {
      const outcome = await publishTemplateApp(ports, {
        plan,
        values: valuesOf(plan),
        settings,
        media: mediaDrafts[candidateDirectory],
        onStage: (stage) => {
          setRuns({ [candidateDirectory]: runStateOf(stage, t) })
        },
      })
      if (outcome.createdTemplate) created = 1
      else updated = 1
      setRuns({
        [candidateDirectory]: {
          phase: 'done',
          detail: t('templateCenter.row.done', { version: outcome.version }),
          ...(outcome.warnings.length === 0 ? {} : { warnings: outcome.warnings }),
        },
      })
    } catch (cause: unknown) {
      failed = 1
      setRuns({
        [candidateDirectory]: {
          phase: 'failed',
          detail: t('templateCenter.row.failed', { message: messageOf(cause) }),
        },
      })
    }
    setPublishing(false)
    setSummary({ created, updated, failed })
    setCatalogRevision(revision => revision + 1)
    if (created + updated > 0) onPublished?.(created + updated)
  }

  const resetPublishWizard = (): void => {
    setPublishStep(1)
    setSourceMode('apps')
    setSelectedDirectory(undefined)
    setCustomInspection(undefined)
    setCustomError(undefined)
    setValueOverrides({})
    setMediaDrafts({})
    setRuns({})
    setSummary(undefined)
  }

  const body = ((): ReactNode => {
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
          selectedDirectory={activeSelection}
          sourceMode={sourceMode}
          customApp={customApp}
          customInspection={customInspection}
          customLoading={customLoading}
          customError={customError}
          step={publishStep}
          runs={runs}
          publishing={publishing}
          summary={summary}
          valuesOf={valuesOf}
          mediaOf={plan => mediaDrafts[plan.candidate.directory]}
          onMediaChange={changeMedia}
          onStepChange={setPublishStep}
          onSourceModeChange={changeSourceMode}
          onChooseCustomDirectory={() => { void chooseCustomDirectory() }}
          onRescanCustom={() => { void rescanCustomDirectory() }}
          onClearCustom={clearCustomDirectory}
          onCustomTypeChange={changeCustomType}
          onSelect={select}
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
            setPublishStep(1)
            setSummary(undefined)
            setRuns({})
          }}
          onPublish={() => { void startPublish() }}
          onReset={resetPublishWizard}
          onClose={onClose}
        />
      </>
    )
  })()

  return (
    <TemplateDialogFrame
      theme={theme}
      t={t}
      title={t('templateCenter.publishTitle')}
      subtitle={t('templateCenter.publishSubtitle')}
      currentUser={currentUser}
      startSignIn={startSignIn}
      busy={publishing}
      onClose={onClose}
    >
      {body}
    </TemplateDialogFrame>
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
    case 'uploadingMedia':
      return {
        phase: 'running',
        detail: t('templateCenter.stage.uploadingMedia', {
          completed: String(stage.completed),
          total: String(stage.total),
        }),
        ...(stage.total > 0 ? { percent: Math.round((stage.completed / stage.total) * 100) } : {}),
      }
    case 'packing':
      return {
        phase: 'running',
        detail: t('templateCenter.stage.packing', {
          read: String(stage.read),
          total: String(stage.total),
        }),
        ...(stage.total > 0 ? { percent: Math.round((stage.read / stage.total) * 100) } : {}),
      }
    case 'compressed':
      return {
        phase: 'running',
        detail: t('templateCenter.stage.compressed', {
          files: String(stage.files),
          size: formatBytes(stage.bytes),
        }),
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

/** Localized custom-directory inspection failure. */
function customDirectoryMessage(
  cause: unknown,
  t: (key: DeployKey, params?: Record<string, string>) => string,
): string {
  if (cause instanceof CustomTemplateDirectoryError) {
    return t(cause.failure === 'empty'
      ? 'templateCenter.custom.empty'
      : 'templateCenter.custom.unreadable')
  }
  return t('templateCenter.custom.detectFailed', { message: messageOf(cause) })
}

/** Apply one manual type option without leaving a stale card id behind. */
function withCustomAppType(
  candidate: TemplateAppCandidate,
  option: TemplateAppTypeOption,
): TemplateAppCandidate {
  type MutableCandidate = { -readonly [K in keyof TemplateAppCandidate]: TemplateAppCandidate[K] }
  const next: MutableCandidate = { ...candidate }
  if (option.cardId === undefined) delete next.cardId
  else next.cardId = option.cardId
  next.platforms = option.platforms
  next.appTypeId = option.id
  next.typeSource = 'manual'
  return next
}

/** Human byte count for the local-compression stage. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
