import type { SdkClients } from './sdkClients'
import type { TokenManager } from './tokenManager'

export interface IamRuntime {
  isAuthenticated(): boolean
}

/**
 * Appbase IAM runtime wiring for H5.
 *
 * Login, registration, refresh, logout, and current session follow
 * `IAM_LOGIN_INTEGRATION_SPEC.md`; one global TokenManager is injected, and the
 * clearing behaviour on logout / refresh failure / tenant switch lives here and
 * in the domain services, never in UI components.
 *
 * "Signed in" is deliberately read from the token manager rather than from a
 * local flag: the private bootstrap Access-Token artifact makes the protected
 * surfaces usable before the first interactive login
 * (`APP_SDK_INTEGRATION_SPEC.md` section 4), and a flag that only interactive
 * login set would hide every screen behind a login page the owner may not need.
 */
export function createIamRuntime(_sdk: SdkClients, tokens: TokenManager): IamRuntime {
  return {
    isAuthenticated: () => (tokens.getAccessToken() ?? '').length > 0,
  }
}
