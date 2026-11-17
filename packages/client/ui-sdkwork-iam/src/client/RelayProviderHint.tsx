/**
 * The BirdCoder provider card's sign-in notice.
 *
 * The relay authenticates with the signed-in SDKWork IAM `authToken`, so a card
 * with no credential is waiting on a login rather than on a key typed
 * somewhere else. The notice names that path on the row itself and offers the
 * gesture; once the session reaches the Host, the credential mirrors into the
 * provider reference and this notice disappears. A key the user enters on the
 * card still wins over the token, so the editor below stays the override path.
 *
 * Registered for the `llm-pi-ai` provider cards and inert on every other route.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-iam/RelayProviderHint
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the provider-card slot declaration and its owner props.
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import css from './RelayProviderHint.module.css'

/** The route whose credential the signed-in session supplies. */
const RELAY_PROVIDER = 'birdcoder'

/** The actions the notice dispatches through the IAM service. */
export interface RelayProviderHintInjected {
  /**
   * Open the product sign-in surface.
   * @returns true once a session exists, false when the user dismissed it.
   */
  requestSignIn: () => Promise<boolean>
  /**
   * Whether a session is already held. Read at render time: the card re-renders
   * when the credential join refreshes, which is also when the mirrored token
   * arrives.
   * @returns whether the page holds a signed-in session.
   */
  signedIn: () => boolean
}

/**
 * Render the relay sign-in notice for an unconfigured BirdCoder card.
 * @param props - card owner data, IAM actions, and the section copy.
 * @returns the notice, or null when this card needs none.
 */
export function RelayProviderHint({
  provider: row, keyConfigured, requestSignIn, signedIn, t,
}: PropsRuntime<'settings.models.provider-card'> & PropsLocale<'uiIam'> & InjectFace<RelayProviderHintInjected>) {
  if (row.provider !== RELAY_PROVIDER || keyConfigured || signedIn()) return null
  return (
    <p className={css.hint} data-relay-sign-in="true">
      <span>{t('relay.signInHint')}</span>
      <button
        type="button"
        className={css.action}
        onClick={() => { void requestSignIn() }}
      >
        {t('relay.signIn')}
      </button>
    </p>
  )
}
