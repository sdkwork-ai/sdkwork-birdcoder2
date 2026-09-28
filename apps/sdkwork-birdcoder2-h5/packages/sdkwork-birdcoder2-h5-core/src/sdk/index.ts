/**
 * SDK construction and the capability port contracts.
 *
 * `@sdkwork/birdcoder2-h5-core/sdk` is the only subpath that may name the
 * generated transport. Capability packages import the port *types* from here and
 * receive the port *instances* through the composition root.
 */

export {
  createAgentPort,
  createBirdCoder2AppSdkClient,
  createBirdCoder2Ports,
  createBirdCoder2PortsFromOptions,
  createHostsPort,
  type BirdCoder2AppSdkOptions,
} from './appSdkClient.ts'
export { BirdCoder2ApiError, guarded, toBirdCoder2ApiError } from './errors.ts'
export type {
  AgentEvent,
  AgentEventKind,
  AgentPort,
  AgentSession,
  AgentSessionStatus,
  AgentTurn,
  AgentTurnRole,
  AgentTurnStatus,
  BirdCoder2Ports,
  CursorPage,
  EventLogRequest,
  Host,
  HostEnrollment,
  HostEnrollmentCreateInput,
  HostEnrollmentStatus,
  HostPlatform,
  HostStatus,
  HostsPort,
  HostUpdateInput,
  PageRequest,
} from './ports.ts'
