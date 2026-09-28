/**
 * Public contract of `@sdkwork/birdcoder2-h5-hosts`.
 *
 * Surface: `app`. Layer role: `frontend-feature`. Capability: `host-fleet`.
 * The package owns the fleet screens, the fleet state provider, and the route
 * contributions the shell registers; it consumes {@link BirdCoder2Ports} from
 * core and never constructs a transport of its own.
 */

export const BIRDCODER2_H5_HOSTS_VERSION = '0.1.0' as const

export {
  BIRDCODER2_H5_HOSTS_PACKAGE,
  BIRDCODER2_H5_HOSTS_ROUTE_CONTRIBUTIONS,
} from './routes/appRouteContributions.ts'
export {
  HostsProvider,
  toHostsFailure,
  useHosts,
  type HostsContextValue,
  type HostsFailure,
  type HostsFailureCode,
  type HostsProviderProps,
} from './state/hostsState.tsx'
export { HostsPage } from './screens/HostsPage.tsx'
export { HostEnrollPage } from './screens/HostEnrollPage.tsx'
export {
  resolveHostsLanguage,
  resolveHostsMessages,
  type HostsLanguage,
  type HostsMessages,
} from './messages/hostsMessages.ts'
