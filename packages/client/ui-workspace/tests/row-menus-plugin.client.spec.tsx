// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  WorkspaceId, WorkspaceSnapshot, WorkspaceView,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { WorkspaceBrowserProps } from '../src/client/contract/slots.ts'
import { createWorkspaceViewStore } from '../src/client/stores.ts'
import { WorkspaceBrowser } from '../src/client/rows/WorkspaceBrowser.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  createWorkspaceViewStore().create().actions.setOrderBy('manual')
  Element.prototype.scrollIntoView = vi.fn()
})

const t: WorkspaceBrowserProps['t'] = makeTranslate(zh, commonZh)
const sid = (id: string) => id as SessionId
const wid = (id: string) => id as WorkspaceId
const summary = (id: string, updatedAt: number): SessionSummary => ({
  id: sid(id), displayTitle: id, running: false, blank: false, updatedAt,
})
const sessionState = (items: readonly SessionSummary[]): SessionListState => ({
  ids: items.map(item => item.id),
  byId: Object.fromEntries(items.map(item => [item.id, item])),
  current: undefined,
  phase: 'ready',
  subagentsByParent: {}, jobsBySession: {},
  currentAddress: undefined,
})
const workspace = (id: string, sessionIds: string[], title = id): WorkspaceView => ({
  workspaceId: wid(id), path: `/projects/${id}`, title,
  sessionIds: sessionIds.map(sid), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
})
const workspaceState = (items: readonly WorkspaceView[]): WorkspaceSnapshot =>
  ({ items, archivedSessionIds: [], state: 'idle', phase: 'ready', error: null })
const noPendingInteraction: SessionPendingInteractionSnapshot = new Map()
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

/**
 * Plugin-shaped row menus: the renderer the ui-sdkwork-workspace-row-menus
 * plugin produces through its list registration, exercised through the same
 * renderSlot dispatch the browser uses. The stub filters by key exactly like
 * the real outlet dispatch (the browser also renders the directoryFlow hole
 * through the same renderSlot seat) and the fixture expands the workspace
 * group so the session row exists.
 *
 * The stub also wires the right-click command channel: the owner passes
 * `contextMenu: { open }` to every dispatch; the channel call is recorded
 * per row so the right-click suites can assert the pointer forwarding
 * (the real plugin menu overrides `open` at mount — a functional stub keeps
 * the same channel shape without importing the plugin package).
 */
function mountWithPluginMenus() {
  const pluginDispatches: Array<Record<string, unknown>> = []
  const contextOpens: Array<{ x: number; y: number }> = []
  const pluginRename = vi.fn()
  const pluginFork = vi.fn()
  const pluginArchive = vi.fn()
  const pluginWorkspaceRename = vi.fn()
  const pluginWorkspaceDelete = vi.fn()

  const renderSlot = ((_key: string, owner: Record<string, unknown>) => {
    // The directoryFlow hole shares the seat; only rowMenus dispatches are
    // plugin menu occurrences.
    if (_key !== 'sidebar.workspaces.rowMenus') {
      const flow = owner as { open: boolean }
      return flow.open ? <div data-testid="directory-flow" /> : null
    }
    // Owner share includes the context-menu command channel: wire it like
    // the real renderer does (override open at dispatch) and record calls.
    const channel = owner.contextMenu as { open: (x: number, y: number) => void } | undefined
    if (channel !== undefined) {
      channel.open = (x: number, y: number) => { contextOpens.push({ x, y }) }
    }
    pluginDispatches.push(owner)
    const isSession = owner.sessionId !== undefined
    const actions = isSession
      ? [
        { id: 'rename', label: '插件·重命名', click: () => pluginRename(owner.sessionId, owner.title) },
        { id: 'fork', label: '插件·分叉会话', click: () => pluginFork(owner.sessionId) },
        { id: 'archive', label: '插件·归档会话', click: () => pluginArchive(owner.sessionId) },
      ]
      : [
        { id: 'rename', label: '插件·重命名', click: () => pluginWorkspaceRename() },
        { id: 'delete', label: '插件·删除工作区', click: () => pluginWorkspaceDelete() },
      ]
    return (
      <span data-testid="plugin-menu">
        {actions.map(action => (
          <button
            key={action.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); action.click() }}
          >
            {action.label}
          </button>
        ))}
      </span>
    )
  }) as never

  const store = createWorkspaceViewStore().create()
  const session = summary('s1', 1)
  const open = vi.fn()
  const props: WorkspaceBrowserProps = {
    wide: true,
    expandSidebar: vi.fn(),
    useSessions: hook(sessionState([session])),
    useSessionPendingInteraction: hook(noPendingInteraction),
    useWorkspaces: hook(workspaceState([
      { ...workspace('project', ['s1'], 'Project') },
    ])),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    startSession: vi.fn(),
    open,
    searchSessions: vi.fn(async () => ({ items: [], hasMore: false })),
    searchResultLimit: 20,
    renameSession: vi.fn(async () => {}),
    forkSession: vi.fn(),
    renameWorkspace: vi.fn(async () => {}),
    deleteWorkspace: vi.fn(async () => {}),
    archiveSession: vi.fn(async () => {}),
    insertWorkspaceBefore: vi.fn(async () => {}),
    insertSessionBefore: vi.fn(async () => {}),
    createWorkspace: vi.fn(async () => workspace('created', [])),
    useDirectoryFlow: bindSnapshotSelector({ getSnapshot: () => true, subscribe: () => () => {} }),
    useHostInfo: selector => selector({ home: undefined, isLoopback: true }),
    useRowMenus: bindSnapshotSelector({ getSnapshot: () => true, subscribe: () => () => {} }),
    renderSlot,
    t,
  }
  const view = render(<WorkspaceBrowser {...props} />)
  // Groups start collapsed: open the workspace group so the session row
  // renders (mirrors the user gesture in the built-in suites).
  fireEvent.click(screen.getByText('Project'))
  return {
    view, props, open, pluginDispatches, contextOpens,
    pluginRename, pluginFork, pluginArchive, pluginWorkspaceRename, pluginWorkspaceDelete,
  }
}

