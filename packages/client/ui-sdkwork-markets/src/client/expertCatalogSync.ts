/**
 * Fetch the SDKWork Agents expert catalog and push it into the built-in expert
 * market's Host overlay.
 *
 * The market page owns the SDKWork gateway binding (environment + IAM session +
 * generated App SDK client), while the expert market plugin owns the roster and
 * the model-facing tools. This module is the glue: it reads the catalog through
 * the generated `@sdkwork/agents-app-sdk` client and calls the plugin's
 * `agencyAgents` Remote methods (`syncSdkworkCatalog`, `syncSdkworkPersonas`).
 *
 * Failure is non-fatal by design: the caller logs it and the plugin keeps its
 * bundled roster as the offline fallback.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/expertCatalogSync
 */

/** One page response of the generated App SDK list methods. */
export interface ExpertCatalogPage<T> {
  items: T[]
  pageInfo?: { hasMore?: boolean; totalItems?: string }
}

/** The generated App SDK slice this module reads. */
export interface ExpertCatalogSdkClient {
  ai: {
    experts: {
      divisions: { list(params?: { page?: number; pageSize?: number }): Promise<ExpertCatalogPage<ExpertCatalogDivision>> }
      list(params?: { page?: number; pageSize?: number }): Promise<ExpertCatalogPage<ExpertCatalogExpert>>
    }
    expertTeams: {
      list(params?: { page?: number; pageSize?: number; locale?: ExpertCatalogLocale }): Promise<ExpertCatalogPage<ExpertCatalogTeam>>
    }
    expertPersonas: {
      list(params?: { page?: number; pageSize?: number; locale?: ExpertCatalogLocale }): Promise<ExpertCatalogPage<ExpertCatalogPersona>>
    }
  }
}

export type ExpertCatalogLocale = 'zh-CN' | 'en-US'

/** One expert division as served by the Agents App API. */
export interface ExpertCatalogDivision {
  code: string
  name: string
  sortOrder: number
  expertCount: number
}

/** One expert summary as served by the Agents App API. */
export interface ExpertCatalogExpert {
  slug: string
  agentId: string
  name: string
  description: string
  emoji: string
  divisionCode: string
  tags: string[]
}

/** One expert team as served by the Agents App API (already localized). */
export interface ExpertCatalogTeam {
  teamId: string
  name: string
  description: string
  tags: string[]
  goal: string
  /** The team's shared constraints; the catalog authors them in one language. */
  constraints: string
  deliveryRequirements: string
  examples: string[]
  coordinatorMode: 'template' | 'custom'
  coordinatorTemplateId: 'general' | 'product' | 'technical' | 'content' | 'data' | 'research'
  /** A custom coordinator's prompt; empty for a template coordinator. */
  coordinatorPrompt: string
  locale: ExpertCatalogLocale
  members: { expertSlug: string; expertAgentId: string; duty: string; instructions: string }[]
}

/** One expert persona row as served by the Agents App API. */
export interface ExpertCatalogPersona {
  expertSlug: string
  agentId: string
  locale: ExpertCatalogLocale
  persona: string
  contentSha256: string
}

/** The expert summary shape the plugin's overlay accepts. */
export interface ExpertCatalogSyncExpert {
  slug: string
  name: string
  nameEn: string
  description: string
  descriptionEn: string
  emoji: string
  division: string
  divisionZh: string
  custom: boolean
}

/** The team shape the plugin's overlay accepts (one display language). */
export interface ExpertCatalogSyncTeam {
  id: string
  name: string
  description: string
  tags: string[]
  goal: string
  constraints: string
  deliveryRequirements: string
  members: { expertSlug: string; duty: string; instructions: string }[]
  examples: string[]
  coordinatorMode: 'template' | 'custom'
  coordinatorTemplateId: 'general' | 'product' | 'technical' | 'content' | 'data' | 'research'
  coordinatorTemplateVersion: 1
  coordinatorPrompt: string
}

