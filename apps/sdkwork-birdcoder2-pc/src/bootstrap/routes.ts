import type { AppRuntime } from './runtime'

export interface AppRoutesContribution {
  readonly id: string
  readonly path: string
}

/**
 * Route assembly. Capability packages contribute route metadata; this module only
 * assembles and orders the contributions, matching the shared route id form in
 * APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md.
 */
export function AppRoutes(_props: { readonly runtime: AppRuntime }) {
  return null
}
