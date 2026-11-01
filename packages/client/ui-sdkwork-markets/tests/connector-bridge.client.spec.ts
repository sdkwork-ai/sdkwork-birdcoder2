/**
 * connectorBridge: the host-side answers the MCP connector's embedded panel
 * asks for. The panel lives in another package, so this module is where the
 * mapping between this application's Workspace/Session state and the page's
 * wire shapes is decided — the "current project" scope, the selectable
 * workspaces, and the conversation an example Prompt opens. The hand-off
 * itself is delegated: the bridge never creates a Session, it asks the
 * composition's own New Session capability to.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import {
  createMcpConnectorBridge, type McpConnectorBridgeServices, type McpConnectorWorkspaceSnapshot,
} from '../src/client/connectorBridge.ts'
import type { MarketsKey } from '../src/client/locales.ts'

/** One Workspace row as the list snapshot carries it. */
function workspace(workspaceId: string, title: string, sessionIds: readonly string[] = []) {
  return {
    workspaceId: workspaceId as WorkspaceId,
    title,
    sessionIds: sessionIds.map(id => id as SessionId),
  }
}

/** A Workspace list snapshot with the runtime projection's recent Workspace. */
function workspaceList(
  items: readonly ReturnType<typeof workspace>[],
  recentWorkspaceId?: string,
): { getSnapshot(): McpConnectorWorkspaceSnapshot } {
  return {
    getSnapshot: () => ({
      items,
      ...(recentWorkspaceId === undefined ? {} : { recentWorkspaceId: recentWorkspaceId as WorkspaceId }),
    }),
  }
}

/** A Session list snapshot: only `current` matters to the bridge. */
function sessionList(current?: string): { getSnapshot(): SessionListState } {
  return {
    getSnapshot: () => ({
      ids: [],
      byId: {},
      current: current as SessionId | undefined,
      phase: 'ready',
      subagentsByParent: {},
      jobsBySession: {},
      currentAddress: undefined,
    }),
  }
}

/** The copy seat stand-in: keys render verbatim so assertions read the contract. */
const copy = ((key: MarketsKey) => key) as (key: MarketsKey) => string

/** Services with the given snapshots and hand-off, and every refusal recorded. */
function services(options: {
  workspaces?: ReturnType<typeof workspaceList>
  sessions?: ReturnType<typeof sessionList>
  openSessionWithDraft?: ((workspaceId: WorkspaceId, prompt: string) => void) | undefined
} = {}): McpConnectorBridgeServices {
  return {
    workspaces: { list: options.workspaces ?? workspaceList([]) },
    sessions: { list: options.sessions ?? sessionList() },
    ...(options.openSessionWithDraft === undefined ? {} : { openSessionWithDraft: options.openSessionWithDraft }),
    copy,
  }
}

describe('connectorBridge', () => {
  it('defaults a new connection to the current Session\'s Workspace', () => {
    const bridge = createMcpConnectorBridge(services({
      workspaces: workspaceList([
        workspace('w1', 'Project one', ['s1']),
        workspace('w2', 'Project two', ['s2']),
      ], 'w2'),
      sessions: sessionList('s1'),
    }))
    // The Session a person is working in wins over the most recently used
    // Workspace: the panel shows "current project" for where they are.
    expect(bridge.workspaceContext()).toEqual({ workspaceId: 'w1', title: 'Project one' })
  })

  it('falls back to the most recently used Workspace when no Session is current', () => {
    const bridge = createMcpConnectorBridge(services({
      workspaces: workspaceList([
        workspace('w1', 'Project one', ['s1']),
        workspace('w2', 'Project two', ['s2']),
      ], 'w2'),
    }))
    expect(bridge.workspaceContext()).toEqual({ workspaceId: 'w2', title: 'Project two' })
  })

  it('lands on the only listed Workspace on a deployment with no recency yet', () => {
    // A fresh deployment has no Session and no recent Workspace; the hand-off
    // must still work in the state a person first meets the connector in.
    const bridge = createMcpConnectorBridge(services({
      workspaces: workspaceList([workspace('w1', 'Project one')]),
    }))
    expect(bridge.workspaceContext()).toEqual({ workspaceId: 'w1', title: 'Project one' })
  })

  it('answers no scope when the deployment has no Workspace at all', () => {
    const bridge = createMcpConnectorBridge(services())
    expect(bridge.workspaceContext()).toBeNull()
  })

  it('names a Workspace that carries no title by its id', () => {
    const bridge = createMcpConnectorBridge(services({
      workspaces: workspaceList([workspace('w1', '')], 'w1'),
    }))
    expect(bridge.workspaceContext()).toEqual({ workspaceId: 'w1', title: 'w1' })
  })

  it('offers every Workspace once, in list order', () => {
    const bridge = createMcpConnectorBridge(services({
      workspaces: workspaceList([
        workspace('w1', 'Project one'),
        workspace('w2', ''),
        workspace('w1', 'Project one (duplicate)'),
        workspace('w3', 'Project three'),
      ]),
    }))
    expect(bridge.workspaceOptions()).toEqual([
      { workspaceId: 'w1', title: 'Project one' },
      { workspaceId: 'w2', title: 'w2' },
      { workspaceId: 'w3', title: 'Project three' },
    ])
  })

  it('opens the example Prompt in the current Workspace through the New Session capability', () => {
    const openSessionWithDraft = vi.fn()
    const bridge = createMcpConnectorBridge(services({
      workspaces: workspaceList([workspace('w1', 'Project one', ['s1'])], 'w1'),
      sessions: sessionList('s1'),
      openSessionWithDraft,
    }))
    bridge.startSession('查询一家企业的简介')
    expect(openSessionWithDraft).toHaveBeenCalledWith('w1', '查询一家企业的简介')
  })

  it('refuses an empty Prompt instead of opening a blank conversation', () => {
    const openSessionWithDraft = vi.fn()
    const bridge = createMcpConnectorBridge(services({
      workspaces: workspaceList([workspace('w1', 'Project one')], 'w1'),
      openSessionWithDraft,
    }))
    expect(() => { bridge.startSession('   ') }).toThrow('connectors.bridge.emptyPrompt')
    expect(openSessionWithDraft).not.toHaveBeenCalled()
  })

  it('refuses the hand-off when there is no Workspace to land in', () => {
    const openSessionWithDraft = vi.fn()
    const bridge = createMcpConnectorBridge(services({ openSessionWithDraft }))
    expect(() => { bridge.startSession('hello') }).toThrow('connectors.bridge.noWorkspace')
    expect(openSessionWithDraft).not.toHaveBeenCalled()
  })

  it('reports a composition without the New Session capability instead of doing nothing', () => {
    const bridge = createMcpConnectorBridge(services({
      workspaces: workspaceList([workspace('w1', 'Project one')], 'w1'),
    }))
    expect(() => { bridge.startSession('hello') }).toThrow('connectors.bridge.unavailable')
  })
})
