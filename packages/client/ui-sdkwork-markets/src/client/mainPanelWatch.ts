/**
 * Watch one keyed entry of the `main` panel ledger.
 *
 * Two panels this page draws belong to other packages — the SkillHub skill
 * market and the MCP connector — and neither publishes a client service: the
 * only identity they share with this page is the `main` key their registration
 * carries. This module owns the watching both need: the keyed lookup through
 * the type-erased ledger, a snapshot that keeps its reference until the
 * registered component changes (the page hands it to `useSyncExternalStore`,
 * where a fresh object per read would remount the embedded panel), and the
 * owner's disposal.
 *
 * The source is optional by construction: a deployment that disables the row
 * registers nothing, so every read answers `undefined` until a panel with that
 * key appears and returns to `undefined` when it goes away.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/mainPanelWatch
 */

import type { ComponentType } from 'react'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** One stored `main` entry, as the registry exposes it. */
export interface MainPanelEntry {
  readonly options: { readonly key?: unknown }
  readonly component?: unknown
}

/** The subset of the slot registry this module reads. */
export interface MainPanelLedger {
  /**
   * The live entries of one slot.
   * @param name - the slot key (`main` here).
   * @returns the stored entries; a keyed entry carries its key on `options`.
   */
  entriesOfSlot(name: string): readonly MainPanelEntry[]
  /**
   * Subscribe to one slot's ledger changes.
   * @param name - the slot key.
   * @param listener - called after any registration or disposal.
   * @returns the unsubscribe function.
   */
  subscribe(name: string, listener: () => void): () => void
}

/** A live read of one panel's registered component, plus its owner's disposal. */
export interface MainPanelComponentSource extends HostObservable<ComponentType | undefined> {
  /** Stop observing the ledger (the caller's effect scope owns this). */
  dispose(): void
}

/**
 * Watch one keyed `main` panel.
 * @param slots - the slot registry the page's plugin already injects.
 * @param panelId - the `main` key the panel registers under.
 * @returns the live component and the owner's disposal.
 */
export function watchMainPanel(slots: MainPanelLedger, panelId: string): MainPanelComponentSource {
  const read = (): ComponentType | undefined => {
    const entry = slots.entriesOfSlot('main')
      .find(candidate => candidate.options.key === panelId)
    return typeof entry?.component === 'function' ? entry.component as ComponentType : undefined
  }
  let snapshot = read()
  const listeners = new Set<() => void>()
  const sync = (): void => {
    // The snapshot only moves when the answer moves: an unrelated panel
    // registering must not re-render (and remount) the embedded one.
    const next = read()
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  const unsubscribe = slots.subscribe('main', sync)
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      unsubscribe()
      listeners.clear()
    },
  }
}
