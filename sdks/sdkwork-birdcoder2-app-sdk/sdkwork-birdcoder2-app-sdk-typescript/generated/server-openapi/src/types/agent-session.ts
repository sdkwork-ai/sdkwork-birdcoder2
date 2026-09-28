import type { AgentSessionStatus } from './agent-session-status';
import type { EpochSeconds } from './epoch-seconds';

/** One agent conversation bound to one host. */
export interface AgentSession {
  sessionId: string;
  hostId: string;
  title: string;
  status: AgentSessionStatus;
  createdAt: EpochSeconds;
  lastActivityAt: EpochSeconds;
}
