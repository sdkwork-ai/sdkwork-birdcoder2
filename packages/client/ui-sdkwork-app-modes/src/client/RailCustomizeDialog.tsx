/**
 * The rail's customize dialog: the list where the user picks which entries the
 * rail shows and drags them into order. Every control writes the rail layout
 * store immediately, so the rail behind the dialog re-renders live and there
 * is no draft/commit step to lose. Rows render each mode's real rail entry as
 * an inert glyph through the rail's render slot, so the dialog carries no icon
 * registry of its own.
 *
 * Reordering is one gesture with one commit point. Pressing anywhere on a row
 * (its checkbox excepted) starts a drag: the row lifts and follows the
 * pointer, an insertion line marks the gap it would drop into, and the list
 * scrolls when the pointer reaches an edge. The drop target is computed from
 * the rows' midpoints captured at drag start, so a moving pointer never makes
 * the slot oscillate. Releasing commits one `moveBefore` write; Escape, a lost
 * pointer capture, or an unmount discards the drag. The grip additionally
 * reorders with ArrowUp/ArrowDown/Home/End for keyboard users.
 *
 * The gesture listens on the window instead of relying on pointer capture:
 * capture is requested as an optimization, but a drag must keep receiving
 * moves even where the platform refuses capture (headless or synthetic
 * pointer events), so the window listeners own the gesture's lifetime.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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

/** Pointer distance from a list edge that scrolls the list during a drag, in px. */
const AUTO_SCROLL_EDGE = 28
/** Pixels one auto-scroll step moves the list during a drag. */
const AUTO_SCROLL_STEP = 16

/** One drop candidate captured when a drag starts. */
interface DropCandidate {
  /** The mode the candidate row belongs to. */
  readonly mode: RailModeId
  /** The row's vertical midpoint in viewport pixels at drag start. */
  readonly middle: number
}

/** The live drag: what is moving, where it would land, and how far it has moved. */
interface DragDraft {
  /** The row being dragged. */
  readonly mode: RailModeId
  /** Every other row in display order; the drop slots are the gaps between them. */
  readonly candidates: readonly DropCandidate[]
  /** Insertion slot among {@link DragDraft.candidates} (0 = first, length = after the last). */
  readonly slot: number
  /** List scroll offset at drag start, so auto-scrolled candidates keep their place. */
  readonly scrollTop: number
  /** Pointer y at drag start, the origin of the dragged row's follow offset. */
  readonly startY: number
  /** Vertical distance the dragged row follows the pointer, in px. */
  readonly offset: number
}

/** The window listeners that own one drag gesture. */
interface DragListeners {
  move: (event: globalThis.PointerEvent) => void
  up: (event: globalThis.PointerEvent) => void
  cancel: () => void
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

  // The drag draft lives in state so the indicator and the lifted row follow
  // the pointer, and in refs so the window handlers of one gesture read the
  // latest draft without re-binding listeners.
  const [drag, setDrag] = useState<DragDraft | undefined>(undefined)
  const dragRef = useRef<DragDraft | undefined>(undefined)
  dragRef.current = drag
  const listenersRef = useRef<DragListeners | undefined>(undefined)
  const listRef = useRef<HTMLUListElement | null>(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  /** Detach the gesture's window listeners, if any. */
  const detach = (): void => {
    const listeners = listenersRef.current
    if (listeners === undefined) return
    listenersRef.current = undefined
    window.removeEventListener('pointermove', listeners.move)
    window.removeEventListener('pointerup', listeners.up)
    window.removeEventListener('pointercancel', listeners.cancel)
  }

  /** Drop the drag without writing: a cancelled, lost, or interrupted gesture. */
  const cancelDrag = (): void => {
    detach()
    setDrag(undefined)
  }

  // A dialog that closes mid-drag must not keep a window listener that would
  // commit the stale gesture on the next pointerup.
  useEffect(() => detach, [])

  /**
   * The slot a pointer y targets among the captured candidates.
   * @param draft - the drag in flight.
   * @param clientY - the pointer's viewport y.
   * @returns the insertion slot from 0 through the candidate count.
   */
  const slotAt = (draft: DragDraft, clientY: number): number => {
    const list = listRef.current
    const scrolled = list === null ? 0 : list.scrollTop - draft.scrollTop
    let slot = 0
    for (const candidate of draft.candidates) {
      if (candidate.middle - scrolled < clientY) slot += 1
    }
    return slot
  }

  /**
   * Follow the pointer: scroll at the list edges, retarget the slot, and lift the row.
   * @param event - the window's pointermove.
   */
  const follow = (event: globalThis.PointerEvent): void => {
    const current = dragRef.current
    if (current === undefined) return
    const list = listRef.current
    if (list !== null) {
      const box = list.getBoundingClientRect()
      if (event.clientY < box.top + AUTO_SCROLL_EDGE) list.scrollTop -= AUTO_SCROLL_STEP
      else if (event.clientY > box.bottom - AUTO_SCROLL_EDGE) list.scrollTop += AUTO_SCROLL_STEP
    }
    const slot = slotAt(current, event.clientY)
    const offset = event.clientY - current.startY
    if (slot === current.slot && offset === current.offset) return
    setDrag({ ...current, slot, offset })
  }

  /** Commit the drag: one layout write, then drop the lifted row back in place. */
  const commit = (): void => {
    const current = dragRef.current
    detach()
    if (current === undefined) return
    setDrag(undefined)
    layout.moveBefore(current.mode, current.candidates[current.slot]?.mode)
  }

  /**
   * Start dragging one row: snapshot the drop candidates and take the gesture
   * onto the window. A mouse or pen drag starts anywhere on the row; touch
   * drags start on the grip so a vertical swipe still scrolls the list.
   * @param mode - the row's mode id.
   * @returns the row's pointerdown handler.
   */
  const startDrag = (mode: RailModeId) => (event: PointerEvent<HTMLLIElement>): void => {
    if (dragRef.current !== undefined || event.button !== 0) return
    const target = event.target as Element
    // The checkbox is the row's own control; a press there must toggle it.
    if (target.closest('input') !== null) return
    if (event.pointerType === 'touch' && target.closest('[data-rail-drag-handle]') === null) return
    const list = listRef.current
    const order = entriesRef.current
    const index = order.indexOf(mode)
    if (list === null || index < 0) return

    const candidates: DropCandidate[] = []
    const rows = list.querySelectorAll<HTMLElement>('[data-rail-customize-row]')
    for (const [position, row] of [...rows].entries()) {
      const rowMode = order.at(position)
      if (rowMode === undefined || rowMode === mode) continue
      const box = row.getBoundingClientRect()
      candidates.push({ mode: rowMode, middle: box.top + box.height / 2 })
    }

    event.preventDefault()
    // Pointer capture retargets the moves to the row; the window listeners are
    // what actually carry the gesture, so a refused capture cannot break it.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // No active pointer to capture (synthetic events, headless input).
    }
    listenersRef.current = { move: follow, up: commit, cancel: cancelDrag }
    window.addEventListener('pointermove', follow)
    window.addEventListener('pointerup', commit)
    window.addEventListener('pointercancel', cancelDrag)
    setDrag({
      mode,
      candidates,
      slot: index,
      scrollTop: list.scrollTop,
      startY: event.clientY,
      offset: 0,
    })
  }

