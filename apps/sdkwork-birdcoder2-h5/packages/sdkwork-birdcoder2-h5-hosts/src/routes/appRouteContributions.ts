/**
 * Routes owned by the host fleet capability.
 *
 * Identities are built with `routeIdOf` rather than written as dotted strings:
 * the four segments (`surface.domain.capability.screen`) are the contract the
 * core registry validates, and the surface segment must not drift per package.
 */
import { routeIdOf } from '@sdkwork/birdcoder2-h5-core'

/** Package name the core registry attributes these routes to. */
export const BIRDCODER2_H5_HOSTS_PACKAGE = '@sdkwork/birdcoder2-h5-hosts'

export const BIRDCODER2_H5_HOSTS_ROUTE_CONTRIBUTIONS = [
  {
    id: routeIdOf('host', 'fleet', 'index'),
    path: '/hosts',
    component: 'HostsPage',
    auth: 'required',
    presentation: 'tab',
    titleKey: 'route.hosts',
    tabLabelKey: 'route.hosts',
    iconKey: 'host-fleet',
  },
  {
    id: routeIdOf('host', 'fleet', 'enroll'),
    path: '/hosts/enroll',
    component: 'HostEnrollPage',
    auth: 'required',
    presentation: 'screen',
    titleKey: 'route.hostEnroll',
  },
] as const
