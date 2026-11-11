import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasTokenPlanCheckoutSession,
  readTokenPlanSessionTokens,
  TokenPlanService,
  type EnvServiceLike,
  type IamServiceLike,
  type TokenPlanIamSession,
} from '../src/client/token-plan-service.ts'

const membership = vi.hoisted(() => ({
  bootstrap: vi.fn(() => ({ memberships: {} })),
  configureProvider: vi.fn(),
  configureTokens: vi.fn(),
}))

const order = vi.hoisted(() => ({
  bootstrap: vi.fn(() => ({ memberships: { orders: { create: vi.fn() } } })),
  configureProvider: vi.fn(),
  configureTokens: vi.fn(),
  createCheckout: vi.fn(() => ({ createCheckout: vi.fn(), getCheckoutStatus: vi.fn() })),
  createCoupon: vi.fn(() => ({ redeem: vi.fn() })),
  createRecharge: vi.fn(() => ({ listPackages: vi.fn(), createOrder: vi.fn(), getOrderStatus: vi.fn() })),
}))

vi.mock('@sdkwork/membership-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sdkwork/membership-service')>()
  return {
    ...actual,
    bootstrapSdkworkMembershipAppService: membership.bootstrap,
    configureSdkworkMembershipAppServiceProvider: membership.configureProvider,
    configureSdkworkMembershipSessionTokenProvider: membership.configureTokens,
  }
})

vi.mock('@sdkwork/order-service', () => ({
  bootstrapSdkworkOrderAppService: order.bootstrap,
  configureSdkworkOrderAppServiceProvider: order.configureProvider,
  configureSdkworkOrderSessionTokenProvider: order.configureTokens,
  createSdkworkMembershipCheckoutService: order.createCheckout,
  createSdkworkCouponRechargeService: order.createCoupon,
  createSdkworkPointsRechargeService: order.createRecharge,
}))

describe('readTokenPlanSessionTokens', () => {
  it('prefers IAM dual tokens over the env bootstrap access token', () => {
    expect(readTokenPlanSessionTokens({
      accessToken: ' iam-access ',
      authToken: ' iam-auth ',
      refreshToken: ' iam-refresh ',
    }, 'env-access')).toEqual({
      accessToken: 'iam-access',
      authToken: 'iam-auth',
      refreshToken: 'iam-refresh',
    })
  })

  it('fills Access-Token from env when a signed-in session only has authToken', () => {
    const tokens = readTokenPlanSessionTokens({ authToken: 'iam-auth' }, ' env-access ')
    expect(tokens).toEqual({ accessToken: 'env-access', authToken: 'iam-auth' })
    expect(hasTokenPlanCheckoutSession(tokens)).toBe(true)
  })

  it('keeps the env access token as the anonymous catalog credential', () => {
    const tokens = readTokenPlanSessionTokens(null, 'env-access')
    expect(tokens).toEqual({ accessToken: 'env-access' })
    expect(hasTokenPlanCheckoutSession(tokens)).toBe(false)
  })

  it('returns an empty snapshot when no credentials exist', () => {
    expect(readTokenPlanSessionTokens(null, '  ')).toEqual({})
    expect(hasTokenPlanCheckoutSession({})).toBe(false)
  })
})

