/**
 * Lightweight modal host for the mobile simulator: a centered overlay with a
 * backdrop that closes on click-outside or Esc. The modal uses the native
 * `<dialog>` element when available (so the platform handles focus trapping
 * and the top layer), with a programmatic fallback for older engines.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import css from './Modal.module.css'

/** Props for the modal host. */
export interface ModalProps {
  /** Whether the modal is open. */
  open: boolean
  /** Invoked when the modal requests to close. */
  onClose: () => void
  /** Modal body content (typically a `MobileSimulator` in modal mode). */
  children: ReactNode
  /** Optional override for the backdrop class. */
  backdropClassName?: string
  /** Optional override for the content class. */
  contentClassName?: string
  /** Optional aria-label for the dialog. */
  ariaLabel?: string
  /** Optional test id for the modal root. */
  testId?: string
}

/**
 * An imperative handle exposing `show`/`close` for callers that prefer a
 * ref-driven lifecycle over declarative `open`. Handled via the native
 * dialog element's `showModal()`/`close()` methods.
 */
export interface ModalHandle {
  /** Present the modal. */
  show: () => void
  /** Dismiss the modal. */
  close: () => void
  /** Whether the modal is currently open. */
  isOpen: () => boolean
}

/**
 * A declarative modal host. Renders its `children` inside a centered content
 * pane; clicks on the backdrop and the Esc key invoke `onClose`. The dialog
 * is mounted only when `open` is true — the modal does not retain hidden
 * state between opens.
 * @param props - modal configuration.
 * @returns the modal element, or null when closed.
 */
export function Modal(props: ModalProps): ReactNode {
  const { open, onClose, children, backdropClassName, contentClassName, ariaLabel, testId } = props
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onBackdropClick = useCallback((e: React.MouseEvent<HTMLDialogElement>): void => {
    // Click on the backdrop itself (not bubbled from content) closes the dialog.
    if (e.target === dialogRef.current) onClose()
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  if (!open) return null
  return (
    <dialog
      ref={dialogRef}
      className={clsx(css.backdrop, backdropClassName)}
      onClick={onBackdropClick}
      aria-label={ariaLabel}
      data-testid={testId ?? 'modal-backdrop'}
    >
      <div className={clsx(css.content, contentClassName)} role="document">
        {children}
      </div>
    </dialog>
  )
}
