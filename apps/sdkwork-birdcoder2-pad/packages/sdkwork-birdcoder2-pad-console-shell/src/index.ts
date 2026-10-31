/**
 * Public contract of `@sdkwork/birdcoder2-pad-console-shell`.
 *
 * Surface: user console for the tablet root.
 * Layer role: `frontend-shell`.
 */
import type { TabletNavigationMode, TabletWindowClass } from '@sdkwork/birdcoder2-pad-core'

export interface ConsoleNavigationSection {
  readonly id: string
  readonly titleKey: string
  readonly permissionHint?: string
}

export function resolveConsoleNavigation(windowClass: TabletWindowClass): TabletNavigationMode {
  return windowClass === 'compact' ? 'drawer' : 'sidebar'
}

export const packageId = '@sdkwork/birdcoder2-pad-console-shell' as const
