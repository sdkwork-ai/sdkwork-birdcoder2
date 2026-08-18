import { createTokenManager, type AuthTokenManager, type AuthTokens } from '@sdkwork/sdk-common'
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
import type { EnvService } from '@deepseek-ai/dsh-client-ui-env/client'

/** Minimal IAM face consumed across the plugin boundary. */
export interface IamServiceLike {
  controller: {
    getState(): { session: { accessToken?: string; authToken?: string; refreshToken?: string } | null }
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

/** Owns SDKWork clients and keeps their shared credentials current. */
export class TokenPlanService {
  private readonly tokenManager: AuthTokenManager = createTokenManager()
  private baseUrl: string | undefined
  private commerce: TokenPlanCommerce | undefined

  constructor(private readonly env: EnvService, private readonly iam: IamServiceLike) {}

  /** Whether the active deployment can serve Token Plan requests.
   * @returns Whether the environment has the required API configuration.
   */
  isConfigured(): boolean { return this.env.isConfigured() }

  /** Open BirdCoder's configured sign-in surface. */
  openSignIn(): void { this.iam.openSignIn() }

  /** Build or return commerce services for the active environment.
   * @returns The shared Membership and Order commerce services.
   */
  readCommerce(): TokenPlanCommerce {
    this.syncTokens()
    const baseUrl = this.env.apiBaseUrl().trim()
    if (baseUrl === '') throw new Error('ui-token-plan: SDKWork API environment is not configured')
    if (this.commerce !== undefined && this.baseUrl === baseUrl) return this.commerce

    this.baseUrl = baseUrl
    const membership = bootstrapSdkworkMembershipAppService({ baseUrl, platform: 'web', tokenManager: this.tokenManager })
    const order = bootstrapSdkworkOrderAppService({ baseUrl, platform: 'web', tokenManager: this.tokenManager })
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
    const staticToken = this.env.accessToken().trim()
    if (staticToken !== '') return { accessToken: staticToken }
    const session = this.iam.controller.getState().session
    if (session === null) return {}
    const tokens: AuthTokens = {}
    if (session.accessToken !== undefined) tokens.accessToken = session.accessToken
    if (session.authToken !== undefined) tokens.authToken = session.authToken
    if (session.refreshToken !== undefined) tokens.refreshToken = session.refreshToken
    return tokens
  }

  private syncTokens(): void {
    const tokens = this.readTokens()
    if (tokens.accessToken || tokens.authToken || tokens.refreshToken) this.tokenManager.setTokens(tokens)
    else this.tokenManager.clearTokens()
  }
}
