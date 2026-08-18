import { createClient } from '@sdkwork/agents-app-sdk'
import { createTokenManager, type AuthTokenManager } from '@sdkwork/sdk-common'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'

/** One generated media asset surfaced by the library page. */
export interface GeneratedAssetItem {
  /** The media tool id that produced the asset. */
  toolId: string
  /** The tool invocation id that produced the asset. */
  toolCallId: string
  /** The media kind reported by the tool output (image, video, audio, …). */
  mediaKind: string
  /** The canonical Drive URI of the persisted asset. */
  driveUri: string
  /** The original provider media URL from the tool result, when still present. */
  sourceUrl?: string
  /** RFC3339 creation time of the asset record, when reported. */
  createdAt?: string
}

/**
 * Stable observable assets snapshot. `items` always mirrors the committed
 * request result so the page can re-render filters without refetching.
 */
export type AssetsSnapshot =
  | { status: 'unconfigured'; items: readonly [] }
  | { status: 'idle'; items: readonly [] }
  | { status: 'loading'; items: readonly [] }
  | { status: 'ready'; items: readonly GeneratedAssetItem[] }
  | { status: 'error'; items: readonly [] }

/** IAM session fields adopted by assets requests. */
export interface AssetsIamSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** IAM service subset consumed by the generated-assets mode. */
export interface AssetsIamService {
  controller: {
    /** @returns the current authenticated session, when present. */
    getState(): { session: AssetsIamSession | null }
    /** @param listener - notified when the session changes. @returns the disposer. */
    subscribe(listener: () => void): () => void
  }
}

/** The agents media-tool client face consumed by this plugin. */
interface AgentsAssetsClient {
  ai: {
    agents: {
      assets: {
        /** List generated media assets persisted to Drive. */
        list(): Promise<unknown>
      }
    }
  }
}

const UNCONFIGURED: AssetsSnapshot = Object.freeze({
  status: 'unconfigured', items: [] as const,
})

/**
 * SDKWork Agents generated-assets adapter for the host environment and IAM
 * session: lists the media assets persisted by agents tool invocations
 * through the generated `@sdkwork/agents-app-sdk` client and publishes a
 * stable snapshot per request.
 */
export class AssetsService {
  private readonly env: EnvService
  private readonly iam: AssetsIamService
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private client: AgentsAssetsClient | undefined
  private clientBaseUrl: string | undefined
  private snapshot: AssetsSnapshot
  private requestVersion = 0

  constructor(env: EnvService, iam: AssetsIamService) {
    this.env = env
    this.iam = iam
    this.tokenManager = createTokenManager()
    this.snapshot = env.isConfigured()
      ? Object.freeze({ status: 'idle', items: [] as const })
      : UNCONFIGURED
  }

  /**
   * Read the assets state without replacing its stable reference.
   * @returns the current stable assets snapshot.
   */
  getSnapshot(): AssetsSnapshot {
    return this.snapshot
  }

  /**
   * Observe assets state changes.
   * @param listener - notified after a snapshot replacement.
   * @returns the disposer.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Start environment and IAM synchronization for the plugin lifetime.
   * @returns the disposer for all host-source subscriptions.
   */
  start(): () => void {
    this.syncTokens()
    const offEnv = this.env.subscribe(() => { this.onEnvironmentChange() })
    const offIam = this.iam.controller.subscribe(() => { this.onCredentialsChange() })
    return () => {
      offEnv()
      offIam()
      this.requestVersion += 1
    }
  }

  /**
   * Load the generated-assets list through the agents media-tool channel.
   * @returns a promise that settles after the active request publishes or
   * becomes stale.
   */
  async load(): Promise<void> {
    if (!this.env.isConfigured()) {
      this.publish(UNCONFIGURED)
      return
    }
    const version = ++this.requestVersion
    this.publish({ status: 'loading', items: [] })
    try {
      this.syncTokens()
      const client = this.readClient()
      const items = await client.ai.agents.assets.list()
      if (version !== this.requestVersion) return
      this.publish({ status: 'ready', items: this.toItems(items) })
    } catch {
      if (version !== this.requestVersion) return
      this.publish({ status: 'error', items: [] })
    }
  }

  private onEnvironmentChange(): void {
    this.client = undefined
    this.clientBaseUrl = undefined
    this.requestVersion += 1
    this.syncTokens()
    this.publish(this.env.isConfigured()
      ? { status: 'idle', items: [] }
      : UNCONFIGURED)
  }

  private onCredentialsChange(): void {
    if (this.env.accessToken().trim() !== '') return
    this.requestVersion += 1
    this.syncTokens()
    this.publish(this.env.isConfigured()
      ? { status: 'idle', items: [] }
      : UNCONFIGURED)
  }

  private readClient(): AgentsAssetsClient {
    const baseUrl = this.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-generations-assets: baseUrl is not configured')
    if (this.client === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.client = createClient({ baseUrl, tokenManager: this.tokenManager })
    }
    return this.client
  }

  private syncTokens(): void {
    const envToken = this.env.accessToken().trim()
    if (envToken !== '') {
      this.tokenManager.clearTokens()
      this.tokenManager.setAccessToken(envToken)
      return
    }
    const session = this.iam.controller.getState().session
    if (session === null) {
      this.tokenManager.clearTokens()
      return
    }
    this.tokenManager.clearTokens()
    this.tokenManager.setTokens({
      ...(session.accessToken === undefined ? {} : { accessToken: session.accessToken }),
      ...(session.authToken === undefined ? {} : { authToken: session.authToken }),
      ...(session.refreshToken === undefined ? {} : { refreshToken: session.refreshToken }),
    })
  }

  private toItems(items: unknown): GeneratedAssetItem[] {
    if (!Array.isArray(items)) return []
    return items.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return []
      const record = item as Record<string, unknown>
      const toolId = record.toolId
      const toolCallId = record.toolCallId
      const mediaKind = record.mediaKind
      const driveUri = record.driveUri
      if (
        typeof toolId !== 'string'
        || typeof toolCallId !== 'string'
        || typeof mediaKind !== 'string'
        || typeof driveUri !== 'string'
      ) {
        return []
      }
      const sourceUrl = record.sourceUrl
      const createdAt = record.createdAt
      return [{
        toolId,
        toolCallId,
        mediaKind,
        driveUri,
        ...(typeof sourceUrl === 'string' && sourceUrl !== '' ? { sourceUrl } : {}),
        ...(typeof createdAt === 'string' && createdAt !== '' ? { createdAt } : {}),
      }]
    })
  }

  private publish(snapshot: AssetsSnapshot): void {
    this.snapshot = Object.freeze(snapshot)
    for (const listener of this.listeners) listener()
  }
}
