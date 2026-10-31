/**
 * BirdCoder host adapter for the SDKWork Agents create-expert flow.
 *
 * The adapter owns generated client construction and maps the shared
 * ui-sdkwork-env and ui-sdkwork-iam services to the Agents PC session store and
 * SDK client providers, so the embedded basic-info dialog ({@link
 * ExpertsCreateDialog}) and the agent editor ({@link ExpertsCreateEditor}) run
 * against the active gateway exactly as they do in the standalone Agents PC
 * app. Environment changes re-derive every client; IAM changes propagate
 * through the session bridge, and a request fired while signed out is held at
 * the transport gate until the sign-in overlay resolves.
 *
 * The adapter is also the readiness source for the create affordance: without
 * a configured gateway no client can be built, and the my-experts page keeps
 * the remote-expert row disabled instead of opening a flow that can only fail.
 */
import { Suspense, createElement, lazy, useSyncExternalStore, type ReactNode } from 'react'
import {
  defineSdkworkI18nRuntimeConfig,
  SdkworkI18nProvider,
} from '@sdkwork/i18n-pc-react'
import { agentsWorkbenchI18nCatalogs } from '@sdkwork/agents-pc-commons/i18n'
import {
  configureAgentsAppSdkClientProvider,
  type SdkworkAgentsAppClientConfig,
} from '@sdkwork/agents-pc-core/sdk/agentsAppSdkClient'
import {
  configureDriveAppSdkClientProvider,
  type SdkworkAgentsDriveAppClientConfig,
} from '@sdkwork/agents-pc-core/sdk/driveAppSdkClient'
import {
  initKnowledgebaseAppSdkClient,
  type SdkworkKnowledgebaseAppClient,
  type SdkworkKnowledgebaseAppClientConfig,
} from '@sdkwork/agents-pc-core/sdk/knowledgebaseAppSdkClient'
import {
  configureMemoryAppSdkClientProvider,
  type SdkworkAgentsMemoryAppClientConfig,
} from '@sdkwork/agents-pc-core/sdk/memoryAppSdkClient'
import {
  initVoiceAppSdkClient,
  type SdkworkVoiceAppClientConfig,
} from '@sdkwork/agents-pc-core/sdk/voiceAppSdkClient'
import {
  configureSkillsAppSdkClientProvider,
  type SdkworkSkillsAppClientConfig,
} from '@sdkwork/agents-pc-core/sdk/skillsAppSdkClient'
import {
  clearAppSdkSessionTokens,
  createSdkworkChatRequestContextInterceptors,
  persistAppSdkSessionTokens,
  type SdkworkChatSession,
} from '@sdkwork/agents-pc-core/session'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  createSignInRequestInterceptor,
  type SdkworkSignInRequirement,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { splitBaseUrls, type Interceptors } from '@sdkwork/sdk-common'
import { createClient as createAgentsClient } from '@sdkwork/agents-app-sdk'
import { createClient as createDriveClient } from '@sdkwork/drive-app-sdk'
import { createClient as createMemoryClient } from '@sdkwork/memory-app-sdk'
import { createClient as createSkillsClient } from '@sdkwork/skills-app-sdk'
import type { MarketsHostEnvironment, MarketsHostIam, MarketsHostLocale, MarketsHostSession } from './marketsHost.ts'
import { SdkworkHostThemeSurface, type HostThemeBridge } from './sdkworkHostThemeSurface.tsx'
import type { MarketsKey } from './locales.ts'
import '../../../../../../sdkwork-agents/apps/sdkwork-agents-pc/src/index.css'

/* jscpd:ignore-start -- the SDKWork host adapter is one deliberate template
   shared with marketsHost.ts and the other SDKWork surface packages:
   cross-package value imports are forbidden by the client-bundle purity gate,
   so each SDKWork surface package owns a copy of the session/port adaptation. */

