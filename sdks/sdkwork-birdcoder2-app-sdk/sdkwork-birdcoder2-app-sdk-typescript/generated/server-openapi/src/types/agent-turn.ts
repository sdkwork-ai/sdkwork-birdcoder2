import type { AgentTurnRole } from './agent-turn-role';
import type { AgentTurnStatus } from './agent-turn-status';
import type { EpochSeconds } from './epoch-seconds';
import type { Sequence } from './sequence';

/** One turn of a conversation, in ascending sequence order. */
export interface AgentTurn {
  turnId: string;
  sessionId: string;
  hostId: string;
  sequence: Sequence;
  role: AgentTurnRole;
  content?: string | null;
  status: AgentTurnStatus;
  errorCode?: number | null;
  errorMessage?: string | null;
  createdAt: EpochSeconds;
  updatedAt: EpochSeconds;
}
