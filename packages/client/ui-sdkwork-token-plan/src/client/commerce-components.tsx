import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { SdkworkOrderCheckoutDialog } from '@sdkwork/order-pc-checkout'
import { SdkworkPointsRechargeDialog } from '@sdkwork/order-pc-recharge'
import {
  sdkworkSubscriptionCatalogHostComponents,
  type SdkworkSubscriptionCatalogCheckoutModalProps,
  type SdkworkSubscriptionCatalogHostComponents,
  type SdkworkSubscriptionCatalogModalProps,
} from '@sdkwork/membership-pc-subscription/catalog'
import type { TokenPlanKey } from './locales.ts'
import type { TokenPlanCommerce } from './token-plan-service.ts'
import css from './TokenPlanDialogs.module.css'
import './pointsRechargeTheme.css'

/** Locale lookup used by Token Plan commerce dialogs. */
export type TokenPlanCopy = (key: TokenPlanKey) => string

export interface TokenPlanCommerceComponentsOptions {
  commerce: TokenPlanCommerce
  onCompleted: () => Promise<void> | void
  t: TokenPlanCopy
}

interface TokenPlanCommerceRuntime {
  commerce: TokenPlanCommerce | undefined
  onCompleted: () => Promise<void> | void
  t: TokenPlanCopy
}

function defaultCommerceCompleted(): void {}
function defaultCommerceCopy(key: TokenPlanKey): string { return key }

const runtime: TokenPlanCommerceRuntime = {
  commerce: undefined,
  onCompleted: defaultCommerceCompleted,
  t: defaultCommerceCopy,
}

function requireCommerce(): TokenPlanCommerce {
  if (runtime.commerce === undefined) {
    throw new Error('ui-sdkwork-token-plan: commerce components used before configuration')
  }
  return runtime.commerce
}

/**
 * Clear host-component runtime so tests can prove unconfigured access fails.
 * @returns nothing.
 */
export function resetTokenPlanCommerceRuntime(): void {
  runtime.commerce = undefined
  runtime.onCompleted = defaultCommerceCompleted
  runtime.t = defaultCommerceCopy
  defaultCommerceCompleted()
}

/**
 * Create host modal components backed by Order checkout/recharge and the
 * Agents Token Plan dialog chrome for points details and redemption.
 *
 * Component identities stay stable across locale and commerce refreshes so
 * the checkout dialog does not remount and abort `createPayment`.
 *
 * @param options - commerce ports, completion hook, and locale lookup.
 * @returns catalog host components that replace the Membership placeholders.
 */
export function createTokenPlanCommerceComponents({
  commerce,
  onCompleted,
  t,
}: TokenPlanCommerceComponentsOptions): SdkworkSubscriptionCatalogHostComponents {
  runtime.commerce = commerce
  runtime.onCompleted = onCompleted
  runtime.t = t
  return tokenPlanCommerceComponents
}

function TokenPlanCheckoutModal({
  isOpen,
  onClose,
  onPaymentCompleted,
  onPaymentStatus,
  onPurchase,
  plan,
}: SdkworkSubscriptionCatalogCheckoutModalProps) {
  const t = runtime.t
  return (
    <SdkworkOrderCheckoutDialog
      copy={{
        activationDescription: t('checkout.activationDescription'),
        activationTitle: t('checkout.activationTitle'),
        close: t('checkout.close'),
        completed: t('checkout.completed'),
        creatingPayment: t('checkout.creatingPayment'),
        expired: t('checkout.expired'),
        expiredDescription: t('checkout.expiredDescription'),
        expiresIn: t('checkout.expiresIn'),
        paymentUnavailable: t('checkout.paymentUnavailable'),
        paymentUnavailableDescription: t('checkout.paymentUnavailableDescription'),
        payByQr: t('checkout.payByQr'),
        price: t('checkout.price'),
        retry: t('checkout.retry'),
        scanPrompt: t('checkout.scanPrompt'),
        secureDescription: t('checkout.secureDescription'),
        secureTitle: t('checkout.secureTitle'),
        selectedItem: t('checkout.selectedItem'),
        title: t('checkout.title'),
      }}
      driver={{
        createPayment: onPurchase,
        getPaymentStatus: onPaymentStatus
          ? payment => payment.orderId
            ? onPaymentStatus(payment.orderId)
            : Promise.resolve({ ...payment, status: 'failed' })
          : undefined,
        onPaymentCompleted,
      }}
      isOpen={isOpen}
      onClose={onClose}
      summary={plan ? {
        id: plan.id,
        name: plan.name,
        originalPriceLabel: plan.originalPrice,
        periodLabel: plan.packagePeriodLabel,
        priceLabel: plan.priceLabel,
      } : null}
    />
  )
}

