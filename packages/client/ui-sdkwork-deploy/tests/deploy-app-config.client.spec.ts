/**
 * Deploy linkage persistence standard (`deployAppConfig`): the canonical
 * `metadata.publishing.appIdByTarget` map, its fork provenance block, the
 * legacy `deploy` / `backend.appId` readers, and the read-modify-write merge
 * that preserves every other manifest section and drops the non-standard
 * top-level `deploy` key.
 */
import { describe, expect, it } from 'vitest'

import {
  DEPLOY_APP_CONFIG_FILE,
  deployEnvironmentOf,
  deployProfileId,
  mergeDeployLink,
  parseDeployLink,
  resolveDeployProfileId,
} from '../src/client/deployAppConfig.ts'

const BASE_MANIFEST = {
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'my-app', name: 'My App' },
  backend: { profileKey: 'backend-root-admin', appId: 'sdkwork-my-app', tenantId: '100001' },
  runtime: { family: 'web', defaultDeploymentProfile: 'cloud' },
  metadata: { deploymentConfig: 'etc/sdkwork.deployment.config.json' },
}

const UUID = '3f1c1b2a-4d5e-4f60-8a9b-0c1d2e3f4a5b'

function manifest(overrides: Record<string, unknown>): string {
  return `${JSON.stringify({ ...BASE_MANIFEST, ...overrides }, null, 2)}\n`
}

/** One manifest carrying the canonical linkage for a target key. */
function linkedManifest(profileId: string, appId: string, provenance: Record<string, unknown> = {}): string {
  return manifest({
    metadata: {
      ...BASE_MANIFEST.metadata,
      publishing: {
        appIdByTarget: { [profileId]: appId },
        birdcoder: { appName: 'Feishu Portal', appSlug: 'feishu-portal', updatedAt: '2026-10-03T00:00:00.000Z', ...provenance },
      },
    },
  })
}

describe('deployProfileId / deployEnvironmentOf', () => {
  it('composes the canonical profile id', () => {
    expect(deployProfileId('cloud', 'production')).toBe('cloud.production')
  })

  it('maps lifecycle tiers onto canonical environments', () => {
    expect(deployEnvironmentOf('development')).toBe('development')
    expect(deployEnvironmentOf('testing')).toBe('test')
    expect(deployEnvironmentOf('staging')).toBe('staging')
    expect(deployEnvironmentOf('demo')).toBe('demo')
    expect(deployEnvironmentOf('production')).toBe('production')
    expect(deployEnvironmentOf(' TESTING ')).toBe('test')
    expect(deployEnvironmentOf(undefined)).toBe('development')
    expect(deployEnvironmentOf('')).toBe('development')
    expect(deployEnvironmentOf('preview')).toBe('development')
  })
})

describe('resolveDeployProfileId', () => {
  it('reads the manifest default deployment profile and the active environment', () => {
    expect(resolveDeployProfileId(manifest({}), 'testing')).toBe('cloud.test')
    expect(resolveDeployProfileId(manifest({ runtime: { defaultDeploymentProfile: 'standalone' } }), 'production'))
      .toBe('standalone.production')
  })

  it('falls back to standalone and development without a readable manifest', () => {
    expect(resolveDeployProfileId(undefined, 'production')).toBe('standalone.production')
    expect(resolveDeployProfileId('not json {', undefined)).toBe('standalone.development')
    expect(resolveDeployProfileId(manifest({ runtime: { defaultDeploymentProfile: 'saas' } }), undefined))
      .toBe('standalone.development')
  })
})