function harness(initial: {
  configured?: boolean
  baseUrl?: string
  accessToken?: string
  session?: TokenPlanIamSession | null
}) {
  let envListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let baseUrl = initial.baseUrl ?? 'https://api.example'
  let accessToken = initial.accessToken ?? ''
  let session = initial.session ?? null
  const env: EnvServiceLike = {
    isConfigured: () => initial.configured ?? true,
    apiBaseUrl: () => baseUrl,
    accessToken: () => accessToken,
    subscribe: (listener) => {
      envListener = listener
      return () => { envListener = undefined }
    },
  }
  const iam: IamServiceLike = {
    controller: {
      getState: () => ({ session }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
    openSignIn: vi.fn(),
    requireSignedInInPlace: vi.fn(async () => undefined),
  }
  return {
    env,
    iam,
    setBaseUrl: (value: string) => { baseUrl = value },
    setAccessToken: (value: string) => { accessToken = value },
    setSession: (value: TokenPlanIamSession | null) => { session = value },
    fireEnv: () => { envListener?.() },
    fireIam: () => { iamListener?.() },
  }
}

describe('TokenPlanService sign-in gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks for a session before the recharge order and resumes that same call', async () => {
    const fixture = harness({ session: { accessToken: 'access', authToken: 'auth' } })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    const commerce = service.readCommerce()
    const inner = order.createRecharge.mock.results.at(-1)?.value as { createOrder: ReturnType<typeof vi.fn> }
    inner.createOrder.mockResolvedValue({ orderId: 'order-1', status: 'pending' })
    await expect(commerce.recharge.createOrder({ packageId: 'pkg-1' })).resolves.toEqual({ orderId: 'order-1', status: 'pending' })
    const requireSignedInInPlace = fixture.iam.requireSignedInInPlace as unknown as ReturnType<typeof vi.fn>
    expect(requireSignedInInPlace).toHaveBeenCalledTimes(1)
    expect(inner.createOrder).toHaveBeenCalledWith({ packageId: 'pkg-1' })
    expect(requireSignedInInPlace.mock.invocationCallOrder[0]).toBeLessThan(
      inner.createOrder.mock.invocationCallOrder[0] as number,
    )
  })

  it('asks for a session before redeeming a coupon', async () => {
    const fixture = harness({ session: { accessToken: 'access', authToken: 'auth' } })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    const commerce = service.readCommerce()
    const inner = order.createCoupon.mock.results.at(-1)?.value as { redeem: ReturnType<typeof vi.fn> }
    inner.redeem.mockResolvedValue({ benefitKind: 'points_credit', grantPoints: 12 })
    await expect(commerce.coupon.redeem('CODE')).resolves.toEqual({ benefitKind: 'points_credit', grantPoints: 12 })
    const requireSignedInInPlace = fixture.iam.requireSignedInInPlace as unknown as ReturnType<typeof vi.fn>
    expect(requireSignedInInPlace).toHaveBeenCalledTimes(1)
    expect(inner.redeem).toHaveBeenCalledWith('CODE', undefined)
  })

  it('reports the localized notice and runs nothing when the user dismisses sign-in', async () => {
    const fixture = harness({ session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    const commerce = service.readCommerce()
    const recharge = order.createRecharge.mock.results.at(-1)?.value as { createOrder: ReturnType<typeof vi.fn> }
    const coupon = order.createCoupon.mock.results.at(-1)?.value as { redeem: ReturnType<typeof vi.fn> }
    const requireSignedInInPlace = fixture.iam.requireSignedInInPlace as unknown as ReturnType<typeof vi.fn>
    requireSignedInInPlace.mockRejectedValueOnce(new Error('dismissed'))
    await expect(commerce.recharge.createOrder({ packageId: 'pkg-1' })).rejects.toThrow('sign-in-required')
    expect(recharge.createOrder).not.toHaveBeenCalled()
    requireSignedInInPlace.mockRejectedValueOnce(new Error('dismissed'))
    await expect(commerce.coupon.redeem('CODE')).rejects.toThrow('sign-in-required')
    expect(coupon.redeem).not.toHaveBeenCalled()
  })
})

describe('TokenPlanService account summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the plan name and point balance for the settings wallet card', async () => {
    const retrieve = vi.fn().mockResolvedValue({
      code: 0,
      data: { item: { planName: '体验版' } },
    })
    const retrieveStatus = vi.fn().mockResolvedValue({
      code: 0,
      data: { item: { active: true, pointBalance: 610.57 } },
    })
    membership.bootstrap.mockImplementationOnce(() => ({
      memberships: { current: { retrieve, status: { retrieve: retrieveStatus } } },
    }))
    const fixture = harness({ session: { accessToken: 'access', authToken: 'auth' } })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')

    await expect(service.readAccountSummary()).resolves.toEqual({
      planName: '体验版',
      points: 610.57,
      active: true,
    })
  })

  it('keeps the balance when only the plan read fails', async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error('plan endpoint down'))
    const retrieveStatus = vi.fn().mockResolvedValue({ active: false, pointBalance: 12.5 })
    membership.bootstrap.mockImplementationOnce(() => ({
      memberships: { current: { retrieve, status: { retrieve: retrieveStatus } } },
    }))
    const fixture = harness({ session: { accessToken: 'access', authToken: 'auth' } })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')

    await expect(service.readAccountSummary()).resolves.toEqual({
      planName: undefined,
      points: 12.5,
      active: false,
    })
  })

  it('does not reach the network while signed out', async () => {
    const fixture = harness({ session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    await expect(service.readAccountSummary()).resolves.toBeUndefined()
    expect(membership.bootstrap).not.toHaveBeenCalled()
  })
})

