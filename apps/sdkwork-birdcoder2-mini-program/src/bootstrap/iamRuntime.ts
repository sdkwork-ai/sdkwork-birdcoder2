import type { SdkClients } from './sdkClients'

export interface IamRuntime {
  isAuthenticated(): boolean
}

/**
 * Appbase IAM runtime wiring for mini programs. Platform storage, token manager, context
 * store, caches, and sensitive state must clear on logout, refresh failure, and account
 * switch before any route renders.
 */
export function createIamRuntime(_sdk: SdkClients): IamRuntime {
  return { isAuthenticated: () => false }
}
