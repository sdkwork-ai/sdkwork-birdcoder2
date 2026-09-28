import type { Host } from './host';

export interface HostEnvelope {
  code: 0;
  data: unknown & { item: Host; };
  /** Server-owned request correlation id. */
  traceId: string;
}
