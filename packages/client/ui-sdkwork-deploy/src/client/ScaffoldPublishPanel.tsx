/**
 * Publish wizard for one scaffold.
 *
 * One application is selected at a time. Step one chooses a project app root
 * or one custom directory; steps two through four edit that app's store assets
 * (logo, cover, ordered sample pages), basic listing copy and the version/
 * publish settings, then show the single publish run inline. No multi-select,
 * batch rail, or per-row ledger survives from the batch flow.
 */
import { useEffect, useRef, useState } from 'react'
import {
  mediaSpecForAppKind,
  validateCover,
  validateIcon,
  validatePreviewSize,
  type CoverSpec,
  type DeployAppKind,
  type IconSpec,
  type PreviewSizeTarget,
} from '@sdkwork/deployments-pc-console-publishing'
import type { DeployKey } from './locales.ts'
import type {
  ScaffoldAppCandidate,
  ScaffoldAppScan,
  IgnoredScaffoldDirectory,
} from './scaffoldApps.ts'
import type { CustomScaffoldAppInspection } from './scaffoldCustomApp.ts'
import { SCAFFOLD_APP_TYPE_OPTIONS, scaffoldAppTypeOption } from './scaffoldAppTypes.ts'
import {
  platformAppKind,
  type ScaffoldAppValues,
  type ScaffoldMediaDraft,
  type ScaffoldPublishPlan,
  type ScaffoldScreenshotValue,
} from './scaffoldPublish.ts'
import css from './ScaffoldDialog.module.css'

/** Scaffold identifiers double as installed app directory names. */
const SCAFFOLD_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
/** The bump helper and the backend expect three numeric components. */
const SCAFFOLD_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u

/** One selected row's live publish state. */
export interface ScaffoldRunState {
  readonly phase: 'running' | 'done' | 'failed'
  readonly detail: string
  readonly percent?: number
  readonly warnings?: readonly string[]
}

/** One scaffold category offered by the server. */
export interface ScaffoldCategoryOption {
  readonly id: string
  readonly displayName: string
}

/** Publish-run totals shown after the single run finishes. */
export interface ScaffoldRunSummary {
  readonly created: number
  readonly updated: number
  readonly failed: number
}

/** The four focused publish stages. */
export type ScaffoldPublishStep = 1 | 2 | 3 | 4

/** Props for the publish wizard. */
export interface ScaffoldPublishPanelProps {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly directory?: string | undefined
  readonly scan: ScaffoldAppScan | undefined
  readonly scanError: string | undefined
  readonly loading: boolean
  /** Candidates for the active source (project apps or the custom directory). */
  readonly plans: readonly ScaffoldPublishPlan[]
  readonly projectCount: number
  readonly selectedDirectory: string | undefined
  readonly sourceMode: 'apps' | 'custom'
  readonly customApp: ScaffoldAppCandidate | undefined
  readonly customInspection: CustomScaffoldAppInspection | undefined
  readonly customLoading: boolean
  readonly customError: string | undefined
  readonly categories: readonly ScaffoldCategoryOption[]
  readonly categoryUuid: string
  readonly visibility: 'PRIVATE' | 'PUBLIC'
  readonly submitForReview: boolean
  readonly step: ScaffoldPublishStep
  readonly runs: Readonly<Record<string, ScaffoldRunState | undefined>>
  readonly publishing: boolean
  readonly summary: ScaffoldRunSummary | undefined
  readonly valuesOf: (plan: ScaffoldPublishPlan) => ScaffoldAppValues
  readonly mediaOf: (plan: ScaffoldPublishPlan) => ScaffoldMediaDraft | undefined
  readonly onMediaChange: (directory: string, draft: ScaffoldMediaDraft) => void
  readonly onStepChange: (step: ScaffoldPublishStep) => void
  readonly onSourceModeChange: (mode: 'apps' | 'custom') => void
  readonly onChooseCustomDirectory: () => void
  readonly onRescanCustom: () => void
  readonly onClearCustom: () => void
  readonly onCustomTypeChange: (typeId: string) => void
  readonly onSelect: (directory: string) => void
  readonly onValuesChange: (directory: string, patch: Partial<ScaffoldAppValues>) => void
  readonly onCategoryChange: (categoryUuid: string) => void
  readonly onVisibilityChange: (visibility: 'PRIVATE' | 'PUBLIC') => void
  readonly onSubmitForReviewChange: (submit: boolean) => void
  readonly onRescan: () => void
  readonly onPublish: () => void
  readonly onReset: () => void
  readonly onClose: () => void
}

/**
 * Render the publish wizard.
 * @param props - the scan, selected plan, settings, live run, and actions.
 * @returns the four-step single-app publish surface.
 */
