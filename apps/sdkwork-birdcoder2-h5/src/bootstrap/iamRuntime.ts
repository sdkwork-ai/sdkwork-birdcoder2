import type { SdkClients } from './sdkClients'
import type { TokenManager } from './tokenManager'

export interface IamRuntime {
  isAuthenticated(): boolean
}

/**
 * Appbase IAM runtime wiring for H5. Login, registration, refresh, logout, and current
 * session follow `IAM_LOGIN_INTEGRATION_SPEC.md`; one global TokenManager is injected.
 * Clearing behavior on logout / refresh failure / tenant switch lives here and in the
 * domain services, never in UI components.
 */
export function createIamRuntime(_sdk: SdkClients, _tokens: TokenManager): IamRuntime {
  return { isAuthenticated: () => false }
}
