/**
 * The add-market entry dialog: the modal form that records a plugin market's
 * provenance — the source (GitHub `owner/repo`, a Git URL, or a local
 * folder), the optional Git ref, and the optional sparse-checkout path — and
 * submits it as one composed prompt into a fresh conversation (the harness's
 * execution channel; no direct host market API exists yet, so the entry rides
 * the same dispatch as the create flow). Escape, the close button, and an
 * overlay click dismiss; the submit stays gated on a non-blank source.
 */
import { useEffect, useRef, useState } from 'react'
import type { MarketsKey } from './locales.ts'
import css from './AddMarketDialog.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/** Full props for the dialog. */
export interface AddMarketDialogProps {
  /** The locale seat. */
  t: Translate
  /** Submit the composed market prompt (the dialog closes itself). */
  onSubmit: (text: string) => void
  /** Dismiss without submitting. */
  onClose: () => void
}

/** Compose the market prompt from the form fields (blank optionals fall back). */
export function marketPrompt(t: Translate, source: string, ref: string, sparse: string): string {
  return t('prompt.market')
    .replace('{source}', source.trim())
    .replace('{ref}', ref.trim() === '' ? t('prompt.ref.fallback') : ref.trim())
    .replace('{sparse}', sparse.trim() === '' ? t('prompt.sparse.fallback') : sparse.trim())
}

/**
 * Render the modal form.
 * @param props - the locale seat plus the submit and dismiss callbacks.
 * @returns the dialog element tree.
 */
export function AddMarketDialog({ t, onSubmit, onClose }: AddMarketDialogProps) {
  const [source, setSource] = useState('')
  const [ref, setRef] = useState('')
  const [sparse, setSparse] = useState('')
  const card = useRef<HTMLDivElement>(null)

  // Escape dismisses; the overlay's own pointerdown dismisses too (a
  // pointerdown that starts inside the card does not).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  return (
    <div
      className={css.overlay}
      role="presentation"
      onPointerDown={(e) => {
        if (card.current !== null && !card.current.contains(e.target as Node)) onClose()
      }}
    >
      <div className={css.card} ref={card} role="dialog" aria-modal="true" aria-label={t('dialog.market.title')}>
        <button type="button" className={css.close} aria-label={t('dialog.close')} onClick={onClose}>×</button>
        <h2 className={css.title}>{t('dialog.market.title')}</h2>
        <p className={css.hint}>{t('dialog.market.hint')}</p>
        <form
          className={css.form}
          onSubmit={(event) => {
            event.preventDefault()
            if (source.trim() === '') return
            onSubmit(marketPrompt(t, source, ref, sparse))
          }}
        >
          <label className={css.field}>
            <span className={css.label}>{t('dialog.market.source')}</span>
            <input
              className={css.input}
              type="text"
              value={source}
              placeholder={t('dialog.market.source.placeholder')}
              aria-label={t('dialog.market.source')}
              autoFocus
              onChange={(e) => { setSource(e.target.value) }}
            />
          </label>
          <label className={css.field}>
            <span className={css.label}>{t('dialog.market.ref')}</span>
            <input
              className={css.input}
              type="text"
              value={ref}
              placeholder={t('dialog.market.ref.placeholder')}
              aria-label={t('dialog.market.ref')}
              onChange={(e) => { setRef(e.target.value) }}
            />
          </label>
          <label className={css.field}>
            <span className={css.label}>{t('dialog.market.sparse')}</span>
            <textarea
              className={css.input}
              rows={3}
              value={sparse}
              placeholder={t('dialog.market.sparse.placeholder')}
              aria-label={t('dialog.market.sparse')}
              onChange={(e) => { setSparse(e.target.value) }}
            />
          </label>
          <div className={css.footer}>
            <button type="button" className={css.cancel} onClick={onClose}>{t('dialog.cancel')}</button>
            <button type="submit" className={css.submit} disabled={source.trim() === ''}>
              {t('dialog.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
