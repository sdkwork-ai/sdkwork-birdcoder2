/**
 * Persona personalization plugin, browser half: owns the account persona read
 * and write path (role + followed interest directions) through the IAM account
 * profile, the local `ui-sdkwork-persona` cache the picker renders while signed
 * out or offline, the first-run picker that opens once while no role is chosen,
 * and the settings-menu persona row that reopens the same picker at any time.
 * The settings-menu seam (`ctx.persona`) is bound here, so the row exists
 * exactly while this plugin is mounted.
 *
 * The account owns the choice; this entry never exposes the picker state to
 * other plugins. Recommendation surfaces read the same account profile through
 * the IAM App SDK rather than through this plugin.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the shell.overlay slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.configForms into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.iam (the account profile seam) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
// Type-only: pulls ctx.persona (the settings-menu seam) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-settings-menu/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  isPersonaRoleId, PERSONA_NAMESPACE, type PersonaSettings,
} from '../persona-settings.ts'
import { normalizeInterests } from './catalog.ts'
import { PersonaService, type PersonaAccountPort } from './persona-service.ts'
import { createPersonaPickerStore } from './persona-ui-store.ts'
import { PersonaDialog, type PersonaDialogInjected } from './PersonaDialog.tsx'
import { en, zh, type PersonaKey } from './locales.ts'

export { PERSONA_NAMESPACE, type PersonaRoleId, type PersonaSettings } from '../persona-settings.ts'
export type { PersonaInterestId } from './catalog.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The ui-sdkwork-persona plugin's copy (picker chrome, roles, interests). */
    uiPersona: PersonaKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'uiPersona'

/** Services required by the ui-sdkwork-persona plugin (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms', 'iam', 'persona']

/**
 * Map an account persona onto the local cache shape, dropping ids this build
 * does not render. The account may hold a code written by a newer build.
 * @param persona - the account persona read from the IAM profile.
 * @returns the narrowed choices.
 */
function fromAccountPersona(persona: {
  role: string | null
  interests?: readonly string[]
  promptDismissed?: boolean
}): PersonaSettings {
  return {
    role: persona.role !== null && isPersonaRoleId(persona.role) ? persona.role : '',
    interests: normalizeInterests(persona.interests ?? []),
    promptDismissed: persona.promptDismissed === true,
  }
}

/**
 * Build the account port over `ctx.iam`.
 *
 * Availability is read on every call so a sign-out immediately stops account
 * traffic; the subscription feeds the service's availability transition check.
 * @param iam - the IAM service face.
 * @returns the account store the persona service consumes.
 */
function createAccountPort(iam: {
  isSignedIn: () => boolean
  isConfigured: () => boolean
  retrievePersona: () => Promise<{ role: string | null; interests?: readonly string[]; promptDismissed?: boolean }>
  updatePersona: (command: {
    role: string | null
    interests: string[]
    promptDismissed: boolean
  }) => Promise<{ role: string | null; interests?: readonly string[]; promptDismissed?: boolean }>
  retrievePersonaCatalog: () => Promise<{
    roles: readonly { code: string }[]
    interests: readonly { code: string }[]
  }>
  subscribe: (listener: () => void) => () => void
}): PersonaAccountPort {
  return {
    available: () => iam.isSignedIn() && iam.isConfigured(),
    retrieve: async () => fromAccountPersona(await iam.retrievePersona()),
    save: async (choices) => {
      const stored = await iam.updatePersona({
        role: choices.role === '' ? null : choices.role,
        interests: [...choices.interests],
        promptDismissed: choices.promptDismissed,
      })
      return fromAccountPersona(stored)
    },
    catalog: async () => {
      const catalog = await iam.retrievePersonaCatalog()
      return {
        roleIds: catalog.roles.map(role => role.code).filter(isPersonaRoleId),
        interestIds: normalizeInterests(catalog.interests.map(interest => interest.code)),
      }
    },
    subscribe: listener => iam.subscribe(listener),
  }
}

/**
 * Register the persona dictionary, bind the settings-menu seam, host the
 * picker on the frame overlay, and run the first-run gate once a source
 * resolves.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-persona: dictionaries')

  const t = ctx.locale.bind(NS)
  const scope = ctx.configForms.get<PersonaSettings>(PERSONA_NAMESPACE)
  const service = new PersonaService(
    scope,
    createAccountPort(ctx.iam),
    role => t(`persona.role.${role}`),
  )

  // The account read and the cache subscription are one lifetime: a reload
  // must not leave an orphaned account listener behind.
  ctx.effect(() => service.start(), 'ui-sdkwork-persona: account sync')

  // The settings-menu row: the label follows the locale, so the seam spreads
  // both subscriptions. The disposer restores the unavailable default when this
  // plugin is unloaded, so a reloaded menu never keeps a dead source.
  ctx.effect(() => ctx.persona.setSource({
    getSnapshot: () => service.menuProfile(),
    subscribe: (listener) => {
      const offService = service.subscribe(listener)
      const offLocale = ctx.locale.subscribe(listener)
      return () => {
        offService()
        offLocale()
      }
    },
    open: () => { service.open() },
  }), 'ui-sdkwork-persona: settings-menu seam')

  // The first-run gate: one attempt, latched.
  //
  // A configured IAM needs a moment to restore its stored session: on a device
  // whose local cache is empty, prompting before that restore would show the
  // picker even though the account already holds a role. The gate therefore
  // waits for the first sign-in/account notification (which runs the account
  // sync and re-evaluates) and falls back to a short grace period when the
  // restore settles anonymous. Without a configured IAM the local cache is the
  // only source, so the gate runs immediately.
  let prompted = false
  const gate = (): void => {
    if (prompted || !service.shouldPrompt()) return
    prompted = true
    service.open()
  }
  ctx.effect(() => {
    let grace: ReturnType<typeof setTimeout> | undefined
    const onIam = (): void => {
      if (ctx.iam.isSignedIn() && grace !== undefined) {
        clearTimeout(grace)
        grace = undefined
      }
      gate()
    }
    const offService = service.subscribe(gate)
    const offIam = ctx.iam.subscribe(onIam)
    if (ctx.iam.isConfigured()) {
      if (ctx.iam.isSignedIn()) gate()
      else grace = setTimeout(() => { grace = undefined; gate() }, 1500)
    } else {
      gate()
    }
    return () => {
      offService()
      offIam()
      if (grace !== undefined) clearTimeout(grace)
    }
  }, 'ui-sdkwork-persona: first-run gate')

  const store = createPersonaPickerStore()
  let bound: BoundActions<typeof store> | undefined
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'persona-picker',
    locale: NS,
    store,
    inject: (actions): PersonaDialogInjected => {
      bound = actions
      service.attachModal({
        open: () => { bound?.openDialog() },
        close: () => { bound?.closeDialog() },
      })
      return {
        onClose: () => { service.dismiss() },
        save: (role, interests) => service.save(role, interests),
        hooks: {
          choices: {
            getSnapshot: () => service.currentSettings(),
            subscribe: listener => service.subscribe(listener),
          },
          writable: {
            getSnapshot: () => service.isWritable(),
            subscribe: listener => service.subscribe(listener),
          },
          catalog: {
            getSnapshot: () => service.selectable(),
            subscribe: listener => service.subscribe(listener),
          },
        },
      }
    },
  }, PersonaDialog))
}
