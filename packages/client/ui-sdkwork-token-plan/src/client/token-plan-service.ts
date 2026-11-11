import type { AuthTokenManager, AuthTokens } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  mergeSdkworkSessionTokens,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  bootstrapSdkworkMembershipAppService,
  configureSdkworkMembershipAppServiceProvider,
  configureSdkworkMembershipSessionTokenProvider,
  unwrapSdkworkMembershipPageItems,
  type SdkworkMembershipAppService,
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
  /**
   * Demand a session, raising the in-app sign-in overlay in place of the
   * desktop welcome page so the caller's own surface stays on screen.
   * @returns resolves once signed in; rejects when the user dismisses the surface.
   */
  requireSignedInInPlace(): Promise<void>
}

/** Runtime commerce services consumed by the Token Plan page. */
export interface TokenPlanCommerce {
  checkout: SdkworkMembershipCheckoutService
  coupon: SdkworkCouponRechargeService
  recharge: SdkworkPointsRechargeService
  /** Membership commerce API, used for the account-wallet card's summary. */
  membership: SdkworkMembershipAppService
}

/** Account-wallet facts shown under the settings menu's usage card. */
export interface TokenPlanAccountSummary {
  /** Current plan name (`undefined` when the account has no named plan). */
  planName: string | undefined
  /** Compute-point balance (`undefined` when the gateway omitted it). */
  points: number | undefined
  /** Whether the account currently holds an active membership. */
  active: boolean
}

/** One points-ledger row in the settings balances page. */
export interface TokenPlanPointsHistoryEntry {
  /** Stable wire id, or a derived key when the gateway omitted one. */
  id: string
  /** Positive for a credit, negative for a debit. */
  changeAmount: number
  /** Balance after this entry, when the gateway reported it. */
  afterBalance: number | undefined
  /** Wire source classification (for example `purchase` or `usage`). */
  sourceType: string | undefined
  /** Human-readable remark supplied by the gateway. */
  remark: string | undefined
  /** ISO timestamp supplied by the gateway. */
  createdAt: string | undefined
}

/** Full points/plan state rendered by the settings balances section. */
export interface TokenPlanPointsSnapshot {
  /** Current plan name (`undefined` when the account has no named plan). */
  planName: string | undefined
  /** Whether the account currently holds an active membership. */
  active: boolean
  /** Total remaining compute points. */
  points: number | undefined
  /** Points currently spendable. */
  available: number | undefined
  /** Points held by pending operations. */
  frozen: number | undefined
  /** First page of the points ledger, newest first. */
  history: readonly TokenPlanPointsHistoryEntry[]
}

/** Read a finite number from an unknown gateway field. */
function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** Read a non-empty string from an unknown gateway field. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Project one points-ledger page onto the rows the balances section renders.
 * A malformed page degrades to an empty ledger rather than taking down the
 * whole points summary.
 * @param payload - the resolved history response.
 * @returns the parsed ledger rows, newest first as the gateway sent them.
 */
function pointsHistoryOf(payload: unknown): TokenPlanPointsHistoryEntry[] {
  let items: Record<string, unknown>[]
  try {
    items = unwrapSdkworkMembershipPageItems<Record<string, unknown>>(payload)
  } catch {
    return []
  }
  return items.map((item, index) => {
    const createdAt = text(item.createdAt)
    return {
      id: text(item.id) ?? `${createdAt ?? 'entry'}-${String(index)}`,
      changeAmount: finiteNumber(item.changeAmount) ?? 0,
      afterBalance: finiteNumber(item.afterBalance),
      sourceType: text(item.sourceType),
      remark: text(item.remark),
      createdAt,
    }
  })
}

/**
 * Unwrap one SDKWork response into its item payload. The generated client
 * already strips the `data.item` envelope; the manual forms are accepted so the
 * card keeps working when a host composes a raw transport.
 * @param payload - the resolved gateway response.
 * @returns the item object, or undefined for an empty or failed response.
 */
