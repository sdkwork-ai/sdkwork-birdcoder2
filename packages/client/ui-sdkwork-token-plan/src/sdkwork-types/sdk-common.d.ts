/** Token values accepted by the SDKWork authentication manager. */
export interface AuthTokens {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  expiresIn?: number
  expiresAt?: number
  tokenType?: string
  scope?: string
}

/** Operations exposed by the shared SDKWork token manager. */
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

/** Create a token manager used by SDKWork clients.
 * @param initialTokens - Optional initial credentials.
 * @param events - Optional token lifecycle callbacks.
 * @returns A mutable SDKWork token manager.
 */
export function createTokenManager(
  initialTokens?: AuthTokens,
  events?: unknown,
): AuthTokenManager
