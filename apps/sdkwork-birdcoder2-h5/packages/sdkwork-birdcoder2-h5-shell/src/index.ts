/**
 * Public contract of `@sdkwork/birdcoder2-h5-shell`.
 *
 * Surface: `app`. Layer role: `frontend-shell`. The shell assembles the route
 * registry from the installed capabilities, renders the mobile chrome, and
 * binds component keys to lazily imported screens. It owns no capability state
 * and no transport.
 */

export const packageId = '@sdkwork/birdcoder2-h5-shell' as const

export const BIRDCODER2_H5_SHELL_VERSION = '0.1.0' as const

export {
  birdCoder2H5RouteRegistry,
  createBirdCoder2H5RouteRegistry,
} from './routes/routeCatalog.ts'
export {
  listBirdCoder2H5RouteComponentKeys,
  resolveBirdCoder2H5RouteComponent,
} from './routing/routeComponents.tsx'
export {
  listBirdCoder2H5RouteIconKeys,
  resolveBirdCoder2H5RouteIcon,
} from './routing/routeIcons.ts'
export {
  MobileShellLayout,
  resolveBirdCoder2H5RouteTitle,
  type BirdCoder2H5ShellLabels,
  type MobileShellLayoutProps,
} from './layout/MobileShellLayout.tsx'
export {
  BirdCoder2H5AppRoutes,
  type BirdCoder2H5AppRoutesProps,
} from './routing/BirdCoder2H5AppRoutes.tsx'
