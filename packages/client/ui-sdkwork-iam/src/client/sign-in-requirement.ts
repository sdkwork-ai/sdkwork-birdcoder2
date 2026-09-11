/**
 * Deferred sign-in requirement: the "ask at the door" half of the SDKWork IAM
 * contract.
 *
 * An eager gated mode page states its requirement in place — signed out it
 * renders the notice instead of the product. A deferred page does the
 * opposite: it renders the product immediately and moves the requirement onto
 * the backend transport, so the interface is browsable while signed out and a
 * session is demanded only at the moment a request actually needs one. The
 * request is held, not failed: {@link createSignInRequestInterceptor} awaits
 * {@link SdkworkSignInRequirement.requireSignedIn} inside the SDK's async
 * request-interceptor chain, which lets the same call resume once the overlay
 * reports a session.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-iam/sign-in-requirement
 */
import type { RequestConfig } from '@sdkwork/sdk-common'

/**
 * Raised in place of a backend call the user declined to sign in for. The
 * caller sees a rejected request it can surface as "sign in to continue"
 * rather than a transport failure.
 */
export class SdkworkSignInRequiredError extends Error {
  /** Stable discriminator for callers that branch on the failure kind. */
  readonly code = 'SDKWORK_SIGN_IN_REQUIRED'

  /**
   * @param message - human-readable reason shown by the calling surface.
   */
  constructor(message = 'SDKWork sign-in is required to run this operation') {
    super(message)
    this.name = 'SdkworkSignInRequiredError'
  }
}

/**
 * The session requirement a deferred page shares with its backend transport.
 * Implemented by `ctx.iam`; consumed by the host adapters that build SDK
 * clients.
 */
export interface SdkworkSignInRequirement {
  /** @returns whether a signed-in session is already available. */
  isSignedIn(): boolean
  /**
   * Demand a session, opening the sign-in overlay when needed.
   * @returns true once signed in, false when the user dismissed the overlay.
   */
  requestSignIn(): Promise<boolean>
  /**
   * Block until a session exists.
   * @returns a promise rejecting with {@link SdkworkSignInRequiredError} when
   * the user dismissed the overlay instead of signing in.
   */
  requireSignedIn(): Promise<void>
}

/**
 * HTTP methods that change server state, and therefore only ever run because
 * the user asked for them. A read is issued by the page itself while it
 * mounts, so gating reads would turn "open the generator" into a login wall.
 */
const USER_INITIATED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Whether a request was raised by a user gesture rather than by the page
 * loading itself.
 * @param method - the request's HTTP method.
 * @returns whether the method mutates server state.
 */
export function isUserInitiatedRequest(method: string): boolean {
  return USER_INITIATED_METHODS.has(method.trim().toUpperCase())
}

/**
 * The default gate rule: a mutation needs a session, an anonymous read does
 * not, and a request the SDK marked `skipAuth` is public by contract.
 * @param config - the request about to be dispatched.
 * @returns whether the request must wait for a signed-in session.
 */
export function requiresSignedInSession(config: RequestConfig): boolean {
  if (config.skipAuth === true) return false
  return isUserInitiatedRequest(config.method)
}

/** Decides whether one request must wait for a session. */
export type SignInRequirementRule = (config: RequestConfig) => boolean

/**
 * Build the request interceptor that holds session-bearing calls until the
 * user signs in.
 *
 * The SDK awaits request interceptors before dispatching, so awaiting here
 * suspends the HTTP call rather than failing it — after the overlay reports a
 * session the very same call proceeds with the credentials the finished login
 * installed in the shared token manager. A dismissed overlay rejects with
 * {@link SdkworkSignInRequiredError}.
 *
 * @param requirement - the IAM session face (`ctx.iam`).
 * @param rule - when a request must wait; defaults to
 * {@link requiresSignedInSession}.
 * @returns a request interceptor for the generated SDK clients.
 */
export function createSignInRequestInterceptor(
  requirement: Pick<SdkworkSignInRequirement, 'isSignedIn' | 'requireSignedIn'>,
  rule: SignInRequirementRule = requiresSignedInSession,
): (config: RequestConfig) => Promise<RequestConfig> {
  return async (config: RequestConfig): Promise<RequestConfig> => {
    if (!rule(config)) return config
    if (requirement.isSignedIn()) return config
    await requirement.requireSignedIn()
    return config
  }
}
