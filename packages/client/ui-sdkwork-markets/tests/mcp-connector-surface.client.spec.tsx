// @vitest-environment jsdom
/**
 * McpConnectorSurface: the Connectors tab's embedded connector panel. The
 * plugin serves its whole interface as one same-origin page, so this component
 * supplies the frame, the unavailable notice for a deployment without the
 * plugin, and the two messages the page expects its host frame to answer. The
 * inbound half is guarded: only this component's own frame, on this
 * application's origin, may ask for the Workspace scope or open a conversation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { McpConnectorSurface } from '../src/client/McpConnectorSurface.tsx'
import type { McpConnectorBridge } from '../src/client/connectorBridge.ts'
import {
  MCP_CONNECTOR_FRAME_TYPES, MCP_CONNECTOR_SURFACE_PATH, type McpConnectorPanel,
} from '../src/client/mcpConnectorPanel.ts'
import { applyConnectorTheme, readConnectorTheme } from '../src/client/connectorTheme.ts'
import type { MarketsKey } from '../src/client/locales.ts'

// The projection into the panel document is its own module with its own cases;
// here only the wiring is under test — that a load themes the frame it drew.
vi.mock('../src/client/connectorTheme.ts', () => ({
  applyConnectorTheme: vi.fn(),
  readConnectorTheme: vi.fn((_host: unknown, scheme: string) => ({
    scheme,
    brand: { base: 'b', hoverOnLight: 'l', hoverOnDark: 'd' },
    tokens: { '--dsw-alias-bg-base': 'bg' },
  })),
}))

afterEach(() => { cleanup() })

/** The locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: MarketsKey) => key) as (key: MarketsKey) => string

/** The registered panel source (the plugin's page, resolved by the browser). */
const panel: McpConnectorPanel = { src: MCP_CONNECTOR_SURFACE_PATH }

/** A bridge double whose scope is one Workspace, with the hand-off recorded. */
function bridge(overrides: Partial<McpConnectorBridge> = {}): McpConnectorBridge {
  return {
    workspaceContext: () => ({ workspaceId: 'w1' as WorkspaceId, title: 'Project one' }),
    workspaceOptions: () => [{ workspaceId: 'w1' as WorkspaceId, title: 'Project one' }],
    startSession: vi.fn(),
    ...overrides,
  }
}

/** Record what the header's state reports carried back up. */
const reported: unknown[] = []

/** Render the surface with the given panel, bridge and header toolbar state. */
function surface(options: {
  panel?: McpConnectorPanel | undefined
  bridge?: McpConnectorBridge
  colorScheme?: 'light' | 'dark'
  view?: 'market' | 'installed' | 'tools'
  query?: string
  locale?: 'zh-CN' | 'en'
  addSeq?: number
  refreshSeq?: number
} = {}) {
  reported.length = 0
  return render(
    <McpConnectorSurface
      t={t}
      panel={'panel' in options ? options.panel : panel}
      bridge={options.bridge ?? bridge()}
      colorScheme={options.colorScheme ?? 'light'}
      view={options.view ?? 'market'}
      query={options.query ?? ''}
      locale={options.locale ?? 'zh-CN'}
      addSeq={options.addSeq ?? 0}
      refreshSeq={options.refreshSeq ?? 0}
      onState={(state) => { reported.push(state) }}
    />,
  )
}

/** The frame the surface drew. */
function frameOf(view: ReturnType<typeof surface>): HTMLIFrameElement {
  const frame = view.container.querySelector<HTMLIFrameElement>('[data-mcp-connector-frame]')
  if (frame === null) throw new Error('the surface drew no connector frame')
  return frame
}

/** One message the component posted into its frame. */
interface Post {
  readonly message: unknown
  readonly targetOrigin: string
}

/**
 * Record what the component posts into its frame. A spy on the frame's own
 * `postMessage` would be untyped, and the component reaches the frame through
 * `contentWindow`, so the recorder replaces that method instead.
 * @param frame - the drawn iframe.
 * @returns the recorded posts, in order.
 */
