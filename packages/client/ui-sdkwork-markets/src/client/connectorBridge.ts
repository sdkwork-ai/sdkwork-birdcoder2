/**
 * The host-side callbacks the MCP connector's embedded panel talks to.
 *
 * The panel's page owns the connector market, the connections and the tool
 * workbench; only two facts live on this side of the frame (see
 * `mcpConnectorPanel.ts` for the protocol): the Workspace scope the page
 * defaults a new connection to, and the conversation an example Prompt opens.
 *
 * Both are derived here rather than in the component, so the mapping between
 * this application's Workspace/Session state and the page's wire shapes is one
 * testable function of plain snapshots. The conversation hand-off is delegated
 * to the caller's `openSessionWithDraft`: this module decides *what* workspace
 * and prompt to open, never how this composition creates and navigates a
 * Session, which is the Workspace surface's own capability.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/connectorBridge
 */

import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { MarketsKey } from './locales.ts'
import type { McpConnectorWorkspace } from './mcpConnectorPanel.ts'

/**
 * The Workspace facts the bridge reads.
 *
 * The Context merge declares the api controller's read face, whose snapshot
 * carries `items`; the runtime projection that actually provides
 * `ctx.workspaces` adds `recentWorkspaceId` (the most recently used Workspace,
 * which is what a new connection defaults to when no Session is current). This
 * shape states both, so the narrowing happens here instead of in the page.
 */
export interface McpConnectorWorkspaceSnapshot {
  readonly items: readonly {
    readonly workspaceId: WorkspaceId
    readonly title: string
    readonly sessionIds: readonly SessionId[]
  }[]
  /** The runtime projection's most recently used Workspace, when it has one. */
  readonly recentWorkspaceId?: WorkspaceId | undefined
}

/** The page's side of the connector panel's conversation hand-off. */
export interface McpConnectorBridge {
  /**
   * The Workspace a new connection defaults to: the current Session's
   * Workspace, else the most recently used one, else none.
   * @returns the scope the page shows as "current project", or null.
   */
  workspaceContext(): McpConnectorWorkspace | null
  /**
   * Every Workspace the page may scope a connection to, in list order.
   * @returns the selectable workspaces (one row per identity).
   */
  workspaceOptions(): readonly McpConnectorWorkspace[]
  /**
   * Open a conversation prefilled with one connector Prompt.
   * @param prompt - the Prompt body the panel's page sent.
   * @throws when the prompt is empty, no Workspace is current, or this
   * composition mounts no Workspace navigation; the message is user-visible
   * in the panel, so it comes from the market page's dictionary.
   */
  startSession(prompt: string): void
}

/** The client capabilities the bridge reads. */
export interface McpConnectorBridgeServices {
  /** The live Workspace list (the page's scope surface). */
  readonly workspaces: { readonly list: { getSnapshot(): McpConnectorWorkspaceSnapshot } }
  /** The live Session list, read only for the current selection. */
  readonly sessions: { readonly list: { getSnapshot(): SessionListState } }
  /**
   * Open a blank conversation in one Workspace prefilled with a Prompt.
   * Absent when this composition mounts no Workspace navigation, which turns
   * the hand-off into a reported failure instead of a silent no-op.
   */
  readonly openSessionWithDraft?: ((workspaceId: WorkspaceId, prompt: string) => void) | undefined
  /** The market page's copy seat (the hand-off's refusals). */
  readonly copy: (key: MarketsKey) => string
}

/**
 * Create the connector panel's host-side callbacks.
 * @param services - the Workspace and Session snapshots plus the hand-off.
 * @returns the callbacks the Connectors tab hands the panel.
 */
export function createMcpConnectorBridge(services: McpConnectorBridgeServices): McpConnectorBridge {
  const workspaceContext = (): McpConnectorWorkspace | null => {
    const workspace = services.workspaces.list.getSnapshot()
    const current = services.sessions.list.getSnapshot().current
    const selected = current === undefined
      ? undefined
      : workspace.items.find(item => item.sessionIds.includes(current))
    // The Session a person is working in, else the most recently used
    // Workspace, else the only listed one: a fresh deployment has no Session
    // and no recency yet, and refusing there would leave the hand-off inert in
    // exactly the state a person first meets the connector in.
    const target = selected?.workspaceId ?? workspace.recentWorkspaceId ?? workspace.items.at(0)?.workspaceId
    if (target === undefined) return null
    return { workspaceId: target, title: workspace.items.find(item => item.workspaceId === target)?.title || target }
  }
  return {
    workspaceContext,
    workspaceOptions() {
      // One row per identity: the Host list is authoritative and ordered, and
      // a duplicate would offer the page two identical scope choices.
      const options = new Map<WorkspaceId, McpConnectorWorkspace>()
      for (const item of services.workspaces.list.getSnapshot().items) {
        if (options.has(item.workspaceId)) continue
        options.set(item.workspaceId, { workspaceId: item.workspaceId, title: item.title || item.workspaceId })
      }
      return [...options.values()]
    },
    startSession(prompt) {
      if (prompt.trim() === '') throw new Error(services.copy('connectors.bridge.emptyPrompt'))
      const target = workspaceContext()
      if (target === null) throw new Error(services.copy('connectors.bridge.noWorkspace'))
      const open = services.openSessionWithDraft
      if (open === undefined) throw new Error(services.copy('connectors.bridge.unavailable'))
      open(target.workspaceId, prompt)
    },
  }
}
