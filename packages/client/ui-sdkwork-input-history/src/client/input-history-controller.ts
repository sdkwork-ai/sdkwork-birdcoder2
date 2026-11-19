/**
 * Composer recall gesture: ↑ walks older accepted inputs, ↓ walks back
 * toward the newest one and then restores the draft that was in progress
 * before recall started.
 *
 * The gesture rides the shortcuts service's fixed-input observation, so it
 * runs after every local composer handler: when the `/` or `@` menu consumed
 * an arrow, the keydown is already `defaultPrevented` and recall leaves it
 * alone. A fresh gesture only starts at the draft's document edge, so arrows
 * still move the caret inside a multi-line draft. While a recalled entry is
 * showing, the cursor lives in a per-Session browse state — typing anything
 * replaces the draft, and the next gesture starts a fresh walk.
 */

import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ShortcutFixedInput } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { AcceptedComposerInput, IConversation, SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  fallbackProjectKey, projectKeyOf, type InputHistoryScope, type InputHistoryStore,
} from './input-history-store.ts'
import {
  caretAtBoundary, composerEditable, composerInputOf, composerSessionIdOf,
} from './composer-target.ts'

/** Which way one recall gesture walks the ledger. */
type RecallDirection = 'previous' | 'next'

/** One Session's live recall position, discarded as soon as the walk ends. */
interface BrowseState {
  /** Index into the scope's newest-first entry list; null before the first recall. */
  cursor: number | null
  /** Scope the walk was built against; a different setting starts a fresh walk. */
  scope: InputHistoryScope
  /** Text this gesture wrote into the composer; a differing draft ends the walk. */
  appliedText: string | null
  /** Draft the user was writing before recall started, restored by ↓ past the newest entry. */
  draftBefore: string
}

/** Services and ledger the gesture needs; supplied by the plugin's apply. */
export interface InputHistoryControllerDeps {
  /** Durable ledger and recall preferences. */
  readonly store: InputHistoryStore
  /** Session catalog read for project grouping and scoped composer access. */
  readonly sessions: Pick<ISessions, 'list' | 'scope'>
  /** Scope-addressed composer facade registry. */
  readonly conversation: Pick<IConversation, 'input'>
}

/**
 * Which way a physical key walks history.
 * @param code - physical key code from the gesture.
 * @returns the walk direction, or undefined for every other key.
 */
function recallDirection(code: string): RecallDirection | undefined {
  if (code === 'ArrowUp') return 'previous'
  if (code === 'ArrowDown') return 'next'
  return undefined
}

/** Composer recall for every Session in this window. */
export class InputHistoryController {
  private readonly browsers = new Map<SessionId, BrowseState>()

  /**
   * @param deps - ledger, Session catalog, and composer registry.
   */
  constructor(private readonly deps: InputHistoryControllerDeps) {}

  /**
   * Apply one observed keydown. Only a bare, non-composing arrow inside an
   * editable, Session-bound composer that no local handler consumed acts.
   * @param input - fixed keyboard input from the shortcuts service.
   */
  handleFixedInput(input: ShortcutFixedInput): void {
    if (input.type !== 'keydown') return
    const { gesture, context } = input
    const direction = recallDirection(gesture.code)
    if (direction === undefined) return
    if (gesture.control || gesture.alt || gesture.meta || gesture.shift) return
    if (gesture.composing || gesture.defaultPrevented) return
    if (context.region !== 'editable') return
    // A modal owns the keyboard while it is open; the composer behind it is not
    // a recall target even if a stale focus target says otherwise.
    if (context.modal !== null) return
    const root = composerInputOf(context.target)
    const sessionId = composerSessionIdOf(context.target)
    if (root === null || sessionId === undefined || !composerEditable(root)) return
    const settings = this.deps.store.state.getSnapshot().settings
    if (!settings.enabled) return
    const shell = this.shellFor(sessionId)
    if (shell === undefined) return
    const inputState = shell.state.getSnapshot()
    // A frozen composer (adjudicating/submitting/sending) or a command chip
    // owns the draft; recall must never rewrite it from under the transaction.
    if (inputState.phase !== 'plain') return
    const draft = inputState.draft
    let browsing = this.browsers.get(sessionId)
    const continuing = browsing !== undefined
      && browsing.scope === settings.scope
      && browsing.appliedText !== null
      && browsing.appliedText === draft
    if (!continuing) {
      // Typed content, a scope change, or a fresh composer ends the previous walk.
      this.browsers.delete(sessionId)
      if (!startsAtBoundary(root, direction, draft)) return
      browsing = { cursor: null, scope: settings.scope, appliedText: null, draftBefore: draft }
    } else if (!atDocumentEdge(root)) {
      // While a recalled entry shows, arrows still move the caret inside it:
      // only an edge press continues the walk.
      return
    }
    // Entry lookup and sorting happen only for a key that can actually act.
    const entries = this.deps.store.entriesFor(settings.scope, {
      sessionId,
      projectKey: this.projectKeyFor(sessionId),
    })
    if (entries.length === 0) {
      this.browsers.delete(sessionId)
      return
    }
    /* v8 ignore next -- the fresh branch above always assigns a walk */
    if (browsing === undefined) return
    if (direction === 'previous') {
      const cursor = browsing.cursor === null ? 0 : Math.min(browsing.cursor + 1, entries.length - 1)
      if (browsing.cursor !== null && cursor === browsing.cursor) {
        // Already at the oldest entry: keep the caret still instead of
        // jumping to the top of the recalled text.
        input.consume()
        return
      }
      this.apply(shell, input, sessionId, browsing, entries[cursor].text, cursor)
      return
    }
    if (browsing.cursor === null) return
    if (browsing.cursor > 0) {
      const cursor = browsing.cursor - 1
      this.apply(shell, input, sessionId, browsing, entries[cursor].text, cursor)
      return
    }
    // ↓ past the newest entry returns the draft that recall interrupted.
    this.browsers.delete(sessionId)
    shell.setDraft(browsing.draftBefore)
    input.consume()
  }

