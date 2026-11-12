/**
 * Points-purchase copy shared by the two surfaces that host the compute-account
 * recharge modal: the Token Plan page's catalog (through the Membership host
 * components) and the settings-menu wallet card's top-up action (through the
 * `settings.pointsRecharge` seat). Both render the same Order dialog, so the
 * strings live in one projection and cannot drift apart.
 */

import type { SdkworkPointsRechargeDialogCopy } from '@sdkwork/order-pc-recharge'
import type { TokenPlanKey } from './locales.ts'

/**
 * Project the token-plan dictionary onto the recharge dialog's copy contract.
 * @param t - bound `tokenPlan` locale lookup.
 * @returns every string the Order recharge dialog renders.
 */
export function pointsRechargeCopy(t: (key: TokenPlanKey) => string): SdkworkPointsRechargeDialogCopy {
  return {
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
  }
}
