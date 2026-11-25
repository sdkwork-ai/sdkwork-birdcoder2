/**
 * The `sdkwork-deploy-site` right-Sidebar page: the deployed site's dashboard.
 *
 * The conversation card opens this tab with the site facts a publish returned;
 * the body reads them from the tab's navigation parameters and re-reads the
 * live dashboard through the injected loader (application, hostnames, platform
 * targets, releases, deployments, health checks).
 */
import type { SdkworkDeploySite } from '@deepseek-ai/dsh-tool-sdkwork-deploy/types'
import type { SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { NS } from './locales.ts'

/** The tab kind this package owns. */
export const DEPLOY_SITE_KIND = 'sdkwork-deploy-site'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const DEPLOY_SITE_ID = '@deepseek-ai/dsh-client-ui-sdkwork-deploy/site'

/** The site a deploy panel opens on. */
export interface DeploySiteTabParams {
  readonly site: SdkworkDeploySite
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** The site facts a publish returned. */
    'sdkwork-deploy-site': DeploySiteTabParams
  }
}

/** One hostname the application answers on. */
export interface SiteDomain {
  readonly hostname: string
  readonly kind: 'DEFAULT' | 'CUSTOM'
  readonly environment: string
  readonly bindingStatus: string
  readonly verificationStatus: string
  readonly isCanonical: boolean
}

/** One platform target the application publishes through. */
export interface SiteTarget {
  readonly id: string
  readonly targetKey: string
  readonly platform: string
  readonly techStack?: string
  readonly status?: string
}

/** One immutable release. */
export interface SiteRelease {
  readonly id: string
  readonly version: string
  readonly status: string
  readonly createdAt: string
}

/** One deployment of a release. */
export interface SiteDeployment {
  readonly id: string
  readonly environment: string
  readonly status: string
  readonly kind?: string
  readonly target?: string
  readonly releaseId?: string
  readonly startedAt?: string
  readonly completedAt?: string
  readonly createdAt: string
}

/** One health check the platform runs against the application. */
export interface SiteHealth {
  readonly id?: string
  readonly checkType?: string
  readonly checkUrl?: string
  readonly intervalSeconds?: number
  readonly status?: string
}

/** Everything the site panel reads in one visit. */
export interface DeploySiteDashboard {
  readonly app: {
    readonly id: string
    readonly name: string
    readonly slug: string
    readonly kind: string
    readonly status: string
    readonly ownerType: string
    readonly defaultEnvironment: string
    readonly latestReleaseTag?: string
    readonly createdAt: string
    readonly updatedAt: string
  }
  readonly domains: readonly SiteDomain[]
  readonly targets: readonly SiteTarget[]
  readonly releases: readonly SiteRelease[]
  readonly deployments: readonly SiteDeployment[]
  readonly health: readonly SiteHealth[]
}

/** The generated client pair the loader reads through. */
export interface SiteDashboardClients {
  readonly deployClient: SdkworkDeployAppClient
}

/** Rows read per list on one dashboard visit. */
export const SITE_PANEL_PAGE_SIZE = 10

/**
 * Read one site dashboard. Every list tolerates its own failure, so a partial
 * platform answer still renders the sections it could read; only the
 * application read itself is required.
 * @param clients - generated deploy client pair.
 * @param appId - application identity.
 * @param signal - cancellation lifetime of the visit.
 * @returns the dashboard snapshot.
 * @throws when the application read itself fails.
 */
