import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CheckCircle2, Gem, Loader2, X } from 'lucide-react'
import { Button } from '@sdkwork/ui-pc-react'
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

/** Locale lookup used by Token Plan commerce dialogs. */
export type TokenPlanCopy = (key: TokenPlanKey) => string

export interface TokenPlanCommerceComponentsOptions {
  commerce: TokenPlanCommerce
  onCompleted: () => Promise<void> | void
  t: TokenPlanCopy
}

/**
 * Create host modal components backed by Order checkout/recharge and the
 * Agents Token Plan dialog chrome for points details and redemption.
 * @param options - commerce ports, completion hook, and locale lookup.
 * @returns catalog host components that replace the Membership placeholders.
 */
export function createTokenPlanCommerceComponents({
  commerce,
  onCompleted,
  t,
}: TokenPlanCommerceComponentsOptions): SdkworkSubscriptionCatalogHostComponents {
  function CheckoutModal({
    isOpen,
    onClose,
    onPaymentCompleted,
    onPaymentStatus,
    onPurchase,
    plan,
  }: SdkworkSubscriptionCatalogCheckoutModalProps) {
    return (
      <SdkworkOrderCheckoutDialog
        copy={{
          activationDescription: t('checkout.activationDescription'),
          activationTitle: t('checkout.activationTitle'),
          close: t('checkout.close'),
          completed: t('checkout.completed'),
          creatingPayment: t('checkout.creatingPayment'),
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

  function PointsPurchaseModal({ currentPoints, isOpen, onClose }: SdkworkSubscriptionCatalogModalProps) {
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
        onCompleted={onCompleted}
        service={commerce.recharge}
      />
    )
  }

  function PointsDetailsModal(props: SdkworkSubscriptionCatalogModalProps) {
    return <TokenPlanPointsDetailsModal {...props} t={t} />
  }

  function RedeemModal({ isOpen, onClose }: SdkworkSubscriptionCatalogModalProps) {
    return <TokenPlanRedeemModal commerce={commerce} isOpen={isOpen} onClose={onClose} onCompleted={onCompleted} t={t} />
  }

  return {
    ...sdkworkSubscriptionCatalogHostComponents,
    checkoutModal: CheckoutModal,
    pointsDetailsModal: PointsDetailsModal,
    pointsPurchaseModal: PointsPurchaseModal,
    redeemModal: RedeemModal,
  }
}

function TokenPlanPointsDetailsModal({
  currentPoints,
  isOpen,
  onClose,
  t,
}: SdkworkSubscriptionCatalogModalProps & { t: TokenPlanCopy }) {
  useEscapeToClose(isOpen, onClose)
  if (!isOpen) return null
  return (
    <TokenPlanDialog onClose={onClose} t={t} title={t('pointsDetails.title')}>
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t('pointsDetails.balance')}</span>
        <span className="text-2xl font-semibold text-cyan-700 dark:text-cyan-300">{currentPoints ?? 0}</span>
      </div>
      <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">{t('pointsDetails.hint')}</p>
      <div className="flex justify-end">
        <Button onClick={onClose}>{t('pointsDetails.done')}</Button>
      </div>
    </TokenPlanDialog>
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
  useEscapeToClose(isOpen && !submitting, onClose)

  useEffect(() => {
    if (!isOpen) {
      setCode('')
      setError('')
      setGrantAmount(null)
      setSubmitting(false)
      return
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen])

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
    <TokenPlanDialog onClose={onClose} t={t} title={t('redeem.title')}>
      {grantAmount !== null ? (
        <div className="space-y-5 text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto h-12 w-12 text-emerald-500 dark:text-emerald-400" />
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{t('redeem.success').replace('{amount}', String(grantAmount))}</p>
          <Button onClick={onClose}>{t('pointsDetails.done')}</Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor={inputId}>{t('redeem.codeLabel')}</label>
          <input
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            disabled={submitting}
            id={inputId}
            onChange={(event) => { setCode(event.target.value); setError('') }}
            placeholder={t('redeem.placeholder')}
            ref={inputRef}
            value={code}
          />
          <div aria-live="assertive" className="min-h-6 text-sm text-rose-600 dark:text-rose-300">{error}</div>
          <div className="flex justify-end gap-3">
            <Button disabled={submitting} onClick={onClose} type="button" variant="ghost">{t('redeem.cancel')}</Button>
            <Button disabled={submitting || !code.trim()} type="submit">
              {submitting ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('redeem.submit')}
            </Button>
          </div>
        </form>
      )}
    </TokenPlanDialog>
  )
}

function TokenPlanDialog({
  children,
  onClose,
  t,
  title,
}: {
  children: ReactNode
  onClose: () => void
  t: TokenPlanCopy
  title: string
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button aria-label={t('redeem.close')} className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/70" onClick={onClose} type="button" />
      <div aria-modal="true" className="relative w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1e1e22]" role="dialog">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <Gem aria-hidden="true" className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h2>
          </div>
          <button aria-label={t('redeem.close')} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-5">{children}</div>
      </div>
    </div>
  )
}

function useEscapeToClose(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onClose])
}
