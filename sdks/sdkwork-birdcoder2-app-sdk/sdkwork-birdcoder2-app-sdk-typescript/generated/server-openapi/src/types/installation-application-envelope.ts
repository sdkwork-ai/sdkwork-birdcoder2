import type { InstallationApplication } from './installation-application';

export interface InstallationApplicationEnvelope {
  code: 0;
  data: unknown & { item: InstallationApplication; };
  /** Server-owned request correlation id. */
  traceId: string;
}
