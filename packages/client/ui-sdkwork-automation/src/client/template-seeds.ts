/**
 * Catalog templates as create seeds: what clicking a template card puts into the
 * add-task dialog.
 *
 * A card is a shortcut into the same draft the New action opens, not a second
 * creation path: it fills the dialog, and the user confirms it there. Every
 * seed resolves its first run against the moment the dialog opens, so a template
 * can never stage a run time that has already passed — the Host refuses a past
 * target, and a card that produced one would fail on confirm. A one-shot that
 * states no time therefore starts an hour out rather than leaving the field
 * empty and its confirm disabled.
 */

import type { AutomationCreateSeed, CreateFrequency, CreateIntervalUnit } from './create-request.ts'

/** One template's recurrence, before its first run is resolved. */
interface TemplateRule {
  /** Recurrence the staged draft starts with. */
  readonly frequency: CreateFrequency
  /** Wall-clock start of a recurring seed, read in the browser's own zone. */
  readonly at?: {
    readonly hour: number
    readonly minute: number
    /** ISO weekday a weekly seed repeats on, Monday 1 through Sunday 7. */
    readonly weekday?: number
  }
  /** Quantity an interval seed repeats by. */
  readonly intervalValue?: number
  /** Unit of {@link TemplateRule.intervalValue}. */
  readonly intervalUnit?: CreateIntervalUnit
}

/**
 * The catalog's recurrence per template marker id.
 *
 * A template whose own copy names a time states it here; a template that needs a
 * decision only its author can make — an appointment date, a meeting's start —
 * states no time of day, and {@link templateSeed} stages the dialog's default for
 * a first run instead of leaving confirm waiting on a time.
 */
const TEMPLATE_RULES: Readonly<Record<string, TemplateRule>> = {
  'news': { frequency: 'daily', at: { hour: 9, minute: 0 } },
  'vocab': { frequency: 'daily', at: { hour: 8, minute: 0 } },
  'bedtime': { frequency: 'daily', at: { hour: 20, minute: 30 } },
  'weekly-report': { frequency: 'weekly', at: { hour: 17, minute: 0, weekday: 5 } },
  'movies': { frequency: 'weekly', at: { hour: 20, minute: 0, weekday: 6 } },
  'history-today': { frequency: 'daily', at: { hour: 8, minute: 0 } },
  'why': { frequency: 'daily', at: { hour: 12, minute: 0 } },
  'parents-call': { frequency: 'weekly', at: { hour: 10, minute: 0, weekday: 7 } },
  'checkup': { frequency: 'once', at: { hour: 7, minute: 0 } },
  'interview': { frequency: 'interval', intervalValue: 2, intervalUnit: 'hour' },
  'meeting': { frequency: 'once' },
  'wallpaper': { frequency: 'daily', at: { hour: 10, minute: 0 } },
}

/** Every template marker id the catalog offers, in card order. */
export const TEMPLATE_IDS: readonly string[] = Object.keys(TEMPLATE_RULES)

/** `YYYY-MM-DDTHH:mm` in the browser's own zone: the form a `datetime-local` reads. */
function localValue(at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** ISO weekday of one local date: Monday 1 through Sunday 7. */
function isoWeekdayOf(at: Date): number {
  const weekday = at.getDay()
  return weekday === 0 ? 7 : weekday
}

/**
 * The first run one template rule stages.
 *
 * A rule with a stated time takes its next occurrence: a daily rule takes
 * today's when it is still ahead and tomorrow's otherwise; a weekly rule takes
 * the next occurrence of its weekday, a week on when today's has already
 * passed; a one-shot takes the same next occurrence. A one-shot that states no
 * time starts one hour from now, rounded down to the minute, so a card never
 * opens a dialog whose confirm is stranded on an empty run time.
 * @param rule - the template's recurrence.
 * @param now - instant the dialog opened at.
 * @returns a local `datetime-local` value, or undefined when the rule names no time.
 */
function firstRun(rule: TemplateRule, now: Date): string | undefined {
  const at = rule.at
  if (at === undefined) {
    return rule.frequency === 'once' ? localValue(hourFromNow(now)) : undefined
  }
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), at.hour, at.minute, 0, 0)
  if (at.weekday === undefined) {
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  } else {
    target.setDate(target.getDate() + ((at.weekday - isoWeekdayOf(target) + 7) % 7))
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 7)
  }
  return localValue(target)
}

/** One hour after `now`, with the seconds cleared for the minute-precision field. */
function hourFromNow(now: Date): Date {
  const target = new Date(now.getTime() + 3_600_000)
  target.setSeconds(0, 0)
  return target
}

/**
 * The draft values one template card stages.
 * @param id - the card's `data-automation-template` marker.
 * @param title - the card's localized title, staged as the stored task name.
 * @param prompt - the card's localized description, staged as the instruction.
 * @param now - instant the dialog opened at.
 * @returns the seed the dialog opens with; an unknown id stages the name and the instruction only.
 */
export function templateSeed(id: string, title: string, prompt: string, now: Date): AutomationCreateSeed {
  const rule = TEMPLATE_RULES[id] ?? { frequency: 'once' }
  const runAt = firstRun(rule, now)
  return {
    title,
    prompt,
    frequency: rule.frequency,
    ...(runAt === undefined ? {} : { runAt }),
    ...(rule.intervalValue === undefined ? {} : { intervalValue: rule.intervalValue }),
    ...(rule.intervalUnit === undefined ? {} : { intervalUnit: rule.intervalUnit }),
  }
}
