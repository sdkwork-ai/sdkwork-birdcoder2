/**
 * Declaration facade for `@sdkwork/sdk-common`: the HTTP client and
 * token-manager surface this package composes. The emit program resolves these
 * declarations so the sdkwork source never enters the typecheck/declaration
 * machinery; the tests project (tsconfig.tests.json) and the bundle
 * (tsconfig.bundle.json) resolve the REAL package and act as the drift guard.
 * The declared shapes mirror the published package for the members used here.
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

/** Token persistence face the HTTP client reads for authenticated requests. */
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

/** Creates the token manager the HTTP client reads credentials from. */
export declare function createTokenManager(tokens?: AuthTokens): AuthTokenManager

/** The retry policy the client applies to a request. */
export interface RetryConfig {
  maxRetries: number
  retryDelay: number
  retryBackoff: 'fixed' | 'linear' | 'exponential'
  maxRetryDelay: number
}

/** The logger level names the client accepts. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

/** The subset of client configuration this package sets. */
export interface HttpClientOptions {
  baseUrl: string
  timeout?: number
  headers?: Record<string, string>
  retry?: Partial<RetryConfig>
  logger?: { level?: LogLevel; prefix?: string; timestamp?: boolean; colors?: boolean }
  tokenManager?: AuthTokenManager
  accessToken?: string
  authToken?: string
  apiKey?: string
}

/** Query values are stringified by the client. */
export type QueryParams = Record<string, string | number | boolean | null | undefined | readonly (string | number | boolean)[]>

/** The request operations this package calls. */
export interface BaseHttpClient {
  get<T>(path: string, params?: QueryParams): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
}

/**
 * Creates an HTTP client that joins `baseUrl` and the path, sends the
 * dual-token credential headers, unwraps the `{ code, data, traceId }`
 * envelope, and throws a `SdkError` for a non-success envelope or HTTP status.
 */
export declare function createBaseHttpClient(config: HttpClientOptions): BaseHttpClient

/** Error class thrown for a non-success HTTP response or business envelope. */
export declare class SdkError extends Error {
  readonly code: string
  readonly httpStatus: number | undefined
  readonly traceId: string | undefined
}
