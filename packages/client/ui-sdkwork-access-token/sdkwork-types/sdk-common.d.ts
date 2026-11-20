/**
 * Declaration facade for `@sdkwork/sdk-common`: the token-manager surface this
 * package composes. The emit program resolves these declarations so the
 * sdkwork sibling source never enters the typecheck/declaration machinery; the
 * bundle and the package tests resolve the real package and act as the drift
 * guard.
 */

/** The token set a session carries. */
export interface AuthTokens {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  expiresIn?: number
  expiresAt?: number
  tokenType?: string
  scope?: string
}

/** Optional token lifecycle events. */
export interface TokenManagerEvents {
  onTokenRefresh?: (tokens: AuthTokens) => void
  onTokenExpired?: () => void
  onTokenCleared?: () => void
  onTokenSet?: (tokens: AuthTokens) => void
  onTokenInvalid?: () => void
}

/** Token persistence face the generated clients read for authenticated requests. */
export interface AuthTokenManager {
  getAccessToken(): string | undefined
  getAuthToken(): string | undefined
  getRefreshToken(): string | undefined
  getTokens(): AuthTokens
  setTokens(tokens: AuthTokens): void
  setAccessToken(token: string): void
  setAuthToken(token: string): void
  setRefreshToken(token: string): void
  clearTokens(): void
  clearAuthToken(): void
  clearAccessToken(): void
  isExpired(): boolean
  isValid(): boolean
  hasToken(): boolean
  hasAuthToken(): boolean
  hasAccessToken(): boolean
  willExpireIn(seconds: number): boolean
}

/** Create an in-memory token manager, optionally seeded and evented. */
export declare function createTokenManager(tokens?: AuthTokens, events?: TokenManagerEvents): AuthTokenManager
