import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ScheduleId, ScheduleRecord } from '@deepseek-ai/dsh-schedule/client'
import {
  FALLBACK_ZONES, formatScheduleAbsolute, formatScheduleFrequency, formatScheduleNextRun,
  formatScheduleRelative, formatWeekdays, orderScheduleRecords, recordTimeZone, taskName,
  zoneChoices, zoneLabel, zoneName,
} from '../src/client/schedule-format.ts'
import { cronPreview, parseCronExpression } from '../src/client/task-cron.ts'
import { en, zh } from '../src/client/locales.ts'

/** Host zone pinned for every case, so menu order reads the same on any runner. */
const SYSTEM = 'Asia/Shanghai'
const OFFSET_DATE = Date.parse('2026-01-15T00:00:00.000Z')

/**
 * ICU's long generic name for one zone in one locale.
 *
 * The wording moves with the runtime's ICU data version (`West Africa Time` on
 * macOS, `West Africa Standard Time` on Linux), so the cases derive it from the
 * engine the implementation reads instead of pinning one platform's spelling.
 * @param zone - IANA zone to name.
 * @param locale - locale owning the name.
 * @param at - instant the name is resolved at.
 * @returns the ICU name, or an empty string when ICU states none.
 */
function icuZoneName(zone: string, locale: string, at: number = OFFSET_DATE): string {
  return new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'longGeneric' })
    .formatToParts(at).find(part => part.type === 'timeZoneName')?.value ?? ''
}

/**
 * The offset prefix the label states, read from ICU directly.
 * @param zone - IANA zone to offset.
 * @param at - instant the offset is resolved at.
 * @returns `UTC±HH:MM`.
 */
function utcOffset(zone: string, at: number = OFFSET_DATE): string {
  const raw = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(at).find(part => part.type === 'timeZoneName')?.value ?? ''
  // ICU answers `GMT+01:00` (and bare `GMT` for UTC); the row states `UTC…`.
  return raw === 'GMT' ? 'UTC+00:00' : raw.replace(/^GMT/, 'UTC')
}

/**
 * The composed label one zone states in one locale: offset, then ICU name.
 * @param zone - IANA zone to state.
 * @param locale - locale owning the name.
 * @returns the expected label.
 */
function statedZoneLabel(zone: string, locale: string): string {
  return `${utcOffset(zone)} · ${icuZoneName(zone, locale)}`
}

/** One record per rule kind, so the zone lookup is read for every discriminator. */
const ZONE_RECORDS = [
  { id: 'task-after' as ScheduleId, kind: 'after', title: 'After', prompt: 'After', afterSeconds: 90, scheduledAt: '2026-10-01T15:00:00.000Z' },
  { id: 'task-at' as ScheduleId, kind: 'at', title: 'At', prompt: 'At', scheduledAt: '2026-10-01T15:00:00.000Z' },
  { id: 'task-every' as ScheduleId, kind: 'every', title: 'Every', prompt: 'Every', everySeconds: 301, scheduledAt: '2026-10-01T15:00:00.000Z' },
  { id: 'task-daily' as ScheduleId, kind: 'daily', title: 'Daily', prompt: 'Daily', time: '23:00:00.000', timeZone: SYSTEM, scheduledAt: '2026-10-01T15:00:00.000Z' },
  { id: 'task-weekly' as ScheduleId, kind: 'weekly', title: 'Weekly', prompt: 'Weekly', time: '09:30:00.000', timeZone: SYSTEM, weekdays: [1], scheduledAt: '2026-10-01T15:00:00.000Z' },
  { id: 'task-cron' as ScheduleId, kind: 'cron', title: 'Cron', prompt: 'Cron', expression: '0 9 * * 1', timeZone: SYSTEM, scheduledAt: '2026-10-01T15:00:00.000Z' },
] as const satisfies readonly ScheduleRecord[]

afterEach(() => { vi.restoreAllMocks() })

