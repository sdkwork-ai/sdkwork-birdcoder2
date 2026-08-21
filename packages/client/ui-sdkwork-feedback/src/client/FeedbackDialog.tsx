/**
 * The feedback dialog host: one `shell.overlay` entry rendering the feedback
 * form while the shared UI store says it is open. Unconfigured (no feedback
 * base URL) it renders the configuration notice inside the same dialog shell,
 * so the settings-menu gesture always opens a dialog. The frame's overlay
 * layer is click-through; the dialog's own full-viewport mask owns pointer
 * events while mounted, and the entry renders nothing otherwise.
 */
import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { isAppStoreApiError } from '@sdkwork/appstore-app-sdk'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createFeedbackUiStore } from './feedback-ui-store.ts'
import type { FeedbackService } from './feedback-service.ts'
import css from './FeedbackDialog.module.css'

/** Feedback categories the form offers, in menu order. */
const FEEDBACK_TYPES = ['bug', 'suggestion', 'other'] as const

/** Injected business face: the submission service, the dismiss gesture, config. */
export interface FeedbackDialogInjected {
  /** The feedback service owning submission and presentation dispatch. */
  service: FeedbackService
  /** Close the dialog (dismiss or successful submission). */
  onClose: () => void
  hooks: {
    /** Whether the feedback base URL is configured (false renders the notice). */
    configured: HostObservable<boolean>
  }
}

/** Full component props: overlay owner share + store + injected face + locale seat. */
export type FeedbackDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createFeedbackUiStore>>
  & InjectFace<FeedbackDialogInjected>
  & PropsLocale<'uiFeedback'>

/**
 * Render the feedback form while the store says it is open.
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the dialog element tree, or null while closed.
 */
export function FeedbackDialog(props: FeedbackDialogProps) {
  const { useStore, useConfigured, service, onClose, t } = props
  const dialogOpen = useStore(state => state.dialogOpen)
  const configured = useConfigured(config => config)
  const [type, setType] = useState<(typeof FEEDBACK_TYPES)[number]>('bug')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)

  const contentTooLong = useMemo(() => {
    // The collector's content limit (FeedbackCreateRequest.maxLength 4000).
    return new TextEncoder().encode(content).length > 4000
  }, [content])

  const onDismiss = () => {
    if (submitting) return
    setError(undefined)
    setSubmitted(false)
    onClose()
  }

  const submitFeedback = async (): Promise<void> => {
    if (submitting) return
    const trimmed = content.trim()
    if (trimmed === '') {
      setError(t('dialog.content.required'))
      return
    }
    if (contentTooLong) {
      setError(t('dialog.content.tooLong'))
      return
    }
    setError(undefined)
    setSubmitting(true)
    try {
      await service.submit({ type, content: trimmed, ...(contact.trim() !== '' ? { contact: contact.trim() } : {}) })
      setSubmitting(false)
      setSubmitted(true)
    } catch (cause) {
      setSubmitting(false)
      setError(isAppStoreApiError(cause) && cause.status === 401
        ? t('dialog.error.unauthorized')
        : t('dialog.error'))
    }
  }

  const onSubmit = (event: { preventDefault: () => void }): void => {
    event.preventDefault()
    void submitFeedback()
  }

  return (
    <Modal
      open={dialogOpen}
      onClose={onDismiss}
      title={t('dialog.title')}
      closeLabel={t('dialog.close')}
      description={t('dialog.description')}
      footer={(
        <div className={css.actions}>
          <button type="button" className={css.cancel} onClick={onDismiss} disabled={submitting}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" form="ui-sdkwork-feedback-form" className={css.submit} disabled={submitting || submitted}>
            {submitting ? t('dialog.submitting') : t('dialog.submit')}
          </button>
        </div>
      )}
    >
      {configured
        ? submitted
          ? (
            <div className={css.success} role="status">
              <p>{t('dialog.success')}</p>
            </div>
          )
          : (
            <form
              id="ui-sdkwork-feedback-form"
              ref={formRef}
              className={css.form}
              onSubmit={onSubmit}
            >
              <fieldset className={css.typeGroup} role="radiogroup" aria-label={t('dialog.type')}>
                {FEEDBACK_TYPES.map(option => (
                  <label key={option} className={clsx(css.typeCell, type === option && css.typeActive)}>
                    <input
                      type="radio"
                      name="ui-sdkwork-feedback-type"
                      value={option}
                      checked={type === option}
                      onChange={() => { setType(option) }}
                      className={css.radio}
                    />
                    {t(`dialog.type.${option}`)}
                  </label>
                ))}
              </fieldset>
              <label className={css.field}>
                <span className={css.label}>{t('dialog.content')}</span>
                <textarea
                  className={css.textarea}
                  value={content}
                  onChange={(event) => { setContent(event.target.value) }}
                  placeholder={t('dialog.content.placeholder')}
                  rows={6}
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>{t('dialog.contact')}</span>
                <input
                  className={css.input}
                  type="text"
                  value={contact}
                  onChange={(event) => { setContact(event.target.value) }}
                  placeholder={t('dialog.contact.placeholder')}
                />
              </label>
              {error !== undefined && <p className={css.error} role="alert">{error}</p>}
            </form>
          )
        : (
          <div className={css.unconfigured} role="status">
            <p className={css.unconfiguredTitle}>{t('dialog.unconfigured.title')}</p>
            <p className={css.unconfiguredDetail}>{t('dialog.unconfigured.detail')}</p>
          </div>
        )}
    </Modal>
  )
}
