/**
 * Left drawer: the wide management surfaces (official accounts, mini programs,
 * domains, certificates) open this shell instead of a centered dialog. It is
 * a full-height panel sliding in from the inline-start edge over a masked page,
 * with the header (title, supporting line, close control) supplied here so
 * every management surface presents the same dismissal geometry.
 *
 * The layer is portaled to the document body and declares the page's top
 * overlay slot in `Drawer.module.css`, so a drawer opened from a menu or a
 * settings panel can never be painted behind them. Embedded surfaces that
 * portal their own dialogs to the body lift those above this layer for their
 * own scope; the sign-in surface keeps the slot above both.
 *
 * Renders nothing while closed. Close paths: the header button, a mask click,
 * and Escape (the shared modal layer also traps Tab and restores the opener).
 */
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutlineRegular } from './icons/index.tsx'
import { useModalLayer } from './useModalLayer.ts'
import css from './Drawer.module.css'

export interface DrawerProps {
  /** Whether the drawer is showing. */
  open: boolean
  /** Application close command from Escape, a mask click, or the close control. */
  onClose: () => void
  /** Drawer heading; also the dialog's accessible name. */
  title: string
  /** Optional supporting line under the heading. */
  description?: string
  /** Localized accessible close-button label. */
  closeLabel: string
  /** Drawer content; mark its initial-focus control with `data-modal-autofocus`. */
  children?: ReactNode
}

/**
 * Render a left drawer over the page mask.
 * @param props - drawer contract (visibility, dismissal, heading, and content).
 * @returns null while closed; otherwise the portaled overlay tree.
 */
export function Drawer({ open, onClose, title, description, closeLabel, children }: DrawerProps): ReactNode {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useModalLayer(panel, open, onClose)

  if (!open) return null

  return createPortal((
    <div className={css.root} role="presentation">
      <div className={css.mask} aria-hidden="true" onClick={onClose} />
      <div ref={panel} className={css.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={css.header}>
          <div className={css.heading}>
            <h2 id={titleId} className={css.title}>{title}</h2>
            {description !== undefined && description !== '' && (
              <p className={css.description}>{description}</p>
            )}
          </div>
          <button type="button" className={css.close} aria-label={closeLabel} onClick={onClose}>
            <IconCloseOutlineRegular size={14} />
          </button>
        </div>
        <div className={css.body}>{children}</div>
      </div>
    </div>
  ), document.body)
}
