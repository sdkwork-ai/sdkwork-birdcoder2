/**
 * The rail's customize dialog: the list where the user picks which entries the
 * rail shows and drags them into order. Every control writes the rail layout
 * store immediately, so the rail behind the dialog re-renders live and there
 * is no draft/commit step to lose. Rows render each mode's real rail entry as
 * an inert glyph through the rail's render slot, so the dialog carries no icon
 * registry of its own. The drag handle is pointer-captured (the row follows
 * the pointer until drop) with Alt+Arrow as the keyboard equivalent.
 */
import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { Button, IconDragHandleOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { RailLayoutStore } from './rail-layout-store.ts'
import { isFixedMode, type RailModeId } from './rail-modes.ts'
import css from './RailCustomizeDialog.module.css'

/** Full component props. */
export interface RailCustomizeDialogProps {
  /** Whether the dialog renders. */
  open: boolean
  /** Close request (Done button, Escape, mask click). */
  onClose: () => void
  /** The rail layout store: read for the row state, written by every control. */
  layout: RailLayoutStore
  /** The customizable modes that have a registered rail entry, in layout order. */
  entries: readonly RailModeId[]
  /** Visibility write; the rail wraps it with the active-mode fallback. */
  onVisibleChange: (mode: RailModeId, visible: boolean) => void
  /** Renders one mode's real rail entry as an inert glyph (no pointer, no focus). */
  renderEntry: (mode: RailModeId) => ReactNode
  /** The appMode dictionary seat. */
  t: TranslateNS<'appMode'>
}

/** Drag draft: the row being dragged and the row index it currently hovers over. */
interface DragDraft {
  /** The dragged mode id. */
  mode: RailModeId
  /** The display index the dragged row would occupy if dropped now. */
  overIndex: number
}

/**
 * Render the rail customize dialog.
 * @param props - dialog state, the layout store, the registered entries, and the locale seat.
 * @returns the portaled dialog, or nothing while closed.
 */
export function RailCustomizeDialog({
  open, onClose, layout, entries, onVisibleChange, renderEntry, t,
}: RailCustomizeDialogProps): ReactNode {
  const state = useSyncExternalStore(layout.subscribe, layout.get)
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden])

  // The drag draft lives in state (rows reorder live while dragging) and a ref
  // (the pointerup handler commits the draft the latest render produced).
  const [drag, setDrag] = useState<DragDraft | undefined>(undefined)
  const dragRef = useRef<DragDraft | undefined>(undefined)
  dragRef.current = drag
  const listRef = useRef<HTMLUListElement | null>(null)

  /** The row order while a drag is active: the draft's mid-drag arrangement. */
  const displayOrder = useMemo(() => {
    if (drag === undefined) return entries
    const rest = entries.filter(id => id !== drag.mode)
    const next = [...rest]
    next.splice(Math.min(Math.max(drag.overIndex, 0), rest.length), 0, drag.mode)
    return next
  }, [entries, drag])
  const displayOrderRef = useRef(displayOrder)
  displayOrderRef.current = displayOrder

  /**
   * Resolve the hovered row index from a pointer position: the first row whose
   * vertical midpoint is below the pointer, else the last row.
   * @param clientY - viewport y of the pointer.
   * @returns the index the dragged row would occupy if dropped now.
   */
  const indexFromPointer = (clientY: number): number => {
    const list = listRef.current
    if (list === null) return 0
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-rail-customize-row]'))
    for (const [index, row] of rows.entries()) {
      const box = row.getBoundingClientRect()
      if (clientY < box.top + box.height / 2) return index
    }
    return Math.max(rows.length - 1, 0)
  }

  /** Start dragging one row: capture the pointer and arm the draft at the row's current index. */
  const beginDrag = (mode: RailModeId) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ mode, overIndex: displayOrderRef.current.indexOf(mode) })
  }

  /** Follow the pointer: retarget the draft's hover index as rows pass under it. */
  const dragMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (current === undefined || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const overIndex = indexFromPointer(event.clientY)
    if (overIndex !== current.overIndex) setDrag({ ...current, overIndex })
  }

  /** Commit the draft: write the arrangement into the layout store and clear the drag. */
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const current = dragRef.current
    if (current !== undefined) {
      layout.moveBefore(current.mode, displayOrderRef.current[current.overIndex + 1])
    }
    setDrag(undefined)
  }

  /** Drop a draft without writing: a cancelled or lost capture keeps the stored order. */
  const cancelDrag = () => {
    setDrag(undefined)
  }

  /** Alt+ArrowUp / Alt+ArrowDown move the row one position (the keyboard path into moveBefore). */
  const reorderFromKeyboard = (mode: RailModeId) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return
    const order = displayOrderRef.current
    const index = order.indexOf(mode)
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault()
      layout.moveBefore(mode, order[index - 1])
    } else if (event.key === 'ArrowDown' && index < order.length - 1) {
      event.preventDefault()
      layout.moveBefore(mode, order[index + 2] ?? undefined)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('rail.customize.title')}
      description={t('rail.customize.description')}
      closeLabel={t('close')}
      contentClassName={css.body}
      footer={(
        <>
          <Button variant="outline" className={css.reset} onClick={() => layout.reset()}>
            {t('rail.customize.reset')}
          </Button>
          <Button variant="primary" onClick={onClose}>{t('rail.customize.done')}</Button>
        </>
      )}
    >
      <ul ref={listRef} className={css.list}>
        {displayOrder.map((mode) => {
          const name = t(`mode.${mode}`)
          const fixed = isFixedMode(mode)
          return (
            <li
              key={mode}
              data-rail-customize-row=""
              data-dragging={drag?.mode === mode || undefined}
              className={css.row}
            >
              <button
                type="button"
                className={css.handle}
                aria-label={t('rail.customize.dragHandle', { name })}
                onPointerDown={beginDrag(mode)}
                onPointerMove={dragMove}
                onPointerUp={endDrag}
                onLostPointerCapture={cancelDrag}
                onKeyDown={reorderFromKeyboard(mode)}
              >
                <IconDragHandleOutlineRegular size={16} />
              </button>
              <span className={css.glyph} aria-hidden="true">{renderEntry(mode)}</span>
              <span className={css.name}>{name}</span>
              {/* A fixed mode renders checked and disabled: always shown, by design. */}
              <input
                type="checkbox"
                className={css.check}
                checked={!hidden.has(mode)}
                disabled={fixed}
                onChange={(event) => { onVisibleChange(mode, event.target.checked) }}
                aria-label={t('rail.customize.showEntry', { name })}
              />
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
