// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTokenPlanCommerceComponents,
  resetTokenPlanCommerceRuntime,
  type TokenPlanCopy,
} from '../src/client/commerce-components.tsx'
import { createTokenPlanAccountStore } from '../src/client/token-plan-account.ts'
import type { TokenPlanCommerce } from '../src/client/token-plan-service.ts'

afterEach(() => {
  cleanup()
  resetTokenPlanCommerceRuntime()
})

vi.mock('@sdkwork/order-pc-checkout', () => ({
  SdkworkOrderCheckoutDialog: (props: {
    copy: { expired: string; title: string }
    driver: {
      getPaymentStatus?: (payment: { orderId?: string; status: 'pending' }) => Promise<unknown>
    }
    isOpen: boolean
    summary: { name: string } | null
  }) => {
    void props.driver.getPaymentStatus?.({ status: 'pending' })
    void props.driver.getPaymentStatus?.({ orderId: 'order-1', status: 'pending' })
    return (
      <div data-testid="checkout-dialog">
        {props.isOpen ? props.copy.title : 'closed'}:{props.copy.expired}:{props.summary?.name ?? 'none'}
      </div>
    )
  },
}))

vi.mock('@sdkwork/order-pc-recharge', () => ({
  SdkworkPointsRechargeDialog: (props: {
    currentPoints?: number | null
    onCompleted?: () => Promise<void> | void
  }) => (
    <div data-testid="recharge-dialog">
      {String(props.currentPoints)}
      <button type="button" onClick={() => { void props.onCompleted?.() }}>complete</button>
    </div>
  ),
}))

const t = ((key: string) => key === 'redeem.success' ? 'ok {amount}' : key) as TokenPlanCopy

function commerce(overrides: Partial<TokenPlanCommerce> = {}): TokenPlanCommerce {
  return {
    checkout: { createCheckout: vi.fn(), getCheckoutStatus: vi.fn() },
    coupon: {
      redeem: vi.fn().mockResolvedValue({ benefitKind: 'points_credit', grantPoints: 12 }),
    },
    recharge: { listPackages: vi.fn(), createOrder: vi.fn(), getOrderStatus: vi.fn() },
    membership: { memberships: {} } as unknown as TokenPlanCommerce['membership'],
    ...overrides,
  }
}

function createAccount(initial: { signedIn: boolean; available?: number }) {
  let signedIn = initial.signedIn
  let available = initial.available
  const read = vi.fn(async () => (signedIn
    ? { assetType: 'token_bank', available, frozen: 0, pending: 0 }
    : undefined))
  const store = createTokenPlanAccountStore({
    read,
    signedIn: () => signedIn,
  })
  return {
    read,
    store,
    setAvailable(value: number | undefined) { available = value },
    setSignedIn(value: boolean) { signedIn = value },
  }
}

