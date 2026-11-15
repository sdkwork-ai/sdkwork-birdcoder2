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
import { pointsRechargeCopy } from './recharge-copy.ts'
import { formatPointBalance, roundPointBalance } from './points-format.ts'
import {
  useTokenPlanAccount,
  type TokenPlanAccountStore,
} from './token-plan-account.ts'
import type { TokenPlanCommerce } from './token-plan-service.ts'
import css from './TokenPlanDialogs.module.css'
import './pointsRechargeTheme.css'

/** Locale lookup used by Token Plan commerce dialogs. */
export type TokenPlanCopy = (key: TokenPlanKey) => string

export interface TokenPlanCommerceComponentsOptions {
  /**
   * Token Bank account read shared with the page. When omitted the dialogs
   * fall back to the `currentPoints` prop the catalog forwards.
   */
  account?: TokenPlanAccountStore
  commerce: TokenPlanCommerce
  onCompleted: () => Promise<void> | void
  /** Open the host sign-in surface from the signed-out points dialogs. */
  openSignIn?: () => void
  t: TokenPlanCopy
}

interface TokenPlanCommerceRuntime {
  account: TokenPlanAccountStore | undefined
  commerce: TokenPlanCommerce | undefined
  onCompleted: () => Promise<void> | void
  openSignIn: () => void
  t: TokenPlanCopy
}

function defaultCommerceCompleted(): void {}
function defaultCommerceCopy(key: TokenPlanKey): string { return key }
function defaultOpenSignIn(): void {}

const runtime: TokenPlanCommerceRuntime = {
  account: undefined,
  commerce: undefined,
  onCompleted: defaultCommerceCompleted,
  openSignIn: defaultOpenSignIn,
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
  runtime.account = undefined
  runtime.commerce = undefined
  runtime.onCompleted = defaultCommerceCompleted
  runtime.openSignIn = defaultOpenSignIn
  runtime.t = defaultCommerceCopy
  defaultCommerceCompleted()
  defaultOpenSignIn()
}

/**
 * Create host modal components backed by Order checkout/recharge and the
 * Agents Token Plan dialog chrome for points details and redemption.
 *
 * Component identities stay stable across locale and commerce refreshes so
 * the checkout dialog does not remount and abort `createPayment`.
 *
 * @param options - commerce ports, Token Bank account read, completion hook,
 * sign-in hook, and locale lookup.
 * @returns catalog host components that replace the Membership placeholders.
 */
export function createTokenPlanCommerceComponents({
  account,
  commerce,
  onCompleted,
  openSignIn = defaultOpenSignIn,
  t,
}: TokenPlanCommerceComponentsOptions): SdkworkSubscriptionCatalogHostComponents {
  runtime.account = account
  runtime.commerce = commerce
  runtime.onCompleted = onCompleted
  runtime.openSignIn = openSignIn
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
  const account = runtime.account
  const snapshot = useTokenPlanAccount(account)

  // Re-read whenever the purchase opens: the catalog figure can be as old as
  // the last page load, and the header must show the settled account.
  useEffect(() => {
    if (isOpen && account !== undefined) void account.refresh()
  }, [account, isOpen])

  if (!isOpen) return null

  const points = snapshot.points ?? currentPoints ?? null
  if (account !== undefined && snapshot.status === 'signed-out') {
    return (
      <TokenPlanAccountGate
        closeLabel={t('redeem.close')}
        description={t('account.signedOutDescription')}
        doneLabel={t('pointsDetails.done')}
        onClose={onClose}
        onSignIn={runtime.openSignIn}
        signInLabel={t('account.signIn')}
        title={t('recharge.title')}
      />
    )
  }
  if (account !== undefined && snapshot.status === 'loading' && points === null) {
    return (
      <TokenPlanAccountStatus
        busy
        closeLabel={t('redeem.close')}
        doneLabel={t('pointsDetails.done')}
        onClose={onClose}
        text={t('account.loading')}
        title={t('recharge.title')}
      />
    )
  }
  if (account !== undefined && snapshot.status === 'error' && points === null) {
    return (
      <TokenPlanAccountStatus
        closeLabel={t('redeem.close')}
        doneLabel={t('pointsDetails.done')}
        onClose={onClose}
        onRetry={() => { void account.refresh() }}
        retryLabel={t('account.retry')}
        text={t('account.loadFailed')}
        title={t('recharge.title')}
      />
    )
  }

  return (
    <SdkworkPointsRechargeDialog
      copy={pointsRechargeCopy(t)}
      currentPoints={points === null ? null : roundPointBalance(points)}
      isOpen
      onClose={onClose}
      onCompleted={runtime.onCompleted}
      service={requireCommerce().recharge}
    />
  )
}