function recordPosts(frame: HTMLIFrameElement): Post[] {
  const posts: Post[] = []
  const target = frame.contentWindow
  if (target === null) throw new Error('the connector frame has no window')
  Object.defineProperty(target, 'postMessage', {
    configurable: true,
    value: (message: unknown, targetOrigin: string) => { posts.push({ message, targetOrigin }) },
  })
  return posts
}

/** Post one message to the component as the embedded page would. */
function send(
  frame: HTMLIFrameElement,
  data: unknown,
  options: { origin?: string; source?: unknown } = {},
): void {
  window.dispatchEvent(new MessageEvent('message', {
    data,
    origin: options.origin ?? window.location.origin,
    source: (options.source ?? frame.contentWindow) as MessageEventSource | null,
  }))
}

describe('McpConnectorSurface', () => {
  it('frames the connector page the plugin registered', () => {
    const view = surface()
    const frame = frameOf(view)
    expect(frame.getAttribute('src')).toBe(MCP_CONNECTOR_SURFACE_PATH)
    // The frame carries the product name as its accessible name.
    expect(frame.getAttribute('title')).toBe('connectors.surface.title')
    expect(view.container.querySelector('[data-mcp-connector-embedded]')).not.toBeNull()
    expect(view.container.querySelector('[data-mcp-connector-unavailable]')).toBeNull()
  })

  it('names a deployment without the connector instead of framing a missing route', () => {
    const view = surface({ panel: undefined })
    expect(view.container.querySelector('[data-mcp-connector-embedded]')).toBeNull()
    expect(view.container.querySelector('[data-mcp-connector-frame]')).toBeNull()
    expect(view.container.querySelector('[data-mcp-connector-unavailable]')).not.toBeNull()
    expect(view.getByText('connectors.unavailable.title')).not.toBeNull()
    expect(view.getByText('connectors.unavailable.detail')).not.toBeNull()
  })

  it('hands the page the Workspace scope and the toolbar state the moment it loads', () => {
    const view = surface({ view: 'installed', query: 'qcc', locale: 'en' })
    const frame = frameOf(view)
    const posts = recordPosts(frame)
    fireEvent.load(frame)
    // The page's own toolbar is owned by this application's header, so the load
    // hands it that mode plus the header's current state, then the scope.
    expect(posts.map(post => (post.message as { type: string }).type)).toEqual([
      MCP_CONNECTOR_FRAME_TYPES.hostToolbar,
      MCP_CONNECTOR_FRAME_TYPES.hostLocale,
      MCP_CONNECTOR_FRAME_TYPES.hostView,
      MCP_CONNECTOR_FRAME_TYPES.hostSearch,
      MCP_CONNECTOR_FRAME_TYPES.workspaceContext,
    ])
    expect(posts.map(post => post.message)).toEqual([
      { type: MCP_CONNECTOR_FRAME_TYPES.hostToolbar, enabled: true },
      { type: MCP_CONNECTOR_FRAME_TYPES.hostLocale, locale: 'en' },
      { type: MCP_CONNECTOR_FRAME_TYPES.hostView, view: 'installed' },
      { type: MCP_CONNECTOR_FRAME_TYPES.hostSearch, query: 'qcc' },
      {
        type: MCP_CONNECTOR_FRAME_TYPES.workspaceContext,
        workspace: { workspaceId: 'w1', title: 'Project one' },
        workspaces: [{ workspaceId: 'w1', title: 'Project one' }],
      },
    ])
    expect(posts.every(post => post.targetOrigin === window.location.origin)).toBe(true)
  })

  it('forwards the header view, search and add actions as commands', () => {
    const view = surface()
    const frame = frameOf(view)
    const posts = recordPosts(frame)
    fireEvent.load(frame)
    const commands = (): string[] => posts
      .map(post => (post.message as { type: string }).type)
      .filter(type => type !== MCP_CONNECTOR_FRAME_TYPES.workspaceContext
        && type !== MCP_CONNECTOR_FRAME_TYPES.hostToolbar
        && type !== MCP_CONNECTOR_FRAME_TYPES.hostLocale)
    expect(commands()).toEqual([MCP_CONNECTOR_FRAME_TYPES.hostView, MCP_CONNECTOR_FRAME_TYPES.hostSearch])

    posts.length = 0
    view.rerender(
      <McpConnectorSurface
        t={t}
        panel={panel}
        bridge={bridge()}
        colorScheme="light"
        view="tools"
        query="wind"
        locale="zh-CN"
        addSeq={0}
        refreshSeq={0}
        onState={() => {}}
      />,
    )
    expect(posts.map(post => post.message)).toEqual([
      { type: MCP_CONNECTOR_FRAME_TYPES.hostView, view: 'tools' },
      { type: MCP_CONNECTOR_FRAME_TYPES.hostSearch, query: 'wind' },
    ])

    posts.length = 0
    view.rerender(
      <McpConnectorSurface
        t={t}
        panel={panel}
        bridge={bridge()}
        colorScheme="light"
        view="tools"
        query="wind"
        locale="zh-CN"
        addSeq={1}
        refreshSeq={0}
        onState={() => {}}
      />,
    )
    expect(posts.map(post => post.message)).toEqual([{ type: MCP_CONNECTOR_FRAME_TYPES.hostAdd }])
    // The same counter is the same request: no second dialog.
    posts.length = 0
    view.rerender(
      <McpConnectorSurface
        t={t}
        panel={panel}
        bridge={bridge()}
        colorScheme="light"
        view="tools"
        query="wind"
        locale="zh-CN"
        addSeq={1}
        refreshSeq={0}
        onState={() => {}}
      />,
    )
    expect(posts).toEqual([])
  })

  it('reports the page view and counts back to the header', () => {
    const view = surface()
    const frame = frameOf(view)
    recordPosts(frame)
    fireEvent.load(frame)
    send(frame, {
      type: MCP_CONNECTOR_FRAME_TYPES.hostState,
      view: 'installed',
      counts: { market: 7, installed: 2 },
    })
    expect(reported).toEqual([{ view: 'installed', counts: { market: 7, installed: 2 } }])
    // A report that names no view, or carries unusable counts, is not a state.
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.hostState, view: 'bogus', counts: {} })
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.hostState, view: 'market', counts: { market: -1 } })
    expect(reported).toEqual([
      { view: 'installed', counts: { market: 7, installed: 2 } },
      { view: 'market', counts: { market: 0, installed: 0 } },
    ])
  })

  it('answers the page locale request with the application locale', () => {
    const view = surface({ locale: 'en' })
    const frame = frameOf(view)
    recordPosts(frame)
    fireEvent.load(frame)
    const posts = recordPosts(frame)
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.hostLocaleRequest })
    expect(posts).toEqual([{
      message: { type: MCP_CONNECTOR_FRAME_TYPES.hostLocale, locale: 'en' },
      targetOrigin: window.location.origin,
    }])
  })

  it('projects the host theme into the panel it frames', () => {
    vi.mocked(applyConnectorTheme).mockClear()
    const view = surface({ colorScheme: 'dark' })
    const frame = frameOf(view)
    recordPosts(frame)
    fireEvent.load(frame)
    // The panel is a separate document: the frame's owner re-points its tokens at
    // the host theme the moment the page is up, and states the resolved scheme so
    // it follows the application rather than the operating system.
    expect(readConnectorTheme).toHaveBeenCalledWith(expect.anything(), 'dark')
    expect(applyConnectorTheme).toHaveBeenCalledWith(frame, {
      scheme: 'dark',
      brand: { base: 'b', hoverOnLight: 'l', hoverOnDark: 'd' },
      tokens: { '--dsw-alias-bg-base': 'bg' },
    })
  })

  it('repaints the open panel when the application scheme changes', () => {
    vi.mocked(applyConnectorTheme).mockClear()
    const view = surface({ colorScheme: 'light' })
    const frame = frameOf(view)
    recordPosts(frame)
    fireEvent.load(frame)
    expect(vi.mocked(applyConnectorTheme).mock.calls.at(-1)?.[1]).toMatchObject({ scheme: 'light' })
    view.rerender(
      <McpConnectorSurface t={t} panel={panel} bridge={bridge()} colorScheme="dark" />,
    )
    expect(vi.mocked(applyConnectorTheme).mock.calls.at(-1)?.[1]).toMatchObject({ scheme: 'dark' })
  })

  it('answers a later scope request with the current answer', () => {
    const view = surface()
    const frame = frameOf(view)
    const posts = recordPosts(frame)
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.workspaceContextRequest })
    expect(posts).toHaveLength(1)
    expect(posts[0].message).toMatchObject({ type: MCP_CONNECTOR_FRAME_TYPES.workspaceContext })
    expect(posts[0].targetOrigin).toBe(window.location.origin)
  })

  it('opens the example Prompt the page sends and acknowledges it', () => {
    const startSession = vi.fn()
    const view = surface({ bridge: bridge({ startSession }) })
    const frame = frameOf(view)
    const posts = recordPosts(frame)
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.startSession, requestId: 'r1', prompt: 'hello' })
    expect(startSession).toHaveBeenCalledWith('hello')
    expect(posts).toEqual([{
      message: {
        type: MCP_CONNECTOR_FRAME_TYPES.startSessionResult,
        requestId: 'r1',
        ok: true,
        message: 'connectors.bridge.drafted',
      },
      targetOrigin: window.location.origin,
    }])
  })

  it('reports a refused hand-off with the reason the bridge gave', () => {
    const startSession = vi.fn(() => { throw new Error('connectors.bridge.noWorkspace') })
    const view = surface({ bridge: bridge({ startSession }) })
    const frame = frameOf(view)
    const posts = recordPosts(frame)
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.startSession, requestId: 'r2', prompt: 'hello' })
    expect(posts).toEqual([{
      message: {
        type: MCP_CONNECTOR_FRAME_TYPES.startSessionResult,
        requestId: 'r2',
        ok: false,
        message: 'connectors.bridge.noWorkspace',
      },
      targetOrigin: window.location.origin,
    }])
  })

  it('reports a refused hand-off that carries no Error as its text', () => {
    const view = surface({ bridge: bridge({ startSession: () => { throw 'nope' } }) })
    const frame = frameOf(view)
    const posts = recordPosts(frame)
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.startSession, requestId: 'r3', prompt: 'hello' })
    expect(posts[0].message).toMatchObject({ ok: false, message: 'nope' })
  })

  it('rejects a malformed hand-off request without touching the workspace', () => {
    const startSession = vi.fn()
    const view = surface({ bridge: bridge({ startSession }) })
    const frame = frameOf(view)
    const posts = recordPosts(frame)
    // No request id: the page could not match an answer to its request.
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.startSession, prompt: 'hello' })
    // No prompt: nothing to open a conversation with.
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.startSession, requestId: 'r4' })
    expect(startSession).not.toHaveBeenCalled()
    expect(posts).toHaveLength(2)
    for (const post of posts) {
      expect(post.message).toMatchObject({
        type: MCP_CONNECTOR_FRAME_TYPES.startSessionResult,
        ok: false,
        message: 'connectors.bridge.invalid',
      })
    }
  })

  it('ignores what did not come from its own frame or its own origin', () => {
    const startSession = vi.fn()
    const view = surface({ bridge: bridge({ startSession }) })
    const frame = frameOf(view)
    const posts = recordPosts(frame)
    // Another origin framing this page must not drive the workspace or a
    // conversation.
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.startSession, requestId: 'r5', prompt: 'hello' }, {
      origin: 'https://evil.example',
    })
    // The application window itself is not the panel either.
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.workspaceContextRequest }, { source: window })
    // The plugin's own detail-state notification is informational here: this
    // page draws no close control that would depend on it.
    send(frame, { type: MCP_CONNECTOR_FRAME_TYPES.detailState, open: true })
    // An unknown shape is ignored rather than answered.
    send(frame, 'not-a-message')
    expect(startSession).not.toHaveBeenCalled()
    expect(posts).toEqual([])
  })

  it('stops listening after unmount', () => {
    const startSession = vi.fn()
    const view = surface({ bridge: bridge({ startSession }) })
    const frame = frameOf(view)
    view.unmount()
    expect(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: MCP_CONNECTOR_FRAME_TYPES.startSession, requestId: 'r6', prompt: 'hello' },
        origin: window.location.origin,
        source: frame.contentWindow,
      }))
    }).not.toThrow()
    expect(startSession).not.toHaveBeenCalled()
  })
})
