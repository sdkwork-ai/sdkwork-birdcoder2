// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTokenPlanCommerceComponents,
  resetTokenPlanCommerceRuntime,
  type TokenPlanCopy,
} from '../src/client/commerce-components.tsx'
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
  SdkworkPointsRechargeDialog: () => <div data-testid="recharge-dialog">recharge</div>,
}))

const t = ((key: string) => key === 'redeem.success' ? 'ok {amount}' : key) as TokenPlanCopy

function commerce(overrides: Partial<TokenPlanCommerce> = {}): TokenPlanCommerce {
  return {
    checkout: { createCheckout: vi.fn(), getCheckoutStatus: vi.fn() },
    coupon: {
      redeem: vi.fn().mockResolvedValue({ benefitKind: 'points_credit', grantPoints: 12 }),
    },
    recharge: { listPackages: vi.fn(), createOrder: vi.fn(), getOrderStatus: vi.fn() },
    ...overrides,
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
    expect(details.container.querySelector('[role="dialog"]')).toBeNull()
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
    expect(closed.container.querySelector('[role="dialog"]')).toBeNull()
    closed.unmount()

    const opened = render(<RedeemModal isOpen={true} onClose={() => undefined} />)
    opened.rerender(<RedeemModal isOpen={false} onClose={() => undefined} />)
    expect(opened.container.querySelector('[role="dialog"]')).toBeNull()
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

  it('closes host dialogs on Escape and fails loud before configuration', () => {
    const onClose = vi.fn()
    const PointsDetails = createTokenPlanCommerceComponents({
      commerce: commerce(),
      onCompleted: () => undefined,
      t,
    }).pointsDetailsModal
    render(<PointsDetails isOpen={true} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Enter' })
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
    expect(idle.getByRole('dialog').textContent).toContain('0')
    expect(idle.getByRole('dialog').textContent).not.toContain('custom:')
  })
})