function TokenPlanPointsDetailsHostModal(props: SdkworkSubscriptionCatalogModalProps) {
  return (
    <TokenPlanPointsDetailsModal
      {...props}
      account={runtime.account}
      t={runtime.t}
    />
  )
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
  account,
  currentPoints,
  isOpen,
  onClose,
  t,
}: SdkworkSubscriptionCatalogModalProps & {
  account: TokenPlanAccountStore | undefined
  t: TokenPlanCopy
}) {
  const snapshot = useTokenPlanAccount(account)

  // Opening the details dialog is a balance read, not a render of a cached
  // catalog figure: the Token Bank account is the source of truth.
  useEffect(() => {
    if (isOpen && account !== undefined) void account.refresh()
  }, [account, isOpen])

  if (!isOpen) return null

  const points = snapshot.points ?? currentPoints ?? null
  if (account !== undefined && snapshot.status === 'signed-out') {
    return (
      <TokenPlanAccountGate
        closeLabel={t('redeem.close')}
        description={t('account.signedOutDescription')}
        doneLabel={t('pointsDetails.done')}
        onClose={onClose}
        onSignIn={runtime.openSignIn}
        signInLabel={t('account.signIn')}
        title={t('pointsDetails.title')}
      />
    )
  }
  if (account !== undefined && snapshot.status === 'loading' && points === null) {
    return (
      <TokenPlanAccountStatus
        busy
        closeLabel={t('redeem.close')}
        doneLabel={t('pointsDetails.done')}
        onClose={onClose}
        text={t('account.loading')}
        title={t('pointsDetails.title')}
      />
    )
  }
  if (account !== undefined && snapshot.status === 'error' && points === null) {
    return (
      <TokenPlanAccountStatus
        closeLabel={t('redeem.close')}
        doneLabel={t('pointsDetails.done')}
        onClose={onClose}
        onRetry={() => { void account.refresh() }}
        retryLabel={t('account.retry')}
        text={t('account.loadFailed')}
        title={t('pointsDetails.title')}
      />
    )
  }

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
          <span className={css.balanceValue}>
            {points === null ? '—' : formatPointBalance(points)}
          </span>
        </div>
        {account !== undefined && snapshot.status === 'error' ? (
          <p className={css.hint} role="status">{t('account.refreshFailed')}</p>
        ) : null}
        <p className={css.hint}>{t('pointsDetails.hint')}</p>
      </div>
    </Modal>
  )
}

/** Signed-out gate shared by the points details and purchase dialogs. */
function TokenPlanAccountGate({
  closeLabel,
  description,
  doneLabel,
  onClose,
  onSignIn,
  signInLabel,
  title,
}: {
  closeLabel: string
  description: string
  doneLabel: string
  onClose: () => void
  onSignIn: () => void
  signInLabel: string
  title: string
}) {
  return (
    <Modal
      className={css.detailsDialog}
      closeLabel={closeLabel}
      footer={<Button onClick={onClose} type="button" variant="primary">{doneLabel}</Button>}
      onClose={onClose}
      open
      title={title}
    >
      <div className={css.content}>
        <p className={css.hint}>{description}</p>
        <div className={css.formActions}>
          <Button onClick={onSignIn} type="button" variant="primary">{signInLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Loading/failure dialog shared by the points details and purchase dialogs. */
function TokenPlanAccountStatus({
  busy,
  closeLabel,
  doneLabel,
  onClose,
  onRetry,
  retryLabel,
  text,
  title,
}: {
  busy?: boolean
  closeLabel: string
  doneLabel: string
  onClose: () => void
  onRetry?: () => void
  retryLabel?: string
  text: string
  title: string
}) {
  return (
    <Modal
      className={css.detailsDialog}
      closeLabel={closeLabel}
      footer={<Button onClick={onClose} type="button" variant="primary">{doneLabel}</Button>}
      onClose={onClose}
      open
      title={title}
    >
      <div className={css.content} role="status">
        <p className={css.hint}>
          {busy === true ? <Loader2 aria-hidden="true" className={css.spinner} /> : null}
          {' '}
          {text}
        </p>
        {onRetry === undefined || retryLabel === undefined ? null : (
          <div className={css.formActions}>
            <Button onClick={onRetry} type="button" variant="outline">{retryLabel}</Button>
          </div>
        )}
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
