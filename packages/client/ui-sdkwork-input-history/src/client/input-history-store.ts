/**
 * Durable input-history ledger behind the composer's ↑/↓ recall.
 *
 * The ledger is browser-local: one localStorage document holding the accepted
 * composer messages plus the user's recall preferences. Nothing here reaches
 * the Host, and the model never sees it. Entries are pruned against the
 * configured retention on every read/write path, so an expired record cannot
 * be recalled even when the hourly sweep has not run yet.
 *
 * Scope is chosen at read time, never stored per entry: one entry carries the
 * Session that sent it and the project key that Session reported, and the
 * settings decide which slice the ↑/↓ gesture walks. Switching scope therefore
 * needs no migration and cannot lose history.
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** localStorage key owning the whole ledger. */
export const INPUT_HISTORY_STORAGE_KEY = 'dsh.inputHistory.v1'

/** Document revision; a stored document under any other revision is discarded. */
export const INPUT_HISTORY_SCHEMA_VERSION = 1

/** Recall scope: this Session, this project, or every Session on this browser. */
export type InputHistoryScope = 'session' | 'project' | 'global'

/** User-owned recall preferences. */
export interface InputHistorySettings {
  /** Whether the composer records and recalls inputs at all. */
  readonly enabled: boolean
  /** Which slice of the ledger the ↑/↓ gesture walks. */
  readonly scope: InputHistoryScope
  /** Days an entry stays recallable; older entries are cleared automatically. */
  readonly retentionDays: number
}

/** One accepted composer message remembered for recall. */
export interface InputHistoryEntry {
  /** Stable identity for rendering and de-duplication within the ledger. */
  readonly id: string
  /** Message text exactly as the user sent it. */
  readonly text: string
  /** Session that sent the message. */
  readonly sessionId: SessionId
  /** Project key the Session reported at acceptance; `session:<id>` when it reported none. */
  readonly projectKey: string
  /** Browser clock at acceptance, epoch milliseconds. */
  readonly submittedAt: number
}

/** The whole persisted ledger. */
export interface InputHistoryState {
  /** User-owned recall preferences. */
  readonly settings: InputHistorySettings
  /** Recallable entries, oldest first. */
  readonly entries: readonly InputHistoryEntry[]
}

/** Scope-addressed read inputs for one composer. */
export interface InputHistoryTarget {
  /** Session owning the focused composer. */
  readonly sessionId: SessionId
  /** Project key of that Session. */
  readonly projectKey: string
}

/** One message to remember. */
export interface InputHistoryRecord {
  /** Message text as sent; blank drafts are never recorded. */
  readonly text: string
  /** Session that sent it. */
  readonly sessionId: SessionId
  /** Project key of that Session. */
  readonly projectKey: string
  /** Acceptance time; defaults to the store clock. */
  readonly submittedAt?: number
}

/** Storage face the ledger persists through (localStorage in the browser). */
export interface InputHistoryStorage {
  /**
   * @param key - storage key.
   * @returns the stored document, or null when absent.
   */
  getItem(key: string): string | null
  /**
   * @param key - storage key.
   * @param value - document text.
   */
  setItem(key: string, value: string): void
  /**
   * @param key - storage key.
   */
  removeItem(key: string): void
}

/** Read/write face of the input-history ledger. */
export interface InputHistoryStore {
  /** Observable ledger; settings pages and diagnostics read it through `use<Name>`. */
  readonly state: SnapshotStore<InputHistoryState>
  /**
   * Remember one accepted message: expired entries leave, an identical
   * re-send for the same Session replaces its previous entry, and the ledger
   * keeps at most {@link MAX_HISTORY_ENTRIES} entries.
   * @param input - message, owning Session, project key, and acceptance time.
   */
  record(input: InputHistoryRecord): void
  /**
   * Merge user preferences; an omitted field keeps its current value, and an
   * out-of-range retention clamps to the supported window.
   * @param patch - fields to change.
   */
  updateSettings(patch: Partial<InputHistorySettings>): void
  /** Drop every entry, keeping the preferences. */
  clear(): void
  /**
   * Drop entries older than the current retention.
   * @param at - clock reading to compare against; defaults to the store clock.
   */
  purgeExpired(at?: number): void
  /**
   * Recallable entries for one scope, most recent first.
   * @param scope - recall scope.
   * @param target - focused composer's Session and project key.
   * @param at - clock reading to compare against; defaults to the store clock.
   * @returns the entries the gesture should walk, newest first.
   */
  entriesFor(scope: InputHistoryScope, target: InputHistoryTarget, at?: number): readonly InputHistoryEntry[]
}

/** Shipped preferences: enabled, Session scope, thirty-day retention. */
export const DEFAULT_INPUT_HISTORY_SETTINGS: InputHistorySettings = Object.freeze({
  enabled: true,
  scope: 'session',
  retentionDays: 30,
})

/** Shortest selectable retention. */
export const MIN_RETENTION_DAYS = 1

/** Longest selectable retention. */
export const MAX_RETENTION_DAYS = 365

/** Most entries one ledger keeps, across every Session. */
export const MAX_HISTORY_ENTRIES = 500

