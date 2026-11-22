import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SdkworkDesktopBridgeShape } from '@sdkwork/iam-desktop-auth'

const runtime = {
  beginLogin: vi.fn(async () => ({ authorizeUrl: 'https://platform.example/iam/oauth/authorize' })),
  descriptor: { appId: 'birdcoder', redirectUri: 'birdcoder://auth/callback', scopes: ['openid', 'profile'] },
  cancelLogin: vi.fn(async () => {}),
  completePendingCallbackFromLaunch: vi.fn(async () => false),
  controller: {
    isWaiting: vi.fn(() => true),
    subscribe: vi.fn(() => () => {}),
    handleOpenUrl: vi.fn(async () => ({ accessToken: 'access', authToken: 'auth' })),
  },
  dispose: vi.fn(),
}

const request = vi.fn(async () => ({ accessToken: 'access', authToken: 'auth' }))

vi.mock('@sdkwork/iam-app-sdk', () => ({
  appApiPath: (path: string) => `/app/v3/api${path}`,
  createClient: vi.fn(() => ({ http: { request } })),
}))
vi.mock('@sdkwork/iam-desktop-auth', () => ({
  createSdkworkIamDesktopAuthRuntime: vi.fn(() => runtime),
}))

import { createClient } from '@sdkwork/iam-app-sdk'
import { createSdkworkIamDesktopAuthRuntime } from '@sdkwork/iam-desktop-auth'
import { createIamDesktopLogin, readSdkworkDesktopBridge, readSdkworkDesktopIamSessionBridge } from '../src/client/iam-desktop.ts'

function bridge(): SdkworkDesktopBridgeShape {
  return {
    deepLinks: {
      getInitialUrl: async () => 'birdcoder://auth/callback?code=c&state=s',
      onOpenUrl: () => () => {},
    },
    shellOpen: { open: async () => {} },
  }
}

const tokenManager = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  // Restore the shared mock behaviour each test starts from: a test that flips
  // `isWaiting` or rejects `beginLogin` must not leak into the next one.
  runtime.beginLogin.mockResolvedValue({ authorizeUrl: 'https://platform.example/iam/oauth/authorize' })
  runtime.cancelLogin.mockResolvedValue(undefined)
  runtime.completePendingCallbackFromLaunch.mockResolvedValue(false)
  runtime.controller.isWaiting.mockImplementation(() => true)
  runtime.controller.handleOpenUrl.mockResolvedValue({ accessToken: 'access', authToken: 'auth' })
  runtime.controller.subscribe.mockReturnValue(() => {})
  runtime.dispose.mockImplementation(() => {})
  request.mockResolvedValue({ accessToken: 'access', authToken: 'auth' })
})

