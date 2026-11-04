/**
 * The three composer capability contributions.
 *
 * Each row is one `ctx.commandUi` contribution in the composer's Add section:
 * it loads its own catalog when the popup opens, maps it to popupSelect rows
 * (options.ts), and settles the pick into the draft (insertion.ts). The
 * contribution shell owns the picker search, keyboard, and focus behavior;
 * this module owns only what the row means.
 */

import type { McpManagedServerView, SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  CommandContribution, PopupSearchLabels, SelectOption,
} from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { KnowledgeBaseCatalog, KnowledgeExcerpt } from '@deepseek-ai/dsh-client-ui-sdkwork-knowledge/client'
import {
  IconCordisPluginOutlineRegular, IconDatabaseOutlineRegular, IconSkillOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { knowledgeInsertion, mcpInsertion, skillInsertion } from './insertion.ts'
import { knowledgeOptions, mcpOptions, skillOptions } from './options.ts'

/** Retrieval budget for one knowledge base pick, in milliseconds. */
export const RETRIEVAL_TIMEOUT_MS = 6000

/**
 * Capabilities the rows reach.
 *
 * Every member is a plain callback over the plugin's own services, so the rows
 * stay a pure translation of catalog → popup → draft and tests drive them with
 * fakes.
 */
export interface CapabilityRowDeps {
  /** Translator of this plugin's dictionary namespace. */
  readonly t: TranslateNS<'composerCapabilities'>
  /**
   * Whether this session may carry a capability pick.
   * @param session - the calling session.
   * @returns false for subagent sessions and sessions without a retained binding.
   */
  available(session: ClientSessionContext): boolean
  /**
   * Read the session's skill catalog.
   * @param sessionId - session whose effective skill providers decide the catalog.
   * @param signal - cancels the request.
   * @returns the catalog entries.
   */
  loadSkills(sessionId: SessionId, signal: AbortSignal): Promise<readonly SkillEntry[]>
  /** Read the managed MCP servers. @param signal - cancels the stream. @returns one view per server. */
  loadMcpServers(signal: AbortSignal): Promise<readonly McpManagedServerView[]>
  /** @returns the knowledge base catalog, or undefined when the deployment has no Knowledge Base. */
  knowledgeBases(): KnowledgeBaseCatalog | undefined
  /** @param sessionId - session whose draft is read. @returns the current draft text. */
  readDraft(sessionId: SessionId): string
  /**
   * Append one paragraph of capability text to the session's draft.
   * @param sessionId - target session.
   * @param text - plain text to append.
   */
  appendDraft(sessionId: SessionId, text: string): void
  /**
   * Surface a non-blocking notice on the session's composer.
   * @param sessionId - target session.
   * @param text - localized notice body.
   */
  notify(sessionId: SessionId, text: string): void
}

/**
 * Search copy for one row.
 * @param topic - localized row label used inside the placeholder.
 * @param empty - copy for an empty catalog.
 * @param t - namespace translator.
 * @returns the popup shell's search labels.
 */
function searchLabels(topic: string, empty: string, t: TranslateNS<'composerCapabilities'>): PopupSearchLabels {
  return {
    placeholder: t('search.placeholder', { topic }),
    empty,
    noResults: t('search.noResults'),
  }
}

/**
 * Load one catalog and map it to rows, translating any failure into the row's
 * retryable local copy. A superseded menu (aborted signal) reports no rows
 * instead of surfacing the abort.
 * @param load - catalog read.
 * @param map - row projection.
 * @param signal - the opening's cancellation signal.
 * @param t - namespace translator.
 * @returns the rows, or an empty list for an aborted opening.
 */
async function loadRows<Value>(
  load: (signal: AbortSignal) => Promise<Value>,
  map: (value: Value) => readonly SelectOption[],
  signal: AbortSignal,
  t: TranslateNS<'composerCapabilities'>,
): Promise<readonly SelectOption[]> {
  try {
    const value = await load(signal)
    if (signal.aborted) return []
    return map(value)
  } catch (error) {
    if (signal.aborted) return []
    console.error('[composer-capabilities] catalog load failed:', error)
    throw new Error(t('search.loadFailed'))
  }
}

/**
 * Build the skill row: pick a user-invocable skill and insert its `/name`
 * gesture, which the Host expands into the skill's instructions.
 * @param deps - row capabilities.
 * @returns the `skills` contribution.
 */
function skillRow(deps: CapabilityRowDeps): CommandContribution {
  const { t } = deps
  return {
    name: 'skills',
    label: () => t('label.skills'),
    description: () => t('description.skills'),
    icon: IconSkillOutlineRegular,
    available: session => deps.available(session),
    ui: {
      kind: 'popupSelect',
      searchMode: 'fuzzy-label',
      searchLabels: () => searchLabels(t('label.skills'), t('search.empty.skills'), t),
      options: (session, signal) => loadRows(
        catalogSignal => deps.loadSkills(session.sessionId, catalogSignal),
        skills => skillOptions(skills, deps.readDraft(session.sessionId)),
        signal,
        t,
      ),
      onSelect: (option, session) => { deps.appendDraft(session.sessionId, skillInsertion(option.id)) },
    },
  }
}

/**
 * Build the MCP row: pick a managed server and state which server's tools this
 * message is meant to use.
 * @param deps - row capabilities.
 * @returns the `mcp` contribution.
 */
function mcpRow(deps: CapabilityRowDeps): CommandContribution {
  const { t } = deps
  return {
    name: 'mcp',
    label: () => t('label.mcp'),
    description: () => t('description.mcp'),
    icon: IconCordisPluginOutlineRegular,
    available: session => deps.available(session),
    ui: {
      kind: 'popupSelect',
      searchLabels: () => searchLabels(t('label.mcp'), t('search.empty.mcp'), t),
      options: (_session, signal) => loadRows(
        catalogSignal => deps.loadMcpServers(catalogSignal),
        servers => mcpOptions(servers, t),
        signal,
        t,
      ),
      onSelect: (option, session) => { deps.appendDraft(session.sessionId, mcpInsertion(option.id, t)) },
    },
  }
}

/**
 * Build the knowledge base row: pick one of the signed-in user's knowledge
 * bases, retrieve passages for the message being composed, and insert both the
 * link and the retrieved passages. A failed or empty retrieval keeps the link
 * and reports the degradation instead of blocking the pick.
 * @param deps - row capabilities.
 * @returns the `knowledge` contribution.
 */
function knowledgeRow(deps: CapabilityRowDeps): CommandContribution {
  const { t } = deps
  return {
    name: 'knowledge',
    label: () => t('label.knowledge'),
    description: () => t('description.knowledge'),
    icon: IconDatabaseOutlineRegular,
    available: session => deps.available(session) && deps.knowledgeBases() !== undefined,
    ui: {
      kind: 'popupSelect',
      searchLabels: () => searchLabels(t('label.knowledge'), t('search.empty.knowledge'), t),
      options: (_session, signal) => loadRows(
        async (catalogSignal) => {
          const catalog = deps.knowledgeBases()
          if (catalog === undefined) throw new Error(t('notice.knowledgeUnavailable'))
          return catalog.list(catalogSignal)
        },
        bases => knowledgeOptions(bases, t),
        signal,
        t,
      ),
      onSelect: async (option, session) => {
        const catalog = deps.knowledgeBases()
        if (catalog === undefined) throw new Error(t('notice.knowledgeUnavailable'))
        const excerpts = await retrieve(deps, catalog, session.sessionId, option.id)
        deps.appendDraft(session.sessionId, knowledgeInsertion(option.label, excerpts, t))
      },
    },
  }
}

/**
 * Retrieve passages for the current draft from one knowledge space.
 * @param deps - row capabilities.
 * @param catalog - knowledge base catalog.
 * @param sessionId - session whose draft supplies the query.
 * @param spaceId - selected knowledge space id.
 * @returns retrieved passages, or an empty list when the draft is blank or retrieval failed.
 */
async function retrieve(
  deps: CapabilityRowDeps,
  catalog: KnowledgeBaseCatalog,
  sessionId: SessionId,
  spaceId: string,
): Promise<readonly KnowledgeExcerpt[]> {
  const draft = deps.readDraft(sessionId)
  if (draft.trim() === '') return []
  try {
    const excerpts = await catalog.retrieve(draft, [spaceId], AbortSignal.timeout(RETRIEVAL_TIMEOUT_MS))
    if (excerpts.length === 0) deps.notify(sessionId, deps.t('notice.retrievalUnavailable'))
    return excerpts
  } catch (error) {
    console.warn('[composer-capabilities] knowledge retrieval failed:', error)
    deps.notify(sessionId, deps.t('notice.retrievalUnavailable'))
    return []
  }
}

/**
 * Build the three capability rows in composer menu order.
 * @param deps - row capabilities.
 * @returns the `skills`, `mcp`, and `knowledge` contributions.
 */
export function createCapabilityRows(deps: CapabilityRowDeps): readonly CommandContribution[] {
  return [skillRow(deps), mcpRow(deps), knowledgeRow(deps)]
}
