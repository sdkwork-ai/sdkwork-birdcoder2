/**
 * Environment selection. Separates lifecycle environment, deployment profile,
 * build mode, and tablet runtime target (APP_PAD_ARCHITECTURE_SPEC.md §6.1).
 */
export type TabletRuntimeTarget = 'tablet-ipados' | 'tablet-android'

export interface EnvironmentSelection {
  readonly environment: 'development' | 'test' | 'staging' | 'demo' | 'production'
  readonly deploymentProfile: 'standalone' | 'cloud'
  readonly profileId: string
  readonly runtimeTarget: TabletRuntimeTarget
}

const LIFECYCLE_ENVIRONMENTS = ['development', 'test', 'staging', 'demo', 'production'] as const
const TABLET_RUNTIME_TARGETS: readonly TabletRuntimeTarget[] = ['tablet-ipados', 'tablet-android']

/** `dev`/`prod` are operator aliases only; canonical env names are used in files. */
const ALIASES: Record<string, (typeof LIFECYCLE_ENVIRONMENTS)[number]> = {
  dev: 'development',
  prod: 'production',
}

export function resolveEnvironment(): EnvironmentSelection {
  const environment = normalizeEnvironment(import.meta.env.VITE_SDKWORK_ENVIRONMENT)
  const deploymentProfile = import.meta.env.VITE_SDKWORK_DEPLOYMENT_PROFILE === 'cloud'
    ? 'cloud'
    : 'standalone'
  const runtimeTarget = normalizeRuntimeTarget(import.meta.env.VITE_SDKWORK_RUNTIME_TARGET)
  const profileId = String(
    import.meta.env.VITE_SDKWORK_PROFILE_ID ?? `${deploymentProfile}.${environment}`,
  ).trim()
  return { environment, deploymentProfile, profileId, runtimeTarget }
}

function normalizeEnvironment(value: string | undefined): EnvironmentSelection['environment'] {
  const candidate = String(value ?? '').trim()
  if ((LIFECYCLE_ENVIRONMENTS as readonly string[]).includes(candidate)) {
    return candidate as EnvironmentSelection['environment']
  }
  return ALIASES[candidate] ?? 'development'
}

function normalizeRuntimeTarget(value: string | undefined): TabletRuntimeTarget {
  const candidate = String(value ?? '').trim()
  return TABLET_RUNTIME_TARGETS.includes(candidate as TabletRuntimeTarget)
    ? (candidate as TabletRuntimeTarget)
    : 'tablet-ipados'
}
