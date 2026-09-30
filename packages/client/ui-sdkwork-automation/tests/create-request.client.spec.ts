/**
 * Add-task request spec: the `datetime-local` split, the ISO weekday, the
 * confirm gate, the `schedule_create` selector each frequency selects, the
 * frequency dictionary keys, the stored instruction, and the request text the
 * dialog sends into the fresh conversation.
 */
import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { AutomationDraft, CreateFrequency } from '../src/client/create-request.ts'
import {
  CREATE_FREQUENCIES, CREATE_INTERVAL_UNITS, createTaskPrompt, draftReady, frequencyKey, intervalSeconds,
  intervalUnitKey, isoWeekday, MAX_TASK_NAME_LENGTH, scheduleArguments, splitRunAt, taskInstruction,
} from '../src/client/create-request.ts'
import type { AutomationKey } from '../src/client/locales.ts'
import { en } from '../src/client/locales.ts'

/** IANA zone every selector case reads its wall-clock time in. */
const ZONE = 'Asia/Shanghai'

/** Locale seat stand-in: keys render verbatim, so a case reads the dictionary contract. */
const t = ((key: string) => key) as Translate<AutomationKey>

/** Locale seat stand-in that interpolates the English dictionary, as the locale service does. */
const copy = makeTranslate(en)

/** Frequencies that need a run time; the interval kinds count from creation instead. */
const TIMED: readonly CreateFrequency[] = ['once', 'daily', 'weekly', 'monthly']

/** One dialog draft, with every field a case does not override left at its default. */
function draft(overrides: Partial<AutomationDraft> = {}): AutomationDraft {
  return {
    title: 'Daily digest',
    prompt: 'Summarize the day',
    frequency: 'daily',
    runAt: '2026-10-05T07:08',
    intervalValue: 1,
    intervalUnit: 'hour',
    validity: 'forever',
    untilDate: '',
    style: 'balanced',
    pushWorkBuddy: false,
    pushWecomBot: false,
    workspaceId: undefined,
    ...overrides,
  }
}

/** The phrasing line every instruction carries, in the draft's own style. */
const styleLine = (style: AutomationDraft['style']): string =>
  style === 'precise' ? en['create.instruction.stylePrecise'] : en['create.instruction.styleBalanced']

describe('splitRunAt', () => {
  it('defaults the seconds of a minute-precision value to 00', () => {
    expect(splitRunAt('2026-10-05T07:08')).toEqual({ date: '2026-10-05', time: '07:08:00' })
  })

  it('keeps the seconds a second-precision value states', () => {
    expect(splitRunAt('2026-10-05T07:08:09')).toEqual({ date: '2026-10-05', time: '07:08:09' })
  })

  it.each([
    ['', 'an empty value'],
    ['2026-10-05', 'a date without a time'],
    ['07:08', 'a time without a date'],
    ['2026-10-05T07:08:09.000', 'fractional seconds'],
    ['2026-10-05T07:08:09Z', 'a trailing zone designator'],
  ])('refuses %s (%s)', (value) => {
    expect(splitRunAt(value)).toBeUndefined()
  })
})

describe('isoWeekday', () => {
  it.each([
    ['2026-09-28', 1],
    ['2026-09-29', 2],
    ['2026-09-30', 3],
    ['2026-10-01', 4],
    ['2026-10-02', 5],
    ['2026-10-03', 6],
    ['2026-10-04', 7],
  ] satisfies readonly [string, number][])('maps %s to ISO weekday %i', (date, weekday) => {
    expect(isoWeekday(date)).toBe(weekday)
  })

  it('numbers the week Monday 1 through Sunday 7', () => {
    expect(isoWeekday('2026-10-05')).toBe(1)
    expect(isoWeekday('2026-10-04')).toBe(7)
  })
})

