/**
 * Template seed spec: what clicking a catalog card stages in the add-task
 * dialog. A daily seed takes today's occurrence while it is still ahead and
 * tomorrow's otherwise; a weekly seed takes the next occurrence of its weekday,
 * a week on when today's has passed; a template that names no time leaves the
 * run time to the user.
 */
import { describe, expect, it } from 'vitest'
import { TEMPLATE_IDS, templateSeed } from '../src/client/template-seeds.ts'

/** One local instant, built from calendar fields so the case reads the browser's zone. */
const at = (year: number, month: number, day: number, hour: number, minute = 0): Date =>
  new Date(year, month - 1, day, hour, minute, 0, 0)

describe('templateSeed', () => {
  it('stages every catalog card, in card order', () => {
    expect(TEMPLATE_IDS).toEqual([
      'news', 'vocab', 'bedtime', 'weekly-report', 'movies', 'history-today',
      'why', 'parents-call', 'checkup', 'interview', 'meeting', 'wallpaper',
    ])
  })

  it('carries the localized copy it was handed', () => {
    const seed = templateSeed('news', 'Daily AI news', 'Track the day’s AI news', at(2026, 10, 5, 8))
    expect(seed).toMatchObject({ title: 'Daily AI news', prompt: 'Track the day’s AI news', frequency: 'daily' })
  })

  it('takes today’s occurrence of a daily seed while its time is still ahead', () => {
    const seed = templateSeed('news', 'title', 'prompt', at(2026, 10, 5, 8))
    expect(seed.runAt).toBe('2026-10-05T09:00')
  })

  it('moves a daily seed to tomorrow once its time has passed', () => {
    expect(templateSeed('news', 'title', 'prompt', at(2026, 10, 5, 9)).runAt).toBe('2026-10-06T09:00')
    // The boundary is strict: the seed's own minute is already gone.
    expect(templateSeed('news', 'title', 'prompt', at(2026, 10, 5, 9, 0)).runAt).toBe('2026-10-06T09:00')
  })

  it('takes today’s occurrence of a weekly seed on its own weekday', () => {
    // 2026-10-09 is a Friday, the weekly report's weekday.
    expect(templateSeed('weekly-report', 'title', 'prompt', at(2026, 10, 9, 10)).runAt).toBe('2026-10-09T17:00')
  })

  it('moves a weekly seed a week on when today’s occurrence has passed', () => {
    expect(templateSeed('weekly-report', 'title', 'prompt', at(2026, 10, 9, 18)).runAt).toBe('2026-10-16T17:00')
  })

  it('takes the next occurrence when today is a different weekday', () => {
    // Monday the 5th: the Sunday call lands on the 11th, and the Friday report on the 9th.
    expect(templateSeed('parents-call', 'title', 'prompt', at(2026, 10, 5, 9)).runAt).toBe('2026-10-11T10:00')
    expect(templateSeed('weekly-report', 'title', 'prompt', at(2026, 10, 5, 9)).runAt).toBe('2026-10-09T17:00')
  })

  it('reads Sunday as the seventh weekday rather than the first', () => {
    // 2026-10-11 is a Sunday, so today is the seed's own weekday.
    expect(templateSeed('parents-call', 'title', 'prompt', at(2026, 10, 11, 9)).runAt).toBe('2026-10-11T10:00')
    expect(templateSeed('parents-call', 'title', 'prompt', at(2026, 10, 11, 11)).runAt).toBe('2026-10-18T10:00')
  })

  it('stages an interval template with its quantity and unit and no run time', () => {
    const seed = templateSeed('interview', 'title', 'prompt', at(2026, 10, 5, 9))
    expect(seed).toMatchObject({ frequency: 'interval', intervalValue: 2, intervalUnit: 'hour' })
    expect(seed.runAt).toBeUndefined()
  })

  it('leaves the run time to the user for a template that names none', () => {
    for (const id of ['checkup', 'meeting']) {
      const seed = templateSeed(id, 'title', 'prompt', at(2026, 10, 5, 9))
      expect(seed).toMatchObject({ frequency: 'once' })
      expect(seed.runAt).toBeUndefined()
    }
  })

  it('stages an unknown marker as a one-shot that names no run time', () => {
    const seed = templateSeed('not-a-template', 'title', 'prompt', at(2026, 10, 5, 9))
    expect(seed).toMatchObject({ title: 'title', prompt: 'prompt', frequency: 'once' })
    expect(seed.runAt).toBeUndefined()
  })
})
