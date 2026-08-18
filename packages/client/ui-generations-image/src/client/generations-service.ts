import { createClient } from '@sdkwork/agents-app-sdk'
import { createTokenManager, type AuthTokenManager } from '@sdkwork/sdk-common'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'

/** One generated image surfaced by the page. */
export interface ImageGenerationResult {
  /** Provider asset URL of the generated image. */
  url: string
}

/**
 * Stable observable generation snapshot. `prompt` mirrors the committed
 * request prompt so the page can restore the draft and retry the same request.
 */
export type ImageGenerationSnapshot =
  | { status: 'unconfigured'; prompt: string; results: readonly ImageGenerationResult[] }
  | { status: 'idle'; prompt: string; results: readonly ImageGenerationResult[] }
  | { status: 'generating'; prompt: string; results: readonly ImageGenerationResult[] }
  | { status: 'ready'; prompt: string; results: readonly ImageGenerationResult[] }
  | { status: 'error'; prompt: string; results: readonly ImageGenerationResult[] }

/** IAM session fields adopted by generation requests. */
export interface GenerationIamSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** IAM service subset consumed by the image generation mode. */
export interface GenerationIamService {
  controller: {
    /** @returns the current authenticated session, when present. */
    getState(): { session: GenerationIamSession | null }
    /** @param listener - notified when the session changes. @returns the disposer. */
    subscribe(listener: () => void): () => void
  }
}

const UNCONFIGURED: ImageGenerationSnapshot = Object.freeze({
  status: 'unconfigured', prompt: '', results: [] as const,
})

/** The text-to-image tool id owned by this plugin. */
const TEXT_TO_IMAGE_TOOL = 'image.generations.create'

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

/**
 * SDKWork Agents image generation adapter for the host environment and IAM
 * session: invokes the agents media-tool channel through the generated
 * `@sdkwork/agents-app-sdk` client and publishes a stable snapshot per request.
 */
export class ImageGenerationsService {
  private readonly env: EnvService
  private readonly iam: GenerationIamService
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private client: AgentsToolsClient | undefined
  private clientBaseUrl: string | undefined
  private snapshot: ImageGenerationSnapshot
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
  getSnapshot(): ImageGenerationSnapshot {
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
   * Generate one image from a prompt through the agents media-tool channel.
   * @param prompt - the text prompt describing the desired image; the
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
      const response = await client.ai.agents.tools.invoke(TEXT_TO_IMAGE_TOOL, {
        arguments: {
          prompt: normalizedPrompt,
          model: 'default',
          n: 1,
          size: '1024x1024',
        },
      })
      if (version !== this.requestVersion) return
      this.publish({
        status: 'ready',
        prompt: normalizedPrompt,
        results: this.toResults(response.output),
      })
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

  private readClient(): AgentsToolsClient {
    const baseUrl = this.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-generations-image: baseUrl is not configured')
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

  private toResults(output: Record<string, unknown>): ImageGenerationResult[] {
    if (!Array.isArray(output.images)) return []
    return output.images.flatMap((image) => {
      if (typeof image !== 'object' || image === null) return []
      const url = (image as Record<string, unknown>).url
      return typeof url === 'string' && url !== '' ? [{ url }] : []
    })
  }

  private publish(snapshot: ImageGenerationSnapshot): void {
    this.snapshot = Object.freeze(snapshot)
    for (const listener of this.listeners) listener()
  }
}
