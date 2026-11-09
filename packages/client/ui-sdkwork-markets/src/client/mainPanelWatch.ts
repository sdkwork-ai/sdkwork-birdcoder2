/**
 * Watch one keyed entry of the `main` panel ledger.
 *
 * Three panels this page draws belong to other packages — the expert market,
 * the SkillHub skill market and the MCP connector — and none publishes a client
 * service: the only identity they share with this page is the `main` key their
 * registration carries. This module owns the watching all three need: the
 * keyed lookup through the type-erased ledger, the registration's injected
 * props, a snapshot that keeps its reference until the registered component
 * changes (the page hands it to `useSyncExternalStore`, where a fresh object
 * per read would remount the embedded panel), and the owner's disposal.
 *
 * The injected props are part of the panel, not an optional extra: a host panel
 * registers `{ inject }` with the services it was written for (its own locale
 * translator, its remote client, its selection callbacks), and the frame that
 * owns the `main` seat passes that face to the component. An embedded panel
 * drawn outside that seat must pass the same face, or it renders without the
 * data it needs — the expert-market panel, for one, reads its translator and
 * its remote client out of it and throws without them.
 *
 * A face that throws is not the registration's answer. A registrant can publish
 * its panel from inside its own apply, before the bindings that face closes
 * over are initialized, so the panel stays drawn and the face is resolved again
 * on the next ledger read — never memoized as permanently prop-free.
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
  /**
   * The registration's injected face, or absent when it declares none. The
   * registry stores it type-erased; the renderer calls it with no arguments.
   */
  readonly inject?: unknown
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

/** The component one keyed panel registered, as a page renders it in place. */
export interface PanelComponent {
  /** The registrant's own component tree. */
  readonly component: ComponentType
  /**
   * The props its seat would pass: the registration's injected face. Empty when
   * the registrant declares none (a prop-free panel needs nothing).
   */
  readonly injected: Record<string, unknown>
}

/** A live read of one keyed panel's component, plus its owner's disposal. */
export interface PanelComponentSource extends HostObservable<PanelComponent | undefined> {
  /** Stop observing the ledger (the caller's effect scope owns this). */
  dispose(): void
}

/** The face a prop-free registration gets: no props at all. */
const NO_INJECTED: Record<string, unknown> = {}

/**
 * Watch one keyed `main` panel whose component a tab renders in place.
 *
 * The snapshot is one `{ component, injected }` object per registered
 * component, so the value handed to `useSyncExternalStore` never churns and
 * the embedded panel is not remounted after an unrelated registration.
 *
 * @param slots - the slot registry the page's plugin already injects.
 * @param panelId - the `main` key the panel registers under.
 * @returns the live component wrapper and the owner's disposal.
 */
export function watchPanelComponent(slots: MainPanelLedger, panelId: string): PanelComponentSource {
  let snapshot: PanelComponent | undefined
  /** Whether the current snapshot's face failed and must be resolved again. */
  let unresolved = false
  /**
   * The registered panel, with its injected face resolved once per
   * registration: a re-read of the same component keeps the same object, so
   * the embedded subtree never remounts on an unrelated ledger change.
   *
   * A face that throws is not an answer. A registrant can publish its panel
   * from inside its own apply, before the bindings that face closes over are
   * initialized, so the failure is kept out of the snapshot's meaning: the
   * panel stays drawn (a remount would reset it) and the next ledger read
   * resolves the face again. A prop-free registration never retries.
   */
  const read = (): PanelComponent | undefined => {
    const entry = slots.entriesOfSlot('main')
      .find(candidate => candidate.options.key === panelId)
    if (typeof entry?.component !== 'function') {
      snapshot = undefined
      unresolved = false
      return undefined
    }
    const component = entry.component as ComponentType
    if (snapshot?.component === component && !unresolved) return snapshot
    const face = injectedFace(entry.inject)
    unresolved = !face.resolved
    // A failed retry keeps the drawn panel by identity, so an unrelated
    // registration neither remounts it nor reports that nothing changed.
    if (unresolved && snapshot?.component === component) return snapshot
    snapshot = { component, injected: face.injected }
    return snapshot
  }
  snapshot = read()
  const listeners = new Set<() => void>()
  const sync = (): void => {
    // The snapshot only moves when the answer moves: an unrelated panel
    // registering must not re-render (and remount) the embedded one.
    const previous = snapshot
    if (read() === previous) return
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

/**
 * Resolve one registration's injected face the way its seat would: called with
 * no arguments, and an absent or throwing face leaves the component prop-free
 * instead of blanking the panel (the renderer applies the same rule).
 * @param inject - the entry's type-erased inject face.
 * @returns the props to pass to the component, and whether the face answered.
 */
function injectedFace(inject: unknown): { readonly injected: Record<string, unknown>; readonly resolved: boolean } {
  if (typeof inject !== 'function') return { injected: NO_INJECTED, resolved: true }
  try {
    const face = (inject as () => Record<string, unknown> | null | undefined)()
    return { injected: face ?? NO_INJECTED, resolved: true }
  } catch (error) {
    console.error('ui-sdkwork-markets: embedded panel inject failed; drawing it without injected props:', error)
    return { injected: NO_INJECTED, resolved: false }
  }
}
