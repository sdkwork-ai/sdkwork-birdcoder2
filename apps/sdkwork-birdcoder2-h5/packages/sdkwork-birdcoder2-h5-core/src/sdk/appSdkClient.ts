/**
 * The single place the BirdCoder2 generated transport is constructed and adapted.
 *
 * Everything above this file — screens, state, navigation — talks to
 * {@link BirdCoder2Ports}. That is the boundary the client architecture spec
 * requires (section 9): a capability package must not import a generated SDK, a
 * Capacitor plugin, or a Tauri global. A future transport (a WebSocket push
 * channel for the event log, for example) is a new adapter here and touches no
 * screen.
 */

import {
  createClient,
  type SdkworkAppConfig,
  type SdkworkBirdcoder2AppClient,
} from '@sdkwork/birdcoder2-app-sdk'
import type { AuthTokenManager } from '@sdkwork/sdk-common'

import { guarded } from './errors.ts'
import type {
  AgentEvent,
  AgentPort,
  AgentSession,
  AgentTurn,
  BirdCoder2Ports,
  CursorPage,
  EventLogRequest,
  Host,
  HostEnrollment,
  HostEnrollmentCreateInput,
  HostUpdateInput,
  HostsPort,
  PageRequest,
} from './ports.ts'

/** Construction inputs the H5 composition root supplies. */
export interface BirdCoder2AppSdkOptions {
  /**
   * Origin the API is served from. A relative value such as `/` is resolved by
   * {@link createSdkClients} against the page protocol before it reaches here.
   */
  readonly baseUrl: string
  /** Token source shared with the IAM runtime. */
  readonly tokenManager?: AuthTokenManager
  /** Tenant the signed-in user belongs to, when the session carries one. */
  readonly tenantId?: string
  /** Per-request timeout in milliseconds. */
  readonly timeout?: number
}

/**
 * Builds the generated client.
 *
 * `exactOptionalPropertyTypes` is on, so absent options are omitted rather than
 * passed as `undefined` — the transport treats a present-but-undefined field
 * differently from an absent one when it merges headers.
 */
export function createBirdCoder2AppSdkClient(
  options: BirdCoder2AppSdkOptions,
): SdkworkBirdcoder2AppClient {
  const config: SdkworkAppConfig = {
    baseUrl: options.baseUrl,
    ...(options.tokenManager === undefined ? {} : { tokenManager: options.tokenManager }),
    ...(options.tenantId === undefined ? {} : { tenantId: options.tenantId }),
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  }
  return createClient(config)
}

function toCursorPage<T>(page: { items: T[]; pageInfo: { nextCursor?: string | null; hasMore: boolean } }): CursorPage<T> {
  return {
    items: page.items,
    nextCursor: page.pageInfo.nextCursor ?? null,
    hasMore: page.pageInfo.hasMore,
  }
}

function requestOptions(signal: AbortSignal | undefined): { signal: AbortSignal } | undefined {
  return signal === undefined ? undefined : { signal }
}

/**
 * Owner-scoped host registry adapter.
 *
 * The pairing code is issued here but redeemed by the host runtime on the
 * Internal API; the mobile client never sees the lease the runtime receives.
 */
export function createHostsPort(client: SdkworkBirdcoder2AppClient): HostsPort {
  return {
    listHosts: (request?: PageRequest, signal?: AbortSignal) =>
      guarded(async () =>
        toCursorPage(
          await client.hosts.list(
            {
              ...(request?.cursor === undefined ? {} : { cursor: request.cursor }),
              ...(request?.pageSize === undefined ? {} : { pageSize: request.pageSize }),
            },
            requestOptions(signal),
          ),
        ),
      ) as Promise<CursorPage<Host>>,

    retrieveHost: (hostId: string, signal?: AbortSignal) =>
      guarded(() => client.hosts.retrieve(hostId, requestOptions(signal))) as Promise<Host>,

    createHostEnrollment: (input: HostEnrollmentCreateInput, signal?: AbortSignal) =>
      guarded(() =>
        client.hosts.hostEnrollments.create(
          {
            ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
            ...(input.platform === undefined ? {} : { platform: input.platform }),
            ...(input.ttlSeconds === undefined ? {} : { ttlSeconds: input.ttlSeconds }),
          },
          requestOptions(signal),
        ),
      ) as Promise<HostEnrollment>,

    updateHost: (hostId: string, input: HostUpdateInput, signal?: AbortSignal) =>
      guarded(() =>
        client.hosts.update(
          hostId,
          {
            ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
            // The transport declares a mutable array; copy so a caller's readonly
            // list is never handed out as shared mutable state.
            ...(input.labels === undefined ? {} : { labels: [...input.labels] }),
            ...(input.status === undefined ? {} : { status: input.status }),
          },
          requestOptions(signal),
        ),
      ) as Promise<Host>,

    deleteHost: (hostId: string, signal?: AbortSignal) =>
      guarded(() => client.hosts.delete(hostId, requestOptions(signal))),
  }
}

