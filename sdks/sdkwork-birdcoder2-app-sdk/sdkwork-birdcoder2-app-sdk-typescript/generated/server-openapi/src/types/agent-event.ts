import type { AgentEventKind } from './agent-event-kind';
import type { EpochSeconds } from './epoch-seconds';
import type { Sequence } from './sequence';

/** One entry of a conversation's ordered agent event log. */
export interface AgentEvent {
  eventId: string;
  sessionId: string;
  turnId?: string | null;
  sequence: Sequence;
  kind: AgentEventKind;
  /** Kind-specific payload, passed through verbatim from the host runtime. */
  payload: unknown;
  emittedAt: EpochSeconds;
}
