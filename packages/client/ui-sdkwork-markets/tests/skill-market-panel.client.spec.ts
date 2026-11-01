/**
 * skillMarketPanel: the source the Skills tab binds to the independent
 * skill-market plugin's own `main` panel. The plugin publishes no client
 * service, so the page can only observe the slot ledger; this source must
 * therefore hand over the registered component with a live, reference-stable
 * snapshot (never a new object per read), survive unrelated panel
 * registrations without notifying, follow the panel key rather than any entry,
 * and stop observing when its owner is disposed.
 */
import type { ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  SKILL_MARKET_PANEL_ID, createSkillMarketPanelSource, type SkillMarketPanelLedger,
} from '../src/client/skillMarketPanel.ts'

/** One market component per key: the identity the page must see unchanged. */
const panels = new Map<string, ComponentType>()
function panelOf(key: string): ComponentType {
  const cached = panels.get(key)
  if (cached !== undefined) return cached
  function Panel(): null { return null }
  Panel.displayName = `Panel(${key})`
  panels.set(key, Panel)
  return Panel
}

/** A ledger double: one keyed `main` entry per registered key. */
function ledger(keys: readonly string[] = []): SkillMarketPanelLedger & {
  register(key: string): void
  registerBare(key: string): void
  withdraw(key: string): void
  unsubscribed: number
  listeners: Set<() => void>
} {
  const registered = new Map<string, ComponentType | undefined>(
    keys.map(key => [key, panelOf(key)]),
  )
  const listeners = new Set<() => void>()
  const entriesOfSlot = (name: string): readonly {
    readonly options: { readonly key?: unknown }
    readonly component?: unknown
  }[] => {
    expect(name).toBe('main')
    return [...registered].map(([key, component]) => (
      component === undefined ? { options: { key } } : { options: { key }, component }
    ))
  }
  const notify = (): void => { for (const listener of [...listeners]) listener() }
  return {
    entriesOfSlot,
    subscribe(name, listener) {
      expect(name).toBe('main')
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    register(key) {
      registered.set(key, panelOf(key))
      notify()
    },
    /** A registration whose entry carries no component (a stub or half-loaded client half). */
    registerBare(key) {
      registered.set(key, undefined)
      notify()
    },
    withdraw(key) {
      registered.delete(key)
      notify()
    },
    get unsubscribed() { return listeners.size },
    listeners,
  }
}

describe('skillMarketPanel', () => {
  it('pins the panel key the dsh-skill-market plugin registers', () => {
    // The bundle acceptance spec reads the shipped plugin artifact and pins
    // this same key; this assertion is where a rename lands first.
    expect(SKILL_MARKET_PANEL_ID).toBe('skill-market')
  })

  it('reports the registered component live and only when the answer moves', () => {
    const slots = ledger()
    const source = createSkillMarketPanelSource(slots)
    const listener = vi.fn()
    const unsubscribe = source.subscribe(listener)
    expect(source.getSnapshot()).toBeUndefined()

    // The plugin's panel arriving is the change the page renders for: the tab
    // draws that component in place, so the source hands over the component.
    const panel = panelOf(SKILL_MARKET_PANEL_ID)
    slots.register(SKILL_MARKET_PANEL_ID)
    expect(source.getSnapshot()?.component).toBe(panel)
    expect(listener).toHaveBeenCalledTimes(1)

    // Reads between changes keep the same wrapper object: the page's
    // `useSyncExternalStore` snapshot must not churn.
    expect(source.getSnapshot()).toBe(source.getSnapshot())

    // An unrelated keyed panel is not the skill market: no notification, no
    // flip, and the market's own component keeps its identity. A page that
    // re-rendered here would remount the market surface every time any other
    // plugin registered a page.
    slots.register('another-panel')
    expect(source.getSnapshot()?.component).toBe(panel)
    expect(listener).toHaveBeenCalledTimes(1)

    // Withdrawing the market panel removes the entry again.
    slots.withdraw(SKILL_MARKET_PANEL_ID)
    expect(source.getSnapshot()).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)

    // Withdrawing a key that was never around is not a change.
    slots.withdraw('missing')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    slots.register(SKILL_MARKET_PANEL_ID)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('starts present when the plugin activated before this page', () => {
    const slots = ledger([SKILL_MARKET_PANEL_ID])
    const source = createSkillMarketPanelSource(slots)
    expect(source.getSnapshot()?.component).toBe(panelOf(SKILL_MARKET_PANEL_ID))
  })

  it('ignores a panel entry that carries no component', () => {
    // The keyed ledger is type-erased at this boundary: an entry whose
    // component is not a function (a stub registration, a half-loaded client
    // half) must read as absent rather than as a panel that cannot render.
    const slots = ledger()
    slots.registerBare(SKILL_MARKET_PANEL_ID)
    const source = createSkillMarketPanelSource(slots)
    expect(source.getSnapshot()).toBeUndefined()
  })

  it('stops observing the ledger on dispose', () => {
    const slots = ledger()
    const source = createSkillMarketPanelSource(slots)
    expect(slots.unsubscribed).toBe(1)
    const listener = vi.fn()
    source.subscribe(listener)
    source.dispose()
    expect(slots.unsubscribed).toBe(0)
    // No registration can reach a disposed source; the snapshot it last
    // published stays readable for a mount that is still tearing down.
    slots.register(SKILL_MARKET_PANEL_ID)
    expect(listener).not.toHaveBeenCalled()
    expect(source.getSnapshot()).toBeUndefined()
  })
})