/** Longest message text the ledger stores; longer prompts are not recall candidates. */
export const MAX_HISTORY_TEXT_LENGTH = 100_000

/**
 * Total text budget for the whole ledger. The entry ceiling alone is not a
 * byte bound: 500 messages of the per-entry maximum would overflow browser
 * storage and make every save pay for megabytes of JSON. The oldest entries
 * leave first, so recall keeps the most recent phrasing.
 */
export const MAX_HISTORY_TOTAL_TEXT_LENGTH = 500_000

/**
 * Longest stored document the store will parse. The ledger's own budget keeps
 * it far below this; the guard only protects startup from a corrupted or
 * foreign document that would otherwise block the main thread in `JSON.parse`.
 */
export const MAX_STORED_DOCUMENT_LENGTH = 2_000_000

/** Milliseconds in one retention day. */
const DAY_MS = 86_400_000

/** Options for {@link createInputHistoryStore}. */
export interface InputHistoryStoreOptions {
  /** Storage to persist through; absent resolves the browser's localStorage. */
  readonly storage?: InputHistoryStorage | undefined
  /** Clock used for retention; defaults to `Date.now`. */
  readonly now?: (() => number) | undefined
  /** Storage key; defaults to {@link INPUT_HISTORY_STORAGE_KEY}. */
  readonly key?: string | undefined
}

/**
 * Keep the newest entries that fit the per-entry and total text budgets.
 * @param entries - chronological entries, oldest first.
 * @returns the surviving suffix, oldest first.
 */
function capEntries(entries: readonly InputHistoryEntry[]): InputHistoryEntry[] {
  let total = 0
  const kept: InputHistoryEntry[] = []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (kept.length >= MAX_HISTORY_ENTRIES) break
    // Always keep the newest entry, even at the (currently unreachable) point
    // where its own text exceeds the total budget.
    if (kept.length > 0 && total + entry.text.length > MAX_HISTORY_TOTAL_TEXT_LENGTH) break
    total += entry.text.length
    kept.push(entry)
  }
  kept.reverse()
  return kept
}

/**
 * Project key one Session's history is grouped under: its working directory
 * with trailing separators removed, lower-cased when the path is a Windows
 * path (drive-letter or backslash) so one project cannot split across
 * separator or case variants. An absent directory narrows the project scope to
 * the Session itself.
 * @param cwd - Session working directory, when the Host list reported one.
 * @returns the project key, empty when the directory is unknown.
 */
export function projectKeyOf(cwd: string | undefined): string {
  const path = cwd?.trim() ?? ''
  if (path === '') return ''
  const trimmed = path.replace(/[\\/]+$/u, '')
  const windows = trimmed.includes('\\') || /^[a-z]:[\\/]/iu.test(trimmed)
  return windows ? trimmed.toLowerCase() : trimmed
}

/**
 * Project key for a Session with no Host-reported directory.
 * @param sessionId - Session identity.
 * @returns a key unique to that Session, so project scope never mixes strangers.
 */
export function fallbackProjectKey(sessionId: SessionId): string {
  return `session:${sessionId}`
}

/** @returns whether a parsed JSON value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Clamp and round one retention value.
 * @param value - candidate from storage or a settings write.
 * @returns a whole number of days inside the supported window.
 */
export function normalizeRetentionDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_INPUT_HISTORY_SETTINGS.retentionDays
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.round(value)))
}

/**
 * Fold untrusted settings onto the supported vocabulary.
 * @param value - stored or submitted settings value.
 * @returns complete, valid settings.
 */
function normalizeSettings(value: unknown): InputHistorySettings {
  const record = isRecord(value) ? value : {}
  const scope = record.scope
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_INPUT_HISTORY_SETTINGS.enabled,
    scope: scope === 'project' || scope === 'global' || scope === 'session'
      ? scope
      : DEFAULT_INPUT_HISTORY_SETTINGS.scope,
    retentionDays: normalizeRetentionDays(record.retentionDays),
  }
}

/**
 * Fold one untrusted entry onto the ledger shape; anything malformed is dropped.
 * @param value - stored entry value.
 * @returns the valid entry, or undefined.
 */
function normalizeEntry(value: unknown): InputHistoryEntry | undefined {
  if (!isRecord(value)) return undefined
  const { id, text, sessionId, projectKey, submittedAt } = value
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_HISTORY_TEXT_LENGTH) return undefined
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  if (typeof projectKey !== 'string' || projectKey === '') return undefined
  if (typeof submittedAt !== 'number' || !Number.isFinite(submittedAt)) return undefined
  return {
    id,
    text,
    sessionId: sessionId as SessionId,
    projectKey,
    submittedAt,
  }
}

/**
 * Read the page's localStorage without failing under privacy modes.
 * @returns the storage face, or undefined when the page exposes none.
 */
function browserStorage(): InputHistoryStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/**
 * Create the input-history ledger.
 * @param options - storage, clock, and key overrides for tests and embeds.
 * @returns the read/write face used by the keyboard controller and settings page.
 */
