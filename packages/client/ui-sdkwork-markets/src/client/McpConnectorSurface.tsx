/**
 * The Connectors tab: the SDKWork MCP connector plugin's own page, drawn in
 * place, plus the host header's half of the contract.
 *
 * The panel is another document served same-origin by the plugin's Host half,
 * so this file draws no catalog of its own: it gives that page the box the tab's
 * panel area holds and speaks the messages the page expects of its host frame
 * (see `mcpConnectorPanel.ts` for the protocol and `connectorBridge.ts` for what
 * the answers mean).
 *
 * Two directions cross the frame:
 *
 * - the page asks this frame for the Workspace scope, asks it to open a
 *   conversation for an example Prompt, and reports whether a detail view is
 *   open; and
 * - the application header owns the connector's toolbar — the view switch, the
 *   search field and the add action, the same arrangement the Skills tab uses —
 *   so this file forwards those controls down as commands and takes the page's
 *   view/count report back up for the header to draw.
 *
 * The frame's messages are accepted only from this component's own iframe and
 * only from this application's origin: the workspace scope describes where a
 * connection lands, the Prompt hand-off opens a conversation, and the toolbar
 * commands would otherwise let any same-origin page drive the panel.
 *
 * A deployment without the connector row (or one whose browser half has not
 * loaded yet) gets the notice instead, saying that the connector is unavailable
 * rather than pointing an iframe at a route nobody serves. The panel key and
 * page path are the only facts the two packages share.
 */
