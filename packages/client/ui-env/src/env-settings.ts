/** SDKWork deployment environment settings stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the ui-env plugin. */
export const UI_ENV_NAMESPACE = 'ui-env'

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

/** Durable ui-env section shared by the Host schema and the browser scope. */
export interface UiEnvSettings {
  /** The active environment; its profile feeds every sdkwork integration. */
  environment: SdkworkEnvironment
  development: SdkworkEnvProfile
  testing: SdkworkEnvProfile
  production: SdkworkEnvProfile
}

const ProfileSchema: z<SdkworkEnvProfile> = z.object({
  apiBaseUrl: z.string().default('https://api.sdkwork.com'),
  appId: z.string().default('sdkwork-birdcoder'),
  appKey: z.string().default('sdkwork-birdcoder'),
  accessToken: z.string().default(''),
})

/** Durable ui-env schema; also the wire envelope the browser scope validates against. */
export const UiEnvSettingsSchema: z<UiEnvSettings> = z.object({
  [UI_ENV_ENVIRONMENT_FIELD]: z.union([z.const('development'), z.const('testing'), z.const('production')]).default('production'),
  development: ProfileSchema,
  testing: ProfileSchema,
  production: ProfileSchema,
})

/** The schema defaults, for reads before the settings scope resolves. */
export const DEFAULT_UI_ENV_SETTINGS: UiEnvSettings = {
  [UI_ENV_ENVIRONMENT_FIELD]: 'production',
  development: { apiBaseUrl: 'https://api.sdkwork.com', appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
  testing: { apiBaseUrl: 'https://api.sdkwork.com', appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
  production: { apiBaseUrl: 'https://api.sdkwork.com', appId: 'sdkwork-birdcoder', appKey: 'sdkwork-birdcoder', accessToken: '' },
}