describe('TokenPlanService points snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the plan, wallet split, and recent ledger', async () => {
    const retrieve = vi.fn().mockResolvedValue({ planName: '体验版' })
    const retrieveStatus = vi.fn().mockResolvedValue({ active: true, pointBalance: 610.57 })
    const retrieveBalance = vi.fn().mockResolvedValue({ points: 610.57, availablePoints: 600.57, frozenPoints: 10 })
    const listHistory = vi.fn().mockResolvedValue({
      code: 0,
      data: {
        items: [
          { id: 'h1', changeAmount: -4.34, afterBalance: 610.57, sourceType: 'usage', remark: '自动化任务', createdAt: '2026-11-11T09:07:00Z' },
          { id: 'h2', changeAmount: 100, afterBalance: 614.91, sourceType: 'reward' },
        ],
        pageInfo: { mode: 'offset', page: 1, pageSize: 20, totalItems: 2 },
      },
    })
    membership.bootstrap.mockImplementationOnce(() => ({
      memberships: {
        current: { retrieve, status: { retrieve: retrieveStatus } },
        points: { balance: { retrieve: retrieveBalance }, history: { list: listHistory } },
      },
    }))
    const fixture = harness({ session: { accessToken: 'access', authToken: 'auth' } })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')

    await expect(service.readPointsSnapshot()).resolves.toEqual({
      planName: '体验版',
      active: true,
      points: 610.57,
      available: 600.57,
      frozen: 10,
      history: [
        {
          id: 'h1',
          changeAmount: -4.34,
          afterBalance: 610.57,
          sourceType: 'usage',
          remark: '自动化任务',
          createdAt: '2026-11-11T09:07:00Z',
        },
        {
          id: 'h2',
          changeAmount: 100,
          afterBalance: 614.91,
          sourceType: 'reward',
          remark: undefined,
          createdAt: undefined,
        },
      ],
    })
    expect(listHistory).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
  })

  it('degrades a malformed history page to an empty ledger', async () => {
    const retrieve = vi.fn().mockResolvedValue({ planName: '体验版' })
    const retrieveStatus = vi.fn().mockResolvedValue({ active: false, pointBalance: 0 })
    const retrieveBalance = vi.fn().mockResolvedValue({ points: 0, availablePoints: 0, frozenPoints: 0 })
    const listHistory = vi.fn().mockResolvedValue({ code: 500, detail: 'history unavailable' })
    membership.bootstrap.mockImplementationOnce(() => ({
      memberships: {
        current: { retrieve, status: { retrieve: retrieveStatus } },
        points: { balance: { retrieve: retrieveBalance }, history: { list: listHistory } },
      },
    }))
    const fixture = harness({ session: { accessToken: 'access', authToken: 'auth' } })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')

    const snapshot = await service.readPointsSnapshot()
    expect(snapshot?.history).toEqual([])
    expect(snapshot?.points).toBe(0)
  })

  it('does not reach the network while signed out', async () => {
    const fixture = harness({ session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    await expect(service.readPointsSnapshot()).resolves.toBeUndefined()
    expect(membership.bootstrap).not.toHaveBeenCalled()
  })
})

