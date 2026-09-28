import type { Host } from './host';
import type { PageInfo } from './page-info';

export interface HostListEnvelope {
  code: 0;
  data: unknown & { items: Host[]; pageInfo: PageInfo; };
  /** Server-owned request correlation id. */
  traceId: string;
}
