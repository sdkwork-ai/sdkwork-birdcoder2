/**
 * Publish wizard of the app template center.
 *
 * The surface is deliberately staged rather than a dense two-column form:
 *
 * 1. **Select** the independent `apps/` roots a template should be created
 *    from (multi-select, one card per root).
 * 2. **Configure** the per-app template values and the shared account-scoped
 *    publish settings (category, visibility, review).
 * 3. **Publish** with a visible overall/per-row progress ledger and a result
 *    summary that allows retrying only the failed rows.
 *
 * Presentation only — scanning, planning, publishing, and the dedupe refresh
 * arrive from the dialog through props.
 */
import { useEffect, useRef, useState } from 'react'
import type { DeployKey } from './locales.ts'
import type {
  TemplateAppCandidate,
  TemplateAppScan,
  IgnoredTemplateDirectory,
} from './templateApps.ts'
import type { CustomTemplateAppInspection } from './templateCustomApp.ts'
import { TEMPLATE_APP_TYPE_OPTIONS, templateAppTypeOption } from './templateAppTypes.ts'
import {
  platformAppKind,
  type TemplateAppValues,
  type TemplatePublishPlan,
} from './templatePublish.ts'
import css from './TemplateDialog.module.css'

/** Template identifiers double as installed app directory names. */
const TEMPLATE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
/** The bump helper and the backend expect three numeric components. */
const TEMPLATE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u

/** One selected row's live publish state. */
export interface TemplateRunState {
  readonly phase: 'running' | 'done' | 'failed'
  readonly detail: string
  readonly percent?: number
  readonly warnings?: readonly string[]
}

/** One template category offered by the server. */
export interface TemplateCategoryOption {
  readonly id: string
  readonly displayName: string
}

/** Publish-run totals shown after the batch finishes. */
export interface TemplateRunSummary {
  readonly created: number
  readonly updated: number
  readonly failed: number
}

/** The three wizard stages, in order. */
export type TemplatePublishStep = 1 | 2 | 3

/** Props for the publish wizard. */
export interface TemplatePublishPanelProps {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Project directory being published from (undefined without a cwd). */
  readonly directory?: string | undefined
  readonly scan: TemplateAppScan | undefined
  readonly scanError: string | undefined
  readonly loading: boolean
  readonly plans: readonly TemplatePublishPlan[]
  readonly categories: readonly TemplateCategoryOption[]
  readonly categoryUuid: string
  readonly visibility: 'PRIVATE' | 'PUBLIC'
  readonly submitForReview: boolean
  readonly selected: ReadonlySet<string>
  /** The active source: the project's `apps/` tree or one picked directory. */
  readonly sourceMode: 'apps' | 'custom'
  readonly customApp: TemplateAppCandidate | undefined
  readonly customInspection: CustomTemplateAppInspection | undefined
  readonly customLoading: boolean
  readonly customError: string | undefined
  /** The current wizard step. */
  readonly step: TemplatePublishStep
  readonly runs: Readonly<Record<string, TemplateRunState>>
  readonly publishing: boolean
  readonly summary: TemplateRunSummary | undefined
  readonly valuesOf: (plan: TemplatePublishPlan) => TemplateAppValues
  readonly onStepChange: (step: TemplatePublishStep) => void
  readonly onSourceModeChange: (mode: 'apps' | 'custom') => void
  readonly onChooseCustomDirectory: () => void
  readonly onRescanCustom: () => void
  readonly onClearCustom: () => void
  readonly onCustomTypeChange: (typeId: string) => void
  readonly onToggle: (directory: string) => void
  readonly onSelectAll: () => void
  readonly onClear: () => void
  readonly onValuesChange: (directory: string, patch: Partial<TemplateAppValues>) => void
  readonly onCategoryChange: (categoryUuid: string) => void
  readonly onVisibilityChange: (visibility: 'PRIVATE' | 'PUBLIC') => void
  readonly onSubmitForReviewChange: (submit: boolean) => void
  readonly onRescan: () => void
  /** Run the batch; `onlyFailed` retries just the failed rows. */
  readonly onPublish: (onlyFailed?: boolean) => void
  /** Clear the run and return to a fresh selection step. */
  readonly onReset: () => void
  readonly onClose: () => void
}

/**
 * Render the publish wizard.
 * @param props - the scan, plans, selection, settings, live runs, and actions.
 * @returns the staged publish surface.
 */