function TokenPlanPointsPurchaseModal({ currentPoints, isOpen, onClose }: SdkworkSubscriptionCatalogModalProps) {
  const t = runtime.t
  return (
    <SdkworkPointsRechargeDialog
      copy={{
        account: t('recharge.account'),
        agreement: t('recharge.agreement'),
        agreementAccepted: t('recharge.agreementAccepted'),
        agreementRequired: t('recharge.agreementRequired'),
        close: t('recharge.close'),
        completed: t('recharge.completed'),
        confirmPayment: t('recharge.confirmPayment'),
        creatingPayment: t('recharge.creatingPayment'),
        emptyPackages: t('recharge.emptyPackages'),
        expired: t('recharge.expired'),
        expiredDescription: t('recharge.expiredDescription'),
        expiresIn: t('recharge.expiresIn'),
        loadFailed: t('recharge.loadFailed'),
        loadingPackages: t('recharge.loadingPackages'),
        myPoints: t('recharge.myPoints'),
        notice: t('recharge.notice'),
        paymentUnavailable: t('recharge.paymentUnavailable'),
        paymentUnavailableDescription: t('recharge.paymentUnavailableDescription'),
        pointsUnit: t('recharge.pointsUnit'),
        retry: t('recharge.retry'),
        retryPayment: t('recharge.retryPayment'),
        scanPrompt: t('recharge.scanPrompt'),
        title: t('recharge.title'),
      }}
      currentPoints={currentPoints}
      isOpen={isOpen}
      onClose={onClose}
      onCompleted={runtime.onCompleted}
      service={requireCommerce().recharge}
    />
  )
}

function TokenPlanPointsDetailsHostModal(props: SdkworkSubscriptionCatalogModalProps) {
  return <TokenPlanPointsDetailsModal {...props} t={runtime.t} />
}

function TokenPlanRedeemHostModal({ isOpen, onClose }: SdkworkSubscriptionCatalogModalProps) {
  return (
    <TokenPlanRedeemModal
      commerce={requireCommerce()}
      isOpen={isOpen}
      onClose={onClose}
      onCompleted={runtime.onCompleted}
      t={runtime.t}
    />
  )
}

const tokenPlanCommerceComponents: SdkworkSubscriptionCatalogHostComponents = {
  ...sdkworkSubscriptionCatalogHostComponents,
  checkoutModal: TokenPlanCheckoutModal,
  pointsDetailsModal: TokenPlanPointsDetailsHostModal,
  pointsPurchaseModal: TokenPlanPointsPurchaseModal,
  redeemModal: TokenPlanRedeemHostModal,
}

function TokenPlanPointsDetailsModal({
  currentPoints,
  isOpen,
  onClose,
  t,
}: SdkworkSubscriptionCatalogModalProps & { t: TokenPlanCopy }) {
  if (!isOpen) return null
  return (
    <Modal
      className={css.detailsDialog}
      closeLabel={t('redeem.close')}
      footer={<Button onClick={onClose} type="button" variant="primary">{t('pointsDetails.done')}</Button>}
      onClose={onClose}
      open
      title={t('pointsDetails.title')}
    >
      <div className={css.content}>
        <div className={css.balanceCard}>
          <span className={css.balanceLabel}>{t('pointsDetails.balance')}</span>
          <span className={css.balanceValue}>{currentPoints ?? 0}</span>
        </div>
        <p className={css.hint}>{t('pointsDetails.hint')}</p>
      </div>
    </Modal>
  )
}

function TokenPlanRedeemModal({
  commerce,
  isOpen,
  onClose,
  onCompleted,
  t,
}: SdkworkSubscriptionCatalogModalProps & {
  commerce: TokenPlanCommerce
  onCompleted: () => Promise<void> | void
  t: TokenPlanCopy
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [grantAmount, setGrantAmount] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) return
    setCode('')
    setError('')
    setGrantAmount(null)
    setSubmitting(false)
  }, [isOpen])

  function requestClose() {
    // A pending redemption must settle: Escape and the mask cannot cancel it.
    if (!submitting) onClose()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!code.trim()) {
      setError(t('redeem.empty'))
      inputRef.current?.focus()
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await commerce.coupon.redeem(code.trim())
      setGrantAmount(
        result.benefitKind === 'points_credit'
          ? result.grantPoints
          : result.benefitKind === 'subscription'
            ? result.totalQuota
            : result.grantAmount,
      )
      setCode('')
      await onCompleted()
    } catch (reason) {
      setError(reason instanceof Error && reason.message.trim() ? reason.message : t('redeem.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null
  return (
    <Modal
      className={css.wideDialog}
      closeLabel={t('redeem.close')}
      onClose={requestClose}
      open
      title={t('redeem.title')}
    >
      {grantAmount !== null ? (
        <div className={css.success}>
          <CheckCircle2 aria-hidden="true" className={css.successIcon} />
          <p className={css.successText}>{t('redeem.success').replace('{amount}', String(grantAmount))}</p>
          <Button onClick={onClose} type="button" variant="primary">{t('pointsDetails.done')}</Button>
        </div>
      ) : (
        <form className={css.form} onSubmit={submit}>
          <div className={css.field}>
            <label className={css.label} htmlFor={inputId}>{t('redeem.codeLabel')}</label>
            <input
              autoComplete="off"
              className={css.input}
              data-modal-autofocus
              disabled={submitting}
              id={inputId}
              onChange={(event) => { setCode(event.target.value); setError('') }}
              placeholder={t('redeem.placeholder')}
              ref={inputRef}
              value={code}
            />
          </div>
          <p aria-live="assertive" className={css.error}>{error}</p>
          <div className={css.formActions}>
            <Button disabled={submitting} onClick={onClose} type="button" variant="outline">{t('redeem.cancel')}</Button>
            <Button disabled={submitting || !code.trim()} type="submit" variant="primary">
              {submitting ? <Loader2 aria-hidden="true" className={css.spinner} /> : null}
              {t('redeem.submit')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
