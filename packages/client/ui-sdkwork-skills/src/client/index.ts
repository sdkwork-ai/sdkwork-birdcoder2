/**
 * Skill-manager plugin, browser half: owns the Skills settings page.
 *
 * The page is a `settings.section` contribution, so it appears as one more row
 * in the settings nav rail and the shell needs no knowledge of it. It renders
 * four things that have four different owners:
 *
 * - **The catalog** — `skills/list` for the current session. A session decides
 *   which project roots are in scope, so the catalog is refetched when the
 *   session changes, when an agent preset is selected (a preset decides which
 *   skill providers an agent reads, so the previous catalog belongs to a
 *   composition that is no longer running), and on reconnect and explicit
 *   reload. With no session open the page asks for the *composition-wide*
 *   catalog instead (`scope: 'all'`), which lists every root the Host mounts
 *   that does not depend on a workspace — the inventory a reader wants before
 *   picking one. The page is then usable from a cold start; it never invents a
 *   cwd.
 * - **The preferences** — the `ui-sdkwork-skills` scope, mirrored into the
 *   section store and published cross-plugin through `ctx.skillPreferences`.
 *   The Host turns `disabledSkills` into real catalog suppression; the two
 *   strip lists choose which skills the suggestion row offers, and the
 *   `showSceneTags` master switch decides whether that row renders at all.
 *   This half only records the choices; the consumer half renders them.
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
// Type-only: pulls ctx.sessions and the list snapshot shape.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings.section slot declaration and the ctx.configForms merge.
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
  DISABLED_SKILLS_FIELD, HIDDEN_SCENE_TAGS_FIELD, PINNED_SCENE_TAGS_FIELD, SHOW_SCENE_TAGS_FIELD,
  UI_SKILLS_NAMESPACE, type UiSkillsSettings,
} from '../skills-settings.ts'

export type {
  SkillsSectionInjected, SkillsSectionProps,
} from './SkillsSection.tsx'
export type {
  SkillCatalogRow, SkillCatalogSource, SkillCatalogStatus, SkillsPreferencesView, SkillsSectionState,
} from './skills-store.ts'
export type { SkillPreferences, SkillPreferencesSnapshot } from './skill-preferences.ts'
export type { SkillsKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'sdkworkSkills'

/** Services this plugin consumes: slot/locale registries, transport, and settings. */
export const inject = ['slots', 'locale', 'remote', 'remote.skills', 'configForms', 'sessions']

/**
 * Sort key: catalog order is the user's reading order, and the registry's own
 * order follows provider merge order, which says nothing to a reader. Bundled
 * product skills lead, because they are the ones a scene strip can offer; the
 * rest follow by root class, then by name.
 * @param left - first row.
 * @param right - second row.
 * @returns the comparison.
 */
const SOURCE_ORDER: Readonly<Record<SkillCatalogRow['source'], number>> = {
  bundled: 0,
  custom: 1,
  project: 2,
  user: 3,
  runtime: 4,
  unknown: 5,
}

function byReadingOrder(left: SkillCatalogRow, right: SkillCatalogRow): number {
  const bySource = SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source]
  if (bySource !== 0) return bySource
  if (left.name === right.name) return 0
  return left.name < right.name ? -1 : 1
}

/**
 * Project the wire catalog into rows.
 * @param skills - the `skills/list` value.
 * @returns rows in reading order.
 */
function toRows(skills: readonly SkillEntry[]): readonly SkillCatalogRow[] {
  return skills
    .map(skill => ({
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      modelInvocable: skill.modelInvocable,
      userInvocable: skill.userInvocable,
      source: skill.source,
      provider: skill.provider,
    }))
    .sort(byReadingOrder)
}

