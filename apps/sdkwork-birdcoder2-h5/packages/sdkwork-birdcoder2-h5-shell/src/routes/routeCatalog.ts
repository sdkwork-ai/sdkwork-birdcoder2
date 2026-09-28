/**
 * Route catalog assembly.
 *
 * The registry itself lives in core — this module only supplies the
 * contributions and the owning package names, because the shell is where the
 * set of installed capabilities is known. Identities come from the capability
 * packages; the shell never writes one by hand.
 */
import { createRouteRegistry, type BirdCoder2H5RouteRegistry } from '@sdkwork/birdcoder2-h5-core'
import {
  BIRDCODER2_H5_AGENT_CHAT_PACKAGE,
  BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS,
} from '@sdkwork/birdcoder2-h5-agent-chat/routes'
import {
  BIRDCODER2_H5_HOSTS_PACKAGE,
  BIRDCODER2_H5_HOSTS_ROUTE_CONTRIBUTIONS,
} from '@sdkwork/birdcoder2-h5-hosts/routes'

/**
 * Validates every installed capability's contributions and freezes a registry.
 *
 * # Errors
 *
 * Throws {@link BirdCoder2RouteRegistryError} from core when two capabilities
 * claim one identity or one path, or when a tab lacks a navigation label. That
 * throws at module load, which is the intent: a routing mistake must fail
 * loudly at start-up rather than silently shadow a screen.
 */
export function createBirdCoder2H5RouteRegistry(): BirdCoder2H5RouteRegistry {
  return createRouteRegistry([
    [BIRDCODER2_H5_AGENT_CHAT_PACKAGE, BIRDCODER2_H5_AGENT_CHAT_ROUTE_CONTRIBUTIONS],
    [BIRDCODER2_H5_HOSTS_PACKAGE, BIRDCODER2_H5_HOSTS_ROUTE_CONTRIBUTIONS],
  ])
}

let frozenRegistry: BirdCoder2H5RouteRegistry | undefined

/** The process-wide registry; contributions are static, so it is built once. */
export function birdCoder2H5RouteRegistry(): BirdCoder2H5RouteRegistry {
  frozenRegistry ??= createBirdCoder2H5RouteRegistry()
  return frozenRegistry
}
