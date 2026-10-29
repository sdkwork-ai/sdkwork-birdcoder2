/**
 * The user-owned mode-rail layout: which customizable entries the rail shows
 * and in what order. One snapshot store with built-in localStorage
 * persistence; the customize dialog is the only writer and the rail is the
 * only reader. A rehydrated blob is normalized against the current
 * vocabulary on creation, so a renamed or removed mode id cannot resurrect a
 * stale entry and a newly shipped mode appends instead of being swallowed.
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  CUSTOMIZABLE_MODES, DEFAULT_HIDDEN, FIXED_MODES, SHIPPED_VISIBLE_MODES, isRailModeId, type RailModeId,
} from './rail-modes.ts'

/** localStorage key the snapshot store persists the layout under. */
const STORAGE_KEY = 'dsh.railLayout'

/**
 * localStorage key recording which shipped-default revision the stored layout
 * has adopted.
 */
const REVISION_KEY = 'dsh.railLayoutRevision'

/**
 * Shipped-default revision. Bump it whenever a mode's shipped visibility
 * changes, so a layout written under the previous defaults adopts the new one
 * once instead of preserving a choice the user never made. Revision 2 put App
 * Store on the rail.
 */
export const LAYOUT_REVISION = 2

/** The durable rail layout: full display order of customizable modes plus the hidden subset. */
export interface RailLayoutState {
  /** Every customizable mode in display order, hidden ones included. */
  readonly order: readonly RailModeId[]
  /** Modes kept out of the rail; always a subset of {@link RailLayoutState.order}. */
  readonly hidden: readonly RailModeId[]
}

/** The shipped layout: the fixed modes and App Store visible, in rail order. */
const DEFAULT_LAYOUT: RailLayoutState = {
  order: CUSTOMIZABLE_MODES,
  hidden: DEFAULT_HIDDEN,
}

/**
 * Fold a stored layout onto the current vocabulary: the stored relative order
 * survives (the user's arrangement), unknown ids drop, duplicates collapse to
 * their first position, every mode absent from the stored order (a mode
 * shipped after it was written) appends in rail order, and a fixed mode named
 * in the stored hidden set clamps back to visible.
 * @param value - the rehydrated (or default) layout, read as unknown JSON.
 * @returns the normalized layout.
 */
function normalizeLayout(value: RailLayoutState): RailLayoutState {
  const rawOrder: unknown[] = Array.isArray(value.order) ? [...value.order] : []
  const seen: RailModeId[] = []
  for (const id of rawOrder) {
    if (typeof id === 'string' && isRailModeId(id) && !seen.includes(id)) seen.push(id)
  }
  const order = [...seen, ...CUSTOMIZABLE_MODES.filter(id => !seen.includes(id))]
  const rawHidden: unknown[] = Array.isArray(value.hidden) ? [...value.hidden] : []
  const hidden = order.filter(id => rawHidden.includes(id) && !FIXED_MODES.includes(id))
  return { order, hidden }
}

/** @returns the shipped-default revision the stored layout has adopted (0 when absent). */
function readLayoutRevision(): number {
  try {
    const stored = localStorage.getItem(REVISION_KEY)
    if (stored === null) return 0
    const parsed = Number(stored)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    // Storage unavailable: treat the layout as current rather than migrating
    // it on every mount.
    return LAYOUT_REVISION
  }
}

/** Record that the stored layout has adopted {@link LAYOUT_REVISION}. */
function writeLayoutRevision(): void {
  try {
    localStorage.setItem(REVISION_KEY, String(LAYOUT_REVISION))
  } catch {
    // Storage unavailable: the next launch retries the (idempotent) migration.
  }
}

/** Read/write/subscribe face of the rail layout (useSyncExternalStore-compatible). */
export interface RailLayoutStore {
  /** @returns the current layout snapshot (stable reference between changes). */
  get(): RailLayoutState
  /**
   * Observe layout changes.
   * @param listener - called after every mutation that changes the layout.
   * @returns the unsubscribe disposer.
   */
  subscribe(listener: () => void): () => void
  /**
   * Show or hide one customizable entry. Hiding a fixed mode is a no-op: the
   * fixed modes (Code, Video, Image, Knowledge Base, Assets) always render.
   * @param mode - the mode id.
   * @param visible - whether the rail renders its entry.
   */
  setVisible(mode: RailModeId, visible: boolean): void
  /**
   * Move one customizable entry before another in the display order (the
   * drag-drop and keyboard reorder primitive). `undefined` moves it to the end.
   * @param mode - the mode id to move.
   * @param reference - the id to place `mode` before, or `undefined` for the end.
   */
  moveBefore(mode: RailModeId, reference: RailModeId | undefined): void
  /** Restore the shipped layout (DEFAULT_VISIBLE_COUNT entries, rail order). */
  reset(): void
}

/**
 * Create the rail layout store. The instance lives with the plugin (created
 * in apply), so the preference survives rail mount cycles; the localStorage
 * blob survives page loads through the snapshot store's persistence.
 * @returns the store face.
 */
export function createRailLayoutStore(): RailLayoutStore {
  const store = createSnapshotStore<RailLayoutState>(DEFAULT_LAYOUT, { persist: { name: STORAGE_KEY } })
  // Rehydration loads the stored blob verbatim; normalize once here so the
  // vocabulary contract holds before any reader subscribes.
  store.set(normalizeLayout(store.getSnapshot()))
  // A layout written under earlier shipped defaults adopts the modes whose
  // shipped visibility changed since then — once. A choice the user makes
  // afterwards is stored against the current revision and survives.
  if (readLayoutRevision() < LAYOUT_REVISION) {
    const current = store.getSnapshot()
    const hidden = current.hidden.filter(id => !SHIPPED_VISIBLE_MODES.includes(id))
    if (hidden.length !== current.hidden.length) store.set({ order: current.order, hidden })
    writeLayoutRevision()
  }
  return {
    get: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
    setVisible: (mode, visible) => {
      if (!visible && FIXED_MODES.includes(mode)) return
      const current = store.getSnapshot()
      const isHidden = current.hidden.includes(mode)
      if (visible === !isHidden) return
      store.set({
        order: current.order,
        hidden: visible ? current.hidden.filter(id => id !== mode) : [...current.hidden, mode],
      })
    },
    moveBefore: (mode, reference) => {
      const rest = store.getSnapshot().order.filter(id => id !== mode)
      const index = reference === undefined ? rest.length : rest.indexOf(reference)
      if (index === -1) return
      const order = [...rest.slice(0, index), mode, ...rest.slice(index)]
      if (order.every((id, position) => id === store.getSnapshot().order[position])) return
      store.set({ order, hidden: store.getSnapshot().hidden })
    },
    reset: () => {
      store.set(normalizeLayout(DEFAULT_LAYOUT))
    },
  }
}
