/**
 * Ledger coverage for the input-history store: shipped defaults, scope reads,
 * de-duplication, the entry ceiling, retention pruning (including at
 * rehydration), settings normalization, and persistence round-trips.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  DEFAULT_INPUT_HISTORY_SETTINGS, INPUT_HISTORY_STORAGE_KEY, MAX_HISTORY_ENTRIES, MAX_HISTORY_TOTAL_TEXT_LENGTH,
  MAX_RETENTION_DAYS, MAX_STORED_DOCUMENT_LENGTH, MIN_RETENTION_DAYS, createInputHistoryStore, normalizeRetentionDays,
  projectKeyOf, type InputHistoryStorage,
} from '../src/client/input-history-store.ts'

const DAY_MS = 86_400_000

/** A Session id brand for test fixtures. */
function sid(id: string): SessionId {
  return id as SessionId
}

/** Memory storage the ledger persists through. */
function memoryStorage(): InputHistoryStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
}

/** A store over a controllable clock and memory storage. */
function bench(start = Date.UTC(2026, 10, 19), storage = memoryStorage()) {
  let clock = start
  const store = createInputHistoryStore({ storage, now: () => clock })
  return {
    store,
    storage,
    advance: (ms: number) => { clock += ms },
    clock: () => clock,
    at: (offsetMs: number) => start + offsetMs,
  }
}

