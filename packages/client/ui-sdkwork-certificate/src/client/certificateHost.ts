/**
 * BirdCoder host adapter for the SDKWork certificate management capability.
 *
 * The capability is the deployments app API (`@sdkwork/deployments-app-sdk`
 * `certificate` and `domain` surfaces: the certificate ledger, issuance from
 * verified hostname ids, renewal, and the hostnames a certificate may cover).
 * This adapter owns only the transport seam: the gateway origin from the shared
 * ui-sdkwork-env profile, the IAM session credentials mirrored into the
 * browser-global token manager, and one generated client rebuilt when the
 * deployment origin changes.
 */
import { createClient, type SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'

/** IAM session credential fields the adapter forwards to the token manager. */
export interface CertificateHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** Minimal IAM controller face consumed by the adapter. */
export interface CertificateHostIam {
  controller: {
    /** @returns the current session, or null while signed out. */
    getState(): { session: CertificateHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Environment values consumed by the adapter. */
export interface CertificateHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Adapter construction options. */
export interface CertificateHostOptions {
  env: CertificateHostEnvironment
  iam: CertificateHostIam
}

/**
 * What the dialog reads from the adapter: readiness plus the generated client.
 * `readClient()` returns undefined while no gateway origin is configured, so the
 * dialog can render its configuration notice instead of throwing.
 */
export interface CertificateHostSource {
  /** @returns whether a gateway origin is configured. */
  readReady(): boolean
  /** @returns the generated deployments client, or undefined while unconfigured. */
  readClient(): SdkworkDeployAppClient | undefined
}

/**
 * Host adapter: keeps the client current across environment and IAM changes and
 * syncs the browser-global token manager before every read.
 */
export class CertificateHost implements CertificateHostSource {
  private readonly options: CertificateHostOptions
  private readonly tokenManager: AuthTokenManager
  private readonly listeners = new Set<() => void>()
  private client: SdkworkDeployAppClient | undefined
  private clientBaseUrl: string | undefined
  private revision = 0
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  /**
   * @param options - the shared environment and IAM session providers.
   */
  constructor(options: CertificateHostOptions) {
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
   * dialog re-reads `readClient()` when the deployment changes even while the
   * readiness boolean stays true (edit → edit).
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
   * The generated client the dialog reads its certificate operations from.
   * @returns the client, or undefined while the gateway origin is unconfigured.
   */
  readClient(): SdkworkDeployAppClient | undefined {
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
 * Mount a certificate-management adapter over the shared environment and IAM faces.
 * @param options - the environment and IAM faces.
 * @returns the mounted adapter.
 */
export function mountCertificateHost(options: CertificateHostOptions): CertificateHost {
  const host = new CertificateHost(options)
  host.mount()
  return host
}
