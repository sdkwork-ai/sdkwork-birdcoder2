import type { AuthTokenManager, AuthTokens } from '@sdkwork/sdk-common'
import {
  getSdkworkGlobalTokenManager,
  mergeSdkworkSessionTokens,
  syncSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  createClient as createSdkworkAccountAppClient,
  type SdkworkAccountAppClient,
} from '@sdkwork/account-app-sdk'
import {
  bootstrapSdkworkMembershipAppService,
  configureSdkworkMembershipAppServiceProvider,
  configureSdkworkMembershipSessionTokenProvider,
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
import type { SdkworkTeamSubscriptionPort } from '@sdkwork/membership-pc-subscription/catalog'
import { createTokenPlanTeamSubscriptionPort } from './team-subscription-port.ts'

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
  /**
   * Remaining compute points the account owns: spendable plus the points the
   * gateway currently holds for in-flight requests (`undefined` when the
   * gateway omitted the wallet balance). This is the figure a balance surface
   * shows: reading only the spendable share would make the balance appear to
   * jump every time a model call starts or settles.
   */
  points: number | undefined
  /** Points spendable right now (`undefined` when the gateway omitted them). */
  available: number | undefined
  /** Points held by in-flight requests (`undefined` when the gateway omitted them). */
  frozen: number | undefined
  /** Whether the account currently holds an active membership. */
  active: boolean
}

/** The signed-in account's Token Bank (compute-credit) wallet. */
export interface TokenPlanComputeAccount {
  /** Wire asset classification; `token_bank` for the compute-credit wallet. */
  assetType: string | undefined
  /** Spendable balance, in points. */
  available: number | undefined
  /** Points held by in-flight holds. */
  frozen: number | undefined
  /** Points awaiting settlement. */
  pending: number | undefined
}

/** One points-ledger row in the settings balances page. */
export interface TokenPlanPointsHistoryEntry {
  /** Stable wire id, or a derived key when the gateway omitted one. */
  id: string
  /** Positive for a credit, negative for a debit. */
  changeAmount: number
  /** Balance after this entry, when the gateway reported it. */
  afterBalance: number | undefined
  /**
   * Wire business type of the Token Bank ledger row (for example
   * `gateway_invocation_billing` or `token_bank_grant`).
   */
  sourceType: string | undefined
  /**
   * Human-readable remark when the gateway sends one. The Token Bank ledger
   * carries only its business type, so this stays undefined there.
   */
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
  /**
   * Total remaining compute points: spendable plus points held by in-flight
   * requests. The figure only moves when a charge settles.
   */
  points: number | undefined
  /** Points currently spendable. */
  available: number | undefined
  /** Points held by pending operations. */
  frozen: number | undefined
  /** First page of the Token Bank ledger, newest first. */
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

/** Points are carried as micro-units on the wire: 1 point is 1e6 micro. */
const POINTS_PER_MICRO_UNIT = 1_000_000

/**
 * Convert a Token Bank micro-point amount to the points figure the surfaces
 * display. The account app serializes these amounts as decimal strings, and a
 * number holds every value below 2^53 micro-points exactly, so the division is
 * lossless for any realistic balance.
 * @param value - the wire amount, in micro-points.
 * @returns the balance in points, or undefined when the field is absent.
 */
function pointsFromMicro(value: unknown): number | undefined {
  const micro = finiteNumber(value)
  if (micro === undefined) return undefined
  return micro / POINTS_PER_MICRO_UNIT
}

/**
 * Points the account still owns: spendable plus the points a running request
 * holds.
 *
 * The gateway precharges every model call by moving the reserved amount from
 * `availableAmount` into `frozenAmount`, then returns the unused remainder when
 * the call settles. `availableAmount` alone therefore drops whenever a request
 * starts and comes back when it settles, which reads as a balance that changes
 * on every refresh even though nothing was spent. Balance surfaces show this
 * total instead; the settings page still renders the available/frozen split.
 *
 * `pendingAmount` is excluded: those points are awaiting settlement rather than
 * counted among the points the owner currently holds.
 * @param account - the Token Bank wallet read from the account app.
 * @returns the owned points, or undefined while the spendable balance is unknown.
 */
export function computeAccountTotal(account: TokenPlanComputeAccount | undefined): number | undefined {
  if (account?.available === undefined) return undefined
  return account.available + (account.frozen ?? 0)
}

/** Read a non-empty string from an unknown gateway field. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Read the rows of one Token Bank ledger page. The generated account client
 * returns `{ items, pageInfo }`; a raw transport envelope (`data.items`) is
 * accepted too so the ledger keeps rendering when a host composes the client
 * itself. A malformed page degrades to an empty ledger rather than taking down
 * the whole points summary.
 * @param payload - the resolved ledger response.
 * @returns the row objects, newest first as the gateway sent them.
 */
function walletLedgerRowsOf(payload: unknown): Record<string, unknown>[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return []
  const root = payload as Record<string, unknown>
  if ('code' in root && Number(root.code) !== 0) return []
  const page = 'data' in root && typeof root.data === 'object' && root.data !== null
    ? root.data as Record<string, unknown>
    : root
  const items = page.items
  if (!Array.isArray(items)) return []
  return items.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  )
}

