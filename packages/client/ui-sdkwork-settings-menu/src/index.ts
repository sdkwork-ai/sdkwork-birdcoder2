/**
 * Host loader entry for the browser implementation exported from `./client`.
 *
 * The durable GUI-onboarding section the shell's welcome step persists to is
 * this plugin's own Config: the Loader creates one profile entry per composed
 * plugin, and that entry's id *is* the settings namespace. The field is
 * `volatile` so the browser scope reads and writes it (a non-volatile Config
 * carries no live form, and an entry with no live form is absent from the
 * forms the scope resolves), and `required(false)` so a composition that
 * declares no acknowledgement still resolves — an absent value is exactly what
 * the welcome step renders as "not yet acknowledged".
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * Validate a settings namespace key and return it branded; malformed names
 * throw TypeError (the dsh-settings public API no longer exports a brand
 * function, so this package keeps its own).
 * @param value - candidate namespace key.
 * @returns the key branded as {@link SettingsNamespace}.
 */
export function settingsNamespace(value: string): SettingsNamespace {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`)
  }
  return value as SettingsNamespace
}

/** Durable GUI-onboarding facts projected to the browser. */
export interface Config {
  /** Last version acknowledged by the current product welcome step; absence means unacknowledged. */
  welcomeNoticeVersion: Volatile<string | undefined>
}

/** Live GUI-onboarding facts. */
export const Config = z.object({
  welcomeNoticeVersion: z.string().required(false).volatile(),
})

/**
 * Keep the GUI-onboarding section out of the shell's generated settings pages
 * — the welcome step is the only reader and it is not a form — while the
 * section stays in the profile-backed forms the browser scope reads.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
