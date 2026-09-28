import type { HostAdministrativeStatus } from './host-administrative-status';

export interface HostUpdateRequest {
  displayName?: string;
  labels?: string[];
  status?: HostAdministrativeStatus;
}
