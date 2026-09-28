import type { AgentSession } from './agent-session';
import type { PageInfo } from './page-info';

export interface AgentSessionListEnvelope {
  code: 0;
  data: unknown & { items: AgentSession[]; pageInfo: PageInfo; };
  /** Server-owned request correlation id. */
  traceId: string;
}
