// @vitest-environment jsdom
/**
 * IM host adapter spec: the service maps the environment and IAM session onto
 * the deployed embed bundle, mounts/updates/disposes surfaces, and publishes
 * the unread, selection, and failure facts the rail entry and pages read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { IamService } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { ImService, resolveEmbedUrl } from '../src/client/im-service.ts'
import type { ImSurfaceHandle, ImSurfaceMountRequest } from '../src/client/im-service.ts'

interface FakeSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  sessionId?: string
  user?: unknown
  context?: unknown
}

interface FakeOptions {
  imEmbedUrl?: string
  apiBaseUrl?: string
  imApiBaseUrl?: string
  session?: FakeSession | null
  language?: string
}

/** Each test gets its own bundle URL so the module-level loader cache starts empty. */
let urlSequence = 0

function fakeEnv(options: FakeOptions) {
  const subscribe = vi.fn(() => () => {})
  const profile = {
    apiBaseUrl: options.apiBaseUrl ?? 'https://api.example.test',
    imApiBaseUrl: options.imApiBaseUrl ?? '',
    appId: 'sdkwork-birdcoder',
    appKey: 'sdkwork-birdcoder',
    accessToken: '',
    imEmbedUrl: options.imEmbedUrl ?? `https://im.example.test/embed-${++urlSequence}.js`,
  }
  return {
    apiBaseUrl: () => profile.apiBaseUrl,
    currentEnvironment: () => 'development',
    imApiBaseUrl: () => options.imApiBaseUrl ?? profile.apiBaseUrl,
    profile: () => profile,
    subscribe,
  }
}

function fakeIam(session: FakeOptions['session'] = null) {
  const subscribe = vi.fn(() => () => {})
  return {
    controller: {
      getState: () => ({ session }),
      subscribe,
    },
  }
}

const layout = () => ({ setMode: vi.fn() }) as unknown as ILayout & { setMode: ReturnType<typeof vi.fn> }
const localeRuntime = (language = 'zh') => ({
  getSnapshot: () => ({ active: language }),
  subscribe: () => () => {},
}) as unknown as LocaleRuntime

interface MountedScript {
  script: HTMLScriptElement
}

/** Capture script appends and run the load handler the service installed. */
function interceptScripts(): MountedScript[] {
  const appended: MountedScript[] = []
  vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
    const script = node as HTMLScriptElement
    appended.push({ script })
    return node
  }) as typeof document.head.appendChild)
  return appended
}

const SESSION = {
  accessToken: 'access-token',
  authToken: 'auth-token',
  refreshToken: 'refresh-token',
  sessionId: 'session-1',
  user: { id: 'user-1' },
  context: { tenantId: 'tenant-1' },
}

function serviceWith(options: FakeOptions & { session?: FakeOptions['session'] }) {
  const env = fakeEnv(options)
  const iam = fakeIam(options.session ?? null)
  const frame = layout()
  const service = new ImService(
    env as unknown as EnvService,
    iam as unknown as IamService,
    frame,
    localeRuntime(options.language),
  )
  return { service, env, iam, frame }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(globalThis, 'SdkworkImEmbed')
})

