/**
 * DOM facts the composer exposes to the history gesture.
 *
 * The composer editor is the only surface the gesture listens to, so both
 * lookups start at the keydown target and walk up: the contenteditable that
 * received the key, then the composer card that names its Session. Nothing
 * crosses plugin boundaries here — the attributes are the conversation
 * plugin's public DOM contract for composer chrome.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Marker the composer's contenteditable host renders. */
const COMPOSER_INPUT_SELECTOR = '[data-composer-input]'

/** Marker the composer card renders, carrying its Session identity. */
const COMPOSER_SESSION_ATTRIBUTE = 'data-composer-session-id'

/**
 * Resolve the composer contenteditable containing one event target.
 * @param target - keydown target (or any element inside the composer).
 * @returns the editable root, or null outside the composer.
 */
export function composerInputOf(target: Element | null): HTMLElement | null {
  const found = target?.closest(COMPOSER_INPUT_SELECTOR)
  return found instanceof HTMLElement ? found : null
}

/**
 * Resolve the Session owning the composer an event target belongs to.
 * @param target - keydown target.
 * @returns the Session id, or undefined outside a Session-bound composer.
 */
export function composerSessionIdOf(target: Element | null): SessionId | undefined {
  const input = composerInputOf(target)
  const card = input?.closest(`[${COMPOSER_SESSION_ATTRIBUTE}]`)
  const id = card?.getAttribute(COMPOSER_SESSION_ATTRIBUTE)
  return id === null || id === undefined || id === '' ? undefined : id as SessionId
}

/**
 * Whether the collapsed caret touches one document edge of the composer.
 *
 * Only the document edges count: an Up press inside a multi-line draft must
 * move the caret to the previous line, not replace the draft with older input.
 * @param root - composer contenteditable.
 * @param boundary - which edge to test.
 * @returns true when the caret is collapsed at that edge.
 */
export function caretAtBoundary(root: HTMLElement, boundary: 'start' | 'end'): boolean {
  const view = root.ownerDocument.defaultView
  const selection = view?.getSelection()
  if (view === null || selection === null || selection === undefined) return false
  if (!selection.isCollapsed || selection.rangeCount === 0) return false
  const anchor = selection.anchorNode
  if (anchor === null || !root.contains(anchor)) return false
  const range = root.ownerDocument.createRange()
  try {
    if (boundary === 'start') {
      range.setStart(root, 0)
      range.setEnd(anchor, selection.anchorOffset)
    } else {
      range.setStart(anchor, selection.anchorOffset)
      range.setEnd(root, root.childNodes.length)
    }
  } catch {
    // A selection the browser considers transiently invalid cannot be a recall
    // gesture: leave the key to native caret movement.
    return false
  }
  return range.toString() === ''
}

/**
 * Whether the composer currently accepts typing.
 * @param root - composer contenteditable.
 * @returns true when the editable host is switched on.
 */
export function composerEditable(root: HTMLElement): boolean {
  return root.getAttribute('contenteditable') === 'true'
}
