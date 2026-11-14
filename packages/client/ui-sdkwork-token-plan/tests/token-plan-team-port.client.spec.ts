// @vitest-environment node
// The team port is the desktop host half of the shared team surface: it reads
// membership-owned facts through the generated membership app SDK, the roster
// and role through the generated IAM app SDK, and starts the seat payment
// through the order-owned checkout. These tests pin that mapping so the shared
// surface never has to know which SDK answers a fact.
import { describe, expect, it, vi } from 'vitest'

const membershipState = {
  overviewIssue: undefined as unknown,
  bindIssue: undefined as unknown,
  unboundOverview: false,
  packagePages: [] as Array<{ items: unknown[]; pageInfo: { hasMore: boolean } }>,
  packageGroupPages: [] as Array<{ items: unknown[]; pageInfo: { hasMore: boolean } }>,
  seatPages: [] as Array<{ hasMore?: boolean; items: unknown[] }>,
  calls: [] as Array<{ method: string; args: unknown[] }>,
}

const iamState = {
  organizationPages: [] as Array<{ items: unknown[]; pageInfo: Record<string, unknown> }>,
  rosterPages: [] as Array<{ items: unknown[]; pageInfo: Record<string, unknown> }>,
  ownMemberships: { items: [] as unknown[], pageInfo: { mode: 'offset' } },
  organizationSelectionIssue: undefined as unknown,
  calls: [] as Array<{ method: string; args: unknown[] }>,
}

vi.mock('@sdkwork/membership-app-sdk', () => ({
  createClient: () => ({
    memberships: {
      packages: {
        list: async (params: Record<string, unknown>) => {
          membershipState.calls.push({ method: 'packages.list', args: [params] })
          return membershipState.packagePages.shift()
            ?? { items: [], pageInfo: { hasMore: false } }
        },
      },
      packageGroups: {
        list: async (params: Record<string, unknown>) => {
          membershipState.calls.push({ method: 'packageGroups.list', args: [params] })
          return membershipState.packageGroupPages.shift()
            ?? { items: [], pageInfo: { hasMore: false } }
        },
      },
      teamSeats: {
        create: async (body: { userId: string }) => {
          membershipState.calls.push({ method: 'teamSeats.create', args: [body] })
          return { assignedAt: '2026-01-01T00:00:00Z', seatNo: 1, userId: body.userId }
        },
        delete: async (userId: string) => {
          membershipState.calls.push({ method: 'teamSeats.delete', args: [userId] })
        },
        list: async (params: Record<string, unknown>) => {
          membershipState.calls.push({ method: 'teamSeats.list', args: [params] })
          return membershipState.seatPages.shift() ?? { items: [], pageInfo: { mode: 'offset' } }
        },
        reconcile: async () => {
          membershipState.calls.push({ method: 'teamSeats.reconcile', args: [] })
          return { revokedCount: 2, seatsPurchased: 5, seatsUsed: 3 }
        },
        policy: {
          update: async (body: Record<string, unknown>) => {
            membershipState.calls.push({ method: 'teamSeats.policy.update', args: [body] })
            if (membershipState.overviewIssue !== undefined) throw membershipState.overviewIssue
            return {
              autoAssignSeat: body.autoAssignSeat,
              hasSubscription: true,
              organizationId: 'org-1',
              seatPolicy: body.seatPolicy,
              seatsAvailable: 2,
              seatsPurchased: 5,
              seatsUsed: 3,
            }
          },
        },
      },
      teamSubscription: {
        bind: async (body: { organizationId: string }) => {
          membershipState.calls.push({ method: 'teamSubscription.bind', args: [body] })
          if (membershipState.bindIssue !== undefined) throw membershipState.bindIssue
          return {
            autoAssignSeat: true,
            hasSubscription: true,
            organizationBindingStatus: 'bound',
            organizationId: body.organizationId,
            seatPolicy: 'strict',
            seatsAvailable: 5,
            seatsPurchased: 5,
            seatsUsed: 0,
          }
        },
        retrieve: async () => {
          membershipState.calls.push({ method: 'teamSubscription.retrieve', args: [] })
          if (membershipState.overviewIssue !== undefined) throw membershipState.overviewIssue
          if (membershipState.unboundOverview) {
            return {
              autoAssignSeat: true,
              hasSubscription: true,
              organizationBindingStatus: 'unbound',
              organizationId: '',
              seatPolicy: 'strict',
              seatsAvailable: 5,
              seatsPurchased: 5,
              seatsUsed: 0,
            }
          }
          return {
            autoAssignSeat: true,
            hasSubscription: true,
            organizationId: 'org-1',
            seatPolicy: 'strict',
            seatsAvailable: 2,
            seatsPurchased: 5,
            seatsUsed: 3,
          }
        },
      },
    },
  }),
}))

