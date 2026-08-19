import type { AuthTokenManager, AuthTokens } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  mergeSdkworkSessionTokens,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-iam/sdkwork-global-token-manager'
import {
  bootstrapSdkworkMembershipAppService,
  configureSdkworkMembershipAppServiceProvider,
  configureSdkworkMembershipSessionTokenProvider,
} from '@sdkwork/membership-service'
import {
  bootstrapSdkworkOrderAppService,
  configureSdkworkOrderAppServiceProvider,
  configureSdkworkOrderSessionTokenProvider,
  createSdkworkCouponRechargeService,
  createSdkworkMembershipCheckoutService,
  createSdkworkPointsRechargeService,
  type SdkworkCouponRechargeService,
  type SdkworkMembershipCheckoutService,
  type SdkworkPointsRechargeService,
} from '@sdkwork/order-service'

/** Minimal environment face consumed across the plugin boundary. */
export interface EnvServiceLike {
  /** @returns whether the active deployment has a usable API origin. */
  isConfigured(): boolean
  /** @returns the active API gateway origin. */
  apiBaseUrl(): string
  /** @returns the configured static access token, if any. */
  accessToken(): string
  /** Observe profile or active-environment changes. */
  subscribe(listener: () => void): () => void
}

/** IAM session fields Token Plan reads for Membership/Order credentials. */
export interface TokenPlanIamSession {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** Minimal IAM face consumed across the plugin boundary. */
export interface IamServiceLike {
  controller: {
    getState(): { session: TokenPlanIamSession | null }
    subscribe(listener: () => void): () => void
  }
  openSignIn(): void
}

/** Runtime commerce services consumed by the Token Plan page. */
export interface TokenPlanCommerce {
  checkout: SdkworkMembershipCheckoutService
  coupon: SdkworkCouponRechargeService
  recharge: SdkworkPointsRechargeService
}

/**
 * Merge IAM session tokens with the env access token the way App Store and Drive do.
 *
 * Membership checkout (`hasSdkworkMembershipSession`) requires both Access-Token
 * and authToken. A static env access token is the anonymous catalog credential
 * and fills Access-Token when a signed-in IAM session omits it. It must not
 * replace `authToken`, or the catalog treats a signed-in user as a guest and
 * plan purchase no-ops because `openSignIn()` returns immediately when IAM is
 * already authenticated.
 *
 * @param session - current IAM session, or null when signed out.
 * @param staticAccessToken - ui-env access token from the active deployment.
 * @returns the credential snapshot written to the shared token manager.
 */
export function readTokenPlanSessionTokens(
  session: TokenPlanIamSession | null,
  staticAccessToken: string,
): AuthTokens {
  return mergeSdkworkSessionTokens(session, staticAccessToken)
}

/** Whether Membership checkout can run for this credential snapshot.
 * @param tokens - merged IAM and env credentials.
 * @returns true when Access-Token and authToken are both present.
 */
export function hasTokenPlanCheckoutSession(tokens: AuthTokens): boolean {
  return Boolean(tokens.accessToken?.trim() && tokens.authToken?.trim())
}

/** Owns SDKWork clients and keeps their shared credentials current. */
export class TokenPlanService {
  private readonly tokenManager: AuthTokenManager = getSdkworkGlobalTokenManager()
  private baseUrl: string | undefined
  private commerce: TokenPlanCommerce | undefined

  constructor(private readonly env: EnvServiceLike, private readonly iam: IamServiceLike) {}

  /** Whether the active deployment can serve Token Plan requests.
   * @returns Whether the environment has the required API configuration.
   */
  isConfigured(): boolean { return this.env.isConfigured() }

  /** Open BirdCoder's configured sign-in surface. */
  openSignIn(): void { this.iam.openSignIn() }

  /**
   * Whether the catalog may open checkout (dual-token Membership session).
   * @returns true when Access-Token and authToken are both present after merge.
   */
  hasCheckoutSession(): boolean {
    return hasTokenPlanCheckoutSession(this.readTokens())
  }

  /** Build or return commerce services for the active environment.
   *
   * @returns The shared Membership and Order commerce services.
   */
  readCommerce(): TokenPlanCommerce {
    this.syncTokens()
    const baseUrl = this.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-token-plan: SDKWork API environment is not configured')
    if (this.commerce !== undefined && this.baseUrl === baseUrl) return this.commerce

    this.baseUrl = baseUrl
    const membership = bootstrapSdkworkMembershipAppService({ baseUrl, tokenManager: this.tokenManager })
    const order = bootstrapSdkworkOrderAppService({ baseUrl, tokenManager: this.tokenManager })
    configureSdkworkMembershipAppServiceProvider(() => membership)
    configureSdkworkOrderAppServiceProvider(() => order)
    const readTokens = () => this.readTokens()
    configureSdkworkMembershipSessionTokenProvider(readTokens)
    configureSdkworkOrderSessionTokenProvider(readTokens)
    this.commerce = {
      checkout: createSdkworkMembershipCheckoutService({ appService: order }),
      coupon: createSdkworkCouponRechargeService({ appService: order }),
      recharge: createSdkworkPointsRechargeService({ appService: order }),
    }
    return this.commerce
  }

  /** Observe IAM or environment changes and invalidate environment-specific clients.
   * @param listener - Called after credentials or environment state changes.
   * @returns A disposer that removes both subscriptions.
   */
  subscribe(listener: () => void): () => void {
    const refresh = () => {
      if (this.baseUrl !== this.env.apiBaseUrl().trim()) this.commerce = undefined
      this.syncTokens()
      listener()
    }
    const offEnv = this.env.subscribe(refresh)
    const offIam = this.iam.controller.subscribe(refresh)
    this.syncTokens()
    return () => { offEnv(); offIam() }
  }

  private readTokens(): AuthTokens {
    return readTokenPlanSessionTokens(
      this.iam.controller.getState().session,
      this.env.accessToken(),
    )
  }

  private syncTokens(): void {
    syncSdkworkGlobalTokenManager(
      this.iam.controller.getState().session,
      this.env.accessToken(),
    )
  }
}
