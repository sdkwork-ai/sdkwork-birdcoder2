/**
 * BirdCoder host adapter for the user-facing IAM official-account capability.
 *
 * The capability lives in `@sdkwork/iam-pc-oauth` (app tier, IAM app API). This
 * adapter owns everything behind that surface: the gateway origin from the
 * shared ui-sdkwork-env profile, the IAM session credentials from `ctx.iam`
 * mirrored into the browser-global token manager, and the generated
 * `@sdkwork/iam-app-sdk` app client whose `iam.oauth.officialAccounts` slice
 * backs every list/create/update/delete request. No backend-admin client and
 * no tenant login resource are involved: these rows are the signed-in account's
 * own channel configuration.
 */
import {
  createClient as createIamAppClient,
  type SdkworkAppClient,
} from '@sdkwork/iam-app-sdk'
import { createClient as createDriveAppClient } from '@sdkwork/drive-app-sdk'
import {
  createDriveNodesImagePreviewReader,
  createDriveUploadImageService,
  type DriveUploadImageService,
} from '@sdkwork/drive-upload-image-core'
import {
  createSdkworkIamOfficialAccountsClient,
  SdkworkIamOfficialAccountsController,
} from '@sdkwork/iam-pc-oauth'
import {
  getSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import { OFFICIAL_ACCOUNT_LOGO_UPLOAD } from './officialAccountLogoUpload.ts'

/** IAM session credential fields the adapter forwards to the token manager. */
export interface OfficialAccountsHostSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  user?: {
    id?: string
  }
  /** Signed-in identity context; the adapter rebuilds its controller when it moves. */
  context?: {
    tenantId?: string
    userId?: string
    organizationId?: string | null
  }
}

/** Environment values consumed by the adapter. */
export interface OfficialAccountsHostEnvironment {
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** Minimal IAM controller face consumed by the adapter. */
export interface OfficialAccountsHostIam {
  controller: {
    /** @returns the current session, or null while signed out. */
    getState(): { session: OfficialAccountsHostSession | null }
    /** Observe login, refresh, and sign-out changes. */
    subscribe(listener: () => void): () => void
  }
}

/** Adapter construction options. */
export interface OfficialAccountsHostOptions {
  env: OfficialAccountsHostEnvironment
  iam: OfficialAccountsHostIam
}

/**
 * Host adapter: keeps the gateway origin current, mirrors the IAM session into
 * the shared token manager before every read, and rebuilds the generated client
 * and its controller when the deployment origin changes.
 */
export class OfficialAccountsHost {
  private readonly options: OfficialAccountsHostOptions
  private readonly tokenManager: ReturnType<typeof getSdkworkGlobalTokenManager>
  private readonly listeners = new Set<() => void>()
  private client: SdkworkAppClient | undefined
  private controller: SdkworkIamOfficialAccountsController | undefined
  private clientBaseUrl: string | undefined
  private logoUploadService: DriveUploadImageService | undefined
  private logoUploadBaseUrl: string | undefined
  private identityKey: string | undefined
  private offEnvironment: (() => void) | undefined
  private offIam: (() => void) | undefined
  private disposed = false

  /**
   * @param options - the shared environment and IAM session providers.
   */
  constructor(options: OfficialAccountsHostOptions) {
    this.options = options
    this.tokenManager = getSdkworkGlobalTokenManager()
  }

  /** Start observing deployment and session changes. */
  mount(): void {
    this.offEnvironment = this.options.env.subscribe(() => { this.refresh() })
    this.offIam = this.options.iam.controller.subscribe(() => { this.refresh() })
    this.refresh()
  }

  /** Stop observing and drop the built client and controller. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.offEnvironment?.()
    this.offIam?.()
    this.offEnvironment = undefined
    this.offIam = undefined
    this.listeners.clear()
    this.client = undefined
    this.controller = undefined
    this.clientBaseUrl = undefined
    this.logoUploadService = undefined
    this.logoUploadBaseUrl = undefined
    this.identityKey = undefined
  }

  /**
   * Observe adapter state (readiness and credentials).
   * @param listener - the change listener.
   * @returns the disposer removing the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Whether the gateway origin is configured, so the panel can mount.
   * @returns whether a non-empty gateway origin is available.
   */
  readReady(): boolean {
    return this.readBaseUrl() !== ''
  }

