/**
 * Declaration facade for the SDKWork token-manager surface used by this
 * plugin. The tests project and browser bundle resolve the real package.
 */

/** Token values copied from the host IAM session. */
export interface AuthTokens {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

/** Token persistence face required by the composed App Store client. */
export interface AuthTokenManager {
  setAccessToken(token: string): void
  setTokens(tokens: AuthTokens): void
  clearTokens(): void
}

/** Create an in-memory SDKWork token manager. */
export declare function createTokenManager(): AuthTokenManager
