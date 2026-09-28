import type { AgentEvent } from './agent-event';
import type { PageInfo } from './page-info';

export interface AgentEventListEnvelope {
  code: 0;
  data: unknown & { items: AgentEvent[]; pageInfo: PageInfo; };
  /** Server-owned request correlation id. */
  traceId: string;
}
