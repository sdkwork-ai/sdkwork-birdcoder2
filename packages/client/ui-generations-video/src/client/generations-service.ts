import { createClient } from '@sdkwork/agents-app-sdk'
import { createTokenManager, type AuthTokenManager } from '@sdkwork/sdk-common'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'

/** One generated video surfaced by the page. */
export interface VideoGenerationResult {
  /** Provider asset URL of the generated video. */
  url: string
}

/**
 * Stable observable generation snapshot. `prompt` mirrors the committed
 * request prompt so the page can restore the draft and retry the same request.
 */
export type VideoGenerationSnapshot =
  | { status: 'unconfigured'; prompt: string; results: readonly VideoGenerationResult[] }
  | { status: 'idle'; prompt: string; results: readonly VideoGenerationResult[] }
  | { status: 'generating'; prompt: string; results: readonly VideoGenerationResult[] }
  | { status: 'ready'; prompt: string; results: readonly VideoGenerationResult[] }
  | { status: 'error'; prompt: string; results: readonly VideoGenerationResult[] }

/** IAM session fields adopted by generation requests. */
export interface GenerationIamSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** IAM service subset consumed by the video generation mode. */
export interface GenerationIamService {
  controller: {
    /** @returns the current authenticated session, when present. */
    getState(): { session: GenerationIamSession | null }
    /** @param listener - notified when the session changes. @returns the disposer. */
    subscribe(listener: () => void): () => void
  }
}

const UNCONFIGURED: VideoGenerationSnapshot = Object.freeze({
  status: 'unconfigured', prompt: '', results: [] as const,
})

/** The text-to-video tool id owned by this plugin. */
const VIDEO_CREATE_TOOL = 'video.create'

/** The agents media-tool client face consumed by this plugin. */
interface AgentsToolsClient {
  ai: {
    agents: {
      tools: {
        /**
         * Invoke one media tool by id.
         * @param toolId - the media tool id.
         * @param body - tool arguments and optional drive persistence flag.
         * @returns the invocation response.
         */
        invoke(
          toolId: string,
          body: { arguments: Record<string, unknown>; saveToDrive?: boolean },
        ): Promise<{ output: Record<string, unknown> }>
      }
    }
  }
}
/** The async task retrieval tool paired with {@link VIDEO_CREATE_TOOL}. */
const VIDEO_RETRIEVE_TOOL = 'video.retrieve'
/** Delay between task-status polls. */
const VIDEO_POLL_INTERVAL_MS = 1500
/** Poll-attempt budget before a generation is reported as failed. */
const VIDEO_MAX_POLLS = 40

/**
 * SDKWork Agents video generation adapter for the host environment and IAM
 * session: starts the text-to-video tool, polls the async task through the
 * generated `@sdkwork/agents-app-sdk` client, and publishes a stable snapshot
 * per request.
 */
export class VideoGenerationsService {
  private readonly env: EnvService
  private readonly iam: GenerationIamService
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private client: AgentsToolsClient | undefined
  private clientBaseUrl: string | undefined
  private snapshot: VideoGenerationSnapshot
  private requestVersion = 0

  constructor(env: EnvService, iam: GenerationIamService) {
    this.env = env
    this.iam = iam
    this.tokenManager = createTokenManager()
    this.snapshot = env.isConfigured()
      ? Object.freeze({ status: 'idle', prompt: '', results: [] })
      : UNCONFIGURED
  }

  /**
   * Read the generation state without replacing its stable reference.
   * @returns the current stable generation snapshot.
   */
  getSnapshot(): VideoGenerationSnapshot {
    return this.snapshot
  }

  /**
   * Observe generation state changes.
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
   * Generate one video from a prompt through the agents media-tool channel,
   * polling the async task until it completes or fails.
   * @param prompt - the text prompt describing the desired video; the
   * committed prompt is reused when omitted.
   * @returns a promise that settles after the active request publishes or
   * becomes stale.
   */
  async generate(prompt = this.snapshot.prompt): Promise<void> {
    if (!this.env.isConfigured()) {
      this.publish(UNCONFIGURED)
      return
    }
    const normalizedPrompt = prompt.trim()
    const version = ++this.requestVersion
    this.publish({ status: 'generating', prompt: normalizedPrompt, results: [] })
    try {
      this.syncTokens()
      const client = this.readClient()
      const created = await client.ai.agents.tools.invoke(VIDEO_CREATE_TOOL, {
        arguments: {
          prompt: normalizedPrompt,
          model: 'default',
          seconds: 5,
          size: '1280x720',
        },
      })
      if (version !== this.requestVersion) return
      const taskId = this.readTaskId(created.output)
      if (taskId === undefined) {
        this.publish({ status: 'error', prompt: normalizedPrompt, results: [] })
        return
      }
      const url = await this.pollVideo(client, taskId, version)
      if (version !== this.requestVersion) return
      if (url === undefined) {
        this.publish({ status: 'error', prompt: normalizedPrompt, results: [] })
        return
      }
      this.publish({ status: 'ready', prompt: normalizedPrompt, results: [{ url }] })
    } catch {
      if (version !== this.requestVersion) return
      this.publish({ status: 'error', prompt: normalizedPrompt, results: [] })
    }
  }

  private onEnvironmentChange(): void {
    this.client = undefined
    this.clientBaseUrl = undefined
    this.requestVersion += 1
    this.syncTokens()
    this.publish(this.env.isConfigured()
      ? { status: 'idle', prompt: '', results: [] }
      : UNCONFIGURED)
  }

  private onCredentialsChange(): void {
    if (this.env.accessToken().trim() !== '') return
    this.requestVersion += 1
    this.syncTokens()
    this.publish(this.env.isConfigured()
      ? { status: 'idle', prompt: this.snapshot.prompt, results: [] }
      : UNCONFIGURED)
  }

  private async pollVideo(
    client: AgentsToolsClient,
    taskId: string,
    version: number,
  ): Promise<string | undefined> {
    for (let attempt = 0; attempt < VIDEO_MAX_POLLS; attempt += 1) {
      await this.delay(VIDEO_POLL_INTERVAL_MS)
      if (version !== this.requestVersion) return undefined
      const retrieved = await client.ai.agents.tools.invoke(VIDEO_RETRIEVE_TOOL, {
        arguments: { videoId: taskId },
      })
      if (version !== this.requestVersion) return undefined
      const status = this.readStatus(retrieved.output)
      if (status === 'failed') return undefined
      if (status === 'completed') {
        const url = this.readUrl(retrieved.output)
        if (url !== undefined) return url
      }
    }
    return undefined
  }

  private readClient(): AgentsToolsClient {
    const baseUrl = this.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-generations-video: baseUrl is not configured')
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

  private readTaskId(output: Record<string, unknown>): string | undefined {
    const taskId = output.taskId
    return typeof taskId === 'string' && taskId !== '' ? taskId : undefined
  }

  private readStatus(output: Record<string, unknown>): string | undefined {
    return typeof output.status === 'string' ? output.status : undefined
  }

  private readUrl(output: Record<string, unknown>): string | undefined {
    const url = output.url
    return typeof url === 'string' && url !== '' ? url : undefined
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => { setTimeout(resolve, ms) })
  }

  private publish(snapshot: VideoGenerationSnapshot): void {
    this.snapshot = Object.freeze(snapshot)
    for (const listener of this.listeners) listener()
  }
}
