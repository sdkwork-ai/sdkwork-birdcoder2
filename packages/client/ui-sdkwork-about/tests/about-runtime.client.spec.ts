/** The About runtime: load states, environment changes, stale reads, and disposal. */
import { describe, expect, it, vi } from 'vitest'
import {
  AboutRuntime,
  type AboutEnvironment,
  type InstallationApplicationPort,
} from '../src/client/about-runtime.ts'
import type { AboutInstallationFacts } from '../src/client/installation-facts.ts'

const APPLICATION: AboutInstallationFacts = {
  appId: '382418217538162688',
  tenantId: '100001',
  organizationId: '0',
  releaseScope: 'TENANT',
  environment: 'production',
  deploymentMode: 'saas',
  product: {
    name: 'SDKWork Birdcoder',
    vendor: 'SDKWork',
    appKey: 'sdkwork-birdcoder2',
    iconUrl: 'https://cdn.sdkwork.com/icon.png',
    websiteUrl: 'https://sdkwork.com/apps/sdkwork-birdcoder',
    supportUrl: 'https://sdkwork.com/support',
    privacyPolicyUrl: 'https://sdkwork.com/privacy',
    termsOfServiceUrl: 'https://sdkwork.com/terms',
  },
}

interface EnvironmentOverrides {
  session?: { accessToken: string; authToken: string } | null
  environment?: 'development' | 'testing' | 'production'
  appId?: string
  version?: string
  commit?: string
  dirty?: boolean
}