/**
 * Agent conversation adapter.
 *
 * `listEvents` is the read path of the relay: the client passes its own last
 * applied `sequence` as `afterSequence` and receives only what it has not seen,
 * so a reconnect after a dropped mobile connection resumes instead of replaying.
 */
export function createAgentPort(client: SdkworkBirdcoder2AppClient): AgentPort {
  return {
    listSessions: (hostId: string, request?: PageRequest, signal?: AbortSignal) =>
      guarded(async () =>
        toCursorPage(
          await client.agent.agentSessions.list(
            hostId,
            {
              ...(request?.cursor === undefined ? {} : { cursor: request.cursor }),
              ...(request?.pageSize === undefined ? {} : { pageSize: request.pageSize }),
            },
            requestOptions(signal),
          ),
        ),
      ) as Promise<CursorPage<AgentSession>>,

    createSession: (hostId: string, title?: string, signal?: AbortSignal) =>
      guarded(() =>
        client.agent.agentSessions.create(
          hostId,
          title === undefined ? {} : { title },
          requestOptions(signal),
        ),
      ) as Promise<AgentSession>,

    retrieveSession: (sessionId: string, signal?: AbortSignal) =>
      guarded(() => client.agent.agentSessions.retrieve(sessionId, requestOptions(signal))) as Promise<AgentSession>,

    renameSession: (sessionId: string, title: string, signal?: AbortSignal) =>
      guarded(() => client.agent.agentSessions.update(sessionId, { title }, requestOptions(signal))) as Promise<AgentSession>,

    deleteSession: (sessionId: string, signal?: AbortSignal) =>
      guarded(() => client.agent.agentSessions.delete(sessionId, requestOptions(signal))),

    listTurns: (sessionId: string, request?: PageRequest, signal?: AbortSignal) =>
      guarded(async () =>
        toCursorPage(
          await client.agent.agentTurns.list(
            sessionId,
            {
              ...(request?.cursor === undefined ? {} : { cursor: request.cursor }),
              ...(request?.pageSize === undefined ? {} : { pageSize: request.pageSize }),
            },
            requestOptions(signal),
          ),
        ),
      ) as Promise<CursorPage<AgentTurn>>,

    createTurn: (sessionId: string, content: string, signal?: AbortSignal) =>
      guarded(() => client.agent.agentTurns.create(sessionId, { content }, requestOptions(signal))) as Promise<AgentTurn>,

    cancelTurn: (sessionId: string, turnId: string, signal?: AbortSignal) =>
      guarded(() => client.agent.agentTurns.cancel(sessionId, turnId, requestOptions(signal))) as Promise<AgentTurn>,

    listEvents: (sessionId: string, request?: EventLogRequest, signal?: AbortSignal) =>
      guarded(async () =>
        toCursorPage(
          await client.agent.agentEvents.list(
            sessionId,
            {
              ...(request?.afterSequence === undefined ? {} : { afterSequence: request.afterSequence }),
              ...(request?.limit === undefined ? {} : { limit: request.limit }),
            },
            requestOptions(signal),
          ),
        ),
      ) as Promise<CursorPage<AgentEvent>>,
  }
}

/** Builds both capability ports over one client, so both share one token source. */
export function createBirdCoder2Ports(client: SdkworkBirdcoder2AppClient): BirdCoder2Ports {
  return {
    hosts: createHostsPort(client),
    agent: createAgentPort(client),
  }
}

/**
 * Convenience composition: options in, ports out.
 *
 * The H5 root calls this once; nothing else in the application constructs a
 * transport.
 */
export function createBirdCoder2PortsFromOptions(options: BirdCoder2AppSdkOptions): BirdCoder2Ports {
  return createBirdCoder2Ports(createBirdCoder2AppSdkClient(options))
}
