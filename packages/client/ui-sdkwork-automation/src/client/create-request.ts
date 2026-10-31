/**
 * The add-task dialog's draft and the Host `schedule/create` request it composes.
 *
 * Creation is one Remote write, so the dialog is the whole creation path: no
 * Session is started and no model call is involved. The choices the request
 * cannot express as stored fields — the phrasing preference, the validity end
 * date, and the push channels — become part of the instruction, and the
 * workspace selects the directory of the conversation the task creates at its
 * first delivery.
 */

import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ScheduleCatalogEntry, ScheduleCreateRequest, ScheduleTiming } from '@deepseek-ai/dsh-schedule/client'
import type { AutomationKey } from './locales.ts'

/** One execution-frequency choice of the dialog. */
export type CreateFrequency = 'once' | 'hourly' | 'interval' | 'daily' | 'weekly' | 'monthly'

/** Unit the interval choice repeats by. */
export type CreateIntervalUnit = 'minute' | 'hour'

/** How the created task's instruction should read. */
export type CreateStyle = 'balanced' | 'precise'

/** One validity choice of the dialog. */
export type CreateValidity = 'forever' | 'until'

/** Workspace identity the picker offers, taken from the browser's Workspace catalog. */
export type CreateWorkspaceId = WorkspaceView['workspaceId']

/** One Workspace the dialog's picker offers. */
export interface CreateWorkspaceOption {
  /** Identity the picker selects. */
  readonly id: CreateWorkspaceId
  /** Visible name: the Workspace title, or its path when the title is blank. */
  readonly label: string
  /** Directory the task's first-created conversation starts in. */
  readonly cwd: string
}

/** Everything the add-task dialog collected. */
export interface AutomationDraft {
  /** Stored task name, submitted as `schedule/create`'s `title`. */
  readonly title: string
  /** Reminder text, submitted as `schedule/create`'s `prompt`. */
  readonly prompt: string
  /** Chosen repetition of the run time. */
  readonly frequency: CreateFrequency
  /** `datetime-local` value naming the first run; empty until the user picks one. */
  readonly runAt: string
  /** Quantity the interval choice repeats by; ignored by every other frequency. */
  readonly intervalValue: number
  /** Unit of {@link AutomationDraft.intervalValue}. */
  readonly intervalUnit: CreateIntervalUnit
  /** Whether the task stops at {@link AutomationDraft.untilDate}. */
  readonly validity: CreateValidity
  /** `date` value of the validity end, meaningful only for `'until'`. */
  readonly untilDate: string
  /** How the created task's instruction should read. */
  readonly style: CreateStyle
  /** Whether results should reach the WorkBuddy mini program. */
  readonly pushWorkBuddy: boolean
  /** Whether results should reach a WeCom bot. */
  readonly pushWecomBot: boolean
  /** Workspace the task's conversation starts in, or undefined for the Host default. */
  readonly workspace: CreateWorkspaceOption | undefined
}

/** Values the dialog opens with: a catalog template's seed, or nothing at all. */
export interface AutomationCreateSeed {
  /** Stored task name the draft starts with. */
  readonly title: string
  /** Instruction the draft starts with. */
  readonly prompt: string
  /** Recurrence the draft starts with. */
  readonly frequency: CreateFrequency
  /** `datetime-local` value the seed resolved for its first run; absent lets the user pick one. */
  readonly runAt?: string
  /** Quantity the interval choice starts with. */
  readonly intervalValue?: number
  /** Unit of {@link AutomationCreateSeed.intervalValue}. */
  readonly intervalUnit?: CreateIntervalUnit
}

/** Why the Host refused one creation, in the terms the dialog reports. */
export type CreateTaskFailure =
  /** The run time is not strictly in the future. */
  | 'notFuture'
  /** The frequency or the zone produced no usable rule. */
  | 'rule'
  /** The name or the instruction is empty or over the Host's bound. */
  | 'title'
  /** Transport or unclassified Host failure. */
  | 'host'

/** What one confirmed draft settled as. */
export type CreateTaskOutcome =
  | { readonly created: ScheduleCatalogEntry }
  | { readonly failed: CreateTaskFailure }

/** Every frequency the dialog offers, in picker order. */
export const CREATE_FREQUENCIES: readonly CreateFrequency[] =
  ['once', 'hourly', 'interval', 'daily', 'weekly', 'monthly']

