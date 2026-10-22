/**
 * Publish the active deployment environment to the SDKWork browser runtime
 * bridge (BROWSER_RUNTIME_ENV_SPEC §4): shared SDK resolvers read
 * `globalThis.SDKWORK_RUNTIME_ENV` before any bundled default, so every
 * SDKWork surface embedded in this page (Knowledge Base backend calls, Drive,
 * App Store, IM) targets the same gateway this deployment uses instead of the
 * base URL the shared SDK was published with.
 */
import type { EnvService } from './env-service.ts'

/** Global the shared SDKWork resolvers read for browser runtime values. */
export const SDKWORK_RUNTIME_ENV_GLOBAL = 'SDKWORK_RUNTIME_ENV'

/** Shared-resolver key carrying the active API gateway origin. */
export const SDKWORK_API_BASE_URL_KEY = 'SDKWORK_API_BASE_URL'

/** Shared-resolver key carrying the active IM gateway origin. */
export const SDKWORK_IM_API_BASE_URL_KEY = 'SDKWORK_IM_API_BASE_URL'

/** Shared-resolver key carrying the active environment label. */
export const SDKWORK_ENVIRONMENT_KEY = 'SDKWORK_ENVIRONMENT'

type RuntimeEnvironmentDocument = Record<string, string>

type RuntimeEnvironmentHost = {
  [SDKWORK_RUNTIME_ENV_GLOBAL]?: RuntimeEnvironmentDocument
}

/**
 * Read the documented runtime bridge values for one environment profile.
 * @param env - the environment service.
 * @returns the bridge document describing the active environment.
 */
export function sdkworkRuntimeEnvironment(env: EnvService): RuntimeEnvironmentDocument {
  const profile = env.profile()
  return {
    [SDKWORK_API_BASE_URL_KEY]: profile.apiBaseUrl,
    [SDKWORK_IM_API_BASE_URL_KEY]: profile.imApiBaseUrl || profile.apiBaseUrl,
    [SDKWORK_ENVIRONMENT_KEY]: env.currentEnvironment(),
  }
}

/**
 * Publish the active environment to the runtime bridge and keep it current
 * across environment or profile changes.
 * @param env - the environment service.
 * @returns the disposer restoring the previous document.
 */
export function publishSdkworkRuntimeEnvironment(env: EnvService): () => void {
  const host = globalThis as RuntimeEnvironmentHost
  const previous = host[SDKWORK_RUNTIME_ENV_GLOBAL]
  const publish = (): void => {
    host[SDKWORK_RUNTIME_ENV_GLOBAL] = { ...previous, ...sdkworkRuntimeEnvironment(env) }
  }
  publish()
  const unsubscribe = env.subscribe(publish)
  return () => {
    unsubscribe()
    if (previous === undefined) Reflect.deleteProperty(host, SDKWORK_RUNTIME_ENV_GLOBAL)
    else host[SDKWORK_RUNTIME_ENV_GLOBAL] = previous
  }
}
