/**
 * Composer capability rows, browser half: three `ctx.commandUi` contributions
 * (`skills`, `mcp`, `knowledge`) that the composer's Add section renders, each
 * opening the shared popupSelect shell over its own catalog and settling the
 * pick into the current draft. Wiring only — row behavior lives in
 * `rows.ts`, option mapping in `options.ts`, and draft text in `insertion.ts`.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls `ctx.remote` and the remote namespace types the option
// loaders read (skills catalog and the MCP manager's watch stream).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls `ctx.commandUi` and the contribution contract.
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
// Type-only: pulls `ctx.conversation` and the draft-initialization face.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls `ctx.locale` and the client session projection.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls `ctx.knowledgeBases` (the SDKWork Knowledge Base catalog).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-knowledge/client'
import type { McpManagedServerView, SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en, NS, zh } from './locales.ts'
import { createCapabilityRows, type CapabilityRowDeps } from './rows.ts'

/** Services the composer capability rows require. */
export const inject = [
  'commandUi',
  'conversation',
  'locale',
  'remote',
  'remote.mcpManager',
  'remote.skills',
  'sessions',
]

/**
 * Register the three composer capability rows.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'composer capabilities: dictionaries')
  const t = ctx.locale.bind(NS)
  const sessions = ctx.get('sessions')
  if (sessions === undefined) throw new Error('ui-sdkwork-capabilities: sessions service unavailable')
  const conversation = ctx.get('conversation')

  const deps: CapabilityRowDeps = {
    t,
    available: (session) => {
      if (sessions.subagentAddress(session.sessionId) !== undefined) return false
      return sessions.binding(session.sessionId) !== undefined
    },
    loadSkills: async (sessionId: SessionId, signal: AbortSignal): Promise<readonly SkillEntry[]> => {
      const result = await ctx.remote.skills.list({ sessionId }, signal)
      signal.throwIfAborted()
      if (!result.ok) throw new Error(`skills/list failed: ${result.error.code}: ${result.error.message}`)
      return result.value.skills
    },
    loadMcpServers: async (signal: AbortSignal): Promise<readonly McpManagedServerView[]> => {
      // One snapshot is enough for a picker: the watch stream also re-emits on
      // every server transition, but the popup loads its rows once per opening.
      const stream = ctx.remote.mcpManager.watch(signal)
      try {
        for await (const servers of stream) return servers
        if (signal.aborted) return []
        throw new Error('mcpManager/watch ended before reporting any server')
      } finally {
        stream.dispose()
      }
    },
    knowledgeBases: () => ctx.get('knowledgeBases'),
    readDraft: (sessionId: SessionId): string => {
      const binding = sessions.binding(sessionId)
      if (binding === undefined || conversation === undefined) return ''
      return conversation.input.for(binding.ctx).state.getSnapshot().draft
    },
    appendDraft: (sessionId: SessionId, text: string): void => {
      const binding = sessions.binding(sessionId)
      if (binding === undefined || conversation === undefined) {
        throw new Error(t('notice.sessionUnavailable'))
      }
      const applied = conversation.input.requestDraftInitialization(binding, {
        prompt: text,
        whenDraftExists: 'append',
      })
      if (applied === 'blocked') throw new Error(t('notice.composerBusy'))
      conversation.input.for(binding.ctx).focus()
    },
    notify: (sessionId: SessionId, text: string): void => {
      const binding = sessions.binding(sessionId)
      if (binding === undefined || conversation === undefined) return
      conversation.input.for(binding.ctx).notify('info', text)
    },
  }

  for (const row of createCapabilityRows(deps)) {
    ctx.effect(() => ctx.commandUi.register(row), `composer capabilities: ${row.name}`)
  }
}
