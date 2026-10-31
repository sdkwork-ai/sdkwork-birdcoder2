// @vitest-environment jsdom
/**
 * Create-expert host adapter spec: the session bridge maps credentials and
 * the user profile; the gateway normalizer strips a duplicated app API
 * suffix; the interceptor chain appends the deferred sign-in gate last; and
 * the runtime derives its readiness from the gateway — unconfigured clears
 * the session and reports `{ configured: false }`, configured registers one
 * provider per SDK client (the drive client keeps the app API suffix), seeds
 * the voice and knowledgebase singletons, binds the knowledge selection
 * adapter, persists the Agents PC session tokens when both tokens exist, and
 * re-derives everything when the environment or the IAM session changes.
 * The SDK client seams and the Agents PC capability package are mocked: the
 * adapter's contract is which provider it registers with which arguments,
 * not the generated clients themselves.
 */
import { describe, expect, it, vi } from 'vitest'

const seams = vi.hoisted(() => {
  let knowledgebaseCalls = 0
  return {
    agentsProvider: vi.fn(),
    memoryProvider: vi.fn(),
    skillsProvider: vi.fn(),
    voiceInit: vi.fn(),
    // Each environment sync re-initializes the client; a fresh object per
    // call lets the re-bind assertion tell the two clients apart.
    knowledgebaseInit: vi.fn((): { call: number } => ({ call: (knowledgebaseCalls += 1) })),
    knowledgeAdapter: vi.fn(),
    driveProvider: vi.fn(),
    persisted: [] as unknown[],
    cleared: 0,
    tokenSync: [] as unknown[],
  }
})

vi.mock('@sdkwork/agents-pc-core/sdk/agentsAppSdkClient', () => ({
  configureAgentsAppSdkClientProvider: seams.agentsProvider,
}))
vi.mock('@sdkwork/agents-pc-core/sdk/memoryAppSdkClient', () => ({
  configureMemoryAppSdkClientProvider: seams.memoryProvider,
}))
vi.mock('@sdkwork/agents-pc-core/sdk/skillsAppSdkClient', () => ({
  configureSkillsAppSdkClientProvider: seams.skillsProvider,
}))
vi.mock('@sdkwork/agents-pc-core/sdk/voiceAppSdkClient', () => ({
  initVoiceAppSdkClient: seams.voiceInit,
}))
vi.mock('@sdkwork/agents-pc-core/sdk/knowledgebaseAppSdkClient', () => ({
  initKnowledgebaseAppSdkClient: seams.knowledgebaseInit,
}))
vi.mock('@sdkwork/agents-pc-core/sdk/driveAppSdkClient', () => ({
  configureDriveAppSdkClientProvider: seams.driveProvider,
  // The create surface's Drive upload service instantiates at module load
  // with this getter as its default dependency.
  getDriveAppSdkClientWithSession: vi.fn(),
}))
vi.mock('@sdkwork/agents-pc-agents/create', () => ({
  createKnowledgebaseSelectionAdapter: (client: unknown) => ({ client }),
  configureKnowledgeSelectionAdapter: seams.knowledgeAdapter,
}))
vi.mock('@sdkwork/agents-pc-core/session', () => ({
  persistAppSdkSessionTokens: (session: unknown) => { seams.persisted.push(session) },
  clearAppSdkSessionTokens: () => { seams.cleared += 1 },
  createSdkworkChatRequestContextInterceptors: () => ({ request: ['context'] }),
}))
vi.mock('@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager', () => ({
  syncSdkworkGlobalTokenManager: (session: unknown, staticToken: string) => {
    seams.tokenSync.push([session, staticToken])
  },
  getSdkworkGlobalTokenManager: () => 'token-manager',
}))
vi.mock('@deepseek-ai/dsh-client-ui-sdkwork-iam/client', () => ({
  createSignInRequestInterceptor: () => 'sign-in-gate',
}))
vi.mock('@sdkwork/i18n-pc-react', () => ({
  defineSdkworkI18nRuntimeConfig: (config: unknown) => config,
  SdkworkI18nProvider: () => null,
}))
vi.mock('@sdkwork/agents-pc-commons/i18n', () => ({
  agentsWorkbenchI18nCatalogs: [],
}))
// The generated client factories are stubbed so a registered provider can be
// invoked in a test and hand back the config it closes over.
vi.mock('@sdkwork/agents-app-sdk', () => ({
  createClient: (config: unknown) => ({ kind: 'agents', config }),
}))
vi.mock('@sdkwork/memory-app-sdk', () => ({
  createClient: (config: unknown) => ({ kind: 'memory', config }),
}))
vi.mock('@sdkwork/voice-app-sdk', () => ({
  createClient: (config: unknown) => ({ kind: 'voice', config }),
}))
vi.mock('@sdkwork/skills-app-sdk', () => ({
  createClient: (config: unknown) => ({ kind: 'skills', config }),
}))
vi.mock('@sdkwork/knowledgebase-app-sdk', () => ({
  createClient: (config: unknown) => ({ kind: 'knowledgebase', config }),
}))
vi.mock('@sdkwork/drive-app-sdk', () => ({
  createClient: (config: unknown) => ({ kind: 'drive', config }),
}))