/**
 * Project one Token Bank ledger page onto the rows the balances section
 * renders. The ledger stores unsigned micro-point amounts plus a direction, so
 * the displayed change carries the sign and the balance-after figure is
 * converted to points.
 * @param payload - the resolved ledger response.
 * @returns the parsed ledger rows, newest first.
 */
function walletHistoryOf(payload: unknown): TokenPlanPointsHistoryEntry[] {
  return walletLedgerRowsOf(payload).map((item, index) => {
    const createdAt = text(item.createdAt)
    const amount = pointsFromMicro(item.amount) ?? 0
    const debit = text(item.direction)?.toLowerCase() === 'debit'
    return {
      id: text(item.id) ?? `${createdAt ?? 'entry'}-${String(index)}`,
      changeAmount: debit ? -amount : amount,
      afterBalance: pointsFromMicro(item.balanceAfter),
      sourceType: text(item.businessType),
      remark: undefined,
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

/** SDKWork app APIs live under this suffix; a configured origin may carry it. */
const APP_API_SUFFIX = '/app/v3/api'

/**
 * Reduce a configured API origin to the origin the generated app clients
 * expect, dropping a trailing app-API suffix so the client does not repeat it.
 * @param baseUrl - the deployment's SDKWork API origin.
 * @returns the origin without the app-API suffix.
 */
function appApiOrigin(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, '')
  return trimmed.endsWith(APP_API_SUFFIX) ? trimmed.slice(0, -APP_API_SUFFIX.length) : trimmed
}

/** Owns SDKWork clients and keeps their shared credentials current. */
export class TokenPlanService {
  private readonly tokenManager: AuthTokenManager = getSdkworkGlobalTokenManager()
  private baseUrl: string | undefined
  private commerce: TokenPlanCommerce | undefined
  private accountClient: { baseUrl: string; client: SdkworkAccountAppClient } | undefined
  private teamPort: { baseUrl: string; port: SdkworkTeamSubscriptionPort } | undefined

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
   * Build or return the organization (team) subscription port for the active
   * environment.
   *
   * The port is the host half of the shared team surface: it reads the
   * membership team subscription and seat rows through the generated membership
   * app SDK, the organization roster and the caller's role through the generated
   * IAM app SDK, and starts seat payments through the same order-owned checkout
   * the personal catalog uses. It is cached per gateway origin so the shared
   * surface never re-bootstraps on a locale or theme render.
   * @returns The team subscription port for the active deployment.
   */
  readTeamSubscriptionPort(): SdkworkTeamSubscriptionPort {
    this.syncTokens()
    const baseUrl = appApiOrigin(this.env.apiBaseUrl())
    if (baseUrl === '') throw new Error('ui-sdkwork-token-plan: SDKWork API environment is not configured')
    if (this.teamPort !== undefined && this.teamPort.baseUrl === baseUrl) return this.teamPort.port
    const port = createTokenPlanTeamSubscriptionPort({
      baseUrl,
      checkout: this.readCommerce().checkout,
      refreshSession: () => { this.syncTokens() },
      tokenManager: this.tokenManager,
    })
    this.teamPort = { baseUrl, port }
    return port
  }

  /**
   * Read the signed-in account's Token Bank wallet: the compute-credit asset
   * account the recharge dialog tops up and the settings surfaces report.
   * Membership plans bill against this account, while the Membership points
   * asset stays at zero, so the membership payloads cannot stand in for it.
   * @returns the Token Bank account, or undefined while signed out.
   */
  async readComputeAccount(): Promise<TokenPlanComputeAccount | undefined> {
    if (this.iam.controller.getState().session === null) return undefined
    const payload = await this.readAccountClient().tokenBank.account.retrieve()
    const account = itemOf(payload)
    return {
      assetType: text(account?.assetType),
      available: pointsFromMicro(account?.availableAmount),
      frozen: pointsFromMicro(account?.frozenAmount),
      pending: pointsFromMicro(account?.pendingAmount),
    }
  }

  /**
   * Build or return the account-app client for the active environment. It is
   * cached apart from the commerce services because the balance reads must not
   * construct Membership or Order clients at all.
   * @returns The account-app client.
   */
  private readAccountClient(): SdkworkAccountAppClient {
    this.syncTokens()
    const baseUrl = appApiOrigin(this.env.apiBaseUrl())
    if (baseUrl === '') throw new Error('ui-sdkwork-token-plan: SDKWork API environment is not configured')
    if (this.accountClient?.baseUrl !== baseUrl) {
      this.accountClient = {
        baseUrl,
        client: createSdkworkAccountAppClient({ baseUrl, tokenManager: this.tokenManager }),
      }
    }
    return this.accountClient.client
  }

  /**
   * Read the signed-in account's plan and compute-point balance for the
   * settings-menu wallet card. A signed-out account returns undefined instead
   * of opening a sign-in surface: the menu already offers that row. Partial
   * gateway answers are kept, so a plan-name failure still shows the balance.
   * The reported `points` is the owned total (see `computeAccountTotal`), so a
   * model call starting or settling cannot change the figure the card shows.
   * @returns the account-wallet summary, or undefined while signed out.
   */
  async readAccountSummary(): Promise<TokenPlanAccountSummary | undefined> {
    if (this.iam.controller.getState().session === null) return undefined
    const membership = this.readCommerce().membership.memberships
    const [infoResult, statusResult, accountResult] = await Promise.allSettled([
      membership.current.retrieve(),
      membership.current.status.retrieve(),
      this.readComputeAccount(),
    ])
    if (
      infoResult.status === 'rejected'
      && statusResult.status === 'rejected'
      && accountResult.status === 'rejected'
    ) {
      throw infoResult.reason instanceof Error ? infoResult.reason : new Error(String(infoResult.reason))
    }
    const info = infoResult.status === 'fulfilled' ? itemOf(infoResult.value) : undefined
    const status = statusResult.status === 'fulfilled' ? itemOf(statusResult.value) : undefined
    const account = accountResult.status === 'fulfilled' ? accountResult.value : undefined
    return {
      planName: text(info?.planName),
      // The Token Bank wallet owns the compute balance. The membership status
      // `pointBalance` counts a different asset, so a failed wallet read
      // reports no balance rather than substituting that figure.
      points: computeAccountTotal(account),
      available: account?.available,
      frozen: account?.frozen,
      active: status?.active === true,
    }
  }

  /**
   * Read the plan and the Token Bank wallet (total plus the available/frozen
   * split) for the settings balances section, together with the recent Token
   * Bank ledger. The Membership points asset is a different account, so it is
   * never substituted here: every points surface in the app reads the wallet
   * the purchase dialog tops up. A partial gateway answer is kept: a failed
   * plan read still shows the balance, and a failed ledger still shows it.
   * @returns the points snapshot, or undefined while signed out.
   */
  async readPointsSnapshot(): Promise<TokenPlanPointsSnapshot | undefined> {
    if (this.iam.controller.getState().session === null) return undefined
    const membership = this.readCommerce().membership.memberships
    const [infoResult, statusResult, accountResult, historyResult] = await Promise.allSettled([
      membership.current.retrieve(),
      membership.current.status.retrieve(),
      this.readComputeAccount(),
      this.readTokenBankHistory(),
    ])
    if (
      infoResult.status === 'rejected'
      && statusResult.status === 'rejected'
      && accountResult.status === 'rejected'
      && historyResult.status === 'rejected'
    ) {
      throw infoResult.reason instanceof Error ? infoResult.reason : new Error(String(infoResult.reason))
    }
    const info = infoResult.status === 'fulfilled' ? itemOf(infoResult.value) : undefined
    const status = statusResult.status === 'fulfilled' ? itemOf(statusResult.value) : undefined
    const account = accountResult.status === 'fulfilled' ? accountResult.value : undefined
    return {
      planName: text(info?.planName),
      active: status?.active === true,
      points: computeAccountTotal(account),
      available: account?.available,
      frozen: account?.frozen,
      history: historyResult.status === 'fulfilled' ? historyResult.value : [],
    }
  }

  /**
   * Read the newest Token Bank ledger page through the same account client the
   * balance reads use, so a ledger failure cannot mask a balance.
   * @returns the projected ledger rows.
   */
  private async readTokenBankHistory(): Promise<TokenPlanPointsHistoryEntry[]> {
    const payload = await this.readAccountClient().tokenBank.ledgerEntries.list({
      page: '1',
      pageSize: '20',
    })
    return walletHistoryOf(payload)
  }

  /** Observe IAM or environment changes and invalidate environment-specific clients.
   * @param listener - Called after credentials or environment state changes.
   * @returns A disposer that removes both subscriptions.
   */
  subscribe(listener: () => void): () => void {
    const refresh = () => {
      if (this.baseUrl !== this.env.apiBaseUrl().trim()) {
        this.commerce = undefined
        this.accountClient = undefined
        this.teamPort = undefined
      }
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
