// @vitest-environment jsdom
/**
 * End-to-end regression for the deeplink login: the real desktop bridge, the
 * real `@sdkwork/iam-desktop-auth` controller, the real token store, and the
 * real generated-header builder. Only the generated IAM app client is replaced
 * (the backend contract itself is covered by the IAM Rust integration test),
 * so this spec proves the app-side chain: deep link → PKCE-bound exchange →
 * complete session in `<DSH_HOME>` and `localStorage` → controller session →
 * shared token manager → the dual-token headers every SDK client sends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { buildAuthHeaders, AuthenticationError } from '@sdkwork/sdk-common'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '../src/sdkwork-global-token-manager.ts'

const REDIRECT = 'birdcoder://auth/callback'
const SESSION = {
  authToken: 'auth.jwt.token',
  accessToken: 'access.jwt.token',
  refreshToken: 'refresh.jwt.token',
  sessionId: 'session-1',
  context: { tenantId: '100001', organizationId: '0', loginScope: 'TENANT', appId: 'birdcoder' },
  user: {
    id: 'user-1',
    email: 'bird@example.test',
    displayName: 'Bird User',
    firstName: 'Bird',
    lastName: 'User',
    initials: 'BU',
  },
}

const exchangeCalls: unknown[] = []
/** What the diagnostics probe of the hosted bootstrap answers; defaults to success. */
let authorizationBootstrapError: unknown
/** Token snapshot each account-profile read observed, to prove the read is authenticated. */
const profileCalls: Array<{ accessToken?: string; authToken?: string; refreshToken?: string }> = []
/** What the account endpoint reports, richer than the exchange payload. */
const PROFILE = {
  id: 'user-1',
  email: 'bird@example.test',
  username: 'birdy',
  displayName: 'Bird Profile',
  firstName: 'Bird',
  lastName: 'User',
  initials: 'BU',
  nickname: 'Birdie',
}
const client = {
  // The redeem leg goes through the generated transport with an explicit retry
  // policy, so the fake carries the transport and routes that one path to the
  // exchange fake the assertions observe.
  http: {
    request: vi.fn(async (path: string, options: { body?: unknown }) => {
      if (path === '/app/v3/api/oauth/authorizations') {
        if (authorizationBootstrapError !== undefined) throw authorizationBootstrapError
        return { item: { authorizationStateId: 'diagnostics-state-1' } }
      }
      if (path !== '/app/v3/api/oauth/desktop_sessions') throw new Error(`unexpected request: ${path}`)
      return client.oauth.desktopSessions.create(options.body)
    }),
  },
  auth: {
    sessions: {
      create: vi.fn(async () => SESSION),
      refresh: vi.fn(async () => SESSION),
      current: {
        delete: vi.fn(async () => undefined),
        logout: vi.fn(async (_body: { refreshToken: string }) => undefined),
        retrieve: vi.fn(async () => SESSION),
        update: vi.fn(async () => SESSION),
      },
    },
  },
  oauth: {
    desktopSessions: {
      create: vi.fn(async (body: unknown) => {
        exchangeCalls.push(body)
        return SESSION
      }),
    },
  },
  iam: {
    users: {
      current: {
        retrieve: vi.fn(async () => {
          profileCalls.push(getSdkworkGlobalTokenManager().getTokens())
          return PROFILE
        }),
      },
    },
  },
  setTokenManager: vi.fn(() => client),
}

vi.mock('@sdkwork/iam-app-sdk', () => ({
  appApiPath: (path: string) => `/app/v3/api${path}`,
  createClient: vi.fn(() => client),
}))

import { IamService } from '../src/client/iam-service.ts'
import { createIamAccountSource } from '../src/client/account-source.ts'

let openHandlers: Array<(url: string) => void> = []
const openedUrls: string[] = []
let durableRecord: unknown = null
let loopbackHandlers: Array<(url: string) => void> = []
let loopbackCanceled = 0
const LOOPBACK_REDIRECT = 'http://127.0.0.1:54321/auth/callback'

