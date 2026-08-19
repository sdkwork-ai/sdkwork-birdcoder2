/**
 * The feedback submission service: owns the sdkwork appstore feedback client
 * over the runtime adapter and dispatches the dialog presentation. The client
 * is (re)built lazily from the shared ui-env profile so an environment switch
 * takes effect without reload. Auth tokens flow from the mounted ui-iam
 * controller merged with the ui-env access token through the shared SDKWork
 * token manager; an anonymous submission still reaches the collector's auth
 * wall and surfaces its error.
 */
import {
  createAppStoreClient,
  type AppStoreClient,
} from '@sdkwork/appstore-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-iam/sdkwork-global-token-manager'
// Type-only: pulls ctx.env (the shared deployment environment) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-env/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'

/** One user feedback submission, mirroring the collector's create request. */
export interface FeedbackDraft {
  /** Feedback category the dialog offers (bug / suggestion / other). */
  type: string
  /** Free-form feedback text; non-blank required by the collector. */
  content: string
  /** Optional contact channel (email or phone) for follow-up. */
  contact?: string
}

/** The minimal IAM controller surface the service reads session tokens from. */
export interface IamSessionLike {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** The minimal IAM service face (`ctx.get('iam')`); absent while ui-iam is unmounted. */
export interface IamServiceLike {
  controller: {
    /** @returns the current auth state carrying the session tokens. */
    getState(): { session: IamSessionLike | null }
    /** Observe auth-state changes (login, sign-out, refresh). */
    subscribe(listener: () => void): () => void
  }
}

/** The dialog open/close actions, bound by the overlay registration. */
export interface FeedbackModalActions {
  open: () => void
  close: () => void
}

/**
 * Feedback service: environment mirror + lazily built appstore client +
 * submit + dialog presentation dispatch.
 */
export class FeedbackService {
  private readonly env: EnvService
  private readonly iam: IamServiceLike | undefined
  private readonly tokenManager: AuthTokenManager
  private client: AppStoreClient | undefined
  private clientBaseUrl: string | undefined
  private modal: FeedbackModalActions | undefined
  private offIam: (() => void) | undefined

  constructor(env: EnvService, iam?: IamServiceLike) {
    this.env = env
    this.iam = iam
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Whether the feedback channel is configured (a non-empty base URL). */
  isConfigured(): boolean {
    return this.env.isConfigured()
  }

  /** Adopt the dialog open/close actions (overlay registration's bound store). */
  attachModal(actions: FeedbackModalActions): void {
    this.modal = actions
  }

  /** Open the feedback dialog through the bound overlay actions. */
  open(): void {
    this.modal?.open()
  }

  /**
   * Keep the client's tokens in step with the mounted IAM session. The
   * subscription lives for the plugin lifetime; `submit` re-syncs before
   * each request anyway, so a session moving between syncs still sends the
   * current tokens. Env access token supplements IAM Access-Token when the
   * session omits it.
   * @returns the disposer dropping the subscription.
   */
  subscribeIam(): () => void {
    if (this.iam === undefined) return () => {}
    this.syncTokens()
    this.offIam = this.iam.controller.subscribe(() => { this.syncTokens() })
    return () => { this.offIam?.() }
  }

  /**
   * Submit feedback to the configured collector.
   * @param draft - the user's feedback (content must be non-blank).
   * @returns a promise resolving on acceptance; rejects with the collector
   * or transport error otherwise.
   */
  async submit(draft: FeedbackDraft): Promise<void> {
    const content = draft.content.trim()
    if (content === '') {
      throw new Error('Feedback content is required')
    }
    this.syncTokens()
    const client = this.readClient()
    const contact = draft.contact?.trim()
    await client.catalog.submitFeedback({
      type: draft.type,
      content,
      ...(contact !== undefined && contact !== '' ? { contact } : {}),
      appKey: this.env.appKey(),
    })
  }

  /** The lazily built appstore client for the active environment. */
  private readClient(): AppStoreClient {
    const baseUrl = this.env.apiBaseUrl()
    if (baseUrl.trim() === '') {
      throw new Error('ui-feedback: baseUrl is not configured')
    }
    if (this.client === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.client = createAppStoreClient({
        baseUrl,
        tokenManager: this.tokenManager,
      })
    }
    return this.client
  }

  /** Copy the current credentials into the shared SDKWork token manager. */
  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.iam?.controller.getState().session ?? null,
      this.env.accessToken(),
    )
  }
}
