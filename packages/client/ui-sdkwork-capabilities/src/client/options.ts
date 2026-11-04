/**
 * Option rows for the three composer capability pickers.
 *
 * Each builder maps one catalog snapshot to popupSelect rows: skills from the
 * session's `skills/list` catalog, MCP servers from the manager's `watch`
 * stream, and knowledge bases from the SDKWork Knowledge Base selection
 * projection. Builders are pure: the popup shell filters these rows locally,
 * and the row id is the value a settled pick carries back.
 */

import type { McpManagedServerView, SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { KnowledgeBaseKind, KnowledgeBaseSummary } from '@deepseek-ai/dsh-client-ui-sdkwork-knowledge/client'

/** Translator of this plugin's dictionary namespace. */
type CapabilityTranslator = TranslateNS<'composerCapabilities'>

/** Group headings, in the order the knowledge base projection lists them. */
const KNOWLEDGE_GROUPS = {
  team: 'knowledge.group.team',
  personal: 'knowledge.group.personal',
} as const satisfies Record<KnowledgeBaseKind, string>

/**
 * Escape one literal skill name for a gesture pattern.
 * @param name - skill name.
 * @returns the name with regular-expression metacharacters escaped.
 */
function escapePattern(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * Test whether the draft already carries one skill's `/name` gesture.
 * @param draft - current composer draft.
 * @param name - skill name without its slash.
 * @returns whether a word-bounded gesture for that exact name is present.
 */
function carriesGesture(draft: string, name: string): boolean {
  if (draft === '') return false
  return new RegExp(`(?:^|\\s)/${escapePattern(name)}(?=\\s|$)`, 'u').test(draft)
}

/**
 * Build the skill rows: user-invocable catalog entries only, because this menu
 * is the human-facing composer surface.
 * @param skills - the session's skill catalog.
 * @param draft - current composer draft, used to mark an already-inserted skill.
 * @returns one row per selectable skill, in catalog order.
 */
export function skillOptions(skills: readonly SkillEntry[], draft: string): readonly SelectOption[] {
  return skills
    .filter(skill => skill.userInvocable)
    .map(skill => ({
      id: skill.name,
      label: skill.name,
      detail: skill.description,
      ...(carriesGesture(draft, skill.name) ? { active: true } : {}),
    }))
}

/**
 * Localized status line of one managed server.
 * @param server - managed server view.
 * @param t - namespace translator.
 * @returns a short state label, with the live tool count when connected.
 */
function mcpState(server: McpManagedServerView, t: CapabilityTranslator): string {
  const status = server.status
  switch (status.state) {
    case 'connected': return t('mcp.state.connected', { count: status.toolCount })
    case 'connecting': return t('mcp.state.connecting')
    case 'reconnecting': return t('mcp.state.reconnecting')
    case 'waiting-credentials': return t('mcp.state.credentials')
    case 'closed': return t('mcp.state.closed')
    case 'disabled': return t('mcp.state.disabled')
    case 'failed': return t('mcp.state.failed')
  }
}

/**
 * Build the MCP rows: every server the manager reports, with its live state and
 * the `mcp__server__` tool prefix the model addresses the server through.
 * @param servers - managed server views from `mcpManager/watch`.
 * @param t - namespace translator.
 * @returns one row per managed server, in manager order.
 */
export function mcpOptions(servers: readonly McpManagedServerView[], t: CapabilityTranslator): readonly SelectOption[] {
  return servers.map((server) => {
    const prefix = `mcp__${server.name}__`
    return {
      id: server.name,
      label: server.name,
      detail: `${mcpState(server, t)} · ${t('mcp.detail.prefix', { prefix })}`,
    }
  })
}

/**
 * Build the knowledge base rows, grouped by the projection's team/personal
 * split and ordered as the application lists them.
 * @param bases - knowledge bases from `ctx.knowledgeBases`.
 * @param t - namespace translator.
 * @returns one row per knowledge base.
 */
export function knowledgeOptions(
  bases: readonly KnowledgeBaseSummary[],
  t: CapabilityTranslator,
): readonly SelectOption[] {
  const groups = new Map<KnowledgeBaseKind, SelectOption[]>()
  for (const base of bases) {
    const rows = groups.get(base.kind) ?? []
    rows.push({
      id: base.id,
      label: base.name,
      group: { name: base.kind, label: t(KNOWLEDGE_GROUPS[base.kind]) },
      ...(base.documentCount === undefined
        ? {}
        : { detail: t('knowledge.detail.documents', { count: base.documentCount }) }),
    })
    groups.set(base.kind, rows)
  }
  return [...groups.values()].flat()
}
