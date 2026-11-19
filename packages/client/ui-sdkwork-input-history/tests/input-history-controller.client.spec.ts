// @vitest-environment jsdom
/**
 * Gesture coverage for the input-history controller: the arrow guards
 * (composing, modifiers, consumed keys, caret edges, disabled feature), the
 * scope walks, draft restoration, and accepted-message recording.
 *
 * The composer is a real contenteditable inside a Session-named card, because
 * the controller resolves both from the DOM; the Session input facade is a
 * snapshot store stub, so the spec observes exactly the draft writes the
 * gesture performs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IConversation, InputState, SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ShortcutFixedInput, ShortcutGesture } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { InputHistoryController } from '../src/client/input-history-controller.ts'
import {
  createInputHistoryStore, type InputHistoryStorage, type InputHistoryStore,
} from '../src/client/input-history-store.ts'

/** A Session id brand for test fixtures. */
function sid(id: string): SessionId {
  return id as SessionId
}

/** Memory storage; the controller spec never rehydrates. */
function memoryStorage(): InputHistoryStorage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
}

/** A composer shell whose only real behavior is the draft/phase store. */
function shellOf(draft: string): {
  shell: SessionInput
  state: SnapshotStore<{ draft: string; draftRev: number; phase: InputState['phase'] }>
} {
  const state = createSnapshotStore({ draft, draftRev: 1, phase: 'plain' as const })
  return {
    state,
    shell: {
      state,
      setDraft: (text: string) => {
        const current = state.getSnapshot()
        state.set({ ...current, draft: text, draftRev: current.draftRev + 1 })
      },
    } as never,
  }
}

/** The composer DOM one Session's keydown targets. */
interface Composer {
  readonly card: HTMLElement
  readonly input: HTMLElement
  readonly text: Text
}

