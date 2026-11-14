/**
 * BirdCoder implementation of the shared organization (team) subscription port.
 *
 * The seat surface, the policy form, and the checkout hand-off live in
 * `@sdkwork/membership-pc-subscription`; this adapter is the only place that
 * resolves the generated membership and IAM app clients and the order-owned
 * membership checkout, so the desktop plugin never assembles a URL, a header,
 * or a problem body by hand.
 *
 * Ownership split: membership publishes the team subscription overview and the
 * seat assignment rows; the organization roster, the caller's role, and the
 * organization name are IAM-owned; the order service owns the seat payment.
 */
import {
  createClient as createIamAppClient,
  type SdkworkAppClient as IamAppClient,
} from '@sdkwork/iam-app-sdk'
import {
  createClient as createMembershipAppClient,
  type SdkworkAppClient as MembershipAppClient,
} from '@sdkwork/membership-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'
import {
  normalizeSdkworkTeamError,
  parseOwnMemberships,
  readSdkworkTeamPackageNumericId,
  SdkworkTeamSubscriptionError,
  type SdkworkTeamCheckoutInput,
  type SdkworkTeamCheckoutPayment,
  type SdkworkTeamOwnMembership,
  type SdkworkTeamPackage,
  type SdkworkTeamRosterPage,
  type SdkworkTeamRosterQuery,
  type SdkworkTeamSeatAssignment,
  type SdkworkTeamSeatAssignmentResult,
  type SdkworkTeamSeatPolicyInput,
  type SdkworkTeamSeatReconciliationResult,
  type SdkworkTeamSubscriptionOverview,
  type SdkworkTeamSubscriptionPort,
} from '@sdkwork/membership-pc-subscription/catalog'
import type { SdkworkMembershipCheckoutService } from '@sdkwork/order-service'

/** Cart page sizes; IAM caps an organization roster page at 200 rows. */
const TEAM_PACKAGE_PAGE_SIZE = 200
const TEAM_PACKAGE_MAX_PAGES = 5
const TEAM_ROSTER_PAGE_SIZE = 200
const TEAM_SEAT_PAGE_SIZE = 100
const TEAM_SEAT_MAX_PAGES = 20

/** Inputs the Token Plan service already owns for the active deployment. */
export interface TokenPlanTeamSubscriptionPortInput {
  /** Gateway origin without the app-API suffix. */
  baseUrl: string
  /** Shared browser token manager carrying the merged IAM credentials. */
  tokenManager: AuthTokenManager
  /** Order-owned membership checkout the personal catalog already uses. */
  checkout: Pick<SdkworkMembershipCheckoutService, 'createCheckout' | 'getCheckoutStatus'>
  /**
   * Re-publishes the host's IAM credentials after an organization switch.
   *
   * The organization selection issues a new session; the host mirrors it into
   * the shared token manager so the next membership read carries the new
   * organization claim.
   */
  refreshSession?: () => Promise<void> | void
}