/** Every interval unit the dialog offers, in picker order. */
export const CREATE_INTERVAL_UNITS: readonly CreateIntervalUnit[] = ['minute', 'hour']

/** Seconds one interval unit stands for. */
const INTERVAL_UNIT_SECONDS: Record<CreateIntervalUnit, number> = { minute: 60, hour: 3_600 }

/** Shortest interval the Host accepts, stated in seconds. */
export const MIN_INTERVAL_SECONDS = 60

/**
 * Longest stored task name the Host accepts. It mirrors the Schedule service's
 * own bound, which no browser-safe entry publishes: a longer name comes back as
 * `invalid_prompt` instead of a task.
 */
export const MAX_TASK_NAME_LENGTH = 120

/** Frequencies whose rule is an elapsed interval, so they need no run time. */
const INTERVAL_FREQUENCIES: readonly CreateFrequency[] = ['hourly', 'interval']

/**
 * Seconds one draft's interval choice repeats by.
 * @param draft - the dialog's draft.
 * @returns the interval in seconds; meaningless for a frequency that is not an interval.
 */
export function intervalSeconds(draft: AutomationDraft): number {
  return draft.intervalValue * INTERVAL_UNIT_SECONDS[draft.intervalUnit]
}

/** `datetime-local` value: date, hour, minute, and optional second. */
const RUN_AT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * The seconds of one {@link RUN_AT} match.
 *
 * `exec` always reports one entry per group, so a value without seconds carries
 * an absent group where the compiler reads a string; the fallback keeps such a
 * value whole.
 * @param capture - the seconds group's capture, absent when the value names none.
 * @returns the captured seconds, or `00`.
 */
function secondsOf(capture: string | undefined): string {
  return capture ?? '00'
}

/**
 * One `datetime-local` value as its calendar date and wall-clock time.
 * @param runAt - the input's value.
 * @returns the `YYYY-MM-DD` date and `HH:mm:ss` time, or undefined when the value is not a complete local instant.
 */
export function splitRunAt(runAt: string): { readonly date: string; readonly time: string } | undefined {
  const match = RUN_AT.exec(runAt)
  if (match === null) return undefined
  return { date: match[1], time: `${match[2]}:${match[3]}:${secondsOf(match[4])}` }
}

/**
 * ISO weekday of one calendar date, independent of any time zone.
 * @param date - `YYYY-MM-DD` date.
 * @returns Monday 1 through Sunday 7.
 */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

/**
 * Whether the draft carries everything its frequency needs.
 * @param draft - the dialog's draft.
 * @returns whether confirm may submit it.
 */
export function draftReady(draft: AutomationDraft): boolean {
  const title = draft.title.trim()
  // The Host refuses an empty title or instruction, so confirm waits for both.
  if (title === '' || title.length > MAX_TASK_NAME_LENGTH || draft.prompt.trim() === '') return false
  if (draft.frequency === 'interval') {
    // The Host refuses an interval shorter than a minute, so the dialog does too.
    return Number.isSafeInteger(draft.intervalValue) && intervalSeconds(draft) >= MIN_INTERVAL_SECONDS
  }
  if (INTERVAL_FREQUENCIES.includes(draft.frequency)) return true
  return splitRunAt(draft.runAt) !== undefined
}

/**
 * The timing one draft asks for.
 *
 * Every choice the Host names as its own stored kind is written as that kind, so
 * the catalog states it in the design's words — `Every day at 09:00`, `Once` —
 * and the task detail can reopen it for editing. Only the monthly choice, which
 * the Host has no typed kind for, becomes an RFC 5545 rule.
 * @param draft - the dialog's draft.
 * @param timeZone - IANA zone the chosen wall-clock time is read in.
 * @returns the timing, or undefined when the draft has no usable run time.
 */