/** Mount one composer card/editable pair and return its nodes. */
function mountComposer(sessionId: string, draft = ''): Composer {
  document.body.replaceChildren()
  const card = document.createElement('div')
  card.setAttribute('data-composer-card', '')
  card.setAttribute('data-composer-session-id', sessionId)
  const input = document.createElement('div')
  input.setAttribute('data-composer-input', '')
  input.setAttribute('contenteditable', 'true')
  const text = document.createTextNode(draft)
  input.append(text)
  card.append(input)
  document.body.append(card)
  return { card, input, text }
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

/** One fixed keyboard input aimed at a composer. */
function keydown(composer: Composer, code: string, extra: Partial<ShortcutGesture> = {},
  region: 'page' | 'editable' | 'terminal' = 'editable', modal: string | null = null): {
  input: ShortcutFixedInput
  consume: ReturnType<typeof vi.fn>
} {
  const consume = vi.fn()
  const input: ShortcutFixedInput = {
    type: 'keydown',
    gesture: {
      code,
      control: false,
      alt: false,
      shift: false,
      meta: false,
      repeat: false,
      composing: false,
      defaultPrevented: false,
      ...extra,
    },
    context: { region, modal, target: composer.input },
    consume,
  }
  return { input, consume }
}

/** Bench: one ledger, one controller, and three Session shells. */
function bench(options: { now?: () => number } = {}) {
  let clock = options.now ?? (() => Date.UTC(2026, 10, 19))
  const store: InputHistoryStore = createInputHistoryStore({
    storage: memoryStorage(),
    now: () => clock(),
  })
  const shells = new Map<SessionId, ReturnType<typeof shellOf>>([
    [sid('s1'), shellOf('draft one')],
    [sid('s2'), shellOf('')],
    [sid('s3'), shellOf('')],
  ])
  const sessions: ISessions = {
    list: {
      getSnapshot: () => ({
        ids: [...shells.keys()],
        byId: {
          [sid('s1')]: { cwd: '/work/project-a' },
          [sid('s2')]: { cwd: '/work/project-a' },
          [sid('s3')]: { cwd: '/work/project-b' },
        },
        phase: 'ready',
        projectionsBySession: {},
      }),
      subscribe: () => () => {},
    },
    scope: (id: SessionId) => ({ session: id }),
  } as never
  const conversation: IConversation = {
    input: {
      for: (scope: { session: SessionId }) => {
        const shell = shells.get(scope.session)
        if (shell === undefined) throw new Error('no shell')
        return shell.shell
      },
    },
  } as never
  const controller = new InputHistoryController({ store, sessions, conversation })
  return {
    store,
    controller,
    shells,
    sessions,
    conversation,
    setClock(value: () => number) { clock = value },
  }
}

/** Seed three messages: s1 twice in project A, s3 once in project B. */
function seed(store: InputHistoryStore, at = Date.UTC(2026, 10, 19)): void {
  store.record({ text: 'oldest', sessionId: sid('s1'), projectKey: '/work/project-a', submittedAt: at - 3_000 })
  store.record({ text: 'middle', sessionId: sid('s2'), projectKey: '/work/project-a', submittedAt: at - 2_000 })
  store.record({ text: 'newest', sessionId: sid('s1'), projectKey: '/work/project-a', submittedAt: at - 1_000 })
  store.record({ text: 'elsewhere', sessionId: sid('s3'), projectKey: '/work/project-b', submittedAt: at })
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('input history gesture', () => {
  it('recalls the newest session message from the start of the draft and consumes the key', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', 'draft one')
    setCaret(composer.text, 0)

    const { input, consume } = keydown(composer, 'ArrowUp')
    controller.handleFixedInput(input)

    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('newest')
    expect(consume).toHaveBeenCalledOnce()
  })

  it('walks older entries, stops at the oldest, and restores the draft past the newest', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', 'my draft')
    shells.get(sid('s1'))?.shell.setDraft('my draft')
    setCaret(composer.text, 0)
    const draft = () => shells.get(sid('s1'))?.state.getSnapshot().draft

    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    expect(draft()).toBe('newest')
    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    expect(draft()).toBe('oldest')
    // Session scope has two entries for s1; the next Up stays on the oldest.
    const atOldest = keydown(composer, 'ArrowUp')
    controller.handleFixedInput(atOldest.input)
    expect(draft()).toBe('oldest')
    expect(atOldest.consume).toHaveBeenCalledOnce()
    const pastOldest = keydown(composer, 'ArrowUp')
    controller.handleFixedInput(pastOldest.input)
    expect(draft()).toBe('oldest')

    controller.handleFixedInput(keydown(composer, 'ArrowDown').input)
    expect(draft()).toBe('newest')
    controller.handleFixedInput(keydown(composer, 'ArrowDown').input)
    expect(draft()).toBe('my draft')
  })

  it('leaves arrows that move the caret inside a non-empty draft alone', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', 'hello')
    setCaret(composer.text, 2)

    const up = keydown(composer, 'ArrowUp')
    controller.handleFixedInput(up.input)
    expect(up.consume).not.toHaveBeenCalled()
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('draft one')

    const down = keydown(composer, 'ArrowDown')
    controller.handleFixedInput(down.input)
    expect(down.consume).not.toHaveBeenCalled()
  })

  it('ignores keys the composer already consumed, composing keys, and modifier chords', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)
    const draft = () => shells.get(sid('s1'))?.state.getSnapshot().draft

    for (const extra of [
      { defaultPrevented: true },
      { composing: true },
      { shift: true },
      { control: true },
      { alt: true },
      { meta: true },
    ] as const) {
      const key = keydown(composer, 'ArrowUp', extra)
      controller.handleFixedInput(key.input)
      expect(key.consume).not.toHaveBeenCalled()
    }
    expect(draft()).toBe('draft one')
  })

  it('ignores keys outside an editable, Session-bound composer', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', '')
    composer.input.setAttribute('contenteditable', 'false')
    setCaret(composer.text, 0)

    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('draft one')

    composer.input.setAttribute('contenteditable', 'true')
    composer.card.removeAttribute('data-composer-session-id')
    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('draft one')
  })

  it('leaves the caret free inside a recalled multi-line draft', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)
    const draft = () => shells.get(sid('s1'))?.state.getSnapshot().draft

    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    expect(draft()).toBe('newest')
    // Recall leaves the caret at the end; a user who then moves into the
    // middle is editing the entry, not asking for another one.
    composer.text.data = 'newest'
    setCaret(composer.text, 3)
    const move = keydown(composer, 'ArrowUp')
    controller.handleFixedInput(move.input)

    expect(move.consume).not.toHaveBeenCalled()
    expect(draft()).toBe('newest')
  })

  it('walks the project or global ledger when the settings ask for it', () => {
    const { store, controller, shells } = bench()
    seed(store)

    store.updateSettings({ scope: 'project' })
    const projectComposer = mountComposer('s1', '')
    setCaret(projectComposer.text, 0)
    controller.handleFixedInput(keydown(projectComposer, 'ArrowUp').input)
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('newest')
    controller.handleFixedInput(keydown(projectComposer, 'ArrowUp').input)
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('middle')

    store.updateSettings({ scope: 'global' })
    const globalComposer = mountComposer('s1', '')
    setCaret(globalComposer.text, 0)
    controller.handleFixedInput(keydown(globalComposer, 'ArrowUp').input)
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('elsewhere')
  })

  it('starts a fresh walk when the user typed after a recall', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)
    const draft = () => shells.get(sid('s1'))?.state.getSnapshot().draft

    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    expect(draft()).toBe('oldest')

    shells.get(sid('s1'))?.shell.setDraft('typed over it')
    setCaret(composer.text, 0)
    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    expect(draft()).toBe('newest')
  })

  it('does nothing while the composer is frozen by a submission', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)
    const shell = shells.get(sid('s1'))
    shell?.state.set({ ...shell.state.getSnapshot(), phase: 'sending' })

    const key = keydown(composer, 'ArrowUp')
    controller.handleFixedInput(key.input)

    expect(key.consume).not.toHaveBeenCalled()
    expect(shell?.state.getSnapshot().draft).toBe('draft one')
  })

  it('ignores resets, non-arrow keys, and keys outside the editable region', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)
    const draft = () => shells.get(sid('s1'))?.state.getSnapshot().draft

    controller.handleFixedInput({ type: 'reset' })
    controller.handleFixedInput(keydown(composer, 'Enter').input)
    const page = keydown(composer, 'ArrowUp', {}, 'page')
    controller.handleFixedInput(page.input)
    const modal = keydown(composer, 'ArrowUp', {}, 'editable', 'settings')
    controller.handleFixedInput(modal.input)

    expect(page.consume).not.toHaveBeenCalled()
    expect(modal.consume).not.toHaveBeenCalled()
    expect(draft()).toBe('draft one')
  })

  it('ignores keys when the Session or its composer facade is gone', () => {
    const { store, controller, sessions, conversation, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)
    vi.spyOn(sessions, 'scope').mockReturnValueOnce(undefined)
    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)
    vi.spyOn(conversation.input, 'for').mockImplementationOnce(() => { throw new Error('composer gone') })
    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)

    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('draft one')
  })

  it('does nothing forward before an entry was recalled', () => {
    const { store, controller, shells } = bench()
    seed(store)
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)

    const key = keydown(composer, 'ArrowDown')
    controller.handleFixedInput(key.input)

    expect(key.consume).not.toHaveBeenCalled()
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('draft one')
  })

  it('does nothing when the scope has no ledger entries', () => {
    const { controller, shells } = bench()
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)

    const key = keydown(composer, 'ArrowUp')
    controller.handleFixedInput(key.input)

    expect(key.consume).not.toHaveBeenCalled()
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('draft one')
  })

  it('recalls from an empty composer', () => {
    const { store, controller, shells } = bench()
    store.record({ text: 'empty-draft recall', sessionId: sid('s2'), projectKey: '/work/project', submittedAt: Date.UTC(2026, 10, 19) })
    const composer = mountComposer('s2', '')
    setCaret(composer.text, 0)

    controller.handleFixedInput(keydown(composer, 'ArrowUp').input)

    expect(shells.get(sid('s2'))?.state.getSnapshot().draft).toBe('empty-draft recall')
  })

  it('does nothing while the feature is disabled', () => {
    const { store, controller, shells } = bench()
    seed(store)
    store.updateSettings({ enabled: false })
    const composer = mountComposer('s1', '')
    setCaret(composer.text, 0)

    const key = keydown(composer, 'ArrowUp')
    controller.handleFixedInput(key.input)

    expect(key.consume).not.toHaveBeenCalled()
    expect(shells.get(sid('s1'))?.state.getSnapshot().draft).toBe('draft one')
  })
})

