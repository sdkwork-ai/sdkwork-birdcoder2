/**
 * The left sidebar's row registry: this fork's projection of
 * `dsh-better-sidebar`'s `ctx.betterSidebar.registerTab` model onto the
 * navigation column, plus the one fact the column cannot read from a slot:
 * which global panels it must not list.
 *
 * The upstream plugin (vendored under `plugins/dsh-better-sidebar`, never
 * edited here) models its workbench as a set of PAGES that plugins contribute
 * through a service: each page is `{ id, title, icon, order }` and the host
 * renders one row plus the page body. The fork's left column is a navigation
 * column rather than a workbench, so it keeps the same contribution shape but
 * adds the activation the column needs: `open()` is what the row does when it
 * is clicked (today: open a mode overlay or select a main panel).
 *
 * Why a service and not another list slot: a page must be able to arrive from
 * a plugin that contributes no component of its own. `sidebar.actions` and
 * `sidebar.panellist` stay the seats for entries that need bespoke chrome
 * (shortcut chips, pin menus, live badges); a plain icon+title page uses this
 * registry and lets the shell draw the row.
 *
 * Panel suppression lives here for the mirror-image reason: a row the column
 * must NOT draw cannot be expressed by a slot registration, because the row
 * comes from a plugin that registered it for its own use. The surface that
 * embeds that panel's content owns its navigation, so it declares the panel as
 * embedded here and the column leaves the row out — the same rule the column
 * already applies to a panel the mode rail exposes as a shortcut, with the
 * declaring surface as the authority instead of a second seat.
 *
 * Contract alignment is test-enforced rather than assumed:
 * `tests/better-sidebar-contract.client.spec.ts` reads the vendored
 * `src/client/service.ts` and fails when the descriptor fields this file
 * mirrors (`id`, `title`, `icon`, `order`) disappear there, or when the
 * submodule has local modifications.
 */
import type { ReactNode } from 'react'

/** Geometry and selection state handed to a page's glyph. */
export interface SidebarPageGlyphProps {
  /** Requested square edge in pixels (16 wide, 18 in the collapsed rail). */
  readonly size: number
  /** Whether the page is the current one; pages that cannot be current ignore it. */
  readonly active: boolean
}

/**
 * One page a plugin contributes to the left column.
 *
 * Mirrors `dsh-better-sidebar`'s `TabDescriptor` for `id`, `title`, `icon` and
 * `order`; `open` is this column's analogue of selecting a tab.
 */
export interface SidebarPageDescriptor {
  /** Stable page id, unique across the registry. */
  readonly id: string
  /** Row title and accessible name; a function is re-read on locale change. */
  readonly title: string | (() => string)
  /** Draws the row glyph; receives the shell's geometry and selection state. */
  readonly icon: (props: SidebarPageGlyphProps) => ReactNode
  /** Ascending row order; ties keep registration order. Defaults to `0`. */
  readonly order?: number
  /** Activate the page: what the row does when clicked or keyboard-activated. */
  readonly open: () => void
}

/** A registered page with its title and order resolved for rendering. */
export interface SidebarPage {
  readonly id: string
  readonly title: string
  readonly order: number
  readonly icon: (props: SidebarPageGlyphProps) => ReactNode
  readonly open: () => void
}

/** The service published as `ctx.sdkworkSidebar`. */
export interface SidebarPageRegistry {
  /**
   * Contribute one page to the left column.
   * @param page - Page descriptor; ids are unique.
   * @returns Disposer removing the page (Cordis effect-compatible).
   * @throws when the id is empty or already registered.
   */
  registerPage(page: SidebarPageDescriptor): () => void
  /**
   * Read the current page list in render order.
   * @returns The same array reference until a page, a title or an order changes.
   */
  getPages(): readonly SidebarPage[]
  /**
   * Subscribe to page-list changes.
   * @param listener - Called after every change that alters {@link getPages} or
   * {@link getSuppressedPanels}.
   * @returns Disposer removing the listener.
   */
  subscribe(listener: () => void): () => void
  /**
   * Re-resolve every page title, for locale switches that change a
   * function-valued `title`.
   */
  refreshTitles(): void
  /**
   * Suppress the column's row for one global panel: the caller embeds that
   * panel's content, so it owns the panel's navigation and the row would be a
   * second entry to the same page. Suppressing an id twice is idempotent.
   * @param panelId - the panel's registered id (its `main` panel key).
   * @returns Disposer restoring the row (Cordis effect-compatible).
   */
  suppressPanel(panelId: string): () => void
  /**
   * Read the panel ids whose rows the column omits.
   * @returns The same set reference until a suppression changes.
   */
  getSuppressedPanels(): ReadonlySet<string>
}

/**
 * Create the left column's page registry.
 * @returns The empty registry: no page is registered until a plugin adds one.
 */
export function createSidebarPageRegistry(): SidebarPageRegistry {
  const descriptors = new Map<string, SidebarPageDescriptor>()
  const suppressed = new Set<string>()
  const listeners = new Set<() => void>()
  let snapshot: readonly SidebarPage[] | undefined

  const resolve = (descriptor: SidebarPageDescriptor): SidebarPage => ({
    id: descriptor.id,
    title: typeof descriptor.title === 'function' ? descriptor.title() : descriptor.title,
    order: descriptor.order ?? 0,
    icon: descriptor.icon,
    open: descriptor.open,
  })

  const rebuild = (): void => {
    // Array.prototype.sort is stable, so equal orders keep registration order.
    snapshot = [...descriptors.values()].map(resolve).sort((left, right) => left.order - right.order)
    for (const listener of [...listeners]) listener()
  }

  return {
    registerPage(page) {
      if (page.id.trim() === '') throw new Error('sidebar page: id must not be empty')
      if (descriptors.has(page.id)) throw new Error(`sidebar page "${page.id}" is already registered`)
      descriptors.set(page.id, page)
      rebuild()
      return () => {
        if (descriptors.get(page.id) !== page) return
        descriptors.delete(page.id)
        rebuild()
      }
    },
    getPages() {
      snapshot ??= [...descriptors.values()].map(resolve).sort((left, right) => left.order - right.order)
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refreshTitles() {
      rebuild()
    },
    suppressPanel(panelId) {
      if (suppressed.has(panelId)) return () => {}
      suppressed.add(panelId)
      rebuild()
      return () => {
        if (!suppressed.delete(panelId)) return
        rebuild()
      }
    },
    getSuppressedPanels() {
      return suppressed
    },
  }
}
