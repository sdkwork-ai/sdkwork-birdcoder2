/**
 * SDKWork launch environment for the source `desktop:dev` lane.
 *
 * A packaged Desktop application resolves its own deployment into `process.env`,
 * and every child process inherits it — including the developer's shell, and so
 * `pnpm desktop:dev`. The launch resolver never replaces inherited values (an
 * operator override wins by contract), so a source run started from such a shell
 * would talk to the packaged deployment instead of the checkout's tier.
 *
 * This module declares the development tier for the Electron child instead:
 * inherited production identity, gateway, and token values are dropped and the
 * canonical development identity keys are set, so the child Host resolves
 * `http://api-dev.birdcoder.com` whether its profile directory sits inside the
 * checkout or in an inherited `DSH_HOME`.
 *
 * A deliberate non-production target still wins: an inherited `test`, `staging`,
 * or `demo` tier is preserved, and `DSH_DESKTOP_DEV_KEEP_SDKWORK_ENV=1` keeps
 * every value as-is.
 * @module apps/desktop/scripts/development-sdkwork-env
 */

/** Opt-out that keeps the inherited SDKWork environment untouched. */
export const KEEP_INHERITED_SDKWORK_ENV = 'DSH_DESKTOP_DEV_KEEP_SDKWORK_ENV'

/** Gateway origin the production tier uses; an inherited copy marks a leaked deployment. */
export const PRODUCTION_GATEWAY_URL = 'https://api.birdcoder.com'

/**
 * Canonical development identity (SDKWORK-SPECS ENVIRONMENT_SPEC section 5.1.2)
 * for the standalone Desktop deployment. The launch resolver fills the gateway
 * from the checkout's tracked `.env.standalone.development`, or from its own
 * development default when no checkout encloses the profile directory.
 */
const DEVELOPMENT_IDENTITY: Record<string, string> = {
  SDKWORK_ENVIRONMENT: 'development',
  SDKWORK_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_PROFILE_ID: 'standalone.development',
  SDKWORK_BIRDCODER_ENVIRONMENT: 'development',
  SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_BIRDCODER_PROFILE_ID: 'standalone.development',
}

const ENVIRONMENT_KEYS = ['SDKWORK_BIRDCODER_ENVIRONMENT', 'SDKWORK_ENVIRONMENT'] as const
const PROFILE_ID_KEYS = ['SDKWORK_BIRDCODER_PROFILE_ID', 'SDKWORK_PROFILE_ID'] as const

/** Result of {@link developmentLaunchEnvironment}. */
export interface DevelopmentSdkworkEnvironment {
  /** Environment for the Electron child; the same object when nothing changed. */
  readonly environment: NodeJS.ProcessEnv
  /** Inherited keys dropped from the child environment, in declaration order. */
  readonly dropped: readonly string[]
}

function firstValue(env: NodeJS.ProcessEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

/**
 * Whether the inherited environment names the production tier. A profile id is
 * `<deploymentProfile>.<environment>`, so its second segment is read first.
 * @param env - inherited process environment.
 * @returns true when the declared tier is production or the production gateway is inherited.
 */
export function declaresProductionSdkworkEnvironment(env: NodeJS.ProcessEnv): boolean {
  const declared = firstValue(env, PROFILE_ID_KEYS)?.split('.')[1] ?? firstValue(env, ENVIRONMENT_KEYS)
  if (declared !== undefined) return declared.toLowerCase() === 'production' || declared.toLowerCase() === 'prod'
  return firstValue(env, ['SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL']) === PRODUCTION_GATEWAY_URL
}

/**
 * Declare the development tier for a source `desktop:dev` launch, replacing an
 * inherited production environment. Inherited values of any other tier, and
 * every value when {@link KEEP_INHERITED_SDKWORK_ENV} is `1`, are preserved.
 * @param env - the launching process environment.
 * @returns the environment to pass to the Electron child plus the dropped keys.
 */
export function developmentLaunchEnvironment(env: NodeJS.ProcessEnv): DevelopmentSdkworkEnvironment {
  if (env[KEEP_INHERITED_SDKWORK_ENV] === '1' || !declaresProductionSdkworkEnvironment(env)) {
    return { environment: env, dropped: [] }
  }
  const next: NodeJS.ProcessEnv = { ...env }
  const dropped: string[] = []
  for (const key of Object.keys(next)) {
    if (!key.startsWith('SDKWORK_') && !key.startsWith('VITE_SDKWORK_')) continue
    delete next[key]
    dropped.push(key)
  }
  return { environment: { ...next, ...DEVELOPMENT_IDENTITY }, dropped }
}
