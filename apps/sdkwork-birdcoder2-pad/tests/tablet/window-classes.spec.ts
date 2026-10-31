import { describe, expect, it } from 'vitest'

import {
  TABLET_WINDOW_CLASS_DEFINITIONS,
  TABLET_WINDOW_CLASSES,
  describeWindowClass,
  resolveWindowClass,
} from '../../packages/sdkwork-birdcoder2-pad-core/src/window-class'
import { planTabletLayout } from '../../packages/sdkwork-birdcoder2-pad-commons/src/layout/tablet-layout'
import {
  resolveTabletNavigation,
  resolveTabletPaneCount,
} from '../../packages/sdkwork-birdcoder2-pad-shell/src/navigation/tablet-navigation'

describe('tablet layout across window classes', () => {
  it('never uses a phone-shaped bottom tab bar as primary navigation', () => {
    for (const windowClass of TABLET_WINDOW_CLASSES) {
      const navigation = resolveTabletNavigation(windowClass)
      expect(['drawer', 'rail', 'sidebar']).toContain(navigation)
      if (windowClass !== 'compact') expect(navigation).not.toBe('drawer')
    }
  })

  it('uses master-detail from expanded and a third pane at large', () => {
    expect(resolveTabletPaneCount('compact')).toBe(1)
    expect(resolveTabletPaneCount('medium')).toBe(1)
    expect(resolveTabletPaneCount('expanded')).toBe(2)
    expect(resolveTabletPaneCount('large')).toBe(3)
    expect(planTabletLayout('large').showInspector).toBe(true)
    expect(planTabletLayout('expanded').showInspector).toBe(false)
  })

  it('keeps every class reachable and ordered', () => {
    expect(TABLET_WINDOW_CLASS_DEFINITIONS.map(entry => entry.id)).toEqual([...TABLET_WINDOW_CLASSES])
    for (let index = 1; index < TABLET_WINDOW_CLASSES.length; index += 1) {
      const current = TABLET_WINDOW_CLASSES[index]
      const previous = TABLET_WINDOW_CLASSES[index - 1]
      expect(current).toBeDefined()
      expect(previous).toBeDefined()
      if (current && previous) {
        expect(describeWindowClass(current).minWidth).toBeGreaterThan(
          describeWindowClass(previous).minWidth,
        )
      }
    }
  })

  it('reflows on resize without a device-model branch', () => {
    expect(resolveWindowClass(375)).toBe('compact')
    expect(resolveWindowClass(768)).toBe('medium')
    expect(resolveWindowClass(1024)).toBe('expanded')
    expect(resolveWindowClass(1366)).toBe('large')
  })
})