export function ScaffoldPublishPanel(props: ScaffoldPublishPanelProps) {
  const {
    t, directory, scan, scanError, loading, plans, projectCount, selectedDirectory,
    sourceMode, customApp, customInspection, customLoading, customError, categories,
    categoryUuid, visibility, submitForReview, step, runs, publishing, summary, valuesOf,
    mediaOf, onMediaChange,
    onStepChange, onSourceModeChange, onChooseCustomDirectory, onRescanCustom,
    onClearCustom, onCustomTypeChange, onSelect, onValuesChange, onCategoryChange,
    onVisibilityChange, onSubmitForReviewChange, onRescan, onPublish, onReset, onClose,
  } = props
  const wizardRef = useRef<HTMLDivElement>(null)
  const lastStep = useRef(step)
  const selectedPlan = plans.find(plan => plan.candidate.directory === selectedDirectory)
  const blocking = selectedPlan !== undefined && (selectedPlan.conflict !== undefined
    || selectedPlan.platformApp === undefined
      && platformAppKind(selectedPlan.candidate) === undefined)
  const invalidValues = selectedPlan !== undefined && !valuesAreValid(valuesOf(selectedPlan))
  const typeReady = selectedPlan !== undefined && (sourceMode === 'custom'
    ? selectedPlan.candidate.appTypeId !== undefined
    : selectedPlan.platformApp !== undefined
      || platformAppKind(selectedPlan.candidate) !== undefined)
  const selectionBlocker = selectedPlan !== undefined && !typeReady
    ? t(sourceMode === 'custom'
      ? 'scaffoldCenter.custom.typeRequired'
      : 'scaffoldCenter.blocker.selection')
    : undefined
  const publishBlocker = categories.length === 0
    ? t('scaffoldCenter.blocker.category')
    : blocking
      ? t('scaffoldCenter.blocker.selection')
      : invalidValues ? t('scaffoldCenter.blocker.values') : undefined
  const canPublish = selectedPlan !== undefined && typeReady && !blocking
    && !invalidValues && categoryUuid !== '' && !publishing
  const basicFieldsInvalid = selectedPlan !== undefined && (() => {
    const values = valuesOf(selectedPlan)
    return values.displayName.trim() === ''
      || !SCAFFOLD_KEY_PATTERN.test(values.templateKey.trim())
      || values.templateKey.trim().length > 64
  })()
  const run = selectedPlan === undefined ? undefined : runs[selectedPlan.candidate.directory]
  const showingOutcome = step === 4 && (run !== undefined || summary !== undefined)

  useEffect(() => {
    if (lastStep.current === step) return
    lastStep.current = step
    wizardRef.current?.querySelector<HTMLElement>('h3')?.focus()
  }, [step])

  return (
    <div className={css.wizard} ref={wizardRef}>
      <PublishStepper
        t={t}
        step={step}
        hasSelection={selectedPlan !== undefined}
        publishing={publishing}
        onStepChange={onStepChange}
      />
      <div className={css.stepBody}>
        <div className={css.stepContent} key={`${step}:${showingOutcome ? 'outcome' : 'form'}`}>
          {step === 1 && (
            <SelectStep
              t={t}
              directory={directory}
              scan={scan}
              scanError={scanError}
              loading={loading}
              plans={plans}
              projectCount={projectCount}
              selectedDirectory={selectedDirectory}
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
              onSelect={onSelect}
              onRescan={onRescan}
            />
          )}
          {step >= 2 && !showingOutcome && selectedPlan !== undefined && (
            <ConfigureStep
              t={t}
              step={step}
              plan={selectedPlan}
              values={valuesOf(selectedPlan)}
              media={mediaOf(selectedPlan)}
              categories={categories}
              categoryUuid={categoryUuid}
              visibility={visibility}
              submitForReview={submitForReview}
              onValuesChange={(patch) => { onValuesChange(selectedPlan.candidate.directory, patch) }}
              onMediaChange={(draft) => { onMediaChange(selectedPlan.candidate.directory, draft) }}
              onCategoryChange={onCategoryChange}
              onVisibilityChange={onVisibilityChange}
              onSubmitForReviewChange={onSubmitForReviewChange}
            />
          )}
          {step === 4 && showingOutcome && selectedPlan !== undefined && (
            <PublishOutcome
              t={t}
              plan={selectedPlan}
              run={run}
              publishing={publishing}
              summary={summary}
            />
          )}
        </div>
      </div>
      {step === 1 && (
        <footer className={css.wizardFooter}>
          <div className={css.footerSummary}>
            {selectedPlan === undefined
              ? <span className={css.footerCount}>{t('scaffoldCenter.select.none')}</span>
              : (
                <>
                  <span className={css.footerCount}>
                    {t('scaffoldCenter.select.selectedApp', { name: selectedPlan.candidate.name })}
                  </span>
                  <span className={css.footerMeta}>{planStateLabel(t, selectedPlan)}</span>
                </>
              )}
            {selectionBlocker !== undefined && (
              <span className={css.footerWarning} role="alert">{selectionBlocker}</span>
            )}
          </div>
          <div className={css.footerActions}>
            <button
              type="button"
              className={css.primaryButton}
              disabled={!typeReady || publishing}
              onClick={() => { onStepChange(2) }}
            >
              {t('scaffoldCenter.select.next')}
              <ChevronIcon />
            </button>
          </div>
        </footer>
      )}
      {step === 2 && (
        <footer className={css.wizardFooter}>
          <div className={css.footerSummary}>
            <span className={css.footerCount}>
              {t('scaffoldCenter.select.selectedApp', { name: selectedPlan?.candidate.name ?? '' })}
            </span>
            <span className={css.footerMeta}>
              {t('scaffoldCenter.step.eyebrow', { current: '2', total: '4' })}
            </span>
          </div>
          <div className={css.footerActions}>
            <button type="button" className={css.secondaryButton} onClick={() => { onStepChange(1) }}>
              <ChevronIcon direction="left" />
              {t('scaffoldCenter.configure.back')}
            </button>
            <button type="button" className={css.primaryButton} onClick={() => { onStepChange(3) }}>
              {t('scaffoldCenter.assets.next')}
              <ChevronIcon />
            </button>
          </div>
        </footer>
      )}
      {step === 3 && (
        <footer className={css.wizardFooter}>
          <div className={css.footerSummary}>
            <span className={css.footerCount}>
              {t('scaffoldCenter.select.selectedApp', { name: selectedPlan?.candidate.name ?? '' })}
            </span>
            <span className={css.footerMeta}>
              {t('scaffoldCenter.step.eyebrow', { current: '3', total: '4' })}
            </span>
          </div>
          <div className={css.footerActions}>
            <button type="button" className={css.secondaryButton} onClick={() => { onStepChange(2) }}>
              <ChevronIcon direction="left" />
              {t('scaffoldCenter.configure.back')}
            </button>
            <button
              type="button"
              className={css.primaryButton}
              disabled={basicFieldsInvalid}
              onClick={() => { onStepChange(4) }}
            >
              {t('scaffoldCenter.basic.next')}
              <ChevronIcon />
            </button>
          </div>
        </footer>
      )}
      {step === 4 && (
        <footer className={css.wizardFooter}>
          <div className={css.footerSummary}>
            {publishing && <span className={css.footerMeta}>{t('scaffoldCenter.result.keepOpen')}</span>}
            {!publishing && summary !== undefined && run?.phase === 'failed' && (
              <span className={css.footerWarning} role="alert">{t('scaffoldCenter.result.failedHint')}</span>
            )}
            {!publishing && summary !== undefined && run?.phase !== 'failed' && (
              <span className={css.footerMeta}>{t('scaffoldCenter.result.doneHint')}</span>
            )}
            {!publishing && summary === undefined && publishBlocker !== undefined && (
              <span className={css.footerWarning} role="alert">{publishBlocker}</span>
            )}
          </div>
          <div className={css.footerActions}>
            {publishing
              ? (
                <button type="button" className={css.primaryButton} disabled>
                  <span className={css.spinner} aria-hidden="true" />
                  {t('scaffoldCenter.result.publishingAction')}
                </button>
              )
              : summary !== undefined
                ? run?.phase === 'failed'
                  ? (
                    <>
                      <button type="button" className={css.secondaryButton} onClick={onReset}>
                        {t('scaffoldCenter.result.backToSelection')}
                      </button>
                      <button type="button" className={css.primaryButton} onClick={onPublish}>
                        {t('scaffoldCenter.result.retryOne')}
                      </button>
                    </>
                  )
                  : (
                    <>
                      <button type="button" className={css.secondaryButton} onClick={onReset}>
                        {t('scaffoldCenter.result.again')}
                      </button>
                      <button type="button" className={css.primaryButton} onClick={onClose}>
                        {t('scaffoldCenter.result.done')}
                      </button>
                    </>
                  )
                : (
                  <>
                    <button type="button" className={css.secondaryButton} onClick={() => { onStepChange(3) }}>
                      <ChevronIcon direction="left" />
                      {t('scaffoldCenter.configure.back')}
                    </button>
                    <button type="button" className={css.primaryButton} disabled={!canPublish} onClick={onPublish}>
                      {t('scaffoldCenter.publishSingle')}
                    </button>
                  </>
                )}
          </div>
        </footer>
      )}
    </div>
  )
}

