import { describe, expect, it, vi } from 'vitest'
import {
  createIamDeepLinkBridge, findIamDeepLink, matchesIamRedirectUri, SDKWORK_DESKTOP_BRIDGE,
} from '../src/iam-deep-links.ts'
import { IAM_LOOPBACK_BRIDGE } from '../src/iam-loopback-protocol.ts'
import { ABOUT_BRIDGE } from '../src/about-command.ts'
import { IAM_SESSION_BRIDGE } from '../src/iam-session-protocol.ts'
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
    expect(app.off).toHaveBeenCalledWith('open-url', expect.any(Function))
    expect(app.off).toHaveBeenCalledWith('second-instance', expect.any(Function))
    expect(ipcMain.handlers.size).toBe(0)
  })

  it('keeps the callback for the renderer pull when the window cannot take the event', () => {
    const app = fakeApp()
    const ipcMain = fakeIpc()
    const onExternalCallback = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const bridge = createIamDeepLinkBridge({
        app,
        ipcMain,
        shell: { openExternal: vi.fn(async () => {}) },
        redirectUri: REDIRECT,
        // The window is being destroyed: its send throws.
        getWindow: () => ({ webContents: { send: () => { throw new Error('Object has been destroyed') } } }) as never,
        assertSender: vi.fn(),
        registerScheme: true,
        argv: ['birdcoder.exe'],
        onExternalCallback,
      })

      app.emitOpenUrl(`${REDIRECT}?code=lost-event&state=s`)
      // Sharing happens after the failed delivery, so a peer process that owns
      // the flow still hears the callback, and the renderer's take recovers it.
      expect(onExternalCallback).toHaveBeenCalledWith(`${REDIRECT}?code=lost-event&state=s`)
      const initial = ipcMain.handlers.get(SDKWORK_DESKTOP_BRIDGE.deepLinksGetInitialUrl)
      expect(initial?.({})).toBe(`${REDIRECT}?code=lost-event&state=s`)
      bridge.dispose()
    } finally {
      warn.mockRestore()
    }
  })

  it('hands the launch URL to exactly one reader so a used code is never replayed', () => {
    const ipcMain = fakeIpc()
    const callback = `${REDIRECT}?code=launch&state=s`
    const bridge = createIamDeepLinkBridge({
      app: fakeApp(),
      ipcMain: ipcMain,
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: REDIRECT,
      getWindow: () => undefined,
      assertSender: vi.fn(),
      registerScheme: false,
      argv: ['birdcoder.exe', callback],
    })
    const initial = ipcMain.handlers.get(SDKWORK_DESKTOP_BRIDGE.deepLinksGetInitialUrl)!
    expect(initial({})).toBe(callback)
    expect(initial({})).toBeNull()
    expect(bridge.getInitialUrl()).toBeNull()
    bridge.dispose()
  })

  it('flags a launch callback and notifies the shell for live callbacks', () => {
    const app = fakeApp()
    const ipcMain = fakeIpc()
    const onIamCallback = vi.fn()
    const launch = `${REDIRECT}?code=launch&state=s`
    const bridge = createIamDeepLinkBridge({
      app: app,
      ipcMain: ipcMain,
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: REDIRECT,
      getWindow: () => ({ webContents: { send: vi.fn() } }) as never,
      assertSender: vi.fn(),
      registerScheme: true,
      argv: ['birdcoder.exe', launch],
      onIamCallback,
    })

    // The launch callback decides whether startup opens the workspace, and it
    // retires once the renderer takes the URL — startup reads it before the
    // window exists, so a later sign-out can show the welcome screen again.
    expect(bridge.hasLaunchCallback()).toBe(true)
    expect(bridge.getInitialUrl()).toBe(launch)
    expect(bridge.getInitialUrl()).toBeNull()
    expect(bridge.hasLaunchCallback()).toBe(false)

    app.emitOpenUrl('birdcoder://open')
    expect(onIamCallback).not.toHaveBeenCalled()

    app.emitOpenUrl(`${REDIRECT}?code=live&state=s`)
    expect(onIamCallback).toHaveBeenCalledWith(`${REDIRECT}?code=live&state=s`)

    app.emitSecondInstance(['birdcoder.exe', `${REDIRECT}?code=second&state=s`])
    expect(onIamCallback).toHaveBeenLastCalledWith(`${REDIRECT}?code=second&state=s`)
    bridge.dispose()
  })

  it('reports no launch callback for an ordinary process start', () => {
    const bridge = createIamDeepLinkBridge({
      app: fakeApp(),
      ipcMain: fakeIpc(),
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: REDIRECT,
      getWindow: () => undefined,
      assertSender: vi.fn(),
      registerScheme: false,
      argv: ['birdcoder.exe'],
    })
    expect(bridge.hasLaunchCallback()).toBe(false)
    bridge.dispose()
  })

  it('accepts a reverse-domain private-use callback when the profile names one', () => {
    // RFC 8252 sections 7.1 and 8.4 ask for a private-use scheme based on a
    // domain name under the publisher's control, expressed in reverse order.
    // The shipped brand names `birdcoder`; a profile that needs that
    // interoperability registers a domain-based callback, and the bridge must
    // follow whatever the profile names.
    const compliant = 'com.sdkwork.birdcoder://auth/callback'
    const app = fakeApp()
    const ipcMain = fakeIpc()
    const send = vi.fn()
    const bridge = createIamDeepLinkBridge({
      app: app,
      ipcMain: ipcMain,
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: compliant,
      getWindow: () => ({ webContents: { send } }) as never,
      assertSender: vi.fn(),
      registerScheme: true,
      argv: ['birdcoder.exe'],
    })

    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('com.sdkwork.birdcoder')
    expect(matchesIamRedirectUri(`${compliant}?code=c&state=s`, compliant)).toBe(true)
    // A lookalike on the short scheme is not this profile's callback.
    expect(matchesIamRedirectUri(`${REDIRECT}?code=c&state=s`, compliant)).toBe(false)
    app.emitOpenUrl(`${compliant}?code=compliant&state=s`)
    expect(send).toHaveBeenCalledWith(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent, `${compliant}?code=compliant&state=s`)
    bridge.dispose()
  })

  it('accepts the authority-less private-use callback form on a reverse-domain scheme', () => {
    // RFC 8252 section 7.1: a private-use redirect has no naming authority, so
    // the RFC illustrates the single-slash form. The bridge registers and
    // matches whatever form the profile names.
    const singleSlash = 'com.sdkwork.birdcoder:/auth/callback'
    const app = fakeApp()
    const ipcMain = fakeIpc()
    const send = vi.fn()
    const bridge = createIamDeepLinkBridge({
      app: app,
      ipcMain: ipcMain,
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: singleSlash,
      getWindow: () => ({ webContents: { send } }) as never,
      assertSender: vi.fn(),
      registerScheme: true,
      argv: ['birdcoder.exe', `${singleSlash}?code=launch&state=s`],
    })

    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('com.sdkwork.birdcoder')
    // The launch URL, an authority-bearing lookalike, and the short scheme.
    expect(bridge.getInitialUrl()).toBe(`${singleSlash}?code=launch&state=s`)
    expect(matchesIamRedirectUri(`${singleSlash}?code=c&state=s`, singleSlash)).toBe(true)
    expect(matchesIamRedirectUri('com.sdkwork.birdcoder://auth/callback?code=c&state=s', singleSlash)).toBe(false)
    expect(matchesIamRedirectUri(`${REDIRECT}?code=c&state=s`, singleSlash)).toBe(false)
    app.emitOpenUrl(`${singleSlash}?code=live&state=s`)
    expect(send).toHaveBeenCalledWith(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent, `${singleSlash}?code=live&state=s`)
    bridge.dispose()
  })

  it('accepts a peer-relayed callback only when it matches the redirect', () => {
    const send = vi.fn()
    const bridge = createIamDeepLinkBridge({
      app: fakeApp(),
      ipcMain: fakeIpc(),
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: REDIRECT,
      getWindow: () => ({ webContents: { send } }) as never,
      assertSender: vi.fn(),
      registerScheme: false,
      argv: ['birdcoder.exe'],
    })

    // The local relay hands over URLs from peer processes; only the registered
    // callback may enter this renderer, and it is kept for the pull too.
    bridge.acceptExternalUrl('birdcoder://open')
    bridge.acceptExternalUrl('sdkwork-birdcoder://auth/callback?code=c&state=s')
    expect(send).not.toHaveBeenCalled()
    expect(bridge.getInitialUrl()).toBeNull()

    bridge.acceptExternalUrl(`${REDIRECT}?code=peer&state=s`)
    expect(send).toHaveBeenCalledWith(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent, `${REDIRECT}?code=peer&state=s`)
    expect(bridge.getInitialUrl()).toBe(`${REDIRECT}?code=peer&state=s`)
    bridge.dispose()
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

  it('reports the opened authorize URL so the shell can route its state', async () => {
    const ipcMain = fakeIpc()
    const onAuthorizeUrl = vi.fn()
    createIamDeepLinkBridge({
      app: fakeApp(),
      ipcMain: ipcMain,
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: REDIRECT,
      getWindow: () => undefined,
      assertSender: vi.fn(),
      registerScheme: false,
      argv: [],
      onAuthorizeUrl,
    })
    const open = ipcMain.handlers.get(SDKWORK_DESKTOP_BRIDGE.shellOpen)!
    await open({}, 'https://platform.birdcoder.com/iam/oauth/authorize?state=state-a')
    expect(onAuthorizeUrl).toHaveBeenCalledWith('https://platform.birdcoder.com/iam/oauth/authorize?state=state-a')
    await expect(open({}, 'file:///C:/Windows/System32')).rejects.toThrow(/refused scheme/)
    expect(onAuthorizeUrl).toHaveBeenCalledTimes(1)
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

  it('accepts a callback relayed by a peer process without re-broadcasting it', () => {
    const send = vi.fn()
    const onIamCallback = vi.fn()
    const onExternalCallback = vi.fn()
    const bridge = createIamDeepLinkBridge({
      app: fakeApp(),
      ipcMain: fakeIpc(),
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: REDIRECT,
      getWindow: () => ({ webContents: { send } }) as never,
      assertSender: vi.fn(),
      registerScheme: false,
      argv: [],
      onIamCallback,
      onExternalCallback,
    })

    bridge.acceptExternalUrl('birdcoder://open')
    expect(send).not.toHaveBeenCalled()
    bridge.acceptExternalUrl(`${REDIRECT}?code=peer&state=s`)
    expect(send).toHaveBeenCalledWith(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent,
      `${REDIRECT}?code=peer&state=s`)
    expect(onIamCallback).toHaveBeenCalledWith(`${REDIRECT}?code=peer&state=s`)
    // Delivery from a peer is not shared back to the peers.
    expect(onExternalCallback).not.toHaveBeenCalled()
    bridge.dispose()
  })

  it('shares every OS callback with peer processes after delivering it locally', () => {
    const app = fakeApp()
    const send = vi.fn()
    const onExternalCallback = vi.fn()
    const bridge = createIamDeepLinkBridge({
      app,
      ipcMain: fakeIpc(),
      shell: { openExternal: vi.fn(async () => {}) },
      redirectUri: REDIRECT,
      getWindow: () => ({ webContents: { send } }) as never,
      assertSender: vi.fn(),
      registerScheme: true,
      argv: [],
      onExternalCallback,
    })

    app.emitOpenUrl(`${REDIRECT}?code=live&state=s`)
    app.emitSecondInstance(['birdcoder.exe', `${REDIRECT}?code=second&state=s`])
    app.emitOpenUrl('birdcoder://open')
    expect(onExternalCallback.mock.calls).toEqual([
      [`${REDIRECT}?code=live&state=s`],
      [`${REDIRECT}?code=second&state=s`],
    ])
    bridge.dispose()
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
        if (channel === IAM_LOOPBACK_BRIDGE.start) return { redirectUri: 'http://127.0.0.1:1234/auth/callback' }
        if (channel === IAM_LOOPBACK_BRIDGE.pending) return { redirectUri: 'http://127.0.0.1:4321/auth/callback' }
        if (channel === IAM_LOOPBACK_BRIDGE.takeCallback) return 'http://127.0.0.1:4321/auth/callback?code=c&state=s'
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
      loopbackLogin: {
        start(): Promise<{ redirectUri: string }>
        pending(): Promise<{ redirectUri: string } | null>
        takeCallback(): Promise<string | null>
        cancel(): Promise<void>
        onCallback(handler: (url: string) => void): () => void
      }
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

    expect(await bridge.loopbackLogin.start()).toEqual({ redirectUri: 'http://127.0.0.1:1234/auth/callback' })
    // A reloaded page reads the waiting carrier and takes the callback the
    // shell kept while no page could hear it.
    expect(await bridge.loopbackLogin.pending()).toEqual({ redirectUri: 'http://127.0.0.1:4321/auth/callback' })
    expect(await bridge.loopbackLogin.takeCallback()).toBe('http://127.0.0.1:4321/auth/callback?code=c&state=s')
    const callbacks: string[] = []
    const offLoopback = bridge.loopbackLogin.onCallback((url) => { callbacks.push(url) })
    listeners.get(IAM_LOOPBACK_BRIDGE.callback)?.({}, 'http://127.0.0.1:1234/auth/callback?code=c&state=s')
    expect(callbacks).toEqual(['http://127.0.0.1:1234/auth/callback?code=c&state=s'])
    offLoopback()
    listeners.get(IAM_LOOPBACK_BRIDGE.callback)?.({}, 'http://127.0.0.1:1234/auth/callback?code=skip&state=s')
    expect(callbacks).toHaveLength(1)
    await bridge.loopbackLogin.cancel()
    expect(invoked).toContainEqual([IAM_LOOPBACK_BRIDGE.cancel, []])
  })

  it('isolates a throwing subscriber so the login runtime still hears the hand-off', () => {
    const values = new Map<string, unknown>()
    const listeners = new Map<string, (event: unknown, payload: unknown) => void>()
    const ipcRenderer = {
      invoke: vi.fn(async () => undefined),
      on: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => {
        listeners.set(channel, listener)
      }),
    }
    exposeSdkworkDesktopBridge({
      exposeInMainWorld: (key, value) => { values.set(key, value) },
    }, ipcRenderer as never)
    const bridge = values.get('sdkworkDesktop') as {
      deepLinks: { onOpenUrl(handler: (url: string) => void): () => void }
    }
    const seen: string[] = []
    bridge.deepLinks.onOpenUrl(() => { throw new Error('page listener failed') })
    bridge.deepLinks.onOpenUrl((url) => { seen.push(url) })

    expect(() => {
      listeners.get(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent)?.({}, `${REDIRECT}?code=x&state=s`)
    }).not.toThrow()
    expect(seen).toEqual([`${REDIRECT}?code=x&state=s`])
  })

  it('exposes the session and about slices and isolates malformed payloads', async () => {
    const values = new Map<string, unknown>()
    const listeners = new Map<string, (event: unknown, payload: unknown) => void>()
    const invoked: Array<[string, unknown[]]> = []
    const ipcRenderer = {
      invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
        invoked.push([channel, args])
        if (channel === ABOUT_BRIDGE.takePending) return true
        if (channel === ABOUT_BRIDGE.facts) return { appVersion: '1.2.3' }
        if (channel === IAM_SESSION_BRIDGE.read) {
          return { version: 1, authToken: 'a', accessToken: 'b', savedAt: 'now' }
        }
        if (channel === SDKWORK_DESKTOP_BRIDGE.shellOpen) throw new Error('no browser')
        return undefined
      }),
      on: vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => {
        listeners.set(channel, listener)
      }),
    }
    exposeSdkworkDesktopBridge({
      exposeInMainWorld: (key, value) => { values.set(key, value) },
    }, ipcRenderer as never)
    const bridge = values.get('sdkworkDesktop') as {
      deepLinks: { onOpenUrl(handler: (url: string) => void): () => void }
      shellOpen: { open(url: string): Promise<void> }
      about: { takePending(): Promise<boolean>; facts(): Promise<{ appVersion: string }> }
      iamSession: { read(): Promise<unknown>; save(session: unknown): Promise<void>; clear(): Promise<void> }
    }

    expect(await bridge.iamSession.read()).toMatchObject({ authToken: 'a' })
    await bridge.iamSession.save({ version: 1, authToken: 'a', accessToken: 'b', savedAt: 'now' })
    await bridge.iamSession.clear()
    expect(invoked).toContainEqual([
      IAM_SESSION_BRIDGE.save,
      [{ version: 1, authToken: 'a', accessToken: 'b', savedAt: 'now' }],
    ])
    expect(invoked).toContainEqual([IAM_SESSION_BRIDGE.clear, []])
    expect(await bridge.about.takePending()).toBe(true)
    expect(await bridge.about.facts()).toEqual({ appVersion: '1.2.3' })
    // The browser failure reaches the page instead of being swallowed here.
    await expect(bridge.shellOpen.open('https://platform.example/auth')).rejects.toThrow('no browser')

    // A payload that is not a URL string never reaches a subscriber.
    const seen: string[] = []
    bridge.deepLinks.onOpenUrl((url) => { seen.push(url) })
    listeners.get(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent)?.({}, 42)
    expect(seen).toEqual([])
  })
})
