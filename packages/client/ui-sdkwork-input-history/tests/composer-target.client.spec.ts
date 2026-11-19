// @vitest-environment jsdom
/**
 * DOM-contract coverage for the composer target helpers: resolving the editor
 * and its Session card, and the caret-edge test including the defensive
 * browser states (no view, no selection, no anchor, invalid range).
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  caretAtBoundary, composerEditable, composerInputOf, composerSessionIdOf,
} from '../src/client/composer-target.ts'

/** Mount the composer card/editable pair used by every resolution test. */
function mount(draft = 'draft text'): { card: HTMLDivElement; input: HTMLDivElement; text: Text; nested: HTMLElement } {
  document.body.replaceChildren()
  const card = document.createElement('div')
  card.setAttribute('data-composer-session-id', 's1')
  const input = document.createElement('div')
  input.setAttribute('data-composer-input', '')
  input.setAttribute('contenteditable', 'true')
  const span = document.createElement('span')
  const text = document.createTextNode(draft)
  span.append(text)
  input.append(span)
  card.append(input)
  document.body.append(card)
  return { card, input, text, nested: span }
}

/** Collapse the document caret at one text offset. */
function setCaret(node: Node, offset: number): void {
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const selection = document.getSelection()
  if (selection === null) throw new Error('jsdom selection unavailable')
  selection.removeAllRanges()
  selection.addRange(range)
}

/** Run a callback with one property replaced on an element, then restore it. */
function withOwnerDocument(root: HTMLElement, ownerDocument: Document, run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(root, 'ownerDocument')
  Object.defineProperty(root, 'ownerDocument', { configurable: true, value: ownerDocument })
  try {
    run()
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(root, 'ownerDocument')
    else Object.defineProperty(root, 'ownerDocument', descriptor)
  }
}

afterEach(() => {
  document.body.replaceChildren()
  document.getSelection()?.removeAllRanges()
})

describe('composer target resolution', () => {
  it('resolves the editable root and Session from a nested target', () => {
    const { card, input, nested } = mount()

    expect(composerInputOf(nested)).toBe(input)
    expect(composerSessionIdOf(nested)).toBe('s1')
    expect(card.getAttribute('data-composer-session-id')).toBe('s1')
  })

  it('answers absence for a null target, a non-HTML match, and an anonymous card', () => {
    const { card, input } = mount()
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('data-composer-input', '')
    card.append(svg)

    expect(composerInputOf(null)).toBeNull()
    expect(composerSessionIdOf(null)).toBeUndefined()
    expect(composerInputOf(svg)).toBeNull()
    card.removeAttribute('data-composer-session-id')
    expect(composerSessionIdOf(input)).toBeUndefined()
  })
})

describe('caret boundary', () => {
  it('reports only the collapsed caret at each document edge', () => {
    const { input, text } = mount('abc')
    setCaret(text, 0)
    expect(caretAtBoundary(input, 'start')).toBe(true)
    expect(caretAtBoundary(input, 'end')).toBe(false)

    setCaret(text, 3)
    expect(caretAtBoundary(input, 'end')).toBe(true)
    expect(caretAtBoundary(input, 'start')).toBe(false)

    setCaret(text, 1)
    expect(caretAtBoundary(input, 'start')).toBe(false)
    expect(caretAtBoundary(input, 'end')).toBe(false)
  })

  it('refuses a range selection, an empty selection, and a caret outside the editor', () => {
    const { input, text } = mount('abc')
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 2)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    expect(caretAtBoundary(input, 'start')).toBe(false)

    document.getSelection()?.removeAllRanges()
    expect(caretAtBoundary(input, 'start')).toBe(false)

    const outside = document.createElement('div')
    outside.textContent = 'outside'
    document.body.append(outside)
    setCaret(outside.firstChild!, 0)
    expect(caretAtBoundary(input, 'start')).toBe(false)
  })

  it('refuses a root outside a browser view', () => {
    const detached = document.implementation.createHTMLDocument('detached')
    const root = detached.createElement('div')
    expect(detached.defaultView).toBeNull()

    expect(caretAtBoundary(root, 'start')).toBe(false)
  })

  it('refuses selections a browser cannot expose', () => {
    const { input, text } = mount('abc')
    withOwnerDocument(input, {
      defaultView: { getSelection: () => null },
    } as never, () => {
      expect(caretAtBoundary(input, 'start')).toBe(false)
    })
    withOwnerDocument(input, {
      defaultView: { getSelection: () => undefined },
    } as never, () => {
      expect(caretAtBoundary(input, 'start')).toBe(false)
    })
    withOwnerDocument(input, {
      defaultView: {
        getSelection: () => ({ isCollapsed: true, rangeCount: 1, anchorNode: null, anchorOffset: 0 }),
      },
    } as never, () => {
      expect(caretAtBoundary(input, 'start')).toBe(false)
    })

    setCaret(text, 0)
    withOwnerDocument(input, {
      defaultView: {
        getSelection: () => ({ isCollapsed: true, rangeCount: 1, anchorNode: text, anchorOffset: 0 }),
      },
      createRange: () => ({
        setStart: () => { throw new Error('transient selection') },
        setEnd: () => {},
        toString: () => '',
      }),
    } as never, () => {
      expect(caretAtBoundary(input, 'start')).toBe(false)
    })
  })
})

describe('composer editability', () => {
  it('reads the contenteditable attribute the composer renders', () => {
    const { input } = mount()
    expect(composerEditable(input)).toBe(true)
    input.setAttribute('contenteditable', 'false')
    expect(composerEditable(input)).toBe(false)
  })
})