function itemOf(payload: unknown): Record<string, unknown> | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const root = payload as Record<string, unknown>
  if ('code' in root && Number(root.code) !== 0) return undefined
  const data = 'data' in root ? root.data : root
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  const item = 'item' in data ? (data as Record<string, unknown>).item : data
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
  return item as Record<string, unknown>
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
 * @param staticAccessToken - ui-sdkwork-env access token from the active deployment.
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

  /**
   * @param env - deployment environment face.
   * @param iam - IAM session and sign-in surface.
   * @param signInRequiredMessage - localized notice shown when the user
   * dismisses the sign-in surface a gated action opened.
   */
  constructor(
    private readonly env: EnvServiceLike,
    private readonly iam: IamServiceLike,
    private readonly signInRequiredMessage: () => string,
  ) {}

  /** Whether the active deployment can serve Token Plan requests.
   * @returns Whether the environment has the required API configuration.
   */
  isConfigured(): boolean { return this.env.isConfigured() }

  /** Open BirdCoder's configured sign-in surface. */
  openSignIn(): void { this.iam.openSignIn() }

  /**
   * Hold a user-initiated commerce mutation until a session exists. The in-app
   * IAM overlay opens on top of the caller's own surface — the payment dialog
   * stays on screen — and the original call resumes with the credentials the
   * finished login installed once the user signs in.
   * @returns resolves when a session exists; rejects with the localized notice
   * when the user dismisses the sign-in surface instead.
   */
  async requireSignedIn(): Promise<void> {
    try {
      await this.iam.requireSignedInInPlace()
    } catch {
      throw new Error(this.signInRequiredMessage())
    }
  }

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
    if (baseUrl === '') throw new Error('ui-sdkwork-token-plan: SDKWork API environment is not configured')
    if (this.commerce !== undefined && this.baseUrl === baseUrl) return this.commerce

    this.baseUrl = baseUrl
    const membership = bootstrapSdkworkMembershipAppService({ baseUrl, tokenManager: this.tokenManager })
    const order = bootstrapSdkworkOrderAppService({ baseUrl, tokenManager: this.tokenManager })
    configureSdkworkMembershipAppServiceProvider(() => membership)
    configureSdkworkOrderAppServiceProvider(() => order)
    const readTokens = () => this.readTokens()
    configureSdkworkMembershipSessionTokenProvider(readTokens)
    configureSdkworkOrderSessionTokenProvider(readTokens)
    const coupon = createSdkworkCouponRechargeService({ appService: order })
    const recharge = createSdkworkPointsRechargeService({ appService: order })
    this.commerce = {
      checkout: createSdkworkMembershipCheckoutService({ appService: order }),
      membership,
      coupon: {
        ...coupon,
        redeem: async (code, idempotencyKey) => {
          await this.requireSignedIn()
          return coupon.redeem(code, idempotencyKey)
        },
      },
      recharge: {
        ...recharge,
        createOrder: async (input) => {
          await this.requireSignedIn()
          return recharge.createOrder(input)
        },
      },
    }
    return this.commerce
  }

  /**
   * Read the signed-in account's plan and compute-point balance for the
   * settings-menu wallet card. A signed-out account returns undefined instead
   * of opening a sign-in surface: the menu already offers that row. Partial
   * gateway answers are kept, so a plan-name failure still shows the balance.
   * @returns the account-wallet summary, or undefined while signed out.
   */
  async readAccountSummary(): Promise<TokenPlanAccountSummary | undefined> {
    if (this.iam.controller.getState().session === null) return undefined
    const membership = this.readCommerce().membership.memberships
    const [infoResult, statusResult] = await Promise.allSettled([
      membership.current.retrieve(),
      membership.current.status.retrieve(),
    ])
    if (infoResult.status === 'rejected' && statusResult.status === 'rejected') {
      throw infoResult.reason instanceof Error ? infoResult.reason : new Error(String(infoResult.reason))
    }
    const info = infoResult.status === 'fulfilled' ? itemOf(infoResult.value) : undefined
    const status = statusResult.status === 'fulfilled' ? itemOf(statusResult.value) : undefined
    return {
      planName: text(info?.planName),
      // The status payload is the authoritative wallet balance; the membership
      // info's `points` is a different membership metric, so never substitute
      // it when the status read fails.
      points: finiteNumber(status?.pointBalance),
      active: status?.active === true,
    }
  }

  /**
   * Read the plan, wallet split, and recent ledger for the settings balances
   * section. A partial gateway answer is kept: a failed plan read still shows
   * the total, and a failed ledger still shows the balance.
   * @returns the points snapshot, or undefined while signed out.
   */
  async readPointsSnapshot(): Promise<TokenPlanPointsSnapshot | undefined> {
    if (this.iam.controller.getState().session === null) return undefined
    const membership = this.readCommerce().membership.memberships
    const [infoResult, statusResult, balanceResult, historyResult] = await Promise.allSettled([
      membership.current.retrieve(),
      membership.current.status.retrieve(),
      membership.points.balance.retrieve(),
      membership.points.history.list({ page: 1, pageSize: 20 }),
    ])
    if (
      infoResult.status === 'rejected'
      && statusResult.status === 'rejected'
      && balanceResult.status === 'rejected'
      && historyResult.status === 'rejected'
    ) {
      throw infoResult.reason instanceof Error ? infoResult.reason : new Error(String(infoResult.reason))
    }
    const info = infoResult.status === 'fulfilled' ? itemOf(infoResult.value) : undefined
    const status = statusResult.status === 'fulfilled' ? itemOf(statusResult.value) : undefined
    const balance = balanceResult.status === 'fulfilled' ? itemOf(balanceResult.value) : undefined
    return {
      planName: text(info?.planName),
      active: status?.active === true,
      points: finiteNumber(balance?.points) ?? finiteNumber(status?.pointBalance),
      available: finiteNumber(balance?.availablePoints),
      frozen: finiteNumber(balance?.frozenPoints),
      history: historyResult.status === 'fulfilled' ? pointsHistoryOf(historyResult.value) : [],
    }
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
