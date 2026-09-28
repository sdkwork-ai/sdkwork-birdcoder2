import type { AgentSession } from './agent-session';

export interface AgentSessionEnvelope {
  code: 0;
  data: unknown & { item: AgentSession; };
  /** Server-owned request correlation id. */
  traceId: string;
}
