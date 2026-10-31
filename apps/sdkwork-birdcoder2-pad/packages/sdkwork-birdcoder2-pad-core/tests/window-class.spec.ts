import { describe, expect, it } from 'vitest'

import {
  TABLET_WINDOW_CLASSES,
  describeWindowClass,
  isTabletWindowClass,
  resolveWindowClass,
} from '../src/window-class'

describe('tablet window classes', () => {
  it('declares all four classes in ascending order', () => {
    expect(TABLET_WINDOW_CLASSES).toEqual(['compact', 'medium', 'expanded', 'large'])
    const widths = TABLET_WINDOW_CLASSES.map(windowClass => describeWindowClass(windowClass).minWidth)
    expect(widths).toEqual([320, 600, 840, 1200])
  })

  it.each([
    [0, 'compact'],
    [319, 'compact'],
    [320, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [839, 'medium'],
    [840, 'expanded'],
    [1199, 'expanded'],
    [1200, 'large'],
    [2048, 'large'],
  ])('resolves %i to %s', (width, expected) => {
    expect(resolveWindowClass(width)).toBe(expected)
  })

  it('keeps compact reachable for narrow split view', () => {
    expect(resolveWindowClass(320)).toBe('compact')
    expect(resolveWindowClass(Number.NaN)).toBe('compact')
  })

  it('narrows unknown values', () => {
    expect(isTabletWindowClass('large')).toBe(true)
    expect(isTabletWindowClass('phone')).toBe(false)
  })
})
