// @vitest-environment jsdom
/**
 * Post-login SDK access, end to end.
 *
 * The deeplink login is only complete when every SDK client can reach app-api
 * with the committed session: a plugin creates its generated client from the
 * shared token manager, and app-api requires the dual-token pair on the wire.
 * This spec runs the real desktop bridge, the real IAM service, the real token
 * store, and the real generated IAM app client; only the network is stubbed, so
 * it asserts the exact headers a freshly created plugin client sends after the
 * deep-link login — and that a refused session is not reported as a login.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAuthHeaders } from '@sdkwork/sdk-common'
import { createClient } from '@sdkwork/iam-app-sdk'
import { DEFAULT_UI_IAM_SETTINGS, type UiIamSettings } from '../src/iam-settings.ts'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import { IamService } from '../src/client/iam-service.ts'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '../src/sdkwork-global-token-manager.ts'

const REDIRECT = 'birdcoder://auth/callback'
const BASE_URL = 'https://api.example.test'
const SESSION = {
  accessToken: 'access.jwt.token',
  authToken: 'auth.jwt.token',
  refreshToken: 'refresh.opaque.token',
  sessionId: 'session-1',
  user: { id: 'user-1', email: 'bird@example.test', displayName: 'Bird User' },
}
const PROFILE = {
  id: 'user-1',
  email: 'bird@example.test',
  username: 'birdy',
  displayName: 'Bird Profile',
  firstName: 'Bird',
  lastName: 'User',
  initials: 'BU',
}

interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
}

let openHandlers: Array<(url: string) => void> = []
let openedUrls: string[] = []
let durableRecord: unknown = null
const captured: CapturedRequest[] = []
let refuseProfile = false

function installDesktopBridge(): void {
  ;(globalThis as Record<string, unknown>).sdkworkDesktop = {
    deepLinks: {
      getInitialUrl: async () => null,
      onOpenUrl: (handler: (url: string) => void) => {
        openHandlers.push(handler)
        return () => { openHandlers = openHandlers.filter(candidate => candidate !== handler) }
      },
    },
    shellOpen: { open: async (url: string) => { openedUrls.push(url) } },
    iamSession: {
      read: async () => durableRecord,
      save: async (session: unknown) => { durableRecord = session },
      clear: async () => { durableRecord = null },
    },
  }
}

function emitDeepLink(url: string): void {
  for (const handler of [...openHandlers]) handler(url)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** The app-api surface the real generated client reaches during this flow. */
function installNetwork(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = {}
    for (const [name, value] of new Headers(init?.headers).entries()) headers[name.toLowerCase()] = value
    captured.push({ url, method, headers })

    if (url.endsWith('/app/v3/api/oauth/desktop_sessions') && method === 'POST') {
      return jsonResponse({ code: 0, traceId: 'trace-redeem', data: SESSION })
    }
    if (url.endsWith('/app/v3/api/iam/users/current') && method === 'GET') {
      if (refuseProfile) {
        return jsonResponse({
          type: 'https://docs.sdkwork.com/problems/40103',
          title: 'Invalid token',
          status: 401,
          detail: 'invalid or expired IAM session',
          code: 40103,
          traceId: 'trace-401',
        }, 401)
      }
      return jsonResponse({ code: 0, traceId: 'trace-profile', data: PROFILE })
    }
    return jsonResponse({ detail: `unexpected request ${method} ${url}` }, 404)
  }))
}