export function TemplatePublishPanel(props: TemplatePublishPanelProps) {
  const {
    t, directory, scan, scanError, loading, plans, categories, categoryUuid, visibility,
    submitForReview, selected, sourceMode, customApp, customInspection, customLoading,
    customError, step, runs, publishing, summary, valuesOf,
    onStepChange, onSourceModeChange, onChooseCustomDirectory, onRescanCustom,
    onClearCustom, onCustomTypeChange, onToggle, onSelectAll, onClear, onValuesChange,
    onCategoryChange, onVisibilityChange, onSubmitForReviewChange, onRescan, onPublish,
    onReset, onClose,
  } = props
  const wizardRef = useRef<HTMLDivElement>(null)
  const lastStep = useRef(step)
  const selectedPlans = plans.filter(plan => selected.has(plan.candidate.directory))
  const selectedDirectories = selectedPlans.map(plan => plan.candidate.directory).join('\u0000')
  const [activeDirectory, setActiveDirectory] = useState<string | undefined>(undefined)
  const activePlan = (selectedPlans.find(plan => plan.candidate.directory === activeDirectory)
    ?? selectedPlans[0]) as TemplatePublishPlan | undefined
  // Keep the configuration rail on a row that is still selected.
  useEffect(() => {
    if (selectedPlans.length === 0) return
    if (!selectedPlans.some(plan => plan.candidate.directory === activeDirectory)) {
      setActiveDirectory(selectedPlans[0]?.candidate.directory)
    }
  }, [selectedDirectories, activeDirectory])
  // A stage change replaces the footer action, so move focus to the new stage
  // heading instead of leaving it on a removed control.
  useEffect(() => {
    if (lastStep.current === step) return
    lastStep.current = step
    wizardRef.current?.querySelector<HTMLElement>('h3')?.focus()
  }, [step])
  const blocking = selectedPlans.some(plan => plan.conflict !== undefined
    || plan.platformApp === undefined && platformAppKind(plan.candidate) === undefined)
  const invalidValues = selectedPlans.some(plan => !valuesAreValid(valuesOf(plan)))
  const typeReady = selectedPlans.every(plan => sourceMode === 'custom'
    ? plan.candidate.appTypeId !== undefined
    : plan.platformApp !== undefined || platformAppKind(plan.candidate) !== undefined)
  const selectionBlocker = selectedPlans.length > 0 && !typeReady
    ? t(sourceMode === 'custom'
      ? 'templateCenter.custom.typeRequired'
      : 'templateCenter.blocker.selection')
    : undefined
  const settingsReady = categoryUuid !== '' && selectedPlans.length > 0 && !blocking && !invalidValues
  const canPublish = settingsReady && !publishing
  const publishBlocker = categories.length === 0
    ? t('templateCenter.blocker.category')
    : blocking
      ? t('templateCenter.blocker.selection')
      : invalidValues ? t('templateCenter.blocker.values') : undefined
  const createCount = selectedPlans.filter(plan => plan.template === undefined).length
  const updateCount = selectedPlans.filter(plan => plan.template !== undefined).length
  const registerCount = selectedPlans.filter(plan => plan.platformApp === undefined).length
  const doneCount = selectedPlans.filter(plan => runs[plan.candidate.directory]?.phase === 'done').length
  const failedCount = selectedPlans.filter(plan => runs[plan.candidate.directory]?.phase === 'failed').length
  const finishedCount = doneCount + failedCount
  const overallPercent = selectedPlans.length === 0
    ? 0
    : Math.round((finishedCount / selectedPlans.length) * 100)

  return (
    <div className={css.wizard} ref={wizardRef}>
      <PublishStepper
        t={t}
        step={step}
        selectedCount={selectedPlans.length}
        totalCount={plans.length}
        publishing={publishing}
        onStepChange={onStepChange}
      />
      <div className={css.stepBody}>
        <div className={css.stepContent} key={step}>
          {step === 1 && (
            <SelectStep
              t={t}
              directory={directory}
              scan={scan}
              scanError={scanError}
              loading={loading}
              plans={plans}
              projectCount={scan?.apps.length ?? 0}
              selected={selected}
              sourceMode={sourceMode}
              customApp={customApp}
              customInspection={customInspection}
              customLoading={customLoading}
              customError={customError}
              categoryReady={categories.length > 0}
              valuesOf={valuesOf}
              onSourceModeChange={onSourceModeChange}
              onChooseCustomDirectory={onChooseCustomDirectory}
              onRescanCustom={onRescanCustom}
              onClearCustom={onClearCustom}
              onCustomTypeChange={onCustomTypeChange}
              onToggle={onToggle}
              onSelectAll={onSelectAll}
              onClear={onClear}
              onRescan={onRescan}
            />
          )}
          {step === 2 && activePlan !== undefined && (
            <ConfigureStep
              t={t}
              plans={selectedPlans}
              activePlan={activePlan}
              activeDirectory={activePlan.candidate.directory}
              valuesOf={valuesOf}
              categories={categories}
              categoryUuid={categoryUuid}
              visibility={visibility}
              submitForReview={submitForReview}
              onSetActive={setActiveDirectory}
              onValuesChange={onValuesChange}
              onCategoryChange={onCategoryChange}
              onVisibilityChange={onVisibilityChange}
              onSubmitForReviewChange={onSubmitForReviewChange}
            />
          )}
          {step === 3 && (
            <ResultStep
              t={t}
              plans={selectedPlans}
              runs={runs}
              publishing={publishing}
              summary={summary}
              doneCount={doneCount}
              failedCount={failedCount}
              overallPercent={overallPercent}
            />
          )}
        </div>
      </div>
      {step === 1 && (
        <footer className={css.wizardFooter}>
          <div className={css.footerSummary}>
            <span className={css.footerCount}>
              {t('templateCenter.selectedCount', {
                selected: String(selectedPlans.length),
                total: String(plans.length),
              })}
            </span>
            <span className={css.footerMeta}>
              {t('templateCenter.plan.create', { count: String(createCount) })}
              {' · '}
              {t('templateCenter.plan.update', { count: String(updateCount) })}
            </span>
            {selectionBlocker !== undefined && (
              <span className={css.footerWarning} role="alert">{selectionBlocker}</span>
            )}
          </div>
          <div className={css.footerActions}>
            <button
              type="button"
              className={css.primaryButton}
              disabled={selectedPlans.length === 0 || !typeReady || publishing}
              onClick={() => { onStepChange(2) }}
            >
              {t('templateCenter.select.next')}
              <ChevronIcon />
            </button>
          </div>
        </footer>
      )}
      {step === 2 && (
        <footer className={css.wizardFooter}>
          <div className={css.footerSummary}>
            <span className={css.footerCount}>{t('templateCenter.selectedCount', {
              selected: String(selectedPlans.length),
              total: String(plans.length),
            })}</span>
            <span className={css.footerMeta}>
              {t('templateCenter.plan.create', { count: String(createCount) })}
              {' · '}
              {t('templateCenter.plan.update', { count: String(updateCount) })}
              {' · '}
              {t('templateCenter.plan.registerApp', { count: String(registerCount) })}
            </span>
            {publishBlocker !== undefined && (
              <span className={css.footerWarning} role="alert">{publishBlocker}</span>
            )}
          </div>
          <div className={css.footerActions}>
            <button type="button" className={css.secondaryButton} onClick={() => { onStepChange(1) }}>
              <ChevronIcon direction="left" />
              {t('templateCenter.configure.back')}
            </button>
            <button
              type="button"
              className={css.primaryButton}
              disabled={!canPublish}
              onClick={() => { onPublish() }}
            >
              {t('templateCenter.publishAction', { count: String(selectedPlans.length) })}
            </button>
          </div>
        </footer>
      )}
      {step === 3 && (
        <footer className={css.wizardFooter}>
          <div className={css.footerSummary}>
            {publishing && <span className={css.footerMeta}>{t('templateCenter.result.keepOpen')}</span>}
          </div>
          <div className={css.footerActions}>
            {!publishing && failedCount > 0 && (
              <button type="button" className={css.secondaryButton} onClick={() => { onPublish(true) }}>
                {t('templateCenter.result.retry', { count: String(failedCount) })}
              </button>
            )}
            {!publishing && (
              <button type="button" className={css.secondaryButton} onClick={onReset}>
                {t('templateCenter.result.again')}
              </button>
            )}
            {publishing
              ? (
                <button type="button" className={css.primaryButton} disabled>
                  <span className={css.spinner} aria-hidden="true" />
                  {t('templateCenter.result.publishingAction')}
                </button>
              )
              : (
                <button type="button" className={css.primaryButton} onClick={onClose}>
                  {t('templateCenter.result.done')}
                </button>
              )}
          </div>
        </footer>
      )}
    </div>
  )
}

