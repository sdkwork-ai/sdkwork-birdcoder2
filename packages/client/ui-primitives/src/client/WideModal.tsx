/**
 * Wide management modal: the centered shell the settings menu's management
 * surfaces (official accounts, mini programs, domains, certificates, relay API
 * keys, deployed applications) open instead of a left drawer. The panel takes
 * 90% of the viewport's width and height, which keeps the account, domain, and
 * certificate tables readable without repeating each surface's own frame.
 *
 * It is the peer of `Drawer`: both portal to the document body, share the
 * `useModalLayer` focus and key lifetime, and supply the same header contract.
 * This modal owns the layer below a record drawer, so a create/edit drawer
 * opened from its content stays above the panel and operable; the layer map
 * lives in `WideModal.module.css`.
 *
 * Renders nothing while closed. Close paths: the header button, a mask click,
 * and Escape.
 */
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCloseOutlineRegular } from './icons/index.tsx'
import { useModalLayer } from './useModalLayer.ts'
import css from './WideModal.module.css'

export interface WideModalProps {
  /** Whether the modal is showing. */
  open: boolean
  /** Application close command from Escape, a mask click, or the close control. */
  onClose: () => void
  /** Modal heading; also the dialog's accessible name. */
  title: string
  /** Optional supporting line under the heading. */
  description?: string
  /** Localized accessible close-button label. */
  closeLabel: string
  /** Modal content; mark its initial-focus control with `data-modal-autofocus`. */
  children?: ReactNode
}

/**
 * Render a 90%-viewport modal over the page mask.
 * @param props - modal contract (visibility, dismissal, heading, and content).
 * @returns null while closed; otherwise the portaled overlay tree.
 */
export function WideModal({ open, onClose, title, description, closeLabel, children }: WideModalProps): ReactNode {
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
