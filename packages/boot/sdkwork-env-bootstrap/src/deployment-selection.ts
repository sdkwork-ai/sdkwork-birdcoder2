/**
 * Deployment-selection helpers for a launcher that pins a lifecycle tier.
 *
 * A packaged or child process may export another application's SDKWork
 * deployment. A launcher that pins a tier must resolve its own deployment from
 * its tracked and per-scope env files instead of inheriting that selection.
 * @module @deepseek-ai/dsh-sdkwork-env-bootstrap/deployment-selection
 */

/**
 * Deployment-selection and deployment-surface keys that a caller pins a tier
 * for. A stale package or child process may export another application's
 * deployment; these are the names that must be resolved from the caller's own
 * files instead. The bootstrap credential is deliberately not included: an
 * operator-provisioned token is an input, not a deployment selection.
 */
export const SDKWORK_DEPLOYMENT_SELECTION_KEYS = [
  'SDKWORK_ENVIRONMENT',
  'SDKWORK_DEPLOYMENT_PROFILE',
  'SDKWORK_PROFILE_ID',
  'SDKWORK_RUNTIME_TARGET',
  'SDKWORK_BIRDCODER_ENVIRONMENT',
  'SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE',
  'SDKWORK_BIRDCODER_PROFILE_ID',
  'SDKWORK_BIRDCODER_RUNTIME_TARGET',
  'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
  'SDKWORK_BIRDCODER_APP_API_BASE_URL',
  'SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL',
  'SDKWORK_IM_API_BASE_URL',
  'SDKWORK_BIRDCODER_IM_API_BASE_URL',
  'SDKWORK_IM_EMBED_URL',
  'SDKWORK_BIRDCODER_IM_EMBED_URL',
  'SDKWORK_APP_DOMAIN',
] as const

/**
 * Copy an environment with the inherited deployment selection removed, so a
 * caller that pins a lifecycle tier resolves that tier from its own tracked and
 * per-scope env files even when the invoking shell inherited another
 * deployment.
 * @param env - the invoking environment.
 * @returns a new environment without the deployment-selection keys.
 */
export function withoutInheritedSdkworkDeployment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const selection = new Set<string>(SDKWORK_DEPLOYMENT_SELECTION_KEYS)
  return Object.fromEntries(Object.entries(env).filter(([name]) => !selection.has(name)))
}