describe('input history recording', () => {
  it('records an accepted message under the Session project and resets the walk', () => {
    const { store, controller } = bench()
    controller.recordAccepted({ sessionId: sid('s1'), text: 'remember me', submittedAt: Date.UTC(2026, 10, 19) })

    const entries = store.entriesFor('session', { sessionId: sid('s1'), projectKey: '/work/project-a' })
    expect(entries.map(entry => entry.text)).toEqual(['remember me'])
    expect(entries[0]?.projectKey).toBe('/work/project-a')
    expect(entries[0]?.submittedAt).toBe(Date.UTC(2026, 10, 19))
  })

  it('records nothing while disabled and ignores a blank message', () => {
    const { store, controller } = bench()
    controller.recordAccepted({ sessionId: sid('s1'), text: '   ', submittedAt: 1 })
    expect(store.state.getSnapshot().entries).toEqual([])

    store.updateSettings({ enabled: false })
    controller.recordAccepted({ sessionId: sid('s1'), text: 'later', submittedAt: 2 })
    expect(store.state.getSnapshot().entries).toEqual([])
  })

  it('falls back to a Session-unique project key when the directory is unknown', () => {
    const { store, controller } = bench()
    controller.recordAccepted({ sessionId: sid('unknown'), text: 'no directory', submittedAt: 1 })

    expect(store.state.getSnapshot().entries[0]?.projectKey).toBe('session:unknown')
  })

  it('drops entries after retention when asked to purge', () => {
    const { store, controller } = bench({ now: () => Date.UTC(2026, 10, 19) })
    controller.recordAccepted({ sessionId: sid('s1'), text: 'old', submittedAt: Date.UTC(2026, 9, 1) })
    expect(store.state.getSnapshot().entries).toHaveLength(1)

    controller.purgeExpired()
    expect(store.state.getSnapshot().entries).toEqual([])
  })
})
