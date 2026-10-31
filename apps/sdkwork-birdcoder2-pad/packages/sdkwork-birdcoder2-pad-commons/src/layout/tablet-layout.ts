import type { TabletWindowClass } from '@sdkwork/birdcoder2-pad-core'

export interface TabletLayoutPlan {
  readonly windowClass: TabletWindowClass
  readonly paneCount: 1 | 2 | 3
  readonly showInspector: boolean
  readonly contentMeasure: 'narrow' | 'regular' | 'wide'
}

/**
 * Composition plan for a window class. It describes intent, not physical
 * breakpoints: the shell decides how a split or inspector route composes.
 */
export function planTabletLayout(windowClass: TabletWindowClass): TabletLayoutPlan {
  switch (windowClass) {
    case 'compact':
      return { windowClass, paneCount: 1, showInspector: false, contentMeasure: 'narrow' }
    case 'medium':
      return { windowClass, paneCount: 1, showInspector: false, contentMeasure: 'regular' }
    case 'expanded':
      return { windowClass, paneCount: 2, showInspector: false, contentMeasure: 'regular' }
    case 'large':
      return { windowClass, paneCount: 3, showInspector: true, contentMeasure: 'wide' }
  }
}

const PANE_RATIO_MIN = 0.2
const PANE_RATIO_MAX = 0.8

/** Resizable panes declare minimums; a stored ratio outside them is clamped. */
export function clampPaneRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5
  return Math.min(PANE_RATIO_MAX, Math.max(PANE_RATIO_MIN, ratio))
}

/** Platform minimum touch target: 44 pt on iPadOS, 48 dp on Android tablets. */
export function touchTargetSize(platform: 'ipados' | 'android-tablet'): number {
  return platform === 'ipados' ? 44 : 48
}