describe('zoneChoices', () => {
  it('offers every zone the runtime enumerates, far past the fallback', () => {
    const choices = zoneChoices(SYSTEM, SYSTEM)
    expect(choices[0]).toBe(SYSTEM)
    for (const zone of Intl.supportedValuesOf('timeZone')) expect(choices).toContain(zone)
    expect(choices).toEqual(expect.arrayContaining(['Africa/Lagos', 'Pacific/Auckland']))
    expect(choices.length).toBeGreaterThan(FALLBACK_ZONES.length)
    expect(new Set(choices).size).toBe(choices.length)
  })

  it('leads with the host zone, then orders the inventory by UTC offset and IANA id', () => {
    const choices = zoneChoices(SYSTEM, SYSTEM, OFFSET_DATE)
    expect(choices[0]).toBe(SYSTEM)
    expect(choices.indexOf('America/Los_Angeles')).toBeLessThan(choices.indexOf('UTC'))
    expect(choices.indexOf('UTC')).toBeLessThan(choices.indexOf('Asia/Tokyo'))
    expect(choices.indexOf('Asia/Singapore')).toBeLessThan(choices.indexOf('Australia/Perth'))
  })

  it('leads with the host zone regardless of the fallback', () => {
    const choices = zoneChoices(SYSTEM, 'Europe/Paris', OFFSET_DATE)
    expect(choices[0]).toBe('Europe/Paris')
    expect(choices.filter(zone => zone === 'Europe/Paris')).toHaveLength(1)
  })

  it('appends a stored zone the runtime inventory omits', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/Paris', 'Europe/Berlin', 'Africa/Lagos'])
    const choices = zoneChoices('US/Pacific', SYSTEM, OFFSET_DATE)
    expect(choices[0]).toBe(SYSTEM)
    expect(choices).toContain('US/Pacific')
    expect(choices.indexOf('US/Pacific')).toBeLessThan(choices.indexOf('UTC'))
  })

  it('orders zones sharing one offset by IANA id rather than inventory order', () => {
    // Berlin and Paris share an offset in January, so their order is the id order
    // even though the runtime enumerated Paris first.
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/Paris', 'Europe/Berlin'])
    const choices = zoneChoices('UTC', 'UTC', OFFSET_DATE)
    expect(choices.indexOf('Europe/Berlin')).toBeLessThan(choices.indexOf('Europe/Paris'))
  })

  it('falls back to system, UTC, and the stored zone when enumeration throws', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => { throw new TypeError('no time zones') })
    const choices = zoneChoices('Europe/Paris', SYSTEM, OFFSET_DATE)
    expect(choices[0]).toBe(SYSTEM)
    expect(choices).toEqual(expect.arrayContaining([...FALLBACK_ZONES, 'Europe/Paris']))
    expect(zoneChoices(SYSTEM, SYSTEM, OFFSET_DATE)).toHaveLength(2)
  })

  it('falls back to system and UTC when the runtime has no enumerator', () => {
    const original = Intl.supportedValuesOf
    Reflect.deleteProperty(Intl, 'supportedValuesOf')
    try {
      const choices = zoneChoices(SYSTEM, SYSTEM, OFFSET_DATE)
      expect(choices[0]).toBe(SYSTEM)
      expect(choices).toHaveLength(2)
      expect(choices).toEqual(expect.arrayContaining([...FALLBACK_ZONES, SYSTEM]))
    } finally {
      Object.defineProperty(Intl, 'supportedValuesOf', { value: original, writable: true, configurable: true })
    }
  })
})

describe('recordTimeZone', () => {
  it('reads a stored rule zone from the wall-clock kinds and none from the instant kinds', () => {
    // The card asks each record for its own rule zone; the instant-only kinds
    // store no zone and are displayed in the browser zone.
    expect(ZONE_RECORDS.filter(record => record.kind === 'daily' || record.kind === 'weekly' || record.kind === 'cron')
      .map(recordTimeZone)).toEqual([SYSTEM, SYSTEM, SYSTEM])
    expect(ZONE_RECORDS.filter(record => record.kind === 'after' || record.kind === 'at' || record.kind === 'every')
      .map(recordTimeZone)).toEqual([undefined, undefined, undefined])
  })
})