/** Reads the `totalItems` page counter, falling back to the page length. */
function readTotalItems(
  pageInfo: { totalItems?: string } | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(pageInfo?.totalItems ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/** Reads an organization name from one IAM organization row. */
function readOrganizationName(
  record: Record<string, unknown>,
  organizationId: string,
): string | undefined {
  const id = record.id ?? record.organizationId
  if (id !== organizationId) return undefined
  const name = [record.name, record.displayName]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return name?.trim()
}

/** Depth-bounded organization-name search over the IAM organization tree. */
function searchOrganizationName(
  value: unknown,
  organizationId: string,
  depth: number,
): string | undefined {
  if (depth > 6 || value === null || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = searchOrganizationName(entry, organizationId, depth + 1)
      if (found) return found
    }
    return undefined
  }
  const record = value as Record<string, unknown>
  const direct = readOrganizationName(record, organizationId)
  if (direct) return direct
  for (const entry of Object.values(record)) {
    const found = searchOrganizationName(entry, organizationId, depth + 1)
    if (found) return found
  }
  return undefined
}

/** Maps the order-owned checkout payment onto the shared team payment. */
function toTeamCheckoutPayment(
  payment: Awaited<ReturnType<SdkworkMembershipCheckoutService['createCheckout']>>,
): SdkworkTeamCheckoutPayment {
  return {
    status: payment.status,
    ...(payment.orderId ? { orderId: payment.orderId } : {}),
    ...(payment.qrCode ? { qrCode: payment.qrCode } : {}),
    ...(payment.cashierUrl ? { cashierUrl: payment.cashierUrl } : {}),
    ...(payment.amountCny === undefined ? {} : { amountCny: payment.amountCny }),
    ...(payment.expiresAt ? { expiresAt: payment.expiresAt } : {}),
  }
}

/**
 * Builds the team subscription port over the active deployment's clients.
 *
 * @param input - gateway origin, shared token manager, and the order checkout.
 * @returns the port the shared team surface reads through.
 */
export function createTokenPlanTeamSubscriptionPort(
  input: TokenPlanTeamSubscriptionPortInput,
): SdkworkTeamSubscriptionPort {
  let membershipClient: MembershipAppClient | undefined
  let iamClient: IamAppClient | undefined

  function memberships(): MembershipAppClient['memberships'] {
    if (membershipClient === undefined) {
      membershipClient = createMembershipAppClient({
        authMode: 'dual-token',
        baseUrl: input.baseUrl,
        platform: 'pc',
        tokenManager: input.tokenManager,
      })
    }
    return membershipClient.memberships
  }

  function iam(): IamAppClient['iam'] {
    if (iamClient === undefined) {
      iamClient = createIamAppClient({
        authMode: 'dual-token',
        baseUrl: input.baseUrl,
        platform: 'pc',
        tokenManager: input.tokenManager,
      })
    }
    return iamClient.iam
  }

  function iamAuth(): IamAppClient['auth'] {
    if (iamClient === undefined) {
      iamClient = createIamAppClient({
        authMode: 'dual-token',
        baseUrl: input.baseUrl,
        platform: 'pc',
        tokenManager: input.tokenManager,
      })
    }
    return iamClient.auth
  }

  return {
    async getOverview(): Promise<SdkworkTeamSubscriptionOverview> {
      try {
        return await memberships().teamSubscription.retrieve()
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    async listSeatAssignments(seatLimit: number): Promise<readonly SdkworkTeamSeatAssignment[]> {
      try {
        const api = memberships()
        const cap = Math.max(1, Math.trunc(seatLimit))
        const collected: SdkworkTeamSeatAssignment[] = []
        for (let page = 1; page <= TEAM_SEAT_MAX_PAGES; page += 1) {
          const result = await api.teamSeats.list({ page, pageSize: TEAM_SEAT_PAGE_SIZE })
          collected.push(...result.items)
          if (result.pageInfo?.hasMore !== true || collected.length >= cap) break
        }
        return collected.slice(0, cap)
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    async listRosterPage(query: SdkworkTeamRosterQuery): Promise<SdkworkTeamRosterPage> {
      try {
        const result = await iam().organizations.members.list(query.organizationId, {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.q?.trim() ? { q: query.q.trim() } : {}),
        })
        return {
          hasMore: result.pageInfo?.hasMore === true,
          items: result.items,
          page: result.pageInfo?.page ?? query.page,
          pageSize: result.pageInfo?.pageSize ?? query.pageSize,
          total: readTotalItems(result.pageInfo, result.items.length),
        }
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    async listOwnMemberships(): Promise<readonly SdkworkTeamOwnMembership[]> {
      try {
        const result = await iam().organizationMemberships.list({
          pageSize: TEAM_ROSTER_PAGE_SIZE,
        })
        return parseOwnMemberships(result.items)
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    async listPackages(): Promise<readonly SdkworkTeamPackage[]> {
      try {
        const api = memberships()
        const packages: SdkworkTeamPackage[] = []
        for (let page = 1; page <= TEAM_PACKAGE_MAX_PAGES; page += 1) {
          const result = await api.packages.list({
            audience: 'team',
            category: 'token',
            page,
            pageSize: TEAM_PACKAGE_PAGE_SIZE,
          })
          packages.push(...result.items)
          if (!result.pageInfo.hasMore) break
        }
        return packages
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    /**
     * Displays the organization name from the IAM directory when it is readable.
     *
     * Both IAM reads are permission-gated, so a failure here is not fatal: the
     * surface falls back to the organization id.
     */
    async loadOrganizationName(organizationId: string): Promise<string | undefined> {
      const directory = iam()
      try {
        const page = await directory.organizations.list({ pageSize: TEAM_ROSTER_PAGE_SIZE })
        for (const item of page.items) {
          const name = readOrganizationName(item, organizationId)
          if (name) return name
        }
      } catch {
        // Fall through to the tree read; the surface has a display fallback.
      }
      try {
        const tree = await directory.organizations.tree.retrieve()
        return searchOrganizationName(tree, organizationId, 0)
      } catch {
        return undefined
      }
    },

    async assignSeat(userId: string): Promise<SdkworkTeamSeatAssignmentResult> {
      try {
        return await memberships().teamSeats.create({ userId })
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    async revokeSeat(userId: string): Promise<void> {
      try {
        await memberships().teamSeats.delete(userId)
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    async updateSeatPolicy(
      policy: SdkworkTeamSeatPolicyInput,
    ): Promise<SdkworkTeamSubscriptionOverview> {
      try {
        return await memberships().teamSeats.policy.update({
          autoAssignSeat: policy.autoAssignSeat,
          seatPolicy: policy.seatPolicy,
        })
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    async reconcileSeats(): Promise<SdkworkTeamSeatReconciliationResult> {
      try {
        return await memberships().teamSeats.reconcile()
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    /**
     * Binds the caller's paid-but-unbound team subscription to an organization.
     *
     * Business rule: a team subscription can be bought before any organization
     * exists. The membership endpoint answers that unbound purchase
     * (`organizationBindingStatus: 'unbound'`, empty `organizationId`) and this
     * call consumes it after IAM authorizes the caller's `TEAM_SEAT_MANAGE`
     * capability in the target organization.
     */
    async bindOrganization(organizationId: string): Promise<SdkworkTeamSubscriptionOverview> {
      try {
        return await memberships().teamSubscription.bind({ organizationId })
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    /**
     * Starts the order-owned membership checkout for a team plan.
     *
     * `quantity` is the seat count of the requested action: the total seat
     * count for a first `purchase`, or the number of ADDITIONAL seats for
     * `add_seats`. A `purchase` needs no organization: the paid order is
     * fulfilled as an unbound team subscription and bound afterwards.
     */
    async startCheckout(teamCheckout: SdkworkTeamCheckoutInput): Promise<SdkworkTeamCheckoutPayment> {
      try {
        const payment = await input.checkout.createCheckout({
          action: teamCheckout.action,
          packageId: readSdkworkTeamPackageNumericId(teamCheckout.packageId),
          quantity: teamCheckout.seats,
          paymentMethod: 'WECHAT',
          paymentProduct: 'mobile_cashier_h5',
        })
        return toTeamCheckoutPayment(payment)
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    async getCheckoutStatus(orderId: string): Promise<SdkworkTeamCheckoutPayment> {
      try {
        return toTeamCheckoutPayment(await input.checkout.getCheckoutStatus(orderId))
      } catch (error) {
        throw normalizeSdkworkTeamError(error)
      }
    },

    /**
     * Switches the IAM session to another organization.
     *
     * The membership team endpoints resolve the organization from the
     * authenticated principal, so the session must be organization-scoped before
     * the overview/roster reads can succeed. The IAM app API's organization
     * selection continues a sign-in challenge; when this session has no pending
     * challenge the platform answers 400 and the surface sends the user through
     * a fresh sign-in instead of silently dropping the session.
     */
    async switchOrganization(organizationId: string): Promise<void> {
      try {
        await iamAuth().sessions.organizationSelection.create({ organizationId })
      } catch (error) {
        const normalized = normalizeSdkworkTeamError(error)
        if (normalized.httpStatus === 400) {
          throw new SdkworkTeamSubscriptionError(
            'organization_sign_in_required',
            normalized.message,
            normalized.httpStatus,
          )
        }
        throw normalized
      }
      await input.refreshSession?.()
    },
  }
}
