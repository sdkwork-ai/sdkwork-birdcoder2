import { describe, expect, it, vi } from 'vitest'
import { createIamDeepLinkBridge, IAM_DEEP_LINK_SCHEME, SDKWORK_DESKTOP_BRIDGE } from '../src/iam-deep-links.ts'
import { exposeSdkworkDesktopBridge } from '../src/iam-preload.ts'

type OpenUrlListener = (event: { preventDefault(): void }, url: string) => void
type SecondInstanceListener = (event: unknown, argv: readonly string[]) => void

function fakeApp() {
  const openUrl = new Set<OpenUrlListener>()
  const second = new Set<SecondInstanceListener>()
  return {
    isPackaged: true,
    on: vi.fn((event: string, listener: never) => {
      if (event === 'open-url') openUrl.add(listener)
      else second.add(listener)
      return undefined
    }),
    off: vi.fn((event: string, listener: never) => {
      if (event === 'open-url') openUrl.delete(listener)
      else second.delete(listener)
      return undefined
    }),
    setAsDefaultProtocolClient: vi.fn(() => true),
    removeAsDefaultProtocolClient: vi.fn(() => true),
    emitOpenUrl(url: string) {
      for (const listener of openUrl) listener({ preventDefault: vi.fn() }, url)
    },
    emitSecondInstance(argv: string[]) {
      for (const listener of second) listener({}, argv)
    },
  }
}

function fakeIpc() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => { handlers.set(channel, handler) }),
    removeHandler: vi.fn((channel: string) => { handlers.delete(channel) }),
  }
}

describe('createIamDeepLinkBridge', () => {
  it('collects the launch URL, live deep links, and second-instance arguments', () => {
    const app = fakeApp()
    const ipcMain = fakeIpc()
    const send = vi.fn()
    const bridge = createIamDeepLinkBridge({
      app: app,
      ipcMain: ipcMain,
      shell: { openExternal: vi.fn(async () => {}) },
      getWindow: () => ({ webContents: { send } }) as never,
      assertSender: vi.fn(),
      registerScheme: true,
      argv: ['birdcoder.exe', `${IAM_DEEP_LINK_SCHEME}://auth/callback?code=launch&state=s`],
    })

    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith(IAM_DEEP_LINK_SCHEME)
    expect(bridge.getInitialUrl()).toBe(`${IAM_DEEP_LINK_SCHEME}://auth/callback?code=launch&state=s`)

    app.emitOpenUrl(`${IAM_DEEP_LINK_SCHEME}://auth/callback?code=live&state=s`)
    expect(send).toHaveBeenCalledWith(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent,
      `${IAM_DEEP_LINK_SCHEME}://auth/callback?code=live&state=s`)

    app.emitSecondInstance(['birdcoder.exe', `${IAM_DEEP_LINK_SCHEME}://auth/callback?code=second&state=s`])
    expect(send).toHaveBeenLastCalledWith(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent,
      `${IAM_DEEP_LINK_SCHEME}://auth/callback?code=second&state=s`)

    const initial = ipcMain.handlers.get(SDKWORK_DESKTOP_BRIDGE.deepLinksGetInitialUrl)
    expect(initial?.({})).toBe(`${IAM_DEEP_LINK_SCHEME}://auth/callback?code=second&state=s`)

    bridge.dispose()
    expect(app.removeAsDefaultProtocolClient).toHaveBeenCalledWith(IAM_DEEP_LINK_SCHEME)
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('guards the shell bridge to https and its own scheme', async () => {
    const app = fakeApp()
    const ipcMain = fakeIpc()
    const openExternal = vi.fn(async () => {})
    const assertSender = vi.fn()
    createIamDeepLinkBridge({
      app: app,
      ipcMain: ipcMain,
      shell: { openExternal },
      getWindow: () => undefined,
      assertSender,
      registerScheme: false,
      argv: [],
    })
    const open = ipcMain.handlers.get(SDKWORK_DESKTOP_BRIDGE.shellOpen)!
    await open({}, 'https://platform.birdcoder.com/auth/login')
    expect(assertSender).toHaveBeenCalled()
    expect(openExternal).toHaveBeenCalledWith('https://platform.birdcoder.com/auth/login')
    await expect(open({}, 'file:///C:/Windows/System32')).rejects.toThrow(/refused scheme/)
    await expect(open({}, 'http://platform-dev.birdcoder.com/iam/v3/oauth/authorize')).rejects.toThrow(/refused scheme/)
    await expect(open({}, '')).rejects.toThrow(/URL string/)
  })

  it('admits plain-HTTP authorize pages only when the launch is development', async () => {
    const ipcMain = fakeIpc()
    const openExternal = vi.fn(async () => {})
    createIamDeepLinkBridge({
      app: fakeApp(),
      ipcMain: ipcMain,
      shell: { openExternal },
      getWindow: () => undefined,
      assertSender: vi.fn(),
      registerScheme: false,
      allowInsecureHttp: true,
      argv: [],
    })
    const open = ipcMain.handlers.get(SDKWORK_DESKTOP_BRIDGE.shellOpen)!
    await open({}, 'http://platform-dev.birdcoder.com/iam/v3/oauth/authorize')
    expect(openExternal).toHaveBeenCalledWith('http://platform-dev.birdcoder.com/iam/v3/oauth/authorize')
  })
})

describe('exposeSdkworkDesktopBridge', () => {
  it('exposes the upstream deepLinks/shellOpen shape and forwards events', async () => {
    const values = new Map<string, unknown>()
    const listeners = new Map<string, (event: unknown, payload: unknown) => void>()
    let initial: string | null = 'sdkwork-birdcoder://auth/callback?code=c&state=s'
    const invoked: Array<[string, unknown[]]> = []
    const ipcRenderer = {
      invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
        invoked.push([channel, args])
        if (channel === SDKWORK_DESKTOP_BRIDGE.deepLinksGetInitialUrl) return initial
        return undefined
      }),
      on: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => { listeners.set(channel, listener) }),
    }
    exposeSdkworkDesktopBridge({
      exposeInMainWorld: (key, value) => { values.set(key, value) },
    }, ipcRenderer as never)
    const bridge = values.get('sdkworkDesktop') as {
      deepLinks: { getInitialUrl(): Promise<string | null>; onOpenUrl(handler: (url: string) => void): () => void }
      shellOpen: { open(url: string): Promise<void> }
    }
    expect(await bridge.deepLinks.getInitialUrl()).toBe(initial)
    initial = null
    expect(await bridge.deepLinks.getInitialUrl()).toBeNull()

    const seen: string[] = []
    const off = bridge.deepLinks.onOpenUrl((url) => { seen.push(url) })
    listeners.get(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent)?.({}, 'sdkwork-birdcoder://auth/callback?code=new&state=s')
    expect(seen).toEqual(['sdkwork-birdcoder://auth/callback?code=new&state=s'])
    off()
    listeners.get(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent)?.({}, 'sdkwork-birdcoder://auth/callback?code=skip&state=s')
    expect(seen).toEqual(['sdkwork-birdcoder://auth/callback?code=new&state=s'])

    await bridge.shellOpen.open('https://platform.birdcoder.com/auth/login')
    expect(invoked).toContainEqual([SDKWORK_DESKTOP_BRIDGE.shellOpen, ['https://platform.birdcoder.com/auth/login']])
  })
})
