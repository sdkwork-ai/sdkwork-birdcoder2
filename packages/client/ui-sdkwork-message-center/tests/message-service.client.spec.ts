/** Message-center service: page state, unread badge, acknowledge, polling, credentials. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MessageCenterService,
  type MessageCenterEnvLike,
  type MessageCenterIamLike,
  type MessageCenterSnapshot,
} from '../src/client/message-service.ts'
import type {
  MessageCenterCredentials,
  MessageCenterTransport,
} from '../src/client/message-transport.ts'

const BASE_URL = 'https://api.example'

/** One wire notification for a scripted page. */
function wire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'n-1',
    appId: 'sdkwork-birdcoder',
    title: 'Welcome',
    desc: 'Summary',
    content: 'Body',
    time: '2026-11-16T08:00:00.000Z',
    type: 'info',
    read: false,
    showAsPopup: false,
    popupSeen: false,
    archived: false,
    ...overrides,
  }
}

/** A scripted notification page. */
function page(items: readonly Record<string, unknown>[], hasMore = false): unknown {
  return { items, pageInfo: { hasMore } }
}

/** The shared environment profile stand-in. */
function fakeEnv(options: { configured?: boolean; accessToken?: string } = {}) {
  const listeners = new Set<() => void>()
  let configured = options.configured ?? true
  let baseUrl = BASE_URL
  let accessToken = options.accessToken ?? ''
  const env: MessageCenterEnvLike & {
    setConfigured(value: boolean): void
    setBaseUrl(value: string): void
    setAccessToken(value: string): void
    notify(): void
  } = {
    isConfigured: () => configured,
    apiBaseUrl: () => baseUrl,
    accessToken: () => accessToken,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setConfigured: (value) => { configured = value },
    setBaseUrl: (value) => { baseUrl = value },
    setAccessToken: (value) => { accessToken = value },
    notify: () => { for (const listener of listeners) listener() },
  }
  return env
}

/** The IAM service stand-in. */
function fakeIam(tokens: { accessToken?: string; authToken?: string } = { accessToken: 'iam-access', authToken: 'iam-auth' }) {
  const listeners = new Set<() => void>()
  let current: { accessToken?: string; authToken?: string } = tokens
  const iam: MessageCenterIamLike & {
    setTokens(next: { accessToken?: string; authToken?: string }): void
    requestSignInInPlace: ReturnType<typeof vi.fn<() => Promise<boolean>>>
  } = {
    sessionTokens: () => current,
    onAuthToken: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    requestSignInInPlace: vi.fn(async () => true),
    setTokens: (next) => {
      current = next
      for (const listener of listeners) listener()
    },
  }
  return iam
}

/** A transport factory that records its calls and reads the credential closure. */
function scriptedTransport() {
  const list = vi.fn((_pageNumber: number, _pageSize: number): Promise<unknown> => Promise.resolve(page([], false)))
  const acknowledge = vi.fn((_id: string): Promise<void> => Promise.resolve())
  const transport: MessageCenterTransport = { list, acknowledge }
  let credentials: (() => MessageCenterCredentials) | undefined
  const factory = vi.fn((baseUrl: string, read: () => MessageCenterCredentials) => {
    void baseUrl
    credentials = read
    return transport
  })
  return { list, acknowledge, factory, readCredentials: () => credentials?.() }
}

