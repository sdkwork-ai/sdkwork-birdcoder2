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

vi.mock('@sdkwork/membership-service', () => ({
  bootstrapSdkworkMembershipAppService: membership.bootstrap,
  configureSdkworkMembershipAppServiceProvider: membership.configureProvider,
  configureSdkworkMembershipSessionTokenProvider: membership.configureTokens,
}))

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
    subscribe: listener => {
      envListener = listener
      return () => { envListener = undefined }
    },
  }
  const iam: IamServiceLike = {
    controller: {
      getState: () => ({ session }),
      subscribe: listener => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
    openSignIn: vi.fn(),
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

describe('TokenPlanService checkout session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is unconfigured until the environment says otherwise', () => {
    const fixture = harness({ configured: false, baseUrl: '', session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam)
    expect(service.isConfigured()).toBe(false)
  })

  it('publishes merged dual tokens to Membership and Order session providers', () => {
    const fixture = harness({
      accessToken: 'env-access',
      session: { authToken: 'iam-auth' },
    })
    const service = new TokenPlanService(fixture.env, fixture.iam)
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
    const service = new TokenPlanService(fixture.env, fixture.iam)
    expect(service.hasCheckoutSession()).toBe(false)
    service.readCommerce()
    const membershipProvider = membership.configureTokens.mock.calls.at(-1)?.[0] as () => object
    expect(membershipProvider()).toEqual({ accessToken: 'env-access' })
  })

  it('rebuilds commerce clients when the API origin changes', () => {
    const fixture = harness({ session: { accessToken: 'access', authToken: 'auth' } })
    const service = new TokenPlanService(fixture.env, fixture.iam)
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
    const service = new TokenPlanService(fixture.env, fixture.iam)
    expect(service.isConfigured()).toBe(true)
    expect(() => service.readCommerce()).toThrow('ui-token-plan: SDKWork API environment is not configured')
  })

  it('clears tokens when the session and env access token are both empty', () => {
    const fixture = harness({ accessToken: '', session: null })
    const service = new TokenPlanService(fixture.env, fixture.iam)
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