function installDesktopBridge(options: { loopback?: 'ok' | 'unavailable' } = {}): void {
  const bridge: Record<string, unknown> = {
    deepLinks: {
      getInitialUrl: async () => null,
      onOpenUrl: (handler: (url: string) => void) => {
        openHandlers.push(handler)
        return () => {
          openHandlers = openHandlers.filter(candidate => candidate !== handler)
        }
      },
    },
    shellOpen: {
      open: async (url: string) => { openedUrls.push(url) },
    },
    iamSession: {
      read: async () => durableRecord,
      save: async (session: unknown) => { durableRecord = session },
      clear: async () => { durableRecord = null },
    },
  }
  if (options.loopback === 'ok') {
    bridge.loopbackLogin = {
      start: async () => ({ redirectUri: LOOPBACK_REDIRECT }),
      cancel: async () => { loopbackCanceled += 1 },
      onCallback: (handler: (url: string) => void) => {
        loopbackHandlers.push(handler)
        return () => {
          loopbackHandlers = loopbackHandlers.filter(candidate => candidate !== handler)
        }
      },
    }
  } else if (options.loopback === 'unavailable') {
    bridge.loopbackLogin = {
      start: async () => { throw new Error('loopback disabled') },
      cancel: async () => { loopbackCanceled += 1 },
      onCallback: () => () => {},
    }
  }
  ;(globalThis as Record<string, unknown>).sdkworkDesktop = bridge
}

/** Deliver one OS deep link to every registered listener, as Electron does. */
function emitDeepLink(url: string): void {
  for (const handler of [...openHandlers]) handler(url)
}

/** Let one queued microtask chain settle (a delivered callback runs async). */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
}

/** A JWT-shaped token whose only claim is its expiry, as the refresh scheduler reads it. */
function jwtExpiringAt(secondsFromNow: number): string {
  return `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }))}.signature`
}

function scopeOf(): SettingsScope<UiIamSettings> {
  return {
    getSnapshot: () => ({
      status: 'ready' as const,
      // The shipped default gesture is the hosted browser login.
      value: DEFAULT_UI_IAM_SETTINGS,
      base: undefined,
      user: undefined,
      revision: 1,
      writable: true,
      mode: 'host' as const,
    }),
    subscribe: () => () => {},
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
  }
}

function envOf(): EnvService {
  return {
    isConfigured: () => true,
    apiBaseUrl: () => 'https://api.example.test',
    appId: () => 'birdcoder',
    appKey: () => 'birdcoder',
    accessToken: () => '',
    subscribe: () => () => {},
  } as unknown as EnvService
}

function layoutOf(): ILayout {
  return {
    toggleSidebar: vi.fn(),
    setSidebarVisible: vi.fn(),
    openDetails: vi.fn(),
    closeDetails: vi.fn(),
    setMode: vi.fn(),
  }
}

