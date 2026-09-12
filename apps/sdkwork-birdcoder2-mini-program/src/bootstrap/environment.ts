/** Mini program environment selection (MINI_PROGRAM_APP_ARCHITECTURE_SPEC.md §10). */
export interface EnvironmentSelection {
  readonly environment: 'development' | 'test' | 'staging' | 'demo' | 'production'
  readonly deploymentProfile: 'standalone' | 'cloud'
  readonly runtimeTarget: 'mini-program'
}

const LIFECYCLE_ENVIRONMENTS = ['development', 'test', 'staging', 'demo', 'production'] as const

/**
 * The build selects exactly one profile explicitly and bundles one safe runtime module.
 * Values come from `config/mini-program/runtime-env.<deployment-profile>.<environment>.json`.
 */
export function resolveEnvironment(): EnvironmentSelection {
  const raw = String(SDKWORK_RUNTIME_ENV?.SDKWORK_ENVIRONMENT ?? 'development').trim()
  const environment = (LIFECYCLE_ENVIRONMENTS as readonly string[]).includes(raw)
    ? (raw as EnvironmentSelection['environment'])
    : 'development'
  const deploymentProfile = SDKWORK_RUNTIME_ENV?.SDKWORK_DEPLOYMENT_PROFILE === 'cloud' ? 'cloud' : 'standalone'
  return { environment, deploymentProfile, runtimeTarget: 'mini-program' }
}

/** Injected at build time from the materialized runtime env module. */
declare const SDKWORK_RUNTIME_ENV:
  | { readonly SDKWORK_ENVIRONMENT?: string; readonly SDKWORK_DEPLOYMENT_PROFILE?: string }
  | undefined