describe('draftReady', () => {
  it('refuses an empty title', () => {
    expect(draftReady(draft({ title: '' }))).toBe(false)
  })

  it('refuses a whitespace-only title', () => {
    expect(draftReady(draft({ title: '   ', frequency: 'hourly', runAt: '' }))).toBe(false)
  })

  it.each(TIMED)('refuses %s without a run time', (frequency) => {
    expect(draftReady(draft({ frequency, runAt: '' }))).toBe(false)
  })

  it('refuses a timed frequency whose run time is not a complete instant', () => {
    expect(draftReady(draft({ frequency: 'once', runAt: '2026-10-05' }))).toBe(false)
  })

  it.each(TIMED)('accepts %s with a run time', (frequency) => {
    expect(draftReady(draft({ frequency, runAt: '2026-10-05T07:08' }))).toBe(true)
  })

  it('accepts hourly with no run time, because it counts from creation', () => {
    expect(draftReady(draft({ frequency: 'hourly', runAt: '' }))).toBe(true)
  })

  it('accepts an interval at or above the Host floor and refuses one below it', () => {
    expect(draftReady(draft({ frequency: 'interval', intervalValue: 1, intervalUnit: 'minute', runAt: '' }))).toBe(true)
    expect(draftReady(draft({ frequency: 'interval', intervalValue: 2, intervalUnit: 'hour', runAt: '' }))).toBe(true)
    // The Host refuses anything shorter than a minute, a fractional quantity, and
    // a quantity that is not a whole number.
    expect(draftReady(draft({ frequency: 'interval', intervalValue: 0, intervalUnit: 'minute', runAt: '' }))).toBe(false)
    expect(draftReady(draft({ frequency: 'interval', intervalValue: 0.5, intervalUnit: 'hour', runAt: '' }))).toBe(false)
    expect(draftReady(draft({ frequency: 'interval', intervalValue: Number.NaN, intervalUnit: 'minute', runAt: '' }))).toBe(false)
  })

  it('refuses a title one character past the stored-name limit and accepts the limit itself', () => {
    expect(draftReady(draft({ title: 'n'.repeat(MAX_TASK_NAME_LENGTH), frequency: 'hourly', runAt: '' }))).toBe(true)
    expect(draftReady(draft({ title: 'n'.repeat(MAX_TASK_NAME_LENGTH + 1), frequency: 'hourly', runAt: '' }))).toBe(false)
  })
})

describe('scheduleArguments', () => {
  it('asks for a one-hour interval for hourly, whatever the run time holds', () => {
    expect(scheduleArguments(draft({ frequency: 'hourly', runAt: '' }), ZONE)).toEqual({ every_seconds: 3600 })
    expect(scheduleArguments(draft({ frequency: 'hourly' }), ZONE)).toEqual({ every_seconds: 3600 })
  })

  it('turns the interval quantity and unit into seconds', () => {
    expect(scheduleArguments(draft({ frequency: 'interval', intervalValue: 2, intervalUnit: 'hour' }), ZONE))
      .toEqual({ every_seconds: 7_200 })
    expect(scheduleArguments(draft({ frequency: 'interval', intervalValue: 30, intervalUnit: 'minute' }), ZONE))
      .toEqual({ every_seconds: 1_800 })
    expect(intervalSeconds(draft({ intervalValue: 45, intervalUnit: 'minute' }))).toBe(2_700)
  })

  it('asks for the local date, the wall-clock time, and the reading zone for once', () => {
    expect(scheduleArguments(draft({ frequency: 'once', runAt: '2026-10-05T07:08' }), ZONE)).toEqual({
      at: { date: '2026-10-05', time: '07:08:00', time_zone: ZONE },
    })
  })

  it('asks for the wall-clock time and zone for daily', () => {
    expect(scheduleArguments(draft({ frequency: 'daily', runAt: '2026-10-05T07:08:09' }), ZONE)).toEqual({
      daily: { time: '07:08:09', time_zone: ZONE },
    })
  })

  it('asks for the ISO weekday of the chosen date for weekly, Sunday as 7', () => {
    expect(scheduleArguments(draft({ frequency: 'weekly', runAt: '2026-10-04T09:30' }), ZONE)).toEqual({
      weekly: { weekdays: [7], time: '09:30:00', time_zone: ZONE },
    })
    expect(scheduleArguments(draft({ frequency: 'weekly', runAt: '2026-10-05T09:30' }), ZONE)).toEqual({
      weekly: { weekdays: [1], time: '09:30:00', time_zone: ZONE },
    })
  })

  it('asks for a five-field cron rule of the chosen month day and time for monthly', () => {
    // minute hour day-of-month month day-of-week, unpadded and with both
    // wildcard fields left open.
    expect(scheduleArguments(draft({ frequency: 'monthly', runAt: '2026-12-31T23:59' }), ZONE)).toEqual({
      cron: { expression: '59 23 31 * *', time_zone: ZONE },
    })
    expect(scheduleArguments(draft({ frequency: 'monthly', runAt: '2026-10-05T07:08' }), ZONE)).toEqual({
      cron: { expression: '8 7 5 * *', time_zone: ZONE },
    })
  })

  it('asks for nothing when a timed frequency carries no usable run time', () => {
    expect(scheduleArguments(draft({ frequency: 'daily', runAt: '' }), ZONE)).toBeUndefined()
    expect(scheduleArguments(draft({ frequency: 'weekly', runAt: '2026-10-05' }), ZONE)).toBeUndefined()
  })
})

describe('frequencyKey', () => {
  it('maps every frequency to its own dictionary key, in picker order', () => {
    const keys = CREATE_FREQUENCIES.map(frequency => frequencyKey(frequency))
    expect(keys).toEqual([
      'create.frequencyOnce',
      'create.frequencyHourly',
      'create.frequencyInterval',
      'create.frequencyDaily',
      'create.frequencyWeekly',
      'create.frequencyMonthly',
    ])
    expect(new Set(keys).size).toBe(CREATE_FREQUENCIES.length)
  })

  it('names each interval unit', () => {
    expect(CREATE_INTERVAL_UNITS.map(intervalUnitKey)).toEqual(['timing.unit.minute', 'timing.unit.hour'])
  })
})

