/**
 * IPC wiring: the rpc handler normalizes renderer requests to the loopback
 * authority (the desktop analogue of the /api loopback fence), forwards
 * unary/respond through the bridge, and pumps the downlink streams per
 * subscription.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { DesktopBridgeHost, DesktopUpdateState } from '../src/bridge-types.ts'
import { IPC_CHANNELS } from '../src/bridge-types.ts'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const listeners = new Map<string, ((...args: unknown[]) => void)[]>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener])
    },
  },
  BrowserWindow: {
    fromWebContents: (webContents: unknown) => (webContents as { win?: unknown }).win ?? null,
  },
}))

import { registerIpc, registerUpdateIpc, registerWindowIpc } from '../src/ipc.ts'
import type { DesktopUpdater } from '../src/update.ts'

function bridgeWith(fetch: (request: Request) => Promise<Response>): DesktopBridgeHost {
  return {
    fetch,
    openMux: vi.fn(),
    openHost: vi.fn(),
    openStream: vi.fn(),
  }
}

const JSON_HEADERS: [string, string][] = [['content-type', 'application/json']]

beforeEach(() => {
  handlers.clear()
  listeners.clear()
})

describe('registerIpc', () => {
  it('normalizes unary requests to the loopback authority and forwards them', async () => {
    const bridge = bridgeWith(async (request: Request) => {
      expect(request.url).toBe('http://127.0.0.1/api/session.list')
      expect(request.headers.get('host')).toBe('127.0.0.1')
      return new Response('{"type":"server-response","rpcId":"r1","result":{"ok":true,"value":{"items":[]}}}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    registerIpc(bridge)
    const rpc = handlers.get(IPC_CHANNELS.rpc) as (event: unknown, payload: unknown) => Promise<unknown>
    const result = await rpc({}, {
      id: 'req_1',
      url: 'app://dsh/api/session.list',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"type":"client-request","rpcId":"r1","method":"session.list","payload":{}}',
    }) as { status: number; headers: [string, string][]; body: string }
    expect(result.status).toBe(200)
    expect(result.headers).toEqual(JSON_HEADERS)
    expect(JSON.parse(result.body)).toMatchObject({ rpcId: 'r1' })
  })

  it('forwards session.export HEAD preflight after loopback normalization', async () => {
    const bridge = bridgeWith(async (request: Request) => {
      expect(request.url).toBe('http://127.0.0.1/api/session.export?sessionId=s1&includeDescendants=true')
      expect(request.method).toBe('HEAD')
      expect(request.headers.get('host')).toBe('127.0.0.1')
      expect(request.headers.get('origin')).toBeNull()
      return new Response(null, {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="dsh-session-s1.zip"',
        },
      })
    })
    registerIpc(bridge)
    const rpc = handlers.get(IPC_CHANNELS.rpc) as (event: unknown, payload: unknown) => Promise<unknown>
    const result = await rpc({}, {
      id: 'req_export',
      url: 'app://dsh/api/session.export?sessionId=s1&includeDescendants=true',
      method: 'HEAD',
      headers: { origin: 'app://dsh' },
    }) as { status: number; body: string }
    expect(result.status).toBe(200)
    expect(result.body).toBe('')
  })

  it('strips Origin before privileged unary dispatch', async () => {
    const bridge = bridgeWith(async (request: Request) => {
      expect(request.url).toBe('http://127.0.0.1/api/settings.describe')
      expect(request.headers.get('host')).toBe('127.0.0.1')
      expect(request.headers.get('origin')).toBeNull()
      return new Response('{"type":"server-response","rpcId":"r-priv","result":{"ok":true,"value":{}}}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    registerIpc(bridge)
    const rpc = handlers.get(IPC_CHANNELS.rpc) as (event: unknown, payload: unknown) => Promise<unknown>
    const result = await rpc({}, {
      id: 'req_priv',
      url: 'app://dsh/api/settings.describe',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'app://dsh',
      },
      body: '{"type":"client-request","rpcId":"r-priv","method":"settings.describe","payload":{}}',
    }) as { status: number; body: string }
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toMatchObject({ rpcId: 'r-priv' })
  })

  it('pumps mux frames and sends the stream-end marker after the generator finishes', async () => {
    const sent: { channel: string; payload: unknown }[] = []
    const destroyed = vi.fn()
    const wc = {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => { sent.push({ channel, payload }) },
      once: (event: string, callback: () => void) => { if (event === 'destroyed') destroyed.mockImplementation(callback) },
      off: () => {},
    }
    const bridge: DesktopBridgeHost = {
      fetch: async () => new Response(null, { status: 404 }),
      openMux: vi.fn(() => (async function* () {
        yield { rpcId: 'm1', payload: { type: 'session/subscribed', sessionId: 's1', lastSeq: 1 } }
      })()),
      openHost: vi.fn(),
      openStream: vi.fn(),
    }
    registerIpc(bridge)
    const subscribe = handlers.get(IPC_CHANNELS.subscribe) as (event: unknown, payload: unknown) => Promise<unknown>
    await subscribe({ sender: wc }, { stream: 'mux', subId: 'sub_1' })
    // The pump runs asynchronously; wait for the stream-end marker.
    await vi.waitFor(() => {
      expect(sent.some(entry => entry.channel === IPC_CHANNELS.streamEnd)).toBe(true)
    })
    const frame = sent.find(entry => entry.channel === IPC_CHANNELS.frame)
    expect(frame?.payload).toMatchObject({ subId: 'sub_1', frame: { type: 'server-request', rpcId: 'm1', method: 'session/subscribed' } })
  })

  it('aborts a pump on unsubscribe', async () => {
    const observedSignals: AbortSignal[] = []
    const openMux = vi.fn((signal: AbortSignal) => {
      observedSignals.push(signal)
      return (async function* () {
        while (!signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 5))
        }
      })()
    })
    const bridge: DesktopBridgeHost = {
      fetch: async () => new Response(null, { status: 404 }),
      openMux: openMux as never,
      openHost: vi.fn(),
      openStream: vi.fn(),
    }
    registerIpc(bridge)
    const wc = { isDestroyed: () => false, send: () => {}, once: () => {}, off: () => {} }
    const subscribe = handlers.get(IPC_CHANNELS.subscribe) as (event: unknown, payload: unknown) => Promise<unknown>
    await subscribe({ sender: wc }, { stream: 'mux', subId: 'sub_2' })
    expect(observedSignals[0]?.aborted).toBe(false)
    const unsubscribe = listeners.get(IPC_CHANNELS.unsubscribe)?.[0]
    expect(unsubscribe).toBeDefined()
    // Electron listeners receive (event, ...args); the mock hands them through.
    unsubscribe?.({}, 'sub_2')
    await vi.waitFor(() => {
      expect(observedSignals[0]?.aborted).toBe(true)
    })
  })

  it('pumps Remote stream frames and sends the stream-end marker after the generator finishes', async () => {
    const sent: { channel: string; payload: unknown }[] = []
    const wc = {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => { sent.push({ channel, payload }) },
      once: () => {},
      off: () => {},
    }
    const openStream = vi.fn(() => (async function* () {
      yield { type: 'baseline', sessions: [] }
      yield { type: 'running', sessionId: 's1', running: true }
    })())
    const bridge: DesktopBridgeHost = {
      fetch: async () => new Response(null, { status: 404 }),
      openMux: vi.fn(),
      openHost: vi.fn(),
      openStream: openStream as never,
    }
    registerIpc(bridge)
    const streamOpen = handlers.get(IPC_CHANNELS.streamOpen) as (event: unknown, payload: unknown) => Promise<unknown>
    await streamOpen({ sender: wc }, { streamId: 'stream_1', endpoint: 'session/control', payload: { args: {} } })
    // The pump runs asynchronously; wait for the stream-end marker.
    await vi.waitFor(() => {
      expect(sent.some(entry => entry.channel === IPC_CHANNELS.streamEnd)).toBe(true)
    })
    expect(openStream).toHaveBeenCalledWith('session/control', { args: {} }, expect.any(AbortSignal))
    const items = sent.filter(entry => entry.channel === IPC_CHANNELS.streamFrame)
    expect(items.map(entry => entry.payload)).toMatchObject([
      { streamId: 'stream_1', frame: { type: 'item', value: { type: 'baseline', sessions: [] } } },
      { streamId: 'stream_1', frame: { type: 'item', value: { type: 'running', sessionId: 's1', running: true } } },
    ])
  })

  it('aborts a Remote stream pump on cancel', async () => {
    const observedSignals: AbortSignal[] = []
    const openStream = vi.fn((_endpoint: string, _payload: unknown, signal: AbortSignal) => {
      observedSignals.push(signal)
      return (async function* () {
        while (!signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 5))
        }
      })()
    })
    const bridge: DesktopBridgeHost = {
      fetch: async () => new Response(null, { status: 404 }),
      openMux: vi.fn(),
      openHost: vi.fn(),
      openStream: openStream as never,
    }
    registerIpc(bridge)
    const wc = { isDestroyed: () => false, send: () => {}, once: () => {}, off: () => {} }
    const streamOpen = handlers.get(IPC_CHANNELS.streamOpen) as (event: unknown, payload: unknown) => Promise<unknown>
    await streamOpen({ sender: wc }, { streamId: 'stream_2', endpoint: 'session/control', payload: { args: {} } })
    // The pump opens asynchronously; wait for the Host opener to be invoked.
    await vi.waitFor(() => {
      expect(observedSignals[0]?.aborted).toBe(false)
    })
    const cancel = listeners.get(IPC_CHANNELS.streamCancel)?.[0]
    expect(cancel).toBeDefined()
    cancel?.({}, 'stream_2')
    await vi.waitFor(() => {
      expect(observedSignals[0]?.aborted).toBe(true)
    })
  })

  it('delivers a Host stream failure as an error frame', async () => {
    const sent: { channel: string; payload: unknown }[] = []
    const wc = {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => { sent.push({ channel, payload }) },
      once: () => {},
      off: () => {},
    }
    const openStream = vi.fn(() => (async function* () {
      throw Object.assign(new Error('session/control refused'), { code: 'service-unavailable' })
    })())
    const bridge: DesktopBridgeHost = {
      fetch: async () => new Response(null, { status: 404 }),
      openMux: vi.fn(),
      openHost: vi.fn(),
      openStream: openStream as never,
    }
    registerIpc(bridge)
    const streamOpen = handlers.get(IPC_CHANNELS.streamOpen) as (event: unknown, payload: unknown) => Promise<unknown>
    await streamOpen({ sender: wc }, { streamId: 'stream_3', endpoint: 'session/control', payload: { args: {} } })
    await vi.waitFor(() => {
      expect(sent.some(entry => entry.channel === IPC_CHANNELS.streamFrame
        && (entry.payload as { frame: { type: string } }).frame.type === 'error')).toBe(true)
    })
    const error = sent.find(entry => entry.channel === IPC_CHANNELS.streamFrame
      && (entry.payload as { frame: { type: string } }).frame.type === 'error')
    expect(error?.payload).toMatchObject({
      streamId: 'stream_3',
      frame: { type: 'error', error: { code: 'service-unavailable', message: 'session/control refused' } },
    })
  })
})

describe('registerWindowIpc', () => {
  /** The fake BrowserWindow action surface, every member a mock. */
  type WinMock = {
    minimize: Mock<() => void>
    maximize: Mock<() => void>
    unmaximize: Mock<() => void>
    isMaximized: Mock<() => boolean>
    close: Mock<() => void>
  }

  /** A fake BrowserWindow discoverable from a fake webContents via the electron mock. */
  function windowWith(over: Partial<WinMock> = {}): { win: WinMock; wc: { win: unknown } } {
    const win: WinMock = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      isMaximized: vi.fn(() => false),
      close: vi.fn(),
      ...over,
    }
    return { win, wc: { win } }
  }

  beforeEach(() => {
    handlers.clear()
    listeners.clear()
    registerWindowIpc()
  })

  it('minimizes, toggles maximize, and closes the sender window', () => {
    const { win, wc } = windowWith()
    const action = listeners.get(IPC_CHANNELS.windowAction)?.[0]
    expect(action).toBeDefined()
    action?.({ sender: wc }, 'minimize')
    expect(win.minimize).toHaveBeenCalledTimes(1)
    action?.({ sender: wc }, 'toggle-maximize')
    expect(win.maximize).toHaveBeenCalledTimes(1)
    expect(win.unmaximize).not.toHaveBeenCalled()
    action?.({ sender: wc }, 'close')
    expect(win.close).toHaveBeenCalledTimes(1)
  })

  it('restores a maximized window on toggle', () => {
    const { win, wc } = windowWith({ isMaximized: vi.fn(() => true) })
    const action = listeners.get(IPC_CHANNELS.windowAction)?.[0]
    action?.({ sender: wc }, 'toggle-maximize')
    expect(win.unmaximize).toHaveBeenCalledTimes(1)
    expect(win.maximize).not.toHaveBeenCalled()
  })

  it('answers the window-state query from the sender window', async () => {
    const { wc } = windowWith()
    const state = handlers.get(IPC_CHANNELS.windowState) as (event: unknown) => unknown
    expect(await state({ sender: wc })).toEqual({ maximized: false })
  })

  it('ignores actions and state from a webContents with no window', async () => {
    const action = listeners.get(IPC_CHANNELS.windowAction)?.[0]
    expect(() => action?.({ sender: {} }, 'close')).not.toThrow()
    const state = handlers.get(IPC_CHANNELS.windowState) as (event: unknown) => unknown
    expect(await state({ sender: {} })).toEqual({ maximized: false })
  })
})