describe('parseDeployLink', () => {
  it('reads the canonical target entry preferred by the project profile', () => {
    const raw = manifest({
      metadata: {
        ...BASE_MANIFEST.metadata,
        publishing: {
          appIdByTarget: {
            'standalone.development': 'app-dev',
            'cloud.production': 'app-prod',
          },
          birdcoder: {
            appName: 'Feishu Portal',
            appSlug: 'feishu-portal',
            appKey: 'feishu-portal',
            templateId: 'tpl-1',
            templateKey: 'feishu-portal-template',
            templateName: 'Feishu Portal Template',
            templateGitUrl: 'https://github.com/o/r.git',
            templateGitBranch: 'main',
            templateSubDirectory: 'apps/pc',
            sourceDirectory: 'D:/work/portal',
            updatedAt: '2026-10-03T00:00:00.000Z',
          },
        },
      },
    })
    expect(parseDeployLink(raw, 'cloud.production')).toEqual({
      appId: 'app-prod',
      appName: 'Feishu Portal',
      appSlug: 'feishu-portal',
      appKey: 'feishu-portal',
      templateId: 'tpl-1',
      templateKey: 'feishu-portal-template',
      templateName: 'Feishu Portal Template',
      templateGitUrl: 'https://github.com/o/r.git',
      templateGitBranch: 'main',
      templateSubDirectory: 'apps/pc',
      sourceDirectory: 'D:/work/portal',
      updatedAt: '2026-10-03T00:00:00.000Z',
    })
  })

  it('falls back to a same-mode entry, then the first entry, and ignores blank values', () => {
    const two = manifest({
      metadata: {
        publishing: {
          appIdByTarget: {
            'standalone.development': 'app-dev',
            'cloud.production': 'app-prod',
          },
        },
      },
    })
    expect(parseDeployLink(two, 'cloud.test')?.appId).toBe('app-prod')
    expect(parseDeployLink(two, undefined)?.appId).toBe('app-dev')
    expect(parseDeployLink(two, 'standalone.production')?.appId).toBe('app-dev')
    const blank = manifest({
      metadata: { publishing: { appIdByTarget: { 'cloud.production': '  ', 'standalone.test': 'app-x' } } },
    })
    expect(parseDeployLink(blank, 'cloud.production')?.appId).toBe('app-x')
  })

  it('reads the legacy top-level deploy section for un-migrated projects', () => {
    const raw = manifest({
      deploy: {
        appId: 'app-uuid-1',
        appName: 'Feishu Portal',
        templateId: 'tpl-1',
        updatedAt: '2026-10-03T00:00:00.000Z',
      },
    })
    expect(parseDeployLink(raw)).toEqual({
      appId: 'app-uuid-1',
      appName: 'Feishu Portal',
      templateId: 'tpl-1',
      updatedAt: '2026-10-03T00:00:00.000Z',
    })
  })

  it('accepts the legacy backend.appId slot only when it is a deploy app uuid', () => {
    expect(parseDeployLink(manifest({ backend: { appId: UUID } }))).toEqual({ appId: UUID })
    // The IAM application key is a different identity and must not be read as
    // a deploy app (the root manifest carries `sdkwork-my-app` there).
    expect(parseDeployLink(manifest({}))).toBeUndefined()
  })

  it('returns undefined for absent, unparsable, or app-less manifests', () => {
    expect(parseDeployLink(undefined)).toBeUndefined()
    expect(parseDeployLink('')).toBeUndefined()
    expect(parseDeployLink('not json {')).toBeUndefined()
    expect(parseDeployLink('[]')).toBeUndefined()
    expect(parseDeployLink(manifest({ metadata: { publishing: { appIdByTarget: { 'cloud.production': '' } } } })))
      .toBeUndefined()
  })
})

