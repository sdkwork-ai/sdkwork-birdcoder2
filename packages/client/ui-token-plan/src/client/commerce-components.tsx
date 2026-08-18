import { SdkworkOrderCheckoutDialog } from '@sdkwork/order-pc-checkout'
import { SdkworkCouponRedemptionDialog, SdkworkPointsRechargeDialog } from '@sdkwork/order-pc-recharge'
import type {
  SdkworkSubscriptionCatalogCheckoutModalProps,
  SdkworkSubscriptionCatalogModalProps,
} from '@sdkwork/membership-pc-subscription/catalog'
import type { TokenPlanCommerce } from './token-plan-service.ts'

export interface TokenPlanCommerceComponentsOptions {
  commerce: TokenPlanCommerce
  onCompleted: () => Promise<void> | void
}

/** Create host modal components backed by the Order PC packages. */
export function createTokenPlanCommerceComponents({ commerce, onCompleted }: TokenPlanCommerceComponentsOptions) {
  function CheckoutModal({ isOpen, onClose, onPaymentCompleted, onPaymentStatus, onPurchase, plan }: SdkworkSubscriptionCatalogCheckoutModalProps) {
    return <SdkworkOrderCheckoutDialog
      copy={{ activationDescription: 'Membership benefits refresh after payment.', activationTitle: 'Activates immediately', close: 'Close', completed: 'Payment completed', creatingPayment: 'Creating payment QR code...', paymentUnavailable: 'Payment unavailable', paymentUnavailableDescription: 'The payment QR code could not be created. Try again later.', payByQr: 'Pay by QR code', price: 'Price', retry: 'Retry', scanPrompt: 'Scan to complete payment', secureDescription: 'Orders are handled by SDKWork Order.', secureTitle: 'Secure payment', selectedItem: 'Selected plan', title: 'Token Plan payment' }}
      driver={{
        createPayment: onPurchase,
        getPaymentStatus: onPaymentStatus ? payment => payment.orderId ? onPaymentStatus(payment.orderId) : Promise.resolve({ ...payment, status: 'failed' }) : undefined,
        onPaymentCompleted,
      }}
      isOpen={isOpen}
      onClose={onClose}
      summary={plan ? { id: plan.id, name: plan.name, originalPriceLabel: plan.originalPrice, periodLabel: plan.packagePeriodLabel, priceLabel: plan.priceLabel } : null}
    />
  }
  function PointsPurchaseModal({ currentPoints, isOpen, onClose }: SdkworkSubscriptionCatalogModalProps) {
    return <SdkworkPointsRechargeDialog currentPoints={currentPoints} isOpen={isOpen} onClose={onClose} onCompleted={onCompleted} service={commerce.recharge} />
  }
  function RedeemModal({ isOpen, onClose }: SdkworkSubscriptionCatalogModalProps) {
    return <SdkworkCouponRedemptionDialog isOpen={isOpen} onClose={onClose} onCompleted={onCompleted} service={commerce.coupon} />
  }
  function PointsDetailsModal({ currentPoints, isOpen, onClose }: SdkworkSubscriptionCatalogModalProps) {
    if (!isOpen) return null
    return <div role="dialog" aria-modal="true" aria-label="Token Bank balance" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' }}>
      <div style={{ minWidth: 280, padding: 24, borderRadius: 8, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)' }}>
        <strong>Token Bank</strong><p>{currentPoints ?? 0} Tokens</p><button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  }
  return { checkoutModal: CheckoutModal, pointsDetailsModal: PointsDetailsModal, pointsPurchaseModal: PointsPurchaseModal, redeemModal: RedeemModal }
}
