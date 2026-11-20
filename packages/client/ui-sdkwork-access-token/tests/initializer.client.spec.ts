/**
 * Initialization: the profile-file merge strategies per application format,
 * tenant-level vs organization-level claims, directory creation, idempotency,
 * and the per-file failure reporting.
 */

import { describe, expect, it } from 'vitest'
import {
  buildPublicApplicationAccessToken, decodePublicApplicationAccessToken, profileIdOf,
} from '../src/client/accessToken.ts'
import type { AccessTokenProfile } from '../src/client/accessToken.ts'
import type { AccessTokenCandidate } from '../src/client/project.ts'
import type { AccessTokenRootSelection } from '../src/client/initializer.ts'
import {
  initializeAccessTokens, mergeDotenvAccessToken, mergeHarmonyRuntimeEnvAccessToken, mergeJsonAccessToken,
} from '../src/client/initializer.ts'
import { MemoryFs } from './memory-fs.client.ts'

/** One application root fixture. */
function candidate(rootPath: string, overrides: Partial<AccessTokenCandidate['identity']> = {}): AccessTokenCandidate {
  return {
    rootPath,
    displayName: 'App',
    detectedTypeId: 'vite',
    isProjectRoot: false,
    identity: {
      displayName: 'App',
      appId: 'sdkwork-im-pc',
      tenantId: '100001',
      organizationId: '0',
      permissionScope: ['iam:self'],
      ...overrides,
    },
  }
}

/** Selection fixture over one candidate. */
function selection(
  root: AccessTokenCandidate,
  applicationTypeId: AccessTokenRootSelection['applicationTypeId'],
  runtimeTarget: AccessTokenRootSelection['runtimeTarget'] = 'browser',
): AccessTokenRootSelection {
  return { candidate: root, applicationTypeId, runtimeTarget }
}

/** Two profiles used by most cases. */
const PROFILES: readonly AccessTokenProfile[] = [
  { deploymentProfile: 'standalone', environment: 'development' },
  { deploymentProfile: 'cloud', environment: 'production' },
]

/** Parse one profile JSON document as an object. */
function jsonObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('profile file is not a JSON object')
  }
  return parsed as Record<string, unknown>
}

/** Read the token out of one profile JSON document. */
function jsonToken(text: string): string {
  const token = jsonObject(text).SDKWORK_ACCESS_TOKEN
  if (typeof token !== 'string') throw new Error('profile file carries no SDKWORK_ACCESS_TOKEN string')
  return token
}

describe('profile-file merging', () => {
  it('replaces one dotenv token, keeps every other key, and appends one when absent', () => {
    const existing = [
      '# Generated profile',
      'VITE_SDKWORK_ENVIRONMENT=development',
      'SDKWORK_ACCESS_TOKEN=old-token',
      'VITE_SDKWORK_IM_API_BASE_URL=http://127.0.0.1:1',
      '',
    ].join('\n')
    const merged = mergeDotenvAccessToken(existing, 'new-token')
    expect(merged).toBe([
      '# Generated profile',
      'VITE_SDKWORK_ENVIRONMENT=development',
      'SDKWORK_ACCESS_TOKEN=new-token',
      'VITE_SDKWORK_IM_API_BASE_URL=http://127.0.0.1:1',
      '',
    ].join('\n'))
    expect(mergeDotenvAccessToken('SDKWORK_ACCESS_TOKEN=old', 'new')).toBe('SDKWORK_ACCESS_TOKEN=new\n')
    expect(mergeDotenvAccessToken('OTHER=1', 'new')).toBe('OTHER=1\nSDKWORK_ACCESS_TOKEN=new\n')
    expect(mergeDotenvAccessToken(undefined, 'new')).toContain('SDKWORK_ACCESS_TOKEN=new')
  })

  it('collapses duplicate token lines and keeps Windows line endings', () => {
    const existing = 'A=1\r\nSDKWORK_ACCESS_TOKEN=one\r\nB=2\r\nSDKWORK_ACCESS_TOKEN=two\r\n'
    const merged = mergeDotenvAccessToken(existing, 'three')
    expect(merged).toBe('A=1\r\nSDKWORK_ACCESS_TOKEN=three\r\nB=2\r\n')
  })

  it('merges a flat JSON profile file with sorted keys and refuses to destroy an unreadable document', () => {
    const merged = mergeJsonAccessToken('{"SDKWORK_IM_API_BASE_URL":"http://x","SDKWORK_ACCESS_TOKEN":"old"}', 'new', '/f')
    expect(JSON.parse(merged)).toEqual({
      SDKWORK_ACCESS_TOKEN: 'new',
      SDKWORK_IM_API_BASE_URL: 'http://x',
    })
    expect(merged.endsWith('\n')).toBe(true)
    expect(mergeJsonAccessToken(undefined, 'new', '/f')).toBe('{\n  "SDKWORK_ACCESS_TOKEN": "new"\n}\n')
    expect(() => mergeJsonAccessToken('{not json', 'new', '/broken.json')).toThrow(/not valid JSON/u)
    expect(() => mergeJsonAccessToken('[]', 'new', '/array.json')).toThrow(/not a JSON object/u)
  })

  it('stamps the profile identity into a Harmony runtime template and preserves its shape', () => {
    const existing = JSON.stringify({ app: { name: 'IM' }, nested: { keep: true } }, null, 2)
    const merged = mergeHarmonyRuntimeEnvAccessToken(
      existing, 'token', { deploymentProfile: 'cloud', environment: 'production' }, 'harmony-native', '/h',
    )
    expect(JSON.parse(merged)).toEqual({
      app: { name: 'IM' },
      nested: { keep: true },
      environment: 'production',
      deploymentProfile: 'cloud',
      profileId: 'cloud.production',
      runtimeTarget: 'harmony-native',
      SDKWORK_ACCESS_TOKEN: 'token',
    })
  })
})

