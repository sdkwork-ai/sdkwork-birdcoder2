import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppStoreClient } from '@sdkwork/appstore-app-sdk'
import type { AppStoreClient, FeedbackCreateRequest } from '@sdkwork/appstore-app-sdk'
import { FeedbackService, type IamServiceLike } from '../src/client/feedback-service.ts'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'

// The appstore SDK faces this spec mocks at the module boundary; vitest
// hoists the mock above the imports.
vi.mock('@sdkwork/appstore-app-sdk', () => ({
  createAppStoreClient: vi.fn(),
}))

/** The catalog submit face every client fake shares. */
const submitFeedbackMock = vi.fn(async () => ({}))

/** A client fake with the catalog facade the service composes. */
function clientOf(): AppStoreClient {
  return { catalog: { submitFeedback: submitFeedbackMock } } as unknown as AppStoreClient
}

/** A scriptable environment service carrying the shared sdkwork profile. */
function envOf(profile: Partial<{ apiBaseUrl: string; appKey: string; accessToken: string }> = {}): {
  env: EnvService
  setProfile(next: Partial<{ apiBaseUrl: string; appKey: string; accessToken: string }>): void
} {
  let current = { apiBaseUrl: 'https://api.birdcoder.com', appKey: 'sdkwork-birdcoder', accessToken: '', ...profile }
  const listeners = new Set<() => void>()
  return {
    env: {
      isConfigured: () => current.apiBaseUrl.trim() !== '',
      apiBaseUrl: () => current.apiBaseUrl,
      appId: () => 'sdkwork-birdcoder',
      appKey: () => current.appKey,
      accessToken: () => current.accessToken,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    } as unknown as EnvService,
    setProfile(next) {
      current = { ...current, ...next }
      for (const listener of listeners) listener()
    },
  }
}

