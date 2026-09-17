/**
 * Skill-manager plugin, browser half: owns the Skills settings page.
 *
 * The page is a `settings.section` contribution, so it appears as one more row
 * in the settings nav rail and the shell needs no knowledge of it. It renders
 * three things that have three different owners:
 *
 * - **The catalog** — `skills/list` for the current session, refetched when the
 *   session changes, when an agent preset is selected (a preset decides which
 *   skill providers an agent reads, so the previous catalog belongs to a
 *   composition that is no longer running), on reconnect, and on the page's own
 *   reload action. There is no session-less path: the Host resolves the catalog
 *   from the session's project root, so the page states the dependency instead
 *   of inventing a cwd.
 * - **The preferences** — the `ui-sdkwork-skills` scope, mirrored into the
 *   section store and published cross-plugin through `ctx.skillPreferences`.
 *   The Host turns `disabledSkills` into real catalog suppression; this half
 *   only records the choice.
 * - **The section store** — declared here and handed to the renderer at
 *   registration, because the page is not the only thing that changes it: the
 *   session follower writes the catalog, the scope mirror writes the
 *   preferences, and the page writes only through its `inject` callbacks.
 *
 * Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the ctx.remote merge (skills namespace + the forwarded
// preset event) and the fixed Host facts.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls ctx.sessions and the list snapshot shape.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings.section slot declaration and the ctx.settingsScope merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SkillsSection } from './SkillsSection.tsx'
import type { SkillsSectionInjected } from './SkillsSection.tsx'
import { createSkillsSectionStore, type SkillCatalogRow } from './skills-store.ts'
import { SkillPreferencesService } from './skill-preferences.ts'
import { en, zh } from './locales.ts'
import {
  DISABLED_SKILLS_FIELD, HIDDEN_SCENE_TAGS_FIELD, UI_SKILLS_NAMESPACE, type UiSkillsSettings,
} from '../skills-settings.ts'

export type {
  SkillsSectionInjected, SkillsSectionProps,
} from './SkillsSection.tsx'
export type {
  SkillCatalogRow, SkillCatalogStatus, SkillsPreferencesView, SkillsSectionState,
} from './skills-store.ts'
export type { SkillPreferences, SkillPreferencesSnapshot } from './skill-preferences.ts'
export type { SkillsKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'sdkworkSkills'

/** Services this plugin consumes: slot/locale registries, transport, and settings. */
export const inject = ['slots', 'locale', 'remote', 'remote.skills', 'settingsScope', 'sessions']

/**
 * Sort key: catalog order is the user's reading order, and the registry's own
 * order follows provider merge order, which says nothing to a reader.
 * @param left - first row.
 * @param right - second row.
 * @returns the comparison.
 */
function byName(left: SkillCatalogRow, right: SkillCatalogRow): number {
  if (left.name === right.name) return 0
  return left.name < right.name ? -1 : 1
}

/**
 * Project the wire catalog into rows.
 * @param skills - the `skills/list` value.
 * @returns name-sorted rows.
 */
function toRows(skills: readonly SkillEntry[]): readonly SkillCatalogRow[] {
  return skills
    .map(skill => ({
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      modelInvocable: skill.modelInvocable,
    }))
    .sort(byName)
}

/**
 * Register the Skills section, its store, and the cross-plugin preference
 * service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-skills: dictionaries')

  const scope = ctx.settingsScope.bind<UiSkillsSettings>({ namespace: UI_SKILLS_NAMESPACE })
  const preferences = new SkillPreferencesService(ctx, scope)
  ctx.effect(() => () => { preferences.dispose() }, 'ui-sdkwork-skills: preference service')

  const store = createSkillsSectionStore()
  // Bound once the renderer mounts the page; every writer below tolerates the
  // page being closed (the store simply carries no listeners yet).
  let actions: BoundActions<typeof store> | undefined
  let session: SessionId | undefined
  // Fetch generation: a superseded catalog must never publish over a newer one.
  let generation = 0

  const project = (): void => {
    const snapshot = scope.getSnapshot()
    const value = snapshot.status === 'ready' ? snapshot.value : undefined
    actions?.preferences({
      disabled: value?.[DISABLED_SKILLS_FIELD] ?? [],
      hiddenTags: value?.[HIDDEN_SCENE_TAGS_FIELD] ?? [],
      writable: snapshot.status === 'ready' && snapshot.writable,
    })
  }
  ctx.effect(() => scope.subscribe(project), 'ui-sdkwork-skills: preference mirror')

  const load = async (sessionId: SessionId): Promise<void> => {
    const mine = ++generation
    actions?.catalogLoading()
    try {
      const result = await ctx.remote.skills.list({ sessionId })
      if (mine !== generation) return
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      actions?.catalogReady(toRows(result.value.skills))
    } catch (error) {
      if (mine !== generation) return
      console.error('[ui-sdkwork-skills] skill catalog fetch failed:', error)
      actions?.catalogFailed()
    }
  }

  const syncSession = (): void => {
    const current = ctx.sessions.list.getSnapshot().current
    if (current === session) return
    session = current
    if (current === undefined) {
      generation += 1
      actions?.catalogIdle()
      return
    }
    void load(current)
  }

  ctx.effect(
    () => ctx.sessions.list.subscribe(syncSession),
    'ui-sdkwork-skills: session catalog follow',
  )

  ctx.effect(() => ctx.remote.$on('agent-preset/selected', (sessionId) => {
    // The preset switch leaves the session in place, so `syncSession` sees no
    // change: the same session now reads a different provider set.
    if (sessionId === session) void load(sessionId)
  }), 'ui-sdkwork-skills: preset catalog invalidation')

  ctx.effect(() => ctx.on('connection/reset', () => {
    generation += 1
    session = undefined
    syncSession()
  }), 'ui-sdkwork-skills: reconnect catalog reload')

  /**
   * Add or remove one name from one preference list, preserving the durable
   * value's sorted order so the stored section stays diffable.
   * @param field - the preference field to write.
   * @param name - the skill name to add or remove.
   * @param present - whether the name should be in the list afterwards.
   */
  const writePreference = async (
    field: string,
    name: string,
    present: boolean,
  ): Promise<void> => {
    const value = scope.getSnapshot().value
    const stored = value === undefined
      ? []
      : (value as unknown as Record<string, unknown>)[field]
    const names = new Set(Array.isArray(stored) ? stored.filter(item => typeof item === 'string') : [])
    if (present) names.add(name)
    else names.delete(name)
    actions?.pending([name])
    try {
      await scope.set(field, [...names].sort())
    } finally {
      actions?.pending([])
    }
  }

  const sectionInjected = (bound: BoundActions<typeof store>): SkillsSectionInjected => {
    actions = bound
    // Re-sync at registration so no snapshot is lost between the apply-world
    // subscriptions above and the first render.
    project()
    syncSession()
    return {
      setEnabled: (name, enabled) => { void writePreference(DISABLED_SKILLS_FIELD, name, !enabled) },
      setTagHidden: (name, hidden) => { void writePreference(HIDDEN_SCENE_TAGS_FIELD, name, hidden) },
      reload: () => {
        if (session !== undefined) void load(session)
      },
    }
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    // Between Models (10) and Plugins (15): skills are what the agent can do,
    // which reads as a sibling of models rather than of the plugin inventory.
    id: 'skills',
    order: 12,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    store,
    inject: sectionInjected,
  }, SkillsSection))
}
