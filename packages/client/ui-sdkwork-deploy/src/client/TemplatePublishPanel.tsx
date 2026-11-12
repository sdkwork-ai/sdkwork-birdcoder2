/**
 * Publish panel of the app template center: the `apps/` app roots, their
 * per-app template values, the shared publish settings, and live per-row
 * progress. Presentation only — scanning, planning, publishing, and the
 * dedupe refresh arrive from the dialog through props.
 */
import type { DeployKey } from './locales.ts'
import type {
  TemplateAppCandidate,
  TemplateAppScan,
  IgnoredTemplateDirectory,
} from './templateApps.ts'
import { platformAppKind, type TemplateAppValues, type TemplatePublishPlan } from './templatePublish.ts'
import css from './TemplateCenter.module.css'

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

/** Props for the publish panel. */
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
  readonly runs: Readonly<Record<string, TemplateRunState>>
  readonly publishing: boolean
  readonly error: string | undefined
  readonly summary: TemplateRunSummary | undefined
  readonly valuesOf: (plan: TemplatePublishPlan) => TemplateAppValues
  readonly onToggle: (directory: string) => void
  readonly onSelectAll: () => void
  readonly onClear: () => void
  readonly onValuesChange: (directory: string, patch: Partial<TemplateAppValues>) => void
  readonly onCategoryChange: (categoryUuid: string) => void
  readonly onVisibilityChange: (visibility: 'PRIVATE' | 'PUBLIC') => void
  readonly onSubmitForReviewChange: (submit: boolean) => void
  readonly onRescan: () => void
  readonly onPublish: () => void
}

/**
 * Render the publish panel.
 * @param props - the scan, plans, selection, settings, live runs, and actions.
 * @returns the two-column publish surface.
 */