describe('initializeAccessTokens', () => {
  it('writes tenant-level tokens into the Vite profile matrix and preserves the existing profile keys', async () => {
    const root = candidate('/repo/apps/sdkwork-im-pc')
    const profilesPath = '/repo/apps/sdkwork-im-pc/.env.standalone.development'
    const fs = new MemoryFs(
      ['/repo', '/repo/apps', '/repo/apps/sdkwork-im-pc'],
      {
        [profilesPath]: '# profile\nVITE_SDKWORK_ENVIRONMENT=development\nSDKWORK_ACCESS_TOKEN=stale\n',
      },
    )
    const result = await initializeAccessTokens({
      fs,
      roots: [selection(root, 'vite')],
      level: 'tenant',
      profiles: PROFILES,
    })
    expect(result).toMatchObject({ written: 2, unchanged: 0, failed: 0 })
    const development = fs.files.get(profilesPath)!
    expect(development).toContain('VITE_SDKWORK_ENVIRONMENT=development')
    expect(development).not.toContain('stale')
    const token = /SDKWORK_ACCESS_TOKEN=(.+)/u.exec(development)![1]
    expect(decodePublicApplicationAccessToken(token).payload).toMatchObject({
      app_id: 'sdkwork-im-pc',
      tenant_id: '100001',
      organization_id: '0',
      login_scope: 'TENANT',
      ownership_scope: 'TENANT',
      environment: 'development',
      deployment_profile: 'standalone',
      runtime_target: 'browser',
    })
    const productionPath = '/repo/apps/sdkwork-im-pc/.env.cloud.production'
    expect(decodePublicApplicationAccessToken(/SDKWORK_ACCESS_TOKEN=(.+)/u.exec(fs.files.get(productionPath)!)![1]))
      .toMatchObject({ payload: { environment: 'production', deployment_profile: 'cloud' } })
  })

  it('writes an organization-level token with the organization binding on every selected root', async () => {
    const pc = candidate('/repo/apps/sdkwork-im-pc')
    const flutter = candidate('/repo/apps/sdkwork-im-flutter', { appId: 'sdkwork-im-flutter-mobile' })
    const fs = new MemoryFs(
      [
        '/repo', '/repo/apps', '/repo/apps/sdkwork-im-pc', '/repo/apps/sdkwork-im-flutter',
      ],
    )
    const result = await initializeAccessTokens({
      fs,
      roots: [
        selection(pc, 'vite'),
        selection(flutter, 'flutter', 'flutter-android'),
      ],
      level: 'organization',
      organizationId: '42',
      profiles: [PROFILES[0]],
    })
    expect(result).toMatchObject({ written: 2, failed: 0 })
    // The Flutter format creates its env/ directory before writing.
    expect(fs.directories.has('/repo/apps/sdkwork-im-flutter/env')).toBe(true)
    const flutterFile = fs.files.get('/repo/apps/sdkwork-im-flutter/env/sdkwork.standalone.development.json')!
    const flutterToken = jsonToken(flutterFile)
    expect(decodePublicApplicationAccessToken(flutterToken).payload).toMatchObject({
      app_id: 'sdkwork-im-flutter-mobile',
      organization_id: '42',
      login_scope: 'ORGANIZATION',
      ownership_scope: 'ORGANIZATION',
      runtime_target: 'flutter-android',
    })
  })

  it('creates the nested mini-program and Harmony profile directories', async () => {
    const mp = candidate('/repo/apps/sdkwork-im-mp')
    const harmony = candidate('/repo/apps/sdkwork-im-harmony')
    const fs = new MemoryFs([
      '/repo', '/repo/apps', '/repo/apps/sdkwork-im-mp', '/repo/apps/sdkwork-im-harmony',
    ], {
      '/repo/apps/sdkwork-im-harmony/config/app/runtime-env.standalone.development.json':
        JSON.stringify({ app: { name: 'IM' }, nested: { keep: true } }),
    })
    const result = await initializeAccessTokens({
      fs,
      roots: [
        selection(mp, 'mini-program', 'mini-program'),
        selection(harmony, 'harmony-native', 'harmony-native'),
      ],
      level: 'tenant',
      profiles: [PROFILES[0]],
    })
    expect(result.written).toBe(2)
    expect(fs.files.has('/repo/apps/sdkwork-im-mp/config/mini-program/runtime-env.standalone.development.json'))
      .toBe(true)
    const harmonyDocument = jsonObject(
      fs.files.get('/repo/apps/sdkwork-im-harmony/config/app/runtime-env.standalone.development.json')!,
    )
    expect(harmonyDocument).toMatchObject({
      app: { name: 'IM' },
      nested: { keep: true },
      environment: 'development',
      deploymentProfile: 'standalone',
      profileId: 'standalone.development',
      runtimeTarget: 'harmony-native',
    })
  })

  it('is idempotent: a repeated run reports unchanged files and writes nothing', async () => {
    const root = candidate('/repo/apps/sdkwork-im-pc')
    const fs = new MemoryFs(['/repo', '/repo/apps', '/repo/apps/sdkwork-im-pc'])
    const first = await initializeAccessTokens({
      fs, roots: [selection(root, 'vite')], level: 'tenant', profiles: PROFILES,
    })
    expect(first.written).toBe(2)
    const writesAfterFirst = fs.writes.length
    const second = await initializeAccessTokens({
      fs, roots: [selection(root, 'vite')], level: 'tenant', profiles: PROFILES,
    })
    expect(second).toMatchObject({ written: 0, unchanged: 2, failed: 0 })
    expect(fs.writes).toHaveLength(writesAfterFirst)
  })

  it('fails only the unreadable profile file and keeps the rest', async () => {
    const root = candidate('/repo/apps/sdkwork-im-mp')
    const fs = new MemoryFs(['/repo', '/repo/apps', '/repo/apps/sdkwork-im-mp'], {
      '/repo/apps/sdkwork-im-mp/config/mini-program/runtime-env.cloud.production.json': '{broken',
    })
    fs.directories.add('/repo/apps/sdkwork-im-mp/config')
    fs.directories.add('/repo/apps/sdkwork-im-mp/config/mini-program')
    const result = await initializeAccessTokens({
      fs, roots: [selection(root, 'mini-program', 'mini-program')], level: 'tenant', profiles: PROFILES,
    })
    expect(result.written).toBe(1)
    expect(result.failed).toBe(1)
    const failed = result.files.find(file => file.status === 'failed')!
    expect(failed.profileId).toBe('cloud.production')
    expect(failed.message).toMatch(/not valid JSON/u)
    expect(fs.files.get('/repo/apps/sdkwork-im-mp/config/mini-program/runtime-env.cloud.production.json'))
      .toBe('{broken')
  })

  it('honours the tenant and anchor overrides', async () => {
    const root = candidate('/repo/apps/sdkwork-im-pc')
    const fs = new MemoryFs(['/repo', '/repo/apps', '/repo/apps/sdkwork-im-pc'])
    await initializeAccessTokens({
      fs,
      roots: [selection(root, 'vite')],
      level: 'tenant',
      tenantId: '200002',
      appId: '381157858269466624',
      profiles: [PROFILES[0]],
    })
    const token = /SDKWORK_ACCESS_TOKEN=(.+)/u.exec(fs.files.get('/repo/apps/sdkwork-im-pc/.env.standalone.development')!)![1]
    expect(decodePublicApplicationAccessToken(token).payload).toMatchObject({
      app_id: '381157858269466624',
      aud: '381157858269466624',
      tenant_id: '200002',
    })
  })

  it('rejects a bad request before touching any file', async () => {
    const root = candidate('/repo/apps/sdkwork-im-pc')
    const fs = new MemoryFs(['/repo', '/repo/apps', '/repo/apps/sdkwork-im-pc'])
    await expect(initializeAccessTokens({ fs, roots: [], level: 'tenant', profiles: PROFILES }))
      .rejects.toThrow(/no application root/u)
    await expect(initializeAccessTokens({ fs, roots: [selection(root, 'vite')], level: 'tenant', profiles: [] }))
      .rejects.toThrow(/no profile/u)
    await expect(initializeAccessTokens({
      fs, roots: [selection(root, 'vite')], level: 'organization', profiles: PROFILES,
    })).rejects.toThrow(/organization id/u)
    await expect(initializeAccessTokens({
      fs, roots: [selection(root, 'vite')], level: 'tenant', organizationId: '42', profiles: PROFILES,
    })).rejects.toThrow(/cannot bind organizationId=42/u)
    await expect(initializeAccessTokens({
      fs,
      roots: [selection(candidate('/repo/apps/app', { tenantId: '' }), 'vite')],
      level: 'tenant',
      profiles: PROFILES,
    })).rejects.toThrow(/tenantId/u)
    expect(fs.writes).toEqual([])
  })

  it('refuses a request that would change a root release level', async () => {
    const fs = new MemoryFs(['/repo', '/repo/apps', '/repo/apps/org-app'])
    await expect(initializeAccessTokens({
      fs,
      roots: [selection(candidate('/repo/apps/org-app', { organizationId: '42' }), 'vite')],
      level: 'tenant',
      profiles: PROFILES,
    })).rejects.toThrow(/must not replace an organization-level surface/u)
    await expect(initializeAccessTokens({
      fs,
      roots: [selection(candidate('/repo/apps/org-app', { organizationId: '42' }), 'vite')],
      level: 'organization',
      organizationId: '43',
      profiles: PROFILES,
    })).rejects.toThrow(/binds organization 42, not 43/u)
    expect(fs.writes).toEqual([])
  })

  it('reports a per-file failure when a runtime target does not belong to the application type', async () => {
    const root = candidate('/repo/apps/sdkwork-im-flutter')
    const fs = new MemoryFs(['/repo', '/repo/apps', '/repo/apps/sdkwork-im-flutter'])
    await expect(initializeAccessTokens({
      fs,
      roots: [selection(root, 'flutter', 'browser')],
      level: 'tenant',
      profiles: PROFILES,
    })).rejects.toThrow(/runtime target/u)
  })

  it('matches the canonical builder output for a written file', async () => {
    const root = candidate('/repo/apps/sdkwork-im-pc')
    const fs = new MemoryFs(['/repo', '/repo/apps', '/repo/apps/sdkwork-im-pc'])
    const profiles: readonly AccessTokenProfile[] = [{ deploymentProfile: 'standalone', environment: 'development' }]
    await initializeAccessTokens({ fs, roots: [selection(root, 'vite')], level: 'tenant', profiles })
    const written = /SDKWORK_ACCESS_TOKEN=(.+)/u.exec(fs.files.get('/repo/apps/sdkwork-im-pc/.env.standalone.development')!)![1]
    expect(written).toBe(buildPublicApplicationAccessToken({
      identity: {
        appId: root.identity.appId,
        tenantId: root.identity.tenantId,
        organizationId: '0',
        permissionScope: root.identity.permissionScope,
      },
      profile: profiles[0],
      runtimeTarget: 'browser',
      level: 'tenant',
    }))
    expect(profileIdOf(profiles[0])).toBe('standalone.development')
  })
})
