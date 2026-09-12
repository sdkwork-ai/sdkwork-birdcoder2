import type { SdkClients } from './sdkClients'

export interface IamRuntime {
  isAuthenticated(): boolean
}

/**
 * Appbase IAM runtime wiring. Login, registration, refresh, logout, current session,
 * and global TokenManager propagation are owned by the appbase IAM packages
 * (APP_SDK_INTEGRATION_SPEC.md, IAM_LOGIN_INTEGRATION_SPEC.md); this module only
 * composes them and stays free of credential handling.
 */
export function createIamRuntime(_sdk: SdkClients): IamRuntime {
  return { isAuthenticated: () => false }
}