describe('registerUpdateIpc', () => {
  /** A fake updater surface; the mock members come back as locals for assertions. */
  function updaterWith(): {
    updater: DesktopUpdater
    getState: Mock<() => DesktopUpdateState>
    checkNow: Mock<() => Promise<void>>
    download: Mock<() => Promise<void>>
    install: Mock<() => void>
    openReleasePage: Mock<() => void>
    dispose: Mock<() => void>
  } {
    const getState = vi.fn((): DesktopUpdateState => ({ phase: 'idle', canInstall: true }))
    const checkNow = vi.fn(async () => {})
    const download = vi.fn(async () => {})
    const install = vi.fn()
    const openReleasePage = vi.fn()
    const dispose = vi.fn()
    const updater: DesktopUpdater = { getState, checkNow, download, install, openReleasePage, dispose }
    return { updater, getState, checkNow, download, install, openReleasePage, dispose }
  }

  beforeEach(() => {
    handlers.clear()
    listeners.clear()
  })

  it('answers the state poll from the updater', async () => {
    const { updater, getState } = updaterWith()
    registerUpdateIpc(updater)
    const state = handlers.get(IPC_CHANNELS.updateGetState) as (event: unknown) => unknown
    expect(await state({})).toEqual({ phase: 'idle', canInstall: true })
    expect(getState).toHaveBeenCalledTimes(1)
  })

  it('routes the one-shot actions to the updater and ignores unknown actions', () => {
    const { updater, checkNow, download, install, openReleasePage } = updaterWith()
    registerUpdateIpc(updater)
    const action = listeners.get(IPC_CHANNELS.updateAction)?.[0]
    expect(action).toBeDefined()
    action?.({}, 'check')
    action?.({}, 'download')
    action?.({}, 'install')
    action?.({}, 'open-release-page')
    expect(checkNow).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
    expect(install).toHaveBeenCalledTimes(1)
    expect(openReleasePage).toHaveBeenCalledTimes(1)
    action?.({}, 'restart')
    action?.({}, 42)
    expect(install).toHaveBeenCalledTimes(1)
  })
})