import { useEffect, useRef } from 'react'
import { ConnectorsIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import type { McpConnectorBridge } from './connectorBridge.ts'
import { applyConnectorTheme, readConnectorTheme } from './connectorTheme.ts'
import {
  MCP_CONNECTOR_FRAME_TYPES, type McpConnectorHostState, type McpConnectorPanel,
  type McpConnectorView, type McpConnectorWorkspace,
} from './mcpConnectorPanel.ts'
import css from './MarketsPage.module.css'

/** Props for the Connectors tab's surface. */
export interface McpConnectorSurfaceProps {
  /** The locale seat (the notice and the hand-off's replies). */
  t: (key: MarketsKey) => string
  /** The connector panel while its plugin is registered, or undefined. */
  panel: McpConnectorPanel | undefined
  /** The host-side callbacks the embedded page asks for. */
  bridge: McpConnectorBridge
  /** The application's resolved color scheme, so the framed page follows it. */
  colorScheme: 'light' | 'dark'
  /** The view the host header has selected. */
  view: McpConnectorView
  /** The host header's search text. */
  query: string
  /** The application's locale, so the framed page speaks the same language. */
  locale: 'zh-CN' | 'en'
  /**
   * One-shot commands the header raises. A counter (`seq`) makes a repeated
   * "add" the same value and a new event, so the effect can post it exactly
   * once per click.
   */
  addSeq: number
  /** The page's report of what it is showing, for the header's chips. */
  onState: (state: McpConnectorHostState) => void
  /** One-shot reload requests, raised by the header's refresh control. */
  refreshSeq: number
}

/** The shape of a message the embedded page sends this frame. */
interface ConnectorFrameMessage {
  readonly type?: unknown
  readonly requestId?: unknown
  readonly prompt?: unknown
  readonly view?: unknown
  readonly counts?: unknown
}

/** The Workspace scope message the page reads on load and on request. */
interface ConnectorWorkspaceMessage {
  readonly type: typeof MCP_CONNECTOR_FRAME_TYPES.workspaceContext
  readonly workspace: McpConnectorWorkspace | null
  readonly workspaces: readonly McpConnectorWorkspace[]
}

/** The outcome message one Prompt hand-off answers with. */
interface ConnectorSessionResult {
  readonly type: typeof MCP_CONNECTOR_FRAME_TYPES.startSessionResult
  readonly requestId: string
  readonly ok: boolean
  readonly message: string
}

/** Whether a page report names one of the panel's views. */
function isView(value: unknown): value is McpConnectorView {
  return value === 'market' || value === 'installed' || value === 'tools'
}

/** Read a non-negative count off a page report, defaulting to zero. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/**
 * Post one message to the embedded page.
 * @param frame - the mounted iframe, or null while it is not drawn.
 * @param message - the message; its `type` is the plugin's protocol constant.
 */
function postToPanel(frame: HTMLIFrameElement | null, message: unknown): void {
  frame?.contentWindow?.postMessage(message, globalThis.location.origin)
}

/**
 * Read the Workspace scope the page shows as "current project".
 * @param bridge - the host-side callbacks.
 * @returns the message the page expects, with both scope lists.
 */
function workspaceScope(bridge: McpConnectorBridge): ConnectorWorkspaceMessage {
  return {
    type: MCP_CONNECTOR_FRAME_TYPES.workspaceContext,
    workspace: bridge.workspaceContext(),
    workspaces: bridge.workspaceOptions(),
  }
}

/**
 * Render the connector panel or the notice that names its absence.
 * @param props - the locale seat, the registered panel, the callbacks and the
 * host header's toolbar state.
 * @returns the Connectors tab's panel content.
 */
export function McpConnectorSurface({
  t, panel, bridge, colorScheme, view, query, locale, addSeq, refreshSeq, onState,
}: McpConnectorSurfaceProps) {
  const frame = useRef<HTMLIFrameElement | null>(null)
  useEffect(() => {
    // The framed page is a separate document: it inherits neither this page's
    // stylesheet nor its color scheme, so the resolved host theme is projected
    // into it here. Re-running on a scheme change repaints the open panel in
    // place instead of reloading it.
    if (panel === undefined) return
    applyConnectorTheme(frame.current, readConnectorTheme(globalThis, colorScheme))
  }, [colorScheme, panel])
  // The header owns the toolbar, so its controls reach the page as commands.
  // A change before the page loads is not lost: `onLoad` posts the current
  // values again.
  useEffect(() => {
    if (panel === undefined) return
    postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostView, view })
  }, [panel, view])
  useEffect(() => {
    if (panel === undefined) return
    postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostSearch, query })
  }, [panel, query])
  useEffect(() => {
    if (panel === undefined) return
    postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostLocale, locale })
  }, [locale, panel])
  useEffect(() => {
    if (panel === undefined || !addSeq) return
    postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostAdd })
  }, [addSeq, panel])
  useEffect(() => {
    if (panel === undefined || !refreshSeq) return
    postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostRefresh })
  }, [panel, refreshSeq])
  useEffect(() => {
    // A surface with no panel draws no frame, so there is no page to answer.
    if (panel === undefined) return undefined
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== globalThis.location.origin) return
      if (event.source !== frame.current?.contentWindow) return
      const data = event.data as ConnectorFrameMessage | null
      const type = data?.type
      if (type === MCP_CONNECTOR_FRAME_TYPES.workspaceContextRequest) {
        postToPanel(frame.current, workspaceScope(bridge))
        return
      }
      if (type === MCP_CONNECTOR_FRAME_TYPES.hostLocaleRequest) {
        postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostLocale, locale })
        return
      }
      if (type === MCP_CONNECTOR_FRAME_TYPES.hostState) {
        const state = typeof data?.counts === 'object' && data.counts !== null
          ? data.counts as { market?: unknown; installed?: unknown }
          : {}
        if (!isView(data?.view)) return
        onState({
          view: data.view,
          counts: { market: count(state.market), installed: count(state.installed) },
        })
        return
      }
      if (type !== MCP_CONNECTOR_FRAME_TYPES.startSession) return
      const requestId = typeof data?.requestId === 'string' ? data.requestId : ''
      const prompt = data?.prompt
      const reply = (ok: boolean, message: string): void => {
        const answer: ConnectorSessionResult = {
          type: MCP_CONNECTOR_FRAME_TYPES.startSessionResult, requestId, ok, message,
        }
        postToPanel(frame.current, answer)
      }
      if (requestId === '' || typeof prompt !== 'string') {
        reply(false, t('connectors.bridge.invalid'))
        return
      }
      try {
        bridge.startSession(prompt)
      } catch (error: unknown) {
        reply(false, error instanceof Error ? error.message : String(error))
        return
      }
      reply(true, t('connectors.bridge.drafted'))
    }
    globalThis.addEventListener('message', onMessage)
    return () => { globalThis.removeEventListener('message', onMessage) }
  }, [bridge, locale, onState, panel, t])

  if (panel === undefined) {
    return (
      <div className={css.marketScroll}>
        <section
          className={css.panelNotice}
          data-mcp-connector-unavailable=""
          aria-labelledby="mcp-connector-unavailable-title"
        >
          <span className={css.panelNoticeBadge} aria-hidden="true">
            <ConnectorsIcon size={22} />
          </span>
          <h2 id="mcp-connector-unavailable-title" className={css.panelNoticeTitle}>
            {t('connectors.unavailable.title')}
          </h2>
          <p className={css.panelNoticeDetail}>{t('connectors.unavailable.detail')}</p>
        </section>
      </div>
    )
  }
  return (
    <div className={css.embeddedPanel} data-mcp-connector-embedded="">
      <iframe
        ref={frame}
        className={css.connectorFrame}
        src={panel.src}
        title={t('connectors.surface.title')}
        data-mcp-connector-frame=""
        // The frame paints its own background before the page loads; declaring
        // the resolved scheme here keeps that first paint on the host theme
        // instead of a white flash in dark mode.
        style={{ colorScheme }}
        // The page asks for the scope once it is ready; it also takes the
        // answer the moment it loads, so its first render already shows the
        // current project instead of a flash of "global only". The load is also
        // when the host theme, the host-owned toolbar and the application
        // locale are projected into the page (see connectorTheme.ts and
        // mcpConnectorPanel.ts).
        onLoad={() => {
          applyConnectorTheme(frame.current, readConnectorTheme(globalThis, colorScheme))
          postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostToolbar, enabled: true })
          postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostLocale, locale })
          postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostView, view })
          postToPanel(frame.current, { type: MCP_CONNECTOR_FRAME_TYPES.hostSearch, query })
          postToPanel(frame.current, workspaceScope(bridge))
        }}
      />
    </div>
  )
}
