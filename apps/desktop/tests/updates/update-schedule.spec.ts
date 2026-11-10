import { describe, expect, it } from 'vitest'

import { DesktopUpdateSchedule } from '../../src/update-schedule.ts'

interface FakeUpdates {
  checks: number
  check(): Promise<{ phase: 'idle' }>
  readonly state: { phase: 'idle' }
}

function fakeUpdates(): FakeUpdates {
  return {
    checks: 0,
    state: { phase: 'idle' },
    async check() {
      this.checks += 1
      return { phase: 'idle' as const }
    },
  }
}

const config = { intervalMs: 10 * 60_000, maxBackoffMs: 60 * 60_000, jitter: 0 }

describe('update schedule interval provider', () => {
  it('uses the published interval when one is available', async () => {
    const updates = fakeUpdates()
    let now = 1_000
    const schedule = new DesktopUpdateSchedule(
      updates,
      config,
      () => 0.5,
      () => now,
      () => 60_000,
    )
    await schedule.check(true)
    expect(updates.checks).toBe(1)
    // Just past the published one-minute interval but far below the configured
    // ten minutes, so a due check proves the provider was honoured.
    now += 61_000
    await schedule.check(false)
    expect(updates.checks).toBe(2)
    schedule.dispose()
  })

  it('falls back to the configured interval when the feed publishes none', async () => {
    const updates = fakeUpdates()
    let now = 1_000
    const schedule = new DesktopUpdateSchedule(
      updates,
      config,
      () => 0.5,
      () => now,
      () => undefined,
    )
    await schedule.check(true)
    expect(updates.checks).toBe(1)
    now += 61_000
    await schedule.check(false)
    expect(updates.checks).toBe(1)
    now += 10 * 60_000
    await schedule.check(false)
    expect(updates.checks).toBe(2)
    schedule.dispose()
  })

  it('clamps an out-of-range published interval', async () => {
    const updates = fakeUpdates()
    let now = 1_000
    const schedule = new DesktopUpdateSchedule(
      updates,
      config,
      () => 0.5,
      () => now,
      () => 1,
    )
    await schedule.check(true)
    // A one-millisecond provider value is clamped to the one-second floor.
    now += 900
    await schedule.check(false)
    expect(updates.checks).toBe(1)
    now += 200
    await schedule.check(false)
    expect(updates.checks).toBe(2)
    schedule.dispose()
  })
})
