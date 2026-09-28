import type { EpochSeconds } from './epoch-seconds';
import type { HostPlatform } from './host-platform';
import type { HostStatus } from './host-status';

/** One machine or runtime running a sdkwork-birdcoder2 instance. */
export interface Host {
  hostId: string;
  displayName: string;
  platform: HostPlatform;
  labels: string[];
  runtimeVersion?: string | null;
  status: HostStatus;
  leaseId?: string | null;
  leaseExpiresAt?: EpochSeconds | null;
  lastSeenAt?: EpochSeconds | null;
  createdAt: EpochSeconds;
  updatedAt: EpochSeconds;
}