function scopeOf(): SettingsScope<UiIamSettings> {
  return {
    getSnapshot: () => ({
      status: 'ready' as const,
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
  } as unknown as SettingsScope<UiIamSettings>
}

function envOf(): EnvService {
  return {
    isConfigured: () => true,
    apiBaseUrl: () => BASE_URL,
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

/** Drive one complete browser hand-off: begin, deep link, committed session. */
async function loginThroughDeepLink(): Promise<IamService> {
  const service = new IamService(scopeOf(), envOf(), layoutOf())
  await service.beginBrowserSignIn()
  const authorizeUrl = new URL(openedUrls[0]!)
  const state = authorizeUrl.searchParams.get('state')!
  expect(authorizeUrl.searchParams.get('code_challenge')).toBeTruthy()
  emitDeepLink(`${REDIRECT}?code=sdkwork-oauth_code-e2e&state=${state}`)
  await vi.waitFor(() => { expect(service.isSignedIn()).toBe(true) })
  return service
}

beforeEach(() => {
  openHandlers = []
  openedUrls = []
  durableRecord = null
  captured.length = 0
  refuseProfile = false
  resetSdkworkGlobalTokenManager()
  const storage = new Map<string, string>()
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value) },
    removeItem: (key) => { storage.delete(key) },
    clear: () => { storage.clear() },
    key: () => null,
    length: 0,
  } as Storage
  installDesktopBridge()
  installNetwork()
})

afterEach(() => {
  Reflect.deleteProperty(globalThis as Record<string, unknown>, 'sdkworkDesktop')
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('post-login SDK access', () => {
  it('commits the session every SDK client reads and sends the dual-token pair', async () => {
    const service = await loginThroughDeepLink()

    // 1. The shared manager is the one every SDKWork plugin binds, and it
    //    carries the complete session the login committed.
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({
      accessToken: SESSION.accessToken,
      authToken: SESSION.authToken,
      refreshToken: SESSION.refreshToken,
    })
    // 2. The durable host copy agrees, so a Host/CLI reader sees the login too.
    expect(durableRecord).toMatchObject({
      accessToken: SESSION.accessToken,
      authToken: SESSION.authToken,
      sessionId: SESSION.sessionId,
    })

    // 3. A plugin creating its own generated client from the shared manager —
    //    the shape every SDKWork surface uses — authenticates against app-api.
    const pluginClient = createClient({
      authMode: 'dual-token',
      baseUrl: BASE_URL,
      platform: 'pc',
      tokenManager: getSdkworkGlobalTokenManager(),
    })
    captured.length = 0
    await pluginClient.iam.users.current.retrieve()

    expect(captured).toHaveLength(1)
    const request = captured[0]!
    expect(request.url).toBe(`${BASE_URL}/app/v3/api/iam/users/current`)
    expect(request.method).toBe('GET')
    // app-api requires `Authorization: Bearer <authToken>` and accepts the
    // paired Access-Token; either alone is rejected.
    expect(request.headers.authorization).toBe(`Bearer ${SESSION.authToken}`)
    expect(request.headers['access-token']).toBe(SESSION.accessToken)

    // 4. The controller session the account surfaces read names the account,
    //    so the settings menu and account page render the same identity.
    expect(service.controller.getState().session?.user).toMatchObject({ displayName: 'Bird Profile' })
  })

  it('sends the same pair through the generated header builder every transport shares', async () => {
    await loginThroughDeepLink()
    const headers = buildAuthHeaders('dual-token', undefined, getSdkworkGlobalTokenManager())
    expect(headers.Authorization ?? headers.authorization).toBe(`Bearer ${SESSION.authToken}`)
    expect(headers['Access-Token'] ?? headers['access-token']).toBe(SESSION.accessToken)
  })

  it('does not report a login whose credentials the gateway refuses', async () => {
    const service = new IamService(scopeOf(), envOf(), layoutOf())
    await service.beginBrowserSignIn()
    const state = new URL(openedUrls[0]!).searchParams.get('state')
    refuseProfile = true
    emitDeepLink(`${REDIRECT}?code=sdkwork-oauth_code-refused&state=${state}`)

    await vi.waitFor(() => { expect(service.browserSignInFailed()).toBe(true) })
    expect(service.isSignedIn()).toBe(false)
    expect(service.browserSignInFailure()).toMatchObject({ code: 'session-rejected' })
    // The refused credentials reach no SDK client, and no durable record keeps
    // them for the next launch.
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({})
    expect(durableRecord).toBeNull()
  })
})
