/**
 * The left column's user-owned layout preference: which contributed entries the
 * column draws.
 *
 * One snapshot store persisted to localStorage holds the hidden id set and the
 * shipped-default version it was written under; the settings page is the only
 * writer and the shell is the reader. Storing the HIDDEN direction — not the
 * shown one — is what makes a newly shipped entry visible by default: an id
 * absent from the set renders, so a plugin that registers after the preference
 * was written joins the column without a migration, while an unknown id left
 * behind by a removed plugin is inert and applies again when that plugin
 * returns. The one exception is {@link SHIPPED_HIDDEN_ENTRY_IDS}, whose rows
 * ship out of the column and are switched on from the settings page.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** localStorage key the preference persists under. */
export const SIDEBAR_LAYOUT_STORAGE_KEY = 'dsh.sidebarLayout'

/**
 * Version of the shipped defaults. A persisted blob written before this version
 * is normalized once by {@link normalizeLayout}, which applies
 * {@link SHIPPED_HIDDEN_ENTRY_IDS} to an installation that predates them;
 * bump the version whenever the shipped hidden set changes so existing
 * preferences pick the change up.
 */
const SIDEBAR_LAYOUT_VERSION = 1

/**
 * Quick entries the shipped column leaves out of the New Session stack: the
 * three SDKWork storefront surfaces are opt-in, so their rows start hidden and
 * the Sidebar settings page is how a user switches one on. The ids are the
 * `sidebar.actions` registration ids of ui-sdkwork-appstore,
 * ui-sdkwork-template-library and ui-sdkwork-demand-hall. They live here
 * because the preference is created before any entry registers and a feature
 * plugin may not import another plugin's values.
 */
export const SHIPPED_HIDDEN_ENTRY_IDS: readonly string[] = [
  'sdkwork-appstore',
  'sdkwork-template-library',
  'sdkwork-demand-hall',
]

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
  /** Restore the shipped preference: the rows outside {@link SHIPPED_HIDDEN_ENTRY_IDS} visible. */
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

/** The persisted preference: the hidden set plus the shipped-default version that produced it. */
interface SidebarLayoutState {
  /** Ids the user switched off; any id not listed here renders. */
  readonly hidden: readonly string[]
  /** {@link SIDEBAR_LAYOUT_VERSION} the state was written under. */
  readonly version: number
}

/**
 * Normalize a rehydrated preference into the current shape. An installation
 * that stored its hidden set before this version never saw the shipped hidden
 * rows, so the shipped ids are added to its set once; a blob already at this
 * version keeps exactly the user's choice, including one that switched a
 * shipped-hidden row back on.
 * @param value - the rehydrated blob, read as unknown JSON.
 * @returns the normalized preference at the current version.
 */
function normalizeLayout(value: unknown): SidebarLayoutState {
  const record = typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
  const hidden = normalizeHidden(record.hidden)
  const version = typeof record.version === 'number' && Number.isFinite(record.version) ? record.version : 0
  if (version >= SIDEBAR_LAYOUT_VERSION) return { hidden, version: SIDEBAR_LAYOUT_VERSION }
  return {
    hidden: [...hidden, ...SHIPPED_HIDDEN_ENTRY_IDS.filter(id => !hidden.includes(id))],
    version: SIDEBAR_LAYOUT_VERSION,
  }
}

/**
 * Create the left column's layout preference. The instance lives with the
 * plugin, so the choice survives column mount cycles; the localStorage blob
 * survives page loads, and storage failures only disable persistence.
 * @returns the preference face.
 */
export function createSidebarLayoutPreference(): SidebarLayoutPreference {
  const store = createSnapshotStore<SidebarLayoutState>(
    { hidden: [...SHIPPED_HIDDEN_ENTRY_IDS], version: SIDEBAR_LAYOUT_VERSION },
    { persist: { name: SIDEBAR_LAYOUT_STORAGE_KEY } },
  )
  // Rehydration loads the stored blob verbatim; normalize once here so the
  // set contract and the shipped default hold before any reader subscribes.
  store.set(normalizeLayout(store.getSnapshot()))
  return {
    get: () => store.getSnapshot().hidden,
    subscribe: listener => store.subscribe(listener),
    setVisible: (id, visible) => {
      const state = store.getSnapshot()
      if (visible === !state.hidden.includes(id)) return
      store.set({
        hidden: visible ? state.hidden.filter(entry => entry !== id) : [...state.hidden, id],
        version: state.version,
      })
    },
    reset: () => {
      const { hidden, version } = store.getSnapshot()
      if (hidden.length === SHIPPED_HIDDEN_ENTRY_IDS.length
        && hidden.every((id, index) => id === SHIPPED_HIDDEN_ENTRY_IDS[index])) return
      store.set({ hidden: [...SHIPPED_HIDDEN_ENTRY_IDS], version })
    },
  }
}
