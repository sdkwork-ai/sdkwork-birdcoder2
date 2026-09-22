/** Session-addressed and composition-wide skill catalog Remote. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { SkillSummary } from '@deepseek-ai/dsh-skill'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SkillEntry, SkillEntrySource, SkillListRequest, SkillListValue } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the Session-addressed `skills` Remote namespace. */
    sessionSkillCatalog: SessionSkillCatalog
  }
}

/**
 * Host service backing `ctx.remote.skills` without activating a cold Agent.
 *
 * Two addressing modes, one value shape: a session-addressed read resolves the
 * project roots that session's composition mounts, and a composition-wide read
 * (`scope: 'all'`) resolves only the roots that do not depend on a workspace.
 * The skill manager needs the second — a reader deciding what a skill is for
 * wants the inventory even before a workspace is picked — while the composer
 * needs the first, because that is the catalog its `/` menu will actually
 * resolve against.
 */
export class SessionSkillCatalog extends TypertRemoteService {
  static inject = ['agents', 'sessionQuery', 'typert']

  /** @param ctx - Host context carrying Session reads and the host skill registry. */
  constructor(ctx: Context) {
    super(ctx, 'sessionSkillCatalog', { namespace: 'skills' })
  }

  /**
   * List the skills visible to one Session composition, or to the whole Host
   * composition when the request asks for it.
   * @param request - Session identity whose cwd and preset select the catalog view, or `scope: 'all'` for the composition-wide view.
   * @param signal - caller lifetime carried by the Remote transport; admitted catalog reads retain their existing completion semantics.
   * @returns skill metadata for every user-invocable skill, plus the
   *   model-only remainder of the same providers, without loading skill bodies.
   * @throws RemoteError when a named Session cannot be inspected, or when no registry can serve the request.
   */
  @Remote
  async list(request: SkillListRequest, signal: AbortSignal): Promise<SkillListValue> {
    void signal
    const { sessionId } = request
    if (sessionId === undefined) return this.listCompositionWide()

    let cwd: string | undefined
    let agentPreset: string | undefined
    try {
      using observation = await this.ctx.sessionQuery.observeSession(sessionId)
      if (observation.projections === undefined) {
        throw new Error('skill catalog requires a projected Session observation')
      }
      cwd = observation.header.cwd
      agentPreset = observation.projections.values.agentPreset ?? undefined
    } catch (error: unknown) {
      if (error instanceof SessionQueryError
        && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
        throw new RemoteError('session/not-found', `session "${sessionId}" not found`, { sessionId })
      }
      throw new RemoteError(
        'gateway/internal',
        `session "${sessionId}" could not be inspected: ${String(error)}`,
        {},
      )
    }
    if (cwd === undefined) {
      throw new RemoteError('gateway/internal', `session "${sessionId}" has no project cwd`, {})
    }

    const live = this.ctx.agents.get(sessionId)
    const presets = this.ctx.get('agentPresets')
    const scoped = live === undefined ? undefined : presets?.serviceFor(live, 'skills')
    const skillRegistry = scoped ?? this.ctx.get('skills')
    if (skillRegistry === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'skill registry is absent: neither this session\'s agent preset nor the host composition mounts @deepseek-ai/dsh-skill',
        {},
      )
    }

    // Upstream acquires the standing preset scope as a lease so the key stays
    // valid for this read; the projection stays in the fork's `collect` helper,
    // whose wire entry also carries the source class and provider name.
    await using lease = live === undefined ? await this.scopeFor(agentPreset) : undefined
    const scope = live ?? lease?.key
    return this.collect(() => skillRegistry.list({ cwd, scope }))
  }

  /**
   * Resolve the composition-wide catalog: every root the Host mounts that does
   * not depend on a workspace. Project roots are deliberately out of reach
   * here — without a Session there is no `cwd` to anchor them, and inventing
   * one would advertise skills the composer could not resolve.
   * @returns every registered skill, with the root class and provider it came from.
   */
  private async listCompositionWide(): Promise<SkillListValue> {
    const skillRegistry = this.ctx.get('skills')
    if (skillRegistry === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'skill registry is absent: the host composition does not mount @deepseek-ai/dsh-skill',
        {},
      )
    }
    // `cwd: undefined` with `scope: undefined` reads the global layer, whose
    // filesystem provider skips project roots but still mounts the preset's
    // custom roots and the user roots around the packaged bundled root.
    return this.collect(() => skillRegistry.list({}))
  }

  /**
   * Run one registry read and project its summaries onto the wire.
   * @param read - the registry call to admit.
   * @returns the projected catalog.
   */
  private async collect(read: () => Promise<SkillSummary[]>): Promise<SkillListValue> {
    try {
      const skills = await read()
      return { skills: skills.map(toEntry) }
    } catch (error: unknown) {
      throw new RemoteError('gateway/internal', `skill listing failed: ${String(error)}`, {})
    }
  }

  /** Resolve a live or standing preset scope without creating an Agent. */
  private async scopeFor(
    agentPreset: string | undefined,
  ): Promise<({ key: ScopeKey } & AsyncDisposable) | undefined> {
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) return undefined
    try {
      return await presets.acquireScope(agentPreset)
    } catch {
      // An unknown or unusable recorded preset falls back to the global registry.
      return undefined
    }
  }
}

/**
 * Collapse a provider-specific discovery source onto the wire's smaller,
 * rendering-oriented vocabulary. The registry's `SkillSource` is open
 * (`(string & {})`) because providers name their own roots; a consumer that
 * groups by class needs a closed set, so an unrecognized value degrades to
 * `unknown` instead of leaking a provider's private vocabulary to the Client.
 * @param source - the winning skill's declared discovery source.
 * @returns the wire source class.
 */
function toSource(source: string): SkillEntrySource {
  switch (source) {
    case 'project-dsh':
    case 'project-agents':
      return 'project'
    case 'custom':
      return 'custom'
    case 'user-dsh':
    case 'user-agents':
      return 'user'
    case 'bundled':
      return 'bundled'
    case 'runtime':
      return 'runtime'
    default:
      return 'unknown'
  }
}

/**
 * Project one registry summary onto the wire entry.
 * @param skill - the winning summary.
 * @returns the wire entry.
 */
function toEntry(skill: SkillSummary): SkillEntry {
  return {
    name: skill.name,
    ...skill.path === undefined ? {} : { path: skill.path },
    description: skill.description,
    ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
    modelInvocable: skill.invocation.modelInvocable,
    userInvocable: skill.invocation.userInvocable,
    source: toSource(skill.source),
    provider: skill.provider,
  }
}

export default SessionSkillCatalog
