import type { HostPlatform } from './host-platform';

export interface HostEnrollmentCreateRequest {
  /** Name the host receives before it first attaches. */
  displayName?: string;
  platform?: HostPlatform;
  /** Requested pairing-code lifetime in seconds. */
  ttlSeconds?: number;
}