// Both create-flow faces load from the capability package's curated create
// surface on first use: the static graph of this module stays free of the
// editor's dependency closure (chat input, model and memory pickers), the
// root barrel's chat and home surfaces stay out of the bundle, and hosts
// that never open the flow never pay for it.
const CreateAgentModal = lazy(async () => {
  const module = await loadAgentsCreateModule()
  return { default: module.CreateAgentModal }
})

const CreateAgentView = lazy(async () => {
  const module = await loadAgentsCreateModule()
  return { default: module.CreateAgentView }
})

const APP_API_SUFFIX = '/app/v3/api'

// The knowledgebase client the selection adapter must be bound to. The
// adapter lives inside the capability package, so the binding happens when
// its create surface loads — the adapter state has to be configured in the
// package's own module registry, and this module never imports that surface
// statically (its graph reaches the editor's UI closure).
let knowledgebaseClient: SdkworkKnowledgebaseAppClient | undefined
let wiredKnowledgeClient: unknown

/**
 * Load the capability package's create surface and bind the knowledge
 * selection adapter to the current knowledgebase client. The editor's
 * knowledge panel reads the adapter through the package's own module state,
 * so the binding must run against the same module instance the components
 * came from; the `wired` marker re-binds after every environment change
 * re-initialized the client.
 */
export async function loadAgentsCreateModule(): Promise<typeof import('@sdkwork/agents-pc-agents/create')> {
  const module = await import('@sdkwork/agents-pc-agents/create')
  if (knowledgebaseClient !== undefined && wiredKnowledgeClient !== knowledgebaseClient) {
    module.configureKnowledgeSelectionAdapter(module.createKnowledgebaseSelectionAdapter(knowledgebaseClient))
    wiredKnowledgeClient = knowledgebaseClient
  }
  return module
}

const expertsI18nRuntimeConfig = defineSdkworkI18nRuntimeConfig({
  activeLocales: ['en-US', 'zh-CN'],
  defaultLocale: 'en-US',
  fallbackLocale: 'en-US',
  loadingStrategy: 'eager-core-lazy-feature',
  supportedLocales: ['en-US', 'zh-CN'],
})

/**
 * The IAM face the create flow's transport gate needs: the market adapter's
 * controller face plus the deferred sign-in requirement.
 */
export type ExpertsCreateHostIam = MarketsHostIam & SdkworkSignInRequirement

/** Minimal theme runtime consumed by the adapter (the market page's bridge). */
type ExpertsCreateHostTheme = HostThemeBridge

/** Dependencies used to configure the SDKWork create-expert surface. */
export interface ConfigureExpertsCreateHostOptions {
  /** The environment values are shared with the market host adapter. */
  env: MarketsHostEnvironment
  /** The IAM session and the deferred sign-in requirement. */
  iam: ExpertsCreateHostIam
  /** The active BirdCoder locale runtime. */
  locale: MarketsHostLocale
  /** The resolved host color scheme bridge. */
  theme: ExpertsCreateHostTheme
}

/**
 * Normalize the gateway origin for SDKWork app clients.
 * @param baseUrl - active API gateway origin from ui-sdkwork-env.
 * @returns the gateway root without a duplicated app API suffix.
 */
export function normalizeExpertsGatewayBaseUrl(baseUrl: string): string {
  const [candidate = ''] = splitBaseUrls(baseUrl)
  const normalized = candidate.trim().replace(/\/+$/u, '')
  if (normalized.endsWith(APP_API_SUFFIX)) {
    return normalized.slice(0, -APP_API_SUFFIX.length) || normalized
  }
  return normalized
}

function readHostUserId(session: MarketsHostSession | null | undefined): string | undefined {
  if (typeof session?.user !== 'object' || session.user === null || !('id' in session.user)) return undefined
  return typeof session.user.id === 'string' ? session.user.id.trim() : undefined
}

/**
 * Convert the host IAM state into the Agents PC session format.
 * Identity fields are resolved inside Agents PC from JWT claims; the host
 * forwards credentials only and lets session tokens supersede env bootstrap.
 * @param session - current host IAM session, or null when signed out.
 * @param staticAccessToken - ui-sdkwork-env access token used by non-interactive deployments.
 * @returns a credential snapshot, or null when no tokens are available.
 */
