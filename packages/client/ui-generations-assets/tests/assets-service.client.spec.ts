import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@sdkwork/agents-app-sdk'
import { createTokenManager } from '@sdkwork/sdk-common'
import { AssetsService, type AssetsIamService } from '../src/client/assets-service.ts'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'

vi.mock('@sdkwork/agents-app-sdk', () => ({
  createClient: vi.fn(),
}))
vi.mock('@sdkwork/sdk-common', () => ({
  createTokenManager: vi.fn(),
}))

interface Profile {
  apiBaseUrl: string
  accessToken: string
}

function envOf(profile: Partial<Profile> = {}): { env: EnvService; setProfile: (next: Partial<Profile>) => void } {
  let current: Profile = { apiBaseUrl: 'https://api.sdkwork.com', accessToken: '', ...profile }
  const listeners = new Set<() => void>()
  return {
    env: {
      isConfigured: () => current.apiBaseUrl.trim() !== '',
      apiBaseUrl: () => current.apiBaseUrl,
      accessToken: () => current.accessToken,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    } as unknown as EnvService,
    setProfile: (next) => {
      current = { ...current, ...next }
      for (const listener of listeners) listener()
    },
  }
}

function iamOf(initial: { accessToken?: string; authToken?: string; refreshToken?: string } | null): {
  iam: AssetsIamService
  setSession: (session: { accessToken?: string; authToken?: string; refreshToken?: string } | null) => void
} {
  let session = initial
  const listeners = new Set<() => void>()
  return {
    iam: {
      controller: {
        getState: () => ({ session }),
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
    },
    setSession: (next) => {
      session = next
      for (const listener of listeners) listener()
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const tokenManager = {
  setAccessToken: vi.fn(),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}
const list = vi.fn()

function clientOf() {
  return { ai: { agents: { assets: { list } } } }
}

beforeEach(() => {
  vi.mocked(createTokenManager).mockReturnValue(tokenManager)
  vi.mocked(createClient).mockReset()
  vi.mocked(createClient).mockReturnValue(clientOf() as never)
  list.mockReset()
  tokenManager.setAccessToken.mockClear()
  tokenManager.setTokens.mockClear()
  tokenManager.clearTokens.mockClear()
})

const configured = (): EnvService => envOf().env

/** One complete generated-assets record. */
function asset(overrides: Record<string, unknown> = {}) {
  return {
    toolId: 'image.generations.create',
    toolCallId: 'call-1',
    mediaKind: 'image',
    driveSpaceId: 's1',
    driveNodeId: 'n1',
    driveUri: 'drive://spaces/s1/nodes/n1',
    sourceUrl: 'https://assets.sdkwork.com/a.png',
    createdAt: '2026-08-18T01:00:00Z',
    ...overrides,
  }
}

describe('AssetsService', () => {
  it('starts unconfigured without an environment and publishes the same snapshot', async () => {
    const env = envOf({ apiBaseUrl: '' }).env
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', items: [] })
    const listener = vi.fn()
    const off = service.subscribe(listener)
    await service.load()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', items: [] })
    expect(createClient).not.toHaveBeenCalled()
    off()
  })

  it('starts idle with a configured environment and mirrors tokens from the env', () => {
    const env = envOf({ accessToken: 'env-token' }).env
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    expect(service.getSnapshot()).toEqual({ status: 'idle', items: [] })
    const dispose = service.start()
    expect(tokenManager.clearTokens).toHaveBeenCalled()
    expect(tokenManager.setAccessToken).toHaveBeenCalledWith('env-token')
    dispose()
  })

  it('adopts IAM session tokens when the environment token is empty', () => {
    const env = configured()
    const iam = iamOf({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    const service = new AssetsService(env, iam.iam)
    const dispose = service.start()
    expect(tokenManager.setTokens).toHaveBeenCalledWith({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    dispose()
  })

  it('spreads only the present session token fields', () => {
    const env = configured()
    const iam = iamOf({ authToken: 'auth-only' })
    const service = new AssetsService(env, iam.iam)
    const dispose = service.start()
    expect(tokenManager.setTokens).toHaveBeenCalledWith({ authToken: 'auth-only' })
    dispose()
  })

  it('clears tokens and publishes idle when the IAM session signs out', () => {
    const env = configured()
    const iam = iamOf({ accessToken: 'at' })
    const service = new AssetsService(env, iam.iam)
    const dispose = service.start()
    iam.setSession(null)
    expect(tokenManager.clearTokens).toHaveBeenCalledTimes(2)
    expect(service.getSnapshot()).toEqual({ status: 'idle', items: [] })
    dispose()
  })

  it('ignores IAM changes while a static environment token is set', () => {
    const env = envOf({ accessToken: 'env-token' }).env
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    const dispose = service.start()
    iam.setSession({ accessToken: 'at' })
    expect(listener).not.toHaveBeenCalled()
    dispose()
  })

  it('loads the generated-assets list through the agents assets channel', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    const dispose = service.start()
    list.mockResolvedValue([asset(), asset({ toolCallId: 'call-2', mediaKind: 'video', driveNodeId: 'n2', driveUri: 'drive://spaces/s1/nodes/n2', sourceUrl: 'https://assets.sdkwork.com/b.mp4' })])
    await service.load()
    expect(list).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot()).toEqual({
      status: 'ready',
      items: [
        {
          toolId: 'image.generations.create', toolCallId: 'call-1', mediaKind: 'image',
          driveUri: 'drive://spaces/s1/nodes/n1', sourceUrl: 'https://assets.sdkwork.com/a.png', createdAt: '2026-08-18T01:00:00Z',
        },
        {
          toolId: 'image.generations.create', toolCallId: 'call-2', mediaKind: 'video',
          driveUri: 'drive://spaces/s1/nodes/n2', sourceUrl: 'https://assets.sdkwork.com/b.mp4', createdAt: '2026-08-18T01:00:00Z',
        },
      ],
    })
    dispose()
  })

  it('narrows malformed asset records to the fields it can present', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    list.mockResolvedValue([
      asset(),
      asset({ toolCallId: 42 }),
      asset({ mediaKind: null }),
      asset({ driveUri: '' }),
      null,
      'junk',
      asset({ sourceUrl: '' }),
      asset({ createdAt: '' }),
    ])
    await service.load()
    expect(service.getSnapshot()).toEqual({
      status: 'ready',
      items: [
        {
          toolId: 'image.generations.create', toolCallId: 'call-1', mediaKind: 'image',
          driveUri: 'drive://spaces/s1/nodes/n1', sourceUrl: 'https://assets.sdkwork.com/a.png', createdAt: '2026-08-18T01:00:00Z',
        },
        { toolId: 'image.generations.create', toolCallId: 'call-1', mediaKind: 'image', driveUri: '', sourceUrl: 'https://assets.sdkwork.com/a.png', createdAt: '2026-08-18T01:00:00Z' },
        { toolId: 'image.generations.create', toolCallId: 'call-1', mediaKind: 'image', driveUri: 'drive://spaces/s1/nodes/n1', createdAt: '2026-08-18T01:00:00Z' },
        { toolId: 'image.generations.create', toolCallId: 'call-1', mediaKind: 'image', driveUri: 'drive://spaces/s1/nodes/n1', sourceUrl: 'https://assets.sdkwork.com/a.png' },
      ],
    })
  })

  it('publishes an empty list when the assets channel returns a non-array', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    list.mockResolvedValue({ items: [] })
    await service.load()
    expect(service.getSnapshot()).toEqual({ status: 'ready', items: [] })
  })

  it('publishes the error state when the assets call fails', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    list.mockRejectedValue(new Error('boom'))
    await service.load()
    expect(service.getSnapshot()).toEqual({ status: 'error', items: [] })
  })

  it('publishes the error state when no base URL is configured at request time', async () => {
    const env = {
      isConfigured: () => true,
      apiBaseUrl: () => '',
      accessToken: () => '',
      subscribe: () => () => {},
    } as unknown as EnvService
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    await service.load()
    expect(service.getSnapshot()).toEqual({ status: 'error', items: [] })
  })

  it('discards responses that arrive after an environment change', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    service.start()
    const pending = deferred<unknown[]>()
    list.mockReturnValue(pending.promise)
    const flight = service.load()
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    pending.resolve([asset()])
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'idle', items: [] })
  })

  it('discards errors that arrive after an environment change', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    service.start()
    const pending = deferred<unknown[]>()
    list.mockReturnValue(pending.promise)
    const flight = service.load()
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    pending.reject(new Error('boom'))
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'idle', items: [] })
  })

  it('publishes the unconfigured state when the environment is removed', () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    service.start()
    setProfile({ apiBaseUrl: '' })
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', items: [] })
    expect(listener).toHaveBeenCalled()
  })

  it('publishes the unconfigured state when IAM changes without an environment', () => {
    const env = envOf({ apiBaseUrl: '' }).env
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    service.start()
    iam.setSession({ accessToken: 'at' })
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', items: [] })
    expect(listener).toHaveBeenCalled()
  })

  it('recreates the client when the environment base URL changes', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    service.start()
    list.mockResolvedValue([])
    await service.load()
    expect(createClient).toHaveBeenCalledTimes(1)
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    await service.load()
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient).toHaveBeenLastCalledWith({
      baseUrl: 'https://other.sdkwork.com',
      tokenManager,
    })
  })

  it('reuses the client for the same base URL', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    service.start()
    list.mockResolvedValue([])
    await service.load()
    await service.load()
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith({
      baseUrl: 'https://api.sdkwork.com',
      tokenManager,
    })
  })

  it('publishes idle when an unconfigured environment becomes configured', () => {
    const { env, setProfile } = envOf({ apiBaseUrl: '' })
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    service.start()
    setProfile({ apiBaseUrl: 'https://api.sdkwork.com' })
    expect(service.getSnapshot()).toEqual({ status: 'idle', items: [] })
    expect(listener).toHaveBeenCalled()
  })

  it('stops republishing after disposal', () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new AssetsService(env, iam.iam)
    const dispose = service.start()
    dispose()
    const listener = vi.fn()
    service.subscribe(listener)
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    iam.setSession({ accessToken: 'at' })
    expect(listener).not.toHaveBeenCalled()
  })
})
