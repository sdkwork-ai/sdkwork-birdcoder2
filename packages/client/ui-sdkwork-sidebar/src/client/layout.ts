/**
 * The left column's user-owned layout preference: which contributed entries the
 * column draws.
 *
 * One snapshot store persisted to localStorage holds the hidden id set; the
 * settings page is the only writer and the shell is the reader. Storing the
 * HIDDEN direction — not the shown one — is what makes a newly shipped entry
 * visible by default: an id absent from the set renders, so a plugin that
 * registers after the preference was written joins the column without a
 * migration, while an unknown id left behind by a removed plugin is inert and
 * applies again when that plugin returns.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** localStorage key the preference persists under. */
export const SIDEBAR_LAYOUT_STORAGE_KEY = 'dsh.sidebarLayout'

/** The groups the settings page stacks, in display order. */
export const SIDEBAR_ITEM_GROUPS = ['actions', 'pages', 'panels'] as const

/** One group of entries the column draws: quick entries, registry pages, panel rows. */
export type SidebarItemGroup = typeof SIDEBAR_ITEM_GROUPS[number]

/** One row the column can draw and the settings page can show or hide. */
export interface SidebarItem {
  /** Stable id: the `sidebar.actions` registration id, the page id, or the panel id. */
  readonly id: string
  /** Which stack the row belongs to. */
  readonly group: SidebarItemGroup
  /** Display title, already resolved for the active locale. */
  readonly title: string
  /** Ascending position inside its group. */
  readonly order: number
}

/** What the shell and the settings page read: the rows the column can draw and the hidden ids. */
export interface SidebarLayoutSnapshot {
  /** Every row the column can draw, grouped and ordered. */
  readonly items: readonly SidebarItem[]
  /** Ids the user switched off; any id not listed here renders. */
  readonly hidden: readonly string[]
}

/** One contribution's resolved identity, as the item list collects it. */
export interface SidebarItemSource {
  /** The contribution's stable id. */
  readonly id: string
  /** Locale-resolved display title. */
  readonly title: string
  /** Ascending position inside its group. */
  readonly order: number
}

/** The three ledger projections the item list is built from. */
export interface SidebarLayoutSources {
  /** `sidebar.actions` quick-entry registrations. */
  readonly actions: readonly SidebarItemSource[]
  /** `ctx.sdkworkSidebar` registry pages. */
  readonly pages: readonly SidebarItemSource[]
  /** Global panel rows the column draws. */
  readonly panels: readonly SidebarItemSource[]
}

/**
 * Sort one contribution group into rows. Array.prototype.sort is stable, so
 * equal orders keep the ledger's registration order.
 * @param group - the group the rows belong to.
 * @param rows - the group's resolved contributions.
 * @returns the group's rows in display order.
 */
function groupItems(group: SidebarItemGroup, rows: readonly SidebarItemSource[]): readonly SidebarItem[] {
  return [...rows]
    .sort((left, right) => left.order - right.order)
    .map(row => ({ id: row.id, group, title: row.title, order: row.order }))
}

/**
 * Build the settings page's row list: each group sorted by its own order, the
 * groups stacked quick entries, then pages, then panels.
 * @param sources - the resolved contributions of the column.
 * @returns the grouped rows in display order.
 */
export function sidebarItems(sources: SidebarLayoutSources): readonly SidebarItem[] {
  return SIDEBAR_ITEM_GROUPS.flatMap(group => groupItems(group, sources[group]))
}

/**
 * Whether two published snapshots describe the same layout. A locale refresh or
 * a slot tick that changed nothing must not wake every subscriber — the layout
 * store is read by the column on every render.
 * @param left - the published snapshot.
 * @param right - the candidate snapshot.
 * @returns whether the two describe the same rows and hidden set.
 */
export function sameSidebarLayout(left: SidebarLayoutSnapshot, right: SidebarLayoutSnapshot): boolean {
  if (left.hidden.length !== right.hidden.length) return false
  if (left.hidden.some((id, index) => id !== right.hidden[index])) return false
  if (left.items.length !== right.items.length) return false
  return left.items.every((item, index) => {
    const candidate = right.items[index]
    return candidate.id === item.id
      && candidate.group === item.group && candidate.title === item.title
  })
}

/** Read/write face of the persisted hidden-id set (useSyncExternalStore-compatible). */
export interface SidebarLayoutPreference {
  /** @returns the current hidden ids (stable reference between changes). */
  get(): readonly string[]
  /**
   * Observe preference changes.
   * @param listener - called after every mutation that changes the hidden set.
   * @returns the unsubscribe disposer.
   */
  subscribe(listener: () => void): () => void
  /**
   * Show or hide one entry by id.
   * @param id - the row's stable id.
   * @param visible - whether the column draws the row.
   */
  setVisible(id: string, visible: boolean): void
  /** Restore the shipped preference: every entry visible. */
  reset(): void
}

/**
 * Normalize a rehydrated hidden list: drop blank ids and duplicates so the
 * stored value stays a set. Non-string entries arrive only from a corrupted
 * blob and are dropped rather than trusted.
 * @param value - the rehydrated field, read as unknown JSON.
 * @returns the normalized id list.
 */
function normalizeHidden(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') continue
    seen.add(entry)
  }
  return [...seen]
}

/**
 * Create the left column's layout preference. The instance lives with the
 * plugin, so the choice survives column mount cycles; the localStorage blob
 * survives page loads, and storage failures only disable persistence.
 * @returns the preference face.
 */
export function createSidebarLayoutPreference(): SidebarLayoutPreference {
  const store = createSnapshotStore<{ readonly hidden: readonly string[] }>(
    { hidden: [] },
    { persist: { name: SIDEBAR_LAYOUT_STORAGE_KEY } },
  )
  // Rehydration loads the stored blob verbatim; normalize once here so the
  // set contract holds before any reader subscribes.
  store.set({ hidden: normalizeHidden(store.getSnapshot().hidden) })
  return {
    get: () => store.getSnapshot().hidden,
    subscribe: listener => store.subscribe(listener),
    setVisible: (id, visible) => {
      const hidden = store.getSnapshot().hidden
      if (visible === !hidden.includes(id)) return
      store.set({ hidden: visible ? hidden.filter(entry => entry !== id) : [...hidden, id] })
    },
    reset: () => {
      if (store.getSnapshot().hidden.length === 0) return
      store.set({ hidden: [] })
    },
  }
}
