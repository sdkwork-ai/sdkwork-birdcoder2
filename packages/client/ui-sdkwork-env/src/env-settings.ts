/** SDKWork deployment environment settings stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the ui-sdkwork-env plugin. */
export const UI_ENV_NAMESPACE = 'ui-sdkwork-env'

/** The deployment environments every sdkwork integration profile belongs to. */
export type SdkworkEnvironment = 'development' | 'testing' | 'production'

/** Field selecting the active environment. */
export const UI_ENV_ENVIRONMENT_FIELD = 'environment'

/**
 * Page-global key carrying the launch-environment projection. The env files
 * live on the Host, so this global is how the browser half learns which
 * environment the launch declared before the settings scope resolves.
 */
export const SDKWORK_ENV_BOOT_GLOBAL = '__DSH_SDKWORK_ENV__'

/**
 * The settings fields the launch environment declares: the active environment
 * plus that slot's base URL and bootstrap access token. Absent fields stay on
 * the schema defaults, and the resolved settings document overrides every one.
 * Per-environment profiles are partial: a layer names only the fields it
 * carries, and `mergeEnvLayers` fills the rest from the schema defaults.
 */
export type SdkworkEnvProjection = {
  [K in keyof UiEnvSettings]?: UiEnvSettings[K] extends object ? Partial<UiEnvSettings[K]> : UiEnvSettings[K]
}

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

function profileFields(defaultBaseUrl: string): z<SdkworkEnvProfile> {
  return z.object({
    apiBaseUrl: z.string().default(defaultBaseUrl),
    appId: z.string().default('sdkwork-birdcoder'),
    appKey: z.string().default('sdkwork-birdcoder'),
    accessToken: z.string().default(''),
  })
}

/**
 * Durable ui-sdkwork-env fields, shared by the Host Config (which marks them
 * volatile so the browser scope can read them) and the wire envelope below.
 */
export const UiEnvSettingsFields = {
  [UI_ENV_ENVIRONMENT_FIELD]: z.union([z.const('development'), z.const('testing'), z.const('production')]).default('development'),
  development: profileFields(DEFAULT_API_BASE_URL.development),
  testing: profileFields(DEFAULT_API_BASE_URL.testing),
  production: profileFields(DEFAULT_API_BASE_URL.production),
}

/** Durable ui-sdkwork-env schema; also the wire envelope the browser scope validates against. */
export const UiEnvSettingsSchema: z<UiEnvSettings> = z.object(UiEnvSettingsFields)

/** The three profile slots, in declaration order. */
export const ENV_PROFILE_KEYS = ['development', 'testing', 'production'] as const

/**
 * The schema defaults, for reads before the settings scope resolves.
 *
 * The pre-ready fallback must mirror the schema default (`development`, the
 * SDKWORK-SPECS launch tier of every source/dev run): production selection may
 * only arrive from the launch-environment projection (packaged builds) or the
 * user settings document, never from this constant — otherwise the first
 * request of a `pnpm desktop:dev` session fires against the production
 * gateway before the scope resolves.
 */
export const DEFAULT_UI_ENV_SETTINGS: UiEnvSettings = {
  [UI_ENV_ENVIRONMENT_FIELD]: 'development',
  development: { apiBaseUrl: DEFAULT_API_BASE_URL.development, appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
  testing: { apiBaseUrl: DEFAULT_API_BASE_URL.testing, appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
  production: { apiBaseUrl: DEFAULT_API_BASE_URL.production, appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
}

/**
 * Resolve the settings layers in the order the Host resolves them: the schema
 * defaults, then the launch-environment projection, then the settings
 * document. A profile merges field by field, so a layer naming only a base URL
 * keeps the default app id and app key.
 * @param layers - Layers in ascending precedence.
 * @returns the resolved settings.
 */
export function mergeEnvLayers(...layers: readonly SdkworkEnvProjection[]): UiEnvSettings {
  const resolved = structuredClone(DEFAULT_UI_ENV_SETTINGS) as UiEnvSettings
  for (const layer of layers) {
    for (const profile of ENV_PROFILE_KEYS) {
      const declared = layer[profile]
      if (declared === undefined) continue
      Object.assign(resolved[profile], declared)
    }
    const environment = layer[UI_ENV_ENVIRONMENT_FIELD]
    if (environment !== undefined) resolved[UI_ENV_ENVIRONMENT_FIELD] = environment
  }
  return resolved
}

function isSdkworkEnvironment(value: unknown): value is SdkworkEnvironment {
  return typeof value === 'string' && (ENV_PROFILE_KEYS as readonly string[]).includes(value)
}

/**
 * Narrow the projection the Host published to the page. The payload crosses
 * the page boundary, so it is re-narrowed here: `environment` gates the
 * active-profile lookup, and a payload naming an unknown tier would leave
 * `profile()` reading an absent slot. An unusable payload reads as an empty
 * projection, so the schema defaults stand.
 * @param value - the page global's value.
 * @returns the projection, or an empty one when the payload is unusable.
 */
export function decodeEnvProjection(value: unknown): SdkworkEnvProjection {
  if (typeof value !== 'object' || value === null) return {}
  const environment = (value as Record<string, unknown>)[UI_ENV_ENVIRONMENT_FIELD]
  if (environment !== undefined && !isSdkworkEnvironment(environment)) return {}
  return value as SdkworkEnvProjection
}