function environment(over: EnvironmentOverrides = {}) {
  const listeners = new Set<() => void>()
  const current = {
    session: { accessToken: 'token', authToken: 'auth' } as { accessToken: string; authToken: string } | null,
    environment: 'production' as const,
    appId: 'app_declared',
    version: '0.2.2-rc.5',
    commit: '0123456789abcdef',
    dirty: true,
    ...over,
  }
  const value: AboutEnvironment = {
    version: () => current.version,
    commit: () => current.commit,
    dirty: () => current.dirty,
    declaredAppId: () => current.appId,
    apiBaseUrl: () => 'https://api.birdcoder.com',
    credentials: () => current.session ?? undefined,
    environment: () => current.environment,
    appMode: () => 'web',
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return {
    value,
    current,
    notify: () => { for (const listener of [...listeners]) listener() },
    listenerCount: () => listeners.size,
  }
}

function port(retrieve: InstallationApplicationPort['retrieve']): { port: InstallationApplicationPort; retrieve: typeof retrieve } {
  return { port: { retrieve }, retrieve }
}

describe('AboutRuntime', () => {
  it('starts on the local facts and publishes the platform application', async () => {
    const env = environment()
    const p = port(async () => APPLICATION)
    const runtime = new AboutRuntime(env.value, () => p.port)
    const stop = runtime.start()
    expect(runtime.local.getSnapshot()).toMatchObject({ appId: 'app_declared', version: '0.2.2-rc.5', appMode: 'web' })
    expect(runtime.installation.getSnapshot()).toEqual({ phase: 'loading' })
    await vi.waitFor(() => { expect(runtime.installation.getSnapshot()).toEqual({ phase: 'ready', application: APPLICATION }) })
    stop()
    expect(env.listenerCount()).toBe(0)
    runtime.dispose()
  })

  it('reports an unconfigured deployment without calling the platform', () => {
    const env = environment()
    const createPort = vi.fn(() => undefined)
    const runtime = new AboutRuntime(env.value, createPort)
    runtime.start()
    expect(runtime.installation.getSnapshot()).toEqual({ phase: 'unavailable', reason: 'unconfigured' })
    expect(createPort).toHaveBeenCalledTimes(1)
  })

  it('reports a failed read with its technical detail', async () => {
    const env = environment()
    const runtime = new AboutRuntime(env.value, () => port(async () => { throw new Error('offline') }).port)
    runtime.start()
    await vi.waitFor(() => {
      expect(runtime.installation.getSnapshot()).toEqual({ phase: 'unavailable', reason: 'failed', detail: 'offline' })
    })
  })

  it('reports a failed read without a detail for an empty error message', async () => {
    const env = environment()
    const runtime = new AboutRuntime(env.value, () => port(async () => { throw new Error('') }).port)
    runtime.start()
    await vi.waitFor(() => {
      expect(runtime.installation.getSnapshot()).toEqual({ phase: 'unavailable', reason: 'failed' })
    })
  })

  it('reports an incomplete response instead of rendering a broken card', async () => {
    const env = environment()
    const runtime = new AboutRuntime(env.value, () => port(async () => ({ ...APPLICATION, appId: '' })).port)
    runtime.start()
    await vi.waitFor(() => {
      expect(runtime.installation.getSnapshot()).toEqual({ phase: 'unavailable', reason: 'invalid' })
    })
  })

  it('re-reads when the deployment environment changes', async () => {
    const env = environment()
    const retrieve = vi.fn(async () => APPLICATION)
    const runtime = new AboutRuntime(env.value, () => ({ retrieve }))
    const stop = runtime.start()
    await vi.waitFor(() => { expect(retrieve).toHaveBeenCalledTimes(1) })
    const local = vi.fn()
    runtime.local.subscribe(local)
    env.current.environment = 'testing'
    env.current.appId = 'app_next'
    env.notify()
    expect(runtime.local.getSnapshot()).toMatchObject({ environment: 'testing', appId: 'app_next' })
    expect(local).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => { expect(retrieve).toHaveBeenCalledTimes(2) })
    stop()
    runtime.dispose()
  })

  it('ignores a superseded read and aborts the obsolete request', async () => {
    const env = environment()
    let rejectFirst: (error: unknown) => void = () => {}
    const first = new Promise<AboutInstallationFacts>((_resolve, reject) => { rejectFirst = reject })
    const retrieve = vi.fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(async () => APPLICATION)
    const runtime = new AboutRuntime(env.value, () => ({ retrieve }))
    const start = runtime.start()
    runtime.load()
    await vi.waitFor(() => { expect(runtime.installation.getSnapshot()).toMatchObject({ phase: 'ready' }) })
    rejectFirst(new Error('aborted'))
    await Promise.resolve()
    expect(runtime.installation.getSnapshot()).toMatchObject({ phase: 'ready' })
    start()
    runtime.dispose()
  })

  it('shows the loading state again when retrying after a failed read', async () => {
    const env = environment()
    let rejectFirst: (error: unknown) => void = () => {}
    const first = new Promise<AboutInstallationFacts>((_resolve, reject) => { rejectFirst = reject })
    const retrieve = vi.fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => new Promise<AboutInstallationFacts>(() => {}))
    const runtime = new AboutRuntime(env.value, () => ({ retrieve }))
    runtime.start()
    rejectFirst(new Error('offline'))
    await vi.waitFor(() => {
      expect(runtime.installation.getSnapshot()).toEqual({ phase: 'unavailable', reason: 'failed', detail: 'offline' })
    })
    runtime.load()
    expect(runtime.installation.getSnapshot()).toEqual({ phase: 'loading' })
    runtime.dispose()
  })

  it('keeps settled facts visible while a refresh runs', async () => {
    const env = environment()
    let resolveSecond: (value: AboutInstallationFacts) => void = () => {}
    const retrieve = vi.fn()
      .mockImplementationOnce(async () => APPLICATION)
      .mockImplementationOnce(() => new Promise<AboutInstallationFacts>((resolve) => { resolveSecond = resolve }))
    const runtime = new AboutRuntime(env.value, () => ({ retrieve }))
    runtime.start()
    await vi.waitFor(() => { expect(runtime.installation.getSnapshot()).toMatchObject({ phase: 'ready' }) })
    runtime.load()
    expect(runtime.installation.getSnapshot()).toMatchObject({ phase: 'ready' })
    resolveSecond({ ...APPLICATION, appId: 'app_refreshed' })
    await vi.waitFor(() => {
      expect(runtime.installation.getSnapshot()).toMatchObject({ application: { appId: 'app_refreshed' } })
    })
    runtime.dispose()
  })

  it('is idempotent on a second start and tolerates a double dispose', () => {
    const env = environment()
    const runtime = new AboutRuntime(env.value, () => port(async () => APPLICATION).port)
    const stop = runtime.start()
    const secondStop = runtime.start()
    expect(secondStop).toBeTypeOf('function')
    secondStop()
    expect(env.listenerCount()).toBe(1)
    stop()
    runtime.dispose()
    runtime.dispose()
  })

  it('serves component subscriptions from the same stable source', () => {
    const env = environment()
    const runtime = new AboutRuntime(env.value, () => port(async () => APPLICATION).port)
    const installation = vi.fn()
    const local = vi.fn()
    const offInstallation = runtime.installation.subscribe(installation)
    const offLocal = runtime.local.subscribe(local)
    const same = runtime.installation.getSnapshot()
    expect(runtime.installation.getSnapshot()).toBe(same)
    offInstallation()
    offLocal()
    expect(runtime.installation.getSnapshot()).toBe(same)
  })

  it('reports an unauthenticated launch without calling the platform', () => {
    const env = environment({ session: null })
    const createPort = vi.fn(() => undefined)
    const runtime = new AboutRuntime(env.value, createPort)
    runtime.start()
    expect(runtime.installation.getSnapshot()).toEqual({ phase: 'unavailable', reason: 'unauthenticated' })
  })

  it('uses the shell version only when the client build carries none', () => {
    const env = environment({ version: undefined })
    const runtime = new AboutRuntime(env.value, () => undefined)
    const local = vi.fn()
    runtime.local.subscribe(local)
    runtime.setFallbackVersion('9.9.9')
    expect(runtime.local.getSnapshot().version).toBe('9.9.9')
    expect(local).toHaveBeenCalledTimes(1)
    runtime.setFallbackVersion('9.9.9')
    expect(local).toHaveBeenCalledTimes(1)
    runtime.setFallbackVersion('  ')
    expect(runtime.local.getSnapshot().version).toBeUndefined()
    runtime.dispose()
  })

  it('never overrides a version the build already carries', () => {
    const env = environment()
    const runtime = new AboutRuntime(env.value, () => undefined)
    runtime.setFallbackVersion('9.9.9')
    expect(runtime.local.getSnapshot().version).toBe('0.2.2-rc.5')
    runtime.dispose()
  })

  it('keeps a shell version fallback across environment changes', () => {
    const env = environment({ version: undefined })
    const runtime = new AboutRuntime(env.value, () => undefined)
    const stop = runtime.start()
    runtime.setFallbackVersion('9.9.9')
    env.current.environment = 'testing'
    env.notify()
    expect(runtime.local.getSnapshot()).toMatchObject({ version: '9.9.9', environment: 'testing' })
    stop()
    runtime.dispose()
  })
})