/**
 * Stub one formatter's parts by the field the caller asked it to name.
 * @param offset - `timeZoneName` value of a `longOffset` call, or undefined when the runtime reports none.
 * @param name - `timeZoneName` value of a `longGeneric` call, or undefined when the runtime reports none.
 */
function stubZoneParts(offset: string | undefined, name: string | undefined): void {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(function (this: Intl.DateTimeFormat) {
    const value = this.resolvedOptions().timeZoneName === 'longOffset' ? offset : name
    return value === undefined ? [{ type: 'literal', value: ',' }] : [{ type: 'timeZoneName', value }]
  })
}

describe('zone label resilience', () => {
  it('labels an engine that reports UTC as the bare GMT name', () => {
    // Engines differ: this runtime answers `GMT+00:00`, an older ICU answers `GMT`.
    stubZoneParts('GMT', undefined)
    expect(zoneLabel('UTC', makeTranslate(en), OFFSET_DATE)).toBe('UTC+00:00')
  })

  it('keeps the ICU name when the runtime reports no readable UTC offset', () => {
    stubZoneParts(undefined, 'China Standard Time')
    expect(zoneLabel('Asia/Shanghai', makeTranslate(en), OFFSET_DATE)).toBe('China Standard Time')
  })

  it('keeps the IANA id when neither the offset nor the name is readable', () => {
    stubZoneParts(undefined, undefined)
    expect(zoneLabel('Asia/Shanghai', makeTranslate(en), OFFSET_DATE)).toBe('Asia/Shanghai')
  })

  it('keeps the readable half when the runtime cannot name one zone', () => {
    // Only the offset is readable: the raw IANA id stands in for the missing name.
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(function (this: Intl.DateTimeFormat) {
      if (this.resolvedOptions().timeZoneName === 'longGeneric') throw new RangeError('no zone name')
      return [{ type: 'timeZoneName', value: 'GMT+08:00' }]
    })
    expect(zoneLabel('Asia/Shanghai', makeTranslate(en), OFFSET_DATE)).toBe('UTC+08:00 · Asia/Shanghai')
  })

  it('falls back to the IANA id alone when the runtime rejects the zone twice', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(() => {
      throw new RangeError('no such zone')
    })
    expect(zoneLabel('Asia/Shanghai', makeTranslate(en), OFFSET_DATE)).toBe('Asia/Shanghai')
  })

  it('orders a zone whose offset is unreadable after the readable ones', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Asia/Tokyo', 'Australia/Perth'])
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(function (this: Intl.DateTimeFormat) {
      const { timeZone, timeZoneName } = this.resolvedOptions()
      if (timeZoneName !== 'longOffset') return [{ type: 'timeZoneName', value: 'Zone' }]
      // The runtime cannot state Tokyo's offset; every other zone answers.
      return timeZone === 'Asia/Tokyo' ? [] : [{ type: 'timeZoneName', value: 'GMT+08:00' }]
    })
    const choices = zoneChoices('Europe/Paris', SYSTEM, OFFSET_DATE)
    expect(choices.indexOf('UTC')).toBeLessThan(choices.indexOf('Asia/Tokyo'))
    expect(choices.indexOf('Australia/Perth')).toBeLessThan(choices.indexOf('Asia/Tokyo'))
  })
})

