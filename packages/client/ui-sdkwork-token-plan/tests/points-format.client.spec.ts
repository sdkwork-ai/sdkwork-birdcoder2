import { describe, expect, it } from 'vitest'
import {
  formatPointBalance,
  formatPointsChange,
  formatPointsTime,
  planLabelOf,
  pointsPercent,
} from '../src/client/points-format.ts'
import { zh } from '../src/client/locales.ts'

const t = (key: keyof typeof zh): string => zh[key]

describe('points formatting', () => {
  it('formats balances and signed changes', () => {
    expect(formatPointBalance(610.57)).toContain('610.57')
    expect(formatPointsChange(100)).toBe('+100')
    expect(formatPointsChange(-4.34)).toBe('-4.34')
    expect(formatPointsChange(0)).toBe('0')
  })

  it('formats timestamps and keeps an unparseable wire value', () => {
    expect(formatPointsTime(undefined)).toBe('—')
    expect(formatPointsTime('not-a-date')).toBe('not-a-date')
    expect(formatPointsTime('2026-11-11T09:07:00Z')).not.toBe('2026-11-11T09:07:00Z')
  })

  it('resolves plan labels with member and free fallbacks', () => {
    expect(planLabelOf({ planName: '体验版', points: 1, active: true }, t)).toBe('体验版')
    expect(planLabelOf({ planName: undefined, points: 1, active: true }, t)).toBe('会员')
    expect(planLabelOf({ planName: undefined, points: 1, active: false }, t)).toBe('免费版')
  })

  it('clamps progress percentages', () => {
    expect(pointsPercent(5, 10)).toBe(50)
    expect(pointsPercent(20, 10)).toBe(100)
    expect(pointsPercent(-1, 10)).toBe(0)
    expect(pointsPercent(undefined, 10)).toBe(0)
    expect(pointsPercent(5, 0)).toBe(0)
  })
})
