/**
 * The in-cell editor.
 *
 * Excel replaces a cell's own painting with a real text field while it is being
 * edited, so the caret, the text selection, and an input method all behave the
 * way they do in any other field — which is what makes a Chinese or Japanese
 * entry possible at all, since a canvas-style editor would have to reimplement
 * the input method.
 *
 * The field is mounted inside the cell it edits rather than positioned against
 * the grid, so it inherits that cell's exact rectangle, its padding, and its
 * frozen-pane offset without measuring any of them.
 */
import { useCallback, type ChangeEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { editActionFor } from './editing.ts'
import css from './SheetGrid.module.css'

/** Props the field needs from the grid. */
export interface CellEditorProps {
  /** The draft the field shows. */
  readonly text: string
  /** The field's accessible name. */
  readonly label: string
  /** The hint the field carries, which states how to confirm or abandon it. */
  readonly hint: string
  /**
   * The type the field draws with.
   *
   * Excel edits a cell in that cell's own font and alignment, so a right-aligned
   * number stays right-aligned while it is being typed; the grid supplies the
   * resolved style, and an empty cell leaves it to the sheet's default.
   */
  readonly style?: CSSProperties
  /** Report the field's new draft. */
  readonly onDraft: (text: string) => void
  /** Record the draft and carry the selection by the step. */
  readonly onCommit: (columnStep: number, rowStep: number) => void
  /** Abandon the draft. */
  readonly onCancel: () => void
}

/**
 * Draw the field a reader types a cell's contents into.
 * @param props - the draft, its labels, and the three ways it can end.
 * @returns the focused text field.
 */
export function CellEditor({ text, label, hint, style, onDraft, onCommit, onCancel }: CellEditorProps): ReactNode {
  // A callback ref rather than an effect: it runs at the moment the field joins
  // the document, which is when the caret has to be placed, and React reports
  // the field leaving by calling it with nothing — so no state is needed to
  // tell "not there yet" from "gone", and the callback stays stable, so a
  // keystroke never re-attaches it and steals the caret the reader is using.
  const focusField = useCallback((node: HTMLInputElement | null): void => {
    if (node === null) return
    node.focus()
    // The caret lands at the end of what the cell held, so amending a value
    // never makes the reader step over the text they want to keep.
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => { onDraft(event.target.value) }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const action = editActionFor(event.key, event.shiftKey)
    if (action === undefined) return
    // Every other key belongs to the field: the arrows walk the caret rather
    // than the selection, and the grid must not read the press again.
    event.preventDefault()
    event.stopPropagation()
    if (action.kind === 'cancel') onCancel()
    else onCommit(action.columnStep, action.rowStep)
  }

  return (
    <input
      ref={focusField}
      className={css.cellEditor}
      style={style}
      value={text}
      aria-label={label}
      title={hint}
      data-xlsx-cell-editor
      spellCheck={false}
      autoComplete="off"
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      // Leaving the field confirms what it holds, which is what Excel does when
      // a reader moves on to the formula bar or another control.
      onBlur={() => { onCommit(0, 0) }}
    />
  )
}
