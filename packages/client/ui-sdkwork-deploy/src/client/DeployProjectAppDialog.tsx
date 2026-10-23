/**
 * Create-app confirmation for a project that records no deploy_app.
 *
 * The form is the project manifest: name, type card, app key and description
 * all come from `sdkwork.app.config.json`, so the operator confirms instead of
 * retyping what the repository already governs. When the manifest cannot
 * determine a console type card (an ambiguous mobile root, or no manifest at
 * all), the primary action hands over to the console's full create form rather
 * than guessing a surface.
 */
import type { DeployKey } from './locales.ts'
import type { ProjectAppDraft } from './projectApp.ts'
import css from './DeployDialogs.module.css'

/** Props for the project create-app confirmation. */
export interface DeployProjectAppDialogProps {
  /** Draft derived from the project manifest. */
  readonly draft: ProjectAppDraft
  /** Whether a governed manifest was found (drives the source line). */
  readonly hasManifest: boolean
  /** A recorded app id no longer resolves; creating replaces that linkage. */
  readonly stale: boolean
  /** What the created app is immediately used for (primary-action copy). */
  readonly intent: 'publish' | 'upload'
  /** A creation request is in flight. */
  readonly busy: boolean
  /** The app exists; only its project linkage is missing. */
  readonly retryingLink?: boolean | undefined
  /** Localized failure copy, when the last attempt failed. */
  readonly error?: string | undefined
  /** Host color scheme driving the dialog's dark-token block. */
  readonly theme: 'light' | 'dark'
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  /** Create the app from the draft. */
  readonly onConfirm: () => void
  /** Open the console's full create form (no type card derivable). */
  readonly onManual: () => void
  /** Close without creating. */
  readonly onClose: () => void
}

/**
 * Render the create-app confirmation over the manifest-derived draft.
 * @param props - the draft, the source/stale flags, in-flight and failure
 *   state, and the confirm/manual/close actions.
 * @returns the modal surface.
 */
export function DeployProjectAppDialog({
  draft, hasManifest, stale, intent, busy, retryingLink = false, error, theme, t, onConfirm, onManual, onClose,
}: DeployProjectAppDialogProps) {
  const derivable = draft.cardId !== undefined
  const createAction = retryingLink || derivable
  return (
    <div
      className={css.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('create.title')}
      data-theme={theme}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}
    >
      <div className={css.modal}>
        <div className={css.modalHeader}>
          <div>
            <h3 className={css.modalTitle}>{t('create.title')}</h3>
            <p className={css.modalSubtitle}>
              {hasManifest ? t('create.subtitle') : t('create.subtitleNoManifest')}
            </p>
          </div>
          <button type="button" className={css.closeButton} disabled={busy} onClick={onClose} aria-label={t('common.cancel')}>
            ✕
          </button>
        </div>
        {stale && <p className={css.hint}>{t('create.stale')}</p>}
        <dl className={css.summary}>
          <div className={css.summaryRow}>
            <dt>{t('create.fieldName')}</dt>
            <dd>{draft.name}</dd>
          </div>
          {draft.appKey !== undefined && (
            <div className={css.summaryRow}>
              <dt>{t('create.fieldKey')}</dt>
              <dd>{draft.appKey}</dd>
            </div>
          )}
          {draft.description !== undefined && (
            <div className={css.summaryRow}>
              <dt>{t('create.fieldDescription')}</dt>
              <dd>{draft.description}</dd>
            </div>
          )}
        </dl>
        <p className={css.hint}>
          {createAction ? t('create.completeHint') : t('create.manualHint')}
        </p>
        {error !== undefined && <p className={css.errorText} role="alert">{error}</p>}
        <div className={css.modalActions}>
          <button type="button" className={css.secondaryButton} disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </button>
          {createAction
            ? (
              <button type="button" className={css.primaryButton} disabled={busy} onClick={onConfirm}>
                {retryingLink
                  ? t('create.retryLink')
                  : busy
                    ? t('create.creating')
                    : intent === 'publish' ? t('create.confirmPublish') : t('create.confirmUpload')}
              </button>
            )
            : (
              <button type="button" className={css.primaryButton} disabled={busy} onClick={onManual}>
                {t('create.openForm')}
              </button>
            )}
        </div>
      </div>
    </div>
  )
}
