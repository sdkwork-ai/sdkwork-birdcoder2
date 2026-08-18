import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@sdkwork/agents-app-sdk'
import { createTokenManager } from '@sdkwork/sdk-common'
import { ImageGenerationsService, type GenerationIamService } from '../src/client/generations-service.ts'
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

beforeEach(() => {
  vi.mocked(createTokenManager).mockReturnValue(tokenManager)
  vi.mocked(createClient).mockReset()
  vi.mocked(createClient).mockReturnValue(clientOf() as never)
  invoke.mockReset()
  tokenManager.setAccessToken.mockClear()
  tokenManager.setTokens.mockClear()
  tokenManager.clearTokens.mockClear()
})

const configured = (): EnvService => envOf().env

describe('ImageGenerationsService', () => {
  it('starts unconfigured without an environment and publishes the same snapshot', async () => {
    const env = envOf({ apiBaseUrl: '' }).env
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', prompt: '', results: [] })
    const listener = vi.fn()
    const off = service.subscribe(listener)
    await service.generate('a panda')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', prompt: '', results: [] })
    expect(createClient).not.toHaveBeenCalled()
    off()
  })

  it('starts idle with a configured environment and mirrors tokens from the env', () => {
    const env = envOf({ accessToken: 'env-token' }).env
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
    const dispose = service.start()
    expect(tokenManager.clearTokens).toHaveBeenCalled()
    expect(tokenManager.setAccessToken).toHaveBeenCalledWith('env-token')
    dispose()
  })

  it('adopts IAM session tokens when the environment token is empty', () => {
    const env = configured()
    const iam = iamOf({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    const service = new ImageGenerationsService(env, iam.iam)
    const dispose = service.start()
    expect(tokenManager.setTokens).toHaveBeenCalledWith({ accessToken: 'at', authToken: 'auth', refreshToken: 'rt' })
    dispose()
  })

  it('spreads only the present session token fields', () => {
    const env = configured()
    const iam = iamOf({ authToken: 'auth-only' })
    const service = new ImageGenerationsService(env, iam.iam)
    const dispose = service.start()
    expect(tokenManager.setTokens).toHaveBeenCalledWith({ authToken: 'auth-only' })
    dispose()
  })

  it('clears tokens and publishes idle when the IAM session signs out', () => {
    const env = configured()
    const iam = iamOf({ accessToken: 'at' })
    const service = new ImageGenerationsService(env, iam.iam)
    const dispose = service.start()
    iam.setSession(null)
    expect(tokenManager.clearTokens).toHaveBeenCalledTimes(2)
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
    dispose()
  })

  it('ignores IAM changes while a static environment token is set', () => {
    const env = envOf({ accessToken: 'env-token' }).env
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    const dispose = service.start()
    iam.setSession({ accessToken: 'at' })
    expect(listener).not.toHaveBeenCalled()
    dispose()
  })

  it('generates one image through the agents media-tool channel', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    const dispose = service.start()
    invoke.mockResolvedValue({
      toolCallId: 'call-1',
      status: 'succeeded',
      output: { images: [{ url: 'https://assets.sdkwork.com/panda.png' }] },
    })
    await service.generate('  a red panda  ')
    expect(invoke).toHaveBeenCalledWith('image.generations.create', {
      arguments: { prompt: 'a red panda', model: 'default', n: 1, size: '1024x1024' },
    })
    expect(service.getSnapshot()).toEqual({
      status: 'ready',
      prompt: 'a red panda',
      results: [{ url: 'https://assets.sdkwork.com/panda.png' }],
    })
    dispose()
  })

  it('narrows malformed tool output to the images it can present', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    invoke.mockResolvedValue({
      toolCallId: 'call-1',
      status: 'succeeded',
      output: {
        images: [
          { url: 'https://assets.sdkwork.com/a.png' },
          { url: '' },
          { url: 42 },
          null,
          { kind: 'image' },
        ],
      },
    })
    await service.generate('mixed')
    expect(service.getSnapshot()).toEqual({
      status: 'ready',
      prompt: 'mixed',
      results: [{ url: 'https://assets.sdkwork.com/a.png' }],
    })
  })

  it('publishes an empty result list when the tool output has no images array', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    invoke.mockResolvedValue({ toolCallId: 'call-1', status: 'succeeded', output: {} })
    await service.generate('none')
    expect(service.getSnapshot()).toEqual({ status: 'ready', prompt: 'none', results: [] })
  })

  it('publishes the error state when the tool call fails', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    invoke.mockRejectedValue(new Error('boom'))
    await service.generate('a panda')
    expect(service.getSnapshot()).toEqual({ status: 'error', prompt: 'a panda', results: [] })
  })

  it('publishes the error state when no base URL is configured at request time', async () => {
    // A configured environment whose base URL reads empty exercises the
    // adapter's own baseUrl guard rather than the unconfigured short-circuit.
    const env = {
      isConfigured: () => true,
      apiBaseUrl: () => '',
      accessToken: () => '',
      subscribe: () => () => {},
    } as unknown as EnvService
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    await service.generate('a panda')
    expect(service.getSnapshot()).toEqual({ status: 'error', prompt: 'a panda', results: [] })
  })

  it('discards responses that arrive after an environment change', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    service.start()
    const pending = deferred<{ toolCallId: string; status: string; output: Record<string, unknown> }>()
    invoke.mockReturnValue(pending.promise)
    const flight = service.generate('a panda')
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    pending.resolve({ toolCallId: 'call-1', status: 'succeeded', output: { images: [{ url: 'https://stale' }] } })
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
  })

  it('discards errors that arrive after an environment change', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    service.start()
    const pending = deferred<{ toolCallId: string; status: string; output: Record<string, unknown> }>()
    invoke.mockReturnValue(pending.promise)
    const flight = service.generate('a panda')
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    pending.reject(new Error('boom'))
    await flight
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
  })

  it('publishes the unconfigured state when the environment is removed', () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
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
    const service = new ImageGenerationsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    service.start()
    iam.setSession({ accessToken: 'at' })
    expect(service.getSnapshot()).toEqual({ status: 'unconfigured', prompt: '', results: [] })
    expect(listener).toHaveBeenCalled()
  })

  it('recreates the client when the environment base URL changes', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    service.start()
    invoke.mockResolvedValue({ toolCallId: 'call-1', status: 'succeeded', output: { images: [] } })
    await service.generate('first')
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    invoke.mockResolvedValue({ toolCallId: 'call-2', status: 'succeeded', output: { images: [] } })
    await service.generate('second')
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient).toHaveBeenLastCalledWith({
      baseUrl: 'https://other.sdkwork.com',
      tokenManager,
    })
  })

  it('reuses the client for the same base URL', async () => {
    const env = configured()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    service.start()
    invoke.mockResolvedValue({ toolCallId: 'call-1', status: 'succeeded', output: { images: [] } })
    await service.generate('first')
    await service.generate('second')
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('publishes idle when an unconfigured environment becomes configured', () => {
    const { env, setProfile } = envOf({ apiBaseUrl: '' })
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    const listener = vi.fn()
    service.subscribe(listener)
    service.start()
    setProfile({ apiBaseUrl: 'https://api.birdcoder.com' })
    expect(service.getSnapshot()).toEqual({ status: 'idle', prompt: '', results: [] })
    expect(listener).toHaveBeenCalled()
  })

  it('stops republishing after disposal', async () => {
    const { env, setProfile } = envOf()
    const iam = iamOf(null)
    const service = new ImageGenerationsService(env, iam.iam)
    const dispose = service.start()
    dispose()
    const listener = vi.fn()
    service.subscribe(listener)
    setProfile({ apiBaseUrl: 'https://other.sdkwork.com' })
    iam.setSession({ accessToken: 'at' })
    expect(listener).not.toHaveBeenCalled()
  })
})
