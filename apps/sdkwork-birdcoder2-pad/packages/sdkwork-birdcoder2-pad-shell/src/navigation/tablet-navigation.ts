import type { TabletNavigationMode, TabletWindowClass } from '@sdkwork/birdcoder2-pad-core'

/**
 * Tablet navigation is a rail or sidebar from `medium` up. A bottom tab bar
 * stretched across a tablet is never the primary navigation
 * (APP_PAD_ARCHITECTURE_SPEC.md section 5.2).
 */
export function resolveTabletNavigation(windowClass: TabletWindowClass): TabletNavigationMode {
  switch (windowClass) {
    case 'compact':
      return 'drawer'
    case 'medium':
      return 'rail'
    case 'expanded':
    case 'large':
      return 'sidebar'
  }
}

/**
 * Pane count for list-detail workflows. Selecting an item must not replace the
 * collection with a full-screen detail page when a split layout is available.
 */
export function resolveTabletPaneCount(windowClass: TabletWindowClass): 1 | 2 | 3 {
  switch (windowClass) {
    case 'compact':
    case 'medium':
      return 1
    case 'expanded':
      return 2
    case 'large':
      return 3
  }
}
