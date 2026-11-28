/**
 * The bridge to the SDKWork MCP connector plugin's panel.
 *
 * The connector is a separate package (`@sdkwork/dsh-mcp-connector`,
 * a first-party plugin under this repository's `plugins/` directory and mounted
 * by the web-app bundle patch), not a page this plugin owns. It publishes no
 * client control service: its browser half registers a keyed `main` panel plus
 * its sidebar row, and its Host half serves the panel's whole interface as a
 * same-origin page at `/mcp-connector/ui/`. The plugin's own panel draws that
 * page in an iframe, so the Connectors tab does the same —the connector market
 * (whose entries are served by the `sdkwork-mcp` application's catalog), the
 * installed connections, the tool workbench, OAuth and API-key authorization,
 * JSON import, scopes, governance and the connection diagnostics all stay the
 * plugin's.
 *
 * Two things cross that frame, and both are the plugin's own protocol, so they
 * are written here as explicit contracts rather than as strings in the render
 * code:
 *
 * - the workspace scope the page reads on load and on request, so a new
 *   connection can default to the current Workspace; and
 * - the example-Prompt hand-off: the page asks the embedding page to open a
 *   conversation pre-filled with a connector's prompt.
 *
 * The bundle acceptance spec reads the shipped `ui/index.html` and
 * `lib/client.js` and fails if either half ever renames one of these message
 * types, which is the only way this page can silently lose the hand-off.
 *
 * The source is optional by construction: a deployment that disables the row
 * keeps a complete page (the unavailable notice) instead of an iframe pointing
 * at a route nobody serves, so every read answers `undefined` until a panel
 * with that key is registered.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/mcpConnectorPanel
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { watchPanelComponent, type MainPanelLedger } from './mainPanelWatch.ts'

/**
 * The keyed `main` panel the SDKWork MCP connector plugin registers its
 * connector surface under. It is also the id of that plugin's
 * `sidebar.panellist` row, which this page's tab suppresses.
 */
export const MCP_CONNECTOR_PANEL_ID = 'mcp-connector'

/** The same-origin page the plugin serves for its panel. */
export const MCP_CONNECTOR_SURFACE_PATH = '/mcp-connector/ui/'

/**
 * The plugin's frame protocol. The names are its constants, not ours; a
 * rename upstream is what the bundle acceptance spec pins.
 *
 * The connector's own toolbar (view switch, search, add, language) moves into
 * the application header when the page is framed — the Skills tab's arrangement
 * — so the protocol carries both halves of that contract: the host sends
 * toolbar state and commands down (`hostToolbar`, `hostView`, `hostSearch`,
 * `hostAdd`, `hostLocale`) and the page reports what it shows (`hostState`).
 */
export const MCP_CONNECTOR_FRAME_TYPES = {
  /** Embedded page → host frame: send the workspace scope now. */
  workspaceContextRequest: 'mcp-connector:workspace-context-request',
  /** Host frame → embedded page: the workspace scope, on load and on request. */
  workspaceContext: 'mcp-connector:workspace-context',
  /** Embedded page → host frame: open a conversation pre-filled with `prompt`. */
  startSession: 'mcp-connector:start-session',
  /** Host frame → embedded page: the outcome of one `startSession` request. */
  startSessionResult: 'mcp-connector:start-session-result',
  /** Embedded page → host frame: the connector detail view opened or closed. */
  detailState: 'mcp-connector:detail-state',
  /** Host frame → embedded page: the host header owns the toolbar. */
  hostToolbar: 'mcp-connector:host-toolbar',
  /** Host frame → embedded page: switch the visible view. */
  hostView: 'mcp-connector:host-view',
  /** Host frame → embedded page: apply the header search field's text. */
  hostSearch: 'mcp-connector:host-search',
  /** Host frame → embedded page: open the add-connection dialog. */
  hostAdd: 'mcp-connector:host-add',
  /** Host frame → embedded page: reload the shelf from the cloud catalog. */
  hostRefresh: 'mcp-connector:host-refresh',
  /** Embedded page → host frame: the active view and the two counts. */
  hostState: 'mcp-connector:host-state',
  /** Embedded page → host frame: what language is the application showing? */
  hostLocaleRequest: 'mcp-connector:host-locale-request',
  /** Host frame → embedded page: the application's locale. */
  hostLocale: 'mcp-connector:host-locale',
} as const

/** The connector panel's three views, in the order the header lists them. */
export type McpConnectorView = 'market' | 'installed' | 'tools'

/** What the embedded page reports about what it is showing. */
export interface McpConnectorHostState {
  /** The visible view. */
  readonly view: McpConnectorView
  /** Row counts for the two list views, as the page counted them. */
  readonly counts: { readonly market: number; readonly installed: number }
}

/** One Workspace the connector panel offers as a connection scope. */
export interface McpConnectorWorkspace {
  /** Host Workspace identity, as the connection record stores it. */
  readonly workspaceId: WorkspaceId
  /** Display title; the plugin falls back to the id when it is absent. */
  readonly title: string
}

/** The surface this page embeds for the connector panel. */
export interface McpConnectorPanel {
  /** The plugin's panel page, resolved against this application's origin. */
  readonly src: string
}

/** The subset of the slot registry this module reads. */
export type McpConnectorPanelLedger = MainPanelLedger

/** The panel source plus its owner's disposal. */
export interface McpConnectorPanelSource extends HostObservable<McpConnectorPanel | undefined> {
  /** Stop observing the ledger (the plugin's own effect scope owns this). */
  dispose(): void
}

/**
 * Create the live source for the connector panel.
 * @param slots - the slot registry the page's plugin already injects.
 * @returns the observable panel and the owner's disposal.
 */
export function createMcpConnectorPanelSource(slots: McpConnectorPanelLedger): McpConnectorPanelSource {
  const entry = watchPanelComponent(slots, MCP_CONNECTOR_PANEL_ID)
  /** One wrapper object per registration, so the page's snapshot never churns. */
  const present: McpConnectorPanel = { src: MCP_CONNECTOR_SURFACE_PATH }
  return {
    getSnapshot: () => (entry.getSnapshot() === undefined ? undefined : present),
    subscribe(listener) {
      return entry.subscribe(listener)
    },
    dispose() {
      entry.dispose()
    },
  }
}