describe('zone names', () => {
  it('uses ICU names after UTC offsets and keeps the IANA id internal', () => {
    const t = makeTranslate(en)
    // The expected wording is read from ICU at assert time, so the case holds on
    // any runtime data version.
    expect(zoneLabel('Asia/Shanghai', t, OFFSET_DATE)).toBe(statedZoneLabel('Asia/Shanghai', 'en'))
    expect(zoneLabel('Africa/Lagos', t, OFFSET_DATE)).toBe(statedZoneLabel('Africa/Lagos', 'en'))
    // The name is ICU's, so the label is neither the bare IANA id nor the offset.
    expect(icuZoneName('Africa/Lagos', 'en')).not.toBe('')
    expect(zoneLabel('Africa/Lagos', t, OFFSET_DATE)).not.toBe('Africa/Lagos')
    expect(zoneLabel('Africa/Lagos', t, OFFSET_DATE)).not.toBe(utcOffset('Africa/Lagos'))
    expect(zoneName('Asia/Shanghai', SYSTEM, t, OFFSET_DATE))
      .toBe(`${statedZoneLabel('Asia/Shanghai', 'en')}${en['rule.zone.system']}`)
    expect(zoneName('UTC', SYSTEM, t, OFFSET_DATE)).toBe(utcOffset('UTC'))
  })

  it('gets Chinese zone names from ICU rather than a product-owned lookup table', () => {
    const t = makeTranslate(zh)
    expect(zoneLabel('Asia/Shanghai', t, OFFSET_DATE)).toBe(statedZoneLabel('Asia/Shanghai', 'zh-CN'))
    expect(zoneLabel('America/New_York', t, OFFSET_DATE)).toBe(statedZoneLabel('America/New_York', 'zh-CN'))
    // A product-owned table could not follow the locale's own ICU names.
    expect(zoneLabel('Asia/Shanghai', t, OFFSET_DATE)).not.toBe(statedZoneLabel('Asia/Shanghai', 'en'))
  })
})

describe('formatWeekdays', () => {
  it('names every stored ISO weekday and joins them with the locale separator', () => {
    const t = makeTranslate(en)
    expect(formatWeekdays([1, 3, 7], t)).toBe([
      en['frequency.weekday.1'], en['frequency.weekday.3'], en['frequency.weekday.7'],
    ].join(en['frequency.weekday.join']))
  })

  it('names an index outside the ISO weekday range as Monday rather than an undefined word', () => {
    const t = makeTranslate(en)
    expect(formatWeekdays([0], t)).toBe(en['frequency.weekday.1'])
    expect(formatWeekdays([8], t)).toBe(en['frequency.weekday.1'])
  })
})

