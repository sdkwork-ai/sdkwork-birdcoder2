/**
 * Domain Center calls for the SDKWork settings menu's "我的域名" surface.
 *
 * Thin wrapper over the generated deployments app SDK the plugin's host adapter
 * already builds, so the dialog never assembles HTTP, headers or credentials.
 * Every create/verify call carries an idempotency key: the control plane treats
 * a replay as the same intent, not a second zone or hostname.
 */
import type {
  CreateDomainHostnameRequest,
  CreateDomainVerificationFileRequest,
  CreateDomainZoneRequest,
  DomainHostnameResponse,
  DomainVerificationFileCheckResponse,
  DomainVerificationFileResponse,
  DomainVerifyResponse,
  DomainZoneResponse,
} from '@sdkwork/deployments-app-sdk'

import type { DeployHostClients } from './deployHost.ts'

export interface DomainCenterService {
  /** The caller's own root domains (the platform's `app.<suffix>` zones are excluded). */
  listZones(): Promise<DomainZoneResponse[]>
  createZone(input: CreateDomainZoneRequest): Promise<DomainZoneResponse>
  deleteZone(zoneId: string): Promise<void>
  listHostnames(zoneId: string): Promise<DomainHostnameResponse[]>
  createHostname(zoneId: string, input: CreateDomainHostnameRequest): Promise<DomainHostnameResponse>
  verifyHostname(zoneId: string, hostnameId: string): Promise<DomainVerifyResponse>
  listVerificationFiles(zoneId: string): Promise<DomainVerificationFileResponse[]>
  createVerificationFile(
    zoneId: string,
    input: CreateDomainVerificationFileRequest,
  ): Promise<DomainVerificationFileResponse>
  deleteVerificationFile(zoneId: string, fileId: string): Promise<void>
  checkVerificationFile(zoneId: string, fileId: string): Promise<DomainVerificationFileCheckResponse>
}

function idempotencyKey(): string {
  const cryptoApi = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto
  if (cryptoApi?.randomUUID !== undefined) return cryptoApi.randomUUID()
  // The browser and the Node toolchain both expose `crypto.randomUUID`; the
  // fallback only exists so a non-standard host still sends *an* intent key.
  return `domain-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createDomainCenterService(clients: DeployHostClients): DomainCenterService {
  const zones = clients.deployClient.domain.domainZones
  return {
    async listZones() {
      const page = await zones.list({ page: 1, pageSize: 100 })
      return page.items.filter(zone => zone.scope === 'USER')
    },
    createZone: input => zones.create(input, { idempotencyKey: idempotencyKey() }),
    deleteZone: zoneId => zones.delete(zoneId),
    async listHostnames(zoneId) {
      const page = await zones.hostnames.list(zoneId, { page: 1, pageSize: 100 })
      return page.items
    },
    createHostname: (zoneId, input) =>
      zones.hostnames.create(zoneId, input, { idempotencyKey: idempotencyKey() }),
    verifyHostname: (zoneId, hostnameId) =>
      zones.hostnames.verify(zoneId, hostnameId, { idempotencyKey: idempotencyKey() }),
    async listVerificationFiles(zoneId) {
      const page = await zones.verificationFiles.list(zoneId)
      return page.items
    },
    createVerificationFile: (zoneId, input) =>
      zones.verificationFiles.create(zoneId, input, { idempotencyKey: idempotencyKey() }),
    deleteVerificationFile: (zoneId, fileId) => zones.verificationFiles.delete(zoneId, fileId),
    checkVerificationFile: (zoneId, fileId) => zones.verificationFiles.check(zoneId, fileId),
  }
}