describe('input history store', () => {
  it('ships Session scope, enabled recall, and a thirty-day retention', () => {
    const { store } = bench()

    expect(store.state.getSnapshot().settings).toEqual({
      enabled: true,
      scope: 'session',
      retentionDays: 30,
    })
    expect(store.state.getSnapshot().entries).toEqual([])
  })

  it('reads one entry by session, project, or every session', () => {
    const { store, at } = bench()
    store.record({ text: 'first', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(1_000) })
    store.record({ text: 'second', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(2_000) })
    store.record({ text: 'other project', sessionId: sid('s2'), projectKey: 'p2', submittedAt: at(3_000) })

    const session = store.entriesFor('session', { sessionId: sid('s1'), projectKey: 'p1' })
    expect(session.map(entry => entry.text)).toEqual(['second', 'first'])

    const project = store.entriesFor('project', { sessionId: sid('s1'), projectKey: 'p1' })
    expect(project.map(entry => entry.text)).toEqual(['second', 'first'])

    const global = store.entriesFor('global', { sessionId: sid('s1'), projectKey: 'p1' })
    expect(global.map(entry => entry.text)).toEqual(['other project', 'second', 'first'])
  })

  it('keeps one entry for a repeated message in the same session and moves it to the newest position', () => {
    const { store, at } = bench()
    store.record({ text: 'repeat', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(1_000) })
    store.record({ text: 'between', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(2_000) })
    store.record({ text: 'repeat', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(3_000) })

    const entries = store.entriesFor('session', { sessionId: sid('s1'), projectKey: 'p1' })
    expect(entries.map(entry => entry.text)).toEqual(['repeat', 'between'])
    expect(entries[0]?.submittedAt).toBe(at(3_000))
    expect(store.state.getSnapshot().entries.filter(entry => entry.text === 'repeat')).toHaveLength(1)
  })

  it('keeps the same text twice when different sessions sent it', () => {
    const { store, at } = bench()
    store.record({ text: 'same', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(1_000) })
    store.record({ text: 'same', sessionId: sid('s2'), projectKey: 'p1', submittedAt: at(2_000) })

    expect(store.state.getSnapshot().entries).toHaveLength(2)
  })

  it('stops recalling an entry once the retention window passes', () => {
    const { store, advance, at } = bench()
    store.record({ text: 'old', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(0) })
    advance(31 * DAY_MS)

    expect(store.entriesFor('session', { sessionId: sid('s1'), projectKey: 'p1' })).toEqual([])
    store.purgeExpired()
    expect(store.state.getSnapshot().entries).toEqual([])
  })

  it('clears expired entries at rehydration so they never become recallable again', () => {
    const storage = memoryStorage()
    storage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      settings: { enabled: true, scope: 'session', retentionDays: 30 },
      entries: [
        { id: 'expired', text: 'expired', sessionId: 's1', projectKey: 'p1', submittedAt: Date.UTC(2026, 0, 1) },
        { id: 'fresh', text: 'fresh', sessionId: 's1', projectKey: 'p1', submittedAt: Date.UTC(2026, 10, 18) },
      ],
    }))

    const store = createInputHistoryStore({ storage, now: () => Date.UTC(2026, 10, 19) })

    expect(store.state.getSnapshot().entries.map(entry => entry.text)).toEqual(['fresh'])
    const stored = JSON.parse(storage.getItem(INPUT_HISTORY_STORAGE_KEY) ?? '{}') as { entries: { text: string }[] }
    expect(stored.entries.map(entry => entry.text)).toEqual(['fresh'])
  })

  it('clamps retention and re-prunes when the window shrinks', () => {
    const { store, at, advance } = bench()
    store.record({ text: 'ten days old', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(0) })
    advance(10 * DAY_MS)

    store.updateSettings({ retentionDays: 7 })
    expect(store.state.getSnapshot().settings.retentionDays).toBe(7)
    expect(store.state.getSnapshot().entries).toEqual([])

    store.updateSettings({ retentionDays: MAX_RETENTION_DAYS + 500 })
    expect(store.state.getSnapshot().settings.retentionDays).toBe(MAX_RETENTION_DAYS)
    store.updateSettings({ retentionDays: -3 })
    expect(store.state.getSnapshot().settings.retentionDays).toBe(MIN_RETENTION_DAYS)
  })

  it('keeps preferences when the ledger is cleared', () => {
    const { store, at } = bench()
    store.updateSettings({ enabled: false, scope: 'global' })
    store.record({ text: 'kept?', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(0) })
    store.clear()

    expect(store.state.getSnapshot().entries).toEqual([])
    expect(store.state.getSnapshot().settings).toMatchObject({ enabled: false, scope: 'global' })
  })

  it('drops a blank message and caps the ledger at the newest entries', () => {
    const { store, at } = bench()
    store.record({ text: '   ', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(0) })
    expect(store.state.getSnapshot().entries).toEqual([])

    for (let index = 0; index < MAX_HISTORY_ENTRIES + 5; index += 1) {
      store.record({ text: `message ${index}`, sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(index) })
    }
    const entries = store.state.getSnapshot().entries
    expect(entries).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(entries[0]?.text).toBe('message 5')
    expect(entries.at(-1)?.text).toBe(`message ${MAX_HISTORY_ENTRIES + 4}`)
  })

  it('falls back to fallback Session keys when the project is unknown', () => {
    const { store, at } = bench()
    store.record({ text: 'no project', sessionId: sid('s1'), projectKey: '', submittedAt: at(0) })

    expect(store.state.getSnapshot().entries[0]?.projectKey).toBe('session:s1')
    expect(store.entriesFor('project', { sessionId: sid('s1'), projectKey: 'session:s1' }))
      .toHaveLength(1)
    expect(store.entriesFor('project', { sessionId: sid('s2'), projectKey: 'session:s2' }))
      .toHaveLength(0)
  })

  it('bounds the ledger by total text so one large prompt cannot bloat browser storage', () => {
    const { store, at } = bench()
    const body = 'x'.repeat(98_990)
    for (let index = 0; index < 12; index += 1) {
      store.record({
        text: `${String(index).padStart(2, '0')}:${body}`,
        sessionId: sid('s1'),
        projectKey: 'p1',
        submittedAt: at(index),
      })
    }

    const entries = store.state.getSnapshot().entries
    const total = entries.reduce((sum, entry) => sum + entry.text.length, 0)
    expect(total).toBeLessThanOrEqual(MAX_HISTORY_TOTAL_TEXT_LENGTH)
    expect(entries.length).toBeLessThan(12)
    expect(entries.at(-1)?.text.startsWith('11:')).toBe(true)
    expect(entries[0]?.text.startsWith('07:')).toBe(true)
  })

  it('rehydrates settings and entries from the same storage document', () => {
    const storage = memoryStorage()
    const first = createInputHistoryStore({ storage, now: () => 1_000 })
    first.updateSettings({ scope: 'project', retentionDays: 12 })
    first.record({ text: 'persisted', sessionId: sid('s1'), projectKey: 'p1', submittedAt: 900 })

    const second = createInputHistoryStore({ storage, now: () => 1_000 })
    expect(second.state.getSnapshot().settings).toMatchObject({ scope: 'project', retentionDays: 12 })
    expect(second.state.getSnapshot().entries.map(entry => entry.text)).toEqual(['persisted'])
  })

  it('discards an unknown schema version and malformed entries', () => {
    const storage = memoryStorage()
    storage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify({
      schemaVersion: 99,
      settings: { enabled: false, scope: 'global', retentionDays: 1 },
      entries: [{ id: 'x', text: 'x', sessionId: 's1', projectKey: 'p1', submittedAt: 1 }],
    }))
    const store = createInputHistoryStore({ storage, now: () => 1_000 })
    expect(store.state.getSnapshot()).toEqual({
      settings: DEFAULT_INPUT_HISTORY_SETTINGS,
      entries: [],
    })

    storage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      settings: { enabled: true, scope: 'session', retentionDays: 30 },
      entries: [
        { id: 'ok', text: 'ok', sessionId: 's1', projectKey: 'p1', submittedAt: Date.UTC(2026, 10, 18) },
        { id: '', text: 'bad id', sessionId: 's1', projectKey: 'p1', submittedAt: Date.UTC(2026, 10, 18) },
        { id: 'bad time', text: 'bad time', sessionId: 's1', projectKey: 'p1', submittedAt: 'yesterday' },
        { id: 'blank text', text: '   ', sessionId: 's1', projectKey: 'p1', submittedAt: Date.UTC(2026, 10, 18) },
        { id: 'huge text', text: 'x'.repeat(100_001), sessionId: 's1', projectKey: 'p1', submittedAt: Date.UTC(2026, 10, 18) },
        { id: 'bad session', text: 'bad session', sessionId: '', projectKey: 'p1', submittedAt: Date.UTC(2026, 10, 18) },
        { id: 'bad project', text: 'bad project', sessionId: 's1', projectKey: '', submittedAt: Date.UTC(2026, 10, 18) },
        'not an entry',
      ],
    }))
    const second = createInputHistoryStore({ storage, now: () => Date.UTC(2026, 10, 19) })
    expect(second.state.getSnapshot().entries.map(entry => entry.text)).toEqual(['ok'])
  })

  it('discards an oversized document before parsing it', () => {
    const storage = memoryStorage()
    storage.setItem(INPUT_HISTORY_STORAGE_KEY, 'x'.repeat(MAX_STORED_DOCUMENT_LENGTH + 1))
    const store = createInputHistoryStore({ storage, now: () => 1_000 })

    expect(store.state.getSnapshot()).toEqual({ settings: DEFAULT_INPUT_HISTORY_SETTINGS, entries: [] })
  })

  it('defaults settings and entries when the document carries neither', () => {
    const storage = memoryStorage()
    storage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify({ schemaVersion: 1 }))
    const store = createInputHistoryStore({ storage, now: () => 1_000 })

    expect(store.state.getSnapshot()).toEqual({ settings: DEFAULT_INPUT_HISTORY_SETTINGS, entries: [] })
    expect(storage.getItem(INPUT_HISTORY_STORAGE_KEY)).toContain('"entries":[]')
  })

  it('sorts rehydrated entries by time even when the document is out of order', () => {
    const storage = memoryStorage()
    storage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      settings: { enabled: true, scope: 'session', retentionDays: 30 },
      entries: [
        { id: 'later', text: 'later', sessionId: 's1', projectKey: 'p1', submittedAt: Date.UTC(2026, 10, 18, 2) },
        { id: 'earlier', text: 'earlier', sessionId: 's1', projectKey: 'p1', submittedAt: Date.UTC(2026, 10, 18, 1) },
      ],
    }))
    const store = createInputHistoryStore({ storage, now: () => Date.UTC(2026, 10, 19) })

    expect(store.state.getSnapshot().entries.map(entry => entry.text)).toEqual(['earlier', 'later'])
  })

  it('keeps working in memory when the page exposes no storage', () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      const store = createInputHistoryStore({ now: () => 1_000 })
      store.record({ text: 'memory only', sessionId: sid('s1'), projectKey: 'p1' })

      expect(store.state.getSnapshot().entries.map(entry => entry.text)).toEqual(['memory only'])
      expect(store.state.getSnapshot().entries[0]?.submittedAt).toBe(1_000)
      expect(store.entriesFor('session', { sessionId: sid('s1'), projectKey: 'p1' }, 1_000)).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('treats an inaccessible localStorage as no storage', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('blocked') },
    })
    try {
      const store = createInputHistoryStore({ now: () => 1_000 })
      expect(store.state.getSnapshot().entries).toEqual([])
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'localStorage')
      else Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('avoids writes for unchanged settings, an empty clear, and a no-op purge', () => {
    const { store, at } = bench()
    store.record({ text: 'kept', sessionId: sid('s1'), projectKey: 'p1', submittedAt: at(0) })
    const before = store.state.getSnapshot()

    store.updateSettings({ enabled: true, scope: 'session', retentionDays: 30 })
    store.purgeExpired()
    expect(store.state.getSnapshot()).toBe(before)

    store.clear()
    expect(store.state.getSnapshot().entries).toEqual([])
    const cleared = store.state.getSnapshot()
    store.clear()
    expect(store.state.getSnapshot()).toBe(cleared)
  })

  it('orders equally old entries deterministically', () => {
    const { store, at } = bench()
    const submittedAt = at(5_000)
    store.record({ text: 'first', sessionId: sid('s1'), projectKey: 'p1', submittedAt })
    store.record({ text: 'second', sessionId: sid('s1'), projectKey: 'p1', submittedAt })

    const entries = store.entriesFor('session', { sessionId: sid('s1'), projectKey: 'p1' })
    expect(entries.map(entry => entry.text)).toEqual(['second', 'first'])
  })

  it('survives storage that refuses reads and writes', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage: InputHistoryStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => {},
    }
    const store = createInputHistoryStore({ storage, now: () => 1_000 })

    expect(store.state.getSnapshot().entries).toEqual([])
    store.record({ text: 'still in memory', sessionId: sid('s1'), projectKey: 'p1', submittedAt: 1_000 })
    expect(store.entriesFor('session', { sessionId: sid('s1'), projectKey: 'p1' }, 1_000).map(entry => entry.text))
      .toEqual(['still in memory'])
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('input history helpers', () => {
  it('normalizes retention to whole days inside the supported window', () => {
    expect(normalizeRetentionDays(30)).toBe(30)
    expect(normalizeRetentionDays(0.4)).toBe(MIN_RETENTION_DAYS)
    expect(normalizeRetentionDays(Number.POSITIVE_INFINITY)).toBe(30)
    expect(normalizeRetentionDays('30')).toBe(30)
  })

  it('trims a project directory and folds Windows separator case', () => {
    expect(projectKeyOf('/home/me/project/')).toBe('/home/me/project')
    expect(projectKeyOf('D:\\Work\\Project\\')).toBe('d:\\work\\project')
    expect(projectKeyOf('C:/Work/Project/')).toBe('c:/work/project')
    expect(projectKeyOf('   ')).toBe('')
  })
})