describe('mergeDeployLink', () => {
  it('writes the canonical target entry and provenance, preserving every other section', () => {
    const merged = mergeDeployLink(manifest({}), {
      appId: 'app-uuid-1',
      appName: 'Feishu Portal',
      appSlug: 'feishu-portal',
      appKey: 'feishu-portal',
      sourceDirectory: 'D:/work/portal',
    }, { profileId: 'cloud.test' })
    const parsed = JSON.parse(merged) as Record<string, unknown>
    expect(parsed['schemaVersion']).toBe(3)
    expect(parsed['kind']).toBe('agent.app')
    expect(parsed['app']).toEqual(BASE_MANIFEST.app)
    expect(parsed['runtime']).toEqual(BASE_MANIFEST.runtime)
    expect(parsed['deploy']).toBeUndefined()
    // The IAM application id is not the deploy app id and stays untouched.
    expect((parsed['backend'] as Record<string, unknown>)['appId']).toBe('sdkwork-my-app')
    const publishing = (parsed['metadata'] as Record<string, unknown>)['publishing'] as Record<string, unknown>
    expect(publishing['appIdByTarget']).toEqual({ 'cloud.test': 'app-uuid-1' })
    const provenance = publishing['birdcoder'] as Record<string, unknown>
    expect(provenance['appId']).toBe('app-uuid-1')
    expect(provenance['appName']).toBe('Feishu Portal')
    expect(provenance['appSlug']).toBe('feishu-portal')
    expect(provenance['appKey']).toBe('feishu-portal')
    expect(provenance['sourceDirectory']).toBe('D:/work/portal')
    expect(provenance['updatedAt']).toBeTruthy()
  })

  it('migrates a legacy deploy section into the canonical block and removes the key', () => {
    const legacy = manifest({
      deploy: { appId: UUID, appName: 'Legacy App', templateId: 'tpl-9', templateKey: 'legacy' },
    })
    const merged = JSON.parse(mergeDeployLink(legacy, { templateGitUrl: 'https://github.com/o/r.git' }, {
      profileId: 'standalone.development',
    })) as Record<string, unknown>
    expect(merged['deploy']).toBeUndefined()
    const publishing = (merged['metadata'] as Record<string, unknown>)['publishing'] as Record<string, unknown>
    expect(publishing['appIdByTarget']).toEqual({ 'standalone.development': UUID })
    const provenance = publishing['birdcoder'] as Record<string, unknown>
    expect(provenance['appName']).toBe('Legacy App')
    expect(provenance['templateId']).toBe('tpl-9')
    expect(provenance['templateKey']).toBe('legacy')
    expect(provenance['templateGitUrl']).toBe('https://github.com/o/r.git')
    expect(provenance['appId']).toBe(UUID)
  })

  it('keeps a canonical entry and the other target keys when the patch carries no app id', () => {
    const raw = linkedManifest('standalone.development', 'app-dev')
    const withOther = JSON.parse(raw) as Record<string, unknown>
    const metadata = withOther['metadata'] as Record<string, unknown>
    const publishing = metadata['publishing'] as Record<string, unknown>
    ;(publishing['appIdByTarget'] as Record<string, string>)['cloud.production'] = 'app-prod'
    const merged = JSON.parse(mergeDeployLink(JSON.stringify(withOther), {
      templateId: 'tpl-1',
      templateKey: 'feishu',
    }, { profileId: 'standalone.development' })) as Record<string, unknown>
    const next = ((merged['metadata'] as Record<string, unknown>)['publishing']) as Record<string, unknown>
    expect(next['appIdByTarget']).toEqual({
      'standalone.development': 'app-dev',
      'cloud.production': 'app-prod',
    })
    expect((next['birdcoder'] as Record<string, unknown>)['appName']).toBe('Feishu Portal')
    expect((next['birdcoder'] as Record<string, unknown>)['templateId']).toBe('tpl-1')
  })

  it('keeps unrelated metadata subtrees and replaces the value for the same target key', () => {
    const raw = linkedManifest('cloud.production', 'app-old')
    const merged = JSON.parse(mergeDeployLink(raw, { appId: 'app-new' }, { profileId: 'cloud.production' })) as Record<string, unknown>
    const metadata = merged['metadata'] as Record<string, unknown>
    expect(metadata['deploymentConfig']).toBe('etc/sdkwork.deployment.config.json')
    const publishing = metadata['publishing'] as Record<string, unknown>
    expect(publishing['appIdByTarget']).toEqual({ 'cloud.production': 'app-new' })
  })

  it('drops blank patch values instead of recording them', () => {
    const merged = JSON.parse(mergeDeployLink(manifest({}), {
      appId: 'app-uuid-1',
      appName: '   ',
      sourceDirectory: '',
    }, { profileId: 'standalone.development' })) as Record<string, unknown>
    const publishing = (merged['metadata'] as Record<string, unknown>)['publishing'] as Record<string, unknown>
    const provenance = publishing['birdcoder'] as Record<string, unknown>
    expect(provenance['appName']).toBeUndefined()
    expect(provenance['sourceDirectory']).toBeUndefined()
    expect(provenance['appId']).toBe('app-uuid-1')
  })

  it('starts fresh from an unparsable manifest instead of failing', () => {
    const merged = JSON.parse(mergeDeployLink('not json {', { appId: 'app-uuid-1' }, {
      profileId: 'standalone.development',
    })) as Record<string, unknown>
    const publishing = (merged['metadata'] as Record<string, unknown>)['publishing'] as Record<string, unknown>
    expect(publishing['appIdByTarget']).toEqual({ 'standalone.development': 'app-uuid-1' })
  })

  it('exposes the governed manifest file name', () => {
    expect(DEPLOY_APP_CONFIG_FILE).toBe('agent.app.config.json')
  })
})
