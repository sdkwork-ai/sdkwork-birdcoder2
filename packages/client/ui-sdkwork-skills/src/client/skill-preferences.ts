/**
 * The skill-manager preferences as a Cordis service — the only way another
 * feature plugin may read them.
 *
 * The client bundle purity gate forbids a cross-plugin value import, so the
 * durable section itself is not shared; its *projection* is. A consumer
 * injects `skillPreferences`, reads {@link SkillPreferences.getSnapshot}, and
 * subscribes for changes; it never learns the namespace, the field names, or
 * whether the backend is a Host document or a process-local fallback. That is
 * deliberately less than the settings scope offers — a consumer has no
 * business writing another feature's preference, and the settings page is the
 * only writer.
 *
 * The snapshot reference is stable between changes (the uSES contract), and
 * the three fields are name lists rather than sets so the shared value stays
 * JSON-compatible.
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DISABLED_SKILLS_FIELD, HIDDEN_SCENE_TAGS_FIELD, type UiSkillsSettings,
} from '../skills-settings.ts'

/** Reactive view of the skill-manager preferences. */
export interface SkillPreferencesSnapshot {
  /** Names suppressed from every catalog this Host serves. */
  readonly disabled: readonly string[]
  /** Names kept out of the new-session tag strip while staying available. */
  readonly hiddenTags: readonly string[]
  /** Whether the settings document accepts writes. */
  readonly writable: boolean
}

/**
 * Cross-plugin read face of the skill-manager preferences. Injected as
 * `ctx.skillPreferences`; a plugin that may not be composed alongside this one
 * reaches it through `ctx.get('skillPreferences')` and tolerates `undefined`.
 */
export interface SkillPreferences {
  /** @returns the current view (stable reference until the preference moves). */
  getSnapshot(): SkillPreferencesSnapshot
  /**
   * Observe view replacements.
   * @param listener - invoked after each change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    skillPreferences: SkillPreferences
  }
}

/** The view every consumer reads before the Host answers with a section. */
const NOTHING_PREFERRED: SkillPreferencesSnapshot = Object.freeze({
  disabled: Object.freeze([]),
  hiddenTags: Object.freeze([]),
  writable: false,
})

/**
 * Return whether two name lists carry the same names in the same order.
 * @param left - first list.
 * @param right - second list.
 * @returns whether the lists are interchangeable.
 */
function sameNames(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index])
}

/**
 * Read one field of a resolved section as a name list, tolerating a section
 * whose field is missing (a namespace registered without this package's schema,
 * or a section the Host resolved before the field existed).
 * @param value - the resolved section, or undefined while none stands.
 * @param field - the field to read.
 * @returns the names, or an empty list.
 */
function namesOf(value: UiSkillsSettings | undefined, field: string): readonly string[] {
  const names: unknown = value === undefined ? undefined : (value as unknown as Record<string, unknown>)[field]
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : []
}

/**
 * Projects one settings scope into the cross-plugin view. Constructed by the
 * plugin's own `apply`, so its lifetime is the plugin fiber's.
 */
export class SkillPreferencesService extends Service implements SkillPreferences {
  private view: SkillPreferencesSnapshot = NOTHING_PREFERRED
  private readonly listeners = new Set<() => void>()
  private readonly unwatch: () => void

  /**
   * @param ctx - the providing plugin's context.
   * @param scope - the bound ui-sdkwork-skills settings scope.
   */
  constructor(ctx: Context, scope: SettingsScope<UiSkillsSettings>) {
    super(ctx, 'skillPreferences')
    this.unwatch = scope.subscribe(() => { this.project(scope.getSnapshot()) })
    this.project(scope.getSnapshot())
  }

  /** @returns the current view (stable reference until the preference moves). */
  getSnapshot = (): SkillPreferencesSnapshot => this.view

  /**
   * Observe view replacements.
   * @param listener - invoked after each change.
   * @returns the disposer removing this listener.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Detach from the settings scope and drop every listener. */
  dispose(): void {
    this.unwatch()
    this.listeners.clear()
  }

  private project(snapshot: SettingsScopeSnapshot<UiSkillsSettings>): void {
    const value = snapshot.status === 'ready' ? snapshot.value : undefined
    const disabled = namesOf(value, DISABLED_SKILLS_FIELD)
    const hiddenTags = namesOf(value, HIDDEN_SCENE_TAGS_FIELD)
    const writable = snapshot.status === 'ready' && snapshot.writable
    if (
      writable === this.view.writable
      && sameNames(disabled, this.view.disabled)
      && sameNames(hiddenTags, this.view.hiddenTags)
    ) return
    this.view = Object.freeze({ disabled, hiddenTags, writable })
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch (error) {
        // One faulty consumer must not starve the others; the projection runs
        // on the scope's notification path, where a throw would surface as an
        // unhandled rejection.
        console.error('[ui-sdkwork-skills] preference listener failed:', error)
      }
    }
  }
}
