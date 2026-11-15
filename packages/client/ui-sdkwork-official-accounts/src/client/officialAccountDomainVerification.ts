/**
 * WeChat MP domain-ownership verification files, resolved through the Deploy
 * service that already owns them: the console's DNS zones store one
 * `MP_verify_*.txt` per zone and the edge data plane serves it verbatim on
 * every hostname of that zone. The official-account drawer picks a domain the
 * operator configured and stores/reads that file for the matching zone, so a
 * domain outside the managed zones is reported as unmanaged instead of being
 * pretended into existence.
 */
import type { SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type {
  SdkworkIamDomainVerification,
  SdkworkIamDomainVerificationStatus,
} from '@sdkwork/iam-pc-oauth'

/** One DNS zone this deployment manages. */
export interface ManagedZone {
  id: string
  apexHostname: string
}

/** One page ceiling: a tenant with more zones than this resolves by apex first. */
const ZONE_PAGE_SIZE = 200

/** Hard stop for a runaway paginated zone list. */
const ZONE_PAGE_LIMIT = 50

/**
 * Case-insensitive host match: a domain belongs to the longest zone whose apex
 * is the domain itself or a label suffix of it.
 * @param domain - one configured protected domain.
 * @param zones - the deployment's managed zones.
 * @returns the matching zone, or undefined when none contains the domain.
 */
export function matchManagedZone(
  domain: string,
  zones: readonly ManagedZone[],
): ManagedZone | undefined {
  const host = domain.trim().toLowerCase().replace(/\.+$/u, '')
  if (host === '') return undefined
  let best: ManagedZone | undefined
  for (const zone of zones) {
    const apex = zone.apexHostname.trim().toLowerCase().replace(/\.+$/u, '')
    if (apex === '' || (host !== apex && !host.endsWith(`.${apex}`))) continue
    if (best === undefined || apex.length > best.apexHostname.length) {
      best = { id: zone.id, apexHostname: apex }
    }
  }
  return best
}

/** Map the Deploy response onto the panel's verification status. */
function toStatus(fileName?: string, updatedAt?: string): SdkworkIamDomainVerificationStatus {
  return {
    managed: true,
    ...(fileName === undefined ? {} : { fileName }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }
}

/**
 * Panel capability backed by the Deploy service: resolves the zone of each
 * configured domain once per session, then reads or replaces that zone's
 * verification file.
 */
export class DomainVerificationPort implements SdkworkIamDomainVerification {
  private readonly client: SdkworkDeployAppClient
  private zones: Promise<readonly ManagedZone[]> | undefined

  /** @param client - the Deploy app client built with the host token manager. */
  constructor(client: SdkworkDeployAppClient) {
    this.client = client
  }

  /**
   * Read the stored verification file of the domain's zone.
   * @param domain - the configured domain.
   * @returns the zone's file state, or `managed: false` outside the zones.
   */
  async read(domain: string): Promise<SdkworkIamDomainVerificationStatus> {
    const zone = await this.zoneFor(domain)
    if (zone === undefined) return { managed: false }
    const result = await this.client.domain.domainZones.wechatVerification.retrieve(zone.id)
    return toStatus(result.fileName, result.updatedAt)
  }

  /**
   * Upload (or wholly replace) the domain's zone verification file.
   * @param domain - the configured domain.
   * @param file - the picked `MP_verify_*.txt` name and its verbatim content.
   * @returns the stored file state.
   * @throws when the domain has no managed zone, or the service rejects the file.
   */
  async upload(
    domain: string,
    file: { fileName: string; content: string },
  ): Promise<SdkworkIamDomainVerificationStatus> {
    const zone = await this.zoneFor(domain)
    if (zone === undefined) {
      throw new Error(`domain ${domain} is not managed by this deployment`)
    }
    const result = await this.client.domain.domainZones.wechatVerification.upsert(zone.id, file)
    return toStatus(result.fileName, result.updatedAt)
  }

  private async zoneFor(domain: string): Promise<ManagedZone | undefined> {
    return matchManagedZone(domain, await this.loadZones())
  }

  private loadZones(): Promise<readonly ManagedZone[]> {
    this.zones ??= this.listZones()
    return this.zones
  }

  private async listZones(): Promise<readonly ManagedZone[]> {
    const zones: ManagedZone[] = []
    for (let page = 1; page <= ZONE_PAGE_LIMIT; page += 1) {
      const result = await this.client.domain.domainZones.list({ page, pageSize: ZONE_PAGE_SIZE })
      for (const zone of result.items) zones.push({ id: zone.id, apexHostname: zone.apexHostname })
      const total = Number(result.pageInfo.totalItems)
      if (result.items.length === 0 || zones.length >= (Number.isNaN(total) ? 0 : total)) break
    }
    return zones
  }
}