describe('formatScheduleAbsolute', () => {
  /** Independent absolute rendering of one instant in the device zone. */
  const expected = (locale: string, namesYear: boolean): string => new Intl.DateTimeFormat(locale, {
    month: 'short', day: 'numeric', ...(namesYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(Date.parse(INSTANT))

  const INSTANT = '2026-10-01T15:00:00.000Z'

  it('names the year in English and reads month and day in Chinese, in the device zone', () => {
    expect(formatScheduleAbsolute(INSTANT, 'en')).toBe(expected('en', true))
    expect(formatScheduleAbsolute(INSTANT, 'zh-CN')).toBe(expected('zh-CN', false))
    // English carries the year; the Chinese form reads the date without it.
    expect(formatScheduleAbsolute(INSTANT, 'en')).toContain('2026')
    expect(formatScheduleAbsolute(INSTANT, 'zh-CN')).not.toContain('2026')
  })

  it('keeps the year for a language its policy does not list', () => {
    // An unlisted language takes the stated default: a target that can sit
    // months or a year away must not silently lose its year. German is not in
    // either list, and its own date form states the year.
    expect(formatScheduleAbsolute(INSTANT, 'de')).toBe(expected('de', true))
    expect(formatScheduleAbsolute(INSTANT, 'de')).toMatch(/\d{4}/)
    expect(formatScheduleAbsolute(INSTANT, 'de')).toContain('2026')
  })

  it('returns the stored text when the instant cannot be parsed', () => {
    expect(formatScheduleAbsolute('not an instant', 'en')).toBe('not an instant')
  })
})

describe('formatScheduleNextRun', () => {
  /** The display zone's current calendar year; an instant inside it stays year-less. */
  const yearIn = (timeZone: string): string =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(Date.now())

  // The month is a locale-owned name plus the locale's own clock: en writes
  // `Oct 1, 3:00 PM` and zh-CN writes `10月1日 23:00`. Neither locale can emit
  // the retired zero-padded `MM-DD` pair.
  it('names the month and the clock field pair in each locale, in the given zone', () => {
    expect(formatScheduleNextRun(`${yearIn('UTC')}-10-01T15:00:00.000Z`, 'en', 'UTC')).toBe('Oct 1, 3:00 PM')
    expect(formatScheduleNextRun(`${yearIn('Asia/Shanghai')}-10-01T15:00:00.000Z`, 'en', 'Asia/Shanghai')).toBe('Oct 1, 11:00 PM')
    expect(formatScheduleNextRun(`${yearIn('UTC')}-12-31T15:00:00.000Z`, 'zh-CN', 'UTC')).toBe('12月31日 15:00')
    expect(formatScheduleNextRun(`${yearIn('Asia/Shanghai')}-12-31T15:00:00.000Z`, 'zh-CN', 'Asia/Shanghai')).toBe('12月31日 23:00')
  })

  it("adds the year when the instant falls outside the display zone's current year", () => {
    expect(formatScheduleNextRun('2001-10-01T15:00:00.000Z', 'en', 'UTC')).toBe('Oct 1, 2001, 3:00 PM')
    expect(formatScheduleNextRun('2001-10-01T15:00:00.000Z', 'zh-CN', 'Asia/Shanghai')).toBe('2001年10月1日 23:00')
  })

  it('reads the browser zone when the caller names none', () => {
    const at = `${yearIn('UTC')}-10-01T15:00:00.000Z`
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(formatScheduleNextRun(at, 'en')).toBe(formatScheduleNextRun(at, 'en', deviceZone))
  })

  it('matches the universal card field pair and never emits a padded month-day pair', () => {
    const at = `${yearIn('UTC')}-10-01T15:00:00.000Z`
    const expected = (locale: string, timeZone: string): string => new Intl.DateTimeFormat(locale, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
    }).format(Date.parse(at))
    for (const [locale, timeZone] of [['en', 'UTC'], ['zh-CN', 'UTC']] as const) {
      const shown = formatScheduleNextRun(at, locale, timeZone)
      expect(shown).toBe(expected(locale, timeZone))
      // No two-digit month-day pair, whatever separators the locale uses.
      expect(shown).not.toMatch(/\d{2}-\d{2}/)
      // The name and the clock are both present: a month word or 月, an hour
      // marker, and a day number.
      expect(shown).toMatch(locale === 'zh-CN' ? /月\s*\d{1,2}日/ : /[A-Za-z]{3}/)
      expect(shown).toMatch(/\d{1,2}:\d{2}/)
    }
  })

  it('returns the stored value when it is not a parseable instant', () => {
    expect(formatScheduleNextRun('not an instant', 'en')).toBe('not an instant')
  })

  it('leaves seconds out of the line for both locales', () => {
    // 15:20:37 shows as the 3:20 clock field pair, so the stored second and
    // millisecond cannot appear anywhere in the line.
    for (const locale of ['en', 'zh-CN']) {
      const shown = formatScheduleNextRun(`${yearIn('UTC')}-10-01T15:20:37.456Z`, locale, 'UTC')
      expect(shown).not.toContain('37')
      expect(shown).not.toContain('456')
    }
  })
})

const base = {
  id: 'named-task' as ScheduleId,
  title: 'Named task',
  prompt: 'Named task',
  scheduledAt: '2026-10-01T00:00:00.000Z',
}
const tEn = makeTranslate(en)
/** Zone context whose label is the raw zone, so a asserted label names its source. */
const hostContext = { system: SYSTEM, label: (zone: string) => zone }

const oneShot: ScheduleRecord = { ...base, kind: 'at' }
const delayed: ScheduleRecord = { ...base, kind: 'after', afterSeconds: 3_600 }
const dailyLocal: ScheduleRecord = { ...base, kind: 'daily', time: '09:00:00.000', timeZone: SYSTEM }
const dailyAway: ScheduleRecord = { ...base, kind: 'daily', time: '09:30:00.500', timeZone: 'Europe/Paris' }
const weeklyLocal: ScheduleRecord = { ...base, kind: 'weekly', time: '07:15:00.000', timeZone: SYSTEM, weekdays: [1, 3] }
const weeklyAway: ScheduleRecord = { ...base, kind: 'weekly', time: '07:15:00.000', timeZone: 'Europe/Paris', weekdays: [1] }
const hourly: ScheduleRecord = { ...base, kind: 'every', everySeconds: 7_200 }
const secondly: ScheduleRecord = { ...base, kind: 'every', everySeconds: 90 }
const daily: ScheduleRecord = { ...base, kind: 'every', everySeconds: 86_400 }
const cron: ScheduleRecord = { ...base, kind: 'cron', expression: '0 9 * * 1-5', timeZone: SYSTEM }
const cronAway: ScheduleRecord = { ...base, kind: 'cron', expression: '0 9 * * 1-5', timeZone: 'Europe/Paris' }
const cronUnreadable: ScheduleRecord = { ...base, kind: 'cron', expression: 'not a cron rule', timeZone: SYSTEM }
const cronUnreadableAway: ScheduleRecord = { ...base, kind: 'cron', expression: 'not a cron rule', timeZone: 'Europe/Paris' }

describe('zone label defaults', () => {
  it('resolves a zone at the current instant when the caller names none', () => {
    expect(zoneLabel(SYSTEM, tEn)).toBe(zoneLabel(SYSTEM, tEn, Date.now()))
    expect(zoneName(SYSTEM, SYSTEM, tEn)).toBe(`${zoneLabel(SYSTEM, tEn, Date.now())}${en['rule.zone.system']}`)
  })
})

describe('taskName', () => {
  it('names a task from its stored title and never from its instruction', () => {
    expect(taskName({ ...base, kind: 'at' })).toBe('Named task')
    expect(taskName({ ...base, kind: 'at', title: 'Stored name', prompt: 'Different text' })).toBe('Stored name')
  })
})

describe('formatScheduleFrequency', () => {
  it('reads a one-shot rule as the once label, whatever its target', () => {
    expect(formatScheduleFrequency(oneShot, tEn)).toBe(en['frequency.once'])
    expect(formatScheduleFrequency(oneShot, tEn, hostContext)).toBe(en['frequency.once'])
    // An `after` rule is the same one-shot shape, created from a delay.
    expect(formatScheduleFrequency(delayed, tEn, hostContext)).toBe(en['frequency.once'])
  })

  it('repeats a fixed interval in the largest unit that divides it', () => {
    const seconds = makeTranslate(en)('frequency.every', { value: 90, unit: en['unit.second.other'] })
    const hours = makeTranslate(en)('frequency.every', { value: 2, unit: en['unit.hour.other'] })
    const days = makeTranslate(en)('frequency.every', { value: 1, unit: en['unit.day.one'] })
    expect(formatScheduleFrequency(hourly, tEn)).toBe(hours)
    expect(formatScheduleFrequency(secondly, tEn)).toBe(seconds)
    expect(formatScheduleFrequency(daily, tEn)).toBe(days)
  })

  it('keeps a stored wall-clock time and its own zone, dropping only a zero second', () => {
    expect(formatScheduleFrequency(dailyLocal, tEn, hostContext)).toBe(tEn('frequency.dailyLocal', { time: '09:00' }))
    expect(formatScheduleFrequency(dailyAway, tEn, hostContext))
      .toBe(tEn('frequency.daily', { time: '09:30', timeZone: 'Europe/Paris' }))
    expect(formatScheduleFrequency(dailyLocal, tEn))
      .toBe(tEn('frequency.daily', { time: '09:00', timeZone: zoneLabel(SYSTEM, tEn) }))
  })

  it('names the stored weekday set for a weekly rule', () => {
    const weekdays = formatWeekdays([1, 3], tEn)
    expect(formatScheduleFrequency(weeklyLocal, tEn, hostContext))
      .toBe(tEn('frequency.weeklyLocal', { weekdays, time: '07:15' }))
    expect(formatScheduleFrequency(weeklyAway, tEn, hostContext))
      .toBe(tEn('frequency.weekly', { weekdays: formatWeekdays([1], tEn), time: '07:15', timeZone: 'Europe/Paris' }))
    expect(formatScheduleFrequency(weeklyLocal, tEn))
      .toBe(tEn('frequency.weekly', { weekdays, time: '07:15', timeZone: zoneLabel(SYSTEM, tEn) }))
  })

  it('reads a readable cron rule as the sentence its expression describes', () => {
    const rule = cronPreview(parseCronExpression('0 9 * * 1-5')!, tEn, en['time.locale'])
    expect(formatScheduleFrequency(cron, tEn, hostContext)).toBe(rule)
    expect(formatScheduleFrequency(cronAway, tEn, hostContext))
      .toBe(tEn('frequency.cronRule', { rule, timeZone: 'Europe/Paris' }))
    expect(formatScheduleFrequency(cron, tEn))
      .toBe(tEn('frequency.cronRule', { rule, timeZone: zoneLabel(SYSTEM, tEn) }))
  })

  it('keeps the raw expression of a rule this parser cannot read, in the stored zone', () => {
    expect(formatScheduleFrequency(cronUnreadable, tEn, hostContext))
      .toBe(tEn('frequency.cronLocal', { expression: 'not a cron rule' }))
    expect(formatScheduleFrequency(cronUnreadableAway, tEn, hostContext))
      .toBe(tEn('frequency.cron', { expression: 'not a cron rule', timeZone: 'Europe/Paris' }))
    expect(formatScheduleFrequency(cronUnreadable, tEn))
      .toBe(tEn('frequency.cron', { expression: 'not a cron rule', timeZone: zoneLabel(SYSTEM, tEn) }))
  })
})

describe('formatScheduleRelative', () => {
  const target = '2026-10-01T12:00:00.000Z'
  const at = Date.parse(target)

  it('states a due target, a later one rounded up, and a passed one rounded down', () => {
    expect(formatScheduleRelative(target, at, tEn)).toBe(en['relative.now'])
    expect(formatScheduleRelative(target, at - 5_400_000, tEn))
      .toBe(tEn('relative.future', { value: 2, unit: en['unit.hour.other'] }))
    expect(formatScheduleRelative(target, at + 5_400_000, tEn))
      .toBe(tEn('relative.overdue', { value: 1, unit: en['unit.hour.one'] }))
  })

  it('never states a zero distance for an instant that has already passed', () => {
    // A target one second away still reads as one second, not as due now.
    expect(formatScheduleRelative(target, at - 1, tEn))
      .toBe(tEn('relative.future', { value: 1, unit: en['unit.second.one'] }))
    expect(formatScheduleRelative(target, at + 1, tEn))
      .toBe(tEn('relative.overdue', { value: 1, unit: en['unit.second.one'] }))
  })
})

describe('orderScheduleRecords', () => {
  const now = Date.parse('2026-10-01T12:00:00.000Z')
  const timed = (id: string, scheduledAt: string): ScheduleRecord =>
    ({ ...base, id: id as ScheduleId, kind: 'at', scheduledAt })

  it('puts overdue targets first and otherwise orders by ascending target, keeping ties stable', () => {
    const overdue = timed('overdue', '2026-10-01T09:00:00.000Z')
    const later = timed('later', '2026-10-01T15:00:00.000Z')
    const soon = timed('soon', '2026-10-01T13:00:00.000Z')
    const tie = timed('tie', '2026-10-01T13:00:00.000Z')
    const ordered = orderScheduleRecords([later, soon, overdue, tie], now)
    expect(ordered.map(record => record.id)).toEqual(['overdue', 'soon', 'tie', 'later'])
    // The input is left alone.
    expect([later, soon, overdue, tie].map(record => record.id)).toEqual(['later', 'soon', 'overdue', 'tie'])
  })
})
