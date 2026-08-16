/**
 * Declaration facade for `@sdkwork/appstore-app-sdk`: the composed consumer
 * surface this package composes. The emit program resolves these declarations
 * so the sdkwork source never enters the typecheck/declaration machinery; the
 * tests project (tsconfig.tests.json) and the bundle (tsconfig.bundle.json)
 * resolve the REAL package and act as the drift guard.
 */

/** Server error envelope the generated client rejects with. */
export interface AppStoreApiError {
  status: number
  code?: number
  traceId?: string
  title?: string
  detail?: string
  type?: string
}

export declare function isAppStoreApiError(error: unknown): error is AppStoreApiError

/** Token persistence face the client uses for authenticated requests. */
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

export interface AuthTokens {
  accessToken?: string
  authToken?: string
  refreshToken?: string
  expiresIn?: number
  expiresAt?: number
  tokenType?: string
  scope?: string
}

/** Client config: the app-api origin plus optional auth/tenant overrides. */
export interface AppStoreClientConfig {
  baseUrl: string
  tokenManager?: AuthTokenManager
  authToken?: string
  accessToken?: string
  tenantId?: string
  organizationId?: string
  platform?: string
  timeout?: number
  authMode?: 'apikey' | 'dual-token'
  headers?: Record<string, string>
}

/** One feedback submission, as accepted by the collector. */
export interface FeedbackCreateRequest {
  type: string
  content: string
  contact?: string
  listingId?: string
  appKey?: string
}

/** The catalog facade surface this package submits through. */
export interface AppStoreClient {
  readonly catalog: {
    submitFeedback(body: FeedbackCreateRequest): Promise<unknown>
  }
}

/** Create the composed appstore client over the generated API. */
export declare function createAppStoreClient(config: AppStoreClientConfig): AppStoreClient