import {
  configureExpertsCreateHost,
  createExpertsCreateHostRuntime,
  createExpertsInterceptors,
  loadAgentsCreateModule,
  normalizeExpertsGatewayBaseUrl,
  readExpertsCreateAdapter,
  toExpertsSession,
  type ConfigureExpertsCreateHostOptions,
  type ExpertsCreateHostIam,
} from '../src/client/expertsHost.tsx'
import type { MarketsHostEnvironment, MarketsHostLocale, MarketsHostSession } from '../src/client/marketsHost.ts'

/** Build the option set the plugin apply() would pass, with recorded seams. */
function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: MarketsHostSession | null
  language?: string
}): ConfigureExpertsCreateHostOptions & {
  fireEnvironment(): void
  fireIam(): void
  readSession(): MarketsHostSession | null
} {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  const currentSession = initial.session ?? null
  const env: MarketsHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? '',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const iam = {
    isSignedIn: () => currentSession !== null,
    requestSignIn: async () => true,
    requireSignedIn: async () => {},
    controller: {
      getState: () => ({ session: currentSession }),
      subscribe: (listener: () => void) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
  } satisfies ExpertsCreateHostIam
  const locale: MarketsHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: () => () => {},
  }
  const theme = {
    getColorScheme: () => 'light' as const,
    subscribe: () => () => {},
  }
  return {
    env, iam, locale, theme,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    readSession: () => currentSession,
  }
}

/** Reset the recorded seam calls between tests. */
function resetSeams(): void {
  seams.agentsProvider.mockClear()
  seams.memoryProvider.mockClear()
  seams.skillsProvider.mockClear()
  seams.voiceInit.mockClear()
  seams.knowledgebaseInit.mockClear()
  seams.knowledgeAdapter.mockClear()
  seams.driveProvider.mockClear()
  seams.persisted.length = 0
  seams.cleared = 0
  seams.tokenSync.length = 0
}

describe('normalizeExpertsGatewayBaseUrl', () => {
  it('strips trailing slashes and a duplicated app API suffix', () => {
    expect(normalizeExpertsGatewayBaseUrl('https://gw.example/')).toBe('https://gw.example')
    expect(normalizeExpertsGatewayBaseUrl('https://gw.example/app/v3/api')).toBe('https://gw.example')
    expect(normalizeExpertsGatewayBaseUrl('https://gw.example/app/v3/api/')).toBe('https://gw.example')
    expect(normalizeExpertsGatewayBaseUrl('https://gw.example')).toBe('https://gw.example')
  })
})

describe('toExpertsSession', () => {
  it('maps credentials and the user profile, trimming tokens', () => {
    expect(toExpertsSession({
      accessToken: ' access ',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada' },
    }, '')).toEqual({
      authToken: 'auth',
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada' },
    })
  })

  it('derives the user id when the profile object carries one', () => {
    expect(toExpertsSession({ user: { id: 'u1' } }, 'static')).toEqual({
      accessToken: 'static',
      user: { id: 'u1' },
    })
  })

  it('keeps a non-id user object verbatim and falls back to the static token', () => {
    expect(toExpertsSession({ user: { displayName: 'Ada' } }, 'static')).toEqual({
      accessToken: 'static',
      user: { displayName: 'Ada' },
    })
    expect(toExpertsSession(null, ' static ')).toEqual({ accessToken: 'static' })
  })

  it('returns null when neither session nor static token carries credentials', () => {
    expect(toExpertsSession(null, '')).toBeNull()
  })
})

describe('createExpertsInterceptors', () => {
  it('appends the sign-in gate after the session-context chain', () => {
    const interceptors = createExpertsInterceptors(
      { isSignedIn: () => false, requireSignedIn: async () => {} },
      () => null,
    )
    expect(interceptors.request).toEqual(['context', 'sign-in-gate'])
  })
})

