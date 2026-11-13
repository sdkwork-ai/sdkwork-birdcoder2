/**
 * Shared modal chrome for the two independent template surfaces.
 *
 * Publish and install own separate state, catalog reads, and panels; this
 * frame is only the common visual shell (overlay, title block, account chip,
 * close affordance, and sign-in gate). It carries no publish or install
 * workflow state.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { IconLayersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeployKey } from './locales.ts'
import dialogs from './DeployDialogs.module.css'
import css from './TemplateDialog.module.css'

/** The signed-in account identity both surfaces show. */
export interface TemplateDialogUser {
  readonly id: string
  readonly displayName: string
  readonly avatarUrl?: string
  readonly email?: string
}

/** Props for the shared template dialog shell. */
export interface TemplateDialogFrameProps {
  readonly theme: 'light' | 'dark'
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly title: string
  readonly subtitle: string
  readonly currentUser?: TemplateDialogUser | undefined
  readonly startSignIn?: (() => void) | undefined
  /** A running operation blocks Escape and the close button. */
  readonly busy?: boolean | undefined
  readonly onClose: () => void
  readonly children: ReactNode
}

/**
 * Render the shared overlay and account shell.
 * @param props - theme, copy, account, busy/close state, and the surface body.
 * @returns the modal dialog frame.
 */
export function TemplateDialogFrame({
  theme, t, title, subtitle, currentUser, startSignIn, busy = false, onClose, children,
}: TemplateDialogFrameProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [busy, onClose])

  return (
    <div
      className={dialogs.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-busy={busy}
      data-theme={theme}
    >
      <div className={`${dialogs.modal} ${css.modal}`}>
        <header className={css.header}>
          <div className={css.titleBlock}>
            <span className={css.titleGlyph} aria-hidden="true">
              <IconLayersOutlineRegular size={16} />
            </span>
            <div>
              <h2 className={css.title}>{title}</h2>
              <p className={css.subtitle}>{subtitle}</p>
            </div>
          </div>
          <div className={css.headerRight}>
            {currentUser !== undefined && <UserChip user={currentUser} t={t} />}
            <button
              ref={closeRef}
              type="button"
              className={dialogs.closeButton}
              onClick={onClose}
              disabled={busy}
              aria-label={t('templateCenter.close')}
            >
              ✕
            </button>
          </div>
        </header>
        <div className={css.body}>
          {currentUser === undefined
            ? (
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
            : children}
        </div>
      </div>
    </div>
  )
}

/** The signed-in account chip in either header. */
function UserChip({
  user,
  t,
}: {
  readonly user: TemplateDialogUser
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
}) {
  const initial = user.displayName.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <div className={css.userChip} title={user.email ?? user.displayName}>
      <span className={css.userAvatar}>
        {user.avatarUrl === undefined
          ? <span className={css.userInitial}>{initial}</span>
          : <img className={css.userAvatarImage} src={user.avatarUrl} alt="" />}
      </span>
      <span className={css.userText}>
        <span className={css.userName}>{user.displayName}</span>
        {user.email !== undefined && <span className={css.userEmail}>{user.email}</span>}
      </span>
      <span className={css.srOnly}>{t('templateCenter.account')}</span>
    </div>
  )
}
