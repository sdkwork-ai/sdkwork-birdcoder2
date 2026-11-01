/** Host registration for the ui-sdkwork-persona user-settings section. */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

import {
  PERSONA_INTERESTS_FIELD, PERSONA_PROMPT_DISMISSED_FIELD, PERSONA_ROLE_FIELD,
  PersonaSettingsFields, type PersonaRoleId,
} from './persona-settings.ts'

export {
  DEFAULT_PERSONA_SETTINGS, isPersonaRoleId, PERSONA_INTERESTS_FIELD, PERSONA_NAMESPACE,
  PERSONA_PROMPT_DISMISSED_FIELD, PERSONA_ROLE_FIELD, PERSONA_ROLE_IDS, PersonaSettingsSchema,
  type PersonaRoleId, type PersonaSettings,
} from './persona-settings.ts'

/**
 * The persona section as the Host stores it.
 *
 * A plugin's own Config *is* its settings section: the Loader creates the entry
 * from the composition, and `volatile` is what keeps the fields editable from
 * the browser half, which binds the same namespace through `configForms`.
 */
export interface Config {
  /** The chosen persona role, or the empty string while unchosen. */
  role: Volatile<PersonaRoleId | ''>
  /** Interest direction ids the person follows. */
  interests: Volatile<string[]>
  /** Whether the first-run prompt was dismissed without choosing a role. */
  promptDismissed: Volatile<boolean>
}

/** Live persona fields: the first-run choices the picker writes. */
export const Config = z.object({
  [PERSONA_ROLE_FIELD]: PersonaSettingsFields[PERSONA_ROLE_FIELD].volatile(),
  [PERSONA_INTERESTS_FIELD]: PersonaSettingsFields[PERSONA_INTERESTS_FIELD].volatile(),
  [PERSONA_PROMPT_DISMISSED_FIELD]: PersonaSettingsFields[PERSONA_PROMPT_DISMISSED_FIELD].volatile(),
})

/**
 * Keep the persona section out of any generated settings page: the picker is
 * the only editor, so the section exists for the browser scope alone.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
