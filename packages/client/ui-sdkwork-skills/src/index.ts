/**
 * Host registration for the skill-manager preferences, and the only place a
 * disabled skill actually stops being a skill.
 *
 * The suppression is a provider, not a filter: this package registers a
 * zero-ranked catalog provider that re-advertises every disabled name with
 * `modelInvocable: false` and `userInvocable: false`. A candidate's rank
 * decides same-name winners within one layer, and the filesystem roots rank
 * 100 (`.dsh/skills`), 200 (`.agents/skills`, where every BirdCoder built-in
 * lives), 300 (custom), 400/500 (user) and 600 (bundled) — so a rank below 100
 * wins against all of them without touching a single upstream file. Both
 * consumers of the merged catalog then drop the name on their own boundary:
 * the `/` menu handler filters `isUserInvocable`, and the model-facing catalog
 * filters `modelInvocable`. Suppressing, not deleting, also means the skill
 * file stays exactly where the user put it and re-enabling is a pure settings
 * write.
 *
 * The provider reads the settings section per `list()` call, so the answer is
 * never stale; the registry caches completed catalogs, which is why a settings
 * commit must explicitly invalidate through the registration's own control.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type {
  SkillCandidate, SkillDefinition, SkillInvocationPolicy, SkillProviderControl,
} from '@deepseek-ai/dsh-skill'
import {
  DISABLED_SKILLS_FIELD, UI_SKILLS_NAMESPACE, UiSkillsSettingsSchema,
  type UiSkillsSettings,
} from './skills-settings.ts'

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

export {
  DISABLED_SKILLS_FIELD, HIDDEN_SCENE_TAGS_FIELD, UI_SKILLS_NAMESPACE, UiSkillsSettingsSchema,
  type UiSkillsSettings,
} from './skills-settings.ts'

/** Provider name the suppression candidates are advertised under. */
const SUPPRESSION_PROVIDER = 'sdkwork-skill-suppression'

/**
 * Rank of a suppression candidate. Any value below the lowest filesystem root
 * rank (100, project `.dsh/skills`) wins every same-name comparison in the
 * global layer; 0 leaves headroom for a future root that outranks nothing.
 */
const SUPPRESSION_RANK = 0

/** The skill-name grammar the registry validates candidates against. */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Invocation policy that hides a suppressed skill from both catalogs. */
const SUPPRESSED: SkillInvocationPolicy = { modelInvocable: false, userInvocable: false }

/**
 * Host-internal copy for the shadow entries. It never reaches a user: a
 * suppressed candidate is filtered out of both catalogs, so only the name and
 * the policy are observable.
 */
const SUPPRESSION_DESCRIPTION = 'Suppressed by the BirdCoder skill manager'
const SUPPRESSION_CONTENT = 'This skill is suppressed on this device through the BirdCoder skill settings.'

/**
 * Read the suppressed names this Host applies. Malformed entries are dropped
 * rather than failing the catalog: a hand-edited settings document must not be
 * able to break skill discovery, and the registry would reject the candidate
 * anyway.
 * @param settings - the resolved ui-sdkwork-skills section.
 * @returns the well-formed, de-duplicated suppressed names.
 */
function suppressedNames(settings: UiSkillsSettings): readonly string[] {
  const names = settings[DISABLED_SKILLS_FIELD]
  if (!Array.isArray(names)) return []
  const seen = new Set<string>()
  for (const name of names) {
    if (typeof name === 'string' && SKILL_NAME_PATTERN.test(name)) seen.add(name)
  }
  return [...seen]
}

/**
 * Project one suppressed name into a catalog candidate.
 * @param name - the suppressed skill name.
 * @returns the candidate carrying the suppressing invocation policy.
 */
function suppressionCandidate(name: string): SkillCandidate {
  return {
    name,
    description: SUPPRESSION_DESCRIPTION,
    invocation: SUPPRESSED,
    source: 'runtime',
    provider: SUPPRESSION_PROVIDER,
    rank: SUPPRESSION_RANK,
    locator: name,
  }
}

/**
 * Load a suppression candidate's body. Nothing is expected to call this — the
 * policy hides the name from every loader — but the registry contract requires
 * a definition, and a body stating why is more useful than an empty one in the
 * transcript of anyone who finds one.
 * @param name - the suppressed skill name from the candidate.
 * @returns the suppression definition.
 */
function suppressionDefinition(name: string): SkillDefinition {
  return {
    ...suppressionCandidate(name),
    content: SUPPRESSION_CONTENT,
  }
}

/**
 * Register the durable skill-manager section and the suppression provider.
 * The section is registered whether or not a skill registry is composed, so a
 * deployment without `dsh-skill` still reads and writes the preference.
 * @param ctx - Host context that may acquire the settings and skills services.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(
      settingsNamespace(UI_SKILLS_NAMESPACE),
      UiSkillsSettingsSchema,
    )
    settingsCtx.inject(['skills'], (skillCtx) => {
      let control: SkillProviderControl | undefined
      settingsCtx.effect(
        () => skillCtx.skills.registerProvider((registration) => {
          control = registration
          return {
            name: SUPPRESSION_PROVIDER,
            // Read per call rather than cached in the closure: the registry's
            // catalog cache is what needs invalidating, and a fresh read here
            // means an invalidation can never publish a stale suppression set.
            list: () => Promise.resolve(
              suppressedNames(scope.get()).map(name => suppressionCandidate(name)),
            ),
            get: candidate => Promise.resolve(suppressionDefinition(candidate.name)),
          }
        }),
        'ui-sdkwork-skills: skill suppression provider',
      )
      // A settings commit changes which names are suppressed; the provider's
      // own catalog cache has to be dropped for the next read to see it.
      settingsCtx.effect(
        () => scope.watch(() => { control?.invalidate() }),
        'ui-sdkwork-skills: suppression invalidation',
      )
    })
  })
}
