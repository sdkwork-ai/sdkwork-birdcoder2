/**
 * Public contract of `@sdkwork/birdcoder2-pad-admin-shell`.
 *
 * Surface: `backend-admin` for the tablet root.
 * Layer role: `frontend-shell`.
 */
import type { TabletNavigationMode, TabletWindowClass } from '@sdkwork/birdcoder2-pad-core'

export interface AdminMenuSection {
  readonly id: string
  readonly titleKey: string
  readonly permissionHint: string
}

export function resolveAdminNavigation(windowClass: TabletWindowClass): TabletNavigationMode {
  return windowClass === 'compact' ? 'drawer' : 'rail'
}

export const packageId = '@sdkwork/birdcoder2-pad-admin-shell' as const