async function redeemCode(
  RedeemModal: ReturnType<typeof createTokenPlanCommerceComponents>['redeemModal'],
  code: string,
) {
  const view = render(<RedeemModal isOpen={true} onClose={() => undefined} />)
  fireEvent.change(view.getByRole('textbox'), { target: { value: code } })
  fireEvent.submit(view.getByRole('textbox').closest('form')!)
  return view
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('createTokenPlanCommerceComponents', () => {
  it('keeps checkout modal identity stable across locale refreshes', () => {
    const ports = commerce()
    const first = createTokenPlanCommerceComponents({ commerce: ports, onCompleted: () => undefined, t })
    const second = createTokenPlanCommerceComponents({
      commerce: ports,
      onCompleted: () => undefined,
      t: ((key: string) => `next:${key}`) as TokenPlanCopy,
    })
    expect(second.checkoutModal).toBe(first.checkoutModal)
    expect(second.pointsPurchaseModal).toBe(first.pointsPurchaseModal)
    expect(second.redeemModal).toBe(first.redeemModal)
  })

  it('renders checkout copy from the latest locale lookup', async () => {
    const onPaymentStatus = vi.fn().mockResolvedValue({ status: 'pending' })
    const CheckoutModal = createTokenPlanCommerceComponents({
      commerce: commerce(),
      onCompleted: () => undefined,
      t,
    }).checkoutModal
    const { getByTestId, rerender } = render(
      <CheckoutModal
        isOpen={true}
        onClose={() => undefined}
        onPaymentStatus={onPaymentStatus}
        onPurchase={async () => ({ status: 'pending' })}
        plan={{
          id: '1',
          membershipTierKey: 'pro',
          name: 'Pro',
          packageNumericId: 1,
          packagePeriodLabel: '年',
          priceLabel: '99',
        }}
      />,
    )
    expect(getByTestId('checkout-dialog').textContent).toContain('checkout.title')
    expect(getByTestId('checkout-dialog').textContent).toContain('checkout.expired')
    expect(getByTestId('checkout-dialog').textContent).toContain('Pro')
    await waitFor(() => {
      expect(onPaymentStatus).toHaveBeenCalledWith('order-1')
    })
    createTokenPlanCommerceComponents({
      commerce: commerce(),
      onCompleted: () => undefined,
      t: ((key: string) => `zh:${key}`) as TokenPlanCopy,
    })
    rerender(
      <CheckoutModal
        isOpen={true}
        onClose={() => undefined}
        onPurchase={async () => ({ status: 'pending' })}
        plan={null}
      />,
    )
    expect(getByTestId('checkout-dialog').textContent).toContain('zh:checkout.title')
  })

  it('opens points details and redeem dialogs after configuration', async () => {
    const onCompleted = vi.fn()
    const onClose = vi.fn()
    const ports = commerce()
    const components = createTokenPlanCommerceComponents({
      commerce: ports,
      onCompleted,
      t,
    })
    const details = render(
      <components.pointsDetailsModal currentPoints={8} isOpen={true} onClose={onClose} />,
    )
    expect(details.getByRole('dialog').textContent).toContain('pointsDetails.title')
    expect(details.getByRole('dialog').textContent).toContain('8')
    fireEvent.click(details.getByRole('button', { name: 'pointsDetails.done' }))
    expect(onClose).toHaveBeenCalled()
    details.rerender(<components.pointsDetailsModal isOpen={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    details.unmount()

    const redeem = render(<components.redeemModal isOpen={true} onClose={() => undefined} />)
    fireEvent.submit(redeem.getByRole('textbox').closest('form')!)
    expect(redeem.getByRole('dialog').textContent).toContain('redeem.empty')
    fireEvent.change(redeem.getByRole('textbox'), { target: { value: 'CODE' } })
    fireEvent.submit(redeem.getByRole('textbox').closest('form')!)
    await waitFor(() => {
      expect(ports.coupon.redeem).toHaveBeenCalledWith('CODE')
      expect(onCompleted).toHaveBeenCalled()
    })
    expect(redeem.getByRole('dialog').textContent).toContain('ok 12')
  })

  it('maps subscription and token-bank coupon grants and reports redeem errors', async () => {
    const redeem = vi.fn()
      .mockResolvedValueOnce({ benefitKind: 'subscription', totalQuota: 30 })
      .mockResolvedValueOnce({ benefitKind: 'token_bank_credit', grantAmount: 99 })
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('  '))
    const ports = commerce({ coupon: { redeem } })
    const RedeemModal = createTokenPlanCommerceComponents({
      commerce: ports,
      onCompleted: () => undefined,
      t,
    }).redeemModal

    const first = await redeemCode(RedeemModal, 'SUB')
    await waitFor(() => {
      expect(first.getByRole('dialog').textContent).toContain('ok 30')
    })
    first.unmount()

    const closed = render(<RedeemModal isOpen={false} onClose={() => undefined} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    closed.unmount()

    const opened = render(<RedeemModal isOpen={true} onClose={() => undefined} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    opened.rerender(<RedeemModal isOpen={false} onClose={() => undefined} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    opened.unmount()

    const second = await redeemCode(RedeemModal, 'BANK')
    await waitFor(() => {
      expect(second.getByRole('dialog').textContent).toContain('ok 99')
    })
    second.unmount()

    const third = await redeemCode(RedeemModal, 'BAD')
    await waitFor(() => {
      expect(third.getByRole('dialog').textContent).toContain('boom')
    })
    third.unmount()

    const fourth = await redeemCode(RedeemModal, 'BLANK')
    await waitFor(() => {
      expect(fourth.getByRole('dialog').textContent).toContain('redeem.failed')
    })
  })

  it('reads the Token Bank balance into the details dialog and recovers after sign-in', async () => {
    const account = createAccount({ signedIn: false })
    const openSignIn = vi.fn()
    const components = createTokenPlanCommerceComponents({
      account: account.store,
      commerce: commerce(),
      onCompleted: async () => { await account.store.refresh() },
      openSignIn,
      t,
    })

    const view = render(<components.pointsDetailsModal isOpen={true} onClose={() => undefined} />)
    await waitFor(() => {
      expect(view.getByRole('dialog').textContent).toContain('account.signedOutDescription')
    })

    fireEvent.click(view.getByRole('button', { name: 'account.signIn' }))
    expect(openSignIn).toHaveBeenCalledTimes(1)

    // The IAM overlay finishes and the page's service notification re-reads the
    // account; the open dialog must swap to the settled balance without closing.
    account.setSignedIn(true)
    account.setAvailable(243.75)
    await act(async () => { await account.store.refresh() })
    await waitFor(() => {
      const dialog = view.getByRole('dialog')
      expect(dialog.textContent).toContain('pointsDetails.balance')
      expect(dialog.textContent).toContain('243.75')
      expect(dialog.textContent).not.toContain('account.signedOutDescription')
    })
  })

  it('gates the purchase dialog on sign-in and forwards the rounded Token Bank balance', async () => {
    const account = createAccount({ signedIn: false })
    const openSignIn = vi.fn()
    const components = createTokenPlanCommerceComponents({
      account: account.store,
      commerce: commerce(),
      onCompleted: async () => { await account.store.refresh() },
      openSignIn,
      t,
    })

    const view = render(<components.pointsPurchaseModal isOpen={true} onClose={() => undefined} />)
    await waitFor(() => {
      expect(view.getByRole('dialog').textContent).toContain('account.signedOutDescription')
    })
    expect(view.queryByTestId('recharge-dialog')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'account.signIn' }))
    expect(openSignIn).toHaveBeenCalledTimes(1)

    account.setSignedIn(true)
    account.setAvailable(610.567891)
    await act(async () => { await account.store.refresh() })
    await waitFor(() => {
      expect(view.getByTestId('recharge-dialog').textContent).toContain('610.5679')
    })

    view.rerender(<components.pointsPurchaseModal isOpen={false} onClose={() => undefined} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('re-reads the Token Bank balance after a recharge completes', async () => {
    const account = createAccount({ signedIn: true, available: 10 })
    const components = createTokenPlanCommerceComponents({
      account: account.store,
      commerce: commerce(),
      onCompleted: async () => { await account.store.refresh() },
      t,
    })

    const view = render(<components.pointsPurchaseModal isOpen={true} onClose={() => undefined} />)
    await waitFor(() => {
      expect(view.getByTestId('recharge-dialog').textContent).toContain('10')
    })

    account.setAvailable(25)
    fireEvent.click(view.getByRole('button', { name: 'complete' }))
    await waitFor(() => {
      expect(view.getByTestId('recharge-dialog').textContent).toContain('25')
    })
  })

  it('surfaces a failed account read and retries it', async () => {
    let fail = true
    const read = vi.fn(async () => {
      if (fail) throw new Error('gateway down')
      return { assetType: 'token_bank', available: 5, frozen: 0, pending: 0 }
    })
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })
    const components = createTokenPlanCommerceComponents({
      account: store,
      commerce: commerce(),
      onCompleted: () => undefined,
      t,
    })

    const view = render(<components.pointsDetailsModal isOpen={true} onClose={() => undefined} />)
    await waitFor(() => {
      expect(view.getByRole('dialog').textContent).toContain('account.loadFailed')
    })
    fail = false
    fireEvent.click(view.getByRole('button', { name: 'account.retry' }))
    await waitFor(() => {
      expect(view.getByRole('dialog').textContent).toContain('5')
    })
  })

  it('surfaces a failed purchase balance read and retries it', async () => {
    let fail = true
    const read = vi.fn(async () => {
      if (fail) throw new Error('gateway down')
      return { assetType: 'token_bank', available: 15, frozen: 0, pending: 0 }
    })
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })
    const components = createTokenPlanCommerceComponents({
      account: store,
      commerce: commerce(),
      onCompleted: () => undefined,
      t,
    })

    const view = render(<components.pointsPurchaseModal isOpen={true} onClose={() => undefined} />)
    await waitFor(() => {
      expect(view.getByRole('dialog').textContent).toContain('account.loadFailed')
    })
    expect(view.queryByTestId('recharge-dialog')).toBeNull()

    fail = false
    fireEvent.click(view.getByRole('button', { name: 'account.retry' }))
    await waitFor(() => {
      expect(view.getByTestId('recharge-dialog').textContent).toContain('15')
    })
  })

  it('keeps the last balance and flags a failed refresh in the details dialog', async () => {
    let fail = false
    const read = vi.fn(async () => {
      if (fail) throw new Error('gateway down')
      return { assetType: 'token_bank', available: 6.5, frozen: 0, pending: 0 }
    })
    const store = createTokenPlanAccountStore({ read, signedIn: () => true })
    const components = createTokenPlanCommerceComponents({
      account: store,
      commerce: commerce(),
      onCompleted: () => undefined,
      t,
    })

    const view = render(<components.pointsDetailsModal isOpen={true} onClose={() => undefined} />)
    await waitFor(() => {
      expect(view.getByRole('dialog').textContent).toContain('6.5')
    })

    fail = true
    await act(async () => { await store.refresh() })
    await waitFor(() => {
      const text = view.getByRole('dialog').textContent
      expect(text).toContain('6.5')
      expect(text).toContain('account.refreshFailed')
    })
  })

  it('lets an in-flight redemption settle before closing the dialog', async () => {
    const pending = deferred<{ benefitKind: string; grantPoints: number }>()
    const ports = commerce({ coupon: { redeem: vi.fn(() => pending.promise) } })
    const onClose = vi.fn()
    const components = createTokenPlanCommerceComponents({
      commerce: ports,
      onCompleted: () => undefined,
      t,
    })

    const view = render(<components.redeemModal isOpen={true} onClose={onClose} />)
    fireEvent.change(view.getByRole('textbox'), { target: { value: 'CODE' } })
    fireEvent.submit(view.getByRole('textbox').closest('form')!)
    await waitFor(() => { expect(ports.coupon.redeem).toHaveBeenCalled() })

    // A pending redemption must settle: Escape cannot cancel it.
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    pending.resolve({ benefitKind: 'points_credit', grantPoints: 3 })
    await waitFor(() => {
      expect(view.getByRole('dialog').textContent).toContain('ok 3')
    })
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes host dialogs on Escape and fails loud before configuration', () => {
    const onClose = vi.fn()
    const PointsDetails = createTokenPlanCommerceComponents({
      commerce: commerce(),
      onCompleted: () => undefined,
      t,
    }).pointsDetailsModal
    render(<PointsDetails isOpen={true} onClose={onClose} />)
    // The app modal owns Escape at the document layer; a real keydown targets
    // the focused control inside the dialog and bubbles from there.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    const PointsPurchase = createTokenPlanCommerceComponents({
      commerce: commerce(),
      onCompleted: () => undefined,
      t,
    }).pointsPurchaseModal
    const { getByTestId } = render(<PointsPurchase isOpen={true} onClose={() => undefined} />)
    expect(getByTestId('recharge-dialog')).toBeTruthy()
    cleanup()
    const Details = createTokenPlanCommerceComponents({
      commerce: commerce(),
      onCompleted: () => undefined,
      t: ((key: string) => `custom:${key}`) as TokenPlanCopy,
    }).pointsDetailsModal
    resetTokenPlanCommerceRuntime()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<PointsPurchase isOpen={true} onClose={() => undefined} />)).toThrow(
      'ui-sdkwork-token-plan: commerce components used before configuration',
    )
    error.mockRestore()
    const idle = render(<Details isOpen={true} onClose={() => undefined} />)
    expect(idle.getByRole('dialog').textContent).toContain('pointsDetails.title')
    // No configured account read and no host figure: the dialog must not invent
    // a zero balance.
    expect(idle.getByRole('dialog').textContent).toContain('—')
    expect(idle.getByRole('dialog').textContent).not.toContain('custom:')
  })
})
