/**
 * Publish-as-template dialog: turns an existing deploy_app into a
 * deploy_app_template (category + display copy + visibility), optionally
 * submitting it for review right after creation. The template identity is
 * persisted by the caller through the project manifest so repeat runs relate
 * by ID instead of creating duplicates.
 */
import { useEffect, useState } from 'react'
import type { AppResponse, SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { DeployKey } from './locales.ts'
import css from './DeployDialogs.module.css'

/** One template category as served by `templateCategories.list`. */
interface TemplateCategory {
  id: string
  displayName: string
  status: 'ACTIVE' | 'DISABLED'
}

/** The created template identity handed back for persistence. */
export interface PublishedTemplate {
  id: string
  templateKey: string
  displayName: string
}

/** Props for the publish-as-template dialog. */
export interface PublishTemplateDialogProps {
  readonly deployClient: SdkworkDeployAppClient
  /** The source app the template is created from (`deploy_app_template.app_uuid`). */
  readonly app: AppResponse
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly onClose: () => void
  readonly onPublished: (template: PublishedTemplate) => void
}

/** Modal form that creates (and optionally submits) a deploy app template. */
export function PublishTemplateDialog({
  deployClient,
  app,
  t,
  onClose,
  onPublished,
}: PublishTemplateDialogProps) {
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [categoryUuid, setCategoryUuid] = useState<string>('')
  const [templateKey, setTemplateKey] = useState(app.slug)
  const [displayName, setDisplayName] = useState(app.name)
  const [summary, setSummary] = useState(app.description ?? '')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE')
  const [submitForReview, setSubmitForReview] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    deployClient.template.templateCategories
      .list()
      .then((page) => {
        if (cancelled) return
        const active = page.items.filter(category => category.status === 'ACTIVE')
        setCategories(active)
        setCategoryUuid(current => (current === '' ? (active[0]?.id ?? '') : current))
      })
      .catch((cause) => {
        if (cancelled) return
        setLoadError(
          t('template.loadCategoriesFailed', {
            message: String(cause instanceof Error ? cause.message : cause),
          }),
        )
      })
    return () => {
      cancelled = true
    }
  }, [deployClient, t])

  const publish = async (): Promise<void> => {
    if (categoryUuid === '' || templateKey.trim() === '' || displayName.trim() === '') return
    setBusy(true)
    setError(undefined)
    try {
      const created = await deployClient.template.appTemplates.create(
        {
          appUuid: app.id,
          categoryUuid,
          templateKey: templateKey.trim(),
          displayName: displayName.trim(),
          summary: summary.trim(),
          visibility,
        },
        { idempotencyKey: newIdempotencyKey() },
      )
      const finalTemplate =
        submitForReview ? await deployClient.template.appTemplates.submit(created.id) : created
      onPublished({
        id: finalTemplate.id,
        templateKey: finalTemplate.templateKey,
        displayName: finalTemplate.displayName,
      })
    } catch (cause) {
      setError(
        t('template.createFailed', {
          message: String(cause instanceof Error ? cause.message : cause),
        }),
      )
      setBusy(false)
    }
  }

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('template.title')}>
      <div className={css.modal}>
        <div className={css.modalHeader}>
          <div>
            <h3 className={css.modalTitle}>{t('template.title')}</h3>
            <p className={css.modalSubtitle}>{t('template.subtitle', { name: app.name })}</p>
          </div>
          <button type="button" className={css.closeButton} onClick={onClose} aria-label={t('common.cancel')}>
            ✕
          </button>
        </div>

        <label className={css.fieldLabel}>
          {t('template.category')}
          <select
            className={css.input}
            value={categoryUuid}
            onChange={(event) => { setCategoryUuid(event.target.value) }}
          >
            {categories.length === 0 && <option value="">—</option>}
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className={css.fieldLabel}>
          {t('template.displayName')}
          <input
            className={css.input}
            value={displayName}
            onChange={(event) => { setDisplayName(event.target.value) }}
          />
        </label>

        <label className={css.fieldLabel}>
          {t('template.key')}
          <input
            className={css.input}
            value={templateKey}
            onChange={(event) => { setTemplateKey(event.target.value) }}
          />
        </label>

        <label className={css.fieldLabel}>
          {t('template.summary')}
          <textarea
            className={css.input}
            rows={3}
            value={summary}
            onChange={(event) => { setSummary(event.target.value) }}
          />
        </label>

        <label className={css.fieldLabel}>
          {t('template.visibility')}
          <select
            className={css.input}
            value={visibility}
            onChange={(event) => { setVisibility(event.target.value === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE') }}
          >
            <option value="PRIVATE">{t('template.visibility.private')}</option>
            <option value="PUBLIC">{t('template.visibility.public')}</option>
          </select>
        </label>

        <label className={css.checkboxRow}>
          <input
            type="checkbox"
            checked={submitForReview}
            onChange={(event) => { setSubmitForReview(event.target.checked) }}
          />
          {t('template.submitReview')}
        </label>

        {loadError !== undefined && <p className={css.errorText} role="alert">{loadError}</p>}
        {error !== undefined && <p className={css.errorText} role="alert">{error}</p>}

        <div className={css.modalActions}>
          <button type="button" className={css.secondaryButton} onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={css.primaryButton}
            disabled={busy || categoryUuid === '' || templateKey.trim() === '' || displayName.trim() === ''}
            onClick={() => { void publish() }}
          >
            {busy ? '…' : t('template.create')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Idempotency key for the template create call (browser crypto with a fallback). */
function newIdempotencyKey(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef !== undefined && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
