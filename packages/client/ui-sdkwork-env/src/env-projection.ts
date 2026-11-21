/**
 * Launch-environment projection for the ui-sdkwork-env settings section: resolve the
 * deployment profile the launch environment declares and project its base URL
 * and bootstrap access token into the settings composition `base` layer, so
 * every SDKWork integration plugin reads them through `ctx.env` without the
 * user editing the settings document. The user layer still wins: the settings
 * service resolves schema defaults, then this base, then the user document.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-env/env-projection
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

/** Launch-environment key naming the IM gateway origin, application-scoped first. */
export const SDKWORK_IM_API_BASE_URL_KEYS = [
  'SDKWORK_IM_API_BASE_URL',
  'SDKWORK_BIRDCODER_IM_API_BASE_URL',
] as const

/** Launch-environment key naming the IM embed bundle the host loads at runtime. */
const IM_EMBED_URL_KEYS = ['SDKWORK_IM_EMBED_URL', 'SDKWORK_BIRDCODER_IM_EMBED_URL'] as const

/**
 * Launch-environment keys naming the CloudRouter portal origin: the hosted IAM
 * authorization and sign-out pages a desktop sign-out hands to the browser.
 */
export const SDKWORK_CLOUD_ROUTER_URL_KEYS = [
  'SDKWORK_CLOUDROUTER_PUBLIC_HTTP_URL',
  'SDKWORK_CLOUDROUTER_ROUTER_APPLICATION_PUBLIC_HTTP_URL',
  'SDKWORK_BIRDCODER_CLOUDROUTER_URL',
] as const

/** Environment keys declaring the lifecycle tier, application-scoped first. */
const ENVIRONMENT_KEYS = ['SDKWORK_BIRDCODER_ENVIRONMENT', 'SDKWORK_ENVIRONMENT'] as const

/**
 * Launch-environment keys naming the registered deploy application id this
 * build belongs to (`APPLICATION_IDENTITY_SPEC.md` section 4), application-scoped
 * first.
 *
 * The page build writes the value it resolved from the deployment anchor into
 * `SDKWORK_APP_ID`, so the browser knows which installation it targets even when
 * the platform read cannot answer. The committed placeholder is not an
 * installation, so it is never projected.
 */
export const SDKWORK_APP_ID_KEYS = ['SDKWORK_BIRDCODER_APP_ID', 'SDKWORK_APP_ID'] as const

/** Launch-environment keys naming this surface's product application key, application-scoped first. */
export const SDKWORK_APP_KEY_KEYS = ['SDKWORK_BIRDCODER_APP_KEY', 'SDKWORK_APP_KEY'] as const

/** Committed placeholder a profile carries until a build supplies the anchor. */
const PENDING_DEPLOY_APPLICATION_ID = '__SDKWORK_DEPLOY_APPLICATION_ID__'

/**
 * Resolve the ui-sdkwork-env environment slot the launch environment declares.
 * @param env - the launch environment snapshot.
 * @returns the ui-sdkwork-env slot, or `undefined` when no SDKWork environment key is
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
  const imApiBaseUrl = firstValue(env, SDKWORK_IM_API_BASE_URL_KEYS)
  const accessToken = env.get('SDKWORK_ACCESS_TOKEN')?.value.trim()
  const appId = registeredAppId(firstValue(env, SDKWORK_APP_ID_KEYS))
  const appKey = firstValue(env, SDKWORK_APP_KEY_KEYS)
  const imEmbedUrl = firstValue(env, IM_EMBED_URL_KEYS)
  const cloudRouterUrl = firstValue(env, SDKWORK_CLOUD_ROUTER_URL_KEYS)
  const officialAccountServerIps = env.get('SDKWORK_OFFICIAL_ACCOUNT_SERVER_IPS')?.value.trim()
  const profile = {
    ...baseUrl === undefined ? {} : { apiBaseUrl: baseUrl },
    ...imApiBaseUrl === undefined ? {} : { imApiBaseUrl },
    ...accessToken ? { accessToken } : {},
    ...appId === undefined ? {} : { appId },
    ...appKey === undefined ? {} : { appKey },
    ...imEmbedUrl === undefined ? {} : { imEmbedUrl },
    ...cloudRouterUrl === undefined ? {} : { cloudRouterUrl },
    ...officialAccountServerIps ? { officialAccountServerIps } : {},
  }
  return {
    environment,
    ...Object.keys(profile).length === 0 ? {} : { [environment]: profile },
  }
}

/**
 * Read a deploy application id a build materialized, dropping the committed
 * placeholder (which names no installation).
 * @param value - raw launch-environment value.
 * @returns the id, or undefined when absent or still the placeholder.
 */
function registeredAppId(value: string | undefined): string | undefined {
  return value === undefined || value === PENDING_DEPLOY_APPLICATION_ID ? undefined : value
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