/** A scriptable IAM controller face for the token-sync specs. */
function iamOf(session: { accessToken?: string; authToken?: string; refreshToken?: string } | null): {
  iam: IamServiceLike
  setSession(next: { accessToken?: string; authToken?: string; refreshToken?: string } | null): void
} {
  let current = session
  const listeners = new Set<() => void>()
  return {
    iam: {
      controller: {
        getState: () => ({ session: current }),
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
    },
    setSession: (next) => {
      current = next
      for (const listener of listeners) listener()
    },
  }
}

describe('FeedbackService', () => {
  beforeEach(() => {
    submitFeedbackMock.mockClear()
    vi.mocked(createAppStoreClient).mockReset()
    vi.mocked(createAppStoreClient).mockReturnValue(clientOf())
  })

  it('is configured from the environment profile and unconfigured with an empty base URL', () => {
    const defaults = envOf()
    expect(new FeedbackService(defaults.env).isConfigured()).toBe(true)

    const blank = envOf({ apiBaseUrl: '' })
    expect(new FeedbackService(blank.env).isConfigured()).toBe(false)
  })

  it('reflects environment moves into isConfigured', () => {
    const env = envOf()
    const service = new FeedbackService(env.env)
    env.setProfile({ apiBaseUrl: '' })
    expect(service.isConfigured()).toBe(false)
    env.setProfile({ apiBaseUrl: 'https://api.birdcoder.com' })
    expect(service.isConfigured()).toBe(true)
  })

  it('rejects blank content before touching the client', async () => {
    const env = envOf()
    const service = new FeedbackService(env.env)
    await expect(service.submit({ type: 'bug', content: '   ' })).rejects.toThrow('Feedback content is required')
    expect(vi.mocked(createAppStoreClient)).not.toHaveBeenCalled()
  })

  it('submits through the lazily built appstore client with the environment app key', async () => {
    const env = envOf({ appKey: 'sdkwork-birdcoder-test' })
    const service = new FeedbackService(env.env)
    await service.submit({ type: 'suggestion', content: 'Add dark mode', contact: 'me@example.com' })
    expect(vi.mocked(createAppStoreClient)).toHaveBeenCalledTimes(1)
    expect(submitFeedbackMock).toHaveBeenCalledWith({
      type: 'suggestion',
      content: 'Add dark mode',
      contact: 'me@example.com',
      appKey: 'sdkwork-birdcoder-test',
    })
  })

  it('omits the contact field for a blank contact and trims the content', async () => {
    const env = envOf()
    const service = new FeedbackService(env.env)
    await service.submit({ type: 'other', content: '  hello  ', contact: '  ' })
    expect(submitFeedbackMock).toHaveBeenCalledWith({
      type: 'other',
      content: 'hello',
      appKey: 'sdkwork-birdcoder',
    } satisfies FeedbackCreateRequest)
  })

  it('rebuilds the client when the environment base URL changes', async () => {
    const env = envOf()
    const service = new FeedbackService(env.env)
    await service.submit({ type: 'bug', content: 'first' })
    env.setProfile({ apiBaseUrl: 'https://api.staging.sdkwork.com' })
    await service.submit({ type: 'bug', content: 'second' })
    expect(vi.mocked(createAppStoreClient)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(createAppStoreClient).mock.calls[0][0].baseUrl).toBe('https://api.birdcoder.com')
    expect(vi.mocked(createAppStoreClient).mock.calls[1][0].baseUrl).toBe('https://api.staging.sdkwork.com')
  })

  it('fails loud while unconfigured', async () => {
    const env = envOf({ apiBaseUrl: '' })
    const service = new FeedbackService(env.env)
    await expect(service.submit({ type: 'bug', content: 'x' })).rejects.toThrow('baseUrl is not configured')
    expect(vi.mocked(createAppStoreClient)).not.toHaveBeenCalled()
  })

  it('opens through the attached modal actions', () => {
    const env = envOf()
    const service = new FeedbackService(env.env)
    const open = vi.fn()
    const close = vi.fn()
    service.attachModal({ open, close })
    service.open()
    expect(open).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
  })

  it('uses the environment access token over the IAM session', async () => {
    const env = envOf({ accessToken: 'env-tok' })
    const { iam } = iamOf({ authToken: 'at-1', accessToken: 'ac-1' })
    const service = new FeedbackService(env.env, iam)
    service.subscribeIam()
    await service.submit({ type: 'bug', content: 'with env token' })
    const tokenManager = vi.mocked(createAppStoreClient).mock.calls[0][0].tokenManager
    expect(tokenManager?.getAccessToken()).toBe('env-tok')
    expect(tokenManager?.getAuthToken()).toBeUndefined()
  })

  it('syncs the IAM session tokens into the client token manager without an env token', async () => {
    const env = envOf()
    const iamState = iamOf({ authToken: 'at-1', accessToken: 'ac-1' })
    const service = new FeedbackService(env.env, iamState.iam)
    const dispose = service.subscribeIam()
    await service.submit({ type: 'bug', content: 'with tokens' })
    const tokenManager = vi.mocked(createAppStoreClient).mock.calls[0][0].tokenManager
    expect(tokenManager?.getAuthToken()).toBe('at-1')
    expect(tokenManager?.getAccessToken()).toBe('ac-1')

    // A session move lands on the same manager without a client rebuild.
    iamState.setSession({ authToken: 'at-2', accessToken: 'ac-2' })
    await service.submit({ type: 'bug', content: 'again' })
    expect(tokenManager?.getAuthToken()).toBe('at-2')
    expect(vi.mocked(createAppStoreClient)).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('keeps the client tokenless while no env token or IAM service is mounted', async () => {
    const env = envOf()
    const service = new FeedbackService(env.env)
    await service.submit({ type: 'bug', content: 'anonymous' })
    const tokenManager = vi.mocked(createAppStoreClient).mock.calls[0][0].tokenManager
    expect(tokenManager?.getAuthToken()).toBeUndefined()
  })
})
