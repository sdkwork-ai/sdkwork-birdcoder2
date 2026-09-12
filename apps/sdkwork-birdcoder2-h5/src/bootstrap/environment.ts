/** H5 environment selection (APP_H5_ARCHITECTURE_SPEC.md §2.1). */
export interface EnvironmentSelection {
  readonly environment: 'development' | 'test' | 'staging' | 'demo' | 'production'
  readonly deploymentProfile: 'standalone' | 'cloud'
  readonly runtimeTarget: 'browser' | 'capacitor-ios' | 'capacitor-android'
}

const LIFECYCLE_ENVIRONMENTS = ['development', 'test', 'staging', 'demo', 'production'] as const
const ALIASES: Record<string, (typeof LIFECYCLE_ENVIRONMENTS)[number]> = { dev: 'development', prod: 'production' }

export function resolveEnvironment(): EnvironmentSelection {
  const raw = String(import.meta.env.VITE_SDKWORK_ENVIRONMENT ?? '').trim()
  const environment = (LIFECYCLE_ENVIRONMENTS as readonly string[]).includes(raw)
    ? (raw as EnvironmentSelection['environment'])
    : (ALIASES[raw] ?? 'development')
  const deploymentProfile = import.meta.env.VITE_SDKWORK_DEPLOYMENT_PROFILE === 'cloud' ? 'cloud' : 'standalone'
  const runtimeTarget = (import.meta.env.VITE_SDKWORK_RUNTIME_TARGET ?? 'browser') as EnvironmentSelection['runtimeTarget']
  return { environment, deploymentProfile, runtimeTarget }
}