vi.mock('@sdkwork/iam-app-sdk', () => ({
  createClient: () => ({
    auth: {
      sessions: {
        organizationSelection: {
          create: async (body: { organizationId?: string }) => {
            iamState.calls.push({ method: 'auth.sessions.organizationSelection.create', args: [body] })
            if (iamState.organizationSelectionIssue !== undefined) {
              throw iamState.organizationSelectionIssue
            }
            return { accessToken: 'next-access', authToken: 'next-auth' }
          },
        },
      },
    },
    iam: {
      organizationMemberships: {
        list: async () => iamState.ownMemberships,
      },
      organizations: {
        list: async () => iamState.organizationPages.shift() ?? { items: [], pageInfo: {} },
        members: {
          list: async (organizationId: string, params: Record<string, unknown>) => {
            membershipState.calls.push({
              method: 'organizations.members.list',
              args: [organizationId, params],
            })
            return iamState.rosterPages.shift()
              ?? { items: [], pageInfo: { mode: 'offset', page: 1, pageSize: 10, totalItems: '0' } }
          },
        },
        tree: { retrieve: async () => ({}) },
      },
    },
  }),
}))

const { createTokenPlanTeamSubscriptionPort } = await import(
  '../src/client/team-subscription-port.ts',
)

const checkoutCalls: Array<Record<string, unknown>> = []
const refreshCalls: number[] = []

function createPort() {
  return createTokenPlanTeamSubscriptionPort({
    baseUrl: 'https://api.example.test',
    checkout: {
      createCheckout: async (input) => {
        checkoutCalls.push({ ...input })
        return {
          amountCny: 199,
          durationDays: 30,
          expiresAt: '2026-01-01T00:10:00Z',
          orderId: 'order-9',
          packageId: input.packageId ?? null,
          qrCode: 'weixin://pay/9',
          status: 'pending',
        }
      },
      getCheckoutStatus: async () => ({
        amountCny: 199,
        durationDays: 30,
        orderId: 'order-9',
        packageId: null,
        qrCode: 'weixin://pay/9',
        status: 'completed',
      }),
    },
    refreshSession: () => { refreshCalls.push(Date.now()) },
    tokenManager: {} as never,
  })
}

