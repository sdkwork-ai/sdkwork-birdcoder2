/**
 * The local `ui-sdkwork-persona` user-settings section: the offline cache of the
 * account persona (role, followed interest directions, and whether the first-run
 * prompt was answered), plus the only store used while signed out.
 *
 * The IAM account profile is the authority (`/app/v3/api/iam/users/current/persona`);
 * this section mirrors it so the picker can render before the account read
 * resolves, offline, and in a signed-out session. Role ids are
 * presentation-neutral keys; the IAM catalog maps the ones with an
 * authorization counterpart onto business roles, while this package only
 * records the choice.
 */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the ui-sdkwork-persona plugin. */
export const PERSONA_NAMESPACE = 'ui-sdkwork-persona'

/** Field carrying the chosen persona role. */
export const PERSONA_ROLE_FIELD = 'role'
/** Field carrying the followed interest directions. */
export const PERSONA_INTERESTS_FIELD = 'interests'
/** Field recording that the first-run prompt was dismissed without a role. */
export const PERSONA_PROMPT_DISMISSED_FIELD = 'promptDismissed'

/** Persona roles the picker offers, in display order. */
export const PERSONA_ROLE_IDS = [
  'learner',
  'employee',
  'teacher',
  'partner',
  'manager',
  'developer',
  'creator',
  'visitor',
] as const

/** One persona role id. */
export type PersonaRoleId = typeof PERSONA_ROLE_IDS[number]

/** The persona choices stored for one Host user. */
export interface PersonaSettings {
  /** The chosen role, or the empty string while the person has not chosen one. */
  role: PersonaRoleId | ''
  /** Interest direction ids the person follows; unknown ids are dropped on read. */
  interests: string[]
  /** Whether the first-run prompt was dismissed without choosing a role. */
  promptDismissed: boolean
}

/**
 * Durable persona fields, shared by the Host Config and the browser scope.
 * A role is a closed union so an unknown id never reaches the document.
 */
export const PersonaSettingsFields = {
  [PERSONA_ROLE_FIELD]: z.union([
    z.const(''),
    ...PERSONA_ROLE_IDS.map(id => z.const(id)),
  ]).default(''),
  [PERSONA_INTERESTS_FIELD]: z.array(z.string()).default([]),
  [PERSONA_PROMPT_DISMISSED_FIELD]: z.boolean().default(false),
}

/** Durable persona schema; also the wire envelope the browser scope validates against. */
export const PersonaSettingsSchema: z<PersonaSettings> = z.object(PersonaSettingsFields)

/** The schema defaults, for reads before the settings scope resolves. */
export const DEFAULT_PERSONA_SETTINGS: PersonaSettings = {
  [PERSONA_ROLE_FIELD]: '',
  [PERSONA_INTERESTS_FIELD]: [],
  [PERSONA_PROMPT_DISMISSED_FIELD]: false,
}

/**
 * Narrow a stored or external value to a known role id.
 * @param value - candidate role id.
 * @returns whether the value names a role this build offers.
 */
export function isPersonaRoleId(value: string): value is PersonaRoleId {
  return (PERSONA_ROLE_IDS as readonly string[]).includes(value)
}