/** The plugin's `agencyAgents` Remote surface this module calls. */
export interface ExpertCatalogSyncRemote {
  syncSdkworkCatalog(payload: {
    experts: ExpertCatalogSyncExpert[]
    teams: ExpertCatalogSyncTeam[]
  }): Promise<{ ok: true; value: { experts: number; teams: number } } | { ok: false; error: { message: string } }>
  syncSdkworkPersonas(payload: {
    locale: ExpertCatalogLocale
    personas: { slug: string; text: string }[]
  }): Promise<{ ok: true; value: { count: number } } | { ok: false; error: { message: string } }>
}

/** What one successful sync delivered. */
export interface ExpertCatalogSyncSummary {
  experts: number
  teams: number
  personas: number
}

const DEFAULT_PAGE_SIZE = 200
const MAX_PAGES = 50

/**
 * Read every page of one list method.
 * @param fetchPage - the generated list method.
 * @param pageSize - page size to request.
 * @returns the concatenated items.
 */
async function readAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<ExpertCatalogPage<T>>,
  pageSize: number,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetchPage(page, pageSize)
    const batch = response.items ?? []
    items.push(...batch)
    if (batch.length < pageSize) break
  }
  return items
}

/** Unwrap a Remote result or throw its error. */
function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/**
 * Read the expert catalog from SDKWork Agents and push it into the plugin.
 * @param options - the App SDK client, the plugin Remote, and the sync locale.
 * @returns the delivered counts.
 */
export async function syncExpertCatalogFromSdkworkAgents(options: {
  client: ExpertCatalogSdkClient
  remote: ExpertCatalogSyncRemote
  locale: ExpertCatalogLocale
  pageSize?: number
}): Promise<ExpertCatalogSyncSummary> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const { client, remote } = options

  const divisions = await readAllPages(page => client.ai.experts.divisions.list({ page, pageSize }), pageSize)
  const divisionName = new Map(divisions.map(division => [division.code, division.name]))
  const experts = await readAllPages(page => client.ai.experts.list({ page, pageSize }), pageSize)
  const teams = await readAllPages(
    page => client.ai.expertTeams.list({ page, pageSize, locale: options.locale }),
    pageSize,
  )
  const personasZh = await readAllPages(
    page => client.ai.expertPersonas.list({ page, pageSize, locale: 'zh-CN' }),
    pageSize,
  )
  const personasEn = await readAllPages(
    page => client.ai.expertPersonas.list({ page, pageSize, locale: 'en-US' }),
    pageSize,
  )

  const syncExperts: ExpertCatalogSyncExpert[] = experts.map(expert => ({
    slug: expert.slug,
    name: expert.name,
    // The managed-agent display column is seeded for one locale, so the
    // second display field mirrors it rather than inventing a translation.
    nameEn: expert.name,
    description: expert.description,
    descriptionEn: expert.description,
    emoji: expert.emoji,
    division: expert.divisionCode,
    divisionZh: divisionName.get(expert.divisionCode) ?? expert.divisionCode,
    custom: false,
  }))

  const syncTeams: ExpertCatalogSyncTeam[] = teams.map(team => ({
    id: team.teamId,
    name: team.name,
    description: team.description,
    tags: team.tags,
    goal: team.goal,
    constraints: team.constraints,
    deliveryRequirements: team.deliveryRequirements,
    members: team.members.map(member => ({
      expertSlug: member.expertSlug,
      duty: member.duty,
      instructions: member.instructions,
    })),
    examples: team.examples,
    coordinatorMode: team.coordinatorMode,
    coordinatorTemplateId: team.coordinatorTemplateId,
    coordinatorTemplateVersion: 1,
    // A template coordinator's text comes from the package's own template; a
    // custom one carries the catalog's prompt.
    coordinatorPrompt: team.coordinatorPrompt,
  }))

  const delivered = await remote.syncSdkworkCatalog({ experts: syncExperts, teams: syncTeams })
  unwrap(delivered)

  let personas = 0
  for (const [locale, rows] of [['zh-CN', personasZh], ['en-US', personasEn]] as const) {
    if (rows.length === 0) continue
    const result = await remote.syncSdkworkPersonas({
      locale,
      personas: rows
        .filter(row => row.expertSlug !== '' && row.persona.trim() !== '')
        .map(row => ({ slug: row.expertSlug, text: row.persona })),
    })
    personas += unwrap(result).count
  }

  return { experts: syncExperts.length, teams: syncTeams.length, personas }
}