  /**
   * The signed-in identity the controller was built for.
   * @returns `tenant:user` of the current host session, or an empty string.
   */
  readIdentityKey(): string {
    const session = this.options.iam.controller.getState().session
    const tenantId = session?.context?.tenantId?.trim() ?? ''
    const userId = (session?.context?.userId ?? session?.user?.id ?? '').trim()
    return tenantId === '' || userId === '' ? '' : `${tenantId}:${userId}`
  }

  /**
   * The controller the embedded panel renders from.
   * @returns the account controller, or undefined while the gateway origin is
   * unconfigured.
   */
  readController(): SdkworkIamOfficialAccountsController | undefined {
    const baseUrl = this.readBaseUrl()
    if (baseUrl === '') return undefined
    this.syncTokens()
    if (this.controller === undefined || this.clientBaseUrl !== baseUrl) {
      const client = createIamAppClient({
        authMode: 'dual-token',
        baseUrl,
        platform: 'pc',
        tokenManager: this.tokenManager,
      })
      this.client = client
      this.clientBaseUrl = baseUrl
      this.controller = new SdkworkIamOfficialAccountsController(
        createSdkworkIamOfficialAccountsClient(client.iam.oauth.officialAccounts),
      )
    }
    return this.controller
  }

  /**
   * The Drive image-upload capability the account logo field consumes.
   *
   * The service is built once per gateway origin from this application's
   * declared upload intent (`DRIVE_SPEC.md` section 18) over the shared global
   * token manager, so the panel never composes upload intent or sees the SDK
   * client. A host that is not configured with a gateway origin returns
   * undefined and the field states that uploads are unavailable.
   * @returns the Drive logo upload service, or undefined while unconfigured.
   */
  readLogoUploadService(): DriveUploadImageService | undefined {
    if (this.disposed) return undefined
    const baseUrl = this.readBaseUrl()
    if (baseUrl === '') return undefined
    this.syncTokens()
    if (this.logoUploadService === undefined || this.logoUploadBaseUrl !== baseUrl) {
      const driveClient = createDriveAppClient({
        authMode: 'dual-token',
        baseUrl,
        platform: 'pc',
        tokenManager: this.tokenManager,
      })
      this.logoUploadBaseUrl = baseUrl
      this.logoUploadService = createDriveUploadImageService({
        uploader: driveClient.uploader,
        declaration: OFFICIAL_ACCOUNT_LOGO_UPLOAD,
        previewReader: createDriveNodesImagePreviewReader(driveClient.drive.nodes),
      })
    }
    return this.logoUploadService
  }

  /** Re-publish credentials and readiness after an environment or session change. */
  refresh(): void {
    if (this.disposed) return
    if (this.readBaseUrl() !== '') this.syncTokens()
    // A different signed-in account must not keep rendering the previous
    // account's channel list: the controller caches that list, so drop it and
    // let the next read build one for the new identity. The Drive preview cache
    // is per-account state too, so the logo service is rebuilt with it.
    const identityKey = this.readIdentityKey()
    if (this.identityKey !== undefined && this.identityKey !== identityKey) {
      this.client = undefined
      this.controller = undefined
      this.clientBaseUrl = undefined
      this.logoUploadService = undefined
      this.logoUploadBaseUrl = undefined
    }
    this.identityKey = identityKey
    this.publish()
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
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * Mount an adapter over the shared environment and IAM session providers.
 * @param options - the environment and IAM faces.
 * @returns the mounted adapter.
 */
export function mountOfficialAccountsHost(options: OfficialAccountsHostOptions): OfficialAccountsHost {
  const host = new OfficialAccountsHost(options)
  host.mount()
  return host
}
