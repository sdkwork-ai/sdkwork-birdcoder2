import type { AgentTurn } from './agent-turn';
import type { PageInfo } from './page-info';

export interface AgentTurnListEnvelope {
  code: 0;
  data: unknown & { items: AgentTurn[]; pageInfo: PageInfo; };
  /** Server-owned request correlation id. */
  traceId: string;
}
