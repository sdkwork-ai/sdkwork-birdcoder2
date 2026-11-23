/**
 * The quota failure row's durable top-up gesture.
 *
 * Chat's failure row keeps the provider-neutral quota copy and appends whatever
 * gesture a feature can offer beside it. This entry answers the quota codes for
 * the account this product bills: on Desktop it opens the shared native balance
 * page, and in an ordinary browser it links the account's hosted top-up page in
 * a new tab.
 *
 * The embedded Desktop page owns its own sign-in, so the row keeps that gesture
 * even before a credential is stored or after a sign-out while the durable row
 * remains in the transcript. A browser tab is offered only while the account
 * credential is stored, and the row keeps its neutral copy when no destination
 * exists at all, so it never names an action this entry cannot perform.
 *
 * @module @deepseek-ai/dsh-client-ui-settings-account/QuotaTopUpAction
 */

import type { HostObservable, InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the turn-error repair seat and its owner props.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { AccountSnapshot } from './AccountSection.tsx'
import type { PlatformPages } from './platform-pages.ts'
import css from './QuotaTopUpAction.module.css'

/** Injected share of the account route's quota failure row entry. */
export interface QuotaTopUpActionInjected {
  /** Desktop-only: show the balance page in the account feature's shared native host; absent in ordinary browsers. */
  openPlatformPage?: PlatformPages['open']
  hooks: {
    account: HostObservable<AccountSnapshot>
  }
}

/** The failure codes a balance top-up can repair. */
const QUOTA_CODES: ReadonlySet<string> = new Set(['QUOTA', 'ACCOUNT_QUOTA'])

/**
 * @param props - failure code, localized label, live account state, and the shared Platform page channel.
 * @returns the label as the top-up gesture, or null when this entry cannot repair the failure.
 */
export function QuotaTopUpAction({
  code, label, openPlatformPage, useAccount,
}: PropsRuntime<'conversation.chat.turn-error.top-up'> & InjectFace<QuotaTopUpActionInjected>) {
  const signedIn = useAccount(snapshot => snapshot.view?.status === 'credential-stored')
  const topUpUrl = useAccount(snapshot => snapshot.view?.links.topUpUrl)
  if (code === undefined || !QUOTA_CODES.has(code)) return null
  // The shared native page is the Desktop destination and carries its own
  // sign-in, so the durable row keeps this gesture across a sign-out. The page
  // request outlives this row (a later request or the viewer's own return
  // retires it), so a re-render never closes it.
  if (openPlatformPage !== undefined) {
    return (
      <button type="button" className={css.link} onClick={() => { openPlatformPage('top-up', () => {}) }}>
        {label}
      </button>
    )
  }
  // A browser tab leaves the app, so the hosted billing page is offered only
  // while a stored account credential makes it the reader's own account.
  if (!signedIn || topUpUrl === undefined || topUpUrl === '') return null
  return <a className={css.link} href={topUpUrl} target="_blank" rel="noreferrer">{label}</a>
}
