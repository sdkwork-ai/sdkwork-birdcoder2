/**
 * Create-and-checkout modal (需求: 「创建并检出新分支」在居中弹窗中完成,产品
 * 文案见图): the shared Modal primitive carries title, description, name
 * field, and the cancel/confirm footer. Creation targets HEAD only — the
 * host validates the name through git's ref-format check and reports
 * failures in the modal.
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SdkworkGitPort } from './gitPort.ts'
import type { NS } from './locales.ts'
import css from './GitGraphModal.module.css'

/** Full props for the create-branch modal. */
export interface GitCreateBranchModalProps {
  open: boolean
  onClose: () => void
  /** Repository directory; the modal renders only with a cwd present. */
  cwd: string
  git: SdkworkGitPort
  /** Refresh the pill's status read after a successful create. */
  onCreated: () => void
  t: TranslateNS<typeof NS>
}

/**
 * The create-and-checkout dialog: name field plus cancel/confirm footer.
 * @param props - open state, close callback, repository directory, git port, success callback, locale seat.
 * @returns the modal tree, or null while closed.
 */
export function GitCreateBranchModal({ open, onClose, cwd, git, onCreated, t }: GitCreateBranchModalProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Re-open resets the draft: the modal is a one-shot create form.
  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
      setBusy(false)
      const timer = window.setTimeout(() => { inputRef.current?.focus() }, 0)
      return () => { window.clearTimeout(timer) }
    }
    return undefined
  }, [open])

  if (!open) return null

  const submit = (): void => {
    const trimmed = name.trim()
    if (trimmed === '' || busy) return
    setBusy(true)
    setError(null)
    git.createAndCheckout(cwd, trimmed).then(
      () => {
        setBusy(false)
        onCreated()
        onClose()
      },
      (reason: unknown) => {
        setBusy(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('create.title')}
      closeLabel={t('create.cancel')}
      description={t('create.description')}
      className={css.createDialog}
      footer={(
        <div className={css.createFooter}>
          <button type="button" className={css.ghostButton} disabled={busy} onClick={onClose}>
            {t('create.cancel')}
          </button>
          <button
            type="button"
            className={css.primaryButton}
            disabled={busy || name.trim() === ''}
            onClick={submit}
          >
            {t('create.confirm')}
          </button>
        </div>
      )}
    >
      <form
        className={css.createForm}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className={css.fieldLabel} htmlFor="sdkwork-git-create-name">{t('create.nameLabel')}</label>
        <input
          id="sdkwork-git-create-name"
          ref={inputRef}
          className={css.fieldInput}
          type="text"
          value={name}
          placeholder={t('create.namePlaceholder')}
          disabled={busy}
          onChange={(event) => { setName(event.target.value) }}
        />
        <p className={css.fieldHint}>{t('create.headHint')}</p>
        {error !== null && <p className={css.errorLine}>{error}</p>}
      </form>
    </Modal>
  )
}