  /** ArrowUp/ArrowDown nudge the row one slot; Home/End send it to the ends. */
  const reorderFromKeyboard = (mode: RailModeId) => (event: KeyboardEvent<HTMLButtonElement>): void => {
    const order = entriesRef.current
    const index = order.indexOf(mode)
    if (index < 0) return
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        if (index > 0) layout.moveBefore(mode, order[index - 1])
        return
      case 'ArrowDown':
        event.preventDefault()
        if (index < order.length - 1) layout.moveBefore(mode, order[index + 2] ?? undefined)
        return
      case 'Home':
        event.preventDefault()
        layout.moveBefore(mode, order[0])
        return
      case 'End':
        event.preventDefault()
        layout.moveBefore(mode, undefined)
        return
      default:
    }
  }

  const draggingIndex = drag === undefined ? -1 : entries.indexOf(drag.mode)
  const lastCandidate = drag?.candidates[drag.candidates.length - 1]?.mode
  const showIndicator = drag !== undefined && drag.slot !== draggingIndex

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('rail.customize.title')}
      description={t('rail.customize.description')}
      closeLabel={t('close')}
      className={css.dialog}
      onKeyDownCapture={(event) => {
        // Escape cancels the gesture that is in flight instead of closing the
        // dialog, so an accidental drag never costs the user the window.
        if (dragRef.current === undefined || event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        cancelDrag()
      }}
      footer={(
        <>
          <Button variant="outline" className={css.reset} onClick={() => layout.reset()}>
            {t('rail.customize.reset')}
          </Button>
          <Button variant="primary" onClick={onClose}>{t('rail.customize.done')}</Button>
        </>
      )}
    >
      <ul ref={listRef} className={css.list} data-drag-active={drag === undefined ? undefined : ''}>
        {entries.map((mode) => {
          const name = t(`mode.${mode}`)
          const fixed = isFixedMode(mode)
          const lifted = drag?.mode === mode
          const dropBefore = showIndicator && !lifted && drag.candidates[drag.slot]?.mode === mode
          const dropAfter = showIndicator && drag.slot === drag.candidates.length && mode === lastCandidate
          return (
            <li
              key={mode}
              data-rail-customize-row=""
              data-dragging={lifted ? '' : undefined}
              data-drop-before={dropBefore ? '' : undefined}
              data-drop-after={dropAfter ? '' : undefined}
              className={css.row}
              onPointerDown={startDrag(mode)}
              onLostPointerCapture={cancelDrag}
              {...(lifted ? { style: { transform: `translateY(${String(drag.offset)}px)` } } : {})}
            >
              <button
                type="button"
                className={css.handle}
                data-rail-drag-handle=""
                aria-label={t('rail.customize.dragHandle', { name })}
                aria-keyshortcuts="ArrowUp ArrowDown Home End"
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
