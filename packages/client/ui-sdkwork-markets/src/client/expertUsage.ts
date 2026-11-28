/**
 * The two "use this expert / team" actions the cloud expert catalog offers.
 *
 * The catalog page reads the expert roster from the SDKWork Agents App API, but
 * summoning is the built-in expert package's job: an expert must be enabled in
 * that package's own settings before a `@name` mention resolves, and a team
 * must be enabled before `summon_expert_team` knows it. These helpers turn one
 * card click into that enable step plus the mention text the package's
 * composer reference uses, so a conversation started from the market reads
 * exactly like one started from the composer's `@` picker.
 *
 * The Remote result envelope is the plugin's (`{ ok, value } | { ok, error }`);
 * a refusal is reported to the caller as `enabled: false` rather than thrown,
 * because failing to enable must never stop the conversation from starting.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/expertUsage
 */

/**
 * The built-in expert package's `main` panel key. The market page suppresses
 * that panel's sidebar row because the Experts tab is the expert navigation
 * entry; the key is the only string these two packages share, and the bundle
 * acceptance test pins it against both rows.
 */
export const EXPERT_LIBRARY_PANEL_ID = 'agency-agents'

/** The Remote call envelope the `agencyAgents` service answers with. */export interface ExpertRemoteResult<T> {
  ok: boolean
  value?: T
  error?: { message?: string }
}

/** One expert team's enablement row as the package reports it. */
export interface ExpertTeamEnablement {
  teams: readonly { id: string }[]
  enabledTeams: readonly string[]
  revision: number
}

/** The `agencyAgents` Remote slice these actions call. */
export interface AgencyExpertsRemote {
  getEnabled(): Promise<ExpertRemoteResult<{ enabled: string[]; revision: number }>>
  setEnabled(enabled: string[], expectedRevision: number): Promise<ExpertRemoteResult<{ enabled: string[]; revision: number }>>
  getTeams?(): Promise<ExpertRemoteResult<ExpertTeamEnablement>>
  setTeamEnabled?(id: string, enabled: boolean, expectedRevision: number): Promise<ExpertRemoteResult<ExpertTeamEnablement>>
}

/** Unwrap one Remote result, or undefined when the plugin refused the call. */
function valueOf<T>(result: ExpertRemoteResult<T> | undefined): T | undefined {
  if (result === undefined || result.ok !== true) return undefined
  return result.value
}

/**
 * Enable one expert in the built-in expert package.
 * @param remote - the `agencyAgents` Remote face.
 * @param slug - the catalog expert's stable slug.
 * @returns whether the expert is enabled afterwards.
 */
export async function enableExpert(remote: AgencyExpertsRemote, slug: string): Promise<boolean> {
  const current = valueOf(await remote.getEnabled())
  if (current === undefined) return false
  if (current.enabled.includes(slug)) return true
  const next = valueOf(await remote.setEnabled([...current.enabled, slug], current.revision))
  return next?.enabled.includes(slug) ?? false
}

/**
 * Enable one expert team in the built-in expert package.
 * @param remote - the `agencyAgents` Remote face.
 * @param teamId - the catalog team's stable id.
 * @returns whether the team is enabled afterwards, or undefined when the
 *   deployment's package predates the team-enable call.
 */
export async function enableTeam(
  remote: AgencyExpertsRemote,
  teamId: string,
): Promise<boolean | undefined> {
  if (remote.getTeams === undefined || remote.setTeamEnabled === undefined) return undefined
  const current = valueOf(await remote.getTeams())
  if (current === undefined) return undefined
  if (current.enabledTeams.includes(teamId)) return true
  const next = valueOf(await remote.setTeamEnabled(teamId, true, current.revision))
  return next?.enabledTeams.includes(teamId)
}

/**
 * The mention text for one expert team, matching the package's own reference
 * format (`@专家团：<name>` plus a no-break space so adjacent chips do not
 * collapse).
 * @param name - the team's display name.
 * @returns the mention a conversation starts with.
 */
export function teamMention(name: string): string {
  return `@专家团：${name.trim()}\u00A0`
}

/**
 * The mention text for one expert.
 * @param name - the expert's display name.
 * @returns the mention a conversation starts with.
 */
export function expertMention(name: string): string {
  return `@${name.trim().replace(/^@+/, '')}\u00A0`
}
