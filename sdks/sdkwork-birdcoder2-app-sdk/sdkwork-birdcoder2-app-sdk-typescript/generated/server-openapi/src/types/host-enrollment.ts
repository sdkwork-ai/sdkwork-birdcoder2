import type { EpochSeconds } from './epoch-seconds';
import type { HostEnrollmentStatus } from './host-enrollment-status';

/** A pairing code the owner hands to a host runtime. */
export interface HostEnrollment {
  enrollmentId: string;
  hostId: string;
  code: string;
  status: HostEnrollmentStatus;
  expiresAt: EpochSeconds;
  redeemedAt?: EpochSeconds | null;
  createdAt: EpochSeconds;
}
