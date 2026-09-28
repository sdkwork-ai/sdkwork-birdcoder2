import type { AgentTurn } from './agent-turn';

export interface AgentTurnEnvelope {
  code: 0;
  data: unknown & { item: AgentTurn; };
  /** Server-owned request correlation id. */
  traceId: string;
}
