// @vitest-environment jsdom
/**
 * End-to-end gesture routing over a REAL Lexical composer: the composer keymap
 * runs first (and may consume the key), then the fixed-input adapter observes
 * the same DOM keydown. This is the integration the unit controller spec
 * cannot see — notably that an unconsumed ArrowUp reaches history, and that a
 * menu-consumed ArrowUp does not.
 */
import { describe, expect, it, onTestFinished } from 'vitest'
import { createEditor } from 'lexical'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import { registerPlainText } from '@lexical/plain-text'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { registerComposerKeymap } from '@deepseek-ai/dsh-client-ui-conversation/src/client/input/editor/keymap.ts'
import { InputHistoryController } from '../src/client/input-history-controller.ts'
import { createInputHistoryStore, type InputHistoryStorage } from '../src/client/input-history-store.ts'

/** A Session id brand for fixtures. */
function sid(id: string): SessionId {
  return id as SessionId
}

/** Memory storage; the ledger never rehydrates in this spec. */
function memoryStorage(): InputHistoryStorage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
}

/**
 * Mount a real composer editor and the history controller behind a
 * shortcuts-like fixed-input adapter.
 * @param arbitrate - the composer keymap's arbitration verdict for arrows.
 * @returns the editor, DOM, controller, and the draft the shell reports.
 */
function harness(arbitrate: () => 'pass' | 'consumed') {
  document.body.replaceChildren()
  const card = document.createElement('div')
  card.setAttribute('data-composer-card', '')
  card.setAttribute('data-composer-session-id', 's1')
  const root = document.createElement('div')
  // jsdom does not reflect the `contentEditable` property onto the attribute
  // that the real composer renders, so set the attribute the gesture reads.
  root.setAttribute('contenteditable', 'true')
  root.setAttribute('data-composer-input', '')
  card.append(root)
  document.body.append(card)

  const editor = createEditor({ namespace: 'input-history-integration', onError: (error) => { throw error } })
  editor.setRootElement(root)
  onTestFinished(() => { editor.setRootElement(null); card.remove() })
  onTestFinished(registerPlainText(editor))
  onTestFinished(registerComposerKeymap(editor, {
    arbitrate,
    space: () => false,
    dismissPopup: () => {},
    canSubmit: () => true,
    submit: () => {},
    intakeFiles: () => {},
    pasteText: () => {},
  }))
  editor.update(() => {
    $getRoot().append($createParagraphNode().append($createTextNode('draft text')))
  }, { discrete: true })
  const text = root.querySelector('[data-lexical-text="true"]')?.firstChild
  if (text === null || text === undefined) throw new Error('editor text not rendered')
  const range = document.createRange()
  range.setStart(text, 0)
  range.collapse(true)
  document.getSelection()?.removeAllRanges()
  document.getSelection()?.addRange(range)

  const state = createSnapshotStore({ draft: 'draft text', draftRev: 1, phase: 'plain' as const })
  const shells = new Map<SessionId, { state: typeof state; shell: SessionInput }>([[
    sid('s1'),
    {
      state,
      shell: {
        state,
        setDraft: (next: string) => {
          const current = state.getSnapshot()
          state.set({ ...current, draft: next, draftRev: current.draftRev + 1 })
        },
      } as never,
    },
  ]])
  const store = createInputHistoryStore({ storage: memoryStorage(), now: () => Date.UTC(2026, 10, 19) })
  store.record({ text: 'newest', sessionId: sid('s1'), projectKey: '/work/project', submittedAt: Date.UTC(2026, 10, 19) })
  store.record({ text: 'older', sessionId: sid('s1'), projectKey: '/work/project', submittedAt: Date.UTC(2026, 10, 18) })
  const sessions = {
    list: {
      getSnapshot: () => ({
        ids: [sid('s1')],
        byId: { [sid('s1')]: { cwd: '/work/project' } },
        phase: 'ready',
        projectionsBySession: {},
      }),
      subscribe: () => () => {},
    },
    scope: (id: SessionId) => ({ session: id }),
  } as never
  const conversation = {
    input: {
      for: (scope: { session: SessionId }) => {
        const shell = shells.get(scope.session)
        if (shell === undefined) throw new Error('no shell')
        return shell.shell
      },
    },
  } as never
  const controller = new InputHistoryController({ store, sessions, conversation })

  // The shortcuts adapter shape: observe window-bubbled keydown after the
  // composer's own root listener, compute region/gesture, and hand it over.
  const adapter = (event: KeyboardEvent): void => {
    const target = event.composedPath().find(value => value instanceof Element)
    if (!(target instanceof Element)) return
    controller.handleFixedInput({
      type: 'keydown',
      gesture: {
        code: event.code,
        control: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
        repeat: event.repeat,
        composing: event.isComposing,
        defaultPrevented: event.defaultPrevented,
      },
      context: { region: 'editable', modal: null, target },
      consume: () => { event.preventDefault() },
    })
  }
  window.addEventListener('keydown', adapter)
  onTestFinished(() => { window.removeEventListener('keydown', adapter) })

  return { editor, root, state, draft: () => state.getSnapshot().draft }
}

describe('input history over the real composer keymap', () => {
  it('recalls history on an unconsumed ArrowUp and consumes the DOM key', () => {
    const { root, draft } = harness(() => 'pass')
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true })
    root.dispatchEvent(event)

    expect(draft()).toBe('newest')
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves a menu-consumed ArrowUp to the composer', () => {
    const { root, draft } = harness(() => 'consumed')
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true })
    root.dispatchEvent(event)

    expect(draft()).toBe('draft text')
    expect(event.defaultPrevented).toBe(true)
  })
})
