export interface TokenManager {
  getAccessToken(): string | undefined
  clear(): void
}

/**
 * Global TokenManager for the H5 renderer. Exactly one instance exists per renderer; it
 * stores credentials through typed host adapters (secure storage on native hosts, session
 * storage on the web) and is cleared on logout, refresh failure, tenant switch, and account
 * switch. Tokens are never held in component state or logged.
 */
export function createTokenManager(): TokenManager {
  let accessToken: string | undefined
  return {
    getAccessToken: () => accessToken,
    clear: () => {
      accessToken = undefined
    },
  }
}
