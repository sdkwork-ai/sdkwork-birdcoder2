/** Explorer tab ledger: the VSCode-style strip's state, as a plain external store. */

/** One explorer tab: a read-only file view, an editable source view, an applied-change diff preview, or an embedded web view. */
export interface ExplorerTab {
  /** Stable unique tab id (monotonic per store). */
  readonly id: string
  /** Tab body kind ('source' = the editable source view of a diff/patch file; 'diff' = the applied-change preview). */
  readonly kind: 'file' | 'source' | 'web' | 'diff'
  /** Strip display title (file basename or trimmed URL host). */
  readonly title: string
  /** Absolute file path (file tabs). */
  readonly path?: string | undefined
  /** Session workspace root the path was opened against (file tabs). */
  readonly cwd?: string | undefined
  /** Absolute http(s) URL (web tabs). */
  readonly url?: string | undefined
  /** The applied hunks the tab previews, in file order (diff tabs). */
  readonly hunks?: readonly { path: string; oldText: string | null; newText: string }[] | undefined
}

/** Immutable strip snapshot consumed through `useSyncExternalStore`. */
export interface ExplorerTabsSnapshot {
  readonly tabs: readonly ExplorerTab[]
  readonly activeId: string | undefined
}

/** Deduplication key of one tab's content identity (a diff file's change view and its source view are two tabs). */
function contentKey(tab: Omit<ExplorerTab, 'id' | 'title'>): string {
  if (tab.kind === 'web') return `web:${tab.url ?? ''}`
  if (tab.kind === 'source') return `source:${tab.path ?? ''}`
  if (tab.kind === 'diff') return `diff:${tab.path ?? ''}`
  return `file:${tab.path ?? ''}`
}

/** External store holding the explorer tab strip and its active tab. */
export class TabStore {
  private state: ExplorerTabsSnapshot = { tabs: [], activeId: undefined }
  private listeners = new Set<() => void>()
  private seq = 0

  getSnapshot = (): ExplorerTabsSnapshot => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Open one tab, or activate the existing tab with the same content identity.
   * A diff tab's identity is its path, so re-opening one after a further edit
   * refreshes the preview in place (one change tab per file, like VSCode's
   * working-tree diff) instead of stacking stale tabs.
   * @param tab - tab body without its generated id.
   * @returns the (possibly pre-existing or refreshed) tab.
   */
  open(tab: Omit<ExplorerTab, 'id' | 'title'> & { title?: string | undefined }): ExplorerTab {
    const key = contentKey(tab)
    const existing = this.state.tabs.find(candidate => contentKey(candidate) === key)
    if (existing !== undefined) {
      if (existing.kind === 'diff' && tab.kind === 'diff' && tab.hunks !== undefined) {
        const refreshed = { ...existing, hunks: tab.hunks, ...(tab.cwd === undefined ? {} : { cwd: tab.cwd }) }
        this.state = {
          tabs: this.state.tabs.map(candidate => candidate.id === existing.id ? refreshed : candidate),
          activeId: existing.id,
        }
        this.emit()
        return refreshed
      }
      this.activate(existing.id)
      return existing
    }
    this.seq += 1
    const created: ExplorerTab = {
      ...tab,
      id: `explorer-tab-${this.seq}`,
      title: tab.title ?? tabTitle(tab),
    }
    this.state = { tabs: [...this.state.tabs, created], activeId: created.id }
    this.emit()
    return created
  }

  /** Close one tab; a closed active tab activates its left neighbor. */
  close(id: string): void {
    const tabs = this.state.tabs
    const index = tabs.findIndex(tab => tab.id === id)
    if (index < 0) return
    const next = tabs.filter(tab => tab.id !== id)
    const activeId = this.state.activeId === id
      ? next[Math.max(0, index - 1)]?.id
      : this.state.activeId
    this.state = { tabs: next, activeId }
    this.emit()
  }

  /** Activate one open tab (no-op for unknown ids). */
  activate(id: string): void {
    if (!this.state.tabs.some(tab => tab.id === id)) return
    if (this.state.activeId === id) return
    this.state = { tabs: this.state.tabs, activeId: id }
    this.emit()
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

/** Strip display title of one tab body. */
export function tabTitle(tab: Omit<ExplorerTab, 'id' | 'title'>): string {
  if (tab.kind === 'file' || tab.kind === 'source' || tab.kind === 'diff') {
    const segments = (tab.path ?? '').split(/[\\/]/)
    return segments[segments.length - 1] || (tab.path ?? '')
  }
  try {
    return new URL(tab.url ?? '').host || (tab.url ?? '')
  } catch {
    return tab.url ?? ''
  }
}