describe('desktop team subscription port', () => {
  it('pages the IAM roster with the search term and normalizes the totals', async () => {
    iamState.rosterPages = [{
      items: [{
        displayName: 'Ada',
        email: 'ada@example.test',
        isPrimary: true,
        membershipId: 'm-1',
        membershipKind: 'owner',
        status: 'active',
        userId: 'u-1',
        username: 'ada',
      }],
      pageInfo: { hasMore: true, mode: 'offset', page: 2, pageSize: 10, totalItems: '21' },
    }]
    const port = createPort()

    const page = await port.listRosterPage({
      organizationId: 'org-1',
      page: 2,
      pageSize: 10,
      q: ' ada ',
    })

    expect(page).toMatchObject({ hasMore: true, page: 2, pageSize: 10, total: 21 })
    expect(page.items[0]?.membershipKind).toBe('owner')
    const rosterCall = membershipState.calls.find(
      call => call.method === 'organizations.members.list',
    )
    expect(rosterCall?.args).toEqual([
      'org-1',
      { page: 2, pageSize: 10, q: 'ada' },
    ])
  })

  it('reads team packages with the team audience and the token category', async () => {
    membershipState.packagePages = [{
      items: [{
        id: '42',
        name: 'Team 10 seats',
        planId: 'plan-1',
        planRank: '1',
        price: '199.00',
        recommended: true,
        recurrenceCycle: 'month',
        seatMax: '50',
        seatMin: '5',
        seatPointsAmount: '1000',
        sortWeight: '1',
      }],
      pageInfo: { hasMore: false },
    }]
    const port = createPort()

    const packages = await port.listPackages()

    expect(packages).toHaveLength(1)
    expect(packages[0]?.seatMin).toBe('5')
    const packagesCall = membershipState.calls.find(call => call.method === 'packages.list')
    expect(packagesCall?.args[0]).toMatchObject({
      audience: 'team',
      category: 'token',
      page: 1,
    })
  })

  it('reads the four team billing groups the cycle tabs render', async () => {
    membershipState.calls.length = 0
    membershipState.packageGroupPages = [
      {
        items: [
          {
            audience: 'team',
            billingCycle: 'year',
            description: '9.7折',
            durationDays: '365',
            id: '601',
            name: '连续包年',
            packages: [{
              id: '612',
              name: '团队基础版 - 按年按坐席',
              packageGroupId: '601',
              planId: 'plan-team-starter',
              planRank: '11',
              price: '999',
              recommended: false,
              recurrenceCycle: 'year',
              seatMax: '200',
              seatMin: '3',
              seatPointsAmount: '5000',
              sortWeight: '11',
            }],
          },
          {
            audience: 'team',
            billingCycle: 'month',
            description: '9.9折',
            durationDays: '30',
            id: '602',
            name: '连续包月',
            packages: [],
          },
        ],
        pageInfo: { hasMore: true },
      },
      {
        items: [
          {
            audience: 'team',
            billingCycle: 'quarter',
            description: '9.8折',
            durationDays: '90',
            id: '603',
            name: '连续包季',
            packages: [],
          },
          {
            audience: 'team',
            billingCycle: 'once',
            durationDays: '30',
            id: '604',
            name: '单月购买',
            packages: [],
          },
        ],
        pageInfo: { hasMore: false },
      },
    ]
    const port = createPort()

    const groups = await port.listPackageGroups()

    expect(groups.map(group => group.id)).toEqual(['601', '602', '603', '604'])
    expect(groups[0]?.name).toBe('连续包年')
    expect(groups[0]?.description).toBe('9.7折')
    expect(groups[0]?.billingCycle).toBe('year')
    expect(groups[0]?.durationDays).toBe('365')
    expect(groups[0]?.packages[0]?.packageGroupId).toBe('601')
    const groupCalls = membershipState.calls.filter(call => call.method === 'packageGroups.list')
    expect(groupCalls).toHaveLength(2)
    expect(groupCalls[0]?.args[0]).toMatchObject({
      audience: 'team',
      category: 'token',
      page: 1,
    })
    expect(groupCalls[1]?.args[0]).toMatchObject({ page: 2 })
  })

  it('sends the seat count as the order quantity of the requested checkout action', async () => {
    checkoutCalls.length = 0
    const port = createPort()

    const payment = await port.startCheckout({
      action: 'add_seats',
      packageId: '42',
      seats: 3,
    })

    expect(payment).toMatchObject({ orderId: 'order-9', status: 'pending' })
    expect(payment.qrCode).toBe('weixin://pay/9')
    expect(checkoutCalls[0]).toMatchObject({
      action: 'add_seats',
      packageId: 42,
      quantity: 3,
      paymentProduct: 'mobile_cashier_h5',
    })
  })

  it('rejects a package id that does not round-trip through a safe integer', async () => {
    const port = createPort()

    await expect(port.startCheckout({
      action: 'purchase',
      packageId: '9007199254740993',
      seats: 2,
    })).rejects.toMatchObject({ reason: 'unknown' })
  })

  it('maps the membership problem reason onto the shared failure vocabulary', async () => {
    membershipState.overviewIssue = Object.assign(new Error('conflict'), {
      httpStatus: 409,
      problem: { code: 40901, detail: 'seat taken', reason: 'seat_already_assigned' },
    })
    const port = createPort()

    await expect(port.getOverview()).rejects.toMatchObject({
      httpStatus: 409,
      reason: 'seat_already_assigned',
    })
    membershipState.overviewIssue = undefined
  })

  it('classifies an unauthenticated platform code as the unauthenticated reason', async () => {
    membershipState.overviewIssue = Object.assign(new Error('unauthorized'), {
      problem: { code: 40101 },
    })
    const port = createPort()

    await expect(port.getOverview()).rejects.toMatchObject({ reason: 'unauthenticated' })
    membershipState.overviewIssue = undefined
  })

  it('reconciles the seat ledger through the membership command', async () => {
    const port = createPort()

    await expect(port.reconcileSeats()).resolves.toEqual({
      revokedCount: 2,
      seatsPurchased: 5,
      seatsUsed: 3,
    })
    expect(membershipState.calls.some(call => call.method === 'teamSeats.reconcile')).toBe(true)
  })

  it('binds the unbound team subscription to the selected organization', async () => {
    membershipState.bindIssue = undefined
    membershipState.calls.length = 0
    const port = createPort()

    const bound = await port.bindOrganization('org-team')

    expect(bound).toMatchObject({
      organizationBindingStatus: 'bound',
      organizationId: 'org-team',
      seatsPurchased: 5,
    })
    const bindCall = membershipState.calls.find(call => call.method === 'teamSubscription.bind')
    expect(bindCall?.args).toEqual([{ organizationId: 'org-team' }])
  })

  it('normalizes a bind conflict into the shared failure vocabulary', async () => {
    membershipState.bindIssue = Object.assign(new Error('conflict'), {
      httpStatus: 409,
      problem: {
        code: 40901,
        detail: 'organization already subscribed',
        reason: 'team_organization_already_subscribed',
        status: 409,
      },
    })
    const port = createPort()

    await expect(port.bindOrganization('org-team')).rejects.toMatchObject({
      httpStatus: 409,
      reason: 'team_organization_already_subscribed',
    })
    membershipState.bindIssue = undefined
  })

  it('reports the unbound state and buys a team plan without an organization', async () => {
    membershipState.unboundOverview = true
    checkoutCalls.length = 0
    const port = createPort()

    const overview = await port.getOverview()
    expect(overview).toMatchObject({
      hasSubscription: true,
      organizationBindingStatus: 'unbound',
      organizationId: '',
    })

    // A first team purchase carries no organization: the seat count is the whole
    // order quantity and the backend fulfils it as an unbound subscription.
    await port.startCheckout({ action: 'purchase', packageId: '42', seats: 5 })
    expect(checkoutCalls[0]).toMatchObject({
      action: 'purchase',
      packageId: 42,
      quantity: 5,
    })
    membershipState.unboundOverview = false
  })

  it('switches the organization through the IAM selection and refreshes the session', async () => {
    iamState.organizationSelectionIssue = undefined
    iamState.calls.length = 0
    refreshCalls.length = 0
    const port = createPort()

    await port.switchOrganization('org-team')

    const selection = iamState.calls.find(
      call => call.method === 'auth.sessions.organizationSelection.create',
    )
    expect(selection?.args[0]).toMatchObject({ organizationId: 'org-team' })
    expect(refreshCalls).toHaveLength(1)
  })

  it('asks for a fresh sign-in when the platform cannot switch this session', async () => {
    iamState.organizationSelectionIssue = Object.assign(new Error('continuation required'), {
      httpStatus: 400,
      problem: {
        code: 40001,
        detail: 'login continuation token is required',
        status: 400,
      },
    })
    refreshCalls.length = 0
    const port = createPort()

    await expect(port.switchOrganization('org-team')).rejects.toMatchObject({
      reason: 'organization_sign_in_required',
    })
    expect(refreshCalls).toHaveLength(0)
    iamState.organizationSelectionIssue = undefined
  })
})