describe('ImService', () => {
  it('subscribes to environment and session while started and releases both on dispose', () => {
    const { service, env, iam } = serviceWith({ session: SESSION })
    const dispose = service.start()
    expect(env.subscribe).toHaveBeenCalledTimes(1)
    expect(iam.controller.subscribe).toHaveBeenCalledTimes(1)
    dispose()
    expect(env.subscribe).toHaveBeenCalledTimes(1)
  })

  it('hands the environment IM gateway to the bundle', async () => {
    const { service } = serviceWith({ session: SESSION, imApiBaseUrl: 'https://im-dev.birdcoder.com' })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const handle = service.mountSurface(document.createElement('div'), { kind: 'conversation-list' })
    await Promise.resolve()
    await Promise.resolve()
    const [, options] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { apiBaseUrl: string }]
    // The bundle derives its own realtime origin from the gateway it is given.
    expect(options.apiBaseUrl).toBe('https://im-dev.birdcoder.com')
    handle.dispose()
  })

  it('mounts a same-origin relative embed URL', async () => {
    const { service } = serviceWith({ imEmbedUrl: '/sdkwork-im/im-pc-embed.js', session: SESSION })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'conversation-list', onStatus })
    await Promise.resolve()
    await Promise.resolve()
    expect(mountSurface).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'ready', error: null })
  })

  it('rejects an embed URL outside the trusted schemes', () => {
    const { service } = serviceWith({ imEmbedUrl: 'javascript:alert(1)', session: SESSION })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const onStatus = vi.fn()
    const handle = service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    handle.update({ kind: 'contacts' })
    handle.dispose()
    expect(mountSurface).not.toHaveBeenCalled()
    expect(onStatus).toHaveBeenCalledWith({ phase: 'error', error: 'unconfigured' })
    expect(service.getSnapshot().notice?.code).toBe('unconfigured')
  })

  it('accepts a legacy bundle that predates the version field', async () => {
    const { service } = serviceWith({ session: SESSION })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { mountSurface })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'conversation-list', onStatus })
    await Promise.resolve()
    await Promise.resolve()
    expect(mountSurface).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'ready', error: null })
  })

  it('rejects an embed bundle that publishes another contract version', async () => {
    const { service } = serviceWith({ session: SESSION })
    const scripts = interceptScripts()
    vi.stubGlobal('SdkworkImEmbed', { version: 2, mountSurface: vi.fn() })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    expect(scripts).toHaveLength(1)
    scripts[0]?.script.onload?.(new Event('load'))
    await Promise.resolve()
    await Promise.resolve()
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'error', error: 'load-failed' })
    expect(service.getSnapshot().notice?.code).toBe('load-failed')
  })

  it('resolves and validates deployment URLs', () => {
    const base = 'http://127.0.0.1:19387/'
    expect(resolveEmbedUrl('https://cdn.example.test/im.js', base)).toBe('https://cdn.example.test/im.js')
    expect(resolveEmbedUrl('/sdkwork-im/im.js', base)).toBe('http://127.0.0.1:19387/sdkwork-im/im.js')
    expect(resolveEmbedUrl('dsh-app://app/sdkwork-im/im.js', base)).toBe('dsh-app://app/sdkwork-im/im.js')
    expect(() => resolveEmbedUrl('javascript:alert(1)', base)).toThrow(/http\(s\)/)
    expect(() => resolveEmbedUrl('data:text/javascript,1', base)).toThrow(/http\(s\)/)
    expect(() => resolveEmbedUrl('https://user:pass@cdn.example.test/im.js', base)).toThrow(/credentials/)
    expect(() => resolveEmbedUrl('http://[::1', base)).toThrow(/valid URL/)
  })

  it('reports an unconfigured deployment when no embed URL is set', () => {
    const { service } = serviceWith({ imEmbedUrl: '', session: SESSION })
    const onStatus = vi.fn()
    const handle = service.mountSurface(document.createElement('div'), { kind: 'conversation-list', onStatus })
    expect(onStatus).toHaveBeenCalledWith({ phase: 'error', error: 'unconfigured' })
    expect(service.getSnapshot().error).toBe('unconfigured')
    expect(service.getSnapshot().notice?.code).toBe('unconfigured')
    handle.update({ kind: 'conversation-list' })
    handle.dispose()
  })

  it('sends the surface the environment IM gateway instead of the shared API origin', async () => {
    const { service } = serviceWith({
      session: SESSION,
      apiBaseUrl: 'https://api.example.test',
      imApiBaseUrl: 'http://api-dev.birdcoder.com',
    })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const handle = service.mountSurface(document.createElement('div'), { kind: 'conversation-list' })
    await Promise.resolve()
    await Promise.resolve()
    const [, options] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { apiBaseUrl: string }]
    expect(options.apiBaseUrl).toBe('http://api-dev.birdcoder.com')
    handle.dispose()
  })

  it('keeps the surface mounted without a gateway while announcing the gap', async () => {
    const { service } = serviceWith({ apiBaseUrl: '', session: SESSION })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    await Promise.resolve()
    await Promise.resolve()
    const [, options] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { apiBaseUrl: string }]
    expect(options.apiBaseUrl).toBe('')
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'ready', error: null })
    expect(service.getSnapshot().notice?.code).toBe('unconfigured')
  })

  it('maps an untyped bundle error to init-failed', async () => {
    const { service } = serviceWith({ session: SESSION })
    const mountSurface = vi.fn((_container: HTMLElement, options: { onError?: (error: unknown) => void }) => {
      options.onError?.(new Error('boom'))
      return { update: vi.fn(), unmount: vi.fn() }
    })
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'conversation-list', onStatus })
    await Promise.resolve()
    await Promise.resolve()
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'ready', error: null })
    expect(service.getSnapshot().notice?.code).toBe('init-failed')
  })

  it('reports init-failed when the bundle throws while initializing the SDK', async () => {
    const { service } = serviceWith({ session: SESSION })
    vi.stubGlobal('SdkworkImEmbed', { version: 1,
      mountSurface: () => { throw new Error('SDKWork IM SDK initialization failed: no gateway') },
    })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    await Promise.resolve()
    await Promise.resolve()
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'error', error: 'init-failed' })
    expect(service.getSnapshot().error).toBe('init-failed')
    expect(service.getSnapshot().notice?.code).toBe('init-failed')
  })

  it('mounts the shell and announces a pass-through session as a notice', async () => {
    const { service } = serviceWith({ session: null })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    await Promise.resolve()
    await Promise.resolve()
    const [, options] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { session: unknown }]
    expect(options.session).toBeNull()
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'ready', error: null })
    expect(service.getSnapshot().notice?.code).toBe('mount-failed')
  })

  it.each([
    ['im-embed-invalid-api-base-url', 'unconfigured'],
    ['im-embed-invalid-websocket-base-url', 'mount-failed'],
    ['im-embed-invalid-session', 'mount-failed'],
    ['im-embed-sdk-init-failed', 'init-failed'],
    ['unexpected-failure', 'init-failed'],
  ])('announces a bundle error %s as %s while keeping the surface mounted', async (bundleCode, expected) => {
    const { service } = serviceWith({ session: SESSION })
    const mountSurface = vi.fn((_container: HTMLElement, options: { onError?: (error: unknown) => void }) => {
      options.onError?.({ code: bundleCode })
      return { update: vi.fn(), unmount: vi.fn() }
    })
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'conversation-list', onStatus })
    await Promise.resolve()
    await Promise.resolve()
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'ready', error: null })
    expect(service.getSnapshot().notice?.code).toBe(expected)
  })

  it('loads the embed bundle once and mounts the requested surface with host facts', async () => {
    const { service } = serviceWith({ session: SESSION, language: 'en' })
    const unmount = vi.fn()
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })

    const container = document.createElement('div')
    const onStatus = vi.fn()
    const handle = service.mountSurface(container, { kind: 'conversation', conversationId: 'conversation-1', onStatus })

    expect(onStatus).toHaveBeenNthCalledWith(1, { phase: 'loading', error: null })
    await Promise.resolve()
    await Promise.resolve()

    expect(mountSurface).toHaveBeenCalledTimes(1)
    const [mountedContainer, mountedOptions] = mountSurface.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>]
    expect(mountedContainer).toBe(container)
    expect(mountedOptions.kind).toBe('conversation')
    expect(mountedOptions.conversationId).toBe('conversation-1')
    expect(mountedOptions.apiBaseUrl).toBe('https://api.example.test')
    expect(mountedOptions.locale).toBe('en-US')
    expect((mountedOptions.session as typeof SESSION).authToken).toBe('auth-token')
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'ready', error: null })

    handle.dispose()
    expect(unmount).toHaveBeenCalledTimes(1)
  })

  it('reuses the loaded bundle for a second surface and forwards updates', async () => {
    const { service } = serviceWith({ session: SESSION })
    const update = vi.fn()
    const mountSurface = vi.fn(() => ({ update, unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })

    const first = service.mountSurface(document.createElement('div'), { kind: 'conversation-list' })
    await Promise.resolve()
    await Promise.resolve()

    const second = service.mountSurface(document.createElement('div'), { kind: 'conversation', conversationId: 'b' })
    await Promise.resolve()
    await Promise.resolve()
    expect(mountSurface).toHaveBeenCalledTimes(2)

    second.update({ kind: 'conversation', conversationId: 'c' })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c' }))
    first.dispose()
    second.dispose()
  })

  it('publishes unread totals and selection, and opens the chat page from elsewhere', async () => {
    const { service, frame } = serviceWith({ session: SESSION })
    const appended = interceptScripts()
    let unread: ((total: number) => void) | undefined
    vi.stubGlobal('SdkworkImEmbed', { version: 1,
      mountSurface: (_container: HTMLElement, options: { onUnreadChange?: (total: number) => void }) => {
        unread = options.onUnreadChange
        return { update: vi.fn(), unmount: vi.fn() }
      },
    })
    const listener = vi.fn()
    service.subscribe(listener)
    service.mountSurface(document.createElement('div'), { kind: 'conversation-list' })
    appended[0]?.script.onload?.(new Event('load'))
    await Promise.resolve()
    await Promise.resolve()

    unread?.(4)
    expect(service.getSnapshot().totalUnread).toBe(4)
    expect(listener).toHaveBeenCalled()

    service.selectConversation('conversation-9')
    expect(service.getSnapshot().selectedConversationId).toBe('conversation-9')
    service.openConversation('conversation-10')
    expect(frame.setMode).toHaveBeenCalledWith('chat')
    expect(service.getSnapshot().selectedConversationId).toBe('conversation-10')
  })

  it('reports a load failure when the script errors', async () => {
    const { service } = serviceWith({ session: SESSION })
    const appended = interceptScripts()
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    appended[0]?.script.onerror?.(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'error', error: 'load-failed' })
    expect(service.getSnapshot().error).toBe('load-failed')
    expect(service.getSnapshot().notice?.code).toBe('load-failed')
  })

  it('does not mount a surface disposed while the bundle is still loading', async () => {
    const { service } = serviceWith({ session: SESSION })
    const appended = interceptScripts()
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const handle = service.mountSurface(document.createElement('div'), { kind: 'contacts' })
    handle.dispose()
    appended[0]?.script.onload?.(new Event('load'))
    await Promise.resolve()
    await Promise.resolve()
    expect(mountSurface).not.toHaveBeenCalled()
  })

  it('rejects a script that loads without publishing the mount API', async () => {
    const { service } = serviceWith({ session: SESSION })
    const appended = interceptScripts()
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    appended[0]?.script.onload?.(new Event('load'))
    await Promise.resolve()
    await Promise.resolve()
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'error', error: 'load-failed' })
  })

  it('treats a half session as signed out while keeping the shell mounted', async () => {
    const { service } = serviceWith({ session: { accessToken: 'a' } })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const onStatus = vi.fn()
    service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    await Promise.resolve()
    await Promise.resolve()
    const [, options] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { session: unknown }]
    expect(options.session).toBeNull()
    expect(onStatus).toHaveBeenLastCalledWith({ phase: 'ready', error: null })
    expect(service.getSnapshot().notice?.code).toBe('mount-failed')
  })

  it('ignores a bundle failure that arrives after the surface was disposed', async () => {
    const { service } = serviceWith({ session: SESSION })
    const appended = interceptScripts()
    const onStatus = vi.fn()
    const handle = service.mountSurface(document.createElement('div'), { kind: 'contacts', onStatus })
    handle.dispose()
    appended[0]?.script.onerror?.(new Event('error'))
    await Promise.resolve()
    await Promise.resolve()
    expect(service.getSnapshot().error).toBeNull()
    expect(onStatus).not.toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }))
  })

  it('mounts after the script publishes the embed API', async () => {
    const { service } = serviceWith({ session: SESSION })
    const appended = interceptScripts()
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))

    const handle = service.mountSurface(document.createElement('div'), { kind: 'conversation-list' })
    expect(appended).toHaveLength(1)
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    appended[0]?.script.onload?.(new Event('load'))
    await new Promise((resolve) => { setTimeout(resolve, 0) })

    expect(mountSurface).toHaveBeenCalledTimes(1)
    handle.dispose()
  })

  it('forwards a dual-token-only session without the optional claims', async () => {
    const { service } = serviceWith({ session: { accessToken: 'a', authToken: 'b' } })
    const mountSurface = vi.fn(() => ({ update: vi.fn(), unmount: vi.fn() }))
    vi.stubGlobal('SdkworkImEmbed', { version: 1, mountSurface })
    const handle = service.mountSurface(document.createElement('div'), { kind: 'conversation-list' })
    await Promise.resolve()
    await Promise.resolve()
    const [, options] = mountSurface.mock.calls[0] as unknown as [HTMLElement, { session: unknown }]
    expect(options.session).toEqual({ accessToken: 'a', authToken: 'b' })
    handle.dispose()
  })

  it('clears the failure when the environment or session changes while started', () => {
    const envListeners: Array<() => void> = []
    const sessionListeners: Array<() => void> = []
    const baseEnv = fakeEnv({ session: SESSION })
    const baseIam = fakeIam(SESSION)
    const env = {
      ...baseEnv,
      subscribe: vi.fn((listener: () => void) => { envListeners.push(listener); return () => {} }),
    }
    const iam = {
      controller: {
        ...baseIam.controller,
        subscribe: vi.fn((listener: () => void) => { sessionListeners.push(listener); return () => {} }),
      },
    }
    const service = new ImService(
      env as unknown as EnvService,
      iam as unknown as IamService,
      layout(),
      localeRuntime(),
    )
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)
    const dispose = service.start()
    envListeners[0]?.()
    sessionListeners[0]?.()
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
    dispose()
  })

  it('keeps snapshot identity between unchanged publishes', () => {
    const { service } = serviceWith({ session: SESSION })
    const before = service.getSnapshot()
    service.selectConversation(null)
    expect(service.getSnapshot()).toBe(before)
  })

  it('exposes a stable request shape for the page mount helper', () => {
    const { service } = serviceWith({ session: SESSION })
    const request: ImSurfaceMountRequest = { kind: 'conversation-list' }
    const handle: ImSurfaceHandle = service.mountSurface(document.createElement('div'), request)
    handle.dispose()
  })
})