export function toExpertsSession(
  session: MarketsHostSession | null,
  staticAccessToken: string,
): SdkworkChatSession | null {
  const staticToken = staticAccessToken.trim()
  const iamAccessToken = session?.accessToken?.trim()
  const authToken = session?.authToken?.trim()
  const refreshToken = session?.refreshToken?.trim()
  const accessToken = iamAccessToken || staticToken
  if (!accessToken && !authToken && !refreshToken) return null

  const userId = readHostUserId(session)
  const user = userId === undefined
    ? (typeof session?.user === 'object' && session.user !== null ? session.user : undefined)
    : (typeof session?.user === 'object' && session.user !== null && 'id' in session.user
      ? session.user
      : { id: userId })

  return {
    ...(authToken ? { authToken } : {}),
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(session?.sessionId === undefined ? {} : { sessionId: session.sessionId }),
    ...(user === undefined ? {} : { user }),
  }
}

/**
 * Build the request chain shared by every embedded SDK client: the Agents PC
 * session-context interceptors plus the fork's deferred sign-in gate, which
 * runs last so a flagged request is suspended inside the SDK's own interceptor
 * chain until the sign-in overlay resolves.
 * @param signIn - the IAM session requirement (`ctx.iam`).
 * @param readSession - reads the current session for the context interceptors.
 * @returns the interceptor set handed to the generated SDK clients.
 */
export function createExpertsInterceptors(
  signIn: Pick<SdkworkSignInRequirement, 'isSignedIn' | 'requireSignedIn'>,
  readSession: () => SdkworkChatSession | null,
): Interceptors {
  const base = createSdkworkChatRequestContextInterceptors(readSession)
  return {
    ...base,
    request: [...base.request, createSignInRequestInterceptor(signIn)],
  }
}

/** Snapshot consumed by the embedded create-flow renderer. */
export interface ExpertsCreateHostSnapshot {
  /** Whether a gateway is configured and the create flow can run. */
  configured: boolean
}

/** Lifecycle handle returned after configuring the create-expert host. */
export interface ExpertsCreateHostAdapter {
  /** Dispose environment and IAM subscriptions. */
  dispose(): void
}

/** Observable host-adapter operations used by focused integration tests. */
export interface ExpertsCreateHostRuntime extends ExpertsCreateHostAdapter {
  /** Start environment and IAM subscriptions. */
  start(): () => void
  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void
  /** @returns the readiness snapshot for the create affordance. */
  getSnapshot(): ExpertsCreateHostSnapshot
  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string
  /** @returns the host theme bridge for the embedded create surfaces. */
  readThemeBridge(): HostThemeBridge
}

/** Host adapter implementation and SDKWork client owner. */
class ExpertsCreateHostRuntimeImpl implements ExpertsCreateHostRuntime {
  private readonly listeners = new Set<() => void>()
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  constructor(private readonly options: ConfigureExpertsCreateHostOptions) {}

  /** Start subscriptions and return the disposer for the plugin effect. */
  start(): () => void {
    this.syncSessionAndClients()
    this.offEnvironment = this.options.env.subscribe(() => {
      this.syncSessionAndClients()
      this.publish()
    })
    this.offIam = this.options.iam.controller.subscribe(() => {
      this.syncSessionAndClients()
      this.publish()
    })
    return () => { this.dispose() }
  }

  /** Register a listener for adapter changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns the readiness snapshot for the create affordance. */
  getSnapshot(): ExpertsCreateHostSnapshot {
    return { configured: this.readBaseUrl() !== '' }
  }

  /** @returns the active SDKWork locale tag. */
  resolveHostLanguage(): string {
    return this.options.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US'
  }

  /** @returns the host theme bridge for the embedded create surfaces. */
  readThemeBridge(): HostThemeBridge {
    return this.options.theme
  }