describe('deeplink login end to end', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    resetSdkworkGlobalTokenManager()
    storage.clear()
    exchangeCalls.length = 0
    profileCalls.length = 0
    openedUrls.length = 0
    openHandlers = []
    durableRecord = null
    loopbackHandlers = []
    loopbackCanceled = 0
    authorizationBootstrapError = undefined
    client.oauth.desktopSessions.create.mockClear()
    client.http.request.mockClear()
    client.iam.users.current.retrieve.mockClear()
    globalThis.localStorage = {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value) },
      removeItem: (key) => { storage.delete(key) },
      clear: () => { storage.clear() },
      key: () => null,
      length: 0,
    }
    installDesktopBridge()
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'sdkworkDesktop')
    Reflect.deleteProperty(globalThis, 'dshDesktop')
    vi.clearAllMocks()
  })

  it('redeems the deep link, persists the complete session, and seeds every SDK', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    expect(service.browserSignInAvailable()).toBe(true)

    // A backend call waiting at the sign-in door is released by the deeplink
    // login, not only by the in-page form.
    const heldCall = service.requestSignIn()

    // 1. The app starts the browser login: PKCE S256 + state + registered
    //    callback reach the hosted platform page.
    await service.beginBrowserSignIn()
    expect(openedUrls).toHaveLength(1)
    const authorizeUrl = new URL(openedUrls[0])
    expect(authorizeUrl.origin).toBe('https://platform.birdcoder.com')
    expect(authorizeUrl.pathname).toBe('/iam/oauth/authorize')
    expect(authorizeUrl.searchParams.get('client_id')).toBe('birdcoder')
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(REDIRECT)
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorizeUrl.searchParams.get('scope')).toContain('openid')
    const state = authorizeUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    // 2. The hosted login completes and the OS delivers the callback to every
    //    registered listener.
    expect(openHandlers).toHaveLength(1)
    emitDeepLink(`${REDIRECT}?code=code-1&state=${state}`)

    // 3. The app redeems the code through the generated IAM app client.
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    await expect(heldCall).resolves.toBe(true)
    expect(exchangeCalls).toHaveLength(1)
    expect(service.browserSignInFailed()).toBe(false)
    expect(exchangeCalls[0]).toMatchObject({
      clientId: 'birdcoder',
      authorizationCode: 'code-1',
      redirectUri: REDIRECT,
    })
    expect(typeof (exchangeCalls[0] as { codeVerifier?: unknown }).codeVerifier).toBe('string')

    // 4. The complete session is durable in the desktop store
    //    (`<DSH_HOME>/iam/session.json` shape); the plaintext browser copy is
    //    deliberately left empty so the tokens exist only in the encrypted file.
    expect(durableRecord).toMatchObject({
      authToken: SESSION.authToken,
      accessToken: SESSION.accessToken,
      refreshToken: SESSION.refreshToken,
      sessionId: SESSION.sessionId,
      context: SESSION.context,
    })
    // The account profile, not the exchange payload, supplies the identity the
    // surfaces render — the same hydration the in-app form performs.
    expect((durableRecord as { user?: unknown }).user).toMatchObject({
      id: 'user-1',
      email: 'bird@example.test',
      username: 'birdy',
      displayName: 'Bird Profile',
      firstName: 'Bird',
      lastName: 'User',
      initials: 'BU',
      nickname: 'Birdie',
    })
    expect(storage.has('dsh.iam.session')).toBe(false)

    // 4a. That profile read was authenticated: the redeemed tokens reached the
    //     shared manager before the account endpoint was called.
    expect(profileCalls).toHaveLength(1)
    expect(profileCalls[0]).toMatchObject({
      authToken: SESSION.authToken,
      accessToken: SESSION.accessToken,
    })

    // 5. The controller and the shared token manager carry the same session,
    //    including the AppContext and the hydrated identity.
    expect(service.controller.getState().session?.accessToken).toBe(SESSION.accessToken)
    expect(service.controller.getState().session?.context).toMatchObject({ tenantId: '100001', appId: 'birdcoder' })
    expect(service.controller.getState().user).toMatchObject({
      displayName: 'Bird Profile',
      email: 'bird@example.test',
      firstName: 'Bird',
      lastName: 'User',
      initials: 'BU',
    })
    expect(getSdkworkGlobalTokenManager().getTokens()).toMatchObject({
      authToken: SESSION.authToken,
      accessToken: SESSION.accessToken,
      refreshToken: SESSION.refreshToken,
    })

    // 6. Every SDK client built on that manager sends the same dual-token pair
    //    (`buildAuthHeaders` is the generated clients' own header builder).
    const headers = buildAuthHeaders('dual-token', undefined, getSdkworkGlobalTokenManager())
    expect(headers).toMatchObject({
      Authorization: `Bearer ${SESSION.authToken}`,
      'Access-Token': SESSION.accessToken,
    })

    // 7. The settings-menu account row and a held backend call both see the login.
    expect(createIamAccountSource(service).getSnapshot()).toEqual({ signedIn: true, username: 'Bird Profile' })
    expect(service.browserSignInFailure()).toBeUndefined()
    // 8. The deep link is the outcome of a login the user may have left running
    //    after closing the card, so it is announced rather than left silent.
    expect(service.signInNotice()).toMatchObject({ kind: 'signed-in', accountName: 'Bird Profile' })
  })

  it('uses a per-process loopback redirect and redeems its callback', async () => {
    installDesktopBridge({ loopback: 'ok' })
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    expect(openedUrls).toHaveLength(1)
    const authorizeUrl = new URL(openedUrls[0])
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(LOOPBACK_REDIRECT)
    const state = authorizeUrl.searchParams.get('state')
    expect(state).toBeTruthy()
    expect(loopbackHandlers.length).toBeGreaterThan(0)
    for (const handler of [...loopbackHandlers]) {
      handler(`${LOOPBACK_REDIRECT}?code=loopback-1&state=${state}`)
    }
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    expect(exchangeCalls[0]).toMatchObject({
      clientId: 'birdcoder',
      authorizationCode: 'loopback-1',
      redirectUri: LOOPBACK_REDIRECT,
    })
    expect(service.browserSignInFailed()).toBe(false)
    // The ephemeral listener stops as soon as the session is committed.
    expect(loopbackCanceled).toBeGreaterThan(0)
  })

  it('ignores a forged loopback callback and still redeems the real one', async () => {
    installDesktopBridge({ loopback: 'ok' })
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const authorizeUrl = new URL(openedUrls[0])
    const state = authorizeUrl.searchParams.get('state')
    // A local request with a foreign state must not fail or consume the flow.
    for (const handler of [...loopbackHandlers]) {
      handler(`${LOOPBACK_REDIRECT}?code=forged&state=forged`)
    }
    expect(service.isSignedIn()).toBe(false)
    expect(service.browserSignInFailed()).toBe(false)
    for (const handler of [...loopbackHandlers]) {
      handler(`${LOOPBACK_REDIRECT}?code=real&state=${state}`)
    }
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    expect(exchangeCalls[0]).toMatchObject({ authorizationCode: 'real', redirectUri: LOOPBACK_REDIRECT })
  })

  it('completes a login through a real loopback HTTP redirect', async () => {
    let server: Server | undefined
    try {
      const handlers: Array<(url: string) => void> = []
      server = createServer((request, response) => {
        const port = (server?.address() as AddressInfo).port
        const url = `http://127.0.0.1:${String(port)}${request.url ?? ''}`
        for (const handler of [...handlers]) handler(url)
        response.writeHead(200, { 'content-type': 'text/plain' }).end('ok')
      })
      await new Promise<void>((resolve) => { server?.listen(0, '127.0.0.1', () => { resolve() }) })
      const { port } = server.address() as AddressInfo
      const redirectUri = `http://127.0.0.1:${String(port)}/auth/callback`
      ;(globalThis as Record<string, unknown>).sdkworkDesktop = {
        ...(globalThis as Record<string, unknown>).sdkworkDesktop as Record<string, unknown>,
        loopbackLogin: {
          start: async () => ({ redirectUri }),
          cancel: async () => {},
          onCallback: (handler: (url: string) => void) => {
            handlers.push(handler)
            return () => {
              const index = handlers.indexOf(handler)
              if (index >= 0) handlers.splice(index, 1)
            }
          },
        },
      }
      const service = new IamService(scopeOf(), envOf(), layoutOf())
      await service.beginBrowserSignIn()
      const authorizeUrl = new URL(openedUrls[0])
      expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(redirectUri)
      const state = authorizeUrl.searchParams.get('state')
      // The authorization server's redirect is a top-level document navigation;
      // the listener rejects programmatic callers.
      await fetch(`${redirectUri}?code=http-loopback&state=${state}`, {
        headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
      })
      await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
      expect(exchangeCalls[0]).toMatchObject({ authorizationCode: 'http-loopback', redirectUri })
    } finally {
      if (server !== undefined) await new Promise<void>((resolve) => { server?.close(() => { resolve() }) })
    }
  })

  it('falls back to the registered custom-scheme callback when loopback is unavailable', async () => {
    installDesktopBridge({ loopback: 'unavailable' })
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    expect(openedUrls).toHaveLength(1)
    const authorizeUrl = new URL(openedUrls[0])
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(REDIRECT)
    const state = authorizeUrl.searchParams.get('state')
    expect(openHandlers).toHaveLength(1)
    emitDeepLink(`${REDIRECT}?code=fallback-1&state=${state}`)
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    expect(exchangeCalls[0]).toMatchObject({ authorizationCode: 'fallback-1', redirectUri: REDIRECT })
  })

  it('opens the desktop product page and then the hosted browser login', async () => {
    const openSignIn = vi.fn(async () => 'login' as const)
    ;(globalThis as Record<string, unknown>).dshDesktop = { auth: { openSignIn } }
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    const openBrowser = vi.fn()
    const openLogin = vi.fn()
    service.attachModal({ openEntry: vi.fn(), openLogin, openBrowser, close: vi.fn() })

    const heldCall = service.requestSignIn()
    await vi.waitFor(() => { expect(openBrowser).toHaveBeenCalledOnce() })
    expect(openSignIn).toHaveBeenCalledOnce()
    // The login gesture runs the configured flow: the hosted page in the
    // system browser, not the in-app account methods.
    await vi.waitFor(() => { expect(openedUrls).toHaveLength(1) })
    expect(openLogin).not.toHaveBeenCalled()

    const state = new URL(openedUrls[0]).searchParams.get('state')
    emitDeepLink(`${REDIRECT}?code=code-3&state=${state}`)
    await expect(heldCall).resolves.toBe(true)
    expect(service.isSignedIn()).toBe(true)
  })

  it.each(['dismissed', 'credential'] as const)('answers "no" when the welcome page ends with %s', async (outcome) => {
    ;(globalThis as Record<string, unknown>).dshDesktop = { auth: { openSignIn: async () => outcome } }
    const service = new IamService(scopeOf(), envOf(), layoutOf())

    await expect(service.requestSignIn()).resolves.toBe(false)
    // Neither gesture starts the hosted login.
    expect(openedUrls).toHaveLength(0)
  })

  it('records the failing step when the hosted authorization is refused', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    emitDeepLink(
      `${REDIRECT}?error=server_error&error_description=The hosted authorization could not be started.&state=${state}`,
    )

    await vi.waitFor(() => { expect(service.browserSignInFailed()).toBe(true) })
    expect(service.isSignedIn()).toBe(false)
    // The card names the step instead of reporting "the browser did not open".
    expect(service.browserSignInFailure()).toEqual({
      code: 'provider-denied',
      message: 'The hosted authorization could not be started.',
      detail: 'server_error',
    })
    // A refused authorization leaves nothing behind: no durable record, no
    // credential in the shared manager, and no profile read.
    expect(durableRecord).toBeNull()
    expect(getSdkworkGlobalTokenManager().getTokens()?.authToken).toBeUndefined()
    expect(client.iam.users.current.retrieve).not.toHaveBeenCalled()
  })

  it('asks the IAM server for the report a failed hosted authorization did not forward', async () => {
    const problem = {
      type: 'https://docs.sdkwork.com/problems/40001',
      title: 'Validation failed',
      status: 400,
      code: 40001,
      detail: 'OAuth client birdcoder is registered on an installation that is not bound to a deploy application',
      traceId: 'trace-hosted-1',
      instance: 'POST /app/v3/api/oauth/authorizations',
      operationId: 'authorizations.create',
    }
    authorizationBootstrapError = Object.assign(new Error(problem.detail), {
      httpStatus: 400,
      code: 'VALIDATION_ERROR',
      traceId: problem.traceId,
      problem,
    })
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    emitDeepLink(
      `${REDIRECT}?error=server_error&error_description=The hosted authorization could not be started.&state=${state}`,
    )

    // The page's own sentence arrives first; the probe fills in the server's
    // answer for the same attempt, so the details view never shows a bare
    // `server_error`.
    await vi.waitFor(() => {
      expect(service.browserSignInFailure()?.response).toMatchObject({
        status: 400,
        code: '40001',
        traceId: 'trace-hosted-1',
      })
    })
    expect(service.browserSignInFailure()).toMatchObject({ code: 'provider-denied', detail: 'server_error' })
    expect(service.browserSignInFailure()?.response?.body).toContain('not bound to a deploy application')
    expect(service.browserSignInFailure()?.response?.body).toContain('authorizations.create')

    // The probe repeats the page's own anonymous bootstrap request: same client
    // and callback, a throwaway state and S256 challenge, no credentials.
    const probe = client.http.request.mock.calls.find(([path]) => path === '/app/v3/api/oauth/authorizations')
    expect(probe).toBeDefined()
    const probeOptions = probe?.[1] as { method?: string; skipAuth?: boolean; body?: Record<string, string> }
    expect(probeOptions.method).toBe('POST')
    expect(probeOptions.skipAuth).toBe(true)
    expect(probeOptions.body).toMatchObject({
      clientId: 'birdcoder',
      responseType: 'code',
      redirectUri: REDIRECT,
      codeChallengeMethod: 'S256',
    })
    expect(probeOptions.body?.codeChallenge).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/u)
    expect(service.isSignedIn()).toBe(false)
    expect(durableRecord).toBeNull()
  })

  it('does not ask the server to explain a consent the user refused', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    emitDeepLink(`${REDIRECT}?error=access_denied&error_description=The user refused&state=${state}`)

    await vi.waitFor(() => { expect(service.browserSignInFailed()).toBe(true) })
    expect(service.browserSignInFailure()).toMatchObject({ code: 'provider-denied', detail: 'access_denied' })
    expect(client.http.request.mock.calls.some(([path]) => path === '/app/v3/api/oauth/authorizations')).toBe(false)
    expect(service.browserSignInFailure()?.response).toBeUndefined()
  })

  it('reports a rejected code exchange and leaves the app signed out', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    client.oauth.desktopSessions.create.mockRejectedValueOnce(new Error('authorization code is invalid or expired'))
    emitDeepLink(`${REDIRECT}?code=code-4&state=${state}`)

    await vi.waitFor(() => { expect(service.browserSignInFailed()).toBe(true) })
    expect(service.isSignedIn()).toBe(false)
    expect(service.browserSignInFailure()).toMatchObject({ code: 'exchange-failed' })
    expect(durableRecord).toBeNull()
    expect(getSdkworkGlobalTokenManager().getTokens()?.authToken).toBeUndefined()
  })

  it('keeps the server report of a rejected code exchange for the details view', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    // The generated transport rejects with the IAM endpoint's problem document;
    // the desktop runtime keeps only the message, so the card's details view
    // depends on the redeem leg reporting the rest itself.
    const problem = {
      type: 'https://docs.sdkwork.com/problems/40002',
      title: 'Validation failed',
      status: 400,
      code: 40002,
      detail: 'installation is not bound to a deploy application (安装未绑定部署应用)',
      traceId: 'trace-exchange-1',
    }
    client.oauth.desktopSessions.create.mockRejectedValueOnce(Object.assign(
      new Error(problem.detail),
      { httpStatus: 400, code: 'VALIDATION_ERROR', traceId: problem.traceId, problem },
    ))
    emitDeepLink(`${REDIRECT}?code=code-4c&state=${state}`)

    await vi.waitFor(() => { expect(service.browserSignInFailed()).toBe(true) })
    const failure = service.browserSignInFailure()
    expect(failure).toMatchObject({ code: 'exchange-failed' })
    expect(failure?.response).toMatchObject({ status: 400, code: '40002', traceId: 'trace-exchange-1' })
    expect(failure?.response?.body).toContain('installation is not bound to a deploy application')
    expect(service.isSignedIn()).toBe(false)
    expect(durableRecord).toBeNull()
  })

  it('discards a committed session the account endpoint refuses', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    // The exchange succeeds, but the gateway refuses the issued credentials. If
    // this were accepted, the login would look complete while every SDK client
    // failed on the same rejected session.
    client.iam.users.current.retrieve.mockRejectedValueOnce(new AuthenticationError('invalid or expired IAM session'))
    emitDeepLink(`${REDIRECT}?code=code-4b&state=${state}`)

    await vi.waitFor(() => { expect(service.browserSignInFailed()).toBe(true) })
    expect(service.isSignedIn()).toBe(false)
    expect(service.browserSignInFailure()).toMatchObject({
      code: 'session-rejected',
      message: 'invalid or expired IAM session',
    })
    // Nothing keeps the refused credentials: no durable record and no shared
    // manager tokens, so no SDK client can send them.
    expect(durableRecord).toBeNull()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({})
  })

  it('reports an expired hand-off instead of waiting forever', async () => {
    vi.useFakeTimers()
    try {
      const service = new IamService(scopeOf(), envOf(), layoutOf())
      await service.beginBrowserSignIn()
      expect(service.browserSignInWaiting()).toBe(true)
      await vi.advanceTimersByTimeAsync(10 * 60 * 1_000 + 1)
      expect(service.browserSignInWaiting()).toBe(false)
      expect(service.browserSignInFailed()).toBe(true)
      expect(service.browserSignInFailure()).toMatchObject({ code: 'flow-expired' })
    } finally {
      vi.useRealTimers()
    }
  }, 30_000)

  it('rotates the shared credentials when the pre-expiry refresh runs', async () => {
    // A token that expires a minute from now makes the scheduler refresh about a
    // second after the login, which exercises the real scheduled path.
    const soon = jwtExpiringAt(61)
    const refreshedAccess = jwtExpiringAt(3_600)
    client.oauth.desktopSessions.create.mockResolvedValueOnce({
      accessToken: soon,
      authToken: 'auth.old',
      refreshToken: 'refresh.old',
      sessionId: 'session-1',
    })
    client.auth.sessions.refresh.mockResolvedValueOnce({
      accessToken: refreshedAccess,
      authToken: 'auth.new',
      refreshToken: 'refresh.new',
      sessionId: 'session-1',
    })

    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    emitDeepLink(`${REDIRECT}?code=code-5&state=${state}`)
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    // A loaded worker can let the pre-expiry scheduler fire before this read;
    // either way the shared transport must carry one of this session's tokens.
    expect([soon, refreshedAccess]).toContain(getSdkworkGlobalTokenManager().getAccessToken())

    // The refreshed pair must reach the shared transport, not just the store:
    // every SDK request reads this manager. The scheduler fires about a second
    // after the login; the budget leaves room for a loaded CI worker.
    await vi.waitFor(() => {
      expect(getSdkworkGlobalTokenManager().getAccessToken()).toBe(refreshedAccess)
    }, { timeout: 10_000 })
    expect(getSdkworkGlobalTokenManager().getAuthToken()).toBe('auth.new')
    expect((durableRecord as { accessToken?: string }).accessToken).toBe(refreshedAccess)

    // A later controller emit must republish the refreshed pair, not the
    // pre-refresh session the controller still carries.
    service.controller.syncUserProfile(service.controller.getState().user)
    expect(getSdkworkGlobalTokenManager().getAccessToken()).toBe(refreshedAccess)

    await service.controller.signOut()
    expect(getSdkworkGlobalTokenManager().getTokens().authToken).toBeUndefined()
  }, 30_000)

  it('completes a login whose deep-link event never reached the page, by taking it from the shell', async () => {
    vi.useFakeTimers()
    try {
      // The shell accepted the callback, but the renderer that owns the pending
      // flow had no listener when the event fired (a reloading document or a
      // plugin that had not bootstrapped). Only the shell's take still knows it.
      let pendingUrl: string | null = null
      const bridge = (globalThis as { sdkworkDesktop?: Record<string, unknown> }).sdkworkDesktop
      const deepLinks = bridge?.deepLinks as { getInitialUrl: unknown }
      deepLinks.getInitialUrl = async () => pendingUrl

      const service = new IamService(scopeOf(), envOf(), layoutOf())
      await service.beginBrowserSignIn()
      const state = new URL(openedUrls[0]).searchParams.get('state')
      pendingUrl = `${REDIRECT}?code=code-recovered&state=${state}`
      // No deep-link event is emitted anywhere: the waiting flow has to ask.
      await vi.advanceTimersByTimeAsync(2_000)
      await vi.advanceTimersByTimeAsync(0)
      expect(service.isSignedIn()).toBe(true)
      expect(exchangeCalls[0]).toMatchObject({ authorizationCode: 'code-recovered', redirectUri: REDIRECT })
      expect(durableRecord).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a repeated callback after the login already completed', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    const callback = `${REDIRECT}?code=code-6&state=${state}`
    emitDeepLink(callback)
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    const tokens = getSdkworkGlobalTokenManager().getTokens()

    // The browser or the OS may deliver the same link twice; the second one has
    // no pending flow, so it must not be reported as a failed login.
    emitDeepLink(callback)
    await settle()
    expect(service.browserSignInFailed()).toBe(false)
    expect(service.browserSignInFailure()).toBeUndefined()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual(tokens)
    expect(client.oauth.desktopSessions.create).toHaveBeenCalledTimes(1)
  })

  it('keeps a pending login alive when a stale callback arrives', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()

    // A callback for another attempt (or a forged one) cannot consume this
    // flow, and the card must keep waiting rather than offer a retry.
    emitDeepLink(`${REDIRECT}?code=stale&state=not-this-attempt`)
    await settle()
    expect(service.browserSignInWaiting()).toBe(true)
    expect(service.browserSignInFailed()).toBe(false)

    // The real callback still completes the attempt.
    const state = new URL(openedUrls[0]).searchParams.get('state')
    emitDeepLink(`${REDIRECT}?code=code-7&state=${state}`)
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
  })

  it('signs out of both stores and releases the shared credentials', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]).searchParams.get('state')
    emitDeepLink(`${REDIRECT}?code=code-2&state=${state}`)
    await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
    expect(durableRecord).not.toBeNull()

    await service.controller.signOut()
    // The revocation request and the local clear settle before the assertions;
    // a trailing broadcast from the sign-out must not race them.
    await settle()
    // Sign-out revokes the server session through the refresh token, which is
    // the path that still works after the access token expired.
    expect(client.auth.sessions.current.logout).toHaveBeenCalledWith({ refreshToken: SESSION.refreshToken })
    expect(durableRecord).toBeNull()
    expect(storage.has('dsh.iam.session')).toBe(false)
    expect(getSdkworkGlobalTokenManager().getTokens().authToken).toBeUndefined()
    expect(service.isSignedIn()).toBe(false)
  })
})