describe('readSdkworkDesktopBridge', () => {
  it('accepts the standard preload shape and rejects incomplete globals', () => {
    Reflect.set(globalThis, 'sdkworkDesktop', bridge())
    try {
      expect(readSdkworkDesktopBridge()).toBeDefined()
      Reflect.set(globalThis, 'sdkworkDesktop', { deepLinks: {} })
      expect(readSdkworkDesktopBridge()).toBeUndefined()
      Reflect.set(globalThis, 'sdkworkDesktop', null)
      expect(readSdkworkDesktopBridge()).toBeUndefined()
    } finally {
      Reflect.deleteProperty(globalThis, 'sdkworkDesktop')
    }
  })

  it('keeps the optional resume reads but drops malformed results', async () => {
    const loopback = {
      start: vi.fn(async () => ({ redirectUri: 'http://127.0.0.1:1234/auth/callback' })),
      cancel: vi.fn(async () => {}),
      onCallback: vi.fn(() => () => {}),
      pending: vi.fn(async (): Promise<unknown> => ({ redirectUri: 42 })),
      takeCallback: vi.fn(async (): Promise<unknown> => 42),
    }
    Reflect.set(globalThis, 'sdkworkDesktop', { ...bridge(), loopbackLogin: loopback })
    try {
      const parsed = readSdkworkDesktopBridge()
      expect(await parsed?.loopbackLogin?.pending?.()).toBeNull()
      expect(await parsed?.loopbackLogin?.takeCallback?.()).toBeNull()
      loopback.pending.mockResolvedValueOnce({ redirectUri: 'http://127.0.0.1:2/auth/callback' })
      loopback.takeCallback.mockResolvedValueOnce('http://127.0.0.1:2/auth/callback?code=c&state=s')
      expect(await parsed?.loopbackLogin?.pending?.()).toEqual({ redirectUri: 'http://127.0.0.1:2/auth/callback' })
      expect(await parsed?.loopbackLogin?.takeCallback?.()).toBe('http://127.0.0.1:2/auth/callback?code=c&state=s')

      // A bridge missing one deep-link function is not usable at all.
      Reflect.set(globalThis, 'sdkworkDesktop', { deepLinks: bridge().deepLinks, shellOpen: {} })
      expect(readSdkworkDesktopBridge()).toBeUndefined()

      // The durable-session slice needs all three operations; a partial one is
      // ignored so the token store falls back to the browser copy.
      Reflect.set(globalThis, 'sdkworkDesktop', { ...bridge(), iamSession: { read: async () => null } })
      expect(readSdkworkDesktopIamSessionBridge()).toBeUndefined()
      Reflect.set(globalThis, 'sdkworkDesktop', {
        ...bridge(),
        iamSession: { read: async () => null, save: async () => {}, clear: async () => {} },
      })
      expect(readSdkworkDesktopIamSessionBridge()).toBeDefined()
    } finally {
      Reflect.deleteProperty(globalThis, 'sdkworkDesktop')
    }
  })

  it('validates the optional loopback slice', async () => {
    const loopback = {
      start: vi.fn(async () => ({ redirectUri: 'http://127.0.0.1:1234/auth/callback' })),
      cancel: vi.fn(async () => {}),
      onCallback: vi.fn(() => () => {}),
    }
    Reflect.set(globalThis, 'sdkworkDesktop', { ...bridge(), loopbackLogin: loopback })
    try {
      const parsed = readSdkworkDesktopBridge()
      expect(await parsed?.loopbackLogin?.start())
        .toEqual({ redirectUri: 'http://127.0.0.1:1234/auth/callback' })
      expect(parsed?.loopbackLogin?.onCallback(() => {})).toBeTypeOf('function')
      await parsed?.loopbackLogin?.cancel()

      Reflect.set(globalThis, 'sdkworkDesktop', { ...bridge(), loopbackLogin: { start: 1 } })
      expect(readSdkworkDesktopBridge()?.loopbackLogin).toBeUndefined()

      Reflect.set(globalThis, 'sdkworkDesktop', {
        ...bridge(),
        loopbackLogin: { ...loopback, start: async () => ({ redirectUri: 42 }) },
      })
      await expect(readSdkworkDesktopBridge()?.loopbackLogin?.start())
        .rejects.toThrow(/redirect URI/u)
    } finally {
      Reflect.deleteProperty(globalThis, 'sdkworkDesktop')
    }
  })
})

