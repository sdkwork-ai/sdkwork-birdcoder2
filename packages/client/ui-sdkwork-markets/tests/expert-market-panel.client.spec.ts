/**
 * expertMarketPanel: the source the Experts tab binds to the expert-market
 * plugin's own `main` panel. The plugin publishes no client service, so the
 * page can only observe the slot ledger; this source must hand over the
 * registered component under the key the plugin registers it, carry the props
 * that registration injects (the panel is written for its seat, not for a bare
 * render), follow that key rather than any entry, and stop observing when its
 * owner is disposed. (The snapshot's reference stability and its behaviour
 * across unrelated registrations are covered once, in
 * `skill-market-panel.client.spec.ts`, over the shared reader both sources use.)
 */
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EXPERT_MARKET_PANEL_ID, createExpertMarketPanelSource, type ExpertMarketPanelLedger,
} from '../src/client/expertMarketPanel.ts'

/** The plugin's registered component: the identity the page must see. */
function RosterPanel(): null { return null }

/** One ledger entry as the registry stores it. */
interface LedgerEntry {
  readonly options: { readonly key?: unknown }
  readonly component?: unknown
  readonly inject?: unknown
}

/** A ledger double holding one keyed `main` entry at a time. */
function ledger(): ExpertMarketPanelLedger & {
  register(key: string, component?: ComponentType, inject?: () => Record<string, unknown>): void
  withdraw(key: string): void
  unsubscribed(): number
} {
  const registered = new Map<string, LedgerEntry>()
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of [...listeners]) listener() }
  return {
    entriesOfSlot: (name) => {
      expect(name).toBe('main')
      return [...registered.values()]
    },
    subscribe(name, listener) {
      expect(name).toBe('main')
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    register(key, component = RosterPanel, inject) {
      registered.set(key, { options: { key }, component, ...(inject === undefined ? {} : { inject }) })
      notify()
    },
    withdraw(key) {
      registered.delete(key)
      notify()
    },
    unsubscribed: () => listeners.size,
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe('expertMarketPanel', () => {
  it('pins the panel key the sdkwork-dsh-agents plugin registers', () => {
    // The bundle acceptance spec reads the shipped plugin artifact and pins
    // this same key; this assertion is where a rename lands first.
    expect(EXPERT_MARKET_PANEL_ID).toBe('agency-agents')
  })

  it('reports the panel only under its own key, and stops with its owner', () => {
    const slots = ledger()
    const source = createExpertMarketPanelSource(slots)
    const listener = vi.fn()
    source.subscribe(listener)
    expect(source.getSnapshot()).toBeUndefined()

    // Another plugin's panel is not the expert market.
    slots.register('skill-market')
    expect(source.getSnapshot()).toBeUndefined()
    expect(listener).not.toHaveBeenCalled()

    slots.register(EXPERT_MARKET_PANEL_ID)
    expect(source.getSnapshot()?.component).toBe(RosterPanel)
    expect(source.getSnapshot()?.injected).toEqual({})
    expect(listener).toHaveBeenCalledTimes(1)

    slots.withdraw(EXPERT_MARKET_PANEL_ID)
    expect(source.getSnapshot()).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)

    // Disposal stops the ledger subscription; the page keeps tearing down with
    // whatever it last read.
    expect(slots.unsubscribed()).toBe(1)
    source.dispose()
    expect(slots.unsubscribed()).toBe(0)
    slots.register(EXPERT_MARKET_PANEL_ID)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('carries the injected face the panel was written for', () => {
    // The expert market's registration injects its own translator and remote
    // client; drawing the component without that face crashed the first
    // integration, so the source hands the face over with the component.
    const slots = ledger()
    const remote = { getCatalog: () => null }
    const inject = () => ({ t: (key: string) => key, remote })
    slots.register(EXPERT_MARKET_PANEL_ID, RosterPanel, inject)
    const source = createExpertMarketPanelSource(slots)
    expect(source.getSnapshot()?.injected).toEqual({ t: expect.any(Function), remote })

    // One snapshot per registration: a re-read does not call inject again.
    const first = source.getSnapshot()
    expect(source.getSnapshot()).toBe(first)
  })

  it('draws a panel whose inject throws without injected props instead of losing it', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const slots = ledger()
    slots.register(EXPERT_MARKET_PANEL_ID, RosterPanel, () => { throw new Error('no services yet') })
    const source = createExpertMarketPanelSource(slots)
    expect(source.getSnapshot()?.component).toBe(RosterPanel)
    expect(source.getSnapshot()?.injected).toEqual({})
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('injected props'), expect.any(Error))
  })
})