/**
 * Register the Skills section, its store, and the cross-plugin preference
 * service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-skills: dictionaries')

  const scope = ctx.configForms.get<UiSkillsSettings>(UI_SKILLS_NAMESPACE)
  const preferences = new SkillPreferencesService(ctx, scope)
  ctx.effect(() => () => { preferences.dispose() }, 'ui-sdkwork-skills: preference service')

  const store = createSkillsSectionStore()
  // Bound once the renderer mounts the page; every writer below tolerates the
  // page being closed (the store simply carries no listeners yet).
  let actions: BoundActions<typeof store> | undefined
  let session: SessionId | undefined
  // Whether a catalog read has ever been started; the cold-start read happens
  // even when it answers for "no session" (see `syncSession`).
  let synced = false
  // Fetch generation: a superseded catalog must never publish over a newer one.
  let generation = 0

  const project = (): void => {
    const snapshot = scope.getSnapshot()
    const value = snapshot.status === 'ready' ? snapshot.value : undefined
    // A hand-edited document can carry any value at this field; the strip's
    // shipped default is on, so a non-boolean degrades instead of hiding the row.
    const flag = value?.[SHOW_SCENE_TAGS_FIELD]
    actions?.preferences({
      disabled: value?.[DISABLED_SKILLS_FIELD] ?? [],
      hiddenTags: value?.[HIDDEN_SCENE_TAGS_FIELD] ?? [],
      pinnedTags: value?.[PINNED_SCENE_TAGS_FIELD] ?? [],
      showSceneTags: typeof flag === 'boolean' ? flag : true,
      writable: snapshot.status === 'ready' && snapshot.writable,
    })
  }
  ctx.effect(() => scope.subscribe(project), 'ui-sdkwork-skills: preference mirror')

  /**
   * Fetch the catalog the page should show. With a session the Host resolves
   * the project roots; without one it resolves the composition-wide inventory,
   * so a cold start still lists every root the Host mounts.
   * @param sessionId - the current session, or undefined for the global read.
   */
  const load = async (sessionId: SessionId | undefined): Promise<void> => {
    const mine = ++generation
    actions?.catalogLoading()
    try {
      const result = await ctx.remote.skills.list(
        sessionId === undefined ? { scope: 'all' } : { sessionId },
      )
      if (mine !== generation) return
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      const rows = toRows(result.value.skills)
      if (sessionId === undefined) actions?.catalogGlobal(rows)
      else actions?.catalogReady(rows)
    } catch (error) {
      if (mine !== generation) return
      console.error('[ui-sdkwork-skills] skill catalog fetch failed:', error)
      actions?.catalogFailed()
    }
  }

  const syncSession = (force = false): void => {
    const current = ctx.sessions.list.getSnapshot().current
    // The first sync must fetch even when both values are `undefined`: that is
    // the cold-start read of the composition-wide catalog. Treating
    // "undefined === undefined" as "nothing changed" left the page on its idle
    // notice until the reader pressed reload or a session appeared.
    if (!force && synced && current === session) return
    synced = true
    session = current
    // A session switch changes which roots are in scope; dropping the rows for
    // the new read's duration would blank the page, so the store keeps them and
    // the status says a fetch is in flight.
    void load(current)
  }

  ctx.effect(
    () => ctx.sessions.list.subscribe(() => { syncSession() }),
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
    // The reset drops the session, so the next read is a fresh cold-start read
    // even when no session comes back.
    syncSession(true)
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

  /**
   * Apply one strip-visibility choice. The two strip fields express opposite
   * directions, so a single switch writes whichever one matches the name's
   * default: a scene-table name is shown unless hidden, anything else is hidden
   * unless pinned. Writing the matching field is also what keeps the stored
   * section free of dead entries — turning a scene-table skill back on clears
   * its `hiddenSceneTags` row instead of adding a redundant pin.
   * @param name - the skill name.
   * @param shown - whether the pill should appear in the strip.
   * @param sceneDefault - whether the staged scene's own table already places the name.
   */
  const writeSuggested = async (
    name: string,
    shown: boolean,
    sceneDefault: boolean,
  ): Promise<void> => {
    if (shown === sceneDefault) {
      // Back to the built-in default: whichever list holds the name must drop it.
      await writePreference(HIDDEN_SCENE_TAGS_FIELD, name, false)
      await writePreference(PINNED_SCENE_TAGS_FIELD, name, false)
      return
    }
    await writePreference(shown ? PINNED_SCENE_TAGS_FIELD : HIDDEN_SCENE_TAGS_FIELD, name, true)
  }

  /**
   * Write the strip's master switch. The per-skill lists are deliberately left
   * untouched: the switch decides whether the strip renders, not which skills
   * it would show, so turning it back on returns the exact row the user had.
   * @param show - whether the new-session tag strip should render.
   */
  const writeShowSceneTags = async (show: boolean): Promise<void> => {
    actions?.showSceneTagsPending(true)
    try {
      await scope.set(SHOW_SCENE_TAGS_FIELD, show)
    } finally {
      actions?.showSceneTagsPending(false)
    }
  }

  const sectionInjected = (bound: BoundActions<typeof store>): SkillsSectionInjected => {
    actions = bound
    // Re-sync at registration so no snapshot is lost between the apply-world
    // subscriptions above and the first render. This is a forced read: the page
    // must show the composition-wide catalog even when no session is open.
    project()
    syncSession(true)
    return {
      setEnabled: (name, enabled) => { void writePreference(DISABLED_SKILLS_FIELD, name, !enabled) },
      setSuggested: (name, shown, sceneDefault) => { void writeSuggested(name, shown, sceneDefault) },
      setShowSceneTags: (show) => { void writeShowSceneTags(show) },
      reload: () => { void load(session) },
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
