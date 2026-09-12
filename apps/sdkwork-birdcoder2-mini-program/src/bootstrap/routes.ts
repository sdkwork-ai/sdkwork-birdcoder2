import type { AppRuntime } from './runtime'

export interface AppRoutesContribution {
  readonly id: string
  readonly path: string
}

/**
 * Route projection input. SDKWork packages contribute route metadata; the projection step
 * deterministically assembles `src/app.json` pages/subpackages from it. Route ids follow the
 * shared route id format so they align with the other client architectures where workflows match.
 */
export function registerRoutes(_runtime: AppRuntime): readonly AppRoutesContribution[] {
  return []
}