export function createInputHistoryStore(options: InputHistoryStoreOptions = {}): InputHistoryStore {
  const storage = options.storage ?? browserStorage()
  const key = options.key ?? INPUT_HISTORY_STORAGE_KEY
  const now = options.now ?? (() => Date.now())
  let sequence = 0

  const read = (): InputHistoryState => {
    if (storage === undefined) return { settings: DEFAULT_INPUT_HISTORY_SETTINGS, entries: [] }
    let parsed: unknown
    try {
      const raw = storage.getItem(key)
      if (raw === null) return { settings: DEFAULT_INPUT_HISTORY_SETTINGS, entries: [] }
      if (raw.length > MAX_STORED_DOCUMENT_LENGTH) return { settings: DEFAULT_INPUT_HISTORY_SETTINGS, entries: [] }
      parsed = JSON.parse(raw)
    } catch {
      return { settings: DEFAULT_INPUT_HISTORY_SETTINGS, entries: [] }
    }
    if (!isRecord(parsed) || parsed.schemaVersion !== INPUT_HISTORY_SCHEMA_VERSION) {
      return { settings: DEFAULT_INPUT_HISTORY_SETTINGS, entries: [] }
    }
    const settings = normalizeSettings(parsed.settings)
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.map(normalizeEntry).filter((entry): entry is InputHistoryEntry => entry !== undefined)
      : []
    const cutoff = now() - settings.retentionDays * DAY_MS
    return {
      settings,
      entries: capEntries(
        entries
          .filter(entry => entry.submittedAt >= cutoff)
          .sort((left, right) => left.submittedAt - right.submittedAt)
          .slice(-MAX_HISTORY_ENTRIES),
      ),
    }
  }

  const state = createSnapshotStore<InputHistoryState>(read())

  const persist = (next: InputHistoryState): void => {
    if (storage === undefined) return
    try {
      storage.setItem(key, JSON.stringify({ schemaVersion: INPUT_HISTORY_SCHEMA_VERSION, ...next }))
    } catch (error) {
      // A full or blocked storage must not break the composer; recall simply
      // stops surviving reloads until storage works again.
      console.error('[ui-sdkwork-input-history] history could not be saved', error)
    }
  }

  // Rehydrated entries past their retention are cleared for good at boot, not
  // merely hidden from the next recall.
  persist(state.getSnapshot())

  const write = (next: InputHistoryState): void => {
    persist(next)
    state.set(next)
  }

  const prune = (entries: readonly InputHistoryEntry[], settings: InputHistorySettings, at: number): InputHistoryEntry[] => {
    const cutoff = at - settings.retentionDays * DAY_MS
    return capEntries(entries.filter(entry => entry.submittedAt >= cutoff).slice(-MAX_HISTORY_ENTRIES))
  }

  const current = (): InputHistoryState => state.getSnapshot()

  return {
    state,
    record: (input) => {
      const text = input.text
      if (text.trim() === '' || text.length > MAX_HISTORY_TEXT_LENGTH) return
      const submittedAt = input.submittedAt ?? now()
      const ledger = current()
      const cutoff = now() - ledger.settings.retentionDays * DAY_MS
      // One pass drops expired entries and the previous identical send; the
      // final cap enforces both the entry ceiling and the text budget.
      const retained = ledger.entries.filter(entry => entry.submittedAt >= cutoff
        && !(entry.sessionId === input.sessionId && entry.text === text))
      sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER
      retained.push({
        id: `${input.sessionId}:${submittedAt.toString(36)}:${sequence.toString(36)}`,
        text,
        sessionId: input.sessionId,
        projectKey: input.projectKey === '' ? fallbackProjectKey(input.sessionId) : input.projectKey,
        submittedAt,
      })
      write({ settings: ledger.settings, entries: capEntries(retained) })
    },
    updateSettings: (patch) => {
      const ledger = current()
      const next = normalizeSettings({
        enabled: patch.enabled ?? ledger.settings.enabled,
        scope: patch.scope ?? ledger.settings.scope,
        retentionDays: patch.retentionDays ?? ledger.settings.retentionDays,
      })
      if (next.enabled === ledger.settings.enabled
        && next.scope === ledger.settings.scope
        && next.retentionDays === ledger.settings.retentionDays) return
      write({ settings: next, entries: prune(ledger.entries, next, now()) })
    },
    clear: () => {
      const ledger = current()
      if (ledger.entries.length === 0) return
      write({ settings: ledger.settings, entries: [] })
    },
    purgeExpired: (at = now()) => {
      const ledger = current()
      const entries = prune(ledger.entries, ledger.settings, at)
      if (entries.length === ledger.entries.length) return
      write({ settings: ledger.settings, entries })
    },
    entriesFor: (scope, target, at = now()) => {
      const ledger = current()
      const cutoff = at - ledger.settings.retentionDays * DAY_MS
      return ledger.entries
        .filter((entry) => {
          if (entry.submittedAt < cutoff) return false
          switch (scope) {
            case 'session': return entry.sessionId === target.sessionId
            case 'project': return entry.projectKey === target.projectKey
            case 'global': return true
          }
        })
        .sort((left, right) => right.submittedAt - left.submittedAt || right.id.localeCompare(left.id))
    },
  }
}
