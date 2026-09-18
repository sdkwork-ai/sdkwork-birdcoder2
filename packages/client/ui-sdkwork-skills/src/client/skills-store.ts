/**
 * Skills-section state: the store the Skills settings page renders from.
 *
 * Four facts live here and they have different owners. The catalog is fetched
 * by the plugin — for the current session when there is one, for the whole Host
 * composition when there is not — and replaced whole on every session change or
 * explicit reload. The preferences are the projection of the
 * `ui-sdkwork-skills` scope snapshot, so the switches render the durable value
 * rather than a local guess — a write that the Host refuses shows up as the
 * switch snapping back. `pending` is the only piece of optimism left: it marks
 * the names whose write is in flight so a second click cannot race the first.
 *
 * `status` says which catalog the rows describe and is deliberately separate
 * from "how many rows": a session-less read succeeds with the composition-wide
 * inventory, and the page must be able to say so in words rather than pretend
 * the list is workspace-scoped.
 *
 * `pending`, `disabled`, `hiddenTags`, and `pinnedTags` are name lists, not
 * sets: store state is shared UI data and stays JSON-compatible.
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/**
 * Root class a skill's winning definition came from, as the Host resolved it.
 *
 * Deliberate twin of the Host's `SkillEntrySource`
 * (`packages/api/session-controller/src/types.ts`): this program must not import
 * a Host type, so the closed vocabulary is spelled twice. Adding a class means
 * moving both spellings and the `row.source.*` dictionary pair together — the
 * Host spec's source-mapping case fails first.
 */
export type SkillCatalogSource = 'project' | 'custom' | 'user' | 'bundled' | 'runtime' | 'unknown'

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
  /** Whether the user may invoke the skill by typing its `/name`. */
  readonly userInvocable: boolean
  /** Root class the winning definition came from. */
  readonly source: SkillCatalogSource
  /** Provider that supplied the winning definition. */
  readonly provider: string
}

/**
 * Catalog status of the Skills section.
 *
 * `idle` is the cold start: nothing asked for yet, and nothing on screen.
 * `global` is a successful composition-wide read — the Host answered without a
 * workspace, so the rows cover the roots that do not depend on one.
 */
export type SkillCatalogStatus =
  /** No fetch has run yet. */
  | 'idle'
  /** A fetch is in flight (the first one, or a reload over a previous catalog). */
  | 'loading'
  /** The catalog reflects the current session. */
  | 'ready'
  /** The catalog is the composition-wide inventory because no session is open. */
  | 'global'
  /** The last fetch failed; `rows` keeps whatever was on screen before it. */
  | 'error'

/** Preferences projection pushed in from the settings scope snapshot. */
export interface SkillsPreferencesView {
  /** Names suppressed from every catalog this Host serves. */
  readonly disabled: readonly string[]
  /** Names hidden from the new-session tag strip. */
  readonly hiddenTags: readonly string[]
  /** Names explicitly added to the new-session tag strip. */
  readonly pinnedTags: readonly string[]
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
  /** Names added to the new-session tag strip. */
  pinnedTags: readonly string[]
  /** Whether the settings document accepts writes. */
  writable: boolean
  /** Names whose preference write is in flight. */
  pending: readonly string[]
}

/** Declared action shape giving the exported factory a stable return type. */
type SkillsSectionActions = {
  /** Enter the catalog-fetch state. */
  catalogLoading: (draft: SkillsSectionState) => void
  /** Publish a freshly fetched session catalog. */
  catalogReady: (draft: SkillsSectionState, rows: readonly SkillCatalogRow[]) => void
  /** Publish the composition-wide catalog served without a session. */
  catalogGlobal: (draft: SkillsSectionState, rows: readonly SkillCatalogRow[]) => void
  /** Mark the last fetch failed, keeping the rows already on screen. */
  catalogFailed: (draft: SkillsSectionState) => void
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
      pinnedTags: [],
      writable: false,
      pending: [],
    }),
    actions: {
      catalogLoading: (draft) => { draft.status = 'loading' },
      catalogReady: (draft, rows) => {
        draft.status = 'ready'
        draft.rows = rows
      },
      catalogGlobal: (draft, rows) => {
        draft.status = 'global'
        draft.rows = rows
      },
      catalogFailed: (draft) => { draft.status = 'error' },
      preferences: (draft, next) => {
        draft.disabled = next.disabled
        draft.hiddenTags = next.hiddenTags
        draft.pinnedTags = next.pinnedTags
        draft.writable = next.writable
      },
      pending: (draft, names) => { draft.pending = names },
    },
  })
}
