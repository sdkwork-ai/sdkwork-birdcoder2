/**
 * The routed application.
 *
 * Every route the registry declares is mounted, including `screen` routes that
 * never appear in the tab bar (`/hosts/enroll`). The registry is passed in
 * rather than rebuilt here so the same frozen instance backs the tab bar, the
 * title, and the matching, which is what keeps identity and path in step.
 */
import { Route, Routes } from 'react-router-dom'

import type { BirdCoder2H5RouteRegistry } from '@sdkwork/birdcoder2-h5-core'

import { MobileShellLayout, type BirdCoder2H5ShellLabels } from '../layout/MobileShellLayout.tsx'
import { resolveBirdCoder2H5RouteComponent } from './routeComponents.tsx'

export interface BirdCoder2H5AppRoutesProps {
  readonly registry: BirdCoder2H5RouteRegistry
  readonly labels: BirdCoder2H5ShellLabels
}

export function BirdCoder2H5AppRoutes({ registry, labels }: BirdCoder2H5AppRoutesProps) {
  return (
    <Routes>
      <Route element={<MobileShellLayout registry={registry} labels={labels} />}>
        {registry.routes.map(route => (
          <Route
            key={route.id}
            path={route.path}
            element={resolveBirdCoder2H5RouteComponent(route.component)}
          />
        ))}
      </Route>
    </Routes>
  )
}
