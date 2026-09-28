import type { HostEnrollment } from './host-enrollment';

export interface HostEnrollmentEnvelope {
  code: 0;
  data: unknown & { item: HostEnrollment; };
  /** Server-owned request correlation id. */
  traceId: string;
}
