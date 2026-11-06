/**
 * BirdCoder host adapter for the SDKWork mini-program account capability.
 *
 * The capability is the IAM backend OAuth admin surface that the sdkwork-iam
 * PC admin mounts: `iamOauth.iam.oauth.resourceAccounts` rows whose
 * `resourceAccountKind` is `mini_program`, created together with (or reusing) a
 * `wechat_mini_program` login integration. This adapter owns only the transport
 * seam: the gateway origin from the shared ui-sdkwork-env profile, the IAM
 * session credentials mirrored into the browser-global token manager, and one
 * generated backend client rebuilt when the deployment origin changes.
 *
 * The backend routes enforce their own permissions. A session without the
 * OAuth admin permission reaches the API and is refused there; the dialog
 * renders the server message instead of guessing at the local scope.
 */
import { createClient, type SdkworkBackendClient } from '@sdkwork/iam-backend-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'

/** IAM session credential fields the adapter forwards to the token manager. */
export interface MiniProgramHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** Minimal IAM controller face consumed by the adapter. */
export interface MiniProgramHostIam {
  controller: {
    /** @returns the current session, or null while signed out. */
    getState(): { session: MiniProgramHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Environment values consumed by the adapter. */
export interface MiniProgramHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Adapter construction options. */
export interface MiniProgramHostOptions {
  env: MiniProgramHostEnvironment
  iam: MiniProgramHostIam
}

/**
 * What the dialog reads from the adapter: readiness plus the generated backend
 * client. `readClient()` returns undefined while no gateway origin is
 * configured, so the dialog can render its configuration notice.
 */
export interface MiniProgramHostSource {
  /** @returns whether a gateway origin is configured. */
  readReady(): boolean
  /** @returns the generated IAM backend client, or undefined while unconfigured. */
  readClient(): SdkworkBackendClient | undefined
}

/**
 * Host adapter: keeps the client current across environment and IAM changes and
 * syncs the browser-global token manager before every read.
 */
export class MiniProgramHost implements MiniProgramHostSource {
  private readonly options: MiniProgramHostOptions
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private client: SdkworkBackendClient | undefined
  private clientBaseUrl: string | undefined
  private revision = 0
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  /**
   * @param options - the shared environment and IAM session providers.
   */
  constructor(options: MiniProgramHostOptions) {
    this.options = options
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Start observing deployment and session changes. */
  mount(): void {
    this.offEnvironment = this.options.env.subscribe(() => { this.publish() })
    this.offIam = this.options.iam.controller.subscribe(() => { this.publish() })
  }

  /** Stop observing and drop the built client. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.offEnvironment = undefined
    this.offIam = undefined
    this.listeners.clear()
    this.client = undefined
    this.clientBaseUrl = undefined
  }

  /**
   * Observe adapter state (readiness and environment identity).
   * @param listener - the change listener.
   * @returns the disposer removing the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * A counter that moves on every environment or session transition, so the
   * dialog re-reads `readClient()` after an environment switch.
   * @returns the current revision.
   */
  readRevision(): number {
    return this.revision
  }

  /**
   * Whether the gateway origin is configured, so the dialog can mount.
   * @returns whether a non-empty gateway origin is available.
   */
  readReady(): boolean {
    return this.readBaseUrl() !== ''
  }

  /**
   * The generated backend client the dialog reads its account operations from.
   * @returns the client, or undefined while the gateway origin is unconfigured.
   */
  readClient(): SdkworkBackendClient | undefined {
    const baseUrl = this.readBaseUrl()
    if (baseUrl === '') return undefined
    this.syncTokens()
    if (this.client === undefined || this.clientBaseUrl !== baseUrl) {
      this.clientBaseUrl = baseUrl
      this.client = createClient({
        authMode: 'dual-token',
        platform: 'pc',
        baseUrl,
        tokenManager: this.tokenManager,
      })
    }
    return this.client
  }

  private readBaseUrl(): string {
    return this.options.env.apiBaseUrl().trim().replace(/\/+$/u, '')
  }

  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.options.iam.controller.getState().session,
      this.options.env.accessToken(),
    )
  }

  private publish(): void {
    if (this.disposed) return
    this.revision += 1
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * Mount a mini-program-account adapter over the shared environment and IAM faces.
 * @param options - the environment and IAM faces.
 * @returns the mounted adapter.
 */
export function mountMiniProgramHost(options: MiniProgramHostOptions): MiniProgramHost {
  const host = new MiniProgramHost(options)
  host.mount()
  return host
}
