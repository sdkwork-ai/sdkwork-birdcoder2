/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry and main-panel selection live in the root layout store;
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (main-panel selection and sidebar toggle,
 * right-panel show/hide from ui-sidebar-right) — writes stay inside the
 * store's declared action set, shared with the root registration.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { SIDEBAR_DEFAULT } from './columns.ts'
import type { AppModeId } from './modes.ts'
import type { createLayoutStore } from './stores.ts'

/** Identity shared by a sidebar panel entry and its main-slot occupant. */
export type MainPanelId = Branded<'MainPanelId'>

/** Root-scoped navigation state exposed to panel-aware components. */
export interface PanelInfo {
  /** Selected global panel; null displays the current Conversation. */
  readonly activePanelId: MainPanelId | null
}

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/** Panel navigation and geometry actions exposed through ctx.layout. */
export interface ILayout {
  /**
   * Select a global central panel without changing the current Session.
   * @param panelId - registered main key, or null to show the Conversation.
   * @throws if the selected main key is not registered; preserves the current selection.
   */
  selectPanel(panelId: MainPanelId | null): void
  /**
   * Start an asynchronous navigation, superseding any earlier pending navigation.
   * @returns a signal aborted by the next navigation or layout disposal; check it before committing UI state.
   */
  beginNavigation(): AbortSignal
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /**
   * Report the right panel's presentation without changing its expanded state.
   * @param track - whether the normal panel width reserves a grid track,
   *   including beneath a fullscreen overlay.
   * @param fullscreen - whether the panel covers the frame and hides its outer
   *   resize handle; independent of the underlying grid track.
   */
  openRightbar(track: boolean, fullscreen: boolean): void
  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void
  /**
   * Show or hide the sidebar panel through the persisted preference:
   * visible reopens at the contract default width, hidden collapses to the
   * compact control rail (the layout's recoverable minimum).
   * @param visible - whether the sidebar should render wide content.
   */
  setSidebarVisible(visible: boolean): void
  /**
   * Switch the frame's active app mode (same store channel the mode rail
   * drives; no-op when already active). Any code-surface overlay closes and
   * the main panel returns to the Conversation.
   * @param mode - the surface to show in the center column.
   */
  setMode(mode: AppModeId): void
  /**
   * Open a sidebar-launched module as an overlay *inside* the code surface.
   * Unlike {@link setMode}, the rail selection stays `code` — the code rail
   * entry keeps its highlight while the center column shows the module page.
   * @param mode - the overlay module page to show (markets, pull-request, automation).
   */
  openPanel(mode: AppModeId): void
  /**
   * Close any code-surface overlay and return the center column to the
   * code surface (no-op when no overlay is open).
   */
  closePanel(): void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  private navigation = new AbortController()

  /**
   * @param panels - actions of the instance shared with the root entry.
   * @param hasMainPanel - checks the live main-slot registry for a panel id.
   */
  constructor(
    private readonly panels: PanelActions,
    private readonly hasMainPanel: (id: MainPanelId) => boolean,
  ) {}

  /** Select a global panel or return to the Conversation. */
  selectPanel(panelId: MainPanelId | null): void {
    if (panelId !== null && !this.hasMainPanel(panelId)) {
      throw new Error(`layout.selectPanel: main panel "${panelId}" is not registered`)
    }
    this.navigation.abort()
    this.panels.selectPanel(panelId)
  }

  /** @returns the new pending navigation's cancellation signal. */
  beginNavigation(): AbortSignal {
    this.navigation.abort()
    this.navigation = new AbortController()
    return this.navigation.signal
  }

  /** Invalidate pending navigations when the layout owner is unloaded. */
  dispose(): void {
    this.navigation.abort()
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.panels.toggleSidebar()
  }

  /** Report the right panel's track and fullscreen presentation. */
  openRightbar(track: boolean, fullscreen: boolean): void {
    this.panels.openRightbar(track, fullscreen)
  }

  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void {
    this.panels.closeRightbar()
  }

  /** Show or hide the sidebar panel (see {@link ILayout.setSidebarVisible}). */
  setSidebarVisible(visible: boolean): void {
    this.panels.setSidebar(visible ? SIDEBAR_DEFAULT : 0)
  }

  /** Switch the frame's active app mode (see {@link ILayout.setMode}). */
  setMode(mode: AppModeId): void {
    this.panels.setMode(mode)
  }

  /** Open a code-surface overlay (see {@link ILayout.openPanel}). */
  openPanel(mode: AppModeId): void {
    this.panels.setPanelMode(mode)
  }

  /** Close the code-surface overlay (see {@link ILayout.closePanel}). */
  closePanel(): void {
    this.panels.setPanelMode(undefined)
  }
}
