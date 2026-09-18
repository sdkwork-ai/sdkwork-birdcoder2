/**
 * Config-items spec: the official group's second source is the `plugins.item`
 * ledger — the plugins that bring a configuration page of their own (Shell,
 * Agent loop, Subagent, Web search in a stock deployment). The projection is a
 * `useSyncExternalStore` source, so the spec pins the two properties the panel
 * depends on: the snapshot keeps its identity between reads, and it moves only
 * when the ledger or the active locale does.
 */
import { describe, expect, it, vi } from 'vitest'
import { officialItemsSource, type OfficialItem } from '../src/client/configItems.ts'

/** One ledger entry as the slot registry stores it: options plus nothing else the projection reads. */
interface EntryDouble {
  readonly options: { readonly id?: string; readonly label?: unknown }
}

/**
 * The two services the projection reads, standing in for the slot registry and
 * the locale runtime: the ledger answers `entries`/`getVersion` and can be
 * told to change; the locale answers `revision` and can be told to change.
 */
function bench(initial: readonly EntryDouble[] = []) {
  let entries: readonly EntryDouble[] = initial
  let version = 0
  const slotListeners = new Set<() => void>()
  let revision = 0
  const localeListeners = new Set<() => void>()
  const ctx = {
    slots: {
      getVersion: () => version,
      entries: vi.fn(() => entries),
      subscribe: (_key: string, listener: () => void) => {
        slotListeners.add(listener)
        return () => { slotListeners.delete(listener) }
      },
    },
    locale: {
      getSnapshot: () => ({ revision }),
      subscribe: (listener: () => void) => {
        localeListeners.add(listener)
        return () => { localeListeners.delete(listener) }
      },
    },
  }
  return {
    ctx,
    /** Replace the ledger and notify, as a registration or removal would. */
    setEntries(next: readonly EntryDouble[]): void {
      entries = next
      version += 1
      for (const listener of slotListeners) listener()
    },
    /** Move the active locale's revision and notify. */
    setRevision(next: number): void {
      revision = next
      for (const listener of localeListeners) listener()
    },
    get occurrences(): number { return slotListeners.size + localeListeners.size },
  }
}

/** A registrant's entry: an id and a label the projection resolves. */
function entry(id: string, label: string): EntryDouble {
  return { options: { id, label: () => label } }
}

describe('officialItemsSource', () => {
  it('projects the ledger as the id and localized title the card shows', () => {
    const b = bench([
      entry('bash', 'Shell'),
      entry('agent-loop', 'Agent loop'),
    ])
    const source = officialItemsSource(b.ctx as never)
    // The order is the ledger's own (the registrants' declared order), and each
    // entry carries the id the card's DOM identity and the renderer both need.
    expect(source.getSnapshot()).toEqual([
      { id: 'bash', label: 'Shell' },
      { id: 'agent-loop', label: 'Agent loop' },
    ] satisfies readonly OfficialItem[])
    expect(b.ctx.slots.entries).toHaveBeenCalledWith('plugins.item')
  })

  it('keeps the snapshot identity between reads and moves it only on a change', () => {
    const b = bench([entry('bash', 'Shell')])
    const source = officialItemsSource(b.ctx as never)
    const first = source.getSnapshot()
    // A `useSyncExternalStore` source must not hand back a fresh array on every
    // read, or React re-renders forever. The cached snapshot is returned until
    // the ledger or the locale actually moves.
    expect(source.getSnapshot()).toBe(first)
    expect(b.ctx.slots.entries).toHaveBeenCalledTimes(1)

    b.setEntries([entry('bash', 'Shell'), entry('subagent', 'Subagent')])
    expect(source.getSnapshot()).not.toBe(first)
    expect(source.getSnapshot()).toHaveLength(2)

    // A locale move re-resolves the labels, so the snapshot is rebuilt too.
    const second = source.getSnapshot()
    b.setRevision(1)
    expect(source.getSnapshot()).not.toBe(second)
  })

  it('subscribes to both the ledger and the locale and releases both', () => {
    const b = bench()
    const source = officialItemsSource(b.ctx as never)
    const listener = vi.fn()
    const off = source.subscribe(listener)
    expect(b.occurrences).toBe(2)
    off()
    expect(b.occurrences).toBe(0)
  })

  it('answers an empty list while nothing has registered', () => {
    const b = bench()
    const source = officialItemsSource(b.ctx as never)
    expect(source.getSnapshot()).toEqual([])
  })
})
