/**
 * The sign-out confirmation dialog: one `shell.overlay` entry rendering the
 * question every sign-out gesture routes through (the settings popover's
 * footer row and the 个人主页 section's button). Confirming ends the account
 * session — the hosted sign-out page opens in the system browser and the local
 * session clears — so the dialog states that consequence before either
 * happens.
 *
 * The frame's overlay layer is click-through; the dialog's own mask owns
 * pointer events while mounted, and nothing renders otherwise.
 */
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createIamSignOutStore } from './iam-sign-out-store.ts'
import type { IamProfileSnapshot } from './iam-service.ts'
import css from './SignOutConfirmDialog.module.css'

/** Injected business face: the account shown and the two answers. */
export interface SignOutConfirmDialogInjected {
  /** Dismiss the question; nothing ends. */
  onCancel: () => void
  /** Accept: open the hosted sign-out page and clear the local session. */
  onConfirm: () => void
  hooks: {
    /** The signed-in account the question is about. */
    profile: HostObservable<IamProfileSnapshot>
  }
}

/** Full component props: overlay owner share + store + injected face + locale seat. */
export type SignOutConfirmDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createIamSignOutStore>>
  & InjectFace<SignOutConfirmDialogInjected>
  & PropsLocale<'uiIam'>

/**
 * Render the confirmation dialog while the store says it is open.
 *
 * Portaled to the document body for the same reason as the sign-in host: the
 * frame's overlay layer is a low z-index stacking context, so a dialog mounted
 * inside it would paint below the page modal that raised it.
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the dialog element tree, or null while closed.
 */
export function SignOutConfirmDialog(props: SignOutConfirmDialogProps) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = host.current
    if (node === null) return
    const clear = (): void => {
      node.removeAttribute('aria-hidden')
      node.removeAttribute('data-aria-hidden')
    }
    clear()
    const observer = new MutationObserver(clear)
    observer.observe(node, { attributes: true, attributeFilter: ['aria-hidden', 'data-aria-hidden'] })
    return () => { observer.disconnect() }
  }, [])
  return createPortal(
    <div ref={host} data-iam-sign-out-host="true" style={{ display: 'contents' }}>
      <SignOutConfirmDialogContent {...props} />
    </div>,
    document.body,
  )
}

function SignOutConfirmDialogContent(props: SignOutConfirmDialogProps) {
  const { useStore, useProfile, onCancel, onConfirm, t } = props
  const open = useStore(state => state.confirmOpen)
  const profile = useProfile(snapshot => snapshot)
  const titleId = useId()
  const descriptionId = useId()
  if (!open) return null
  const account = profile.displayName || profile.username || profile.email
  return (
    <div className={css.mask} role="presentation">
      <div
        className={css.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="iam-sign-out-confirm"
      >
        <button type="button" aria-label={t('signOut.close')} className={css.close} onClick={onCancel}>
          <IconCloseOutlineRegular size={14} />
        </button>
        <h2 className={css.title} id={titleId}>{t('signOut.title')}</h2>
        <p className={css.description} id={descriptionId}>{t('signOut.detail')}</p>
        {account !== '' ? <p className={css.account}>{t('signOut.account')}{account}</p> : null}
        <div className={css.actions}>
          <Button variant="outline" onClick={onCancel}>{t('signOut.cancel')}</Button>
          <button type="button" className={css.danger} onClick={onConfirm}>{t('signOut.confirm')}</button>
        </div>
      </div>
    </div>
  )
}
