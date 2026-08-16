/**
 * The IAM-backed account source: binds the settings-menu account seam
 * (`ctx.account.setSource`) to the IAM controller state. Snapshot identity
 * follows the controller's state object — a stable reference until the
 * session moves. The source's presence means the ui-iam plugin is active, so
 * the menu advertises the sign-in row while signed out even before the IAM
 * base URL is configured — the modal then opens into the configuration
 * notice instead of a silent no-op.
 */

import type { AccountProfile, AccountSource } from '@deepseek-ai/dsh-client-ui-settings-menu/client'
import type { SdkworkAuthControllerState } from '@sdkwork/auth-pc-react'
import type { IamService } from './iam-service.ts'

/**
 * Project the controller state onto the menu's account profile.
 * @param state - the live controller state.
 * @returns the account profile the menu renders.
 */
export function toAccountProfile(state: SdkworkAuthControllerState): AccountProfile {
  if (!state.isAuthenticated || state.user === null) {
    return { signedIn: false, signInAvailable: true }
  }
  const user = state.user
  return {
    signedIn: true,
    username: user.displayName ?? user.username ?? user.email ?? user.id,
  }
}

/**
 * Build the account source the settings menu consumes.
 * @param service - the IAM service face.
 * @returns the source bound through `ctx.account.setSource`.
 */
export function createIamAccountSource(service: IamService): AccountSource {
  let lastState: SdkworkAuthControllerState | undefined
  let lastProfile: AccountProfile | undefined

  return {
    getSnapshot(): AccountProfile {
      const state = service.controller.getState()
      if (state !== lastState) {
        lastState = state
        lastProfile = toAccountProfile(state)
      }
      return lastProfile as AccountProfile
    },
    subscribe: listener => service.subscribe(listener),
    logout: () => { void service.controller.signOut() },
    signIn: () => { service.openSignIn() },
  }
}