  /** Dispose subscriptions and prevent later adapter notifications. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.offEnvironment = undefined
    this.offIam = undefined
    this.listeners.clear()
    if (activeAdapter === this) activeAdapter = undefined
  }

  private readBaseUrl(): string {
    return normalizeExpertsGatewayBaseUrl(this.options.env.apiBaseUrl())
  }

  private publish(): void {
    /* v8 ignore next 2 -- disposed guard: dispose() unsubscribes all
       sources first, so no callback can reach publish after disposal. */
    if (this.disposed) return
    for (const listener of this.listeners) listener()
  }

  private syncSessionAndClients(): void {
    const baseUrl = this.readBaseUrl()
    if (baseUrl === '') {
      clearAppSdkSessionTokens()
      syncSdkworkGlobalTokenManager(null, '')
      return
    }

    const iamSession = this.options.iam.controller.getState().session
    const staticAccessToken = this.options.env.accessToken().trim()
    const session = toExpertsSession(iamSession, staticAccessToken)
    syncSdkworkGlobalTokenManager(iamSession, staticAccessToken)
    const tokenManager = getSdkworkGlobalTokenManager()
    const readSession = (): SdkworkChatSession | null => toExpertsSession(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )

    if (session?.authToken && session.accessToken) {
      try {
        persistAppSdkSessionTokens(session)
      } catch {
        clearAppSdkSessionTokens()
      }
    } else {
      clearAppSdkSessionTokens()
    }

    const interceptors = createExpertsInterceptors(this.options.iam, readSession)
    // The client configs are built as typed variables, not inline literals:
    // the generated `createClient` parameters type the base config, so an
    // inline literal carrying `interceptors` would fail the excess-property
    // check even though the extended config types accept it.
    const agentsConfig: SdkworkAgentsAppClientConfig = { baseUrl, platform: 'pc', tokenManager, interceptors }
    const memoryConfig: SdkworkAgentsMemoryAppClientConfig = { baseUrl, platform: 'pc', tokenManager, interceptors }
    const skillsConfig: SdkworkSkillsAppClientConfig = { baseUrl, platform: 'pc', tokenManager, interceptors }
    const voiceConfig: SdkworkVoiceAppClientConfig = { baseUrl, platform: 'pc', tokenManager, interceptors }
    const knowledgebaseConfig: SdkworkKnowledgebaseAppClientConfig = { baseUrl, platform: 'pc', tokenManager, interceptors }
    configureAgentsAppSdkClientProvider(() => createAgentsClient(agentsConfig))
    configureMemoryAppSdkClientProvider(() => createMemoryClient(memoryConfig))
    configureSkillsAppSdkClientProvider(() => createSkillsClient(skillsConfig))
    // The voice and knowledgebase clients have no provider seam: the singleton
    // is re-initialized per sync, and `getXxxAppSdkClient()` keeps returning it
    // until the next environment change replaces it.
    initVoiceAppSdkClient(voiceConfig)
    knowledgebaseClient = initKnowledgebaseAppSdkClient(knowledgebaseConfig)
    const driveConfig: SdkworkAgentsDriveAppClientConfig = {
      baseUrl: `${baseUrl}${APP_API_SUFFIX}`,
      authMode: 'dual-token',
      platform: 'pc',
      tokenManager,
      interceptors,
    }
    configureDriveAppSdkClientProvider(() => createDriveClient(driveConfig))
  }
}

let activeAdapter: ExpertsCreateHostRuntimeImpl | undefined

/** Configure the SDKWork client providers for the embedded create-expert flow. */
export function configureExpertsCreateHost(options: ConfigureExpertsCreateHostOptions): ExpertsCreateHostAdapter {
  activeAdapter?.dispose()
  const adapter = new ExpertsCreateHostRuntimeImpl(options)
  activeAdapter = adapter
  adapter.start()
  return adapter
}

/** Build an unconfigured adapter for focused host-bridge tests. */
export function createExpertsCreateHostRuntime(
  options: ConfigureExpertsCreateHostOptions,
): ExpertsCreateHostRuntime {
  return new ExpertsCreateHostRuntimeImpl(options)
}

