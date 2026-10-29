import { describe, expect, it, vi } from 'vitest'
import {
  createIamDeepLinkBridge, findIamDeepLink, matchesIamRedirectUri, SDKWORK_DESKTOP_BRIDGE,
} from '../src/iam-deep-links.ts'
import { exposeSdkworkDesktopBridge } from '../src/iam-preload.ts'

/** The registered callback the shipped brand and OEM profile both use. */
const REDIRECT = 'birdcoder://auth/callback'

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
    emitOpenUrl(url: string) {
      const event = { preventDefault: vi.fn() }
      for (const listener of openUrl) listener(event, url)
      return event
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
      redirectUri: REDIRECT,
      getWindow: () => ({ webContents: { send } }) as never,
      assertSender: vi.fn(),
      registerScheme: true,
      argv: ['birdcoder.exe', `${REDIRECT}?code=launch&state=s`],
    })

    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('birdcoder')
    expect(bridge.getInitialUrl()).toBe(`${REDIRECT}?code=launch&state=s`)

    app.emitOpenUrl(`${REDIRECT}?code=live&state=s`)
    expect(send).toHaveBeenCalledWith(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent,
      `${REDIRECT}?code=live&state=s`)

    app.emitSecondInstance(['birdcoder.exe', `${REDIRECT}?code=second&state=s`])
    expect(send).toHaveBeenLastCalledWith(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent,
      `${REDIRECT}?code=second&state=s`)

    const initial = ipcMain.handlers.get(SDKWORK_DESKTOP_BRIDGE.deepLinksGetInitialUrl)
    expect(initial?.({})).toBe(`${REDIRECT}?code=second&state=s`)

    bridge.dispose()
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('leaves every other deep link to its own handler', () => {
    const app = fakeApp()
    const ipcMain = fakeIpc()
    const send = vi.fn()
    const bridge = createIamDeepLinkBridge({
      app: app,
      ipcMain: ipcMain,
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: REDIRECT,
      getWindow: () => ({ webContents: { send } }) as never,
      assertSender: vi.fn(),
      registerScheme: true,
      argv: ['birdcoder.exe', 'birdcoder://open'],
    })

    expect(bridge.getInitialUrl()).toBeNull()
    // The product link and the retired `sdkwork-birdcoder` scheme are not the
    // registered callback, so the bridge neither claims nor forwards them.
    const product = app.emitOpenUrl('birdcoder://open')
    expect(product.preventDefault).not.toHaveBeenCalled()
    const retired = app.emitOpenUrl('sdkwork-birdcoder://auth/callback?code=c&state=s')
    expect(retired.preventDefault).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()

    const callback = app.emitOpenUrl(`${REDIRECT}?code=live&state=s`)
    expect(callback.preventDefault).toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
    bridge.dispose()
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
      redirectUri: REDIRECT,
      getWindow: () => undefined,
      assertSender,
      registerScheme: false,
      argv: [],
    })
    const open = ipcMain.handlers.get(SDKWORK_DESKTOP_BRIDGE.shellOpen)!
    await open({}, 'https://platform.birdcoder.com/auth/login')
    expect(assertSender).toHaveBeenCalled()
    expect(openExternal).toHaveBeenCalledWith('https://platform.birdcoder.com/auth/login')
    await open({}, `${REDIRECT}?code=c&state=s`)
    expect(openExternal).toHaveBeenLastCalledWith(`${REDIRECT}?code=c&state=s`)
    await expect(open({}, 'file:///C:/Windows/System32')).rejects.toThrow(/refused scheme/)
    await expect(open({}, 'http://platform-dev.birdcoder.com/iam/v3/oauth/authorize')).rejects.toThrow(/refused scheme/)
    await expect(open({}, 'sdkwork-birdcoder://auth/callback?code=c&state=s')).rejects.toThrow(/refused scheme/)
    await expect(open({}, '')).rejects.toThrow(/URL string/)
  })

  it('admits plain-HTTP authorize pages only when the launch is development', async () => {
    const ipcMain = fakeIpc()
    const openExternal = vi.fn(async () => {})
    createIamDeepLinkBridge({
      app: fakeApp(),
      ipcMain: ipcMain,
      shell: { openExternal },
      redirectUri: REDIRECT,
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

describe('matchesIamRedirectUri', () => {
  it('compares the scheme, authority, and path of the registered callback', () => {
    expect(matchesIamRedirectUri(`${REDIRECT}?code=c&state=s`, REDIRECT)).toBe(true)
    expect(matchesIamRedirectUri('birdcoder://auth/callback/', REDIRECT)).toBe(true)
    expect(matchesIamRedirectUri('BIRDCODER://AUTH/callback?code=c', REDIRECT)).toBe(true)
    expect(matchesIamRedirectUri('birdcoder://open', REDIRECT)).toBe(false)
    expect(matchesIamRedirectUri('birdcoder://auth/other', REDIRECT)).toBe(false)
    expect(matchesIamRedirectUri('sdkwork-birdcoder://auth/callback?code=c', REDIRECT)).toBe(false)
    expect(matchesIamRedirectUri('not a uri', REDIRECT)).toBe(false)
    expect(matchesIamRedirectUri(`${REDIRECT}?code=c`, 'not a uri')).toBe(false)
  })
})

describe('findIamDeepLink', () => {
  it('returns the last matching URL and ignores the rest', () => {
    expect(findIamDeepLink(['birdcoder://open', `${REDIRECT}?code=first`], REDIRECT))
      .toBe(`${REDIRECT}?code=first`)
    expect(findIamDeepLink([`${REDIRECT}?code=first`, `${REDIRECT}?code=second`], REDIRECT))
      .toBe(`${REDIRECT}?code=second`)
    expect(findIamDeepLink(['birdcoder://open'], REDIRECT)).toBeNull()
    expect(findIamDeepLink([], REDIRECT)).toBeNull()
  })
})

describe('exposeSdkworkDesktopBridge', () => {
  it('exposes the upstream deepLinks/shellOpen shape and forwards events', async () => {
    const values = new Map<string, unknown>()
    const listeners = new Map<string, (event: unknown, payload: unknown) => void>()
    let initial: string | null = `${REDIRECT}?code=c&state=s`
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
    listeners.get(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent)?.({}, `${REDIRECT}?code=new&state=s`)
    expect(seen).toEqual([`${REDIRECT}?code=new&state=s`])
    off()
    listeners.get(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent)?.({}, `${REDIRECT}?code=skip&state=s`)
    expect(seen).toEqual([`${REDIRECT}?code=new&state=s`])

    await bridge.shellOpen.open('https://platform.birdcoder.com/auth/login')
    expect(invoked).toContainEqual([SDKWORK_DESKTOP_BRIDGE.shellOpen, ['https://platform.birdcoder.com/auth/login']])
  })
})