  /**
   * Remember one Host-accepted message and end that Session's active walk.
   * Recording is skipped while the feature is disabled.
   * @param input - accepted Session, text, and acceptance time.
   */
  recordAccepted(input: AcceptedComposerInput): void {
    if (!this.deps.store.state.getSnapshot().settings.enabled) return
    this.deps.store.record({
      text: input.text,
      sessionId: input.sessionId,
      projectKey: this.projectKeyFor(input.sessionId),
      submittedAt: input.submittedAt,
    })
    this.browsers.delete(input.sessionId)
  }

  /**
   * Drop entries past retention without waiting for a gesture.
   * @param at - clock reading to compare against; defaults to the store clock.
   */
  purgeExpired(at?: number): void {
    this.deps.store.purgeExpired(at)
  }

  /** Forget every live walk, as after a settings change. */
  reset(): void {
    this.browsers.clear()
  }

  /** Write one recalled entry into the composer and consume the key. */
  private apply(
    shell: SessionInput,
    input: Extract<ShortcutFixedInput, { type: 'keydown' }>,
    sessionId: SessionId,
    browsing: BrowseState,
    text: string,
    cursor: number,
  ): void {
    browsing.cursor = cursor
    browsing.appliedText = text
    this.browsers.set(sessionId, browsing)
    shell.setDraft(text)
    input.consume()
  }

  /** Resolve one Session's composer facade without throwing across a detached scope. */
  private shellFor(sessionId: SessionId): SessionInput | undefined {
    const scope = this.deps.sessions.scope(sessionId)
    if (scope === undefined) return undefined
    try {
      return this.deps.conversation.input.for(scope)
    } catch {
      // The composer was disposed between the keydown and the facade lookup.
      return undefined
    }
  }

  /** Project key one Session's accepted inputs group under. */
  private projectKeyFor(sessionId: SessionId): string {
    // The catalog's index signature promises every id; a stale or partial list
    // can still miss one, and that Session then groups under its own key.
    const byId = this.deps.sessions.list.getSnapshot().byId
    const cwd = Object.hasOwn(byId, sessionId) ? byId[sessionId].cwd : undefined
    const key = projectKeyOf(cwd)
    return key === '' ? fallbackProjectKey(sessionId) : key
  }
}

/**
 * Whether a fresh walk may start from the caret's current position.
 * @param root - composer contenteditable.
 * @param direction - walk direction the key asks for.
 * @param draft - current composer text.
 * @returns true for an empty draft, or when the caret touches the asking edge.
 */
function startsAtBoundary(root: HTMLElement, direction: RecallDirection, draft: string): boolean {
  if (draft === '') return true
  return caretAtBoundary(root, direction === 'previous' ? 'start' : 'end')
}

/**
 * Whether the caret sits at either document edge while a recalled entry shows.
 * Recall writes the draft with the caret at the end; a user who then moves into
 * the middle is moving the caret, not asking for another entry.
 * @param root - composer contenteditable.
 * @returns true at the start or the end of the document.
 */
function atDocumentEdge(root: HTMLElement): boolean {
  return caretAtBoundary(root, 'start') || caretAtBoundary(root, 'end')
}
