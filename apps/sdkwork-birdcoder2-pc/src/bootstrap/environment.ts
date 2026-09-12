/**
 * Environment selection. Separates lifecycle environment, deployment profile,
 * build mode, and runtime target (APP_PC_ARCHITECTURE_SPEC.md §2.1).
 */
export interface EnvironmentSelection {
  readonly environment: 'development' | 'test' | 'staging' | 'demo' | 'production'
  readonly deploymentProfile: 'standalone' | 'cloud'
  readonly runtimeTarget: 'browser' | 'desktop' | 'tablet-ipados' | 'tablet-android'
}

const LIFECYCLE_ENVIRONMENTS = ['development', 'test', 'staging', 'demo', 'production'] as const

/** `dev`/`prod` are operator aliases only; canonical env names are used in files. */
const ALIASES: Record<string, (typeof LIFECYCLE_ENVIRONMENTS)[number]> = {
  dev: 'development',
  prod: 'production',
}

export function resolveEnvironment(): EnvironmentSelection {
  const rawEnvironment = normalizeEnvironment(import.meta.env.VITE_SDKWORK_ENVIRONMENT)
  const deploymentProfile = import.meta.env.VITE_SDKWORK_DEPLOYMENT_PROFILE === 'cloud' ? 'cloud' : 'standalone'
  const runtimeTarget = (import.meta.env.VITE_SDKWORK_RUNTIME_TARGET ?? 'browser') as EnvironmentSelection['runtimeTarget']
  return { environment: rawEnvironment, deploymentProfile, runtimeTarget }
}

function normalizeEnvironment(value: string | undefined): EnvironmentSelection['environment'] {
  const candidate = String(value ?? '').trim()
  if ((LIFECYCLE_ENVIRONMENTS as readonly string[]).includes(candidate)) {
    return candidate as EnvironmentSelection['environment']
  }
  return ALIASES[candidate] ?? 'development'
}
