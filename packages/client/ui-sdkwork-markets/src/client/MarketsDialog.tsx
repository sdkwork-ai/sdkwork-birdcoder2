/**
 * The dialog shell the markets surfaces render.
 *
 * The markets pages are often composed inside host panels and embedded SDKWork
 * application frames, where the shared primitive dialog stylesheet is not part
 * of the surrounding document. A dialog that relied on that sheet degraded into
 * an unstyled block at the end of the page: no centering, no mask, a transparent
 * card, and no stacking order above the page chrome. This shell carries its own
 * overlay, mask, card, scroll region, and stack layer, and portals to the
 * document body so a scroll- or containment-forming ancestor cannot clip or
 * offset it.
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import css from './MarketsDialog.module.css'

/** Props for the markets dialog shell. */
export interface MarketsDialogProps {
  /** Whether the dialog is showing. */
  open: boolean
  /** Dismiss command: Escape, the mask, or the close button. */
  onClose: () => void
  /** Accessible name and visible heading (omitted when headless). */
  title: string
  /** Localized accessible close-button label. */
  closeLabel?: string
  /** Supporting sentence under the heading. */
  description?: string
  /** Dialog body. */
  children?: ReactNode
  /** Action row pinned under the scrollable body. */
  footer?: ReactNode
  /** Render only the children inside the card (no heading/close/footer chrome). */
  headless?: boolean
  /** Extra class on the card (width variants). */
  className?: string
  /** Extra class on the scrollable content column. */
  contentClassName?: string
}

/**
 * Render the dialog into `document.body`.
 * @param props - see {@link MarketsDialogProps}.
 * @returns null when closed; otherwise the portaled overlay tree.
 */
export function MarketsDialog({
  open, onClose, title, closeLabel, description, children, footer, headless = false, className, contentClassName,
}: MarketsDialogProps) {
  const card = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    // The initial focus target opts in with data-modal-autofocus; the card
    // itself is the fallback so the dialog is reachable from the keyboard.
    const target = card.current?.querySelector<HTMLElement>('[data-modal-autofocus]') ?? card.current
    target?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    (
      <div
        className={css.overlay}
        data-markets-dialog=""
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div className={css.mask} aria-hidden="true" />
        <div
          ref={card}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={clsx(css.card, className)}
        >
          {headless
            ? children
            : (
              <>
                <div className={clsx(css.content, contentClassName)}>
                  <div className={css.header}>
                    <h2 className={css.title}>{title}</h2>
                    <button type="button" className={css.close} aria-label={closeLabel} onClick={onClose}>
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  {description === undefined || description === '' ? null : (
                    <p className={css.description}>{description}</p>
                  )}
                  {children === undefined ? null : <div className={css.body}>{children}</div>}
                </div>
                {footer === undefined ? null : <div className={css.footer}>{footer}</div>}
              </>
            )}
        </div>
      </div>
    ),
    document.body,
  )
}
