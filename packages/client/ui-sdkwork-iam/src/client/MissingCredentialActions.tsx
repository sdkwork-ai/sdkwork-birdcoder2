/**
 * The Chat failure row's in-sentence fixes for a missing model credential.
 *
 * The row owns the sentence and its localized label phrases; these entries turn
 * two of those phrases into gestures without moving the copy. A BirdCoder relay
 * request without a credential is the one failure this product knows two
 * answers for — sign in (the relay then reads the signed-in Auth Token as its
 * API key), or store a key on the Models page — so each seat answers
 * `MISSING_CREDENTIAL` alone and renders nothing for another failure.
 *
 * The sign-in phrase degrades to plain text while a session is held: the relay
 * already has its token then, so only the Models page can repair the row.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-iam/MissingCredentialActions
 */

import type { HostObservable, InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the turn-error repair seats and their owner props.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import css from './MissingCredentialActions.module.css'

/** The stable failure code these links answer. */
const MISSING_CREDENTIAL = 'MISSING_CREDENTIAL'

/** The actions the sign-in link dispatches. */
export interface SignInFixInjected {
  /** Raise the product sign-in surface at its entry step. */
  signIn: () => void
  hooks: {
    /** Whether the page already holds a signed-in session. */
    signedIn: HostObservable<boolean>
  }
}

/** The action the Models-page link dispatches. */
export interface ModelSettingsFixInjected {
  /** Open Settings → Models on the relay provider card. */
  configure: () => void
}

/**
 * Turn the failure sentence's sign-in phrase into the product sign-in gesture.
 * @param props - failure code, localized label, IAM action, and the sign-in fact.
 * @returns the label as a link, as plain text while signed in, or null for another failure.
 */
export function SignInFixLink({
  code, label, signIn, useSignedIn,
}: PropsRuntime<'conversation.chat.turn-error.sign-in'> & InjectFace<SignInFixInjected>) {
  const signedIn = useSignedIn(value => value)
  if (code !== MISSING_CREDENTIAL) return null
  if (signedIn) return <span>{label}</span>
  return (
    <button type="button" className={css.link} onClick={signIn}>
      {label}
    </button>
  )
}

/**
 * Turn the failure sentence's Models phrase into the Settings deep link.
 * @param props - failure code, localized label, and the settings action.
 * @returns the label as a link, or null for another failure.
 */
export function ModelSettingsFixLink({
  code, label, configure,
}: PropsRuntime<'conversation.chat.turn-error.model-settings'> & InjectFace<ModelSettingsFixInjected>) {
  if (code !== MISSING_CREDENTIAL) return null
  return (
    <button type="button" className={css.link} onClick={configure}>
      {label}
    </button>
  )
}
