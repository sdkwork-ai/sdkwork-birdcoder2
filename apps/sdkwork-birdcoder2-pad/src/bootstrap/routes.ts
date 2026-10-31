import type { SdkworkTabletRouteContribution } from '@sdkwork/birdcoder2-pad-shell'

import type { AppRuntime } from './runtime'

export type AppRoutesContribution = SdkworkTabletRouteContribution

/**
 * Route assembly. Capability packages contribute route metadata; this module
 * only assembles and orders the contributions, matching the shared route id
 * form in APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md.
 */
export function AppRoutes(_props: { readonly runtime: AppRuntime }) {
  return null
}