/** Build a service over the given stand-ins. */
function service(overrides: {
  env?: ReturnType<typeof fakeEnv>
  iam?: ReturnType<typeof fakeIam> | undefined
  transport?: ReturnType<typeof scriptedTransport>
  pollIntervalMs?: () => number
  pageSize?: () => number
} = {}) {
  const env = overrides.env ?? fakeEnv({ accessToken: 'env-access' })
  const iam = 'iam' in overrides ? overrides.iam : fakeIam()
  const transport = overrides.transport ?? scriptedTransport()
  const instance = new MessageCenterService({
    env,
    iam,
    pollIntervalMs: overrides.pollIntervalMs ?? (() => 60_000),
    pageSize: overrides.pageSize ?? (() => 20),
    transportFactory: transport.factory,
  })
  return { instance, env, iam, transport }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MessageCenterService read states', () => {
  it('loads the first page and counts unread notifications', async () => {
    const s = service()
    s.transport.list.mockResolvedValue(page([wire(), wire({ id: 'n-2', read: true })], true))
    expect(s.instance.snapshot()).toMatchObject({ status: 'loading', items: [] })
    await s.instance.refresh()
    expect(s.transport.factory).toHaveBeenCalledWith(BASE_URL, expect.any(Function))
    expect(s.transport.list).toHaveBeenCalledWith(1, 20)
    expect(s.instance.snapshot()).toMatchObject({ status: 'ready', unreadCount: 1, hasMore: true })
    expect(s.instance.snapshot().items.map(item => item.id)).toEqual(['n-1', 'n-2'])
  })

  it('reports the loading state before the first page arrives', async () => {
    const s = service()
    expect(s.instance.snapshot().status).toBe('loading')
    const seen: MessageCenterSnapshot[] = []
    s.instance.subscribe(() => { seen.push(s.instance.snapshot()) })
    s.transport.list.mockResolvedValue(page([wire()]))
    await s.instance.refresh()
    expect(seen.map(snapshot => snapshot.status)).toEqual(['ready'])
  })

  it('reports the missing configuration without a request', async () => {
    const s = service({ env: fakeEnv({ configured: false, accessToken: 'token' }) })
    await s.instance.refresh()
    expect(s.instance.snapshot()).toEqual({
      status: 'unconfigured', items: [], unreadCount: 0, hasMore: false, failure: null,
    })
    expect(s.transport.factory).not.toHaveBeenCalled()
  })

  it('reports sign-out without a request when no credential exists', async () => {
    const s = service({ env: fakeEnv({ accessToken: '   ' }), iam: undefined })
    await s.instance.refresh()
    expect(s.instance.snapshot()).toMatchObject({ status: 'signed-out', items: [] })
    expect(s.transport.factory).not.toHaveBeenCalled()
  })

  it('clears the badge when the gateway refuses the credential', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce(page([wire()]))
    await s.instance.refresh()
    expect(s.instance.snapshot().unreadCount).toBe(1)
    s.transport.list.mockRejectedValueOnce(Object.assign(new Error('refused'), { httpStatus: 401 }))
    await s.instance.refresh()
    expect(s.instance.snapshot()).toMatchObject({ status: 'signed-out', items: [], unreadCount: 0 })
  })

  it('reports an unreachable service while nothing is cached', async () => {
    const s = service()
    s.transport.list.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }))
    await s.instance.refresh()
    expect(s.instance.snapshot()).toMatchObject({ status: 'error', failure: 'unavailable', items: [] })
    s.transport.list.mockResolvedValueOnce(page([wire()]))
    await s.instance.refresh()
    expect(s.instance.snapshot()).toMatchObject({ status: 'ready', failure: null })
  })

  it('keeps cached items and reports the failure banner on a later failure', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce(page([wire()]))
    await s.instance.refresh()
    s.transport.list.mockRejectedValueOnce(new Error('boom'))
    await s.instance.refresh()
    expect(s.instance.snapshot()).toMatchObject({
      status: 'ready', failure: 'unknown', unreadCount: 1,
    })
    expect(s.instance.snapshot().items).toHaveLength(1)
  })

  it('rejects a payload that is not a notification page', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce([])
    await s.instance.refresh()
    expect(s.instance.snapshot()).toMatchObject({ status: 'error', failure: 'unknown' })
  })
})

describe('MessageCenterService paging', () => {
  it('appends the next page and stops at the last one', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce(page([wire()], true))
    await s.instance.refresh()
    s.transport.list.mockResolvedValueOnce(page([wire({ id: 'n-2' })], false))
    await s.instance.loadMore()
    expect(s.transport.list).toHaveBeenLastCalledWith(2, 20)
    expect(s.instance.snapshot().items.map(item => item.id)).toEqual(['n-1', 'n-2'])
    expect(s.instance.snapshot().hasMore).toBe(false)
    await s.instance.loadMore()
    expect(s.transport.list).toHaveBeenCalledTimes(2)
  })

  it('does not page while the first page is still loading', async () => {
    const s = service()
    const pending = s.instance.loadMore()
    await pending
    expect(s.transport.list).not.toHaveBeenCalled()
  })
})

