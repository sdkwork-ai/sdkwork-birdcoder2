import { readBootstrapAccessTokenFromProcessEnv } from '@sdkwork/iam-credential-entry'
import { createTokenManager as createSdkTokenManager, type AuthTokenManager } from '@sdkwork/sdk-common'

/**
 * The renderer's token manager is sdk-common's own implementation.
 *
 * Not a hand-rolled two-method object: the generated transport resolves
 * `Access-Token` exclusively from the bound `AuthTokenManager` and builds dual
 * token headers from it (`APP_SDK_INTEGRATION_SPEC.md` section 4), so anything
 * narrower than the real manager sends empty credentials on every protected
 * call while still type-checking at the call site.
 *
 * The private bootstrap Access-Token artifact seeds it, which is what makes
 * protected surfaces usable before the first interactive login; interactive
 * login replaces the tokens through the same instance, because exactly one
 * manager exists per renderer.
 */
export type TokenManager = AuthTokenManager

/** Creates the single per-renderer token manager. */
export function createTokenManager(): TokenManager {
  const bootstrapAccessToken = readBootstrapAccessTokenFromProcessEnv()
  return createSdkTokenManager(
    bootstrapAccessToken === undefined ? undefined : { accessToken: bootstrapAccessToken },
  )
}
