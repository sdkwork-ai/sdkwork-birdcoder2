/**
 * Capability-facing contracts of the BirdCoder2 H5 root.
 *
 * These are the ONLY types the capability packages see. The generated
 * `@sdkwork/birdcoder2-app-sdk` transport stays behind {@link ../sdk/appSdkClient.ts},
 * so a wire change is absorbed here instead of rippling into every screen
 * (`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` section 9: capability packages
 * must not import a generated SDK or a host plugin directly).
 *
 * Wire facts that leak into these types on purpose: instants are epoch-second
 * strings and `sequence` is a string, because int64 crosses the wire as a string
 * (`API_SPEC.md` section 13.6). Stringifying here would hide the resume
 * watermark's exact value.
 */

/** Machine kind a host runs on. */
export type HostPlatform = 'windows' | 'linux' | 'macos' | 'docker' | 'cloud-sandbox'

/** Reachability of a host. */
export type HostStatus = 'pending' | 'online' | 'offline' | 'disabled'

/** Lifecycle of a pairing code. */
export type HostEnrollmentStatus = 'active' | 'redeemed' | 'expired' | 'revoked'

/** Lifecycle of an agent conversation. */
export type AgentSessionStatus = 'active' | 'archived'

/** Who produced a turn. */
export type AgentTurnRole = 'user' | 'assistant'

/** Delivery state of a turn. */
export type AgentTurnStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Kind of one agent event in a conversation log. */
export type AgentEventKind =
  | 'turn-started'
  | 'assistant-delta'
  | 'assistant-completed'
  | 'tool-started'
  | 'tool-completed'
  | 'turn-failed'
  | 'turn-cancelled'
  | 'host-status-changed'

/** One machine or runtime running a sdkwork-birdcoder2 instance. */
export interface Host {
  readonly hostId: string
  readonly displayName: string
  readonly platform: HostPlatform
  readonly labels: readonly string[]
  readonly runtimeVersion?: string | null
  readonly status: HostStatus
  readonly leaseId?: string | null
  readonly leaseExpiresAt?: string | null
  readonly lastSeenAt?: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** A pairing code the owner hands to a host runtime. */
export interface HostEnrollment {
  readonly enrollmentId: string
  readonly hostId: string
  readonly code: string
  readonly status: HostEnrollmentStatus
  readonly expiresAt: string
  readonly redeemedAt?: string | null
  readonly createdAt: string
}

/** One agent conversation bound to one host. */
export interface AgentSession {
  readonly sessionId: string
  readonly hostId: string
  readonly title: string
  readonly status: AgentSessionStatus
  readonly createdAt: string
  readonly lastActivityAt: string
}

/** One turn of a conversation. */
export interface AgentTurn {
  readonly turnId: string
  readonly sessionId: string
  readonly hostId: string
  readonly sequence: string
  readonly role: AgentTurnRole
  readonly content?: string | null
  readonly status: AgentTurnStatus
  readonly errorCode?: number | null
  readonly errorMessage?: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** One entry of a conversation's ordered agent event log. */
export interface AgentEvent {
  readonly eventId: string
  readonly sessionId: string
  readonly turnId?: string | null
  readonly sequence: string
  readonly kind: AgentEventKind
  readonly payload: unknown
  readonly emittedAt: string
}

/** One cursor page. */
export interface CursorPage<T> {
  readonly items: readonly T[]
  readonly nextCursor?: string | null
  readonly hasMore: boolean
}

/** Request to issue a pairing code. */
export interface HostEnrollmentCreateInput {
  readonly displayName?: string
  readonly platform?: HostPlatform
  readonly ttlSeconds?: number
}

/** Partial host update the owner may apply directly. */
export interface HostUpdateInput {
  readonly displayName?: string
  readonly labels?: readonly string[]
  readonly status?: 'offline' | 'disabled'
}

/** Paging request for the list operations. */
export interface PageRequest {
  readonly cursor?: string
  readonly pageSize?: number
}

/** Watermark request for the event log. */
export interface EventLogRequest {
  /**
   * Exclusive watermark: return events whose sequence is strictly greater.
   *
   * A string, not a number: `sequence` is an int64 that crosses the wire as a
   * string, and a client resumes by echoing back the `nextCursor` it received.
   */
  readonly afterSequence?: string
  readonly limit?: number
}

/**
 * Owner-scoped host registry plus pairing codes.
 *
 * Implemented by the SDK-backed adapter in this package; consumed by the
 * `hosts` capability package.
 */
export interface HostsPort {
  listHosts(request?: PageRequest, signal?: AbortSignal): Promise<CursorPage<Host>>
  retrieveHost(hostId: string, signal?: AbortSignal): Promise<Host>
  createHostEnrollment(input: HostEnrollmentCreateInput, signal?: AbortSignal): Promise<HostEnrollment>
  updateHost(hostId: string, input: HostUpdateInput, signal?: AbortSignal): Promise<Host>
  deleteHost(hostId: string, signal?: AbortSignal): Promise<void>
}

/**
 * Agent conversations relayed to the host that runs the runtime.
 *
 * The event log is the read path: a client keeps its own `sequence` watermark and
 * resumes from it, so it never re-reads the transcript.
 */
export interface AgentPort {
  listSessions(hostId: string, request?: PageRequest, signal?: AbortSignal): Promise<CursorPage<AgentSession>>
  createSession(hostId: string, title?: string, signal?: AbortSignal): Promise<AgentSession>
  retrieveSession(sessionId: string, signal?: AbortSignal): Promise<AgentSession>
  renameSession(sessionId: string, title: string, signal?: AbortSignal): Promise<AgentSession>
  deleteSession(sessionId: string, signal?: AbortSignal): Promise<void>
  listTurns(sessionId: string, request?: PageRequest, signal?: AbortSignal): Promise<CursorPage<AgentTurn>>
  createTurn(sessionId: string, content: string, signal?: AbortSignal): Promise<AgentTurn>
  cancelTurn(sessionId: string, turnId: string, signal?: AbortSignal): Promise<AgentTurn>
  listEvents(sessionId: string, request?: EventLogRequest, signal?: AbortSignal): Promise<CursorPage<AgentEvent>>
}

/** The two capability ports, as one object the composition root hands to screens. */
export interface BirdCoder2Ports {
  readonly hosts: HostsPort
  readonly agent: AgentPort
}