describe('MessageCenterService acknowledge', () => {
  it('marks one notification read optimistically and writes it', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce(page([wire(), wire({ id: 'n-2' })]))
    await s.instance.refresh()
    await s.instance.acknowledge('n-1')
    expect(s.instance.snapshot()).toMatchObject({ unreadCount: 1 })
    expect(s.instance.snapshot().items[0]).toMatchObject({ read: true })
    expect(s.transport.acknowledge).toHaveBeenCalledWith('n-1')
  })

  it('ignores an already-read or unknown notification', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce(page([wire({ read: true })]))
    await s.instance.refresh()
    await s.instance.acknowledge('n-1')
    await s.instance.acknowledge('missing')
    expect(s.transport.acknowledge).not.toHaveBeenCalled()
  })

  it('keeps the optimistic read but reports a failed write', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce(page([wire()]))
    await s.instance.refresh()
    s.transport.acknowledge.mockRejectedValueOnce(new Error('write failed'))
    await s.instance.acknowledge('n-1')
    expect(s.instance.snapshot()).toMatchObject({ status: 'ready', failure: 'unknown' })
    expect(s.instance.snapshot().items[0]).toMatchObject({ read: true })
  })

  it('falls back to the signed-out state when the write is refused', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce(page([wire()]))
    await s.instance.refresh()
    s.transport.acknowledge.mockRejectedValueOnce(Object.assign(new Error('refused'), { httpStatus: 403 }))
    await s.instance.acknowledge('n-1')
    expect(s.instance.snapshot()).toMatchObject({ status: 'signed-out', items: [] })
  })
})

describe('MessageCenterService credentials and transport', () => {
  it('prefers the IAM credential triple over the static access token', async () => {
    const s = service({ env: fakeEnv({ accessToken: 'static' }), iam: fakeIam() })
    s.transport.list.mockResolvedValue(page([wire()]))
    await s.instance.refresh()
    expect(s.transport.readCredentials()).toEqual({ accessToken: 'iam-access', authToken: 'iam-auth' })
  })

  it('falls back to the static token when the session carries only a blank access token', async () => {
    const s = service({ env: fakeEnv({ accessToken: 'static' }), iam: fakeIam({ accessToken: '   ', authToken: '' }) })
    s.transport.list.mockResolvedValue(page([wire()]))
    await s.instance.refresh()
    expect(s.transport.readCredentials()).toEqual({ accessToken: 'static' })
  })

  it('accepts an auth-token-only session', async () => {
    const s = service({ env: fakeEnv({ accessToken: '' }), iam: fakeIam({ authToken: 'auth-only' }) })
    s.transport.list.mockResolvedValue(page([wire()]))
    await s.instance.refresh()
    expect(s.transport.readCredentials()).toEqual({ authToken: 'auth-only' })
  })

  it('rebuilds the transport when the gateway origin moves', async () => {
    const s = service()
    s.transport.list.mockResolvedValue(page([wire()]))
    await s.instance.refresh()
    s.env.setBaseUrl('https://api-2.example')
    await s.instance.refresh()
    expect(s.transport.factory).toHaveBeenCalledTimes(2)
    expect(s.transport.factory).toHaveBeenLastCalledWith('https://api-2.example', expect.any(Function))
  })
})