export async function loadDeploySiteDashboard(
  clients: SiteDashboardClients,
  appId: string,
  signal?: AbortSignal,
): Promise<DeploySiteDashboard> {
  const app = await clients.deployClient.app.retrieve(appId)
  const [domains, targets, releases, deployments, health] = await Promise.all([
    optionalList(() => clients.deployClient.app.domains.list(appId), signal),
    optionalList(() => clients.deployClient.app.platformTargets.list(appId), signal),
    optionalList(() => clients.deployClient.release.list(appId, { page: 1, pageSize: SITE_PANEL_PAGE_SIZE }), signal),
    optionalList(() => clients.deployClient.deployment.list(appId, { page: 1, pageSize: SITE_PANEL_PAGE_SIZE }), signal),
    optionalList(() => clients.deployClient.monitor.apps.healthChecks.list(appId), signal),
  ])
  return {
    app: {
      id: app.id,
      name: app.name,
      slug: app.slug,
      kind: app.appKind,
      status: app.appStatus,
      ownerType: app.ownerType,
      defaultEnvironment: app.defaultEnvironment,
      ...(app.latestReleaseTag === undefined ? {} : { latestReleaseTag: app.latestReleaseTag }),
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    },
    domains: domains.items.map(row => ({
      hostname: row.hostname,
      kind: row.kind,
      environment: row.environment,
      bindingStatus: row.bindingStatus,
      verificationStatus: row.verificationStatus,
      isCanonical: row.isCanonical === true,
    })),
    targets: targets.items.map(row => ({
      id: row.id,
      targetKey: row.targetKey,
      platform: row.platform,
      ...(row.techStack === undefined ? {} : { techStack: row.techStack }),
      ...(typeof (row as { targetStatus?: unknown }).targetStatus === 'string'
        ? { status: (row as { targetStatus: string }).targetStatus }
        : {}),
    })),
    releases: releases.items.map(row => ({
      id: row.id,
      version: row.semanticVersion,
      status: row.releaseStatus,
      createdAt: row.createdAt,
    })),
    deployments: deployments.items.map(row => ({
      id: row.id,
      environment: row.environment,
      status: row.deploymentStatus,
      ...(row.deploymentKind === undefined ? {} : { kind: row.deploymentKind }),
      ...(row.deploymentTarget === undefined ? {} : { target: row.deploymentTarget }),
      ...(row.releaseId === undefined ? {} : { releaseId: row.releaseId }),
      ...(row.startedAt === undefined ? {} : { startedAt: row.startedAt }),
      ...(row.completedAt === undefined ? {} : { completedAt: row.completedAt }),
      createdAt: row.createdAt,
    })),
    health: health.items.map(row => ({
      ...(row.id === undefined ? {} : { id: row.id }),
      ...(row.checkType === undefined ? {} : { checkType: row.checkType }),
      ...(row.checkUrl === undefined ? {} : { checkUrl: row.checkUrl }),
      ...(row.checkInterval === undefined ? {} : { intervalSeconds: row.checkInterval }),
      ...(row.status === undefined ? {} : { status: row.status }),
    })),
  }
}

/** Read one list, degrading a failure or an abort to an empty page. */
async function optionalList<T extends { items: readonly unknown[] }>(
  read: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  try {
    signal?.throwIfAborted()
    return await read()
  } catch {
    return { items: [] } as unknown as T
  }
}

/** The hostname the panel shows as the public address, when the platform assigned one. */
export function canonicalSiteUrl(domains: readonly SiteDomain[], environment: string): string | undefined {
  const preferred = domains.find(row => row.environment === environment && row.isCanonical)
    ?? domains.find(row => row.environment === environment)
    ?? domains.find(row => row.isCanonical)
    ?? domains[0]
  return preferred === undefined ? undefined : `https://${preferred.hostname}/`
}

/** The site type's registry definition. */
export function deploySiteDefinition(t: TranslateNS<typeof NS>): SidebarRightTabDefinition {
  return {
    id: DEPLOY_SITE_ID,
    kind: DEPLOY_SITE_KIND,
    priority: 'builtin',
    keepMounted: true,
    title: () => t('site.tabTitle'),
    guide: [{ id: 'sdkwork-deploy-site', order: 20, title: () => t('site.guideTitle') }],
  }
}

/** Format one ISO timestamp for the panel, without throwing on a malformed value. */
export function formatSiteTime(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