describe('taskInstruction', () => {
  it('stores the trimmed prompt and the phrasing line when the draft asks for nothing else', () => {
    expect(taskInstruction(draft({ prompt: '  Summarize the day  ' }), t))
      .toBe(['Summarize the day', 'create.instruction.styleBalanced'].join('\n'))
  })

  it('states the precise phrasing when the draft chose it', () => {
    expect(taskInstruction(draft({ style: 'precise' }), t))
      .toBe(['Summarize the day', 'create.instruction.stylePrecise'].join('\n'))
  })

  it('stores the phrasing line alone for a whitespace-only prompt', () => {
    expect(taskInstruction(draft({ prompt: '   ' }), t)).toBe('create.instruction.styleBalanced')
  })

  it('appends the validity line, stamped with the end date', () => {
    const ending = draft({ validity: 'until', untilDate: '2026-12-31' })
    expect(taskInstruction(ending, t))
      .toBe(['Summarize the day', 'create.instruction.styleBalanced', 'create.instruction.until'].join('\n'))
    expect(taskInstruction(ending, copy)).toBe([
      'Summarize the day',
      styleLine('balanced'),
      en['create.instruction.until'].replace('{date}', '2026-12-31'),
    ].join('\n'))
  })

  it('appends nothing for until validity without an end date', () => {
    expect(taskInstruction(draft({ validity: 'until', untilDate: '' }), t))
      .toBe(['Summarize the day', 'create.instruction.styleBalanced'].join('\n'))
  })

  it('appends the WorkBuddy push line', () => {
    expect(taskInstruction(draft({ pushWorkBuddy: true }), t))
      .toBe(['Summarize the day', 'create.instruction.styleBalanced', 'create.instruction.pushWorkBuddy'].join('\n'))
  })

  it('appends the WeCom bot push line', () => {
    expect(taskInstruction(draft({ pushWecomBot: true }), t))
      .toBe(['Summarize the day', 'create.instruction.styleBalanced', 'create.instruction.pushWecomBot'].join('\n'))
  })

  it('appends every chosen line in dictionary order', () => {
    const instruction = taskInstruction(draft({
      validity: 'until', untilDate: '2026-12-31', pushWorkBuddy: true, pushWecomBot: true,
    }), t)
    expect(instruction.split('\n')).toEqual([
      'Summarize the day',
      'create.instruction.styleBalanced',
      'create.instruction.until',
      'create.instruction.pushWorkBuddy',
      'create.instruction.pushWecomBot',
    ])
  })
})

describe('createTaskPrompt', () => {
  it('returns nothing when the draft cannot name a run time', () => {
    expect(createTaskPrompt(draft({ frequency: 'daily', runAt: '' }), ZONE, t)).toBeUndefined()
    expect(createTaskPrompt(draft({ frequency: 'monthly', runAt: '2026-10-05' }), ZONE, t)).toBeUndefined()
  })

  it('joins one request line per dictionary key, in the documented order', () => {
    const request = createTaskPrompt(draft(), ZONE, t)
    expect(request?.split('\n')).toEqual([
      'create.request.intro',
      'create.request.name',
      'create.request.instruction',
      'create.request.arguments',
      'create.request.verify',
    ])
  })

  it('names the trimmed title, the instruction, and the selector arguments', () => {
    const selector = { daily: { time: '07:08:00', time_zone: ZONE } }
    const request = createTaskPrompt(draft({ title: '  Daily digest  ', prompt: '  Summarize the day  ' }), ZONE, copy)
    expect(request).toBeDefined()
    expect(request).not.toContain('  Daily digest')
    expect(request).not.toContain('  Summarize the day')
    expect(request).toContain('Daily digest')
    expect(request).toContain('Summarize the day')
    expect(request).toContain(JSON.stringify(selector))
    expect(request?.split('\n')).toEqual([
      en['create.request.intro'],
      en['create.request.name'].replace('{name}', 'Daily digest'),
      // The instruction carries its own lines, so the phrasing line splits out
      // of the request line that names it.
      en['create.request.instruction'].replace('{instruction}', 'Summarize the day'),
      styleLine('balanced'),
      en['create.request.arguments'].replace('{arguments}', JSON.stringify(selector)),
      en['create.request.verify'],
    ])
  })

  it('carries the stored instruction lines and the hourly selector into the request', () => {
    const request = createTaskPrompt(draft({
      frequency: 'hourly', runAt: '', prompt: 'Ping the channel',
      validity: 'until', untilDate: '2026-12-31', pushWorkBuddy: true, pushWecomBot: true,
    }), ZONE, copy)
    expect(request).toContain('{"every_seconds":3600}')
    expect(request).toContain(en['create.instruction.until'].replace('{date}', '2026-12-31'))
    expect(request).toContain(en['create.instruction.pushWorkBuddy'])
    expect(request).toContain(en['create.instruction.pushWecomBot'])
  })
})