export function TemplatePublishPanel(props: TemplatePublishPanelProps) {
  const {
    t, directory, scan, scanError, loading, plans, categories, categoryUuid, visibility,
    submitForReview, selected, runs, publishing, error, summary, valuesOf,
    onToggle, onSelectAll, onClear, onValuesChange, onCategoryChange,
    onVisibilityChange, onSubmitForReviewChange, onRescan, onPublish,
  } = props
  const selectedPlans = plans.filter(plan => selected.has(plan.candidate.directory))
  const blocking = selectedPlans.some(plan => plan.conflict !== undefined
    || plan.platformApp === undefined && platformAppKind(plan.candidate) === undefined)
  const invalidValues = selectedPlans.some((plan) => {
    const values = valuesOf(plan)
    return !TEMPLATE_KEY_PATTERN.test(values.templateKey.trim())
      || values.templateKey.trim().length > 64
      || !TEMPLATE_VERSION_PATTERN.test(values.version.trim())
      || values.displayName.trim() === ''
  })
  const settingsReady = categoryUuid !== '' && selectedPlans.length > 0 && !blocking && !invalidValues
  const canPublish = settingsReady && !publishing
  const createCount = selectedPlans.filter(plan => plan.template === undefined).length
  const updateCount = selectedPlans.filter(plan => plan.template !== undefined).length
  const registerCount = selectedPlans.filter(plan => plan.platformApp === undefined).length
  return (
    <div className={css.publishLayout}>
      <section className={css.appColumn} aria-label={t('templateCenter.appsLabel')}>
        <div className={css.toolbar}>
          <span className={css.appsPath} title={directory ?? scan?.appsDirectory}>
            {directory === undefined ? t('templateCenter.noDirectory') : t('templateCenter.appsPath', { path: relativeApps(directory) })}
          </span>
          <div className={css.toolbarActions}>
            <button type="button" className={css.ghostButton} onClick={onSelectAll} disabled={plans.length === 0 || publishing}>
              {t('templateCenter.selectAll')}
            </button>
            <button type="button" className={css.ghostButton} onClick={onClear} disabled={selected.size === 0 || publishing}>
              {t('templateCenter.clear')}
            </button>
            <button type="button" className={css.ghostButton} onClick={onRescan} disabled={loading || publishing}>
              {loading ? t('templateCenter.scanning') : t('templateCenter.rescan')}
            </button>
          </div>
        </div>
        {loading && <SkeletonList />}
        {!loading && scanError !== undefined && (
          <Notice text={scanError} retryLabel={t('templateCenter.retry')} onRetry={onRescan} />
        )}
        {!loading && scanError === undefined && scan !== undefined && planGroups(scan, plans).length === 0 && (
          <div className={css.emptyState}>
            <span className={css.emptyGlyph} aria-hidden="true">▤</span>
            <span className={css.emptyTitle}>{t('templateCenter.noApps.title')}</span>
            <span className={css.emptyHint}>{t('templateCenter.noApps.hint')}</span>
          </div>
        )}
        {!loading && scanError === undefined && plans.length > 0 && (
          <ul className={css.appList}>
            {plans.map(plan => (
              <AppCard
                key={plan.candidate.directory}
                t={t}
                plan={plan}
                values={valuesOf(plan)}
                selected={selected.has(plan.candidate.directory)}
                run={runs[plan.candidate.directory]}
                disabled={publishing}
                onToggle={() => { onToggle(plan.candidate.directory) }}
                onValuesChange={(patch) => { onValuesChange(plan.candidate.directory, patch) }}
              />
            ))}
          </ul>
        )}
        {scan !== undefined && scan.ignored.length > 0 && (
          <IgnoredLine t={t} ignored={scan.ignored} />
        )}
      </section>
      <aside className={css.settings} aria-label={t('templateCenter.settings.title')}>
        <h3 className={css.sectionTitle}>{t('templateCenter.settings.title')}</h3>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('templateCenter.settings.category')}</span>
          <select
            className={css.input}
            value={categoryUuid}
            onChange={(event) => { onCategoryChange(event.target.value) }}
            disabled={publishing}
          >
            {categories.length === 0 && <option value="">—</option>}
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.displayName}</option>
            ))}
          </select>
        </label>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('templateCenter.settings.visibility')}</span>
          <div className={css.segmented} role="group" aria-label={t('templateCenter.settings.visibility')}>
            <button
              type="button"
              className={`${css.segment}${visibility === 'PRIVATE' ? ` ${css.segmentActive}` : ''}`}
              aria-pressed={visibility === 'PRIVATE'}
              onClick={() => { onVisibilityChange('PRIVATE') }}
              disabled={publishing}
            >
              {t('templateCenter.settings.private')}
            </button>
            <button
              type="button"
              className={`${css.segment}${visibility === 'PUBLIC' ? ` ${css.segmentActive}` : ''}`}
              aria-pressed={visibility === 'PUBLIC'}
              onClick={() => { onVisibilityChange('PUBLIC') }}
              disabled={publishing}
            >
              {t('templateCenter.settings.public')}
            </button>
          </div>
        </div>
        <label className={`${css.checkbox}${visibility !== 'PUBLIC' ? ` ${css.checkboxDisabled}` : ''}`}>
          <input
            type="checkbox"
            checked={submitForReview}
            disabled={publishing || visibility !== 'PUBLIC'}
            onChange={(event) => { onSubmitForReviewChange(event.target.checked) }}
          />
          {t('templateCenter.settings.submit')}
        </label>
        <div className={css.planSummary} role="status">
          <span className={css.planCount}>{t('templateCenter.selectedCount', {
            selected: String(selectedPlans.length),
            total: String(plans.length),
          })}</span>
          <ul className={css.planList}>
            <li>{t('templateCenter.plan.create', { count: String(createCount) })}</li>
            <li>{t('templateCenter.plan.update', { count: String(updateCount) })}</li>
            <li>{t('templateCenter.plan.registerApp', { count: String(registerCount) })}</li>
          </ul>
        </div>
        {categories.length === 0 && (
          <p className={css.noticeText} role="alert">{t('templateCenter.categoryMissing')}</p>
        )}
        {blocking && (
          <p className={css.noticeText} role="alert">{t('templateCenter.blockingSelection')}</p>
        )}
        {invalidValues && (
          <p className={css.noticeText} role="alert">{t('templateCenter.invalidValues')}</p>
        )}
        {error !== undefined && <p className={css.errorText} role="alert">{error}</p>}
        {summary !== undefined && (
          <p className={css.successText} role="status">
            {t('templateCenter.publishDone', {
              created: String(summary.created),
              updated: String(summary.updated),
            })}
            {summary.failed > 0 ? ` ${t('templateCenter.publishFailedCount', { count: String(summary.failed) })}` : ''}
          </p>
        )}
        <button
          type="button"
          className={css.primaryButton}
          disabled={!canPublish}
          onClick={onPublish}
        >
          {publishing
            ? t('templateCenter.publishing', {
              done: String(Object.values(runs).filter(run => run.phase === 'done').length),
              total: String(selectedPlans.length),
            })
            : t('templateCenter.publishAction', { count: String(selectedPlans.length) })}
        </button>
        <p className={css.footHint}>{t('templateCenter.publishHint')}</p>
      </aside>
    </div>
  )
}

