/**
 * Host-side SDKWork catalog overlay.
 *
 * The expert data plane (331 experts, 22 divisions, 5 teams, per-locale
 * personas) is authored in `sdkwork-specs` and served by `sdkwork-agents`. The
 * DSH host cannot authenticate to that App API on its own, so the browser half
 * (through the market page's SDKWork gateway binding) fetches the catalog and
 * pushes it here over the `agencyAgents` Remote namespace. This module owns
 * that overlay:
 *
 * - an ingested expert list replaces the bundled roster for the library and the
 *   model-facing tools;
 * - ingested teams replace the bundled built-in teams;
 * - ingested personas take precedence over the bundled persona assets;
 * - when nothing has been ingested, every reader falls back to the bundled
 *   assets, so a deployment without the Agents service keeps working.
 *
 * The overlay is process-local state owned by this plugin instance (no module
 * singleton); it is cleared when the plugin unloads and re-ingested when the
 * browser half reconnects.
 */
import type { ExpertSummary } from './expert-contract.js'
import { expertSummarySchema } from './expert-contract.js'
import { teamInputSchema, teamSchema, type ExpertTeam, type TeamInput } from './team-contract.js'

/** Service key the overlay is published under for the Remote host service. */
export const SDKWORK_CATALOG_SYNC_SERVICE = 'agencySdkworkCatalogSync'

/** One team as delivered by the browser half (the team id is required). */
export type SdkworkTeamInput = TeamInput & { readonly id: string }

/** One persona body as delivered by the browser half. */
export interface SdkworkPersonaInput {
  readonly slug: string
  readonly text: string
}

/** The overlay readers and writers the plugin composes. */
export interface SdkworkCatalogSync {
  /** Replace the expert overlay; returns the accepted count. */
  ingestExperts(experts: readonly ExpertSummary[]): number
  /** Replace the team overlay; returns the accepted count. */
  ingestTeams(teams: readonly SdkworkTeamInput[]): number
  /** Replace one locale's persona overlay; returns the accepted count. */
  ingestPersonas(locale: string, personas: readonly SdkworkPersonaInput[]): number
  /** The ingested experts, or an empty list when none were ingested. */
  experts(): ExpertSummary[]
  /** The ingested teams, or an empty list when none were ingested. */
  teams(): ExpertTeam[]
  /** The ingested persona for a slug and locale (zh-CN fallback), if any. */
  persona(slug: string, locale: string): string | undefined
  /** How many experts, teams and persona bodies the overlay currently holds. */
  stats(): { experts: number; teams: number; personas: number }
}

/** Normalize a plugin locale id (`zh`, `zh-CN`, `en`, `en-US`) to a persona locale. */
function personaKey(locale: string): string {
  return locale.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

/**
 * Create one plugin instance's catalog overlay.
 * @returns the overlay readers and writers.
 */
export function createSdkworkCatalogSync(): SdkworkCatalogSync {
  let experts: ExpertSummary[] = []
  let teams: ExpertTeam[] = []
  const personas = new Map<string, Map<string, string>>()

  return {
    ingestExperts(next) {
      const parsed = expertSummarySchema.array().parse([...next])
      experts = parsed
      return parsed.length
    },
    ingestTeams(next) {
      const parsed = next.map((input) => {
        if (typeof input.id !== 'string' || input.id.trim() === '') {
          throw new Error('SDKWork expert team is missing its id')
        }
        return teamSchema.parse({
          ...teamInputSchema.parse(input),
          id: input.id,
          builtin: true,
        })
      })
      teams = parsed
      return parsed.length
    },
    ingestPersonas(locale, next) {
      const key = personaKey(locale)
      const bucket = new Map<string, string>()
      for (const persona of next) {
        if (persona.slug.trim() === '' || persona.text.trim() === '') continue
        bucket.set(persona.slug, persona.text)
      }
      personas.set(key, bucket)
      return bucket.size
    },
    experts() {
      return [...experts]
    },
    teams() {
      return [...teams]
    },
    persona(slug, locale) {
      const key = personaKey(locale)
      return personas.get(key)?.get(slug)
        ?? personas.get(key === 'en-US' ? 'zh-CN' : 'en-US')?.get(slug)
    },
    stats() {
      let count = 0
      for (const bucket of personas.values()) count += bucket.size
      return { experts: experts.length, teams: teams.length, personas: count }
    },
  }
}
