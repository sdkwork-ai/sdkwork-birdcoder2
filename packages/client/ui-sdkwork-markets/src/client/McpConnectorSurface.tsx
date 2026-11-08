/**
 * The Connectors tab's surface: the MCP connector panel, drawn in place.
 *
 * The connector is another package's surface (`dsh-mcp-connector`, mounted by
 * the web-app bundle patch), and the plugin serves its whole interface as one
 * same-origin page —the same page its own panel draws in an iframe. This file
 * therefore draws no catalog of its own: it gives that page the box the tab's
 * panel area holds and speaks the two messages the page expects of its host
 * frame (see `mcpConnectorPanel.ts` for the protocol and `connectorBridge.ts`
 * for what the answers mean).
 *
 * The frame's messages are accepted only from this component's own iframe and
 * only from this application's origin: the workspace scope describes where a
 * connection lands, and the Prompt hand-off opens a conversation, so a message
 * from any other frame —or a same-origin page that is not the panel —must not
 * be able to drive either.
 *
 * A deployment without the connector row (or one whose browser half has not
 * loaded yet) gets the notice instead, saying that the connector is
 * unavailable rather than pointing an iframe at a route nobody serves. The
 * panel key and page path are the only facts the two packages share.
 */
import { useEffect, useRef } from 'react'
import { ConnectorsIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import type { McpConnectorBridge } from './connectorBridge.ts'
import { applyConnectorTheme, readConnectorBrandTokens } from './connectorTheme.ts'
import {
  MCP_CONNECTOR_FRAME_TYPES, type McpConnectorPanel, type McpConnectorWorkspace,
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
}

/** The shape of a message the embedded page sends this frame. */
interface ConnectorFrameMessage {
  readonly type?: unknown
  readonly requestId?: unknown
  readonly prompt?: unknown
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
 * @param props - the locale seat, the registered panel and the callbacks.
 * @returns the Connectors tab's panel content.
 */
export function McpConnectorSurface({ t, panel, bridge }: McpConnectorSurfaceProps) {
  const frame = useRef<HTMLIFrameElement | null>(null)
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
  }, [bridge, panel, t])

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
        // The page asks for the scope once it is ready; it also takes the
        // answer the moment it loads, so its first render already shows the
        // current project instead of a flash of "global only". The panel ships
        // its own indigo accent, so the load is also when the host brand is
        // projected into it (see connectorTheme.ts).
        onLoad={() => {
          applyConnectorTheme(frame.current, readConnectorBrandTokens(globalThis))
          postToPanel(frame.current, workspaceScope(bridge))
        }}
      />
    </div>
  )
}
