/**
 * Whether the desktop login may present the RFC 8252 loopback redirect.
 *
 * The loopback URI must be registered on the IAM OAuth client first: without
 * that registration the hosted authorize page rejects the request before any
 * callback reaches the app. It is therefore opt-in, with the environment
 * variable taking precedence over the deployment's OEM profile.
 *
 * @module iam-loopback-policy
 */

/** Inputs of {@link loopbackLoginEnabled}. */
export interface LoopbackLoginPolicyInput {
  /** Launch environment (reads `DSH_DESKTOP_IAM_LOOPBACK`). */
  env: NodeJS.ProcessEnv
  /** Whether the OEM profile enables loopback redirects. */
  oemEnabled: boolean
}

/**
 * Resolve the loopback policy for one launch.
 * @param input - process environment and OEM setting.
 * @returns true only when loopback should be presented to the authorize page.
 */
export function loopbackLoginEnabled(input: LoopbackLoginPolicyInput): boolean {
  const configured = input.env.DSH_DESKTOP_IAM_LOOPBACK?.trim()
  if (configured === '1') return true
  if (configured === '0') return false
  return input.oemEnabled
}
