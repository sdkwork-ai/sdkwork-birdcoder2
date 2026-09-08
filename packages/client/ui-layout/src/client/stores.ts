/**
 * The root entry's transient layout store: panel geometry as plain widths in
 * px (0 = closed). Module level exports the factory only — a module-level
 * handle would pin the store's identity in the module
 * cache (a de-facto singleton surviving plugin reloads). register() receives
 * the factory (exclusive use: the framework instantiates per entry), AppFrame
 * derives its PropsStore share from the return type, and the service face
 * receives the bound actions through the registration's inject hook.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import {
  clampWidth, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'
import { MODE_DEFAULT, type AppModeId } from './modes.ts'

/**
 * Layout store state: panel geometry as plain widths in px (0 = closed),
 * plus the narrow-viewport pair, the active app mode, and the code-surface
 * overlay mode.
 *
 * `mode` is the frame's *rail selection* — which app-mode entry stays lit in
 * the mode rail. `panelMode` is the *center-column surface* when it differs
 * from the rail: the sidebar-launched modules (Pull Request, automation,
 * markets) are opened as overlays *inside* the code surface (see openPanel),
 * so `mode` stays `code`, the code rail entry keeps its selection, and only
 * the center column shows the module page. Rail-driven modes (video, image,
 * appstore, …) switch `mode` directly and clear any overlay.
 */
type LayoutState = {
  sidebar: number
  details: number
  narrow: boolean
  narrowExpanded: boolean
  mode: AppModeId
  panelMode: AppModeId | undefined
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type LayoutActions = {
  setSidebar: (draft: LayoutState, px: number) => void
  setDetails: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  setNarrow: (draft: LayoutState, narrow: boolean) => void
  setMode: (draft: LayoutState, mode: AppModeId) => void
  setPanelMode: (draft: LayoutState, mode: AppModeId | undefined) => void
  openDetails: (draft: LayoutState) => void
  closeDetails: (draft: LayoutState) => void
}

/**
 * Create the layout panel store handle. The preference IS the width, so
 * closing a panel forgets its drag width — reopening restores the contract
 * default. Actions are the complete write set: drag writes clamp
 * into the panel's contract range and never cross the open/closed line;
 * open/close transitions write 0 / the default explicitly. Below the
 * auto-collapse breakpoint (AppFrame feeds setNarrow) the sidebar toggle
 * flips the narrowExpanded override instead of the preference.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>  {
  const handle = defineStore({
    init: (): LayoutState => ({
      sidebar: SIDEBAR_DEFAULT, details: 0, narrow: false, narrowExpanded: false,
      mode: MODE_DEFAULT, panelMode: undefined,
    }),
    actions: {
      setSidebar: (d, px: number) => { d.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX) },
      setDetails: (d, px: number) => { d.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX) },
      // Narrow toggles flip only the override: the width preference survives
      // untouched, so re-widening restores the pre-squeeze layout.
      toggleSidebar: (d) => {
        if (d.narrow) d.narrowExpanded = !d.narrowExpanded
        else d.sidebar = d.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      setNarrow: (d, narrow: boolean) => {
        if (d.narrow === narrow) return
        d.narrow = narrow
        d.narrowExpanded = false
      },
      // A rail-mode switch owns the center column outright: switching mode
      // always dismisses any code-surface overlay (the conversation, a rail
      // mode, or a returned overlay all need the overlay cleared).
      setMode: (d, mode: AppModeId) => {
        d.mode = mode
        d.panelMode = undefined
      },
      // Open or close the code-surface overlay without touching the rail
      // selection: the sidebar-launched modules render over the code surface
      // while `mode` stays `code`, so the code rail entry keeps its selection.
      setPanelMode: (d, mode: AppModeId | undefined) => { d.panelMode = mode },
      openDetails: (d) => { if (d.details === 0) d.details = DETAILS_DEFAULT },
      closeDetails: (d) => { d.details = 0 },
    },
  })
  return handle
}
