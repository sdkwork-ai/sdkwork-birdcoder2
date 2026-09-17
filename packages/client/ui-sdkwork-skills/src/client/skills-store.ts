/**
 * Skills-section state: the store the Skills settings page renders from.
 *
 * Three facts live here and they have different owners. The catalog is fetched
 * by the plugin for the current session and replaced whole on every session
 * change or explicit reload. The preferences are the projection of the
 * `ui-sdkwork-skills` scope snapshot, so the switches render the durable value
 * rather than a local guess — a write that the Host refuses shows up as the
 * switch snapping back. `pending` is the only piece of optimism left: it marks
 * the names whose write is in flight so a second click cannot race the first.
 *
 * `pending` and `disabled` are name lists, not sets: store state is shared
 * UI data and stays JSON-compatible.
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** One catalog row the skill manager renders. */
export interface SkillCatalogRow {
  /** Kebab-case skill name, referenced as `/name`. */
  readonly name: string
  /** Short routing description, verbatim from the skill's own metadata. */
  readonly description: string
  /** Optional extra routing guidance, verbatim. */
  readonly whenToUse: string | undefined
  /** Whether the model-facing catalog also advertises this skill. */
  readonly modelInvocable: boolean
}

/** Catalog fetch state of the Skills section. */
export type SkillCatalogStatus =
  /** No session yet, so nothing has been asked for. */
  | 'idle'
  /** A fetch is in flight (the first one, or a reload over a previous catalog). */
  | 'loading'
  /** The catalog reflects the current session. */
  | 'ready'
  /** The last fetch failed; `rows` keeps whatever was on screen before it. */
  | 'error'

/** Preferences projection pushed in from the settings scope snapshot. */
export interface SkillsPreferencesView {
  /** Names suppressed from every catalog this Host serves. */
  readonly disabled: readonly string[]
  /** Names hidden from the new-session tag strip. */
  readonly hiddenTags: readonly string[]
  /** Whether the settings document accepts writes. */
  readonly writable: boolean
}

/** Skills-section state. */
export interface SkillsSectionState {
  /** Catalog fetch state. */
  status: SkillCatalogStatus
  /** Current catalog rows, name-sorted. */
  rows: readonly SkillCatalogRow[]
  /** Suppressed names. */
  disabled: readonly string[]
  /** Names hidden from the new-session tag strip. */
  hiddenTags: readonly string[]
  /** Whether the settings document accepts writes. */
  writable: boolean
  /** Names whose preference write is in flight. */
  pending: readonly string[]
}

/** Declared action shape giving the exported factory a stable return type. */
type SkillsSectionActions = {
  /** Enter the catalog-fetch state. */
  catalogLoading: (draft: SkillsSectionState) => void
  /** Publish a freshly fetched catalog. */
  catalogReady: (draft: SkillsSectionState, rows: readonly SkillCatalogRow[]) => void
  /** Mark the last fetch failed, keeping the rows already on screen. */
  catalogFailed: (draft: SkillsSectionState) => void
  /** Return to the no-session state. */
  catalogIdle: (draft: SkillsSectionState) => void
  /** Publish a preferences projection. */
  preferences: (draft: SkillsSectionState, next: SkillsPreferencesView) => void
  /** Replace the in-flight write set. */
  pending: (draft: SkillsSectionState, names: readonly string[]) => void
}

/**
 * Declares the Skills-section state and its mutation surface.
 * @returns the store handle.
 */
export function createSkillsSectionStore(): EngineStoreHandle<SkillsSectionState, SkillsSectionActions> {
  return defineStore({
    init: (): SkillsSectionState => ({
      status: 'idle',
      rows: [],
      disabled: [],
      hiddenTags: [],
      writable: false,
      pending: [],
    }),
    actions: {
      catalogLoading: (draft) => { draft.status = 'loading' },
      catalogReady: (draft, rows) => {
        draft.status = 'ready'
        draft.rows = rows
      },
      catalogFailed: (draft) => { draft.status = 'error' },
      catalogIdle: (draft) => {
        draft.status = 'idle'
        draft.rows = []
      },
      preferences: (draft, next) => {
        draft.disabled = next.disabled
        draft.hiddenTags = next.hiddenTags
        draft.writable = next.writable
      },
      pending: (draft, names) => { draft.pending = names },
    },
  })
}