/** The three-stage progress indicator. */
function PublishStepper(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly step: TemplatePublishStep
  readonly selectedCount: number
  readonly totalCount: number
  readonly publishing: boolean
  readonly onStepChange: (step: TemplatePublishStep) => void
}) {
  const { t, step, selectedCount, totalCount, publishing, onStepChange } = props
  const steps: readonly {
    readonly id: TemplatePublishStep
    readonly label: DeployKey
    readonly hint: DeployKey
    readonly hintParams?: Record<string, string>
  }[] = [
    {
      id: 1,
      label: 'templateCenter.step.select',
      hint: 'templateCenter.step.selectHint',
      hintParams: { selected: String(selectedCount), total: String(totalCount) },
    },
    { id: 2, label: 'templateCenter.step.configure', hint: 'templateCenter.step.configureHint' },
    { id: 3, label: 'templateCenter.step.publish', hint: 'templateCenter.step.publishHint' },
  ]
  return (
    <ol className={css.stepper} aria-label={t('templateCenter.step.label')}>
      {steps.map((entry) => {
        const state = entry.id < step ? 'done' : entry.id === step ? 'active' : 'upcoming'
        const canGoBack = entry.id < step && !publishing && (entry.id !== 2 || selectedCount > 0)
        return (
          <li key={entry.id} className={css.stepItem}>
            <button
              type="button"
              className={`${css.stepButton}${state === 'active' ? ` ${css.stepButtonActive}` : ''}${state === 'done' ? ` ${css.stepButtonDone}` : ''}`}
              aria-current={state === 'active' ? 'step' : undefined}
              disabled={!canGoBack && state !== 'active'}
              onClick={() => { if (canGoBack) onStepChange(entry.id) }}
            >
              <span className={css.stepNumber} aria-hidden="true">
                {state === 'done' ? <CheckIcon /> : entry.id}
              </span>
              <span className={css.stepText}>
                <span className={css.stepLabel}>{t(entry.label)}</span>
                <span className={css.stepHint}>{t(entry.hint, entry.hintParams)}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Step one: pick the app roots, from `apps/` or one custom directory. */
function SelectStep(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly directory?: string | undefined
  readonly scan: TemplateAppScan | undefined
  readonly scanError: string | undefined
  readonly loading: boolean
  readonly plans: readonly TemplatePublishPlan[]
  readonly projectCount: number
  readonly selected: ReadonlySet<string>
  readonly sourceMode: 'apps' | 'custom'
  readonly customApp: TemplateAppCandidate | undefined
  readonly customInspection: CustomTemplateAppInspection | undefined
  readonly customLoading: boolean
  readonly customError: string | undefined
  readonly categoryReady: boolean
  readonly valuesOf: (plan: TemplatePublishPlan) => TemplateAppValues
  readonly onSourceModeChange: (mode: 'apps' | 'custom') => void
  readonly onChooseCustomDirectory: () => void
  readonly onRescanCustom: () => void
  readonly onClearCustom: () => void
  readonly onCustomTypeChange: (typeId: string) => void
  readonly onToggle: (directory: string) => void
  readonly onSelectAll: () => void
  readonly onClear: () => void
  readonly onRescan: () => void
}) {
  const {
    t, directory, scan, scanError, loading, plans, projectCount, selected, sourceMode,
    customApp, customInspection, customLoading, customError, categoryReady, valuesOf,
    onSourceModeChange, onChooseCustomDirectory, onRescanCustom, onClearCustom,
    onCustomTypeChange, onToggle, onSelectAll, onClear, onRescan,
  } = props
  const selectedCount = plans.filter(plan => selected.has(plan.candidate.directory)).length
  return (
    <>
      <header className={css.stepHeader}>
        <div className={css.stepHeading}>
          <span className={css.stepEyebrow}>{t('templateCenter.step.eyebrow', { current: '1', total: '3' })}</span>
          <h3 className={css.stepTitle} tabIndex={-1}>{t('templateCenter.select.title')}</h3>
          <p className={css.stepDescription}>{t('templateCenter.select.subtitle')}</p>
        </div>
        <span className={css.stepBadge}>
          {sourceMode === 'custom'
            ? t('templateCenter.select.customBadge')
            : t('templateCenter.select.count', { count: String(plans.length) })}
        </span>
      </header>
      <div className={css.sourceTabs} role="group" aria-label={t('templateCenter.source.label')}>
        <button
          type="button"
          className={`${css.sourceTab}${sourceMode === 'apps' ? ` ${css.sourceTabActive}` : ''}`}
          aria-pressed={sourceMode === 'apps'}
          onClick={() => { onSourceModeChange('apps') }}
        >
          {t('templateCenter.source.apps')}
          <span className={css.sourceCount}>{projectCount}</span>
        </button>
        <button
          type="button"
          className={`${css.sourceTab}${sourceMode === 'custom' ? ` ${css.sourceTabActive}` : ''}`}
          aria-pressed={sourceMode === 'custom'}
          onClick={() => { onSourceModeChange('custom') }}
        >
          {t('templateCenter.source.custom')}
          {customApp !== undefined && <CheckIcon />}
        </button>
      </div>
      {!categoryReady && !loading && (
        <p className={css.stepWarning} role="alert">
          <span className={css.stepWarningMark} aria-hidden="true">!</span>
          {t('templateCenter.select.categoryWarning')}
        </p>
      )}
      {sourceMode === 'apps' && (
        <>
          <div className={css.selectionToolbar}>
            <span className={css.appsPath} title={directory ?? scan?.appsDirectory}>
              {directory === undefined
                ? t('templateCenter.noDirectory')
                : t('templateCenter.appsPath', { path: relativeApps(directory) })}
            </span>
            <div className={css.toolbarActions}>
              <button type="button" className={css.ghostButton} onClick={onSelectAll} disabled={plans.length === 0 || loading}>
                {t('templateCenter.selectAll')}
              </button>
              <button type="button" className={css.ghostButton} onClick={onClear} disabled={selectedCount === 0}>
                {t('templateCenter.clear')}
              </button>
              <button type="button" className={css.ghostButton} onClick={onRescan} disabled={loading}>
                {loading ? t('templateCenter.scanning') : t('templateCenter.rescan')}
              </button>
            </div>
          </div>
          {loading && <SkeletonGrid />}
          {!loading && scanError !== undefined && (
            <Notice text={scanError} retryLabel={t('templateCenter.retry')} onRetry={onRescan} />
          )}
          {!loading && scanError === undefined && plans.length === 0 && (
            <div className={css.emptyState}>
              <span className={css.emptyGlyph} aria-hidden="true">▤</span>
              <span className={css.emptyTitle}>{t('templateCenter.noApps.title')}</span>
              <span className={css.emptyHint}>{t('templateCenter.noApps.hint')}</span>
            </div>
          )}
          {!loading && scanError === undefined && plans.length > 0 && (
            <ul className={css.appGrid}>
              {plans.map(plan => (
                <li key={plan.candidate.directory}>
                  <SelectableAppCard
                    t={t}
                    plan={plan}
                    values={valuesOf(plan)}
                    selected={selected.has(plan.candidate.directory)}
                    onToggle={() => { onToggle(plan.candidate.directory) }}
                  />
                </li>
              ))}
            </ul>
          )}
          {scan !== undefined && scan.ignored.length > 0 && (
            <IgnoredLine t={t} ignored={scan.ignored} />
          )}
        </>
      )}
      {sourceMode === 'custom' && (
        <CustomSourcePanel
          t={t}
          customApp={customApp}
          customInspection={customInspection}
          customLoading={customLoading}
          customError={customError}
          onChooseCustomDirectory={onChooseCustomDirectory}
          onRescanCustom={onRescanCustom}
          onClearCustom={onClearCustom}
          onCustomTypeChange={onCustomTypeChange}
        />
      )}
    </>
  )
}

/** The custom-directory picker, detection summary, and manual type override. */
function CustomSourcePanel(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly customApp: TemplateAppCandidate | undefined
  readonly customInspection: CustomTemplateAppInspection | undefined
  readonly customLoading: boolean
  readonly customError: string | undefined
  readonly onChooseCustomDirectory: () => void
  readonly onRescanCustom: () => void
  readonly onClearCustom: () => void
  readonly onCustomTypeChange: (typeId: string) => void
}) {
  const {
    t, customApp, customInspection, customLoading, customError,
    onChooseCustomDirectory, onRescanCustom, onClearCustom, onCustomTypeChange,
  } = props
  if (customLoading) {
    return (
      <div className={css.customEmpty} role="status">
        <span className={css.spinner} aria-hidden="true" />
        <span className={css.emptyTitle}>{t('templateCenter.custom.detecting')}</span>
        <span className={css.emptyHint}>{t('templateCenter.custom.detectingHint')}</span>
      </div>
    )
  }
  if (customError !== undefined) {
    return (
      <div className={css.customEmpty} role="alert">
        <span className={css.emptyGlyph} aria-hidden="true">!</span>
        <span className={css.emptyTitle}>{t('templateCenter.custom.errorTitle')}</span>
        <span className={css.emptyHint}>{customError}</span>
        <button type="button" className={css.primaryButton} onClick={onChooseCustomDirectory}>
          {t('templateCenter.custom.chooseAgain')}
        </button>
      </div>
    )
  }
  if (customApp === undefined) {
    return (
      <div className={css.customEmpty}>
        <span className={css.emptyGlyph} aria-hidden="true">▤</span>
        <span className={css.emptyTitle}>{t('templateCenter.custom.title')}</span>
        <span className={css.emptyHint}>{t('templateCenter.custom.hint')}</span>
        <button type="button" className={css.primaryButton} onClick={onChooseCustomDirectory}>
          {t('templateCenter.custom.choose')}
        </button>
      </div>
    )
  }
  const typeOption = TEMPLATE_APP_TYPE_OPTIONS.find(option => option.id === customApp.appTypeId)
  const typeStatusKey = customApp.typeSource === 'manifest'
    ? 'templateCenter.custom.fromManifest'
    : customApp.typeSource === 'manual'
      ? 'templateCenter.custom.manual'
      : customApp.typeSource === 'detected'
        ? 'templateCenter.custom.detected'
        : 'templateCenter.custom.typeRequired'
  return (
    <div className={css.customPanel}>
      <div className={css.customPathBar}>
        <span className={css.customPath} title={customApp.directory}>{customApp.directory}</span>
        <div className={css.toolbarActions}>
          <button type="button" className={css.ghostButton} onClick={onChooseCustomDirectory}>
            {t('templateCenter.custom.change')}
          </button>
          <button type="button" className={css.ghostButton} onClick={onRescanCustom}>
            {t('templateCenter.custom.redetect')}
          </button>
          <button type="button" className={css.ghostButton} onClick={onClearCustom}>
            {t('templateCenter.custom.clear')}
          </button>
        </div>
      </div>
      <div className={css.customCard}>
        <AppAvatar candidate={customApp} />
        <span className={css.customMain}>
          <span className={css.appNameRow}>
            <span className={css.appName} title={customApp.name}>{customApp.name}</span>
            {typeOption !== undefined
              ? <span className={css.typeBadge}>{t(typeOption.labelKey as DeployKey)}</span>
              : <span className={`${css.typeBadge} ${css.typeBadgeWarn}`}>{t('templateCenter.custom.unknownType')}</span>}
            {customApp.version !== undefined && (
              <span className={css.versionBadge}>
                {t('templateCenter.versionBadge', { version: customApp.version })}
              </span>
            )}
          </span>
          <span className={css.appKey}>{customApp.appKey}</span>
          <span className={css.customMeta}>
            {t('templateCenter.custom.files', { count: String(customInspection?.fileCount ?? 0) })}
            {customInspection !== undefined && customInspection.signals.length > 0 && (
              <span className={css.customSignal}>
                {t('templateCenter.custom.signals', { signals: customInspection.signals.join(' · ') })}
              </span>
            )}
          </span>
        </span>
        <span className={css.customSelected}>
          <CheckIcon />
          {t('templateCenter.custom.selected')}
        </span>
      </div>
      <label className={css.customTypeField}>
        <span className={css.fieldLabel}>{t('templateCenter.custom.type')}</span>
        <select
          className={`${css.input}${customApp.appTypeId === undefined ? ` ${css.inputInvalid}` : ''}`}
          value={customApp.appTypeId ?? ''}
          aria-invalid={customApp.appTypeId === undefined}
          onChange={(event) => { onCustomTypeChange(event.target.value) }}
        >
          <option value="" disabled>{t('templateCenter.custom.typePlaceholder')}</option>
          {TEMPLATE_APP_TYPE_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>{t(option.labelKey as DeployKey)}</option>
          ))}
        </select>
        <span className={customApp.appTypeId === undefined ? css.fieldError : css.fieldHint}>
          {t(typeStatusKey)}
        </span>
      </label>
      {customInspection !== undefined && !customInspection.hasManifest && !customInspection.readFailed && (
        <p className={css.customWarning}>{t('templateCenter.custom.noManifest')}</p>
      )}
      {customInspection?.manifestInvalid === true && (
        <p className={css.customWarning}>{t('templateCenter.custom.manifestInvalid')}</p>
      )}
      {customInspection?.truncated === true && (
        <p className={css.customWarning}>{t('templateCenter.custom.truncated')}</p>
      )}
      {customInspection?.readFailed === true && (
        <p className={css.customWarning}>{t('templateCenter.custom.readFailed')}</p>
      )}
    </div>
  )
}

/** One selectable application card. */
function SelectableAppCard(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly plan: TemplatePublishPlan
  readonly values: TemplateAppValues
  readonly selected: boolean
  readonly onToggle: () => void
}) {
  const { t, plan, values, selected, onToggle } = props
  const candidate = plan.candidate
  const needsLink = plan.platformApp === undefined && platformAppKind(candidate) === undefined
  const blocked = plan.conflict !== undefined || needsLink
  const state = plan.conflict !== undefined
    ? { tone: 'blocked', text: t('templateCenter.app.conflict') }
    : needsLink
      ? { tone: 'blocked', text: t('templateCenter.app.needsLink') }
      : plan.template !== undefined
        ? {
          tone: 'update',
          text: t('templateCenter.app.versionFlow', {
            from: plan.template.latestVersion ?? candidate.linkedTemplateVersion ?? '—',
            to: values.version,
          }),
        }
        : { tone: 'new', text: t('templateCenter.app.newTemplate') }
  return (
    <label
      className={`${css.selectCard}${selected ? ` ${css.selectCardSelected}` : ''}${blocked ? ` ${css.selectCardDisabled}` : ''}`}
      aria-disabled={blocked}
    >
      <input
        type="checkbox"
        className={css.selectInput}
        checked={selected}
        disabled={blocked}
        onChange={onToggle}
        aria-label={candidate.name}
      />
      <span
        className={`${css.selectCheck}${selected ? ` ${css.selectCheckSelected}` : ''}`}
        aria-hidden="true"
      >
        {selected && <CheckIcon size={12} />}
      </span>
      <AppAvatar candidate={candidate} />
      <span className={css.selectMain}>
        <span className={css.appNameRow}>
          <span className={css.appName} title={candidate.name}>{candidate.name}</span>
          <span className={css.typeBadge}>{t(candidateTypeLabelKey(candidate))}</span>
          {candidate.version !== undefined && (
            <span className={css.versionBadge}>
              {t('templateCenter.versionBadge', { version: candidate.version })}
            </span>
          )}
        </span>
        <span className={css.appKey}>{candidate.appKey}</span>
        {candidate.platforms.length > 0 && (
          <span className={css.platformRow}>
            {candidate.platforms.map(platform => (
              <span key={platform} className={css.platformBadge}>{t(platformLabelKey(platform))}</span>
            ))}
          </span>
        )}
        <span className={css.selectMeta}>
          <span className={`${css.selectState}${state.tone === 'blocked' ? ` ${css.selectStateBlocked}` : ''}`}>
            {state.text}
          </span>
          {!needsLink && (
            <span className={css.selectPlatform}>
              {plan.platformApp === undefined
                ? t('templateCenter.app.willRegisterApp')
                : t('templateCenter.app.linkedApp', { name: plan.platformApp.name })}
            </span>
          )}
        </span>
      </span>
    </label>
  )
}

/** Step two: per-app template values and shared settings. */
function ConfigureStep(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly plans: readonly TemplatePublishPlan[]
  readonly activePlan: TemplatePublishPlan
  readonly activeDirectory: string
  readonly valuesOf: (plan: TemplatePublishPlan) => TemplateAppValues
  readonly categories: readonly TemplateCategoryOption[]
  readonly categoryUuid: string
  readonly visibility: 'PRIVATE' | 'PUBLIC'
  readonly submitForReview: boolean
  readonly onSetActive: (directory: string) => void
  readonly onValuesChange: (directory: string, patch: Partial<TemplateAppValues>) => void
  readonly onCategoryChange: (categoryUuid: string) => void
  readonly onVisibilityChange: (visibility: 'PRIVATE' | 'PUBLIC') => void
  readonly onSubmitForReviewChange: (submit: boolean) => void
}) {
  const {
    t, plans, activePlan, activeDirectory, valuesOf, categories, categoryUuid, visibility,
    submitForReview, onSetActive, onValuesChange, onCategoryChange, onVisibilityChange,
    onSubmitForReviewChange,
  } = props
  const values = valuesOf(activePlan)
  const keyInvalid = !TEMPLATE_KEY_PATTERN.test(values.templateKey.trim()) || values.templateKey.trim().length > 64
  const versionInvalid = !TEMPLATE_VERSION_PATTERN.test(values.version.trim())
  const nameInvalid = values.displayName.trim() === ''
  const update = activePlan.template !== undefined
  return (
    <>
      <header className={css.stepHeader}>
        <div className={css.stepHeading}>
          <span className={css.stepEyebrow}>{t('templateCenter.step.eyebrow', { current: '2', total: '3' })}</span>
          <h3 className={css.stepTitle} tabIndex={-1}>{t('templateCenter.configure.title')}</h3>
          <p className={css.stepDescription}>{t('templateCenter.configure.subtitle')}</p>
        </div>
      </header>
      <div className={`${css.formLayout}${plans.length === 1 ? ` ${css.formLayoutSingle}` : ''}`}>
        {plans.length > 1 && (
          <aside className={css.appRail} aria-label={t('templateCenter.configure.appList')}>
            <div className={css.railHeader}>
              <span>{t('templateCenter.configure.appList')}</span>
              <span className={css.railCount}>{plans.length}</span>
            </div>
            <ul className={css.railList}>
              {plans.map((plan) => {
                const active = plan.candidate.directory === activeDirectory
                const incomplete = !valuesAreValid(valuesOf(plan))
                return (
                  <li key={plan.candidate.directory}>
                    <button
                      type="button"
                      className={`${css.railItem}${active ? ` ${css.railItemActive}` : ''}`}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => { onSetActive(plan.candidate.directory) }}
                    >
                      <AppAvatar candidate={plan.candidate} size="small" />
                      <span className={css.railMain}>
                        <span className={css.railName} title={plan.candidate.name}>{plan.candidate.name}</span>
                        <span className={css.railKey}>{plan.candidate.appKey}</span>
                      </span>
                      <span className={`${css.railStatus}${incomplete ? ` ${css.railStatusError}` : ''}`}>
                        {incomplete
                          ? t('templateCenter.field.incomplete')
                          : plan.template === undefined
                            ? t('templateCenter.app.newTemplate')
                            : t('templateCenter.app.updateBadge')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>
        )}
        <div className={css.formColumn}>
          <section className={css.formCard}>
            <header className={css.formAppHeader}>
              <AppAvatar candidate={activePlan.candidate} />
              <div className={css.formAppIdentity}>
                <span className={css.formAppName} title={activePlan.candidate.name}>
                  {activePlan.candidate.name}
                </span>
                <span className={css.formAppKey}>{activePlan.candidate.appKey}</span>
              </div>
              <span className={css.typeBadge}>
                {t(candidateTypeLabelKey(activePlan.candidate))}
              </span>
              <span className={`${css.planChip}${update ? ` ${css.planChipUpdate}` : ''}`}>
                {update ? t('templateCenter.app.updateBadge') : t('templateCenter.app.newTemplate')}
              </span>
            </header>
            <div className={css.formGrid}>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('templateCenter.field.displayName')}</span>
                <input
                  className={`${css.input}${nameInvalid ? ` ${css.inputInvalid}` : ''}`}
                  value={values.displayName}
                  maxLength={200}
                  aria-invalid={nameInvalid}
                  onChange={(event) => { onValuesChange(activeDirectory, { displayName: event.target.value }) }}
                />
                {nameInvalid && <span className={css.fieldError}>{t('templateCenter.field.nameRequired')}</span>}
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('templateCenter.field.templateKey')}</span>
                <input
                  className={`${css.input}${keyInvalid ? ` ${css.inputInvalid}` : ''}`}
                  value={values.templateKey}
                  readOnly={update}
                  maxLength={64}
                  aria-invalid={keyInvalid}
                  onChange={(event) => { onValuesChange(activeDirectory, { templateKey: event.target.value }) }}
                />
                {keyInvalid
                  ? <span className={css.fieldError}>{t('templateCenter.field.keyInvalid')}</span>
                  : update && <span className={css.fieldHint}>{t('templateCenter.field.keyReadonly')}</span>}
              </label>
              <label className={`${css.field} ${css.fieldWide}`}>
                <span className={css.fieldLabel}>{t('templateCenter.field.version')}</span>
                <input
                  className={`${css.input}${versionInvalid ? ` ${css.inputInvalid}` : ''}`}
                  value={values.version}
                  maxLength={64}
                  aria-invalid={versionInvalid}
                  onChange={(event) => { onValuesChange(activeDirectory, { version: event.target.value }) }}
                />
                {versionInvalid
                  ? <span className={css.fieldError}>{t('templateCenter.field.versionInvalid')}</span>
                  : <span className={css.fieldHint}>{t('templateCenter.field.versionHint')}</span>}
              </label>
              <label className={`${css.field} ${css.fieldWide}`}>
                <span className={css.fieldLabel}>{t('templateCenter.field.summary')}</span>
                <textarea
                  className={css.input}
                  rows={2}
                  maxLength={512}
                  value={values.summary}
                  placeholder={t('templateCenter.field.summaryPlaceholder')}
                  onChange={(event) => { onValuesChange(activeDirectory, { summary: event.target.value }) }}
                />
              </label>
              <label className={`${css.field} ${css.fieldWide}`}>
                <span className={css.fieldLabel}>{t('templateCenter.field.changelog')}</span>
                <textarea
                  className={css.input}
                  rows={2}
                  maxLength={512}
                  value={values.changelog}
                  placeholder={t('templateCenter.field.changelogPlaceholder')}
                  onChange={(event) => { onValuesChange(activeDirectory, { changelog: event.target.value }) }}
                />
              </label>
            </div>
          </section>
          <section className={css.formCard}>
            <h4 className={css.formSectionTitle}>{t('templateCenter.settings.title')}</h4>
            <div className={css.settingsGrid}>
              <label className={`${css.field} ${css.fieldWide}`}>
                <span className={css.fieldLabel}>{t('templateCenter.settings.category')}</span>
                {categories.length === 0
                  ? (
                    <span className={css.categoryEmpty} role="alert">
                      <span className={css.categoryEmptyMark} aria-hidden="true">!</span>
                      {t('templateCenter.categoryMissing')}
                    </span>
                  )
                  : (
                    <select
                      className={css.input}
                      value={categoryUuid}
                      onChange={(event) => { onCategoryChange(event.target.value) }}
                    >
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>{category.displayName}</option>
                      ))}
                    </select>
                  )}
              </label>
              <div className={css.field}>
                <span className={css.fieldLabel}>{t('templateCenter.settings.visibility')}</span>
                <div className={css.segmented} role="group" aria-label={t('templateCenter.settings.visibility')}>
                  <button
                    type="button"
                    className={`${css.segment}${visibility === 'PRIVATE' ? ` ${css.segmentActive}` : ''}`}
                    aria-pressed={visibility === 'PRIVATE'}
                    onClick={() => { onVisibilityChange('PRIVATE') }}
                  >
                    {t('templateCenter.settings.private')}
                  </button>
                  <button
                    type="button"
                    className={`${css.segment}${visibility === 'PUBLIC' ? ` ${css.segmentActive}` : ''}`}
                    aria-pressed={visibility === 'PUBLIC'}
                    onClick={() => { onVisibilityChange('PUBLIC') }}
                  >
                    {t('templateCenter.settings.public')}
                  </button>
                </div>
              </div>
              <label className={`${css.checkbox}${visibility !== 'PUBLIC' ? ` ${css.checkboxDisabled}` : ''}`}>
                <input
                  type="checkbox"
                  checked={submitForReview}
                  disabled={visibility !== 'PUBLIC'}
                  onChange={(event) => { onSubmitForReviewChange(event.target.checked) }}
                />
                {t('templateCenter.settings.submit')}
              </label>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

/** Step three: the live ledger and its result summary. */
function ResultStep(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly plans: readonly TemplatePublishPlan[]
  readonly runs: Readonly<Record<string, TemplateRunState>>
  readonly publishing: boolean
  readonly summary: TemplateRunSummary | undefined
  readonly doneCount: number
  readonly failedCount: number
  readonly overallPercent: number
}) {
  const { t, plans, runs, publishing, summary, doneCount, failedCount, overallPercent } = props
  const total = plans.length
  const tone = publishing ? 'running' : failedCount > 0 ? 'warning' : 'success'
  const title = publishing
    ? t('templateCenter.result.publishingTitle')
    : failedCount > 0
      ? t('templateCenter.result.partialTitle')
      : t('templateCenter.result.successTitle')
  const hint = publishing
    ? t('templateCenter.result.publishingHint', { done: String(doneCount), total: String(total) })
    : failedCount > 0
      ? t('templateCenter.result.partialHint', {
        done: String(doneCount),
        failed: String(failedCount),
      })
      : t('templateCenter.result.successHint', {
        created: String(summary?.created ?? 0),
        updated: String(summary?.updated ?? 0),
      })
  return (
    <>
      <header className={`${css.resultHero}${tone === 'warning' ? ` ${css.resultHeroWarning}` : ''}${tone === 'running' ? ` ${css.resultHeroRunning}` : ''}`}>
        <span className={css.resultIcon} aria-hidden="true">
          {publishing
            ? <span className={css.spinner} />
            : failedCount > 0 ? '!' : <CheckIcon size={18} />}
        </span>
        <div className={css.resultHeading}>
          <h3 className={css.resultTitle} tabIndex={-1}>{title}</h3>
          <p className={css.resultHint}>{hint}</p>
        </div>
        <div className={css.resultStats}>
          <span className={css.resultStat}>
            <strong>{doneCount}</strong>
            <span>{t('templateCenter.result.published')}</span>
          </span>
          <span className={css.resultStat}>
            <strong>{failedCount}</strong>
            <span>{t('templateCenter.result.failed')}</span>
          </span>
          <span className={css.resultStat}>
            <strong>{total}</strong>
            <span>{t('templateCenter.result.total')}</span>
          </span>
        </div>
      </header>
      {publishing && (
        <div className={css.overallProgress}>
          <span className={css.progressTrack} aria-hidden="true">
            <span className={css.progressFill} style={{ width: `${Math.max(2, overallPercent)}%` }} />
          </span>
          <span className={css.overallPercent}>{overallPercent}%</span>
        </div>
      )}
      <ul className={css.resultList} aria-live="polite">
        {plans.map((plan) => {
          const run = runs[plan.candidate.directory] as TemplateRunState | undefined
          const phase = run?.phase ?? 'pending'
          return (
            <li key={plan.candidate.directory} className={`${css.resultRow}${phase === 'failed' ? ` ${css.resultRowFailed}` : ''}`}>
              <AppAvatar candidate={plan.candidate} />
              <div className={css.resultMain}>
                <span className={css.resultIdentity}>
                  <span className={css.appName} title={plan.candidate.name}>{plan.candidate.name}</span>
                  <span className={css.appKey}>{plan.candidate.appKey}</span>
                </span>
                <span className={`${css.resultDetail}${phase === 'failed' ? ` ${css.resultDetailError}` : ''}`}>
                  {run?.detail ?? t('templateCenter.result.status.pending')}
                </span>
                {phase === 'running' && run?.percent !== undefined && (
                  <span className={css.progressTrack} aria-hidden="true">
                    <span className={css.progressFill} style={{ width: `${Math.max(2, Math.min(100, run.percent))}%` }} />
                  </span>
                )}
                {run?.warnings !== undefined && run.warnings.length > 0 && (
                  <ul className={css.resultWarnings}>
                    {run.warnings.map(warning => <li key={warning}>{warning}</li>)}
                  </ul>
                )}
              </div>
              <span className={`${css.resultBadge} ${resultBadgeClass(phase)}`}>
                {t(resultStatusKey(phase))}
              </span>
            </li>
          )
        })}
      </ul>
      {!publishing && summary !== undefined && (
        <p className={css.resultBatch}>
          {t('templateCenter.result.batch', {
            created: String(summary.created),
            updated: String(summary.updated),
          })}
        </p>
      )}
    </>
  )
}