describe('TokenPlanService checkout session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is unconfigured until the environment says otherwise', () => {
    const fixture = harness({ configured: false, baseUrl: '', session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    expect(service.isConfigured()).toBe(false)
  })

  it('publishes merged dual tokens to Membership and Order session providers', () => {
    const fixture = harness({
      accessToken: 'env-access',
      session: { authToken: 'iam-auth' },
    })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    expect(service.hasCheckoutSession()).toBe(true)
    const commerce = service.readCommerce()
    expect(commerce.checkout).toBe(order.createCheckout.mock.results[0]?.value)
    const membershipProvider = membership.configureTokens.mock.calls.at(-1)?.[0] as () => object
    const orderProvider = order.configureTokens.mock.calls.at(-1)?.[0] as () => object
    expect(membershipProvider()).toEqual({ accessToken: 'env-access', authToken: 'iam-auth' })
    expect(orderProvider()).toEqual({ accessToken: 'env-access', authToken: 'iam-auth' })
    expect(membership.bootstrap).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://api.example',
      tokenManager: expect.anything(),
    }))
    const bootstrapInput = membership.bootstrap.mock.calls.at(0)?.[0] as Record<string, unknown> | undefined
    expect(bootstrapInput).not.toHaveProperty('platform')
    expect(membership.configureProvider.mock.calls.at(-1)?.[0]()).toBe(membership.bootstrap.mock.results[0]?.value)
    expect(order.configureProvider.mock.calls.at(-1)?.[0]()).toBe(order.bootstrap.mock.results[0]?.value)
  })

  it('does not treat an env-only access token as a checkout session', () => {
    const fixture = harness({ accessToken: 'env-access', session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    expect(service.hasCheckoutSession()).toBe(false)
    service.readCommerce()
    const membershipProvider = membership.configureTokens.mock.calls.at(-1)?.[0] as () => object
    expect(membershipProvider()).toEqual({ accessToken: 'env-access' })
  })

  it('rebuilds commerce clients when the API origin changes', () => {
    const fixture = harness({ session: { accessToken: 'access', authToken: 'auth' } })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    const first = service.readCommerce()
    expect(service.readCommerce()).toBe(first)
    fixture.setBaseUrl('https://other.example')
    const listener = vi.fn()
    const dispose = service.subscribe(listener)
    fixture.fireEnv()
    expect(listener).toHaveBeenCalled()
    expect(service.readCommerce()).not.toBe(first)
    const kept = service.readCommerce()
    fixture.fireEnv()
    expect(service.readCommerce()).toBe(kept)
    service.openSignIn()
    expect(fixture.iam.openSignIn).toHaveBeenCalled()
    dispose()
  })

  it('fails loud when the API origin is missing', () => {
    const fixture = harness({ baseUrl: '  ', session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    expect(service.isConfigured()).toBe(true)
    expect(() => service.readCommerce()).toThrow('ui-sdkwork-token-plan: SDKWork API environment is not configured')
  })

  it('clears tokens when the session and env access token are both empty', () => {
    const fixture = harness({ accessToken: '', session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam, () => 'sign-in-required')
    const listener = vi.fn()
    service.subscribe(listener)
    fixture.setSession({ accessToken: 'access', authToken: 'auth' })
    fixture.fireIam()
    expect(service.hasCheckoutSession()).toBe(true)
    fixture.setSession(null)
    fixture.fireIam()
    expect(service.hasCheckoutSession()).toBe(false)
  })
})