describe('ExpertsCreateHostRuntime', () => {
  it('reads as unconfigured without a gateway, clearing the session', () => {
    resetSeams()
    const h = harness({ baseUrl: '' })
    const runtime = createExpertsCreateHostRuntime(h)
    expect(runtime.getSnapshot()).toEqual({ configured: false })
    runtime.start()
    expect(seams.cleared).toBe(1)
    expect(seams.agentsProvider).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('registers one provider per SDK client from the normalized gateway', () => {
    resetSeams()
    const h = harness({ baseUrl: 'https://gw.example/app/v3/api/' })
    const runtime = createExpertsCreateHostRuntime(h)
    expect(runtime.getSnapshot()).toEqual({ configured: true })
    runtime.start()
    expect(seams.agentsProvider).toHaveBeenCalledTimes(1)
    // Invoking a registered provider resolves the config it closed over.
    const agentsProvider = seams.agentsProvider.mock.calls[0]?.[0] as () => { config: { baseUrl: string } }
    expect(agentsProvider().config.baseUrl).toBe('https://gw.example')
    const memoryProvider = seams.memoryProvider.mock.calls[0]?.[0] as () => { config: { baseUrl: string } }
    expect(memoryProvider().config.baseUrl).toBe('https://gw.example')
    expect(seams.skillsProvider).toHaveBeenCalledTimes(1)
    expect(seams.voiceInit).toHaveBeenCalledTimes(1)
    expect(seams.voiceInit.mock.calls[0]?.[0]).toMatchObject({ baseUrl: 'https://gw.example' })
    expect(seams.knowledgebaseInit).toHaveBeenCalledTimes(1)
    // The drive client keeps the app API suffix and the dual-token auth mode.
    const driveProvider = seams.driveProvider.mock.calls[0]?.[0] as () => { config: { baseUrl: string; authMode: string } }
    expect(driveProvider().config.baseUrl).toBe('https://gw.example/app/v3/api')
    expect(driveProvider().config.authMode).toBe('dual-token')
    runtime.dispose()
  })

  it('binds the knowledge selection adapter when the create surface loads', async () => {
    resetSeams()
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createExpertsCreateHostRuntime(h)
    runtime.start()
    expect(seams.knowledgeAdapter).not.toHaveBeenCalled()
    // The first barrel load binds the adapter to the initialized client.
    const firstClient = seams.knowledgebaseInit.mock.results.at(-1)?.value as { call: number } | undefined
    await loadAgentsCreateModule()
    expect(seams.knowledgeAdapter).toHaveBeenCalledTimes(1)
    expect(seams.knowledgeAdapter).toHaveBeenCalledWith({ client: firstClient })
    // A re-load with the same client does not re-bind.
    await loadAgentsCreateModule()
    expect(seams.knowledgeAdapter).toHaveBeenCalledTimes(1)
    // An environment change re-initializes the client; the next load re-binds
    // to the new instance, never the old one.
    h.env.apiBaseUrl = () => 'https://other.example'
    h.fireEnvironment()
    const secondClient = seams.knowledgebaseInit.mock.results.at(-1)?.value as { call: number } | undefined
    expect(secondClient).not.toBe(firstClient)
    await loadAgentsCreateModule()
    expect(seams.knowledgeAdapter).toHaveBeenCalledTimes(2)
    expect(seams.knowledgeAdapter).toHaveBeenLastCalledWith({ client: secondClient })
    runtime.dispose()
  })

  it('persists the session tokens only when both tokens exist', () => {
    resetSeams()
    const signedIn = harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'access', authToken: 'auth', user: { id: 'u1' } },
    })
    const runtime = createExpertsCreateHostRuntime(signedIn)
    runtime.start()
    expect(seams.persisted).toEqual([{
      authToken: 'auth',
      accessToken: 'access',
      user: { id: 'u1' },
    }])
    runtime.dispose()

    resetSeams()
    const anonymous = harness({ baseUrl: 'https://gw.example' })
    const anonymousRuntime = createExpertsCreateHostRuntime(anonymous)
    anonymousRuntime.start()
    expect(seams.persisted).toEqual([])
    expect(seams.cleared).toBe(1)
    anonymousRuntime.dispose()
  })

  it('re-derives clients and readiness when the environment changes', () => {
    resetSeams()
    const h = harness({ baseUrl: '' })
    const runtime = createExpertsCreateHostRuntime(h)
    const listener = vi.fn()
    const stop = runtime.start()
    runtime.subscribe(listener)
    expect(runtime.getSnapshot()).toEqual({ configured: false })
    h.env.apiBaseUrl = () => 'https://gw.example'
    h.fireEnvironment()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(runtime.getSnapshot()).toEqual({ configured: true })
    expect(seams.agentsProvider).toHaveBeenCalledTimes(1)
    stop()
    h.fireEnvironment()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('resolves the SDKWork locale tag from the host locale', () => {
    const zh = createExpertsCreateHostRuntime(harness({ baseUrl: 'https://gw.example', language: 'zh' }))
    expect(zh.resolveHostLanguage()).toBe('zh-CN')
    const en = createExpertsCreateHostRuntime(harness({ baseUrl: 'https://gw.example', language: 'en' }))
    expect(en.resolveHostLanguage()).toBe('en-US')
  })

  it('exposes the last configured adapter and clears it on disposal', () => {
    resetSeams()
    expect(readExpertsCreateAdapter()).toBeUndefined()
    const adapter = configureExpertsCreateHost(harness({ baseUrl: 'https://gw.example' }))
    expect(readExpertsCreateAdapter()).toBeDefined()
    adapter.dispose()
    expect(readExpertsCreateAdapter()).toBeUndefined()
  })
})
