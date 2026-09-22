/**
 * agent-presets domain contract: the roster a browser offers when starting a
 * session.
 *
 * Upstream retired the directory-preset authoring model in favour of presets
 * declared as ordinary Cordis rows in the active profile (see the
 * `2026-09-18-declarative-agent-presets` architecture note: "presets have no
 * separate paths"). Selecting is what remains of this domain: the roster, and
 * the switch. Authoring a composition is now a profile-patch edit, which the
 * settings domain already carries, and it no longer has a per-preset
 * directory, a trust split, or a separately writable root to report.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One preset the deployment can compose a session's agent from. */
export interface AgentPresetEntry {
  /** Stable identifier, also the display name until presets carry metadata. */
  readonly id: string
  /** Whether a session that names no preset gets this one. */
  readonly isDefault: boolean
  /**
   * Display name the preset published, absent when it published none. A
   * surface falls back to {@link id}; it is never a second identity.
   */
  readonly name?: string
  /** One sentence on what the preset is for, when it published one. */
  readonly description?: string
  /**
   * Why this preset cannot compose a session, absent when it can. A broken
   * preset stays listed so a surface can show it, but offering it for
   * selection would only defer this reason to a failed session start.
   */
  readonly broken?: string
}

/** agent-preset-domain unary methods (the map key agentPreset.* of RpcMethodMap). */
export interface AgentPresetsApi {
  /**
   * Lists every preset the deployment currently declares.
   * An empty roster means the deployment composes no presets at all, and
   * every session shares the host composition.
   */
  list(request: RpcRequest<{}>): Promise<RpcResponse<{ presets: readonly AgentPresetEntry[] }>>

  /**
   * Recompose one session's agent from a different preset.
   *
   * Allowed only while the session is blank — no turn has run. Once a
   * conversation starts, its history was produced under that preset's tools,
   * and swapping them would leave logged tool calls the new composition cannot
   * make; the attempt answers `agent-preset-locked`.
   */
  select(request: RpcRequest<{ sessionId: SessionId; agentPreset: string }>):
  Promise<RpcResponse<{ agentPreset: string }>>
}