/** One app card with its checkbox, identity, and expandable publish fields. */
function AppCard(props: {
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly plan: TemplatePublishPlan
  readonly values: TemplateAppValues
  readonly selected: boolean
  readonly run: TemplateRunState | undefined
  readonly disabled: boolean
  readonly onToggle: () => void
  readonly onValuesChange: (patch: Partial<TemplateAppValues>) => void
}) {
  const { t, plan, values, selected, run, disabled, onToggle, onValuesChange } = props
  const candidate = plan.candidate
  const typeKey = candidate.cardId === undefined && candidate.platforms.length > 0
    ? 'library.type.multiPlatform'
    : typeLabelKey(candidate.cardId)
  const needsLink = plan.platformApp === undefined && platformAppKind(candidate) === undefined
  const stateText = plan.conflict !== undefined
    ? t('templateCenter.app.conflict')
    : needsLink
      ? t('templateCenter.app.needsLink')
      : plan.template !== undefined
        ? t('templateCenter.app.existingTemplate', {
          version: plan.template.latestVersion ?? plan.candidate.linkedTemplateVersion ?? '—',
          next: values.version,
        })
        : t('templateCenter.app.newTemplate')
  return (
    <li className={`${css.appCard}${selected ? ` ${css.appCardSelected}` : ''}`}>
      <label className={css.appPick}>
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled || plan.conflict !== undefined || needsLink}
          onChange={onToggle}
        />
        <AppAvatar candidate={candidate} />
        <span className={css.appMain}>
          <span className={css.appNameRow}>
            <span className={css.appName} title={candidate.name}>{candidate.name}</span>
            <span className={css.typeBadge}>{t(typeKey)}</span>
            {candidate.version !== undefined && <span className={css.versionBadge}>v{candidate.version}</span>}
          </span>
          <span className={css.appKey}>{candidate.appKey}</span>
          <span className={css.appStateRow}>
            <span className={css.appState}>{stateText}</span>
            <span className={css.appState}>
              {plan.platformApp === undefined
                ? t('templateCenter.app.willRegisterApp')
                : t('templateCenter.app.linkedApp', { name: plan.platformApp.name })}
            </span>
          </span>
          {candidate.platforms.length > 0 && (
            <span className={css.platformRow}>
              {candidate.platforms.map(platform => (
                <span key={platform} className={css.platformBadge}>{t(platformLabelKey(platform))}</span>
              ))}
            </span>
          )}
        </span>
      </label>
      {selected && (
        <div className={css.editor}>
          <label className={css.field}>
            <span className={css.fieldLabel}>{t('templateCenter.field.displayName')}</span>
            <input
              className={css.input}
              value={values.displayName}
              disabled={disabled}
              onChange={(event) => { onValuesChange({ displayName: event.target.value }) }}
            />
          </label>
          <label className={css.field}>
            <span className={css.fieldLabel}>{t('templateCenter.field.templateKey')}</span>
            <input
              className={css.input}
              value={values.templateKey}
              readOnly={plan.template !== undefined}
              disabled={disabled}
              onChange={(event) => { onValuesChange({ templateKey: event.target.value }) }}
            />
          </label>
          <label className={css.field}>
            <span className={css.fieldLabel}>{t('templateCenter.field.version')}</span>
            <input
              className={css.input}
              value={values.version}
              disabled={disabled}
              onChange={(event) => { onValuesChange({ version: event.target.value }) }}
            />
          </label>
          <label className={`${css.field} ${css.editorWide}`}>
            <span className={css.fieldLabel}>{t('templateCenter.field.summary')}</span>
            <textarea
              className={css.input}
              rows={2}
              value={values.summary}
              disabled={disabled}
              onChange={(event) => { onValuesChange({ summary: event.target.value }) }}
            />
          </label>
          <label className={`${css.field} ${css.editorWide}`}>
            <span className={css.fieldLabel}>{t('templateCenter.field.changelog')}</span>
            <input
              className={css.input}
              value={values.changelog}
              disabled={disabled}
              onChange={(event) => { onValuesChange({ changelog: event.target.value }) }}
            />
          </label>
        </div>
      )}
      {run !== undefined && (
        <div className={css.runRow} role={run.phase === 'failed' ? 'alert' : 'status'}>
          <span className={`${css.runText}${run.phase === 'failed' ? ` ${css.runTextError}` : ''}`}>{run.detail}</span>
          {run.phase === 'running' && run.percent !== undefined && (
            <span className={css.progressTrack} aria-hidden="true">
              <span className={css.progressFill} style={{ width: `${Math.max(2, Math.min(100, run.percent))}%` }} />
            </span>
          )}
          {run.phase === 'done' && run.warnings !== undefined && run.warnings.length > 0 && (
            <span className={css.runHint}>{t('templateCenter.row.warnings', { count: String(run.warnings.length) })}</span>
          )}
        </div>
      )}
    </li>
  )
}

/** Avatar image or the name's initial. */
function AppAvatar({ candidate }: { readonly candidate: TemplateAppCandidate }) {
  return (
    <span className={css.avatar}>
      {candidate.iconUrl === undefined
        ? <span className={css.avatarFallback}>{candidate.name.slice(0, 1).toUpperCase()}</span>
        : <img className={css.avatarImage} src={candidate.iconUrl} alt="" />}
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

/** Three shimmer rows while the scan runs. */
function SkeletonList() {
  return (
    <ul className={css.appList} aria-hidden="true">
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

/** Console type card → the existing app-library type label. */
function typeLabelKey(cardId: string | undefined): DeployKey {
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

/**
 * The panel's rendered group count; exposed for the empty state.
 * @param scan - the completed scan.
 * @param plans - the plans derived from the scan.
 * @returns the plans when the scan found apps, otherwise an empty list.
 */
function planGroups(scan: TemplateAppScan, plans: readonly TemplatePublishPlan[]): readonly TemplatePublishPlan[] {
  return scan.apps.length === 0 ? [] : plans
}