/** @returns the configured create-flow adapter, or undefined before `apply()`. */
export function readExpertsCreateAdapter(): ExpertsCreateHostRuntime | undefined {
  return activeAdapter
}

/** Subscribe seat for the readiness hook (no adapter reads as unconfigured). */
function subscribeConfigured(listener: () => void): () => void {
  return activeAdapter?.subscribe(listener) ?? (() => {})
}

function readConfigured(): boolean {
  return activeAdapter?.getSnapshot().configured ?? false
}

/**
 * @returns whether the create-expert flow has a configured gateway. Renders
 * `false` before the plugin effect configures the adapter, so the my-experts
 * page can keep the remote row disabled instead of opening a flow that fails.
 */
export function useExpertsCreateConfigured(): boolean {
  return useSyncExternalStore(subscribeConfigured, readConfigured, readConfigured)
}

/** Props for the embedded basic-info dialog. */
export interface ExpertsCreateDialogProps {
  /** Close the dialog without creating an expert. */
  onClose: () => void
  /** Enter the editor with the created agent (undefined keeps the dialog's own fate). */
  onSuccess: (agentId?: string) => void
}

/**
 * Render the SDKWork Agents basic-info dialog (name, avatar, type, summary)
 * under the host theme and the Agents PC i18n runtime. The modal's 下一步
 * creates the agent through the configured `agentService` and hands its id to
 * {@link ExpertsCreateDialogProps.onSuccess}.
 * @param props - the dialog's close and success callbacks.
 * @returns the dialog element tree.
 */
export function ExpertsCreateDialog({ onClose, onSuccess }: ExpertsCreateDialogProps): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-sdkwork-markets: SDKWork experts create host runtime is not configured')
  }
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: 'experts-create' },
    createElement(
      SdkworkI18nProvider,
      {
        catalogs: agentsWorkbenchI18nCatalogs,
        config: expertsI18nRuntimeConfig,
        locale: adapter.resolveHostLanguage(),
        syncDocumentLanguage: false,
      },
      createElement(
        Suspense,
        { fallback: null },
        createElement(CreateAgentModal, { isOpen: true, onClose, onSuccess }),
      ),
    ),
  )
}

/** Props for the embedded agent editor. */
export interface ExpertsCreateEditorProps {
  /** The created agent's id; the editor loads and completes its configuration. */
  agentId?: string
  /** Leave the editor (back control and post-publish) and return to the roster. */
  onBack: () => void
  /** The Markets locale seat (the editor's loading copy is fork-owned). */
  t: (key: MarketsKey) => string
}

/**
 * Render the SDKWork Agents editor — system prompt, model, memory, capability
 * panels, and the preview chat — as the my-experts page's full-body view, under
 * the host theme and the Agents PC i18n runtime. The editor is code-split: the
 * first remote-expert creation pays the chunk once, then it stays warm.
 * @param props - the created agent id, the exit control, and the locale seat.
 * @returns the editor element tree.
 */
export function ExpertsCreateEditor({ agentId, onBack, t }: ExpertsCreateEditorProps): ReactNode {
  const adapter = activeAdapter
  if (adapter === undefined) {
    throw new Error('ui-sdkwork-markets: SDKWork experts create host runtime is not configured')
  }
  const locale = adapter.resolveHostLanguage()
  return createElement(
    SdkworkHostThemeSurface,
    { theme: adapter.readThemeBridge(), surface: 'experts-create' },
    createElement(
      SdkworkI18nProvider,
      {
        key: locale,
        catalogs: agentsWorkbenchI18nCatalogs,
        config: expertsI18nRuntimeConfig,
        locale,
        syncDocumentLanguage: false,
      },
      createElement(
        Suspense,
        { fallback: createElement('div', { className: 'flex h-full items-center justify-center text-sm text-zinc-500' }, t('mine.experts.editor.loading')) },
        createElement(CreateAgentView, { initialAgentId: agentId, onBack }),
      ),
    ),
  )
}
/* jscpd:ignore-end */