/** One loading skeleton card. */
function SkeletonGrid() {
  return (
    <ul className={css.appGrid} aria-hidden="true">
      {[0, 1, 2, 3].map(index => (
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

/** Avatar image or the name's initial. */
function AppAvatar({ candidate, size = 'normal' }: {
  readonly candidate: TemplateAppCandidate
  readonly size?: 'normal' | 'small'
}) {
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => { setImageFailed(false) }, [candidate.iconUrl])
  const showImage = candidate.iconUrl !== undefined && !imageFailed
  return (
    <span className={`${css.avatar}${size === 'small' ? ` ${css.avatarSmall}` : ''}`}>
      {showImage
        ? (
          <img
            className={css.avatarImage}
            src={candidate.iconUrl}
            alt=""
            onError={() => { setImageFailed(true) }}
          />
        )
        : <span className={css.avatarFallback}>{candidate.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}

/** The ignored-directory footnote. */
function IgnoredLine(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly ignored: readonly IgnoredTemplateDirectory[]
}) {
  const names = props.ignored.map(entry => entry.directoryName).join('、')
  return (
    <p className={css.ignoredLine} title={names}>
      {props.t('templateCenter.ignored', { count: String(props.ignored.length) })}
    </p>
  )
}

/** In-place failure notice with a retry action. */
function Notice(props: {
  readonly text: string
  readonly retryLabel: string
  readonly onRetry: () => void
}) {
  return (
    <div className={css.notice} role="alert">
      <span>{props.text}</span>
      <button type="button" className={css.ghostButton} onClick={props.onRetry}>{props.retryLabel}</button>
    </div>
  )
}

/** Prefer the custom-flow type id, then the console card/platform fallback. */
function candidateTypeLabelKey(candidate: TemplateAppCandidate): DeployKey {
  const option = candidate.source === 'custom' ? templateAppTypeOption(candidate.appTypeId) : undefined
  if (option !== undefined) return option.labelKey as DeployKey
  return typeLabelKey(candidate.cardId, candidate.platforms.length)
}

/** Console type card → the existing app-library type label. */
function typeLabelKey(cardId: string | undefined, platformCount = 0): DeployKey {
  if (cardId === undefined && platformCount > 0) return 'library.type.multiPlatform'
  switch (cardId) {
    case 'h5': return 'library.type.h5'
    case 'pc-web': return 'library.type.pcWeb'
    case 'desktop': return 'library.type.desktop'
    case 'mini-program': return 'library.type.miniProgram'
    case 'android': return 'library.type.android'
    case 'ios': return 'library.type.ios'
    case 'harmonyos': return 'library.type.harmonyos'
    case 'api-service': return 'library.type.apiService'
    case 'static-web': return 'library.type.staticWeb'
    default: return 'library.type.unknown'
  }
}

/** Template platform id → the existing platform label. */
function platformLabelKey(platform: string): DeployKey {
  switch (platform) {
    case 'H5': return 'template.platform.h5'
    case 'PC': return 'template.platform.pc'
    case 'FLUTTER': return 'template.platform.flutter'
    case 'MINIPROGRAM': return 'template.platform.miniprogram'
    case 'DESKTOP': return 'template.platform.desktop'
    case 'ANDROID': return 'template.platform.android'
    case 'IOS': return 'template.platform.ios'
    case 'HARMONY': return 'template.platform.harmony'
    case 'STATIC_WEB': return 'template.platform.staticWeb'
    default: return 'template.platform.staticWeb'
  }
}

/** The project-relative display form of the apps directory. */
function relativeApps(directory: string): string {
  const trimmed = directory.replace(/[/\\]+$/u, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return `${cut === -1 ? trimmed : trimmed.slice(cut + 1)}/apps`
}

/** Whether one app's editable values pass the pre-publish checks. */
function valuesAreValid(values: TemplateAppValues): boolean {
  return TEMPLATE_KEY_PATTERN.test(values.templateKey.trim())
    && values.templateKey.trim().length <= 64
    && TEMPLATE_VERSION_PATTERN.test(values.version.trim())
    && values.displayName.trim() !== ''
}

/** Result badge tone class. */
function resultBadgeClass(phase: 'pending' | 'running' | 'done' | 'failed'): string {
  if (phase === 'done') return css.resultBadgeDone
  if (phase === 'failed') return css.resultBadgeFailed
  if (phase === 'running') return css.resultBadgeRunning
  return css.resultBadgePending
}

/** Result badge copy. */
function resultStatusKey(phase: 'pending' | 'running' | 'done' | 'failed'): DeployKey {
  switch (phase) {
    case 'done': return 'templateCenter.result.status.done'
    case 'failed': return 'templateCenter.result.status.failed'
    case 'running': return 'templateCenter.result.status.running'
    default: return 'templateCenter.result.status.pending'
  }
}

/** Check mark for selected cards and completed stages. */
function CheckIcon({ size = 10 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.4 6.2 4.7 8.5 9.6 3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Chevron for the footer actions. */
function ChevronIcon({ direction = 'right' }: { readonly direction?: 'left' | 'right' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6l-3.5 3.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
