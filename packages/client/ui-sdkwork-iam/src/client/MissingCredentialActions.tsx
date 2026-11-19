/**
 * The Chat failure row's fixes for a missing model credential.
 *
 * A BirdCoder relay request without a credential is the one failure this
 * product knows two answers for: sign in (the relay reads the signed-in Auth
 * Token as its API key), or store a key on the Models page. The row hands the
 * stable failure code to every registered fix, so this entry answers
 * `MISSING_CREDENTIAL` alone and lets the Chat package stay provider-agnostic.
 *
 * The sign-in link disappears once a session is held: the token is then the
 * credential, so only the Models page can repair the row. The configure link
 * opens the settings dialog on the BirdCoder card, the provider whose missing
 * key the failure row is describing.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-iam/MissingCredentialActions
 */

import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the turn-error action seat and its owner props.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import css from './MissingCredentialActions.module.css'

/** The stable failure code these fixes answer. */
const MISSING_CREDENTIAL = 'MISSING_CREDENTIAL'

/** The actions this entry dispatches. */
export interface MissingCredentialActionsInjected {
  /** Raise the product sign-in surface at its entry step. */
  signIn: () => void
  /** Open Settings → Models on the relay provider card. */
  configure: () => void
  hooks: {
    /** Whether the page already holds a signed-in session. */
    signedIn: HostObservable<boolean>
  }
}

/**
 * Render the fixes for one terminal Turn failure.
 * @param props - failure code, IAM actions, and the sign-in fact.
 * @returns the two link buttons for a missing credential, or null for another failure.
 */
export function MissingCredentialActions({
  code, signIn, configure, useSignedIn, t,
}: PropsRuntime<'conversation.chat.turn-error.actions'> & PropsLocale<'uiIam'> & InjectFace<MissingCredentialActionsInjected>) {
  const signedIn = useSignedIn(value => value)
  if (code !== MISSING_CREDENTIAL) return null
  return (
    <>
      {signedIn
        ? null
        : (
          <button type="button" className={css.action} onClick={signIn}>
            {t('turnError.signIn')}
          </button>
        )}
      <button type="button" className={css.action} title={t('turnError.configureHint')} onClick={configure}>
        {t('turnError.configure')}
      </button>
    </>
  )
}