describe('createIamDesktopLogin', () => {
  it('binds the generated PC client, the pending-flow window, and the upstream runtime to the bridge', async () => {
    const onSession = vi.fn()
    const input = bridge()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: input,
      flowTtlMs: 270_000,
      onSession,
    })

    expect(createClient).toHaveBeenCalledWith({
      authMode: 'dual-token',
      baseUrl: 'https://api.birdcoder.com',
      platform: 'pc',
      tokenManager,
    })
    expect(createSdkworkIamDesktopAuthRuntime).toHaveBeenCalledTimes(1)
    const runtimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls[0][0]
    expect(runtimeOptions.appId).toBe('birdcoder')
    expect(runtimeOptions.redirectUri).toBe('birdcoder://auth/callback')
    expect(runtimeOptions.authorizeBaseUrl).toBe('https://platform.birdcoder.com')
    expect(runtimeOptions.flowTtlMs).toBe(270_000)
    expect(runtimeOptions.host.id).toBe('electron')
    expect(runtimeOptions.onSession).toBeTypeOf('function')
    await runtimeOptions.onSession({} as never)
    expect(onSession).toHaveBeenCalledTimes(1)

    await login.begin()
    expect(runtime.beginLogin).toHaveBeenCalledTimes(1)
    expect(login.isWaiting()).toBe(true)
    // The waiting attempt exposes the authorize URL the host handed to the
    // browser, for the card's manual fallback; a settled attempt must not.
    const authorizeRequest = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0]
    await authorizeRequest.host.openExternal('https://platform.example/iam/oauth/authorize?state=s')
    expect(login.authorizeUrl()).toBe('https://platform.example/iam/oauth/authorize?state=s')
    await login.cancel()
    expect(runtime.cancelLogin).toHaveBeenCalledTimes(1)
    expect(login.authorizeUrl()).toBeUndefined()
    expect(await login.completePendingCallbackFromLaunch()).toBe(false)
    login.dispose()
    expect(runtime.dispose).toHaveBeenCalledTimes(1)
  })

  it('redeems a code at most once, through the generated transport with retries disabled', async () => {
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: bridge(),
      onSession: vi.fn(),
    })
    const runtimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0]
    const create = runtimeOptions.appSdkClient.oauth?.desktopSessions?.create
    expect(create).toBeDefined()

    const command = {
      authorizationCode: 'sdkwork-oauth_code-single',
      clientId: 'birdcoder',
      codeVerifier: 'verifier',
      redirectUri: 'birdcoder://auth/callback',
    }
    const first = await create!(command)
    const second = await create!(command)

    // A single-use code: the transport sees one POST, and a repeat delivery of
    // the same deep link observes that request's outcome.
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/app/v3/api/oauth/desktop_sessions', {
      method: 'POST',
      contentType: 'application/json',
      skipAuth: true,
      // The generated operation unwraps the create envelope's `data.item`;
      // the hand-written at-most-once caller must request the same shape.
      sdkworkUnwrapKind: 'item',
      retry: { maxRetries: 0 },
      body: command,
    })
    expect(first).toBe(second)

    // A different code is a different login attempt and redeems on its own.
    await create!({ ...command, authorizationCode: 'sdkwork-oauth_code-next' })
    expect(request).toHaveBeenCalledTimes(2)
    login.dispose()
  })

  /**
   * An event carries no backlog: a callback delivered while the renderer that
   * owns the pending flow has no listener is lost, and the shell then holds the
   * only copy in its `getInitialUrl` take. The waiting flow must recover it, or
   * a completed browser login never reaches the app.
   */
  it('recovers a callback whose deep-link event was dropped by taking it from the shell', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      runtime.controller.handleOpenUrl.mockClear()
      runtime.controller.handleOpenUrl.mockResolvedValueOnce({ accessToken: 'access', authToken: 'auth' })
      const onSession = vi.fn()
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: {
          deepLinks: {
            // The event never fires; the shell still holds the accepted URL.
            getInitialUrl: async () => 'birdcoder://auth/callback?code=c&state=s',
            onOpenUrl: () => () => {},
          },
          shellOpen: { open: async () => {} },
        },
        onSession,
      })

      await login.begin()
      expect(runtime.controller.handleOpenUrl).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(runtime.controller.handleOpenUrl).toHaveBeenCalledWith('birdcoder://auth/callback?code=c&state=s')
      expect(onSession).toHaveBeenCalledWith({ accessToken: 'access', authToken: 'auth' })
      // The settled attempt drops the URL its spent state made unusable.
      expect(login.authorizeUrl()).toBeUndefined()

      // The settled flow stops taking: no callback belongs to a finished login.
      runtime.controller.handleOpenUrl.mockClear()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(runtime.controller.handleOpenUrl).not.toHaveBeenCalled()
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a waiting login on a stale callback and stops polling when it is cancelled', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      runtime.controller.handleOpenUrl.mockClear()
      runtime.controller.handleOpenUrl.mockRejectedValue({ code: 'state-mismatch' })
      const onError = vi.fn()
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: bridge(),
        onSession: vi.fn(),
        onError,
      })

      await login.begin()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(runtime.controller.handleOpenUrl).toHaveBeenCalledTimes(1)
      // A foreign or stale link is not this attempt's failure.
      expect(onError).not.toHaveBeenCalled()
      // The real callback can still arrive, so the take repeats.
      await vi.advanceTimersByTimeAsync(2_000)
      expect(runtime.controller.handleOpenUrl).toHaveBeenCalledTimes(2)

      await login.cancel()
      const takes = runtime.controller.handleOpenUrl.mock.calls.length
      await vi.advanceTimersByTimeAsync(10_000)
      expect(runtime.controller.handleOpenUrl).toHaveBeenCalledTimes(takes)
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases the waiting URL, the take, and the loopback port when the attempt settles in error', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      const getInitialUrl = vi.fn(async () => null)
      const onError = vi.fn()
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: {
          deepLinks: { getInitialUrl, onOpenUrl: () => () => {} },
          shellOpen: { open: async () => {} },
        },
        onSession: vi.fn(),
        onError,
      })

      await login.begin()
      const runtimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0]
      await runtimeOptions.host.openExternal('https://platform.example/iam/oauth/authorize?state=s')
      expect(login.authorizeUrl()).toBe('https://platform.example/iam/oauth/authorize?state=s')
      // The controller stopped waiting (expiry or a rejected exchange) and the
      // runtime reports it: the attempt's carriers must not outlive it.
      runtime.controller.isWaiting.mockReturnValue(false)
      runtimeOptions.onError?.({ code: 'flow-expired' } as never)
      expect(onError).toHaveBeenCalledWith({ code: 'flow-expired' })
      expect(login.authorizeUrl()).toBeUndefined()
      getInitialUrl.mockClear()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(getInitialUrl).not.toHaveBeenCalled()
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('adopts a loopback carrier across a page reload and takes its retained callback', async () => {
    const loopbackRedirect = 'http://127.0.0.1:4321/auth/callback'
    const callback = `${loopbackRedirect}?code=c&state=s`
    const pending = vi.fn(async () => ({ redirectUri: loopbackRedirect }))
    const takeCallback = vi.fn(async () => callback)
    const cancel = vi.fn(async () => {})
    const onSession = vi.fn()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: {
        deepLinks: { getInitialUrl: async () => null, onOpenUrl: () => () => {} },
        shellOpen: { open: async () => {} },
        loopbackLogin: {
          start: async () => ({ redirectUri: loopbackRedirect }),
          pending,
          takeCallback,
          cancel,
          onCallback: () => () => {},
        },
      },
      onSession,
    })
    runtime.controller.isWaiting.mockReturnValue(false)
    runtime.controller.handleOpenUrl.mockClear()
    runtime.controller.handleOpenUrl.mockResolvedValueOnce({ accessToken: 'a', authToken: 't' })

    expect(await login.resumePendingLoopback()).toBe(true)
    // The reloaded page builds its runtime around the persisted redirect 鈥?
    const lastRuntimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0]
    expect(lastRuntimeOptions.redirectUri).toBe(loopbackRedirect)
    // 鈥?and redeems the callback the shell accepted while no page listened.
    expect(runtime.controller.handleOpenUrl).toHaveBeenCalledWith(callback)
    expect(onSession).toHaveBeenCalledWith({ accessToken: 'a', authToken: 't' })
    // Settling releases the shell listener.
    await vi.waitFor(() => { expect(cancel).toHaveBeenCalled() })
    login.dispose()
  })

  it('resumes nothing when the shell exposes no waiting loopback carrier', async () => {
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: bridge(),
      onSession: vi.fn(),
    })
    expect(await login.resumePendingLoopback()).toBe(false)
    login.dispose()
    // A disposed login never adopts a carrier.
    expect(await login.resumePendingLoopback()).toBe(false)
  })

  it('does not adopt a carrier the shell cannot report', async () => {
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: {
        deepLinks: { getInitialUrl: async () => null, onOpenUrl: () => () => {} },
        shellOpen: { open: async () => {} },
        loopbackLogin: {
          start: async () => ({ redirectUri: 'http://127.0.0.1:4321/auth/callback' }),
          pending: async () => { throw new Error('ipc down') },
          cancel: async () => {},
          onCallback: () => () => {},
        },
      },
      onSession: vi.fn(),
    })
    expect(await login.resumePendingLoopback()).toBe(false)
    login.dispose()
  })

  it('adopts a carrier whose retained callback cannot be read', async () => {
    const redirectUri = 'http://127.0.0.1:4321/auth/callback'
    const onSession = vi.fn()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: {
        deepLinks: { getInitialUrl: async () => null, onOpenUrl: () => () => {} },
        shellOpen: { open: async () => {} },
        loopbackLogin: {
          start: async () => ({ redirectUri }),
          pending: async () => ({ redirectUri }),
          takeCallback: async () => { throw new Error('already gone') },
          cancel: async () => {},
          onCallback: () => () => {},
        },
      },
      onSession,
    })
    runtime.controller.handleOpenUrl.mockClear()
    expect(await login.resumePendingLoopback()).toBe(true)
    expect(runtime.controller.handleOpenUrl).not.toHaveBeenCalled()
    expect(onSession).not.toHaveBeenCalled()
    expect(vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0].redirectUri).toBe(redirectUri)
    login.dispose()
  })

  it('keeps waiting on a stale retained callback and reports a settled one', async () => {
    const redirectUri = 'http://127.0.0.1:4321/auth/callback'
    const callback = `${redirectUri}?code=c&state=s`
    const onError = vi.fn()
    const create = (): ReturnType<typeof createIamDesktopLogin> => createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: {
        deepLinks: { getInitialUrl: async () => null, onOpenUrl: () => () => {} },
        shellOpen: { open: async () => {} },
        loopbackLogin: {
          start: async () => ({ redirectUri }),
          pending: async () => ({ redirectUri }),
          takeCallback: async () => callback,
          cancel: async () => {},
          onCallback: () => () => {},
        },
      },
      onSession: vi.fn(),
      onError,
    })

    runtime.controller.handleOpenUrl.mockClear()
    runtime.controller.handleOpenUrl.mockRejectedValueOnce({ code: 'state-mismatch' })
    const stale = create()
    expect(await stale.resumePendingLoopback()).toBe(true)
    expect(onError).not.toHaveBeenCalled()
    stale.dispose()

    // A settled attempt reports through the service's failure channel.
    runtime.controller.isWaiting.mockReturnValue(false)
    runtime.controller.handleOpenUrl.mockClear()
    runtime.controller.handleOpenUrl.mockRejectedValueOnce({ code: 'exchange-failed' })
    const settled = create()
    expect(await settled.resumePendingLoopback()).toBe(true)
    expect(onError).toHaveBeenCalledWith({ code: 'exchange-failed' })
    settled.dispose()
  })

  it('closes the loopback listener when the browser cannot be opened', async () => {
    const redirectUri = 'http://127.0.0.1:4321/auth/callback'
    const cancel = vi.fn(async () => {})
    runtime.controller.isWaiting.mockReturnValue(true)
    runtime.beginLogin.mockRejectedValueOnce(new Error('no browser'))
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: {
        deepLinks: { getInitialUrl: async () => null, onOpenUrl: () => () => {} },
        shellOpen: { open: async () => {} },
        loopbackLogin: {
          start: async () => ({ redirectUri }),
          pending: async () => null,
          cancel,
          onCallback: () => () => {},
        },
      },
      onSession: vi.fn(),
    })
    await expect(login.begin()).rejects.toThrow('no browser')
    expect(cancel).toHaveBeenCalled()
    expect(login.authorizeUrl()).toBeUndefined()
    login.dispose()
  })

  it('refuses to start after disposal and releases its subscribers', async () => {
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: bridge(),
      onSession: vi.fn(),
    })
    const listener = vi.fn()
    login.subscribe(listener)()
    login.dispose()
    await expect(login.begin()).rejects.toThrow(/disposed/u)
  })

  it('stops a scheduled take once the flow settled', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      const getInitialUrl = vi.fn(async () => null)
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: { deepLinks: { getInitialUrl, onOpenUrl: () => () => {} }, shellOpen: { open: async () => {} } },
        onSession: vi.fn(),
      })
      await login.begin()
      // The scheduled take works while the flow waits …
      await vi.advanceTimersByTimeAsync(2_000)
      expect(getInitialUrl).toHaveBeenCalledTimes(1)
      // … and the next scheduled take stops once the flow settled.
      runtime.controller.isWaiting.mockReturnValue(false)
      await vi.advanceTimersByTimeAsync(2_000)
      expect(getInitialUrl).toHaveBeenCalledTimes(1)
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a take whose flow settled during the shell read', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      const getInitialUrl = vi.fn(async () => {
        runtime.controller.isWaiting.mockReturnValue(false)
        return 'birdcoder://auth/callback?code=c&state=s'
      })
      runtime.controller.handleOpenUrl.mockClear()
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: { deepLinks: { getInitialUrl, onOpenUrl: () => () => {} }, shellOpen: { open: async () => {} } },
        onSession: vi.fn(),
      })
      await login.begin()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(getInitialUrl).toHaveBeenCalledTimes(1)
      expect(runtime.controller.handleOpenUrl).not.toHaveBeenCalled()
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a taken callback whose exchange failed', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      const onError = vi.fn()
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: {
          deepLinks: {
            getInitialUrl: async () => 'birdcoder://auth/callback?code=c&state=s',
            onOpenUrl: () => () => {},
          },
          shellOpen: { open: async () => {} },
        },
        onSession: vi.fn(),
        onError,
      })
      runtime.controller.handleOpenUrl.mockClear()
      runtime.controller.handleOpenUrl.mockRejectedValueOnce({ code: 'exchange-failed' })
      await login.begin()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(onError).toHaveBeenCalledWith({ code: 'exchange-failed' })
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('unsubscribes both carriers when the adopted loopback host is released', async () => {
    const redirectUri = 'http://127.0.0.1:4321/auth/callback'
    const offLoopback = vi.fn()
    const offDeepLinks = vi.fn()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: {
        deepLinks: { getInitialUrl: async () => null, onOpenUrl: () => offDeepLinks },
        shellOpen: { open: async () => {} },
        loopbackLogin: {
          start: async () => ({ redirectUri }),
          pending: async () => ({ redirectUri }),
          takeCallback: async () => null,
          cancel: async () => {},
          onCallback: () => offLoopback,
        },
      },
      onSession: vi.fn(),
    })
    await login.resumePendingLoopback()
    const host = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0].host
    host.onOpenUrl(() => {})()
    expect(offLoopback).toHaveBeenCalledTimes(1)
    expect(offDeepLinks).toHaveBeenCalledTimes(1)
    login.dispose()
  })

  it('keeps waiting when the shell take fails', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      const getInitialUrl = vi.fn()
        .mockRejectedValueOnce(new Error('ipc busy'))
        .mockResolvedValue(null)
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: { deepLinks: { getInitialUrl, onOpenUrl: () => () => {} }, shellOpen: { open: async () => {} } },
        onSession: vi.fn(),
        onError: vi.fn(),
      })
      await login.begin()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(getInitialUrl).toHaveBeenCalledTimes(1)
      // A failed take is not a failed login: the next one retries.
      await vi.advanceTimersByTimeAsync(2_000)
      expect(getInitialUrl).toHaveBeenCalledTimes(2)
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('schedules a single take when two starts race', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      const getInitialUrl = vi.fn(async () => null)
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: { deepLinks: { getInitialUrl, onOpenUrl: () => () => {} }, shellOpen: { open: async () => {} } },
        onSession: vi.fn(),
      })
      await Promise.all([login.begin(), login.begin()])
      await vi.advanceTimersByTimeAsync(2_000)
      expect(getInitialUrl).toHaveBeenCalledTimes(1)
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats a non-structured failure as an ordinary failure', async () => {
    const onError = vi.fn()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: bridge(),
      onSession: vi.fn(),
      onError,
    })
    request.mockClear()
    const runtimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0]
    runtimeOptions.onError?.('boom' as never)
    await Promise.resolve()
    expect(onError).toHaveBeenCalledWith('boom')
    // No server report can be recovered from a value that names no response.
    expect(request).not.toHaveBeenCalled()
    login.dispose()
  })

  it('reports a polled callback failure that is not a stale-flow error', async () => {
    vi.useFakeTimers()
    try {
      runtime.controller.isWaiting.mockReturnValue(true)
      const onError = vi.fn()
      const login = createIamDesktopLogin({
        clientId: 'birdcoder',
        redirectUri: 'birdcoder://auth/callback',
        authorizeBaseUrl: 'https://platform.birdcoder.com',
        baseUrl: 'https://api.birdcoder.com',
        tokenManager,
        bridge: {
          deepLinks: {
            getInitialUrl: async () => 'birdcoder://auth/callback?code=c&state=s',
            onOpenUrl: () => () => {},
          },
          shellOpen: { open: async () => {} },
        },
        onSession: vi.fn(),
        onError,
      })
      runtime.controller.handleOpenUrl.mockClear()
      runtime.controller.handleOpenUrl.mockRejectedValueOnce('boom')
      await login.begin()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(onError).toHaveBeenCalledWith('boom')
      login.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers the server report when the hosted page could not start the authorization', async () => {
    const onServerFailure = vi.fn()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: bridge(),
      onSession: vi.fn(),
      onServerFailure,
    })
    request.mockRejectedValueOnce({ httpStatus: 400, problem: { status: 400, code: 40001 } })
    const runtimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0]
    runtimeOptions.onError?.({ code: 'provider-denied', detail: 'server_error' } as never)
    await new Promise<void>((resolve) => { setTimeout(resolve, 20) })
    expect(request).toHaveBeenCalledTimes(1)
    expect(onServerFailure).toHaveBeenCalledWith(expect.objectContaining({ status: 400, code: '40001' }))
    login.dispose()
  })

  it('drops a server report that settles after the login was disposed', async () => {
    const onServerFailure = vi.fn()
    const login = createIamDesktopLogin({
      clientId: 'birdcoder',
      redirectUri: 'birdcoder://auth/callback',
      authorizeBaseUrl: 'https://platform.birdcoder.com',
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
      bridge: bridge(),
      onSession: vi.fn(),
      onServerFailure,
    })
    let rejectProbe: (error: unknown) => void = () => {}
    request.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectProbe = reject }))
    const runtimeOptions = vi.mocked(createSdkworkIamDesktopAuthRuntime).mock.calls.at(-1)![0]
    runtimeOptions.onError?.({ code: 'provider-denied', detail: 'server_error' } as never)
    // The probe is in flight when the login is torn down.
    expect(request).toHaveBeenCalledTimes(1)
    login.dispose()
    rejectProbe({ httpStatus: 400, problem: { status: 400 } })
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
    expect(onServerFailure).not.toHaveBeenCalled()
  })
})
