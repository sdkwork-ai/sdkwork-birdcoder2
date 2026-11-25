// @vitest-environment jsdom
/**
 * The deployed-site page's pure parts: the dashboard read, the canonical URL
 * choice, the time formatter, the tab definition, and the publish version rule.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  canonicalSiteUrl,
  deploySiteDefinition,
  formatSiteTime,
  loadDeploySiteDashboard,
  type SiteDomain,
} from '../src/client/deploySite.ts'
import { isSemver } from '../src/client/deployConversation.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'

/** Translate through the plugin's zh dictionary. */
function translate(key: DeployKey, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

/** One generated-client double whose lists can fail independently. */
function clients(options: { fail?: readonly string[] } = {}): never {
  const fail = new Set(options.fail ?? [])
  const list = (name: string, items: unknown[]) => () => fail.has(name) ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve({ items, pageInfo: { page: 1, pageSize: 10, total: items.length } })
  return {
    deployClient: {
      app: {
        retrieve: () => Promise.resolve({
          id: 'app-1', name: 'Skyline Analytics', slug: 'skyline-analytics', appKind: 'PC_WEB', appStatus: 'ACTIVE',
          ownerType: 'USER', defaultEnvironment: 'production', createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-20T00:00:00.000Z', latestReleaseTag: '1.2.0',
        }),
        domains: { list: list('domains', [{ hostname: 'skyline.example.com', kind: 'DEFAULT', environment: 'production', bindingStatus: 'ACTIVE', verificationStatus: 'NOT_REQUIRED', isCanonical: true }]) },
        platformTargets: { list: list('targets', [{ id: 'target-1', targetKey: 'pc-web', platform: 'WEB', techStack: 'react', targetStatus: 'READY' }]) },
      },
      release: { list: list('releases', [{ id: 'release-1', semanticVersion: '1.2.0', releaseStatus: 'RELEASED', createdAt: '2026-11-20T00:00:00.000Z' }]) },
      deployment: { list: list('deployments', [{ id: 'deployment-1', environment: 'production', deploymentStatus: 'SUCCEEDED', deploymentKind: 'ARTIFACT_RELEASE', deploymentTarget: 'WEB_NODE', releaseId: 'release-1', startedAt: '2026-11-20T00:00:00.000Z', createdAt: '2026-11-20T00:00:00.000Z' }]) },
      monitor: { apps: { healthChecks: { list: list('health', [{ id: 'health-1', checkType: 'HTTP', checkUrl: 'https://skyline.example.com/health', status: 'HEALTHY' }]) } } },
    },
  } as never
}

describe('deployed-site dashboard read', () => {
  it('projects the application, hostnames, targets, releases, deployments and health checks', async () => {
    const dashboard = await loadDeploySiteDashboard(clients(), 'app-1')
    expect(dashboard.app).toMatchObject({ id: 'app-1', name: 'Skyline Analytics', kind: 'PC_WEB', latestReleaseTag: '1.2.0' })
    expect(dashboard.domains[0]).toMatchObject({ hostname: 'skyline.example.com', isCanonical: true })
    expect(dashboard.targets[0]).toEqual({ id: 'target-1', targetKey: 'pc-web', platform: 'WEB', techStack: 'react', status: 'READY' })
    expect(dashboard.releases[0]).toEqual({ id: 'release-1', version: '1.2.0', status: 'RELEASED', createdAt: '2026-11-20T00:00:00.000Z' })
    expect(dashboard.deployments[0]).toMatchObject({ id: 'deployment-1', status: 'SUCCEEDED', kind: 'ARTIFACT_RELEASE', target: 'WEB_NODE' })
    expect(dashboard.health[0]).toMatchObject({ id: 'health-1', checkType: 'HTTP', status: 'HEALTHY' })
  })

  it('keeps a partial dashboard when one list read fails', async () => {
    const dashboard = await loadDeploySiteDashboard(clients({ fail: ['domains', 'health'] }), 'app-1')
    expect(dashboard.domains).toEqual([])
    expect(dashboard.health).toEqual([])
    expect(dashboard.releases).toHaveLength(1)
  })

  it('propagates a failed application read', async () => {
    const failing = { deployClient: { app: { retrieve: () => Promise.reject(new Error('gone')) } } } as never
    await expect(loadDeploySiteDashboard(failing, 'app-1')).rejects.toThrow('gone')
  })
})

describe('deployed-site helpers', () => {
  const domain = (hostname: string, environment: string, isCanonical = false): SiteDomain =>
    ({ hostname, kind: 'DEFAULT', environment, bindingStatus: 'ACTIVE', verificationStatus: 'NOT_REQUIRED', isCanonical })

  it('prefers the canonical hostname of the requested environment', () => {
    expect(canonicalSiteUrl([
      domain('test.example.com', 'test'),
      domain('prod.example.com', 'production', true),
    ], 'production')).toBe('https://prod.example.com/')
    expect(canonicalSiteUrl([domain('one.example.com', 'test')], 'production')).toBe('https://one.example.com/')
    expect(canonicalSiteUrl([domain('one.example.com', 'test')], 'production')).toBe('https://one.example.com/')
    expect(canonicalSiteUrl([], 'production')).toBeUndefined()
  })

  it('formats a valid timestamp and ignores a malformed one', () => {
    expect(formatSiteTime('2026-11-20T10:05:00.000Z')).toMatch(/^2026\/11\/20 \d{2}:\d{2}$/u)
    expect(formatSiteTime('not-a-date')).toBeUndefined()
    expect(formatSiteTime(undefined)).toBeUndefined()
    expect(formatSiteTime('  ')).toBeUndefined()
  })

  it('names the tab type and its guide entry from the dictionary', () => {
    const definition = deploySiteDefinition(translate)
    expect(definition).toMatchObject({ kind: 'sdkwork-deploy-site', priority: 'builtin', keepMounted: true })
    expect(definition.title('sidebar://sdkwork-deploy-site')).toBe(translate('site.tabTitle'))
    expect(definition.guide?.[0]?.title()).toBe(translate('site.guideTitle'))
  })

  it('accepts only semantic versions', () => {
    expect(isSemver('1.2.3')).toBe(true)
    expect(isSemver('1.2.3-beta.1')).toBe(true)
    expect(isSemver('1.2')).toBe(false)
    expect(isSemver('v1.2.3')).toBe(false)
    vi.restoreAllMocks()
  })
})
