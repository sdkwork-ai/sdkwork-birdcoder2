import type { AppRuntime } from './runtime'

export interface AppRoutesContribution {
  readonly id: string
  readonly path: string
}

/** H5 route assembly: capability packages contribute metadata; this module only orders it. */
export function AppRoutes(_props: { readonly runtime: AppRuntime }) {
  return null
}
