/**
 * Config-ledger spec: the market's Plugins page reads the same three ledgers
 * the upstream Plugin manager declares — `plugins.item` (the plugins that bring
 * a configuration page of their own: Shell, Agent loop, Subagent, Web search in
 * a stock deployment), `plugins.bundle.config` (a bundle's page-level form) and
 * `plugins.row.config` (one row's form). The projection is a
 * `useSyncExternalStore` source, so the spec pins the two properties the panel
 * depends on: the snapshot keeps its identity between reads, and it moves only
 * when a ledger or the active locale does.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  configLedgerSource, rowConfigKey, type OfficialItem,
} from '../src/client/configItems.ts'

/** One ledger entry as the slot registry stores it: options plus nothing else the projection reads. */
interface EntryDouble {
  readonly options: { readonly id?: string; readonly key?: string; readonly label?: unknown }
}

const SLOTS = ['plugins.item', 'plugins.bundle.config', 'plugins.row.config'] as const

/**
 * The three services the projection reads, standing in for the slot registry
 * and the locale runtime: the ledgers answer `entries`/`getVersion` per slot
 * and can be told to change; the locale answers `revision` and can be told to
 * change.
 */
function bench(initial: Partial<Record<(typeof SLOTS)[number], readonly EntryDouble[]>> = {}) {
  const entries: Record<string, readonly EntryDouble[]> = {
    'plugins.item': [], 'plugins.bundle.config': [], 'plugins.row.config': [], ...initial,
  }
  const versions: Record<string, number> = {
    'plugins.item': 0, 'plugins.bundle.config': 0, 'plugins.row.config': 0,
  }
  const slotListeners = new Set<() => void>()
  let slotSubscriptions = 0
  let revision = 0
  const localeListeners = new Set<() => void>()
  let localeSubscriptions = 0
  const ctx = {
    slots: {
      getVersion: (name: string) => versions[name] ?? 0,
      entries: vi.fn((name: string) => entries[name] ?? []),
      subscribe: (_key: string, listener: () => void) => {
        slotSubscriptions += 1
        slotListeners.add(listener)
        return () => { slotSubscriptions -= 1; slotListeners.delete(listener) }
      },
    },
    locale: {
      getSnapshot: () => ({ revision }),
      subscribe: (listener: () => void) => {
        localeSubscriptions += 1
        localeListeners.add(listener)
        return () => { localeSubscriptions -= 1; localeListeners.delete(listener) }
      },
    },
  }
  return {
    ctx,
    /** Replace one ledger and notify, as a registration or removal would. */
    setEntries(name: (typeof SLOTS)[number], next: readonly EntryDouble[]): void {
      entries[name] = next
      versions[name] = (versions[name] ?? 0) + 1
      for (const listener of slotListeners) listener()
    },
    /** Move the active locale's revision and notify. */
    setRevision(next: number): void {
      revision = next
      for (const listener of localeListeners) listener()
    },
    /**
     * The live registrations, counted per subscribe rather than per distinct
     * listener: the projection hands the SAME listener to every registry, so a
     * listener count would collapse the four registrations into two and stop
     * proving that every ledger was reached.
     */
    get occurrences(): number { return slotSubscriptions + localeSubscriptions },
  }
}

/** A registrant's entry: an id and a label the projection resolves. */
function entry(id: string, label: string): EntryDouble {
  return { options: { id, label: () => label } }
}

/** A keyed registrant's entry (bundle config / row config). */
function keyed(key: string): EntryDouble {
  return { options: { key } }
}

describe('configLedgerSource', () => {
  it('projects the three ledgers the page renders from', () => {
    const b = bench({
      'plugins.item': [entry('bash', 'Shell'), entry('agent-loop', 'Agent loop')],
      'plugins.bundle.config': [keyed('@deepseek-ai/dsh-experimental-voice-input-bundle')],
      'plugins.row.config': [keyed(rowConfigKey('demo-bundle', 'demo.row.one'))],
    })
    const ledger = configLedgerSource(b.ctx as never).getSnapshot()
    // The order is the ledger's own (the registrants' declared order), and each
    // item carries the id the card's DOM identity and the renderer both need.
    expect(ledger.items).toEqual([
      { id: 'bash', label: 'Shell' },
      { id: 'agent-loop', label: 'Agent loop' },
    ] satisfies readonly OfficialItem[])
    expect([...ledger.bundles]).toEqual(['@deepseek-ai/dsh-experimental-voice-input-bundle'])
    expect([...ledger.rows]).toEqual(['demo-bundle#demo.row.one'])
    expect(b.ctx.slots.entries).toHaveBeenCalledWith('plugins.item')
    expect(b.ctx.slots.entries).toHaveBeenCalledWith('plugins.bundle.config')
    expect(b.ctx.slots.entries).toHaveBeenCalledWith('plugins.row.config')
  })

  it('keeps the snapshot identity between reads and moves it on any ledger or the locale', () => {
    const b = bench({ 'plugins.item': [entry('bash', 'Shell')] })
    const source = configLedgerSource(b.ctx as never)
    const first = source.getSnapshot()
    // A `useSyncExternalStore` source must not hand back a fresh object on every
    // read, or React re-renders forever. The cached snapshot is returned until
    // a ledger or the locale actually moves.
    expect(source.getSnapshot()).toBe(first)

    b.setEntries('plugins.bundle.config', [keyed('demo-bundle')])
    const second = source.getSnapshot()
    expect(second).not.toBe(first)
    expect([...second.bundles]).toEqual(['demo-bundle'])

    b.setEntries('plugins.row.config', [keyed('demo-bundle#row')])
    const third = source.getSnapshot()
    expect(third).not.toBe(second)
    expect([...third.rows]).toEqual(['demo-bundle#row'])

    // A locale move re-resolves the labels, so the snapshot is rebuilt too.
    b.setRevision(1)
    expect(source.getSnapshot()).not.toBe(third)
  })

  it('subscribes to every ledger and the locale, then releases all of them', () => {
    const b = bench()
    const source = configLedgerSource(b.ctx as never)
    const listener = vi.fn()
    const off = source.subscribe(listener)
    // Three slot ledgers plus the locale revision.
    expect(b.occurrences).toBe(4)
    off()
    expect(b.occurrences).toBe(0)
  })

  it('answers empty ledgers while nothing has registered', () => {
    const b = bench()
    const ledger = configLedgerSource(b.ctx as never).getSnapshot()
    expect(ledger.items).toEqual([])
    expect(ledger.bundles.size).toBe(0)
    expect(ledger.rows.size).toBe(0)
  })
})