/** The four-step progress indicator. */
function PublishStepper(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly step: ScaffoldPublishStep
  readonly hasSelection: boolean
  readonly publishing: boolean
  readonly onStepChange: (step: ScaffoldPublishStep) => void
}) {
  const { t, step, hasSelection, publishing, onStepChange } = props
  const steps: readonly {
    readonly id: ScaffoldPublishStep
    readonly label: DeployKey
    readonly hint: DeployKey
  }[] = [
    { id: 1, label: 'scaffoldCenter.step.select', hint: 'scaffoldCenter.step.selectHint' },
    { id: 2, label: 'scaffoldCenter.step.assets', hint: 'scaffoldCenter.step.assetsHint' },
    { id: 3, label: 'scaffoldCenter.step.basic', hint: 'scaffoldCenter.step.basicHint' },
    { id: 4, label: 'scaffoldCenter.step.publish', hint: 'scaffoldCenter.step.publishHint' },
  ]
  return (
    <ol className={css.stepper} aria-label={t('scaffoldCenter.step.label')}>
      {steps.map((entry) => {
        const state = entry.id < step ? 'done' : entry.id === step ? 'active' : 'upcoming'
        const canGoBack = entry.id < step && !publishing && hasSelection
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
                <span className={css.stepHint}>{t(entry.hint)}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Step one: choose one app root or one custom directory. */
function SelectStep(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly directory?: string | undefined
  readonly scan: ScaffoldAppScan | undefined
  readonly scanError: string | undefined
  readonly loading: boolean
  readonly plans: readonly ScaffoldPublishPlan[]
  readonly projectCount: number
  readonly selectedDirectory: string | undefined
  readonly sourceMode: 'apps' | 'custom'
  readonly customApp: ScaffoldAppCandidate | undefined
  readonly customInspection: CustomScaffoldAppInspection | undefined
  readonly customLoading: boolean
  readonly customError: string | undefined
  readonly categoryReady: boolean
  readonly valuesOf: (plan: ScaffoldPublishPlan) => ScaffoldAppValues
  readonly onSourceModeChange: (mode: 'apps' | 'custom') => void
  readonly onChooseCustomDirectory: () => void
  readonly onRescanCustom: () => void
  readonly onClearCustom: () => void
  readonly onCustomTypeChange: (typeId: string) => void
  readonly onSelect: (directory: string) => void
  readonly onRescan: () => void
}) {
  const {
    t, directory, scan, scanError, loading, plans, projectCount, selectedDirectory,
    sourceMode, customApp, customInspection, customLoading, customError, categoryReady,
    valuesOf, onSourceModeChange, onChooseCustomDirectory, onRescanCustom, onClearCustom,
    onCustomTypeChange, onSelect, onRescan,
  } = props
  return (
    <>
      <header className={css.stepHeader}>
        <div className={css.stepHeading}>
          <span className={css.stepEyebrow}>{t('scaffoldCenter.step.eyebrow', { current: '1', total: '4' })}</span>
          <h3 className={css.stepTitle} tabIndex={-1}>{t('scaffoldCenter.select.title')}</h3>
          <p className={css.stepDescription}>{t('scaffoldCenter.select.subtitle')}</p>
        </div>
        <span className={css.stepBadge}>
          {sourceMode === 'custom'
            ? t('scaffoldCenter.select.customBadge')
            : t('scaffoldCenter.select.count', { count: String(plans.length) })}
        </span>
      </header>
      <div className={css.sourceTabs} role="group" aria-label={t('scaffoldCenter.source.label')}>
        <button
          type="button"
          className={`${css.sourceTab}${sourceMode === 'apps' ? ` ${css.sourceTabActive}` : ''}`}
          aria-pressed={sourceMode === 'apps'}
          onClick={() => { onSourceModeChange('apps') }}
        >
          {t('scaffoldCenter.source.apps')}
          <span className={css.sourceCount}>{projectCount}</span>
        </button>
        <button
          type="button"
          className={`${css.sourceTab}${sourceMode === 'custom' ? ` ${css.sourceTabActive}` : ''}`}
          aria-pressed={sourceMode === 'custom'}
          onClick={() => { onSourceModeChange('custom') }}
        >
          {t('scaffoldCenter.source.custom')}
          {customApp !== undefined && <CheckIcon />}
        </button>
      </div>
      {!categoryReady && !loading && (
        <p className={css.stepWarning} role="alert">
          <span className={css.stepWarningMark} aria-hidden="true">!</span>
          {t('scaffoldCenter.select.categoryWarning')}
        </p>
      )}
      {sourceMode === 'apps' && (
        <>
          <div className={css.selectionToolbar}>
            <span className={css.appsPath} title={directory ?? scan?.appsDirectory}>
              {directory === undefined
                ? t('scaffoldCenter.noDirectory')
                : t('scaffoldCenter.appsPath', { path: relativeApps(directory) })}
            </span>
            <div className={css.toolbarActions}>
              <button type="button" className={css.ghostButton} onClick={onRescan} disabled={loading}>
                {loading ? t('scaffoldCenter.scanning') : t('scaffoldCenter.rescan')}
              </button>
            </div>
          </div>
          {loading && <SkeletonGrid />}
          {!loading && scanError !== undefined && (
            <Notice text={scanError} retryLabel={t('scaffoldCenter.retry')} onRetry={onRescan} />
          )}
          {!loading && scanError === undefined && plans.length === 0 && (
            <div className={css.emptyState}>
              <span className={css.emptyGlyph} aria-hidden="true">▤</span>
              <span className={css.emptyTitle}>{t('scaffoldCenter.noApps.title')}</span>
              <span className={css.emptyHint}>{t('scaffoldCenter.noApps.hint')}</span>
            </div>
          )}
          {!loading && scanError === undefined && plans.length > 0 && (
            <ul className={css.appGrid} role="radiogroup" aria-label={t('scaffoldCenter.select.title')}>
              {plans.map(plan => (
                <li key={plan.candidate.directory}>
                  <SelectableAppCard
                    t={t}
                    plan={plan}
                    values={valuesOf(plan)}
                    selected={selectedDirectory === plan.candidate.directory}
                    onSelect={() => { onSelect(plan.candidate.directory) }}
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

/** One single-select application card. */
function SelectableAppCard(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly plan: ScaffoldPublishPlan
  readonly values: ScaffoldAppValues
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  const { t, plan, values, selected, onSelect } = props
  const candidate = plan.candidate
  const needsLink = plan.platformApp === undefined && platformAppKind(candidate) === undefined
  const blocked = plan.conflict !== undefined || needsLink
  const state = plan.conflict !== undefined
    ? { tone: 'blocked', text: t('scaffoldCenter.app.conflict') }
    : needsLink
      ? { tone: 'blocked', text: t('scaffoldCenter.app.needsLink') }
      : plan.scaffold !== undefined
        ? {
          tone: 'update',
          text: t('scaffoldCenter.app.versionFlow', {
            from: plan.scaffold.latestVersion ?? candidate.linkedTemplateVersion ?? '—',
            to: values.version,
          }),
        }
        : { tone: 'new', text: t('scaffoldCenter.app.newScaffold') }
  return (
    <label
      className={`${css.selectCard}${selected ? ` ${css.selectCardSelected}` : ''}${blocked ? ` ${css.selectCardDisabled}` : ''}`}
      aria-disabled={blocked}
    >
      <input
        type="radio"
        name="scaffold-publish-app"
        className={css.selectInput}
        checked={selected}
        disabled={blocked}
        onChange={onSelect}
        aria-label={candidate.name}
      />
      <span className={`${css.selectCheck}${selected ? ` ${css.selectCheckSelected}` : ''}`} aria-hidden="true">
        {selected && <CheckIcon size={12} />}
      </span>
      <AppAvatar candidate={candidate} />
      <span className={css.selectMain}>
        <span className={css.appNameRow}>
          <span className={css.appName} title={candidate.name}>{candidate.name}</span>
          <span className={css.typeBadge}>{t(candidateTypeLabelKey(candidate))}</span>
          {candidate.version !== undefined && (
            <span className={css.versionBadge}>
              {t('scaffoldCenter.versionBadge', { version: candidate.version })}
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
                ? t('scaffoldCenter.app.willRegisterApp')
                : t('scaffoldCenter.app.linkedApp', { name: plan.platformApp.name })}
            </span>
          )}
        </span>
      </span>
    </label>
  )
}

/** The custom-directory picker, detection summary, and manual type override. */
function CustomSourcePanel(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly customApp: ScaffoldAppCandidate | undefined
  readonly customInspection: CustomScaffoldAppInspection | undefined
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
        <span className={css.emptyTitle}>{t('scaffoldCenter.custom.detecting')}</span>
        <span className={css.emptyHint}>{t('scaffoldCenter.custom.detectingHint')}</span>
      </div>
    )
  }
  if (customError !== undefined) {
    return (
      <div className={css.customEmpty} role="alert">
        <span className={css.emptyGlyph} aria-hidden="true">!</span>
        <span className={css.emptyTitle}>{t('scaffoldCenter.custom.errorTitle')}</span>
        <span className={css.emptyHint}>{customError}</span>
        <button type="button" className={css.primaryButton} onClick={onChooseCustomDirectory}>
          {t('scaffoldCenter.custom.chooseAgain')}
        </button>
      </div>
    )
  }
  if (customApp === undefined) {
    return (
      <div className={css.customEmpty}>
        <span className={css.emptyGlyph} aria-hidden="true">▤</span>
        <span className={css.emptyTitle}>{t('scaffoldCenter.custom.title')}</span>
        <span className={css.emptyHint}>{t('scaffoldCenter.custom.hint')}</span>
        <button type="button" className={css.primaryButton} onClick={onChooseCustomDirectory}>
          {t('scaffoldCenter.custom.choose')}
        </button>
      </div>
    )
  }
  const typeOption = SCAFFOLD_APP_TYPE_OPTIONS.find(option => option.id === customApp.appTypeId)
  const typeStatusKey = customApp.typeSource === 'manifest'
    ? 'scaffoldCenter.custom.fromManifest'
    : customApp.typeSource === 'manual'
      ? 'scaffoldCenter.custom.manual'
      : customApp.typeSource === 'detected'
        ? 'scaffoldCenter.custom.detected'
        : 'scaffoldCenter.custom.typeRequired'
  return (
    <div className={css.customPanel}>
      <div className={css.customPathBar}>
        <span className={css.customPath} title={customApp.directory}>{customApp.directory}</span>
        <div className={css.toolbarActions}>
          <button type="button" className={css.ghostButton} onClick={onChooseCustomDirectory}>
            {t('scaffoldCenter.custom.change')}
          </button>
          <button type="button" className={css.ghostButton} onClick={onRescanCustom}>
            {t('scaffoldCenter.custom.redetect')}
          </button>
          <button type="button" className={css.ghostButton} onClick={onClearCustom}>
            {t('scaffoldCenter.custom.clear')}
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
              : <span className={`${css.typeBadge} ${css.typeBadgeWarn}`}>{t('scaffoldCenter.custom.unknownType')}</span>}
            {customApp.version !== undefined && (
              <span className={css.versionBadge}>
                {t('scaffoldCenter.versionBadge', { version: customApp.version })}
              </span>
            )}
          </span>
          <span className={css.appKey}>{customApp.appKey}</span>
          <span className={css.customMeta}>
            {t('scaffoldCenter.custom.files', { count: String(customInspection?.fileCount ?? 0) })}
            {customInspection !== undefined && customInspection.signals.length > 0 && (
              <span className={css.customSignal}>
                {t('scaffoldCenter.custom.signals', { signals: customInspection.signals.join(' · ') })}
              </span>
            )}
          </span>
        </span>
        <span className={css.customSelected}>
          <CheckIcon />
          {t('scaffoldCenter.custom.selected')}
        </span>
      </div>
      <label className={css.customTypeField}>
        <span className={css.fieldLabel}>{t('scaffoldCenter.custom.type')}</span>
        <select
          className={`${css.input}${customApp.appTypeId === undefined ? ` ${css.inputInvalid}` : ''}`}
          value={customApp.appTypeId ?? ''}
          aria-invalid={customApp.appTypeId === undefined}
          onChange={(event) => { onCustomTypeChange(event.target.value) }}
        >
          <option value="" disabled>{t('scaffoldCenter.custom.typePlaceholder')}</option>
          {SCAFFOLD_APP_TYPE_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>{t(option.labelKey as DeployKey)}</option>
          ))}
        </select>
        <span className={customApp.appTypeId === undefined ? css.fieldError : css.fieldHint}>
          {t(typeStatusKey)}
        </span>
      </label>
      {customInspection !== undefined && !customInspection.hasManifest && !customInspection.readFailed && (
        <p className={css.customWarning}>{t('scaffoldCenter.custom.noManifest')}</p>
      )}
      {customInspection?.manifestInvalid === true && (
        <p className={css.customWarning}>{t('scaffoldCenter.custom.manifestInvalid')}</p>
      )}
      {customInspection?.truncated === true && (
        <p className={css.customWarning}>{t('scaffoldCenter.custom.truncated')}</p>
      )}
      {customInspection?.readFailed === true && (
        <p className={css.customWarning}>{t('scaffoldCenter.custom.readFailed')}</p>
      )}
    </div>
  )
}

/** Step two: the single app's scaffold information and shared settings. */
function ConfigureStep(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly step: 2 | 3 | 4
  readonly plan: ScaffoldPublishPlan
  readonly values: ScaffoldAppValues
  readonly media: ScaffoldMediaDraft | undefined
  readonly categories: readonly ScaffoldCategoryOption[]
  readonly categoryUuid: string
  readonly visibility: 'PRIVATE' | 'PUBLIC'
  readonly submitForReview: boolean
  readonly onValuesChange: (patch: Partial<ScaffoldAppValues>) => void
  readonly onMediaChange: (draft: ScaffoldMediaDraft) => void
  readonly onCategoryChange: (categoryUuid: string) => void
  readonly onVisibilityChange: (visibility: 'PRIVATE' | 'PUBLIC') => void
  readonly onSubmitForReviewChange: (submit: boolean) => void
}) {
  const {
    t, step, plan, values, media, categories, categoryUuid, visibility, submitForReview,
    onValuesChange, onMediaChange, onCategoryChange, onVisibilityChange, onSubmitForReviewChange,
  } = props
  const keyInvalid = !SCAFFOLD_KEY_PATTERN.test(values.templateKey.trim())
    || values.templateKey.trim().length > 64
  const versionInvalid = !SCAFFOLD_VERSION_PATTERN.test(values.version.trim())
  const nameInvalid = values.displayName.trim() === ''
  const update = plan.scaffold !== undefined
  const heading = step === 2
    ? { title: 'scaffoldCenter.media.title', description: 'scaffoldCenter.media.hint' }
    : step === 3
      ? { title: 'scaffoldCenter.basic.title', description: 'scaffoldCenter.basic.hint' }
      : { title: 'scaffoldCenter.publishStep.title', description: 'scaffoldCenter.publishStep.hint' }
  return (
    <div className={css.stepStage}>
      <header className={css.stepHeader}>
        <div className={css.stepHeading}>
          <span className={css.stepEyebrow}>{t('scaffoldCenter.step.eyebrow', {
            current: String(step),
            total: '4',
          })}</span>
          <h3 className={css.stepTitle} tabIndex={-1}>{t(heading.title)}</h3>
          <p className={css.stepDescription}>{t(heading.description)}</p>
        </div>
      </header>
      <div className={css.contextBar}>
        <AppAvatar candidate={plan.candidate} />
        <div className={css.contextIdentity}>
          <span className={css.contextName} title={plan.candidate.name}>{plan.candidate.name}</span>
          <span className={css.contextKey}>{plan.candidate.appKey}</span>
        </div>
        <div className={css.contextBadges}>
          <span className={css.typeBadge}>{t(candidateTypeLabelKey(plan.candidate))}</span>
          <span className={`${css.planChip}${update ? ` ${css.planChipUpdate}` : ''}`}>
            {update ? t('scaffoldCenter.app.updateBadge') : t('scaffoldCenter.app.newScaffold')}
          </span>
        </div>
        <span className={css.contextMeta} title={plan.candidate.directory}>
          {plan.platformApp === undefined
            ? t('scaffoldCenter.app.willRegisterApp')
            : t('scaffoldCenter.app.linkedApp', { name: plan.platformApp.name })}
        </span>
      </div>
      {step === 2 && (
        <section className={css.stageCard}>
          <ScaffoldMediaFields
            t={t}
            candidate={plan.candidate}
            media={media}
            existingIcon={values.iconMediaRef}
            existingCover={values.coverMediaRef}
            existingScreenshots={values.screenshots}
            onChange={onMediaChange}
          />
        </section>
      )}
      {step === 3 && (
        <section className={css.stageCard}>
          <div className={css.formGrid}>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('scaffoldCenter.field.displayName')}</span>
              <input
                className={`${css.input}${nameInvalid ? ` ${css.inputInvalid}` : ''}`}
                value={values.displayName}
                maxLength={200}
                aria-invalid={nameInvalid}
                onChange={(event) => { onValuesChange({ displayName: event.target.value }) }}
              />
              {nameInvalid && <span className={css.fieldError}>{t('scaffoldCenter.field.nameRequired')}</span>}
            </label>
            <label className={css.field}>
              <span className={css.fieldLabel}>{t('scaffoldCenter.field.templateKey')}</span>
              <input
                className={`${css.input}${keyInvalid ? ` ${css.inputInvalid}` : ''}`}
                value={values.templateKey}
                readOnly={update}
                maxLength={64}
                aria-invalid={keyInvalid}
                onChange={(event) => { onValuesChange({ templateKey: event.target.value }) }}
              />
              {keyInvalid
                ? <span className={css.fieldError}>{t('scaffoldCenter.field.keyInvalid')}</span>
                : update && <span className={css.fieldHint}>{t('scaffoldCenter.field.keyReadonly')}</span>}
            </label>
            <label className={`${css.field} ${css.fieldWide}`}>
              <span className={css.fieldLabel}>{t('scaffoldCenter.field.subtitle')}</span>
              <textarea
                className={css.input}
                rows={2}
                maxLength={512}
                value={values.summary}
                placeholder={t('scaffoldCenter.field.summaryPlaceholder')}
                onChange={(event) => { onValuesChange({ summary: event.target.value }) }}
              />
            </label>
            <label className={`${css.field} ${css.fieldWide}`}>
              <span className={css.fieldLabel}>{t('scaffoldCenter.field.description')}</span>
              <textarea
                className={css.input}
                rows={5}
                maxLength={4000}
                value={values.description}
                placeholder={t('scaffoldCenter.field.descriptionPlaceholder')}
                onChange={(event) => { onValuesChange({ description: event.target.value }) }}
              />
            </label>
          </div>
        </section>
      )}
      {step === 4 && (
        <>
          <section className={css.stageCard}>
            <div className={css.stageCardHeader}>
              <h4 className={css.stageCardTitle}>{t('scaffoldCenter.version.title')}</h4>
              <span className={css.stageCardHint}>{t('scaffoldCenter.version.hint')}</span>
            </div>
            <div className={css.formGrid}>
              <label className={`${css.field} ${css.fieldWide}`}>
                <span className={css.fieldLabel}>{t('scaffoldCenter.field.version')}</span>
                <input
                  className={`${css.input}${versionInvalid ? ` ${css.inputInvalid}` : ''}`}
                  value={values.version}
                  maxLength={64}
                  aria-invalid={versionInvalid}
                  onChange={(event) => { onValuesChange({ version: event.target.value }) }}
                />
                {versionInvalid
                  ? <span className={css.fieldError}>{t('scaffoldCenter.field.versionInvalid')}</span>
                  : <span className={css.fieldHint}>{t('scaffoldCenter.field.versionHint')}</span>}
              </label>
              <label className={`${css.field} ${css.fieldWide}`}>
                <span className={css.fieldLabel}>{t('scaffoldCenter.field.changelog')}</span>
                <textarea
                  className={css.input}
                  rows={3}
                  maxLength={512}
                  value={values.changelog}
                  placeholder={t('scaffoldCenter.field.changelogPlaceholder')}
                  onChange={(event) => { onValuesChange({ changelog: event.target.value }) }}
                />
              </label>
            </div>
          </section>
          <section className={css.stageCard}>
            <div className={css.stageCardHeader}>
              <h4 className={css.stageCardTitle}>{t('scaffoldCenter.settings.title')}</h4>
              <span className={css.stageCardHint}>{t('scaffoldCenter.settings.hint')}</span>
            </div>
            <div className={css.settingsGrid}>
              <label className={`${css.field} ${css.fieldWide}`}>
                <span className={css.fieldLabel}>{t('scaffoldCenter.settings.category')}</span>
                {categories.length === 0
                  ? (
                    <span className={css.categoryEmpty} role="alert">
                      <span className={css.categoryEmptyMark} aria-hidden="true">!</span>
                      {t('scaffoldCenter.categoryMissing')}
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
                <span className={css.fieldLabel}>{t('scaffoldCenter.settings.visibility')}</span>
                <div className={css.segmented} role="group" aria-label={t('scaffoldCenter.settings.visibility')}>
                  <button
                    type="button"
                    className={`${css.segment}${visibility === 'PRIVATE' ? ` ${css.segmentActive}` : ''}`}
                    aria-pressed={visibility === 'PRIVATE'}
                    onClick={() => { onVisibilityChange('PRIVATE') }}
                  >
                    {t('scaffoldCenter.settings.private')}
                  </button>
                  <button
                    type="button"
                    className={`${css.segment}${visibility === 'PUBLIC' ? ` ${css.segmentActive}` : ''}`}
                    aria-pressed={visibility === 'PUBLIC'}
                    onClick={() => { onVisibilityChange('PUBLIC') }}
                  >
                    {t('scaffoldCenter.settings.public')}
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
                {t('scaffoldCenter.settings.submit')}
              </label>
            </div>
            <div className={css.publishSummary}>
              <span className={css.publishSummaryTitle}>{t('scaffoldCenter.settings.summary')}</span>
              <div className={css.publishSummaryGrid}>
                <div className={css.publishSummaryItem}>
                  <span className={css.publishSummaryLabel}>{t('scaffoldCenter.field.templateKey')}</span>
                  <span className={css.publishSummaryValue} title={values.templateKey}>{values.templateKey}</span>
                </div>
                <div className={css.publishSummaryItem}>
                  <span className={css.publishSummaryLabel}>{t('scaffoldCenter.field.version')}</span>
                  <span className={css.publishSummaryValue}>{t('scaffoldCenter.versionValue', { version: values.version })}</span>
                </div>
                <div className={css.publishSummaryItem}>
                  <span className={css.publishSummaryLabel}>{t('scaffoldCenter.settings.summaryApp')}</span>
                  <span className={css.publishSummaryValue}>
                    {plan.platformApp?.name ?? t('scaffoldCenter.app.willRegisterApp')}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/** The single run's inline progress/result view. */
function PublishOutcome(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly plan: ScaffoldPublishPlan
  readonly run: ScaffoldRunState | undefined
  readonly publishing: boolean
  readonly summary: ScaffoldRunSummary | undefined
}) {
  const { t, plan, run, publishing, summary } = props
  const failed = run?.phase === 'failed'
  const tone = publishing ? 'running' : failed ? 'warning' : 'success'
  const title = publishing
    ? t('scaffoldCenter.result.publishingTitle')
    : failed ? t('scaffoldCenter.result.failedTitle') : t('scaffoldCenter.result.successTitle')
  const hint = publishing
    ? run?.detail ?? t('scaffoldCenter.result.publishingSingleHint')
    : failed
      ? run.detail
      : t('scaffoldCenter.result.successHint', {
        created: String(summary?.created ?? 0),
        updated: String(summary?.updated ?? 0),
      })
  const percent = run?.percent
  return (
    <div className={css.outcomePanel} aria-live="polite">
      <div className={`${css.resultHero}${tone === 'warning' ? ` ${css.resultHeroWarning}` : ''}${tone === 'running' ? ` ${css.resultHeroRunning}` : ''}`}>
        <span className={css.resultIcon} aria-hidden="true">
          {publishing ? <span className={css.spinner} /> : failed ? '!' : <CheckIcon size={18} />}
        </span>
        <div className={css.resultHeading}>
          <h3 className={css.resultTitle} tabIndex={-1}>{title}</h3>
          <p className={css.resultHint}>{hint}</p>
        </div>
      </div>
      <div className={css.outcomeIdentity}>
        <AppAvatar candidate={plan.candidate} />
        <div className={css.resultIdentity}>
          <span className={css.appName}>{plan.candidate.name}</span>
          <span className={css.appKey}>{plan.candidate.appKey}</span>
        </div>
        <span className={css.typeBadge}>{t(candidateTypeLabelKey(plan.candidate))}</span>
        {!publishing && !failed && run?.detail !== undefined && (
          <span className={css.summaryMeta}>{run.detail}</span>
        )}
      </div>
      {publishing && percent !== undefined && (
        <div className={css.outcomeProgress}>
          <span className={css.progressTrack} aria-hidden="true">
            <span className={css.progressFill} style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
          </span>
          <span className={css.overallPercent}>{percent}%</span>
        </div>
      )}
      {run?.warnings !== undefined && run.warnings.length > 0 && (
        <ul className={css.resultWarnings}>
          {run.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </div>
  )
}

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024
const NO_SCREENSHOTS: readonly File[] = []
const NO_GROUPS: Readonly<Record<string, readonly File[]>> = {}

/**
 * The marketplace cover is a 16:9 listing banner, not Google Play's 1024×500
 * feature graphic and not an App Store asset (App Store has no cover slot).
 * Keeping it 16:9 gives mobile, web and cross-platform scaffolds one usable
 * marketplace hero while device screenshots follow the real store shelves.
 */
const MOBILE_MARKET_COVER: CoverSpec = {
  minWidth: 1280,
  minHeight: 720,
  aspect: { min: 16 / 9 - 0.04, max: 16 / 9 + 0.04, nominal: 16 / 9 },
  allowAlpha: true,
  maxBytes: 8 * 1024 * 1024,
  recommendedWidth: 1280,
  recommendedHeight: 720,
}

/** One app-kind media policy used by the store-asset editor. */
interface ScaffoldMediaProfile {
  readonly kind: DeployAppKind
  readonly icon: IconSpec
  readonly cover: CoverSpec
  readonly screenshots: readonly PreviewSizeTarget[]
  readonly screenshotsRequired: boolean
  readonly maxScreenshotsTotal: number
  readonly acceptedTypes: readonly string[]
  readonly note: DeployKey
}

const DEVICE_LABEL_KEYS: Readonly<Partial<Record<string, DeployKey>>> = {
  iphone: 'scaffoldCenter.media.device.iphone',
  ipad: 'scaffoldCenter.media.device.ipad',
  'android-phone': 'scaffoldCenter.media.device.androidPhone',
  'android-tablet': 'scaffoldCenter.media.device.androidTablet',
  harmonyos: 'scaffoldCenter.media.device.harmonyos',
  'wechat-miniprogram': 'scaffoldCenter.media.device.wechat',
  'douyin-miniprogram': 'scaffoldCenter.media.device.douyin',
  mac: 'scaffoldCenter.media.device.mac',
  windows: 'scaffoldCenter.media.device.windows',
  linux: 'scaffoldCenter.media.device.linux',
  web: 'scaffoldCenter.media.device.web',
}

/** App type → the store policy its assets must satisfy. */
function scaffoldMediaKind(candidate: ScaffoldAppCandidate): DeployAppKind {
  switch (candidate.appTypeId ?? candidate.cardId) {
    case 'ios': return 'IOS_APP'
    case 'android': return 'ANDROID_APP'
    case 'harmonyos': return 'HARMONYOS_APP'
    case 'desktop': return 'DESKTOP_APP'
    case 'mini-program': return 'WECHAT_MINIPROGRAM'
    case 'static-web': return 'STATIC_WEB'
    case 'api-service': return 'API_SERVICE'
    case 'flutter':
    case 'mobile':
    case 'h5':
    case 'pc-web':
    default:
      return 'SPA_WEB'
  }
}

/** Build the per-app media policy, merging iOS and Android shelves for cross-platform apps. */
function scaffoldMediaProfile(candidate: ScaffoldAppCandidate): ScaffoldMediaProfile {
  const crossPlatform = candidate.appTypeId === 'flutter' || candidate.appTypeId === 'mobile'
  const kind = crossPlatform ? 'ANDROID_APP' : scaffoldMediaKind(candidate)
  const base = mediaSpecForAppKind(kind)
  if (crossPlatform) {
    const ios = mediaSpecForAppKind('IOS_APP')
    const android = mediaSpecForAppKind('ANDROID_APP')
    const seen = new Set<string>()
    const screenshots = [...ios.screenshots, ...android.screenshots].filter((target) => {
      if (seen.has(target.key)) return false
      seen.add(target.key)
      return true
    })
    return {
      kind,
      icon: base.icon,
      cover: MOBILE_MARKET_COVER,
      screenshots,
      screenshotsRequired: true,
      maxScreenshotsTotal: 20,
      acceptedTypes: base.acceptedTypes,
      note: 'scaffoldCenter.media.spec.cross',
    }
  }
  const note: DeployKey = kind === 'IOS_APP'
    ? 'scaffoldCenter.media.spec.appStore'
    : kind === 'ANDROID_APP'
      ? 'scaffoldCenter.media.spec.googlePlay'
      : kind === 'HARMONYOS_APP'
        ? 'scaffoldCenter.media.spec.harmonyos'
        : kind === 'DESKTOP_APP'
          ? 'scaffoldCenter.media.spec.desktop'
          : kind === 'WECHAT_MINIPROGRAM'
            ? 'scaffoldCenter.media.spec.wechat'
            : kind === 'DOUYIN_MINIPROGRAM'
              ? 'scaffoldCenter.media.spec.douyin'
              : kind === 'API_SERVICE'
                ? 'scaffoldCenter.media.spec.api'
                : 'scaffoldCenter.media.spec.web'
  const mobileCover = kind === 'IOS_APP' || kind === 'ANDROID_APP' || kind === 'HARMONYOS_APP'
  return {
    kind,
    icon: base.icon,
    cover: mobileCover ? MOBILE_MARKET_COVER : base.cover,
    screenshots: base.screenshots,
    screenshotsRequired: base.screenshotsRequired,
    maxScreenshotsTotal: base.maxScreenshotsTotal,
    acceptedTypes: base.acceptedTypes,
    note,
  }
}

function previewTargetLabel(
  target: PreviewSizeTarget,
  t: (key: DeployKey, params?: Record<string, string>) => string,
): string {
  const key = DEVICE_LABEL_KEYS[target.device]
  const device = key === undefined
    ? target.device.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : t(key)
  return `${device} ${target.width} × ${target.height}`
}

function probeImage(file: File): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(undefined)
    }
    image.src = url
  })
}

/** App Store-style listing assets, with per-app-kind requirements. */
function ScaffoldMediaFields(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly candidate: ScaffoldAppCandidate
  readonly media: ScaffoldMediaDraft | undefined
  readonly existingIcon: string | undefined
  readonly existingCover: string | undefined
  readonly existingScreenshots: readonly ScaffoldScreenshotValue[]
  readonly onChange: (draft: ScaffoldMediaDraft) => void
}) {
  const { t, candidate, media, existingIcon, existingCover, existingScreenshots, onChange } = props
  const spec = scaffoldMediaProfile(candidate)
  const groups = media?.screenshots ?? NO_GROUPS
  const firstTarget = spec.screenshots.at(0)
  const [targetKey, setTargetKey] = useState(firstTarget?.key ?? '')
  const target = spec.screenshots.find(entry => entry.key === targetKey) ?? firstTarget
  const files = target === undefined ? NO_SCREENSHOTS : groups[target.key] ?? NO_SCREENSHOTS
  const selectedTotal = Object.values(groups).reduce((sum, list) => sum + list.length, 0)
  const legacyScreenshots = existingScreenshots.filter(page => page.device === undefined).length
  const existingForTarget = target === undefined
    ? 0
    : existingScreenshots.filter(page => page.device === target.key).length
      + (target.key === firstTarget?.key ? legacyScreenshots : 0)
  const iconInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const screenshotInput = useRef<HTMLInputElement>(null)
  const [iconUrl, setIconUrl] = useState<string>()
  const [coverUrl, setCoverUrl] = useState<string>()
  const [screenshotUrls, setScreenshotUrls] = useState<readonly string[]>([])
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (media?.icon === undefined) {
      setIconUrl(undefined)
      return
    }
    const url = URL.createObjectURL(media.icon)
    setIconUrl(url)
    return () => { URL.revokeObjectURL(url) }
  }, [media?.icon])

  useEffect(() => {
    if (media?.cover === undefined) {
      setCoverUrl(undefined)
      return
    }
    const url = URL.createObjectURL(media.cover)
    setCoverUrl(url)
    return () => { URL.revokeObjectURL(url) }
  }, [media?.cover])

  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file))
    setScreenshotUrls(urls)
    return () => { urls.forEach((url) => { URL.revokeObjectURL(url) }) }
  }, [files])

  const apply = (patch: {
    readonly icon?: File | null
    readonly cover?: File | null
    readonly screenshots?: Readonly<Record<string, readonly File[]>>
  }): void => {
    const next: {
      icon?: File
      cover?: File
      screenshots?: Readonly<Record<string, readonly File[]>>
    } = {}
    if (patch.icon === null) {
      // Removing the local choice falls back to the persisted image, if any.
    } else if (patch.icon !== undefined) {
      next.icon = patch.icon
    } else if (media?.icon !== undefined) {
      next.icon = media.icon
    }
    if (patch.cover === null) {
      // Same fallback for the cover.
    } else if (patch.cover !== undefined) {
      next.cover = patch.cover
    } else if (media?.cover !== undefined) {
      next.cover = media.cover
    }
    if (patch.screenshots !== undefined) {
      const nonEmpty = Object.fromEntries(
        Object.entries(patch.screenshots).filter(([, list]) => list.length > 0),
      )
      if (Object.keys(nonEmpty).length > 0) next.screenshots = nonEmpty
    } else if (media?.screenshots !== undefined) {
      next.screenshots = media.screenshots
    }
    onChange(next)
  }

  const typeAllowed = (file: File): boolean => {
    if (spec.acceptedTypes.includes(file.type)) return true
    setError(t('scaffoldCenter.media.typeError'))
    return false
  }

  const bytesAllowed = (file: File, maxBytes: number): boolean => {
    if (file.size <= maxBytes) return true
    setError(t('scaffoldCenter.media.sizeError', {
      name: file.name,
      max: String(Math.round(maxBytes / 1024 / 1024)),
    }))
    return false
  }

  const reportImage = (name: string, result: { ok: boolean; detail?: string }): boolean => {
    if (result.ok) return true
    setError(t('scaffoldCenter.media.imageRuleError', {
      name,
      detail: result.detail ?? '',
    }))
    return false
  }

  const chooseIcon = (file: File | undefined): void => {
    if (file === undefined || !typeAllowed(file) || !bytesAllowed(file, spec.icon.maxBytes)) return
    setError(undefined)
    apply({ icon: file })
    void probeImage(file).then((image) => {
      if (image === undefined) return
      if (!reportImage(t('scaffoldCenter.media.icon'), validateIcon(image.width, image.height, spec.icon))) {
        apply({ icon: null })
      }
    })
  }

  const chooseCover = (file: File | undefined): void => {
    if (file === undefined || !typeAllowed(file) || !bytesAllowed(file, spec.cover.maxBytes)) return
    setError(undefined)
    apply({ cover: file })
    void probeImage(file).then((image) => {
      if (image === undefined) return
      if (!reportImage(t('scaffoldCenter.media.cover'), validateCover(image.width, image.height, spec.cover))) {
        apply({ cover: null })
      }
    })
  }

  const addScreenshots = (incoming: FileList | null): void => {
    if (target === undefined || incoming === null || incoming.length === 0) return
    const accepted: File[] = []
    for (const file of [...incoming]) {
      if (!typeAllowed(file) || !bytesAllowed(file, MAX_SCREENSHOT_BYTES)) return
      accepted.push(file)
    }
    if (files.length + accepted.length > target.max) {
      setError(t('scaffoldCenter.media.screenshotLimit', { max: String(target.max) }))
      return
    }
    if (selectedTotal + accepted.length > spec.maxScreenshotsTotal) {
      setError(t('scaffoldCenter.media.screenshotTotalLimit', {
        max: String(spec.maxScreenshotsTotal),
      }))
      return
    }
    setError(undefined)
    const nextFiles = [...files, ...accepted]
    apply({ screenshots: { ...groups, [target.key]: nextFiles } })
    void Promise.all(accepted.map(async file => ({
      file,
      image: await probeImage(file),
    }))).then((probed) => {
      const invalid = probed.filter(({ image }) => image !== undefined
        && !reportImage(previewTargetLabel(target, t), validatePreviewSize(image.width, image.height, target)))
        .map(({ file }) => file)
      if (invalid.length === 0) return
      apply({
        screenshots: {
          ...groups,
          [target.key]: nextFiles.filter(file => !invalid.includes(file)),
        },
      })
    })
  }

  const iconLabel = media?.icon !== undefined
    ? media.icon.name
    : existingIcon !== undefined ? t('scaffoldCenter.media.existingIcon') : t('scaffoldCenter.media.noIcon')
  const coverLabel = media?.cover !== undefined
    ? media.cover.name
    : existingCover !== undefined ? t('scaffoldCenter.media.existingCover') : t('scaffoldCenter.media.noCover')

  return (
    <div className={css.mediaSection}>
      <div className={css.mediaSpecNote}>
        <span className={css.mediaSpecTitle}>{t('scaffoldCenter.media.specTitle')}</span>
        <span>{t(spec.note)}</span>
      </div>
      <div className={css.mediaHeroRow}>
        <div className={css.mediaTile}>
          <div className={css.mediaTileHeader}>
            <span className={css.fieldLabel}>{t('scaffoldCenter.media.icon')}</span>
            <span className={css.mediaRatio}>{t('scaffoldCenter.media.iconHint', {
              edge: String(spec.icon.recommendedEdge),
              max: String(Math.round(spec.icon.maxBytes / 1024 / 1024)),
            })}</span>
          </div>
          <button
            type="button"
            className={`${css.mediaDrop} ${css.mediaDropIcon}`}
            aria-label={t('scaffoldCenter.media.chooseIcon')}
            onClick={() => { iconInput.current?.click() }}
          >
            {iconUrl !== undefined
              ? <img className={css.mediaImage} src={iconUrl} alt="" />
              : <span className={css.mediaDropText}>{t('scaffoldCenter.media.iconPlaceholder')}</span>}
          </button>
          <div className={css.mediaFileRow}>
            <span className={css.mediaFileName} title={iconLabel}>{iconLabel}</span>
            <button type="button" className={css.mediaAction} onClick={() => { iconInput.current?.click() }}>
              {media?.icon !== undefined || existingIcon !== undefined
                ? t('scaffoldCenter.media.replace')
                : t('scaffoldCenter.media.choose')}
            </button>
            {media?.icon !== undefined && (
              <button type="button" className={css.mediaAction} onClick={() => { apply({ icon: null }) }}>
                {t('scaffoldCenter.media.remove')}
              </button>
            )}
          </div>
          <input
            ref={iconInput}
            className={css.fileInputHidden}
            type="file"
            accept={spec.acceptedTypes.join(',')}
            onChange={(event) => {
              chooseIcon(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
        <div className={`${css.mediaTile} ${css.mediaTileWide}`}>
          <div className={css.mediaTileHeader}>
            <span className={css.fieldLabel}>{t('scaffoldCenter.media.coverMarket')}</span>
            <span className={css.mediaRatio}>{t('scaffoldCenter.media.coverHint', {
              width: String(spec.cover.recommendedWidth),
              height: String(spec.cover.recommendedHeight),
              max: String(Math.round(spec.cover.maxBytes / 1024 / 1024)),
            })}</span>
          </div>
          <button
            type="button"
            className={`${css.mediaDrop} ${css.mediaDropCover}`}
            style={{ aspectRatio: `${spec.cover.recommendedWidth} / ${spec.cover.recommendedHeight}` }}
            aria-label={t('scaffoldCenter.media.chooseCover')}
            onClick={() => { coverInput.current?.click() }}
          >
            {coverUrl !== undefined
              ? <img className={css.mediaImage} src={coverUrl} alt="" />
              : <span className={css.mediaDropText}>{t('scaffoldCenter.media.coverPlaceholder')}</span>}
          </button>
          <div className={css.mediaFileRow}>
            <span className={css.mediaFileName} title={coverLabel}>{coverLabel}</span>
            <button type="button" className={css.mediaAction} onClick={() => { coverInput.current?.click() }}>
              {media?.cover !== undefined || existingCover !== undefined
                ? t('scaffoldCenter.media.replace')
                : t('scaffoldCenter.media.choose')}
            </button>
            {media?.cover !== undefined && (
              <button type="button" className={css.mediaAction} onClick={() => { apply({ cover: null }) }}>
                {t('scaffoldCenter.media.remove')}
              </button>
            )}
          </div>
          <input
            ref={coverInput}
            className={css.fileInputHidden}
            type="file"
            accept={spec.acceptedTypes.join(',')}
            onChange={(event) => {
              chooseCover(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
        <aside className={css.mediaChecklist}>
          <span className={css.mediaChecklistTitle}>{t('scaffoldCenter.media.requirements')}</span>
          <span className={css.mediaChecklistRow}>
            <span className={css.mediaChecklistLabel}>{t('scaffoldCenter.media.icon')}</span>
            {t('scaffoldCenter.media.logoRequirement', {
              edge: String(spec.icon.recommendedEdge),
              min: String(spec.icon.minEdge),
            })}
          </span>
          <span className={css.mediaChecklistRow}>
            <span className={css.mediaChecklistLabel}>{t('scaffoldCenter.media.coverMarket')}</span>
            {t('scaffoldCenter.media.coverRequirement', {
              width: String(spec.cover.recommendedWidth),
              height: String(spec.cover.recommendedHeight),
              max: String(Math.round(spec.cover.maxBytes / 1024 / 1024)),
            })}
          </span>
          <span className={css.mediaChecklistRow}>
            <span className={css.mediaChecklistLabel}>{t('scaffoldCenter.media.screenshots')}</span>
            {spec.screenshots.length === 0
              ? t('scaffoldCenter.media.screenshotsNotNeeded')
              : t('scaffoldCenter.media.screenshotsRequirement', {
                count: String(selectedTotal + existingScreenshots.length),
                max: String(spec.maxScreenshotsTotal),
                required: spec.screenshotsRequired
                  ? t('scaffoldCenter.media.required')
                  : t('scaffoldCenter.media.optional'),
              })}
          </span>
        </aside>
      </div>
      {target !== undefined && (
        <div className={css.screenshotSection}>
          <div className={css.mediaTileHeader}>
            <span className={css.fieldLabel}>{t('scaffoldCenter.media.screenshots')}</span>
            <span className={css.mediaRatio}>{t('scaffoldCenter.media.screenshotsHint', {
              max: String(spec.maxScreenshotsTotal),
            })}</span>
          </div>
          <div className={css.screenshotTargets} role="tablist" aria-label={t('scaffoldCenter.media.screenshots')}>
            {spec.screenshots.map(entry => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={entry.key === target.key}
                data-selected={entry.key === target.key}
                className={css.targetChip}
                onClick={() => { setTargetKey(entry.key) }}
              >
                <span>{previewTargetLabel(entry, t)}</span>
                <span className={css.targetChipCount}>
                  {(groups[entry.key] ?? NO_SCREENSHOTS).length
                    + existingScreenshots.filter(page => page.device === entry.key).length
                    + (entry.key === firstTarget?.key ? legacyScreenshots : 0)}
                </span>
                {entry.min > 0 && (
                  <span className={css.targetChipBadge}>{t('scaffoldCenter.media.minBadge', {
                    min: String(entry.min),
                  })}</span>
                )}
              </button>
            ))}
          </div>
          <div className={css.mediaMeta}>
            {t('scaffoldCenter.media.totalCount', {
              count: String(selectedTotal),
              max: String(spec.maxScreenshotsTotal),
            })}
            {spec.screenshotsRequired && ` · ${t('scaffoldCenter.media.requiredHint')}`}
          </div>
          {files.length === 0 && existingForTarget > 0 && (
            <p className={css.mediaExisting}>
              {t('scaffoldCenter.media.existingScreenshots', { count: String(existingForTarget) })}
            </p>
          )}
          <div className={css.screenshotGrid}>
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className={css.screenshotCard}>
                <img src={screenshotUrls[index]} alt="" />
                <button
                  type="button"
                  className={css.screenshotRemove}
                  aria-label={t('scaffoldCenter.media.removeScreenshot', { name: file.name })}
                  onClick={() => {
                    apply({ screenshots: { ...groups, [target.key]: files.filter((_, item) => item !== index) } })
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {files.length < target.max && (
              <button type="button" className={css.addScreenshot} onClick={() => { screenshotInput.current?.click() }}>
                <span aria-hidden="true">+</span>
                {t('scaffoldCenter.media.addScreenshot')}
              </button>
            )}
          </div>
          <input
            ref={screenshotInput}
            className={css.fileInputHidden}
            type="file"
            accept={spec.acceptedTypes.join(',')}
            multiple
            onChange={(event) => {
              addScreenshots(event.target.files)
              event.target.value = ''
            }}
          />
          <p className={css.mediaNote}>{t('scaffoldCenter.media.replaceNote')}</p>
          <p className={css.mediaNote}>{t('scaffoldCenter.media.coverMarketNote')}</p>
        </div>
      )}
      {spec.screenshots.length === 0 && (
        <p className={css.mediaNote}>{t('scaffoldCenter.media.noScreenshots')}</p>
      )}
      {error !== undefined && <p className={css.mediaError} role="alert">{error}</p>}
    </div>
  )
}

/** One loading skeleton card. */
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
  readonly candidate: ScaffoldAppCandidate
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
  readonly ignored: readonly IgnoredScaffoldDirectory[]
}) {
  const names = props.ignored.map(entry => entry.directoryName).join('、')
  return (
    <p className={css.ignoredLine} title={names}>
      {props.t('scaffoldCenter.ignored', { count: String(props.ignored.length) })}
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
function candidateTypeLabelKey(candidate: ScaffoldAppCandidate): DeployKey {
  const option = candidate.source === 'custom' ? scaffoldAppTypeOption(candidate.appTypeId) : undefined
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

/** Scaffold platform id → the existing platform label. */
function platformLabelKey(platform: string): DeployKey {
  switch (platform) {
    case 'H5': return 'scaffold.platform.h5'
    case 'PC': return 'scaffold.platform.pc'
    case 'FLUTTER': return 'scaffold.platform.flutter'
    case 'MINIPROGRAM': return 'scaffold.platform.miniprogram'
    case 'DESKTOP': return 'scaffold.platform.desktop'
    case 'ANDROID': return 'scaffold.platform.android'
    case 'IOS': return 'scaffold.platform.ios'
    case 'HARMONY': return 'scaffold.platform.harmony'
    case 'STATIC_WEB': return 'scaffold.platform.staticWeb'
    default: return 'scaffold.platform.staticWeb'
  }
}

/** The project-relative display form of the apps directory. */
function relativeApps(directory: string): string {
  const trimmed = directory.replace(/[/\\]+$/u, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return `${cut === -1 ? trimmed : trimmed.slice(cut + 1)}/apps`
}

/** Whether one app's editable values pass the pre-publish checks. */
function valuesAreValid(values: ScaffoldAppValues): boolean {
  return SCAFFOLD_KEY_PATTERN.test(values.templateKey.trim())
    && values.templateKey.trim().length <= 64
    && SCAFFOLD_VERSION_PATTERN.test(values.version.trim())
    && values.displayName.trim() !== ''
}

/** New/update copy for the selected app. */
function planStateLabel(
  t: (key: DeployKey, params?: Record<string, string>) => string,
  plan: ScaffoldPublishPlan,
): string {
  return plan.scaffold === undefined
    ? t('scaffoldCenter.app.newScaffold')
    : t('scaffoldCenter.app.updateBadge')
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
