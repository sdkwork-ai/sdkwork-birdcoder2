import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@sdkwork/agents-app-sdk'
import { createTokenManager } from '@sdkwork/sdk-common'
import { VideoGenerationsService, type GenerationIamService } from '../src/client/generations-service.ts'
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
  let current: Profile = { apiBaseUrl: 'https://api.birdcoder.com', accessToken: '', ...profile }
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
  iam: GenerationIamService
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
const invoke = vi.fn()

function clientOf() {
  return { ai: { agents: { tools: { invoke } } } }
}

/** One poll-interval advance; also flushes the microtasks scheduling the next poll. */
async function advancePoll(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1500)
}

/** A `video.create` invocation response. */
function created(taskId: string) {
  return { toolCallId: 'create', status: 'succeeded', output: { taskId } }
}

/** A `video.retrieve` invocation response. */
function retrieved(status: string, url?: string) {
  return {
    toolCallId: 'retrieve',
    status: 'succeeded',
    output: { taskId: 'task-1', status, ...(url === undefined ? {} : { url }) },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(createTokenManager).mockReturnValue(tokenManager)
  vi.mocked(createClient).mockReset()
  vi.mocked(createClient).mockReturnValue(clientOf() as never)
  invoke.mockReset()
  tokenManager.setAccessToken.mockClear()
  tokenManager.setTokens.mockClear()
  tokenManager.clearTokens.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

const configured = (): EnvService => envOf().env

describe('VideoGenerationsService', () => {
  it('starts unconfigured without an environment and publishes the same snapshot', async () => {
    const env = envOf({ apiBaseUrl: '' }).env
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', prompt: '', results: [] })
    const listener = vi.fn()
    const off = service.subscribe(listener)
    await service.generate('a robot')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', prompt: '', results: [] })
    expect(createClient).not.toHaveBeenCalled()
    off()
  })

  it('starts idle with a configured environment and mirrors tokens from the env', () => {
    const env = envOf({ accessToken: 'env-token' }).env
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
    const dispose = service.start()
    expect(tokenManager.clearTokens).toHaveBeenCalled()
    expect(tokenManager.setAccessToken).toHaveBeenCalledWith('env-token')
    dispose()
  })

  it('adopts IAM session tokens when the environment token is empty', () => {
    const env = configured()
    const iam = iamOf({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    const service = new VideoGenerationsService(env, iam.iam)
    const dispose = service.start()
    expect(tokenManager.setTokens).toHaveBeenCalledWith({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    dispose()
  })

  it('spreads only the present session token fields', () => {
    const env = configured()
    const iam = iamOf({ authToken: 'auth-only' })
    const service = new VideoGenerationsService(env, iam.iam)
    const dispose = service.start()
    expect(tokenManager.setTokens).toHaveBeenCalledWith({ authToken: 'auth-only' })
    dispose()
  })

  it('clears tokens and publishes idle when the IAM session signs out', () => {
    const env = configured()
    const iam = iamOf({ accessToken: 'at' })
    const service = new VideoGenerationsService(env, iam.iam)
    const dispose = service.start()
    iam.setSession(null)
    expect(tokenManager.clearTokens).toHaveBeenCalledTimes(2)
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
    dispose()
  })

  it('ignores IAM changes while a static environment token is set', () => {
    const env = envOf({ accessToken: 'env-token' }).env
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    const dispose = service.start()
    iam.setSession({ accessToken: 'at' })
    expect(listener).not.toHaveBeenCalled()
    dispose()
  })

  it('generates one video through the agents media-tool channel and polls until completed', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    const dispose = service.start()
    invoke
      .mockResolvedValueOnce(created('task-1'))
      .mockResolvedValueOnce(retrieved('processing'))
      .mockResolvedValueOnce(retrieved('completed', 'https://assets.sdkwork.com/robot.mp4'))
    const flight = service.generate('  a robot dancing  ')
    await advancePoll()
    await advancePoll()
    await flight
    expect(invoke).toHaveBeenNthCalledWith(1, 'video.create', {
      arguments: { prompt: 'a robot dancing', model: 'default', seconds: 5, size: '1280x720' },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'video.retrieve', { arguments: { videoId: 'task-1' } })
    expect(service.getSnapshot()).toEqual({
      status: 'ready',
      prompt: 'a robot dancing',
      results: [{ url: 'https://assets.sdkwork.com/robot.mp4' }],
    })
    dispose()
  })

  it('keeps polling when a completed poll carries no URL', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    invoke
      .mockResolvedValueOnce(created('task-1'))
      .mockResolvedValueOnce(retrieved('completed'))
      .mockResolvedValueOnce(retrieved('completed', 'https://assets.sdkwork.com/robot.mp4'))
    const flight = service.generate('a robot')
    await advancePoll()
    await advancePoll()
    await flight
    expect(service.getSnapshot().status).toBe('ready')
  })

  it('reports the error state when the task fails', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    invoke
      .mockResolvedValueOnce(created('task-1'))
      .mockResolvedValueOnce(retrieved('failed'))
    const flight = service.generate('a robot')
    await advancePoll()
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'error', prompt: 'a robot', results: [] })
  })

  it('reports the error state when the create call fails', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    invoke.mockRejectedValue(new Error('boom'))
    await service.generate('a robot')
    expect(service.getSnapshot()).toEqual({ status: 'error', prompt: 'a robot', results: [] })
  })

  it('reports the error state when the create response carries no task id', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    invoke.mockResolvedValue({ toolCallId: 'create', status: 'succeeded', output: {} })
    await service.generate('a robot')
    expect(service.getSnapshot()).toEqual({ status: 'error', prompt: 'a robot', results: [] })
  })

  it('reports the error state after exhausting the poll budget', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    invoke.mockResolvedValue({ toolCallId: 'create', status: 'succeeded', output: { taskId: 'task-1' } })
    const flight = service.generate('a robot')
    await vi.advanceTimersByTimeAsync(1500 * 40)
    await flight
    expect(invoke).toHaveBeenCalledTimes(41)
    expect(service.getSnapshot()).toEqual({ status: 'error', prompt: 'a robot', results: [] })
  })

  it('discards responses that arrive after an environment change', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    service.start()
    const created = deferred<{ toolCallId: string; status: string; output: Record<string, unknown> }>()
    invoke.mockReturnValueOnce(created.promise)
    const flight = service.generate('a robot')
    await vi.advanceTimersByTimeAsync(0)
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    created.resolve({ toolCallId: 'create', status: 'succeeded', output: { taskId: 'task-1' } })
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
  })

  it('discards errors that arrive after an environment change', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    service.start()
    const created = deferred<{ toolCallId: string; status: string; output: Record<string, unknown> }>()
    invoke.mockReturnValueOnce(created.promise)
    const flight = service.generate('a robot')
    await vi.advanceTimersByTimeAsync(0)
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    created.reject(new Error('boom'))
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
  })

  it('publishes the unconfigured state when the environment is removed', () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    service.start()
    setProfile({ apiBaseUrl: '' })
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', prompt: '', results: [] })
    expect(listener).toHaveBeenCalled()
  })

  it('publishes the unconfigured state when IAM changes without an environment', () => {
    const env = envOf({ apiBaseUrl: '' }).env
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    service.start()
    iam.setSession({ accessToken: 'at' })
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', prompt: '', results: [] })
    expect(listener).toHaveBeenCalled()
  })

  it('discards polls that arrive after an environment change', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    service.start()
    invoke
      .mockResolvedValueOnce(created('task-1'))
      .mockResolvedValueOnce(retrieved('processing'))
    const flight = service.generate('a robot')
    // The first poll lands while the request is current; the environment
    // changes during the second poll's interval.
    await advancePoll()
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    await advancePoll()
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
  })

  it('discards a completed poll published after an environment change', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    service.start()
    const pending = deferred<{ toolCallId: string; status: string; output: Record<string, unknown> }>()
    invoke
      .mockResolvedValueOnce(created('task-1'))
      .mockResolvedValueOnce(retrieved('processing'))
      .mockReturnValueOnce(pending.promise)
    const flight = service.generate('a robot')
    await advancePoll()
    await advancePoll()
    // Resolve the in-flight poll, then switch the environment before the
    // continuation runs: the stale response cannot publish.
    pending.resolve(retrieved('completed', 'https://stale.mp4'))
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
  })

  it('publishes the error state when no base URL is configured at request time', async () => {
    const env = {
      isConfigured: () => true,
      apiBaseUrl: () => '',
      accessToken: () => '',
      subscribe: () => () => {},
    } as unknown as EnvService
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    await service.generate('a robot')
    expect(service.getSnapshot()).toEqual({ status: 'error', prompt: 'a robot', results: [] })
  })

  it('recreates the client when the environment base URL changes', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    service.start()
    invoke
      .mockResolvedValueOnce(created('task-1'))
      .mockResolvedValueOnce(retrieved('completed', 'https://assets.sdkwork.com/first.mp4'))
      .mockResolvedValueOnce(created('task-2'))
      .mockResolvedValueOnce(retrieved('completed', 'https://assets.sdkwork.com/second.mp4'))
    const first = service.generate('first')
    await advancePoll()
    await first
    expect(createClient).toHaveBeenCalledTimes(1)
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    const second = service.generate('second')
    await advancePoll()
    await second
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient).toHaveBeenLastCalledWith({
      baseUrl: 'https://other.sdkwork.com',
      tokenManager,
    })
  })

  it('reuses the client for the same base URL', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    service.start()
    invoke
      .mockResolvedValueOnce(created('task-1'))
      .mockResolvedValueOnce(retrieved('completed', 'https://assets.sdkwork.com/a.mp4'))
      .mockResolvedValueOnce(created('task-2'))
      .mockResolvedValueOnce(retrieved('completed', 'https://assets.sdkwork.com/b.mp4'))
    const first = service.generate('first')
    await advancePoll()
    await first
    const second = service.generate('second')
    await advancePoll()
    await second
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith({
      baseUrl: 'https://api.birdcoder.com',
      tokenManager,
    })
  })

  it('publishes idle when an unconfigured environment becomes configured', () => {
    const { env, setProfile } = envOf({ apiBaseUrl: '' })
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    service.start()
    setProfile({ apiBaseUrl: 'https://api.birdcoder.com' })
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
    expect(listener).toHaveBeenCalled()
  })

  it('stops republishing after disposal', () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new VideoGenerationsService(env, iam.iam)
    const dispose = service.start()
    dispose()
    const listener = vi.fn()
    service.subscribe(listener)
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    iam.setSession({ accessToken: 'at' })
    expect(listener).not.toHaveBeenCalled()
  })
})
