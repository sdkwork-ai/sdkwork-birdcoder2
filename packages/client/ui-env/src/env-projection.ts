/**
 * Launch-environment projection for the ui-env settings section: resolve the
 * deployment profile the launch environment declares and project its base URL
 * and bootstrap access token into the settings composition `base` layer, so
 * every SDKWork integration plugin reads them through `ctx.env` without the
 * user editing the settings document. The user layer still wins: the settings
 * service resolves schema defaults, then this base, then the user document.
 * @module @deepseek-ai/dsh-client-ui-env/env-projection
 */

import type { LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import type { SdkworkEnvironment, UiEnvSettings } from './env-settings.ts'

/**
 * SDKWork surface URL keys in priority order (ENVIRONMENT_SPEC.md section 6):
 * the platform API gateway origin, then the app-api base URL, then the
 * application public ingress — the first non-empty value wins.
 */
export const SDKWORK_BASE_URL_KEYS = [
  'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
  'SDKWORK_BIRDCODER_APP_API_BASE_URL',
  'SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL',
] as const

/** Identity keys declaring the deployment profile, most specific first. */
const PROFILE_ID_KEYS = ['SDKWORK_PROFILE_ID', 'SDKWORK_BIRDCODER_PROFILE_ID'] as const

/** Environment keys declaring the lifecycle tier, application-scoped first. */
const ENVIRONMENT_KEYS = ['SDKWORK_BIRDCODER_ENVIRONMENT', 'SDKWORK_ENVIRONMENT'] as const

/**
 * Resolve the ui-env environment slot the launch environment declares.
 * @param env - the launch environment snapshot.
 * @returns the ui-env slot, or `undefined` when no SDKWork environment key is
 * declared or the value names an unsupported tier.
 */
export function resolveUiEnvEnvironment(env: LaunchEnvironmentSnapshot): SdkworkEnvironment | undefined {
  const profileId = firstValue(env, PROFILE_ID_KEYS)
  const declared = profileId?.split('.')[1] ?? firstValue(env, ENVIRONMENT_KEYS)
  switch (declared?.toLowerCase()) {
    case 'development':
    case 'dev':
      return 'development'
    case 'test':
    case 'staging':
      return 'testing'
    case 'production':
    case 'prod':
      return 'production'
    default:
      return undefined
  }
}

/**
 * Build the settings composition `base` layer from the launch environment: the
 * active environment slot plus that slot's profile fields the environment
 * declares (base URL and bootstrap access token). Absent keys stay on the
 * schema defaults; the user settings document still overrides everything.
 * @param env - the launch environment snapshot.
 * @returns the projected base layer, empty when no SDKWork environment is declared.
 */
export function projectSdkworkEnvBase(env: LaunchEnvironmentSnapshot): Partial<UiEnvSettings> {
  const environment = resolveUiEnvEnvironment(env)
  if (environment === undefined) return {}
  const baseUrl = firstValue(env, SDKWORK_BASE_URL_KEYS)
  const accessToken = env.get('SDKWORK_ACCESS_TOKEN')?.value.trim()
  const profile = {
    ...baseUrl === undefined ? {} : { apiBaseUrl: baseUrl },
    ...accessToken ? { accessToken } : {},
  }
  return {
    environment,
    ...Object.keys(profile).length === 0 ? {} : { [environment]: profile },
  }
}

function firstValue(
  env: LaunchEnvironmentSnapshot,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = env.get(key)?.value.trim()
    if (value) return value
  }
  return undefined
}
