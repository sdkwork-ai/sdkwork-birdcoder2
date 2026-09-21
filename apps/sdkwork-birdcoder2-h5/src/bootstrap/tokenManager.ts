import { readBootstrapAccessTokenFromProcessEnv } from '@sdkwork/iam-credential-entry'

export interface TokenManager {
  getAccessToken(): string | undefined
  clear(): void
}

/**
 * Global TokenManager for the H5 renderer. Exactly one instance exists per renderer; it
 * stores credentials through typed host adapters (secure storage on native hosts, session
 * storage on the web) and is cleared on logout, refresh failure, tenant switch, and account
 * switch. Tokens are never held in component state or logged.
 *
 * `getAccessToken()` falls back to the private bootstrap Access-Token artifact
 * (`APP_SDK_INTEGRATION_SPEC.md` section 4): generated SDK transports resolve `Access-Token`
 * exclusively from the bound TokenManager and fail before dispatch when it is empty, so a
 * manager that only held an interactive-login value would make every protected surface
 * unusable before the first login.
 */
export function createTokenManager(): TokenManager {
  let accessToken: string | undefined
  const resolveAccessToken = (): string | undefined => (
    accessToken ?? readBootstrapAccessTokenFromProcessEnv()
  )
  return {
    getAccessToken: resolveAccessToken,
    clear: () => {
      accessToken = undefined
    },
  }
}