describe('WorkspaceBrowser plugin row-menu integration', () => {
  it('routes both row menus through the plugin renderer and drops the built-in triggers', () => {
    mountWithPluginMenus()
    // Every rendered row (one workspace header + one session row) dispatches
    // through the plugin: the built-in ellipsis triggers are gone.
    expect(screen.queryByRole('button', { name: /工作区“Project”的操作/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /会话“s1”的操作/ })).toBeNull()
    expect(screen.getAllByTestId('plugin-menu')).toHaveLength(2)
  })

  it('dispatches plugin menu actions with the row payloads', () => {
    const { pluginRename, pluginFork, pluginArchive, pluginWorkspaceRename, pluginWorkspaceDelete } = mountWithPluginMenus()
    const menus = screen.getAllByTestId('plugin-menu')
    expect(menus).toHaveLength(2)
    // First dispatch is the workspace header; second the session row.
    const workspaceButtons = menus[0]!.querySelectorAll('button')
    expect(workspaceButtons).toHaveLength(2)
    fireEvent.click(workspaceButtons[0]!)
    fireEvent.click(workspaceButtons[1]!)
    expect(pluginWorkspaceRename).toHaveBeenCalledOnce()
    expect(pluginWorkspaceDelete).toHaveBeenCalledOnce()
    const sessionButtons = menus[1]!.querySelectorAll('button')
    fireEvent.click(sessionButtons[0]!)
    fireEvent.click(screen.getByRole('button', { name: '插件·分叉会话' }))
    fireEvent.click(screen.getByRole('button', { name: '插件·归档会话' }))
    expect(pluginRename).toHaveBeenCalledWith('s1', 's1')
    expect(pluginFork).toHaveBeenCalledWith('s1')
    expect(pluginArchive).toHaveBeenCalledWith('s1')
  })

  it('keeps the row click opening the session even when plugin menus render', () => {
    const { open } = mountWithPluginMenus()
    fireEvent.click(screen.getByText('s1'))
    expect(open).toHaveBeenCalledWith('s1')
  })

  it('forwards the workspace-row right-click through the plugin context channel', () => {
    const { contextOpens } = mountWithPluginMenus()
    // The workspace group header row (Project) carries the project menu.
    const projectRow = screen.getByText('Project').closest('[role="treeitem"]') as HTMLElement
    fireEvent.contextMenu(projectRow, { clientX: 101, clientY: 202 })
    // The owner forwards the pointer through the plugin's command channel
    // (the built-in menu is never mounted when the plugin renders).
    expect(screen.queryByRole('button', { name: /工作区“Project”的操作/ })).toBeNull()
    expect(contextOpens).toContainEqual({ x: 101, y: 202 })
  })

  it('forwards the session-row right-click through the plugin context channel', () => {
    const { contextOpens } = mountWithPluginMenus()
    const sessionRow = screen.getByText('s1').closest('[role="treeitem"]') as HTMLElement
    fireEvent.contextMenu(sessionRow, { clientX: 303, clientY: 404 })
    // The plugin path must forward the pointer (the built-in menu is not
    // mounted), so the session context menu can open at the pointer.
    expect(screen.queryByRole('button', { name: /会话“s1”的操作/ })).toBeNull()
    expect(contextOpens).toContainEqual({ x: 303, y: 404 })
  })

  it('does not open the session when the session row is right-clicked', () => {
    const { open, contextOpens } = mountWithPluginMenus()
    const sessionRow = screen.getByText('s1').closest('[role="treeitem"]') as HTMLElement
    fireEvent.contextMenu(sessionRow, { clientX: 55, clientY: 66 })
    expect(contextOpens).toContainEqual({ x: 55, y: 66 })
    expect(open).not.toHaveBeenCalled()
  })
})
