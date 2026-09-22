/** Host registration for the app-mode surface preferences. */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

import { SIDEBAR_VISIBLE_FIELD, UiAppModesSettingsFields } from './app-modes-settings.ts'

export {
  SIDEBAR_VISIBLE_FIELD, UI_APP_MODES_NAMESPACE, UiAppModesSettingsSchema,
  type UiAppModesSettings,
} from './app-modes-settings.ts'

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

/**
 * Runtime preferences projected to the browser.
 *
 * A plugin's own Config *is* its settings section: the Loader creates the
 * entry from the composition, and `volatile` is what keeps the fields live —
 * the browser half binds the same namespace through `configForms` and reads
 * the resolved value from the form projection.
 */
export interface Config {
  /** Whether the sidebar column renders wide content (false collapses it to the control rail). */
  sidebarVisible: Volatile<boolean>
}

/** Live app-mode surface preferences. */
export const Config = z.object({
  [SIDEBAR_VISIBLE_FIELD]: UiAppModesSettingsFields[SIDEBAR_VISIBLE_FIELD].volatile(),
})

/**
 * Keep the app-mode surface section out of the shell's generated settings
 * pages — the sidebar row renders this preference itself — while the section
 * stays in the profile-backed forms the browser scope reads.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
