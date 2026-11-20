/**
 * Transport-level contract of the signed flow's real SDK adapter: the login,
 * application-list, and exchange requests reach the documented routes with the
 * right credential headers and body, and the SDK envelope is unwrapped.
 *
 * The response bodies mirror the SDKWork v3 envelope (`{ code: 0, data: … }`);
 * `fetch` is stubbed so no network or gateway is involved.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSdkworkIamAccessPort } from '../src/client/sdkworkIamPort.ts'
import type { SdkworkSession } from '../src/client/signedToken.ts'

/** One captured request. */
interface Captured {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

/** A session fixture for the list/exchange calls. */
function session(): SdkworkSession {
  return {
    baseUrl: 'https://api.test',
    accessToken: 'session-access',
    authToken: 'session-auth',
    userId: '42',
    username: 'alice',
    tenantId: '100001',
    source: 'password',
  }
}

/** Encode one UTF-8 JSON value as an unpadded base64url segment. */
function encodeSegment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

/** Stub fetch with one handler and capture each request. */
function stubFetch(handler: (request: Captured) => { status?: number; body: unknown }): Captured[] {
  const requests: Captured[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const request: Captured = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: Object.fromEntries(headers.entries()),
      body: typeof init?.body === 'string' ? init.body : '',
    }
    requests.push(request)
    const answer = handler(request)
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }))
  return requests
}

afterEach(() => { vi.unstubAllGlobals() })

describe('sdkwork IAM access port', () => {
  it('posts the password grant with the bootstrap Access-Token only', async () => {
    const requests = stubFetch(() => ({
      body: {
        code: 0,
        data: {
          item: {
            accessToken: 'signed-access',
            authToken: 'signed-auth',
            refreshToken: 'signed-refresh',
            user: { id: '42', username: 'alice' },
            context: { tenantId: '100001', organizationId: '0' },
          },
        },
      },
    }))
    const result = await createSdkworkIamAccessPort().login({
      baseUrl: 'https://api.test',
      bootstrapAccessToken: 'bootstrap-token',
      username: 'alice',
      password: 'secret',
    })
    expect(result).toMatchObject({
      baseUrl: 'https://api.test',
      accessToken: 'signed-access',
      authToken: 'signed-auth',
      refreshToken: 'signed-refresh',
      userId: '42',
      username: 'alice',
      tenantId: '100001',
      source: 'password',
    })
    expect(requests).toHaveLength(1)
    const request = requests[0]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toMatch(/\/auth\/sessions$/u)
    expect(request.headers['access-token']).toBe('bootstrap-token')
    expect(request.headers.authorization).toBeUndefined()
    expect(JSON.parse(request.body)).toMatchObject({ username: 'alice', password: 'secret' })
  })

  it('lists the deploy applications with both session credentials', async () => {
    const requests = stubFetch(() => ({
      body: {
        code: 0,
        data: {
          items: [
            {
              id: 'uuid',
              deployApplicationId: '381157858269466624',
              name: 'Alice App',
              slug: 'alice-app',
              ownerType: 'USER',
              ownershipScope: 'USER',
              ownerUserId: '42',
              organizationId: '0',
              createdBy: '42',
              appStatus: 'ACTIVE',
            },
          ],
          pageInfo: {},
        },
      },
    }))
    const applications = await createSdkworkIamAccessPort().listApplications(session())
    expect(applications).toEqual([{
      anchor: '381157858269466624',
      id: 'uuid',
      name: 'Alice App',
      slug: 'alice-app',
      ownershipScope: 'USER',
      ownerUserId: '42',
      organizationId: '0',
      createdBy: '42',
      status: 'ACTIVE',
    }])
    const request = requests[0]
    expect(request.method).toBe('GET')
    expect(new URL(request.url).pathname).toMatch(/\/apps$/u)
    expect(new URL(request.url).searchParams.get('page_size')).toBe('200')
    expect(request.headers['access-token']).toBe('session-access')
    expect(request.headers.authorization).toBe('Bearer session-auth')
  })

  it('exchanges the selected anchor for the signed credential pair', async () => {
    const now = Math.floor(Date.now() / 1000)
    const claims = encodeSegment({
      app_id: '381157858269466624',
      aud: '381157858269466624',
      tenant_id: '100001',
      user_id: '42',
      ownership_scope: 'USER',
      exp: now + 3600,
    })
    const accessToken = `${encodeSegment({ alg: 'RS256' })}.${claims}.c2lnbmF0dXJl`
    const requests = stubFetch(() => ({
      status: 201,
      body: {
        code: 0,
        data: {
          item: {
            accessToken,
            authToken: 'signed-auth',
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            appId: '381157858269466624',
            tenantApplicationId: 'tapp_1',
            organizationId: '0',
            ownershipScope: 'USER',
            environment: 'development',
            sessionId: 'session_1',
          },
        },
      },
    }))
    const credential = await createSdkworkIamAccessPort().exchange(session(), {
      appId: '381157858269466624',
      environment: 'development',
    })
    expect(credential).toMatchObject({
      accessToken,
      authToken: 'signed-auth',
      appId: '381157858269466624',
      ownershipScope: 'USER',
      environment: 'development',
      claims: { app_id: '381157858269466624', user_id: '42' },
    })
    const request = requests[0]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toMatch(/\/iam\/app_access_tokens$/u)
    expect(JSON.parse(request.body)).toEqual({
      appId: '381157858269466624',
      environment: 'development',
    })
    expect(request.headers['access-token']).toBe('session-access')
    expect(request.headers.authorization).toBe('Bearer session-auth')
  })

  it('refuses a login answer without a complete credential pair', async () => {
    stubFetch(() => ({ body: { code: 0, data: { item: { accessToken: 'only' } } } }))
    await expect(createSdkworkIamAccessPort().login({
      baseUrl: 'https://api.test',
      bootstrapAccessToken: 'bootstrap-token',
      username: 'alice',
      password: 'secret',
    })).rejects.toThrow(/complete session credential pair/u)
  })
})