export function scheduleTiming(draft: AutomationDraft, timeZone: string): ScheduleTiming | undefined {
  // The two fixed-rate choices count from creation, so they need no run time.
  if (draft.frequency === 'hourly') return { kind: 'every', every_seconds: 3_600 }
  if (draft.frequency === 'interval') return { kind: 'every', every_seconds: intervalSeconds(draft) }
  const run = splitRunAt(draft.runAt)
  if (run === undefined) return undefined
  switch (draft.frequency) {
    case 'once': return { kind: 'at', at: { date: run.date, time: run.time, time_zone: timeZone } }
    case 'daily': return { kind: 'daily', daily: { time: run.time, time_zone: timeZone } }
    case 'weekly': {
      return {
        kind: 'weekly',
        weekly: { time: run.time, time_zone: timeZone, weekdays: [isoWeekday(run.date)] },
      }
    }
    case 'monthly': {
      // The Host names no day-of-month timing kind, but its five-field cron does:
      // one minute, one hour, one day of every month. That expression is the shape
      // the detail's monthly builder recognizes, so a created task stays editable
      // and reads as the designed "every month on day N" copy.
      const [hour, minute] = run.time.split(':').map(Number)
      const day = Number(run.date.slice(8))
      return {
        kind: 'cron',
        cron: { expression: `${minute} ${hour} ${day} * *`, time_zone: timeZone },
      }
    }
  }
}

/**
 * The frequency menu's dictionary key for one choice.
 * @param frequency - the choice to label.
 * @returns the `automation` dictionary key naming it.
 */
export function frequencyKey(frequency: CreateFrequency): AutomationKey {
  switch (frequency) {
    case 'once': return 'create.frequencyOnce'
    case 'hourly': return 'create.frequencyHourly'
    case 'interval': return 'create.frequencyInterval'
    case 'daily': return 'create.frequencyDaily'
    case 'weekly': return 'create.frequencyWeekly'
    case 'monthly': return 'create.frequencyMonthly'
  }
}

/**
 * The unit menu's dictionary key for one choice.
 * @param unit - the unit to label.
 * @returns the `automation` dictionary key naming it.
 */
export function intervalUnitKey(unit: CreateIntervalUnit): AutomationKey {
  switch (unit) {
    case 'minute': return 'timing.unit.minute'
    case 'hour': return 'timing.unit.hour'
  }
}

/**
 * The failure the dialog reports for one Host refusal.
 * @param code - the input code the Host attached to `schedule/input-invalid`.
 * @returns the failure kind, or `'host'` for a code the dialog cannot correct.
 */
export function createFailure(code: string): CreateTaskFailure {
  if (code === 'not_future') return 'notFuture'
  if (code === 'invalid_prompt') return 'title'
  return code === 'invalid_rule' || code === 'invalid_time_zone'
    || code === 'frequency_too_high' || code === 'time_out_of_range'
    ? 'rule' : 'host'
}

/**
 * The instruction stored with the created task.
 *
 * The Host keeps one instruction per task, so the dialog's extra choices are
 * appended to the text the user wrote rather than dropped: they are part of
 * what the task asks for, and the stored task remains the single place that
 * says so.
 * @param draft - the dialog's draft.
 * @param t - the automation namespace dictionary.
 * @returns the instruction text submitted as `schedule/create`'s `prompt`.
 */
export function taskInstruction(draft: AutomationDraft, t: Translate<AutomationKey>): string {
  const lines = [
    draft.prompt.trim(),
    t(draft.style === 'precise' ? 'create.instruction.stylePrecise' : 'create.instruction.styleBalanced'),
  ]
  if (draft.validity === 'until' && draft.untilDate !== '') {
    lines.push(t('create.instruction.until', { date: draft.untilDate }))
  }
  if (draft.pushWorkBuddy) lines.push(t('create.instruction.pushWorkBuddy'))
  if (draft.pushWecomBot) lines.push(t('create.instruction.pushWecomBot'))
  return lines.filter(line => line !== '').join('\n')
}

/**
 * The Host request the dialog's confirm writes.
 *
 * The task creates one conversation at its first delivery and keeps delivering
 * into it, so the template's follow-ups read as one thread; a chosen Workspace
 * is that conversation's directory, and an unchosen one leaves the Host
 * default.
 * @param draft - the dialog's draft.
 * @param timeZone - IANA zone the chosen wall-clock time is read in.
 * @param t - the automation namespace dictionary.
 * @returns the request, or undefined when the draft cannot name a run time.
 */
export function scheduleCreateRequest(
  draft: AutomationDraft,
  timeZone: string,
  t: Translate<AutomationKey>,
): ScheduleCreateRequest | undefined {
  const timing = scheduleTiming(draft, timeZone)
  if (timing === undefined) return undefined
  return {
    title: draft.title.trim(),
    prompt: taskInstruction(draft, t),
    timing,
    target: {
      kind: 'new_once',
      create: draft.workspace === undefined ? {} : { cwd: draft.workspace.cwd },
    },
  }
}
