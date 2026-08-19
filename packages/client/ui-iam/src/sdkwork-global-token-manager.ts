/**
 * Browser-global SDKWork credential transport shared by IAM and every
 * SDKWork-backed client plugin. One {@link AuthTokenManager} keeps login
 * state consistent across Token Plan, Drive, Knowledge, Agents, and Feedback.
 * @module @deepseek-ai/dsh-client-ui-iam/sdkwork-global-token-manager
 */
import { createTokenManager, type AuthTokenManager, type AuthTokens } from '@sdkwork/sdk-common'

/** IAM session fields merged into the shared token manager. */
export interface SdkworkHostSessionTokens {
  accessToken?: string
  authToken?: string
  refreshToken?: string
}

type SdkworkGlobalTokenHost = typeof globalThis & {
  __DSH_SDKWORK_GLOBAL_TOKEN_MANAGER__?: AuthTokenManager
}

/**
 * Merge IAM session tokens with the env access token the way App Store and
 * Drive hosts do. IAM tokens are the signed-in credentials; a static env
 * access token fills Access-Token when the session omits it and is the
 * anonymous catalog credential when signed out.
 *
 * @param session - current IAM session, or null when signed out.
 * @param staticAccessToken - ui-env access token from the active deployment.
 * @returns the credential snapshot for SDKWork clients and session providers.
 */
export function mergeSdkworkSessionTokens(
  session: SdkworkHostSessionTokens | null | undefined,
  staticAccessToken: string,
): AuthTokens {
  const staticToken = staticAccessToken.trim()
  const iamAccessToken = session?.accessToken?.trim()
  const authToken = session?.authToken?.trim()
  const refreshToken = session?.refreshToken?.trim()
  const accessToken = iamAccessToken || staticToken
  const tokens: AuthTokens = {}
  if (accessToken) tokens.accessToken = accessToken
  if (authToken) tokens.authToken = authToken
  if (refreshToken) tokens.refreshToken = refreshToken
  return tokens
}

/**
 * Write merged IAM and env credentials into the shared token manager.
 * @param session - current IAM session, or null when signed out.
 * @param staticAccessToken - ui-env access token from the active deployment.
 */
export function syncSdkworkGlobalTokenManager(
  session: SdkworkHostSessionTokens | null | undefined,
  staticAccessToken: string,
): void {
  const tokens = mergeSdkworkSessionTokens(session, staticAccessToken)
  const manager = getSdkworkGlobalTokenManager()
  if (tokens.accessToken || tokens.authToken || tokens.refreshToken) manager.setTokens(tokens)
  else manager.clearTokens()
}

/**
 * @returns the browser-global SDKWork token manager shared by all plugins.
 */
export function getSdkworkGlobalTokenManager(): AuthTokenManager {
  const host = globalThis as SdkworkGlobalTokenHost
  host.__DSH_SDKWORK_GLOBAL_TOKEN_MANAGER__ ??= createTokenManager()
  return host.__DSH_SDKWORK_GLOBAL_TOKEN_MANAGER__
}

/** Clear the browser-global manager so tests can prove isolation. */
export function resetSdkworkGlobalTokenManager(): void {
  delete (globalThis as SdkworkGlobalTokenHost).__DSH_SDKWORK_GLOBAL_TOKEN_MANAGER__
}
