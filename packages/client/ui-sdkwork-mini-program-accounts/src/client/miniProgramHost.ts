/**
 * BirdCoder host adapter for the SDKWork mini-program account capability.
 *
 * The capability itself lives in `@sdkwork/iam-pc-mini-program`: the shared
 * operator panel over the unified `iam_oauth_resource_account` aggregate
 * (`resourceAccountKind = "mini_program"`). This adapter owns everything behind
 * that panel: the gateway origin from the shared ui-sdkwork-env profile, the
 * IAM session credentials mirrored into the browser-global token manager, and
 * the generated backend client whose `iam.oauth.resourceAccounts` slice backs
 * every list/create/update/delete request.
 *
 * The transport is built with `createMiniProgramOperatorTransport` over the
 * generated backend operations: creating an account reuses or creates the
 * `wechat_mini_program` login integration (which owns the AppSecret secret row)
 * exactly as the sdkwork-iam PC admin surface does, so a saved account is
 * usable for mini-program login immediately. No raw HTTP and no hand-written
 * auth header exists here.
 */
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  DEFAULT_OPERATOR_CAPABILITIES,
  createMiniProgramBackendOperations,
  createMiniProgramController,
  createMiniProgramOperatorTransport,
  type MiniProgramAccount,
  type MiniProgramController,
} from '@sdkwork/iam-pc-mini-program'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { createMiniProgramBackendClient } from './miniProgramApi.ts'

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
 * What the dialog reads from the adapter: readiness plus the shared account
 * controller. `readController()` returns undefined while no gateway origin is
 * configured, so the dialog can render its configuration notice.
 */
export interface MiniProgramHostSource {
  /** @returns whether a gateway origin is configured. */
  readReady(): boolean
  /** @returns the shared mini-program controller, or undefined while unconfigured. */
  readController(): MiniProgramController | undefined
  /**
   * @returns the environment/session revision; a new value tells the dialog to
   * re-read the controller after an environment switch.
   */
  readRevision(): number
}

/**
 * Host adapter: keeps the generated client and its controller current across
 * environment and IAM changes, and syncs the browser-global token manager
 * before every read.
 */
export class MiniProgramHost implements MiniProgramHostSource {
  private readonly options: MiniProgramHostOptions
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private controller: MiniProgramController | undefined
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

  /** Stop observing and drop the built controller. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.offEnvironment = undefined
    this.offIam = undefined
    this.listeners.clear()
    this.controller = undefined
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
   * dialog re-reads `readController()` after an environment switch.
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
   * The shared controller the embedded panel renders from.
   * @returns the controller, or undefined while the gateway origin is unconfigured.
   */
  readController(): MiniProgramController | undefined {
    if (this.disposed) return undefined
    const baseUrl = this.readBaseUrl()
    if (baseUrl === '') return undefined
    this.syncTokens()
    if (this.controller === undefined || this.clientBaseUrl !== baseUrl) {
      const client = createMiniProgramBackendClient({
        baseUrl,
        tokenManager: this.tokenManager,
      })
      this.clientBaseUrl = baseUrl
      this.controller = createMiniProgramController(
        createMiniProgramOperatorTransport(createMiniProgramBackendOperations(client.iamOauth.iam.oauth)),
        DEFAULT_OPERATOR_CAPABILITIES,
      )
    }
    return this.controller
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

// The account model is re-exported so a host that already imported it from this
// package keeps one source of truth.
export type { MiniProgramAccount }

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