describe('MessageCenterService polling and lifetime', () => {
  it('polls at the configured interval and re-reads on a credential write', async () => {
    vi.useFakeTimers()
    const s = service({ pollIntervalMs: () => 30_000 })
    s.transport.list.mockResolvedValue(page([wire()]))
    const stop = s.instance.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.transport.list).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(s.transport.list).toHaveBeenCalledTimes(2)
    s.iam?.setTokens({ accessToken: 'rotated' })
    await vi.advanceTimersByTimeAsync(0)
    expect(s.transport.list).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(s.transport.list).toHaveBeenCalledTimes(3)
  })

  it('re-reads when the environment profile changes', async () => {
    vi.useFakeTimers()
    const s = service()
    s.transport.list.mockResolvedValue(page([wire()]))
    const stop = s.instance.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.transport.list).toHaveBeenCalledTimes(1)
    s.env.setAccessToken('refreshed')
    s.env.notify()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.transport.list).toHaveBeenCalledTimes(2)
    stop()
  })

  it('starts once and disposes its listeners', async () => {
    const s = service()
    s.transport.list.mockResolvedValue(page([wire()]))
    const stop = s.instance.start()
    const duplicateStop = s.instance.start()
    duplicateStop()
    await vi.waitFor(() => { expect(s.transport.list).toHaveBeenCalledTimes(1) })
    s.instance.dispose()
    stop()
    await s.instance.refresh()
    expect(s.transport.list).toHaveBeenCalledTimes(1)
  })

  it('keeps one read in flight for concurrent refreshes', async () => {
    const s = service()
    let resolve!: (value: unknown) => void
    s.transport.list.mockImplementationOnce(() => new Promise((settle) => { resolve = settle }))
    const first = s.instance.refresh()
    const second = s.instance.refresh()
    expect(second).toBe(first)
    resolve(page([wire()]))
    await first
    expect(s.transport.list).toHaveBeenCalledOnce()
    expect(s.instance.snapshot().status).toBe('ready')
  })

  it('ignores a credential write delivered after disposal', async () => {
    const s = service()
    s.transport.list.mockResolvedValue(page([wire()]))
    const stop = s.instance.start()
    await vi.waitFor(() => { expect(s.transport.list).toHaveBeenCalledTimes(1) })
    s.instance.dispose()
    s.env.notify()
    await Promise.resolve()
    expect(s.transport.list).toHaveBeenCalledTimes(1)
    stop()
  })

  it('ignores paging and acknowledgement after disposal', async () => {
    const s = service()
    s.instance.dispose()
    await s.instance.loadMore()
    await s.instance.acknowledge('n-1')
    expect(s.transport.list).not.toHaveBeenCalled()
    expect(s.transport.acknowledge).not.toHaveBeenCalled()
  })

  it('contains a throwing snapshot listener', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = service()
    s.instance.subscribe(() => { throw new Error('listener failed') })
    s.transport.list.mockResolvedValue(page([wire()]))
    await s.instance.refresh()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('snapshot listener failed'), expect.any(Error))
  })

  it('stops notifying a disposed service', async () => {
    const s = service()
    const listener = vi.fn()
    s.instance.subscribe(listener)
    s.instance.dispose()
    s.transport.list.mockResolvedValue(page([wire()]))
    await s.instance.refresh()
    expect(listener).not.toHaveBeenCalled()
  })

  it('drops a read that settles after disposal', async () => {
    const s = service()
    let reject!: (error: unknown) => void
    s.transport.list.mockImplementationOnce(() => new Promise((_resolve, rejectRead) => { reject = rejectRead }))
    const pending = s.instance.refresh()
    s.instance.dispose()
    reject(new Error('late failure'))
    await pending
    expect(s.instance.snapshot().status).toBe('loading')
  })

  it('drops a write that settles after disposal', async () => {
    const s = service()
    s.transport.list.mockResolvedValueOnce(page([wire()]))
    await s.instance.refresh()
    let reject!: (error: unknown) => void
    s.transport.acknowledge.mockImplementationOnce(() => new Promise((_resolve, rejectWrite) => { reject = rejectWrite }))
    const pending = s.instance.acknowledge('n-1')
    s.instance.dispose()
    reject(new Error('late failure'))
    await pending
    expect(s.instance.snapshot().items[0]).toMatchObject({ read: true })
  })
})

describe('MessageCenterService sign-in', () => {
  it('re-reads after a completed sign-in', async () => {
    const iam = fakeIam({ accessToken: '' })
    iam.requestSignInInPlace.mockImplementation(async () => {
      iam.setTokens({ accessToken: 'after-login', authToken: 'after-login-auth' })
      return true
    })
    const s = service({ env: fakeEnv({ accessToken: '' }), iam })
    s.transport.list.mockResolvedValue(page([wire()]))
    await s.instance.signIn()
    expect(iam.requestSignInInPlace).toHaveBeenCalledOnce()
    expect(s.transport.list).toHaveBeenCalledOnce()
  })

  it('does not re-read when the sign-in surface is dismissed', async () => {
    const iam = fakeIam({ accessToken: '' })
    iam.requestSignInInPlace.mockResolvedValue(false)
    const s = service({ env: fakeEnv({ accessToken: '' }), iam })
    await s.instance.signIn()
    expect(s.transport.list).not.toHaveBeenCalled()
  })

  it('does nothing without a sign-in surface', async () => {
    const s = service({ iam: undefined })
    await s.instance.signIn()
    expect(s.transport.list).not.toHaveBeenCalled()
  })

  it('does not re-read when the sign-in surface answers after disposal', async () => {
    const iam = fakeIam({ accessToken: '' })
    let settle!: (signedIn: boolean) => void
    iam.requestSignInInPlace.mockImplementation(() => new Promise<boolean>((resolve) => { settle = resolve }))
    const s = service({ env: fakeEnv({ accessToken: '' }), iam })
    const pending = s.instance.signIn()
    s.instance.dispose()
    settle(true)
    await pending
    expect(s.transport.list).not.toHaveBeenCalled()
  })
})
