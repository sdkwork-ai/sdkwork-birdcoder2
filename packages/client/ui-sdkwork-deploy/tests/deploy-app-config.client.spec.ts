/**
 * Deploy linkage persistence standard (`deployAppConfig`): parsing the
 * `deploy` section out of a project manifest, the legacy `backend.appId`
 * tolerance, and the read-modify-write merge that preserves every section
 * the manifest already carries.
 */
import { describe, expect, it } from 'vitest'

import { DEPLOY_APP_CONFIG_FILE, mergeDeployLink, parseDeployLink } from '../src/client/deployAppConfig.ts'

const BASE_MANIFEST = {
  schemaVersion: 3,
  kind: 'sdkwork.app',
  app: { key: 'my-app', name: 'My App' },
  backend: { profileKey: 'backend-root-admin', appId: null, tenantId: '100001' },
  runtime: { family: 'web' },
}

function manifest(overrides: Record<string, unknown>): string {
  return `${JSON.stringify({ ...BASE_MANIFEST, ...overrides }, null, 2)}\n`
}

describe('parseDeployLink', () => {
  it('reads the deploy section of a manifest', () => {
    const raw = manifest({
      deploy: {
        appId: 'app-uuid-1',
        appName: 'Feishu Portal',
        appSlug: 'feishu-portal',
        templateId: 'tpl-1',
        updatedAt: '2026-10-03T00:00:00.000Z',
      },
    })
    expect(parseDeployLink(raw)).toEqual({
      appId: 'app-uuid-1',
      appName: 'Feishu Portal',
      appSlug: 'feishu-portal',
      templateId: 'tpl-1',
      updatedAt: '2026-10-03T00:00:00.000Z',
    })
  })

  it('falls back to the legacy backend.appId slot', () => {
    const raw = manifest({ backend: { appId: 'legacy-uuid' } })
    expect(parseDeployLink(raw)).toEqual({ appId: 'legacy-uuid' })
  })

  it('returns undefined for absent, unparsable, or app-less manifests', () => {
    expect(parseDeployLink(undefined)).toBeUndefined()
    expect(parseDeployLink('')).toBeUndefined()
    expect(parseDeployLink('not json {')).toBeUndefined()
    expect(parseDeployLink(manifest({}))).toBeUndefined()
    expect(parseDeployLink(manifest({ deploy: { appName: 'no id' } }))).toBeUndefined()
  })
})

describe('mergeDeployLink', () => {
  it('writes the deploy section and syncs backend.appId, preserving every other section', () => {
    const merged = mergeDeployLink(manifest({}), {
      appId: 'app-uuid-1',
      appName: 'Feishu Portal',
    })
    const parsed = JSON.parse(merged) as Record<string, unknown>
    expect(parsed['schemaVersion']).toBe(3)
    expect(parsed['kind']).toBe('sdkwork.app')
    expect(parsed['app']).toEqual(BASE_MANIFEST.app)
    expect(parsed['runtime']).toEqual(BASE_MANIFEST.runtime)
    expect((parsed['backend'] as Record<string, unknown>)['appId']).toBe('app-uuid-1')
    expect((parsed['deploy'] as Record<string, unknown>)['appId']).toBe('app-uuid-1')
    expect((parsed['deploy'] as Record<string, unknown>)['appName']).toBe('Feishu Portal')
    expect((parsed['deploy'] as Record<string, unknown>)['updatedAt']).toBeTruthy()
  })

  it('merges into an existing deploy section without dropping template fields', () => {
    const withTemplate = manifest({
      deploy: {
        appId: 'app-uuid-1',
        appName: 'Feishu Portal',
        templateId: 'tpl-1',
        templateKey: 'feishu-portal',
      },
    })
    const merged = mergeDeployLink(withTemplate, { appId: 'app-uuid-2', appName: 'Renamed' })
    const deploy = JSON.parse(merged)['deploy'] as Record<string, unknown>
    expect(deploy['appId']).toBe('app-uuid-2')
    expect(deploy['appName']).toBe('Renamed')
    expect(deploy['templateId']).toBe('tpl-1')
    expect(deploy['templateKey']).toBe('feishu-portal')
  })

  it('starts fresh from an unparsable manifest instead of failing', () => {
    const merged = mergeDeployLink('not json {', { appId: 'app-uuid-1' })
    const parsed = JSON.parse(merged) as Record<string, unknown>
    expect((parsed['deploy'] as Record<string, unknown>)['appId']).toBe('app-uuid-1')
  })

  it('exposes the governed manifest file name', () => {
    expect(DEPLOY_APP_CONFIG_FILE).toBe('sdkwork.app.config.json')
  })
})
