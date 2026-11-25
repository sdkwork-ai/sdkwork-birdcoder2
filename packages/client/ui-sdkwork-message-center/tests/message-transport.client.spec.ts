/** SDKWork notification transport: request shape, credential headers, failure classification. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyMessageFailure,
  createMessageCenterTransport,
  type MessageCenterCredentials,
} from '../src/client/message-transport.ts'

const BASE_URL = 'https://api.example'

/** One JSON response. */
function json(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } })
}

/** A successful list envelope. */
function listEnvelope(hasMore = false): unknown {
  return {
    code: 0,
    traceId: 'trace',
    data: { items: [{ id: 'n-1' }], pageInfo: { page: 1, hasMore } },
  }
}

/** Install a fetch stub returning the queued responses. */
function stubFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn(async (..._args: unknown[]) => {
    const next = responses.shift()
    if (next === undefined) throw new Error('unexpected request')
    if (next instanceof Error) throw next
    return next
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Capture the request a stub saw. */
function requestOf(fetchMock: ReturnType<typeof stubFetch>, index = 0): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index]
  if (call === undefined) throw new Error('missing fetch call')
  return { url: String(call[0]), init: call[1] as RequestInit }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createMessageCenterTransport', () => {
  it('lists notifications without a client-supplied app id and with dual-token headers', async () => {
    const fetchMock = stubFetch(json(listEnvelope(true)))
    let credentials: MessageCenterCredentials = { accessToken: 'access-1', authToken: 'auth-1' }
    const transport = createMessageCenterTransport({ baseUrl: BASE_URL, credentials: () => credentials })
    const payload = await transport.list(2, 5)

    const { url, init } = requestOf(fetchMock)
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(`${BASE_URL}/app/v3/api/notification/notifications`)
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ page: '2', page_size: '5' })
    expect(init.method).toBe('GET')
    expect(init.headers).toMatchObject({ 'Access-Token': 'access-1', Authorization: 'Bearer auth-1' })
    expect(payload).toEqual({ items: [{ id: 'n-1' }], pageInfo: { page: 1, hasMore: true } })

    credentials = { accessToken: 'access-2' }
    const rotatedFetch = stubFetch(json(listEnvelope()))
    await transport.list(1, 20)
    const next = rotatedFetch.mock.calls.at(-1)
    expect(next?.[1]).toMatchObject({ headers: { 'Access-Token': 'access-2' } })
    expect((next?.[1] as RequestInit).headers).not.toHaveProperty('Authorization')
  })

  it('joins a gateway origin that already names the app-api prefix', async () => {
    const fetchMock = stubFetch(json(listEnvelope()))
    const transport = createMessageCenterTransport({
      baseUrl: 'https://api.example/app/v3/api',
      credentials: () => ({ accessToken: 'access' }),
    })
    await transport.list(1, 20)
    expect(requestOf(fetchMock).url.startsWith('https://api.example/app/v3/api/notification/notifications')).toBe(true)
  })

  it('acknowledges one notification through its encoded path', async () => {
    const fetchMock = stubFetch(json({ code: 0, traceId: 'trace', data: { updated: true, state: 'acknowledged' } }))
    const transport = createMessageCenterTransport({ baseUrl: BASE_URL, credentials: () => ({ authToken: 'auth' }) })
    await transport.acknowledge('notification-1')
    const { url, init } = requestOf(fetchMock)
    expect(new URL(url).pathname).toBe('/app/v3/api/notification/notifications/notification-1/acknowledge')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer auth' })
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'unknown'],
  ] as const)('surfaces an HTTP %d as %s', async (status, expected) => {
    stubFetch(json({ code: status === 401 ? 40101 : 5000, traceId: 'trace', detail: 'refused' }, status, 'application/problem+json'))
    const transport = createMessageCenterTransport({ baseUrl: BASE_URL, credentials: () => ({ accessToken: 'a' }) })
    const error = await transport.list(1, 20).then(() => undefined, (cause: unknown) => cause)
    expect(classifyMessageFailure(error)).toBe(expected)
  })

  it('throws for a refused business envelope', async () => {
    stubFetch(json({ code: 4001, traceId: 'trace', message: 'validation failed' }))
    const transport = createMessageCenterTransport({ baseUrl: BASE_URL, credentials: () => ({ accessToken: 'a' }) })
    const error = await transport.list(1, 20).then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(Error)
    expect(classifyMessageFailure(error)).toBe('unknown')
  })

  it('does not retry a failed request', async () => {
    const fetchMock = stubFetch(json({ code: 5000, traceId: 'trace' }, 500))
    const transport = createMessageCenterTransport({ baseUrl: BASE_URL, credentials: () => ({ accessToken: 'a' }) })
    await expect(transport.list(1, 20)).rejects.toBeInstanceOf(Error)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('classifyMessageFailure', () => {
  it.each([
    [{ httpStatus: 401 }, 'unauthorized'],
    [{ httpStatus: 401, problem: { code: 40301 } }, 'unauthorized'],
    [{ httpStatus: 403 }, 'unauthorized'],
    [{ httpStatus: 403, problem: { code: 40302 } }, 'unauthorized'],
    [{ httpStatus: 403, problem: { code: 40301 } }, 'unavailable'],
    [{ httpStatus: 403, problem: 'not-a-problem' }, 'unauthorized'],
    [{ httpStatus: 502 }, 'unavailable'],
    [{ code: 'NETWORK_ERROR' }, 'unavailable'],
    [{ code: 'TIMEOUT' }, 'unavailable'],
    [{ code: 'SERVICE_UNAVAILABLE' }, 'unavailable'],
    [{ code: 'UNKNOWN' }, 'unknown'],
    [{ httpStatus: 400 }, 'unknown'],
    [new TypeError('fetch failed'), 'unavailable'],
    [new Error('boom'), 'unknown'],
    ['text', 'unknown'],
    [null, 'unknown'],
    [{ httpStatus: '401' }, 'unknown'],
    [{ code: 401 }, 'unknown'],
  ] as const)('classifies %j as %s', (error, expected) => {
    expect(classifyMessageFailure(error)).toBe(expected)
  })
})
