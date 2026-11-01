/**
 * mcpConnectorPanel: the source the Connectors tab binds to the
 * `dsh-mcp-connector` plugin's own `main` panel. The plugin publishes no
 * client control service, so the only fact this page may read is its
 * registration; the constants below are the two strings the two packages
 * share, and the bundle acceptance spec pins the same ones against the shipped
 * artifacts —a rename upstream must fail there instead of here.
 */
import type { ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  MCP_CONNECTOR_FRAME_TYPES, MCP_CONNECTOR_PANEL_ID, MCP_CONNECTOR_SURFACE_PATH,
  createMcpConnectorPanelSource, type McpConnectorPanelLedger,
} from '../src/client/mcpConnectorPanel.ts'

/** The connector panel's registration identity: one component per key. */
function panelOf(key: string): ComponentType {
  function Panel(): null { return null }
  Panel.displayName = `Panel(${key})`
  return Panel
}

/** A ledger double: one keyed `main` entry per registered key. */
function ledger(keys: readonly string[] = []): McpConnectorPanelLedger & {
  register(key: string): void
  registerBare(key: string): void
  withdraw(key: string): void
  unsubscribed: number
} {
  const registered = new Map<string, ComponentType | undefined>(
    keys.map(key => [key, panelOf(key)]),
  )
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of [...listeners]) listener() }
  return {
    entriesOfSlot(name) {
      expect(name).toBe('main')
      return [...registered].map(([key, component]) => (
        component === undefined ? { options: { key } } : { options: { key }, component }
      ))
    },
    subscribe(name, listener) {
      expect(name).toBe('main')
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    register(key) {
      registered.set(key, panelOf(key))
      notify()
    },
    registerBare(key) {
      registered.set(key, undefined)
      notify()
    },
    withdraw(key) {
      registered.delete(key)
      notify()
    },
    get unsubscribed() { return listeners.size },
  }
}

describe('mcpConnectorPanel', () => {
  it('pins the panel key and panel page the dsh-mcp-connector plugin registers', () => {
    // The bundle acceptance spec reads the shipped plugin artifacts and pins
    // these same strings; this assertion is where a rename lands first.
    expect(MCP_CONNECTOR_PANEL_ID).toBe('mcp-connector')
    expect(MCP_CONNECTOR_SURFACE_PATH).toBe('/mcp-connector/ui/')
  })

  it('pins the frame protocol the plugin\'s panel page speaks', () => {
    // Both halves are the plugin's constants. The surface trusts them for the
    // workspace scope and for the example-Prompt hand-off, so a renamed type
    // must break a spec rather than silently stop one of them.
    expect(MCP_CONNECTOR_FRAME_TYPES).toEqual({
      workspaceContextRequest: 'mcp-connector:workspace-context-request',
      workspaceContext: 'mcp-connector:workspace-context',
      startSession: 'mcp-connector:start-session',
      startSessionResult: 'mcp-connector:start-session-result',
      detailState: 'mcp-connector:detail-state',
    })
  })

  it('reports the panel live and only when the answer moves', () => {
    const slots = ledger()
    const source = createMcpConnectorPanelSource(slots)
    const listener = vi.fn()
    const unsubscribe = source.subscribe(listener)
    expect(source.getSnapshot()).toBeUndefined()

    // The plugin's panel arriving is the change the tab renders for.
    slots.register(MCP_CONNECTOR_PANEL_ID)
    expect(source.getSnapshot()).toEqual({ src: MCP_CONNECTOR_SURFACE_PATH })
    expect(listener).toHaveBeenCalledTimes(1)

    // Reads between changes keep the same object: the page's
    // `useSyncExternalStore` snapshot must not churn, or the embedded panel
    // would remount its frame after every unrelated registration.
    const published = source.getSnapshot()
    expect(source.getSnapshot()).toBe(published)

    // An unrelated keyed panel is not the connector: no notification, no flip.
    slots.register('another-panel')
    expect(source.getSnapshot()).toBe(published)
    expect(listener).toHaveBeenCalledTimes(1)

    // Withdrawing the connector panel removes the entry again.
    slots.withdraw(MCP_CONNECTOR_PANEL_ID)
    expect(source.getSnapshot()).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(2)

    // Withdrawing a key that was never around is not a change.
    slots.withdraw('missing')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    slots.register(MCP_CONNECTOR_PANEL_ID)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('starts present when the plugin activated before this page', () => {
    const slots = ledger([MCP_CONNECTOR_PANEL_ID])
    const source = createMcpConnectorPanelSource(slots)
    expect(source.getSnapshot()).toEqual({ src: MCP_CONNECTOR_SURFACE_PATH })
  })

  it('ignores a panel entry that carries no component', () => {
    // The keyed ledger is type-erased at this boundary: an entry whose
    // component is not a function (a stub registration, a half-loaded client
    // half) must read as absent rather than as a panel this page can frame.
    const slots = ledger()
    slots.registerBare(MCP_CONNECTOR_PANEL_ID)
    const source = createMcpConnectorPanelSource(slots)
    expect(source.getSnapshot()).toBeUndefined()
  })

  it('stops observing the ledger on dispose', () => {
    const slots = ledger()
    const source = createMcpConnectorPanelSource(slots)
    expect(slots.unsubscribed).toBe(1)
    source.dispose()
    expect(slots.unsubscribed).toBe(0)
    // No registration can reach a disposed source; the snapshot it last
    // published stays readable for a mount that is still tearing down.
    slots.register(MCP_CONNECTOR_PANEL_ID)
    expect(source.getSnapshot()).toBeUndefined()
  })
})
