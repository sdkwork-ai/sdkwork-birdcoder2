/** SDKWork deployment environment settings stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the ui-sdkwork-env plugin. */
export const UI_ENV_NAMESPACE = 'ui-sdkwork-env'

/** The deployment environments every sdkwork integration profile belongs to. */
export type SdkworkEnvironment = 'development' | 'testing' | 'production'

/** Field selecting the active environment. */
export const UI_ENV_ENVIRONMENT_FIELD = 'environment'

/** One environment's sdkwork integration facts, shared by every consuming plugin. */
export interface SdkworkEnvProfile {
  /** SDKWork API gateway origin (IAM auth + API clients). */
  apiBaseUrl: string
  /** Tenant application id reported to the IAM backend. */
  appId: string
  /** Product app key reported to platform collectors (e.g. feedback). */
  appKey: string
  /** Static access token for non-interactive API calls; empty falls back to the IAM session. */
  accessToken: string
}

/** Durable ui-sdkwork-env section shared by the Host schema and the browser scope. */
export interface UiEnvSettings {
  /** The active environment; its profile feeds every sdkwork integration. */
  environment: SdkworkEnvironment
  development: SdkworkEnvProfile
  testing: SdkworkEnvProfile
  production: SdkworkEnvProfile
}

/**
 * Reads the dev-time local platform gateway anchor
 * (APP_RUNTIME_TOPOLOGY_SPEC section 4.2, SDK_SPEC section 5.1 step 2).
 * Host/node callers receive it through process env; browser bundles receive
 * the VITE_-prefixed form through import.meta.env. Absent means "not running
 * local development", so the environment domain family is used instead.
 */
function resolveLocalGatewayUrl(): string | undefined {
  const browserEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const candidate =
    browserEnv?.VITE_SDKWORK_LOCAL_PLATFORM_API_GATEWAY_HTTP_URL?.trim() ||
    processEnv?.VITE_SDKWORK_LOCAL_PLATFORM_API_GATEWAY_HTTP_URL?.trim() ||
    processEnv?.SDKWORK_LOCAL_PLATFORM_API_GATEWAY_HTTP_URL?.trim()
  return candidate ? candidate.replace(/\/+$/u, '') : undefined
}

/** The API gateway origin default per environment: `api-<tier>.birdcoder.com` off production, bare `api.birdcoder.com` in production. */
const DEFAULT_API_BASE_URL: Record<SdkworkEnvironment, string> = {
  development: resolveLocalGatewayUrl() ?? 'http://api-dev.birdcoder.com',
  testing: 'https://api-test.birdcoder.com',
  production: 'https://api.birdcoder.com',
}

function profileSchema(defaultBaseUrl: string): z<SdkworkEnvProfile> {
  return z.object({
    apiBaseUrl: z.string().default(defaultBaseUrl),
    appId: z.string().default('sdkwork-birdcoder'),
    appKey: z.string().default('sdkwork-birdcoder'),
    accessToken: z.string().default(''),
  })
}

/** Durable ui-sdkwork-env schema; also the wire envelope the browser scope validates against. */
export const UiEnvSettingsSchema: z<UiEnvSettings> = z.object({
  [UI_ENV_ENVIRONMENT_FIELD]: z.union([z.const('development'), z.const('testing'), z.const('production')]).default('development'),
  development: profileSchema(DEFAULT_API_BASE_URL.development),
  testing: profileSchema(DEFAULT_API_BASE_URL.testing),
  production: profileSchema(DEFAULT_API_BASE_URL.production),
})

/** The schema defaults, for reads before the settings scope resolves. */
export const DEFAULT_UI_ENV_SETTINGS: UiEnvSettings = {
  [UI_ENV_ENVIRONMENT_FIELD]: 'production',
  development: { apiBaseUrl: DEFAULT_API_BASE_URL.development, appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
  testing: { apiBaseUrl: DEFAULT_API_BASE_URL.testing, appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
  production: { apiBaseUrl: DEFAULT_API_BASE_URL.production, appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
}
